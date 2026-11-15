import type { ClientMessage, GodAction, ServerMessage } from "@village/shared";
import { createLogger } from "../logger";
import type { ItemEditor } from "../item-editor";
import type { MapEditor } from "../map-editor";
import type { SeedEditor } from "../seed-editor";
import { applyGodAction } from "../sim/god-actions";
import type { TickContext } from "../sim/tick-context";
import { createEmptyTickResult } from "../sim/world-state";
import { buildAgentDetail, buildSettingsMessage, type SimServerContext } from "./message-builders";

const logger = createLogger("ws");

/** Pushes server messages to connected clients. Integration uses this for `said`, `interacted`, ... */
export interface Broadcaster {
  broadcast(message: ServerMessage): void;
  sendSnapshotToAll(): void;
  /** Re-sends `agent_detail` to every connection inspecting one of these agents. */
  notifyAgentsChanged(agentIds: readonly string[]): void;
}

export interface ConnectionSession {
  inspectedAgentId: string | null;
  send(message: ServerMessage): void;
}

export interface ControlDependencies {
  context: SimServerContext;
  broadcaster: Broadcaster;
  /** Reseeds the live world; the snapshot is sent afterwards by the handler. */
  resetWorld: () => Promise<void>;
  seedEditor: SeedEditor;
  itemEditor: ItemEditor;
  mapEditor: MapEditor;
}

export function sendAgentDetail(session: ConnectionSession, context: SimServerContext): void {
  if (session.inspectedAgentId === null) return;
  const detail = buildAgentDetail(context, session.inspectedAgentId);
  if (detail) session.send(detail);
  else logger.warn(`inspect_agent for unknown agent "${session.inspectedAgentId}"`);
}

/** Applies the action if the sim is paused; returns why nothing changed, or null. */
async function applyGodActionWhilePaused(
  context: SimServerContext,
  action: GodAction,
): Promise<string | null> {
  if (!context.loop.isPaused()) return "Pause the sim to use god mode";
  return context.loop.editWhilePaused((state) => {
    const tickContext: TickContext = {
      state,
      result: createEmptyTickResult(state.tick),
      dependencies: context.simDependencies,
    };
    const refusal = applyGodAction(tickContext, action);
    return { result: tickContext.result, answer: refusal };
  });
}

async function resetAndAnnounce(dependencies: ControlDependencies): Promise<void> {
  const { context, broadcaster } = dependencies;
  logger.info("resetting the world from the seed file");
  await dependencies.resetWorld();
  broadcaster.sendSnapshotToAll();
  broadcaster.notifyAgentsChanged(context.loop.getState().agents.map((agent) => agent.id));
}

export async function handleClientMessage(
  message: ClientMessage,
  session: ConnectionSession,
  dependencies: ControlDependencies,
): Promise<void> {
  const { context, broadcaster } = dependencies;
  switch (message.type) {
    case "pause":
      context.loop.pause();
      return;
    case "resume": {
      const reason = context.findPauseReason();
      if (reason !== null) session.send({ type: "paused", isPaused: true, reason });
      else context.loop.resume();
      return;
    }
    case "step": {
      const reason = context.findPauseReason();
      if (reason !== null) session.send({ type: "paused", isPaused: true, reason });
      else await context.loop.step();
      return;
    }
    case "set_speed":
      context.loop.setSpeed(message.speed);
      context.settings.speed = message.speed;
      broadcaster.broadcast(buildSettingsMessage(context));
      return;
    case "inspect_agent":
      session.inspectedAgentId = message.agentId;
      sendAgentDetail(session, context);
      return;
    case "update_settings":
      context.settings.dailyTokenBudget = message.dailyTokenBudget;
      context.tokenBudget.dailyTokenBudget = message.dailyTokenBudget;
      broadcaster.broadcast(buildSettingsMessage(context));
      return;
    case "reset":
      await resetAndAnnounce(dependencies);
      return;
    case "load_seed_file":
      session.send(dependencies.seedEditor.describeSeedFile());
      return;
    case "save_seed_file": {
      const result = dependencies.seedEditor.saveSeedFile(message.seedFile);
      const shouldResetWorld = result.isSaved && message.shouldResetWorld;
      if (shouldResetWorld) await resetAndAnnounce(dependencies);
      session.send({ type: "seed_file_saved", ...result, isWorldReset: shouldResetWorld });
      return;
    }
    case "load_item_file":
      session.send(dependencies.itemEditor.describeItemFile());
      return;
    case "save_item_file":
      session.send({
        type: "item_file_saved",
        ...dependencies.itemEditor.saveItemFile(message.itemFile),
      });
      return;
    case "load_map_file":
      session.send(dependencies.mapEditor.describeMapFile());
      return;
    case "god_action": {
      const refusal = await applyGodActionWhilePaused(context, message.action);
      session.send({ type: "god_action_result", refusal });
      return;
    }
    case "save_map_file": {
      const result = dependencies.mapEditor.saveMapFile(message.mapFile);
      const shouldResetWorld = result.isSaved && message.shouldResetWorld;
      if (shouldResetWorld) await resetAndAnnounce(dependencies);
      session.send({ type: "map_file_saved", ...result, isWorldReset: shouldResetWorld });
      return;
    }
  }
}
