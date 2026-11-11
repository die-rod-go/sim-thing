import type { Verb } from "@village/shared";
import { isAsleep } from "../economy/sleep";
import { resolveNumber } from "../items/verb-numbers";
import { computeHitChance, type Defender } from "../status/combat";
import { describeVerbPhrase, type PhraseNames } from "./action-phrases";
import type { VerbAim, VerbRun } from "./agent-runtime";
import { broadcastEvent } from "./event-broadcast";
import { createEvent } from "./event-factory";
import type { TickContext } from "./tick-context";
import { readRunComponents } from "./used-components";
import { describeAimName } from "./verb-aim";
import { findAgent } from "./world-access";
import type { WorldState } from "./world-state";

/** An event's description, and how the user and the target agent each file it when that differs. */
export interface AimedPhrases {
  description: string;
  actorDescription?: string;
  targetDescription?: string;
}

/**
 * A phrase about the run in each perspective: "hit Tobias with a knife" to onlookers, "hit me with
 * a knife" to Tobias; a verb aimed at oneself reads "themselves" to others and "myself" to the user.
 */
export function describeAimedPhrases(
  state: WorldState,
  run: VerbRun,
  describe: (names: PhraseNames) => string,
): AimedPhrases {
  const { aim } = run;
  const description = describe({ item: run.usedName, target: run.aimName });
  if (!aim || aim.kind !== "agent") return { description };
  const nameFor = (perspective: "user" | "target") =>
    describe({ item: run.usedName, target: describeAimName(state, run.agentId, aim, perspective) });
  return aim.agentId === run.agentId
    ? { description, actorDescription: nameFor("user") }
    : { description, targetDescription: nameFor("target") };
}

export function prefixPhrases(phrases: AimedPhrases, prefix: string): AimedPhrases {
  const prefixed: AimedPhrases = { description: `${prefix}${phrases.description}` };
  if (phrases.actorDescription !== undefined) {
    prefixed.actorDescription = `${prefix}${phrases.actorDescription}`;
  }
  if (phrases.targetDescription !== undefined) {
    prefixed.targetDescription = `${prefix}${phrases.targetDescription}`;
  }
  return prefixed;
}

/** How far the verb is heard while it runs, read from what it is used with when it says so. */
export function computeLoudness(state: WorldState, verb: Verb, run: VerbRun): number | null {
  return verb.loudness === null
    ? null
    : resolveNumber(verb.loudness, readRunComponents(state, run));
}

function aimTargetId(aim: VerbAim): string {
  return aim.kind === "agent" ? aim.agentId : aim.entityId;
}

/** The event's target: what the verb is aimed at, or else the thing used. */
export function describeRunTarget(run: VerbRun): { targetId: string | null; targetName: string } {
  return run.aim
    ? { targetId: aimTargetId(run.aim), targetName: run.aimName ?? "" }
    : { targetId: run.usedEntityId, targetName: run.usedName };
}

function describeDefender(state: WorldState, run: VerbRun, aim: VerbAim): Defender {
  if (aim.kind === "entity") return { kind: "entity" };
  const defender = findAgent(state, aim.agentId);
  return {
    kind: "agent",
    agility: defender.body.agility,
    isAsleep: isAsleep(defender),
    isUser: aim.agentId === run.agentId,
  };
}

/** The hit roll, on the seeded generator: agility against agility, sleepers and things always hit. */
export function rollForHit(state: WorldState, run: VerbRun, verb: Verb): boolean {
  if (!verb.hitRoll || !run.aim) return true;
  const baseHitChance = resolveNumber(verb.hitRoll.baseHitChance, readRunComponents(state, run));
  const attacker = findAgent(state, run.agentId);
  const chance = computeHitChance(
    baseHitChance,
    attacker.body.agility,
    describeDefender(state, run, run.aim),
  );
  return state.random.next() < chance;
}

/**
 * The `attacked` or `missed` event everyone in sight takes in, before the effects land. A sleeping
 * target doesn't perceive it: they only wake up hurt.
 */
export function announceHitRoll(
  context: TickContext,
  run: VerbRun,
  verb: Verb,
  isHit: boolean,
): void {
  const { state, result } = context;
  const phrases = describeAimedPhrases(state, run, (names) =>
    describeVerbPhrase(verb, isHit ? "hit" : "missed", names),
  );
  const { aim } = run;
  const sleepingTargetIds =
    aim?.kind === "agent" && isAsleep(findAgent(state, aim.agentId)) ? [aim.agentId] : [];
  const event = createEvent(state, findAgent(state, run.agentId), {
    kind: isHit ? "attacked" : "missed",
    ...phrases,
    ...describeRunTarget(run),
    loudness: computeLoudness(state, verb, run),
  });
  broadcastEvent(state, event, result, { unperceivedBy: sleepingTargetIds });
}
