/**
 * Dev-only stand-in for the sim server, for checking the UI without the real sim.
 * Run with `npx tsx client/scripts/mock-server.ts`, then `npm run dev -w @village/client`.
 * Not part of the app: it fakes plausible messages and computes nothing real.
 */
import { WebSocketServer, type WebSocket } from "ws";
import {
  parseClientMessage,
  type Agent,
  type AgentDetailMessage,
  type ServerMessage,
  type SnapshotMessage,
  type Volume,
} from "@village/shared";
import {
  makeSampleAgent,
  makeSampleEvent,
  makeSampleLlmCall,
  makeSampleMemory,
  makeSampleMoment,
  makeSampleSnapshot,
} from "../src/fixtures/sample-data";

const DEFAULT_PORT = 8787;
const MAP_WIDTH = 40;
const MAP_HEIGHT = 30;
const SIGHT_RADIUS = 6;
const SPEECH_RADIUS = 4;
const SPEECH_CHANCE = 0.15;
const MOMENT_CHANCE = 0.03;
const LINES = ["Fresh bread!", "Has anyone seen Bob?", "Nice weather today.", "Psst, over here."];
const THOUGHTS = [
  "Maybe someone nearby wants to talk.",
  "I hope nobody noticed I was late.",
  "Bob looks like he has news.",
  "I should keep my voice down.",
];
const VOLUMES: Volume[] = ["whisper", "normal", "shout"];
const MILLISECONDS_PER_SECOND = 1000;

const port = Number(process.env.SIM_PORT ?? DEFAULT_PORT);
const startingAgents = (): Agent[] => [
  makeSampleAgent("ada", "Ada", 8, 8),
  makeSampleAgent("bob", "Bob", 20, 12),
  makeSampleAgent("clara", "Clara", 30, 20),
  makeSampleAgent("dan", "Dan", 12, 24),
];

let snapshot: SnapshotMessage = makeSampleSnapshot(startingAgents());
let inspectedAgentId: string | null = null;
let nextEventId = 1;
let nextMomentId = 1;
let tickTimer: ReturnType<typeof setTimeout> | null = null;
const sockets = new Set<WebSocket>();

function pickRandom<Item>(items: readonly Item[]): Item {
  const item = items[Math.floor(Math.random() * items.length)];
  if (item === undefined) throw new Error("Cannot pick from an empty list");
  return item;
}

function broadcast(message: ServerMessage): void {
  const text = JSON.stringify(message);
  for (const socket of sockets) socket.send(text);
}

function tilesWithin(agent: Agent, radius: number): number[] {
  const tiles: number[] = [];
  for (let y = agent.pos.y - radius; y <= agent.pos.y + radius; y += 1) {
    for (let x = agent.pos.x - radius; x <= agent.pos.x + radius; x += 1) {
      const isOnMap = x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT;
      if (isOnMap && Math.abs(x - agent.pos.x) + Math.abs(y - agent.pos.y) <= radius) {
        tiles.push(y * MAP_WIDTH + x);
      }
    }
  }
  return tiles;
}

function buildDetail(agent: Agent): AgentDetailMessage {
  const tick = snapshot.clock.tick;
  return {
    type: "agent_detail",
    agentId: agent.id,
    agent,
    memories: [1, 2, 3, 4].map((index) =>
      makeSampleMemory(`${agent.id}-m${index}`, agent.id, tick - index * 7),
    ),
    llmCalls: [1, 2, 3].map((index) => makeSampleLlmCall(index, agent.id, tick - index * 5)),
    personalityHistory: [],
    perceptionView: {
      visibleTiles: tilesWithin(agent, SIGHT_RADIUS),
      speechReachTiles: tilesWithin(agent, SPEECH_RADIUS),
    },
  };
}

