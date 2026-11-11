import { config } from "../config";
import type { SeededRandom } from "../random";
import { findMealToEat, type DecisionChoices, type JsonRecord } from "./fake-choices";

/** The responder's own pseudo-action for an interact with a hit-roll verb. */
const ATTACK_CHOICE = "attack";

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

/**
 * What a verb that moves things (`put`, `take`) moves: something carried, or something the enum
 * offers that isn't carried (inside a container or body in reach). Null for other verbs.
 */
function pickChosenItem(
  random: SeededRandom,
  choices: DecisionChoices,
  verb: string,
): string | null {
  const source = config.llm.fakeResponder.itemChoosingVerbs[verb];
  if (source === undefined) return null;
  const carried = [...choices.heldItems.keys()];
  const options =
    source === "carried" ? carried : choices.items.filter((name) => !carried.includes(name));
  return options.length > 0 ? random.pick(options) : null;
}

/** Things here that show what they hold, by offering to give it up: where a carried thing can be put. */
function listHolders(choices: DecisionChoices): string[] {
  const { itemChoosingVerbs } = config.llm.fakeResponder;
  const takeVerbs = Object.keys(itemChoosingVerbs).filter(
    (verb) => itemChoosingVerbs[verb] === "inside",
  );
  return [...choices.objects]
    .filter(
      ([name, verbs]) =>
        choices.targets.has(name) && verbs.some((verb) => takeVerbs.includes(verb)),
    )
    .map(([name]) => name);
}

/**
 * A thing here, named as `target`, with a verb it offers (`take` moves what is inside it); or
 * something carried, named as `item`, with a verb it offers (`put` also names the holder).
 */
function buildInteractFields(
  random: SeededRandom,
  choices: DecisionChoices,
  hitRollVerbs: ReadonlySet<string>,
): { fields: JsonRecord; usedName: string } | null {
  const tuning = config.llm.fakeResponder;
  const holders = listHolders(choices);
  const canBePut = (verb: string) =>
    tuning.itemChoosingVerbs[verb] !== "carried" || holders.length > 0;
  const here = withoutVerbs(choices.objects, hitRollVerbs).filter(
    ([name, verbs]) => choices.targets.has(name) && verbs.length > 0,
  );
  const carried = withoutVerbs(choices.heldItems, hitRollVerbs)
    .map(([name, verbs]) => [name, verbs.filter(canBePut)] as const)
    .filter(([, verbs]) => verbs.length > 0);
  const usable = [
    ...here.map(([name, verbs]) => ({ field: "target", name, verbs })),
    ...carried.map(([name, verbs]) => ({ field: "item", name, verbs })),
  ];
  if (usable.length === 0) return null;
  const chosen = random.pick(usable);
  const verb = random.next() < tuning.omitVerbChance ? null : random.pick(chosen.verbs);
  const source = verb === null ? undefined : tuning.itemChoosingVerbs[verb];
  if (verb !== null && source === "carried" && chosen.field === "item") {
    return {
      fields: { item: chosen.name, verb, target: random.pick(holders) },
      usedName: chosen.name,
    };
  }
  const item =
    verb === null || chosen.field !== "target" ? null : pickChosenItem(random, choices, verb);
  const fields =
    item === null ? { [chosen.field]: chosen.name, verb } : { target: chosen.name, verb, item };
  return { fields, usedName: chosen.name };
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
    amount: null,
    query: null,
    minutes: null,
    note: null,
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
    if (!choices.actions.includes(action)) return false;
    if (action === "interact") return interact !== null;
    if (action === "walk_to") return otherPlaces.length > 0;
    if (action === "give") return choices.inSight.length > 0 && choices.items.length > 0;
    return true;
  });
  const action = pickWeighted(random, weights);
  if (random.next() < tuning.sayChance) {
    const line = random.pick(tuning.lines);
    const say = choices.inSight.length > 0 ? `${random.pick(choices.inSight)}! ${line}` : line;
    Object.assign(reply, { say, volume: "normal" });
  }
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
  if (action === "recall") {
    return {
      ...reply,
      action,
      query: random.pick(choices.places.length > 0 ? choices.places : ["village"]),
    };
  }
  const { min, max } = tuning.waitMinutes;
  return { ...reply, action: "wait", minutes: random.nextInt(min, max) };
}
