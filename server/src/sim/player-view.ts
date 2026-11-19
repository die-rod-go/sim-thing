import type {
  Agent,
  PlayerHearing,
  PlayerPerson,
  PlayerThing,
  PlayerView,
  WorldEvent,
} from "@village/shared";
import { config } from "../config";
import { computeChebyshevDistance } from "../economy/give";
import { isAsleep } from "../economy/sleep";
import { describeEntityName, listHeldEntities } from "../items/entity-store";
import { describeStreamEntry } from "../memory/stream";
import { findObviousListeners } from "../perception/listeners";
import { computeVisibleTiles } from "../perception/sight";
import { listBodyWords } from "../status/conditions";
import { isDead } from "../status/health";
import { describeLocation } from "../world/place-names";
import { describeDoing } from "./action-phrases";
import { getAgentRuntime } from "./agent-runtime";
import { listCreaturesInSight } from "./context-builder";
import { listCreatures } from "./creatures/creature-instincts";
import { listHereEntities } from "./here-entities";
import { describeOfferWhat, findOwnOffer } from "./offers";
import { describePlayerAct } from "./player-acts";
import { findPlayedAgent } from "./player-control";
import type { PlayerInbox } from "./player-inbox";
import { listBareHandedOptions, listEntityOptions, listTargetCandidates } from "./player-options";
import { describeTurnReason, needsPlayer } from "./player-turn";
import { describeBodyHolding, groupEntityLines, type EntityLine } from "./prompt-lines";
import { listVisibleBodies, listVisibleContents } from "./reachable-contents";
import {
  buildPerceptionWorld,
  describeAgentAsSeen,
  findAgent,
  getAgentMemory,
  listLivingAgents,
  toPerceiver,
} from "./world-access";
import type { WorldState } from "./world-state";

type TargetCandidates = ReturnType<typeof listTargetCandidates>;

/** One line of Here or Belongings as the player sees it; `from` names the holder it is inside. */
function toPlayerThing(
  state: WorldState,
  agent: Agent,
  line: EntityLine,
  from: string | null,
  candidates: TargetCandidates,
): PlayerThing {
  const [representative] = line.entities;
  const name = representative === undefined ? line.text : describeEntityName(state, representative);
  return {
    name,
    text: line.text,
    count: line.entities.length,
    details: line.details,
    options:
      representative === undefined
        ? []
        : listEntityOptions(state, agent, representative, from, candidates),
    contents: line.contents.map((content) =>
      toPlayerThing(state, agent, content, name, candidates),
    ),
  };
}

/** A body in sight: how it lies or is carried, and what the player can see on it. */
function toBodyThing(
  state: WorldState,
  agent: Agent,
  body: Agent,
  candidates: TargetCandidates,
): PlayerThing {
  const name = describeAgentAsSeen(body);
  const holding = describeBodyHolding(state, agent.id, body);
  const contents = listVisibleContents(state, agent.id, { kind: "agent", agentId: body.id });
  return {
    name,
    text: name,
    count: 1,
    details: [...(holding === null ? [] : [holding]), ...listBodyWords(state.items, body, true)],
    options: [],
    contents: groupEntityLines(state, agent.id, contents).map((line) =>
      toPlayerThing(state, agent, line, name, candidates),
    ),
  };
}

/** Everyone the agent sees, nearest first, with who would plainly hear it speak. */
function listPeopleInSight(state: WorldState, agent: Agent): PlayerPerson[] {
  const listeners = findObviousListeners(
    buildPerceptionWorld(state),
    toPerceiver(agent),
    listLivingAgents(state)
      .filter((other) => other.id !== agent.id)
      .map(toPerceiver),
  );
  const people = getAgentRuntime(state, agent.id).visibleAgentIds.map((otherId) => {
    const other = findAgent(state, otherId);
    const distanceTiles = computeChebyshevDistance(agent.pos, other.pos);
    return {
      name: describeAgentAsSeen(other),
      pronouns: other.pronouns,
      distanceTiles,
      isInReach: distanceTiles <= config.economy.giveReachTiles,
      canHearYou: listeners.wouldHearNormal.includes(otherId),
      canHearWhisper: listeners.wouldHearWhisper.includes(otherId),
      doing:
        agent.awareness[otherId]?.doing ??
        describeDoing(state, other, getAgentRuntime(state, otherId)),
      isDead: isDead(other),
    };
  });
  return people.sort((first, second) => first.distanceTiles - second.distanceTiles);
}