function moveRandomAgent(): void {
  const agent = pickRandom(snapshot.agents);
  const step = pickRandom([
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ]);
  agent.pos = {
    x: Math.min(Math.max(agent.pos.x + step.x, 0), MAP_WIDTH - 1),
    y: Math.min(Math.max(agent.pos.y + step.y, 0), MAP_HEIGHT - 1),
  };
  broadcast({ type: "agent_moved", agentId: agent.id, pos: agent.pos, place: agent.place });
  if (agent.id === inspectedAgentId) broadcast(buildDetail(agent));
}

function speakRandomLine(): void {
  const agent = pickRandom(snapshot.agents);
  const event = makeSampleEvent(nextEventId, agent, snapshot.clock.tick);
  nextEventId += 1;
  const volume = pickRandom(VOLUMES);
  const text = pickRandom(LINES);
  const thought = pickRandom(THOUGHTS);
  agent.lastThought = { text: thought, tick: snapshot.clock.tick };
  broadcast({ type: "state_changed", agents: [agent] });
  broadcast({ type: "said", agentId: agent.id, text, volume, tick: snapshot.clock.tick });
  broadcast({
    type: "event_logged",
    event: {
      ...event,
      description: `said "${text}"`,
      speech: { words: text, volume, thought, llmCallId: event.id },
    },
  });
}

function recordRandomMoment(): void {
  const moment = makeSampleMoment(nextMomentId, pickRandom(snapshot.agents), snapshot.clock.tick);
  nextMomentId += 1;
  snapshot.recentMoments.push(moment);
  broadcast({ type: "moment", moment });
}

function advanceTick(): void {
  snapshot.clock.tick += 1;
  snapshot.stats.tokensToday += Math.floor(Math.random() * 500);
  moveRandomAgent();
  if (Math.random() < SPEECH_CHANCE) speakRandomLine();
  if (Math.random() < MOMENT_CHANCE) recordRandomMoment();
  broadcast({ type: "tick", tick: snapshot.clock.tick, stats: snapshot.stats });
}

function scheduleTicks(): void {
  if (tickTimer !== null) clearTimeout(tickTimer);
  tickTimer = null;
  if (snapshot.clock.isPaused) return;
  const delayMs = MILLISECONDS_PER_SECOND / (snapshot.baseTicksPerSecond * snapshot.clock.speed);
  tickTimer = setTimeout(() => {
    advanceTick();
    scheduleTicks();
  }, delayMs);
}

function handleClientMessage(raw: string): void {
  const message = parseClientMessage(raw);
  switch (message.type) {
    case "pause":
    case "resume":
      snapshot.clock.isPaused = message.type === "pause";
      broadcast({ type: "paused", isPaused: snapshot.clock.isPaused, reason: null });
      scheduleTicks();
      return;
    case "step":
      advanceTick();
      return;
    case "set_speed":
      snapshot.clock.speed = message.speed;
      broadcast({
        type: "settings",
        speed: message.speed,
        dailyTokenBudget: snapshot.stats.dailyTokenBudget,
      });
      scheduleTicks();
      return;
    case "update_settings":
      snapshot.stats.dailyTokenBudget = message.dailyTokenBudget;
      broadcast({
        type: "settings",
        speed: snapshot.clock.speed,
        dailyTokenBudget: message.dailyTokenBudget,
      });
      return;
    case "inspect_agent": {
      inspectedAgentId = message.agentId;
      const agent = snapshot.agents.find((candidate) => candidate.id === message.agentId);
      if (agent) broadcast(buildDetail(agent));
      return;
    }
    case "load_seed_file":
    case "save_seed_file":
      process.stdout.write(
        "The mock server has no seed file; run the real sim to edit characters.\n",
      );
      return;
    case "reset":
      snapshot = makeSampleSnapshot(startingAgents());
      broadcast(snapshot);
      scheduleTicks();
      return;
  }
}

const server = new WebSocketServer({ port, path: "/ws" });
server.on("connection", (socket) => {
  sockets.add(socket);
  socket.send(JSON.stringify(snapshot));
  socket.on("message", (data) => handleClientMessage(String(data)));
  socket.on("close", () => sockets.delete(socket));
});
scheduleTicks();
process.stdout.write(`Mock sim server listening on ws://localhost:${port}/ws\n`);
