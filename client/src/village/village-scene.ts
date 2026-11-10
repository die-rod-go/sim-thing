import * as Phaser from "phaser";
import type { Agent, ServerMessage } from "@village/shared";
import { clientConfig } from "../client-config";
import { computeTickDurationMs } from "../format/formatters";
import { AgentMarker, createAgentTexture } from "./agent-marker";
import { drawPerceptionOverlay, type PerceptionView } from "./perception-overlay";
import type { SceneBridge } from "./scene-bridge";
import { SpeechBubbleLayer } from "./speech-bubbles";
import { computeFitZoom, pickAgentColor, summarizeTiledMap } from "./village-geometry";

const MAP_KEY = "village-map";
const TILESET_KEY = "village-tileset";
const DEFAULT_MAP_WIDTH_TILES = 40;
const DEFAULT_MAP_HEIGHT_TILES = 30;

const Depth = { overlay: 10, agents: 20, bubbles: 30 } as const;

/** Renders the village from server messages; owns no sim state beyond what it draws. */
export class VillageScene extends Phaser.Scene {
  private readonly markers = new Map<string, AgentMarker>();
  private readonly colorIndexes = new Map<string, number>();
  private bubbles!: SpeechBubbleLayer;
  private overlay!: Phaser.GameObjects.Graphics;
  private unsubscribers: (() => void)[] = [];
  private mapWidthTiles = DEFAULT_MAP_WIDTH_TILES;
  private mapHeightTiles = DEFAULT_MAP_HEIGHT_TILES;
  private baseTicksPerSecond = 1;
  private speed = 1;
  private inspectedAgentId: string | null = null;
  private perceptionView: PerceptionView = null;
  private isDebugOverlayOn = false;
  private loadErrors: string[] = [];

  constructor(private readonly bridge: SceneBridge) {
    super({ key: "village" });
  }

