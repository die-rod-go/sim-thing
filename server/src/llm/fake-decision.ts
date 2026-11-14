import { config } from "../config";
import type { SeededRandom } from "../random";
import { findMealToEat, type DecisionChoices, type JsonRecord } from "./fake-choices";

/** The responder's own pseudo-action for an interact with a hit-roll verb. */
const ATTACK_CHOICE = "attack";
/** Speaking is a free extra, not an action; the fake picks it like one and pairs it with a wait. */
const SPEAK_CHOICE = "say";
/** The target name meaning the acting agent itself. */
const YOURSELF = "yourself";

function pickWeighted(random: SeededRandom, weights: [string, number][]): string {
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random.next() * total;
  for (const [value, weight] of weights) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return weights[weights.length - 1]?.[0] ?? "wait";
}
function withoutVerbs(uses: Map<string, string[]>, excluded: ReadonlySet<string>) {
  return [...uses].map(
    ([name, verbs]) => [name, verbs.filter((verb) => !excluded.has(verb))] as const,
  );
}

/** Where a verb used with a carried item may be aimed: something here, or the agent itself. */
function pickAim(random: SeededRandom, choices: DecisionChoices): string | null {
  if (random.next() >= config.llm.fakeResponder.aimChance) return null;
  const aims = [...choices.objects.keys()].filter((name) => choices.targets.has(name));
  if (choices.targets.has(YOURSELF)) aims.push(YOURSELF);
  return aims.length > 0 ? random.pick(aims) : null;
}

/**
 * A thing here or something carried, named as `item`, with a verb it offers; or something inside
 * a holder here, named as `item` with the holder as `from`.
 */
function buildInteractFields(
  random: SeededRandom,
  choices: DecisionChoices,
  hitRollVerbs: ReadonlySet<string>,
): { fields: JsonRecord; usedName: string } | null {
  const here = withoutVerbs(choices.objects, hitRollVerbs).filter(
    ([name, verbs]) => choices.items.includes(name) && verbs.length > 0,
  );
  const carried = withoutVerbs(choices.heldItems, hitRollVerbs).filter(
    ([, verbs]) => verbs.length > 0,
  );
  const fromHolders = choices.insideThings
    .filter(
      (thing) =>
        thing.from !== null &&
        choices.holders.includes(thing.from) &&
        choices.items.includes(thing.name) &&
        thing.verbs.length > 0,
    )
    .map((thing) => ({ name: thing.name, verbs: thing.verbs, from: thing.from }));
  const usable = [
    ...here.map(([name, verbs]) => ({ name, verbs, from: null, isCarried: false })),
    ...carried.map(([name, verbs]) => ({ name, verbs, from: null, isCarried: true })),
    ...fromHolders.map((entry) => ({ ...entry, isCarried: false })),
  ];
  if (usable.length === 0) return null;
  const chosen = random.pick(usable);
  const verb =
    random.next() < config.llm.fakeResponder.omitVerbChance ? null : random.pick(chosen.verbs);
  const target = verb !== null && chosen.isCarried ? pickAim(random, choices) : null;
  return {
    fields: { item: chosen.name, from: chosen.from, verb, target },
    usedName: chosen.name,
  };
}

/** A hit-roll verb aimed at someone in sight: with something carried, or bare-handed. */
function buildAttackFields(
  random: SeededRandom,
  choices: DecisionChoices,
  hitRollVerbs: ReadonlySet<string>,
): JsonRecord | null {
  if (choices.inSight.length === 0) return null;
  const options = [
    ...[...choices.heldItems].flatMap(([name, verbs]) =>
      verbs.filter((verb) => hitRollVerbs.has(verb)).map((verb) => ({ item: name, verb })),
    ),
    ...choices.itemlessVerbs
      .filter((verb) => hitRollVerbs.has(verb))
      .map((verb) => ({ item: null, verb })),
  ];
  if (options.length === 0) return null;
  return { ...random.pick(options), target: random.pick(choices.inSight) };
}

export function buildDecisionReply(
  random: SeededRandom,
  choices: DecisionChoices,
  hitRollVerbs: ReadonlySet<string>,
): JsonRecord {
  const tuning = config.llm.fakeResponder;
  const reply: JsonRecord = {
    thought: "I take stock and pick something sensible to do.",
    intention: "getting on with my day",
    say: null,
    volume: null,
    action: "wait",
    target: null,
    verb: null,
    text: null,
    item: null,
    from: null,
    amount: null,
    minutes: null,
    mood: null,
  };
  const meal = findMealToEat(choices);
  if (meal !== null) {
    const intention = "eating something before I go hungry";
    return { ...reply, action: "interact", item: meal, verb: tuning.eatVerb, intention };
  }
  if (choices.actions.includes("continue") && random.next() < tuning.continueChance) {
    return { ...reply, action: "continue" };
  }
  const interact = buildInteractFields(random, choices, hitRollVerbs);
  const attack = buildAttackFields(random, choices, hitRollVerbs);
  const otherPlaces = choices.places.filter((place) => place !== choices.currentPlace);
  const weights = [
    ...Object.entries(tuning.actionWeights),
    [ATTACK_CHOICE, tuning.attackWeight] as [string, number],
  ].filter(([action]) => {
    if (action === ATTACK_CHOICE) return attack !== null && choices.actions.includes("interact");
    if (action === SPEAK_CHOICE) return choices.actions.includes("wait");
    if (!choices.actions.includes(action)) return false;
    if (action === "interact") return interact !== null;
    if (action === "walk_to") return otherPlaces.length > 0;
    if (action === "give") return choices.inSight.length > 0 && choices.items.length > 0;
    return true;
  });
  const action = pickWeighted(random, weights);
  if (action === ATTACK_CHOICE && attack !== null) {
    return { ...reply, action: "interact", ...attack, intention: "settling a score" };
  }
  if (action === "interact" && interact !== null) {
    const text = random.pick(tuning.lines);
    return {
      ...reply,
      action,
      ...interact.fields,
      text,
      intention: `using the ${interact.usedName}`,
    };
  }
  if (action === "walk_to") {
    const target = random.pick(otherPlaces);
    return { ...reply, action, target, intention: `heading to the ${target}` };
  }
  if (action === "give") {
    const target = random.pick(choices.inSight);
    return { ...reply, action, target, item: random.pick(choices.items), amount: 1 };
  }
  if (action === SPEAK_CHOICE) {
    const line = random.pick(tuning.lines);
    const say = choices.inSight.length > 0 ? `${random.pick(choices.inSight)}! ${line}` : line;
    const { min, max } = tuning.waitMinutes;
    return { ...reply, action: "wait", say, volume: "normal", minutes: random.nextInt(min, max) };
  }
  const { min, max } = tuning.waitMinutes;
  return { ...reply, action: "wait", minutes: random.nextInt(min, max) };
}
