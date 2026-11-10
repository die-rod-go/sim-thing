import type { ClientMessage, ServerMessage } from "@village/shared";
import { createLogger } from "../logger";
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
}

export function sendAgentDetail(session: ConnectionSession, context: SimServerContext): void {
  if (session.inspectedAgentId === null) return;
  const detail = buildAgentDetail(context, session.inspectedAgentId);
  if (detail) session.send(detail);
  else logger.warn(`inspect_agent for unknown agent "${session.inspectedAgentId}"`);
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
      logger.info("resetting the world from the seed file");
      await dependencies.resetWorld();
      broadcaster.sendSnapshotToAll();
      broadcaster.notifyAgentsChanged(context.loop.getState().agents.map((agent) => agent.id));
      return;
  }
}
