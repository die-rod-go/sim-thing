import { WebSocket, WebSocketServer, type RawData } from "ws";
import { parseClientMessage, type ServerMessage } from "@village/shared";
import { createLogger } from "../logger";
import type { SeedEditor } from "../seed-editor";
import type { TickResult } from "../sim/world-state";
import {
  handleClientMessage,
  sendAgentDetail,
  type Broadcaster,
  type ConnectionSession,
} from "./control-handler";
import { buildSnapshot, buildStats, type SimServerContext } from "./message-builders";

export const WEBSOCKET_PATH = "/ws";

const logger = createLogger("ws");

export interface SimServerOptions extends SimServerContext {
  port: number;
  resetWorld: () => Promise<void>;
  seedEditor: SeedEditor;
}

export interface SimServer extends Broadcaster {
  /** The bound port (useful when started on port 0). */
  port: number;
  close(): Promise<void>;
}

function rawDataToText(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  return Buffer.from(data as ArrayBuffer).toString("utf8");
}

/**
 * Serves the viewer over WebSocket at `/ws`: sends a snapshot on connect, applies validated
 * controls, and streams tick results from the loop.
 */
export function startSimServer(options: SimServerOptions): Promise<SimServer> {
  const { resetWorld, seedEditor, port, ...context } = options;
  const sessions = new Map<WebSocket, ConnectionSession>();
  const webSocketServer = new WebSocketServer({ port, path: WEBSOCKET_PATH });

  const sendTo = (socket: WebSocket, message: ServerMessage) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };

  const broadcaster: Broadcaster = {
    broadcast(message) {
      const text = JSON.stringify(message);
      for (const socket of sessions.keys()) {
        if (socket.readyState === WebSocket.OPEN) socket.send(text);
      }
    },
    sendSnapshotToAll() {
      broadcaster.broadcast(buildSnapshot(context));
    },
    notifyAgentsChanged(agentIds) {
      const changedIds = new Set(agentIds);
      for (const session of sessions.values()) {
        if (session.inspectedAgentId !== null && changedIds.has(session.inspectedAgentId)) {
          sendAgentDetail(session, context);
        }
      }
    },
  };

  const publishTickResult = (result: TickResult) => {
    for (const move of result.moves) broadcaster.broadcast({ type: "agent_moved", ...move });
    for (const start of result.interactionStarts) {
      broadcaster.broadcast({ type: "interacted", ...start, tick: result.tick });
    }
    for (const event of result.events) {
      if (event.speech !== undefined) {
        broadcaster.broadcast({
          type: "said",
          agentId: event.actorId,
          text: event.speech.words,
          volume: event.speech.volume,
          tick: event.tick,
        });
      }
      broadcaster.broadcast({ type: "event_logged", event });
    }
    for (const moment of result.moments) broadcaster.broadcast({ type: "moment", moment });
    const state = context.loop.getState();
    const changedAgents = state.agents.filter((agent) => result.changedAgentIds.includes(agent.id));
    const changedObjects = state.objects.filter((object) =>
      result.changedObjectIds.includes(object.id),
    );
    if (changedAgents.length > 0 || changedObjects.length > 0) {
      broadcaster.broadcast({
        type: "state_changed",
        ...(changedAgents.length > 0 ? { agents: changedAgents } : {}),
        ...(changedObjects.length > 0 ? { objects: changedObjects } : {}),
      });
    }
    broadcaster.broadcast({ type: "tick", tick: state.tick, stats: buildStats(context) });
    broadcaster.notifyAgentsChanged(result.changedAgentIds);
  };

  const removeTickListener = context.loop.addTickListener(publishTickResult);
  const removePauseListener = context.loop.addPauseListener((isPaused, reason) =>
    broadcaster.broadcast({ type: "paused", isPaused, reason }),
  );

  webSocketServer.on("connection", (socket) => {
    const session: ConnectionSession = {
      inspectedAgentId: null,
      send: (message) => sendTo(socket, message),
    };
    sessions.set(socket, session);
    session.send(buildSnapshot(context));

    socket.on("message", (data) => {
      let message;
      try {
        message = parseClientMessage(rawDataToText(data));
      } catch (error) {
        logger.warn("ignoring invalid client message", error);
        return;
      }
      handleClientMessage(message, session, { context, broadcaster, resetWorld, seedEditor }).catch(
        (error: unknown) => logger.error(`failed to handle "${message.type}"`, error),
      );
    });
    socket.on("close", () => sessions.delete(socket));
    socket.on("error", (error) => logger.warn("client socket error", error));
  });

  return new Promise((resolveServer, rejectServer) => {
    webSocketServer.once("error", rejectServer);
    webSocketServer.once("listening", () => {
      webSocketServer.off("error", rejectServer);
      webSocketServer.on("error", (error) => logger.error("WebSocket server error", error));
      const address = webSocketServer.address();
      const boundPort = typeof address === "object" && address !== null ? address.port : port;
      logger.info(`listening on ws://localhost:${boundPort}${WEBSOCKET_PATH}`);
      resolveServer({
        ...broadcaster,
        port: boundPort,
        close: () =>
          new Promise<void>((resolveClose) => {
            removeTickListener();
            removePauseListener();
            for (const socket of sessions.keys()) socket.terminate();
            webSocketServer.close(() => resolveClose());
          }),
      });
    });
  });
}