function listVisibleTiles(state: WorldState, agent: Agent): number[] {
  if (isAsleep(agent)) return [];
  const world = buildPerceptionWorld(state);
  return computeVisibleTiles(world, agent.pos, config.perception.sightRangeTiles);
}

/** A dead agent perceives and does nothing; its last moments stay in the journal. */
function buildDeadView(state: WorldState, agent: Agent): PlayerView {
  return {
    agentId: agent.id,
    isDead: true,
    isYourTurn: false,
    turnReason: null,
    doing: null,
    place: describeLocation(state.map, agent.place, agent.pos),
    here: [],
    carrying: [],
    bareHanded: [],
    people: [],
    creatures: [],
    destinations: [],
    offer: null,
    ownOffer: null,
    lastFailure: null,
    pendingActs: [],
    journal: getAgentMemory(state, agent.id).stream.map(describeStreamEntry),
    visibleTiles: [],
    creatureIds: listCreatureIds(state),
  };
}

function listCreatureIds(state: WorldState): string[] {
  return listCreatures(state).map((creature) => creature.id);
}

function buildOffer(state: WorldState, agent: Agent): PlayerView["offer"] {
  const offer = getAgentRuntime(state, agent.id).pendingOffer;
  if (offer === null) return null;
  const giverName = describeAgentAsSeen(findAgent(state, offer.giverId));
  return { eventId: offer.eventId, giverName, itemText: describeOfferWhat(offer) };
}

/**
 * How the played agent took in a line of speech, from the conversation log the tick just wrote;
 * its own words it hears clearly. Null when nobody is played.
 */
export function findPlayerHearing(state: WorldState, event: WorldEvent): PlayerHearing | null {
  const played = findPlayedAgent(state);
  if (played === null) return null;
  if (event.actorId === played.id) return "clear";
  const line = state.conversationLog.lines.find(
    (spoken) =>
      spoken.speakerId === event.actorId &&
      spoken.tick === event.tick &&
      spoken.words === event.speech?.words,
  );
  if (line?.clearListenerIds.includes(played.id)) return "clear";
  return line?.muffledListenerIds.includes(played.id) ? "muffled" : "none";
}

/**
 * Everything the played agent perceives and can do, as its decision prompt would put it, in a form
 * the player's panel can act on. Null when nobody is played.
 */
export function buildPlayerView(
  state: WorldState,
  inbox: PlayerInbox | undefined,
): PlayerView | null {
  const agent = findPlayedAgent(state);
  if (agent === null) return null;
  if (isDead(agent)) return buildDeadView(state, agent);
  const pending = inbox?.list(agent.id) ?? [];
  const isYourTurn = pending.length === 0 && needsPlayer(state, agent);
  const candidates = listTargetCandidates(state, agent);
  const toThing = (line: EntityLine) => toPlayerThing(state, agent, line, null, candidates);
  return {
    agentId: agent.id,
    isDead: false,
    isYourTurn,
    turnReason: isYourTurn ? describeTurnReason(state, agent) : null,
    doing:
      agent.currentAction === null
        ? null
        : describeDoing(state, agent, getAgentRuntime(state, agent.id)),
    place: describeLocation(state.map, agent.place, agent.pos),
    here: [
      ...groupEntityLines(state, agent.id, listHereEntities(state, agent)).map(toThing),
      ...listVisibleBodies(state, agent.id).map((body) =>
        toBodyThing(state, agent, body, candidates),
      ),
    ],
    carrying: groupEntityLines(state, agent.id, listHeldEntities(state, agent.id)).map(toThing),
    bareHanded: listBareHandedOptions(state, agent, candidates),
    people: listPeopleInSight(state, agent),
    creatures: listCreaturesInSight(state, agent),
    destinations: state.map.places.map((place) => place.name),
    offer: buildOffer(state, agent),
    ownOffer: findOwnOffer(state, agent.id),
    lastFailure: getAgentRuntime(state, agent.id).lastFailure,
    pendingActs: pending.map((act) => describePlayerAct(state, agent, act)),
    journal: getAgentMemory(state, agent.id).stream.map(describeStreamEntry),
    visibleTiles: listVisibleTiles(state, agent),
    creatureIds: listCreatureIds(state),
  };
}
