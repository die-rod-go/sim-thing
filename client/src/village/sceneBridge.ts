import type { ServerMessage } from "@village/shared";
import type { ClientState } from "../state/clientState";

export type MapStatus =
  { kind: "loading" } | { kind: "ready" } | { kind: "error"; message: string };

/** Events flowing between React and the Phaser scene. */
export interface SceneBridgeEvents {
  serverMessage: ServerMessage;
  inspectedAgentChanged: string | null;
  debugOverlayChanged: boolean;
  agentClicked: string;
  mapStatusChanged: MapStatus;
}

export interface SceneSyncState {
  clientState: ClientState;
  isDebugOverlayOn: boolean;
}

type Listener<Payload> = (payload: Payload) => void;

/**
 * Keeps the Phaser scene decoupled from React: React pushes server messages and UI choices, the
 * scene reports clicks and map status, and the scene pulls the latest state when it (re)starts.
 */
export class SceneBridge {
  private readonly listeners = new Map<keyof SceneBridgeEvents, Set<Listener<never>>>();

  constructor(readonly readSyncState: () => SceneSyncState) {}

  on<EventName extends keyof SceneBridgeEvents>(
    eventName: EventName,
    listener: Listener<SceneBridgeEvents[EventName]>,
  ): () => void {
    const eventListeners = this.listeners.get(eventName) ?? new Set();
    eventListeners.add(listener);
    this.listeners.set(eventName, eventListeners);
    return () => {
      eventListeners.delete(listener);
    };
  }

  emit<EventName extends keyof SceneBridgeEvents>(
    eventName: EventName,
    payload: SceneBridgeEvents[EventName],
  ): void {
    const eventListeners = this.listeners.get(eventName);
    if (!eventListeners) return;
    for (const listener of eventListeners) {
      (listener as Listener<SceneBridgeEvents[EventName]>)(payload);
    }
  }
}