  preload(): void {
    this.bridge.emit("mapStatusChanged", { kind: "loading" });
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      this.loadErrors.push(`Could not load ${file.url}`);
    });
    this.load.tilemapTiledJSON(MAP_KEY, clientConfig.map.mapUrl);
    this.load.image(TILESET_KEY, clientConfig.map.tilesetUrl);
  }

  create(): void {
    this.buildMap();
    createAgentTexture(this);
    this.overlay = this.add.graphics().setDepth(Depth.overlay);
    this.bubbles = new SpeechBubbleLayer(this, Depth.bubbles);
    this.syncFromReact();
    this.unsubscribers = [
      this.bridge.on("serverMessage", (message) => this.handleServerMessage(message)),
      this.bridge.on("inspectedAgentChanged", (agentId) => this.setInspectedAgent(agentId, null)),
      this.bridge.on("debugOverlayChanged", (isOn) => {
        this.isDebugOverlayOn = isOn;
        this.redrawOverlay();
      }),
    ];
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.fitCamera());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribeAll());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.unsubscribeAll());
    this.fitCamera();
  }

  override update(): void {
    this.bubbles.follow((agentId) => this.markers.get(agentId)?.container ?? null);
  }

  private buildMap(): void {
    try {
      const cached: unknown = this.cache.tilemap.get(MAP_KEY);
      const hasData = typeof cached === "object" && cached !== null && "data" in cached;
      const mapData: unknown = hasData ? cached.data : null;
      const summary = summarizeTiledMap(mapData, clientConfig.map.requiredLayers);
      if (!this.textures.exists(TILESET_KEY)) throw new Error("tileset.png did not load");
      const tilemap = this.make.tilemap({ key: MAP_KEY });
      const tileset = tilemap.addTilesetImage(summary.tilesetName, TILESET_KEY);
      if (!tileset) throw new Error(`Tileset "${summary.tilesetName}" could not use tileset.png`);
      const layerNames = [...clientConfig.map.requiredLayers, ...clientConfig.map.optionalLayers];
      for (const layerName of layerNames) {
        if (summary.tileLayerNames.includes(layerName)) tilemap.createLayer(layerName, tileset);
      }
      this.mapWidthTiles = summary.width;
      this.mapHeightTiles = summary.height;
      this.bridge.emit("mapStatusChanged", { kind: "ready" });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const message = [reason, ...this.loadErrors].join("; ");
      this.bridge.emit("mapStatusChanged", { kind: "error", message });
    }
  }

  private fitCamera(): void {
    const tileSize = clientConfig.map.tileSizePixels;
    const mapPixelWidth = this.mapWidthTiles * tileSize;
    const mapPixelHeight = this.mapHeightTiles * tileSize;
    const camera = this.cameras.main;
    camera.setZoom(
      computeFitZoom(this.scale.width, this.scale.height, mapPixelWidth, mapPixelHeight),
    );
    camera.centerOn(mapPixelWidth / 2, mapPixelHeight / 2);
  }

  private syncFromReact(): void {
    const { clientState, isDebugOverlayOn } = this.bridge.readSyncState();
    this.isDebugOverlayOn = isDebugOverlayOn;
    this.baseTicksPerSecond = clientState.baseTicksPerSecond;
    this.speed = clientState.clock.speed;
    this.syncAgents(clientState.agents, true);
    const detail = clientState.agentDetail;
    const view = detail?.agentId === clientState.inspectedAgentId ? detail?.perceptionView : null;
    this.setInspectedAgent(clientState.inspectedAgentId, view ?? null);
  }

  private handleServerMessage(message: ServerMessage): void {
    switch (message.type) {
      case "snapshot":
        this.baseTicksPerSecond = message.baseTicksPerSecond;
        this.speed = message.clock.speed;
        this.bubbles.clear();
        this.syncAgents(message.agents, true);
        return;
      case "settings":
        this.speed = message.speed;
        return;
      case "agent_moved":
        this.markers.get(message.agentId)?.moveTo(message.pos, this.moveDurationMs());
        return;
      case "said": {
        const speaker = this.markers.get(message.agentId);
        if (speaker) this.bubbles.add(message.agentId, speaker.name, message.text, message.volume);
        return;
      }
      case "state_changed":
        if (message.agents) this.syncAgents(message.agents, false);
        return;
      case "agent_detail":
        if (message.agentId === this.inspectedAgentId) {
          this.perceptionView = message.perceptionView;
          this.redrawOverlay();
        }
        return;
      default:
        return;
    }
  }

  /** Adds missing markers and moves changed ones; a full sync also removes agents that left. */
  private syncAgents(agents: Agent[], isFullSync: boolean): void {
    if (isFullSync) {
      const presentIds = new Set(agents.map((agent) => agent.id));
      for (const [agentId, marker] of this.markers) {
        if (presentIds.has(agentId)) continue;
        marker.destroy();
        this.markers.delete(agentId);
      }
    }
    for (const agent of agents) {
      const marker = this.markers.get(agent.id);
      if (!marker) {
        this.markers.set(agent.id, this.createMarker(agent));
        continue;
      }
      const hasMoved = marker.position.x !== agent.pos.x || marker.position.y !== agent.pos.y;
      if (hasMoved) marker.moveTo(agent.pos, isFullSync ? 0 : this.moveDurationMs());
    }
  }

  private createMarker(agent: Agent): AgentMarker {
    const colorIndex = this.colorIndexes.get(agent.id) ?? this.colorIndexes.size;
    this.colorIndexes.set(agent.id, colorIndex);
    const marker = new AgentMarker(
      this,
      agent.id,
      agent.name,
      pickAgentColor(colorIndex),
      agent.pos,
      (agentId) => this.bridge.emit("agentClicked", agentId),
    );
    marker.container.setDepth(Depth.agents);
    marker.setSelected(agent.id === this.inspectedAgentId);
    return marker;
  }

  private setInspectedAgent(agentId: string | null, view: PerceptionView): void {
    this.inspectedAgentId = agentId;
    this.perceptionView = view;
    for (const marker of this.markers.values()) marker.setSelected(marker.agentId === agentId);
    this.redrawOverlay();
  }

  private redrawOverlay(): void {
    const view = this.isDebugOverlayOn ? this.perceptionView : null;
    drawPerceptionOverlay(this.overlay, view, this.mapWidthTiles);
  }

  private moveDurationMs(): number {
    const { maxMoveTweenMs } = clientConfig.village;
    return computeTickDurationMs(this.baseTicksPerSecond, this.speed, maxMoveTweenMs);
  }

  private unsubscribeAll(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers = [];
  }
}
