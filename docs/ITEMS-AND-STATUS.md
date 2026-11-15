# Items, verbs and status: design

Status: **built**, then partly **superseded by `COMPONENTS.md`**: its data model, verbs, effects,
conditions, reactions and item editor sections are replaced there. The status sections (starvation,
regeneration, the combat formulas, death, the Status panel) still hold. Where the code differs from
this document, the code and `AGENTS.md` are the reference.

## Goal

More interactivity. Items and world objects are built from parts that combine (properties, verbs,
effects, conditions, reactions), so new behavior comes from data rather than new code. Agents get
health and two physical stats, can be hurt (punched, stabbed, starved), and can die. A browser
editor lets you author items without touching code.

The first content is a knife with an `attack` verb, a bare-handed `punch`, starvation, and death.

## How this fits the design rule

_Hardcode the containers, not the meaning._ Everything here is physics, not social behavior:

- Code decides what physically happens: damage, hit rolls, fire spreading, a glass jar breaking.
- The LLM decides whether to stab someone, how to feel about it, whether to flee, and what to tell
  others. Nothing in code makes an agent angry, afraid or vengeful. There is no aggression stat,
  and a victim doesn't scream unless its LLM decides to shout.
- Witnesses only perceive the event, and get a decision so they can react.

## Vocabulary

These join the glossary in `AGENTS.md`. One concept, one name.

| Term            | Meaning                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| item definition | A template in `seeds/items.json`: name, form, properties, components                                  |
| entity          | One instance of a definition in the world, with its own id, location and state                        |
| form            | `placeable` (sits on a tile, like an oven) or `carriable` (fits in an inventory, like a knife)        |
| property        | A plain tag on a definition (`flammable`, `fragile`, `sharp`). Reactions and verb rules match on them |
| component       | A structured part with fields (`durability`, `stock`, `openable`)                                     |
| verb            | Something an agent can do (`attack`, `eat`, `take`), offered by whatever its `appliesTo` rule matches |
| effect          | One step a verb, condition or reaction performs (`damage`, `heal`, `emit`, `produce`)                 |
| stimulus        | A named physical cause sent by an effect (`fire`, `water`, `impact`, `cut`)                           |
| reaction        | A rule: when a stimulus reaches something with a property and/or condition, run effects               |
| condition       | A timed state on an agent or entity (`burning`, `bleeding`, `wet`), with per-minute effects           |
| health          | 0–1, 1 = unhurt. At 0 the agent dies                                                                  |
| durability      | An entity's 0–1 condition, 1 = intact, on the same scale as health. At 0 it breaks                    |
| stats           | `strength` and `agility`, 0–1, set per character in the seeds                                         |
| status          | The UI section showing health, needs and conditions together (was "Needs")                            |

"Interaction" becomes "verb" everywhere: config, code, prompts, and the reply's `interaction`
field, which becomes `verb`. That keeps one name for one concept now that verbs apply to items,
objects and agents.

A dead agent's remains are just the dead agent (see Death). There is no separate corpse entity,
and prompts call it "Mara's body". `Agent.body` keeps its current meaning: the agent's physical
record, which now holds the stats too.

## Data model

### Where things live

- `seeds/items.json`: item definitions, components, verbs, properties, conditions, reactions and
  the `person` properties. This is **content**, like `seeds/agents.json`, and the item editor
  edits it. Validated by a zod schema in `shared/`.
- `server/src/config.ts`: global tunables only (health regen, starvation timing, hit-chance
  spread, strength scaling, reaction depth cap, health words).
- `AGENTS.md` and `BRIEF.md` are updated to say so: global tunables stay in config, and item
  content lives in `items.json`.

`items.json` is read when the server starts and when the world resets. The server refuses to
start, naming the problem, if `items.json` has errors, if a map object names a definition that
doesn't exist or isn't placeable, if a seed inventory names an unknown or non-carriable definition,
or if a saved entity's definition is gone (run `make reset`).

### Item definition

```jsonc
{
  "id": "knife",
  "name": "knife",
  "plural": "knives",
  "form": "carriable",
  "glyph": { "index": 47, "color": "#d0d4dc" },
  "isVisibleWhenCarried": true,
  "properties": ["sharp", "metal"],
  "components": {
    "durability": { "toughness": 4 },
    "weapon": { "damage": { "min": 0.2, "max": 0.4 }, "hitChance": 0.7, "stimulus": "cut" },
    "weight": { "kilograms": 0.3 },
  },
  "onBroken": [{ "type": "transform", "on": "self", "into": "broken_knife" }],
}
```

Definition ids are snake_case (`broken_knife`); `name` is what prompts show ("broken knife").

A definition doesn't list its verbs. Verbs are defined separately and say what they apply to (see
Verbs). The knife can be used to `attack` because it has a `weapon` component and the `attack`
verb applies to held things with one. How hard it hits comes from that component.

- `glyph` is required: placeables and items on the ground are drawn from it (see Client). `index`
  is a CP437 code in the glyph sheet (`maps/acorn-tileset-8x8.png`), `color` tints it, and an
  optional `background` fills the tile behind it.
- `onBroken` runs when durability reaches 0. Without it the entity is destroyed.
- Every carriable definition must have a `weight` component (validation rejects one without), so
  anything you can hold can be thrown. Coins weigh a few grams.

### Entity (instance)

```ts
interface Entity {
  id: string; // from a counter in the world state, so runs reproduce
  definitionId: string;
  location:
    | { kind: "inventory"; agentId: string } // carried, by a living or dead agent
    | { kind: "tile"; place: string; pos: Position } // placed objects and items on the ground
    | { kind: "inside"; containerId: string }; // in a chest, basket or other container
  state: {
    durability?: number;
    stock?: number;
    isOpen?: boolean;
    notes?: Note[];
    userIds?: string[];
    conditions: ActiveCondition[];
  };
}

interface ActiveCondition {
  name: string;
  endsAtTick: number | null; // null: lasts until removed
  sourceId: string | null; // who caused it, for death causes ("bled to death after...")
}
```

- Inventories stop being `Record<string, number>`. An agent's inventory is every entity whose
  location is that agent. Prompts and the UI still group identical, stateless entities, so the
  agent sees "3 bread, a knife (worn), a burning torch".
- **Coins are items:** a carriable `coin` definition (plural "coins"), so `Agent.coins` goes away.
  An agent with 30 coins holds 30 coin entities, shown as "30 coins". They move like any other item:
  `give`, `drop`, `pick up`, `put`, `take`, `throw`. The closed supply holds because nothing
  produces or destroys coins; validation warns if a verb, reaction or `onBroken` could.
- `WorldObject` and `ObjectKind` go away. Tiled objects name a definition id instead of a kind and
  load as `tile` entities. Doors, beds, ovens, the wheat field, trees, the card table and the notice
  board become definitions.
- `give 2 bread` hands over two matching entities, oldest first.
- An entity in an inventory is where its holder is, and one inside a container is where the
  container is. That position is used for `nearby`, sight and fire spreading, so a burning torch
  in your hand can set you alight.
- Placeables can't be picked up. There is no inventory limit, as today.

### Components

A component is a named set of typed fields. Every component is declared in `items.json` with its
fields (`number`, `range`, `boolean`, `text`), and a definition fills them in. There are no two
kinds of component, but some are also read by engine code, which gives them behavior and fixes
their fields:

| Component    | Fields                                                    | Engine behavior                                             |
| ------------ | --------------------------------------------------------- | ----------------------------------------------------------- |
| `durability` | `toughness`                                               | Damage and wear are divided by `toughness`; 1 = as a person |
| `stock`      | `capacity`, `regrowPerDay`                                | Wheat field, trees                                          |
| `openable`   | `startsOpen`, `blocksSightWhenClosed`, `muffleWhenClosed` | Doors. A destroyed door counts as open for sight and sound  |
| `blocking`   | `blocksMovement`, `blocksSight`                           | Placeables that are in the way                              |
| `container`  | `capacity`                                                | Chests, baskets: entities that hold items                   |
| `notes`      | `maxNotes`                                                | Notice board                                                |
| `bed`        | —                                                         | Marks something you can sleep in                            |

An entity without `durability` can't be damaged (the wheat field). Giving a component new engine
behavior is a code change.

Every other component is read only by verbs, so adding one is pure data. Starting ones:

| Component | Fields                                    | Read by                              |
| --------- | ----------------------------------------- | ------------------------------------ |
| `weapon`  | `damage` (range), `hitChance`, `stimulus` | `attack`                             |
| `weight`  | `kilograms`                               | `throw` (damage), and later carrying |
| `food`    | `hunger`                                  | `eat` (how much it fills)            |
| `drink`   | `fun`, `energy`                           | `drink`                              |
| `healing` | `health`                                  | `use` (bandage)                      |

Components hold data only. They never own verbs. A verb works on everything with a component when
its `appliesTo` rule names that component, and it reads the component's fields for its numbers (see
Verbs).

### Properties

Properties are free tags defined in `items.json`, each with a description and an optional prompt
word (a `fragile` jar shows as "a fragile jar" only if the property has `isVisible: true`). Code
never checks a property by name; only data does (reactions, `appliesTo` rules and `tools`). So
adding `cursed` or `slippery` is pure data, and it does nothing until something mentions it.

Agents have properties too, listed under `person` in `items.json` (`"person": { "properties":
["flesh", "flammable"] }`). `person` isn't an item definition: it has no form, glyph or components.

## Verbs

Every verb is defined once, in the `verbs` list of `items.json`, with an `appliesTo` rule. The sim
offers a verb on every entity or agent its rule matches, and that matched thing is what
`on: "item"` refers to in the verb's effects. Verbs don't belong to definitions or components.

`appliesTo` picks the thing being **used**: a held knife, the oven you're at, the chest or body you
search, or yourself. `target` is what you **aim** it at: the person you stab, the door you throw
a rock at. A rule may never match a living agent other than the user, so other people are only ever
targets.

`give`, `walk_to`, `recall` and `wait` stay actions of their own, not verbs.

```jsonc
[
  {
    "name": "attack",
    "appliesTo": { "allOf": [{ "component": "weapon" }, { "location": "held" }] },
    "target": "agent_or_entity",
    "reach": 1,
    "minutes": 1,
    "loudness": 6,
    "hitRoll": { "baseHitChance": { "from": "item.weapon.hitChance" } },
    "effects": [
      {
        "type": "damage",
        "on": "target",
        "amount": { "from": "item.weapon.damage" },
        "stimulus": { "from": "item.weapon.stimulus" },
        "scaledByStrength": true,
      },
      { "type": "wear", "on": "item", "amount": 0.02, "requiresHit": false },
    ],
    "phrases": {
      "ongoing": "attacking {target} with {item}",
      "hit": "hit {target} with {item}",
      "missed": "swung {item} at {target} and missed",
      "killed": "killed by {actor} with {item}",
      "attempt": "attack {target} with {item}",
    },
  },
  {
    "name": "throw",
    "appliesTo": {
      "allOf": [{ "form": "carriable" }, { "component": "weight" }, { "location": "held" }],
    },
    "target": "agent_or_entity",
    "reach": 6,
    "minutes": 1,
    "hitRoll": { "baseHitChance": 0.6 },
    "effects": [
      {
        "type": "damage",
        "on": "target",
        "amount": { "min": 0.02, "max": 0.05, "times": "item.weight.kilograms" },
        "stimulus": "impact",
        "scaledByStrength": true,
      },
      { "type": "move", "on": "item", "to": "target_tile", "requiresHit": false },
    ],
    "phrases": {
      "ongoing": "throwing {item} at {target}",
      "hit": "hit {target} with a thrown {item}",
      "missed": "threw {item} at {target} and missed",
      "killed": "killed by {item} thrown by {actor}",
      "attempt": "throw {item} at {target}",
    },
  },
  {
    "name": "take",
    "appliesTo": { "anyOf": [{ "component": "container" }, { "isDeadAgent": true }] },
    "target": "none",
    "reach": 1,
    "effects": [{ "type": "move", "on": "chosen", "to": "user" }],
  },
  {
    "name": "punch",
    "appliesTo": { "isUser": true },
    "target": "agent",
    "reach": 1,
    "minutes": 1,
    "hitRoll": { "baseHitChance": 0.8 },
    "effects": [
      {
        "type": "damage",
        "on": "target",
        "amount": { "min": 0.05, "max": 0.12 },
        "stimulus": "impact",
        "scaledByStrength": true,
      },
      {
        "type": "change_need",
        "on": "user",
        "need": "energy",
        "amount": -0.01,
        "requiresHit": false,
      },
    ],
    "phrases": {
      "ongoing": "punching {target}",
      "hit": "punched {target}",
      "missed": "swung a fist at {target} and missed",
      "killed": "beaten to death by {actor}",
      "attempt": "punch {target}",
    },
  },
]
```

`appliesTo` terms, combined with `anyOf`, `allOf` and `not`:

| Term          | Matches                                                 |
| ------------- | ------------------------------------------------------- |
| `definition`  | Entities of that definition                             |
| `component`   | Entities that have that component                       |
| `form`        | `carriable` or `placeable` entities                     |
| `property`    | Entities, the user or dead agents with that property    |
| `location`    | `held` (in the user's inventory), `ground`, or `placed` |
| `isDeadAgent` | Dead agents                                             |
| `isUser`      | The agent doing it, so the verb needs no item (`punch`) |

The terms are code; which verbs use them is data. So making a future component work with `take`
means adding it to `take`'s rule, with no change to the verb or its code. A rule can be as narrow
as one definition (`bake bread` at the oven) or as wide as a property (anything `sharp`).

### Numbers from components

Any number, range or text in a verb (in its effects, `hitRoll`, `reach` or `minutes`) can be a
literal, or read from a component of the thing being used:

- `{ "from": "item.weapon.damage" }` takes the field's value as it is.
- `"times": "item.weight.kilograms"` on a literal multiplies it by the field, so a 2 kg rock thrown
  hits harder than a 0.3 kg knife.

So one `attack` verb serves every weapon, and a knife and a sickle differ only in their `weapon`
components. Literals stay for numbers that don't vary by item, like `punch`'s damage.

A verb can only read components its rule guarantees. If `attack` reads `item.weapon.damage`, every
branch of its `appliesTo` must require `component: weapon`; validation rejects it otherwise. A rule
that requires several components (`throw` above requires `weight`) can read from all of them.

Phrases can use `{item}`, so "hit Tobias with a knife" works for any weapon. A verb that needs
item-specific wording ("stabbed") can read it from a component text field too.

Starting verbs:

| Verb                                                                        | `appliesTo`                                                                                                                              |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `eat`                                                                       | `component: food` and `location: held`                                                                                                   |
| `drink`                                                                     | `component: drink` and `location: held`                                                                                                  |
| `attack`                                                                    | `component: weapon` and `location: held`                                                                                                 |
| `use` (bandage)                                                             | `component: healing` and `location: held`                                                                                                |
| `harvest wheat`, `chop wood`, `bake bread`, `brew ale`, `play cards`, `sit` | that definition                                                                                                                          |
| `drop`                                                                      | `form: carriable` and `location: held`                                                                                                   |
| `throw`                                                                     | `form: carriable`, `component: weight` and `location: held` (every carriable has `weight`, but the rule names it so `throw` may read it) |
| `pick up`                                                                   | `form: carriable` and `location: ground`                                                                                                 |
| `put`                                                                       | `component: container`                                                                                                                   |
| `take`                                                                      | `component: container`, or `isDeadAgent`                                                                                                 |
| `open`, `close`                                                             | `component: openable`                                                                                                                    |
| `sleep`                                                                     | `component: bed`                                                                                                                         |
| `read`, `post a note`                                                       | `component: notes`                                                                                                                       |
| `punch`                                                                     | `isUser`                                                                                                                                 |

- Two verbs with the same name can't both match the same thing. Validation checks every
  definition and `person` (as the user and as a dead agent) against every rule (ignoring
  `location`) and rejects overlaps. To give one item its own version of a general verb, exclude it from the general rule with `not` (a jar's own `throw`, with
  the general `throw` set to `not: { definition: "jar" }`).
- For `put` and `take`, the decision's `item` names the thing moved, and `on: "chosen"` refers to
  it.

Nobody can `take` from a living agent: `take`'s rule matches only containers and dead agents.
Goods leave a living agent only through their own `give`, so theft is not possible, even from
someone asleep.

### Verb fields

| Verb field      | Meaning                                                                                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`          | What the agent says it does                                                                                                                                                       |
| `target`        | `none` (just the item or object itself), `agent` (living only), `entity`, `agent_or_entity`. An `entity` target can be on a tile or another held item (light the bottle you hold) |
| `canTargetSelf` | Whether `agent` targets include the user ("bandage yourself"); default `false`                                                                                                    |
| `reach`         | Tiles from the user to the target, or to the used thing when `target` is `none` (1 for melee, 6 for throw). Held items are always in reach. The target must also be in sight      |
| `minutes`       | Duration; `null` means it ends by its own rules (sleep)                                                                                                                           |
| `loudness`      | Sound reach while it runs; `null` if silent                                                                                                                                       |
| `takesText`     | Whether it uses the decision's `text` (post a note)                                                                                                                               |
| `inputs`        | Items used up when it starts (`{ "wheat": 2, "wood": 1 }`)                                                                                                                        |
| `tools`         | Other items that must be held but aren't used up: definition ids or properties (`{ "properties": ["sharp"] }` to carve). The components of the thing being used go in `appliesTo` |
| `hitRoll`       | Present on attacks; see Combat                                                                                                                                                    |
| `effects`       | The ordered list of effects to run                                                                                                                                                |
| `phrases`       | `ongoing`, `done`, `attempt`; `hit` and `missed` are required with `hitRoll`, and `killed` with any `damage` effect (it names the death)                                          |
| `appliesTo`     | The rule for which entities and agents offer it                                                                                                                                   |

### Effects

Effect types are code (each needs an implementation); which effects a verb has, their order and
numbers are data. Every effect takes these **modifiers**, which is where the Noita-style combining
comes from:

- `on`: who or what the effect applies to. Required in verbs; defaults to `self` in conditions and
  reactions:
  - `target`: what the verb was aimed at
  - `user`: the agent doing it
  - `item`: the thing the verb's rule matched (the held knife, the oven, the chest, the body).
    Nothing for an `isUser` verb
  - `chosen`: the thing the decision's `item` names, for verbs that move something (`put`, `take`)
  - `self`: whatever carries the condition or reaction running the effect
  - `nearby`: every agent and entity within `radius` of the target, or of `self` in a condition
    or reaction, not counting `self`
- `chance`: 0–1, rolled with the seeded generator
- `when`: `start` or `finish` (default `finish`)
- `requiresHit`: only if the verb's hit roll succeeded (default `true` on verbs with `hitRoll`).
  The roll happens at `finish`, so a `start` effect can't require a hit; validation rejects it

| Effect                             | Parameters                                          | Does                                                                                                                                                                      |
| ---------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `damage`                           | `amount {min,max}`, `stimulus?`, `scaledByStrength` | Lowers health, or durability ÷ toughness, then sends `stimulus` if given (also to things without durability)                                                              |
| `heal`                             | `amount`                                            | Raises health                                                                                                                                                             |
| `change_need`                      | `need`, `amount`, `perOtherUser?`                   | Hunger, energy, social, fun (the card-table bonus becomes `perOtherUser`)                                                                                                 |
| `emit`                             | `stimulus`                                          | Sends a stimulus without damage (`water`, `fire`)                                                                                                                         |
| `add_condition`                    | `condition`, `minutes?`                             | Starts a condition                                                                                                                                                        |
| `remove_condition`                 | `condition`                                         | Ends a condition                                                                                                                                                          |
| `produce`                          | `item`, `count`, `into` (`user` or `ground`)        | Creates entities (bake → 4 bread)                                                                                                                                         |
| `wear`                             | `amount`                                            | Lowers durability ÷ toughness, with no stimulus                                                                                                                           |
| `transform`                        | `into`                                              | Replaces the entity with another definition, keeping its location                                                                                                         |
| `destroy`                          | —                                                   | Removes the entity (eating the bread, using up a bandage)                                                                                                                 |
| `take_stock`                       | `amount`                                            | Takes from a `stock` component                                                                                                                                            |
| `set_open`                         | `isOpen`                                            | Doors                                                                                                                                                                     |
| `move`                             | `to` (`ground`, `user`, `item`, `target_tile`)      | Drop, pick up, put (`to: item`, into the container), take, throw. A thrown item sends `impact` where it lands. A container can't be put inside itself or its own contents |
| `make_sound`                       | `loudness`                                          | A one-off sound (a crash, a creak of hinges)                                                                                                                              |
| `sleep`, `read_notes`, `post_note` | —                                                   | Wrap the existing special mechanics                                                                                                                                       |

- A verb's hit roll, reach check and `finish` effects all happen when it finishes, so a target who
  stepped away during a one-minute swing is missed for being out of reach.
- A cancelled verb keeps what its `start` effects did (inputs stay spent) and never runs its
  `finish` effects, as interactions work now.
- A condition's `onEnd` effects run when it runs out or is removed. When an entity is destroyed or
  transformed, its conditions simply go with it, without `onEnd`.

All amounts are on the 0–1 health scale, so the same numbers work on a person and a door: a knife,
a thrown rock or a fire does a fifth as much to a door with toughness 5.

A stimulus carries the agent who started it through every reaction it sets off, so a fire spread
from Tobias's Molotov gives each new `burning` condition Tobias as its source.

Example combinations that need no new code:

- **Poisoned bread:** a definition with a `food` component and the property `poisonous`. A second
  `eat` verb applies to `food`, `poisonous` and held, adding `add_condition poisoned` after the
  hunger; the general `eat` gets `not: { property: "poisonous" }`. To the agent it's just "eat".
- **Molotov:** a fragile, flammable bottle that has been lit (so it's `burning`). Where it lands it
  receives `impact`. A reaction on `impact` + `fragile` + `burning` sends `fire` to `nearby` radius
  1, and the general `fragile` reaction after it turns the bottle into shards.
- **Lantern:** `light` verb with `emit fire` on `target`, reach 1.
- **Bandage:** `use` with `heal` reading `item.healing.health` and `remove_condition bleeding` on
  `target`, target `agent`, `canTargetSelf: true`, reach 1, then `destroy` on `item`.
- **Carving:** `carve` on wood with `tools: { properties: ["sharp"] }` and `produce` a spoon.

### Conditions

Defined in `items.json`; can sit on agents or entities.

```jsonc
{
  "name": "burning",
  "words": "on fire",
  "isVisible": true,
  "defaultMinutes": 30,
  "everyMinute": [
    { "type": "damage", "on": "self", "amount": { "min": 0.01, "max": 0.01 } },
    { "type": "emit", "on": "nearby", "radius": 1, "stimulus": "fire", "chance": 0.05 },
  ],
  "onEnd": [],
  "phrases": { "killed": "burned to death" },
}
```

- `everyMinute` effects run once per sim-minute, so they don't change if `minutesPerTick` does.
- The burn damage sends no stimulus on purpose: `fire` on itself would re-light it through the
  `flammable` reaction every minute, so it would never burn out.
- `defaultMinutes: null` lasts until something removes it (poison until cured).
- Adding a condition that's already there extends it to the later end; it doesn't stack.
- A condition remembers who caused it. Its `killed` phrase names the death, with the source
  added when there is one ("bled to death after being hurt by Tobias").

Starting conditions:

| Condition  | Lasts       | Does                                                       |
| ---------- | ----------- | ---------------------------------------------------------- |
| `bleeding` | 20 min      | Health −0.01 per minute. A bandage ends it                 |
| `burning`  | 30 min      | Damage each minute; may send `fire` to nearby things       |
| `wet`      | 60 min      | Nothing by itself; reactions stop wet things catching fire |
| `poisoned` | until cured | Health −0.003 per minute                                   |

### Reactions

A global table: when a stimulus reaches something with a property, a condition, or both, run
effects. `unless` skips the reaction if the receiver has that property or condition.

```jsonc
[
  {
    "stimulus": "fire",
    "property": "flammable",
    "unless": "wet",
    "effects": [{ "type": "add_condition", "on": "self", "condition": "burning" }],
  },
  {
    "stimulus": "fire",
    "condition": "wet",
    "effects": [{ "type": "remove_condition", "on": "self", "condition": "wet" }],
  },
  {
    "stimulus": "impact",
    "property": "fragile",
    "condition": "burning",
    "effects": [{ "type": "emit", "on": "nearby", "radius": 1, "stimulus": "fire" }],
  },
  {
    "stimulus": "impact",
    "property": "fragile",
    "effects": [
      { "type": "transform", "on": "self", "into": "shards" },
      { "type": "make_sound", "loudness": 10 },
    ],
  },
  {
    "stimulus": "water",
    "condition": "burning",
    "effects": [{ "type": "remove_condition", "on": "self", "condition": "burning" }],
  },
  {
    "stimulus": "cut",
    "property": "flesh",
    "effects": [{ "type": "add_condition", "on": "self", "condition": "bleeding", "chance": 0.4 }],
  },
]
```

- Reactions can trigger reactions (fire spreads, a burning shelf drops a jar...). A chain stops at
  `reactions.maxDepth` (config), and the cap being hit is logged.
- When one stimulus matches several reactions, they all run in file order, each checking `unless`
  against the receiver as it was when the stimulus arrived.
- Fire spreads only between entities and agents, never across floor tiles or grass. Tiles have no
  properties, so a fire with nothing flammable nearby burns out.
- Each reaction that changes something visible makes a world event, so agents perceive it and
  remember it.
- A reaction with a `damage` effect on `self` needs a `killed` phrase, like a verb.

## Status: health, stats, conditions

### Health

- `Agent.health`, 0–1, starts at 1 and isn't seeded. It isn't a need: needs keep their own decay
  loop, and health changes only through damage, conditions, starvation and healing.
- **Starvation:** `Agent.starvingSinceTick` is set when hunger reaches 0 and cleared when it rises.
  After `health.starvationGraceHours` (default 12) of it, health drains `health.starvationDrainPerHour`
  (default 0.1). An agent who starts the day fed and never eats dies after about two days.
- **Regeneration:** `health.regenPerHourAwake` (0.01) and `health.regenPerHourAsleep` (0.04), only
  while hunger is above `health.regenHungerThreshold` (0.4). Healing items add on top.
- **Prompt words:** "unhurt", "a little worse for wear", "in poor shape", "in a bad way", "near
  death", in config like need words. Never numbers. They don't name the cause (a blow, fire,
  hunger); once starvation is draining health, the starving sentence says so
  (`health.starvationHarmText`).
- **Decisions:** health crossing a value in `health.decisionThresholds` (default `[0.5, 0.25]`) gives
  a decision, like a need crossing its threshold. Being attacked (hit or miss) always gives the
  target a decision. Any damage wakes a sleeper. A sleeper doesn't perceive the attack itself, only
  that they were hurt ("I woke up in pain, bleeding"). Once awake, they see whoever is there with
  normal sight, and their LLM decides what happened.

### Stats

`strength` and `agility` live in `Agent.body`, 0–1 (0.5 is average), set per character in
`seeds/agents.json` and the character editor (new characters get `config.seeds.newAgent` values of
0.5). They reach the agent's own prompt as words ("quite strong, clumsy") so it knows its body.
Other agents never see them, not even as words like "burly": they find out by watching fights and
remembering them.

### Combat

A verb with `hitRoll` rolls before its effects, with the seeded generator:

```
hitChance = clamp(baseHitChance + (attacker.agility - defender.agility) * combat.agilitySpread,
                  combat.minHitChance, combat.maxHitChance)
```

- Defaults: `agilitySpread` 0.5, `minHitChance` 0.1, `maxHitChance` 0.95.
- An asleep target, or an entity, is always hit, so `attack` can break a door or smash a jar. Dead
  agents can't be attacked. Dodging comes only from agility; there is no dodge or guard action.
- `scaledByStrength` damage is multiplied by `1 + (attacker.strength - 0.5) * combat.strengthSpread`
  (default spread 0.6, so 0.7× to 1.3×), after rolling within `{min, max}`.
- **Throwing at an agent** uses the `throw` verb's hit roll (base 0.6). On a hit the target takes
  0.02–0.05 damage per kilogram of the item's `weight` (scaled by strength, stimulus `impact`), and
  the item lands on its tile. On a miss it lands on a random tile next to the target. Either way
  the item receives `impact` where it lands.
- Starting numbers: punch 0.05–0.12 at base 0.8, costing the puncher 0.01 energy; the knife's
  `weapon` component 0.2–0.4 at 0.7, plus a 40% chance of bleeding. A healthy agent survives two or
  three knife hits and many punches.
- Each swing is one decision. A fight is a run of decisions, so it costs LLM calls and moves at the
  speed replies arrive.
- A miss is still an event ("swung a knife at Tobias and missed") that everyone in sight perceives.

### Conditions on agents

Shown in the prompt next to needs ("Body and spirits: hurt and bleeding, quite hungry, rested").
Visible conditions on others show in "Around you" ("Tobias, bleeding").

Others' health shows there too, as words, once it drops below `health.visibleToOthersBelow`
(default 0.9): "Tobias, looks in a bad way, bleeding". The observer words ("looks a little worse
for wear", "looks in poor shape", "looks in a bad way", "looks near death") are in config beside the agent's own
health words. Seeing it never gives a decision by itself.

### UI: the "Needs" section becomes "Status"

Health bar first (red as it drops), then the four need bars, then condition chips (`bleeding 12m`,
`burning`). Dead agents show "Died day 3, 14:20: stabbed by Tobias" in place of the bars.

## Death

At health 0 the agent dies, the moment the damage lands (a death in the middle of a tick is
settled before the next agent acts).

- A `died` event, seen by everyone in sight. It makes no sound of its own: what others hear is
  the attack's loudness, or whatever the dying agent chose to shout.
- `Agent.death = { tick, cause }`. The cause is the `killed` phrase of whatever did the last
  damage (a verb, condition or reaction), with the source agent when there is one ("stabbed by
  Tobias", "bled to death after being hurt by Tobias"). Starvation's phrase ("starved") is in
  config. It's for the viewer; agents learn the cause only from what they witnessed.
- The agent's current action stops: a verb in progress is cancelled and they leave the object's
  users (the card table).
- A decision still in flight for them is dropped when it arrives, as replies for a replaced world
  are now.
- From then on: no decisions, no need decay, no regeneration, no reflections, no forgetting. Their
  memories stay readable in the viewer.
- The dead agent stays on their tile, keeping their inventory (coins included), so the coin supply
  stays closed. Others see "Mara's body", which doesn't block movement, and their awareness of
  Mara records her as lying dead. Anyone in reach can `take` from it. A dead agent still has the
  `person` properties, so a body can burn.
- Witnesses get a `seen` memory of the death; the killer gets a `did` memory. Everyone else learns
  by finding the body or being told. No code makes anyone grieve or suspect.
- A `died` moment goes to the viewer's highlights. The client draws the marker lying down and greyed
  out, and the roster shows them as dead.
- Permanent. `make reset` brings everyone back.

## Decisions and prompts

The reply stays flat. The `interact` action keeps its name; its `interaction` field becomes `verb`:

| Intent               | Reply                                                                            |
| -------------------- | -------------------------------------------------------------------------------- |
| Bake at the oven     | `interact`, `target: "oven"`, `verb: "bake bread"`                               |
| Eat bread            | `interact`, `item: "bread"`, `verb: "eat"`                                       |
| Stab Tobias          | `interact`, `item: "knife"`, `target: "Tobias"`, `verb: "attack"`                |
| Punch Tobias         | `interact`, `target: "Tobias"`, `verb: "punch"`                                  |
| Bandage yourself     | `interact`, `item: "bandage"`, `target: "yourself"`, `verb: "use"`               |
| Throw the jar at him | `interact`, `item: "jar"`, `target: "Tobias"`, `verb: "throw"`                   |
| Drop 2 bread         | `interact`, `item: "bread"`, `verb: "drop"`, `amount: 2`                         |
| Take Mara's coins    | `interact`, `target: "Mara's body"`, `verb: "take"`, `item: "coin"`, `amount: 5` |

- How the reply names the verb's things:
  - The thing being **used** is `item` when it's held (the knife, the bread) and `target` when it
    isn't (the oven, the chest, the body, a ground item to pick up). An `isUser` verb has none.
  - What it's **aimed** at is `target`. So a verb with a target other than `none` must have a rule
    that requires `location: held` or `isUser`; validation checks it.
  - The thing **chosen** to move by `put` and `take` is `item`.
- `item` becomes an enum of held items and the contents of containers and bodies within reach, as
  `target` already is an enum. `target` gains ground items, bodies, `yourself`, and held items
  (for a verb aimed at something you carry). Both use
  definition names ("coin", "bread"), and `amount` says how many.
- A target out of reach makes the agent walk there first, as `interact` does now. A moving target
  is followed for up to `combat.chaseTicks`, then the act fails ("Tobias got away").
- Replies arrive in the background, a few ticks after they were asked for. So everything is checked
  again when the reply is applied: the target is still alive, in sight, and the item still
  held. If not, it fails with a reason ("Tobias was already gone").
- **Belongings** list verbs inline, so most acts need no second call: "You carry: 3 bread (eat,
  throw), a knife (attack, throw)". **Here** lists objects with their verbs the same way. The
  second interact call stays for objects with many verbs or missing details.
- **Verbs that need no item** (`isUser`, like `punch`) are listed in every decision prompt, after
  belongings ("You can also: punch someone"). Which verbs get listed is one choice in the prompt
  builder, so it's easy to change later.
- **Here** and **Around you** show items on the ground, visible conditions and visible carried
  items ("Tobias, carrying a knife", "a broken jar on the floor", "the door (on fire)"). A carried
  item is visible to others only if its definition sets `isVisibleWhenCarried` (a knife yes, coins
  no).
- Prompts present verbs plainly. They don't encourage or discourage violence.
- Reflection prompts (morning, night, weekly) get the same status words, so an agent reflects on
  being hurt.

## Perception, events and memory

- Sight sees entities on tiles as it sees objects now. What a dead agent holds, and what is inside
  a container, is visible only to an agent within `take` reach, who sees it listed under Here.
- New `WorldEventKind`s: `attacked`, `missed`, `hurt`, `died`, `dropped`, `picked_up`, `threw`,
  `put`, `took`, `broke`, `caught_fire`, `stopped_burning`, `condition_started`, `condition_ended`.
  Each is filed through the existing `broadcast(event)` path. Fast repeats (a fire burning for 30 minutes)
  file one memory when it starts and one when it ends, as actions do now.
- Witnessing an attack or a death gives a decision and skips the interrupt cooldown.
- Definition names join the known names used for memory tags, and the recall cue's "nearby
  objects" becomes nearby entities, including items on the ground.
- When two agents act on the same thing in the same tick (both grab the knife), they're applied in
  agent order and the second fails ("Someone got to it first").

## Tick order

The new systems slot into the brief's tick order:

1. **Mechanics:** as now, plus condition `everyMinute` effects, starvation, regeneration, and
   conditions that run out. Reactions resolve as their stimuli arrive.
2. **Actions progress:** as now; verbs finishing run their `finish` effects and reactions.
3. **Sight**, 4. **Needs and health thresholds**, 5. **Decisions** (applied in agent order; an act
   by an agent who died earlier in the order is dropped), 6. **Upkeep**: as now, skipping the dead.

Deaths are settled the moment damage lands, in whichever step that is.

## Client

- The snapshot and its deltas carry entities instead of `objects`, with an `entities_changed`
  message for anything that moves, breaks or changes state.
- **Placeables are drawn from their entity's glyph, not baked into the map.** The map generator
  stops drawing objects into the decor layer, so a burned or broken object visibly changes or
  disappears. Ground items are drawn the same way.
- Visible conditions get an overlay on agents and entities (flames for `burning`).
- The event and story feeds get phrasing for the new event kinds, the inspector gets the Status
  section, and the hover card shows visible conditions.

## Persistence

- A new `entities` table (`id`, `definition_id`, `location` json, `state` json). The agent row
  loses `inventory` and `coins` and gains `health`, `starvingSinceTick`, `conditions` and `death`.
  Stats join `body`.
- Saved sims from before this change can't load; the server says to run `make reset`.

## Seeds and the character editor

- `seeds/agents.json` gains `strength` and `agility` per agent, with the range checked like trait
  values. Its `coins` field becomes `coin` entries in `inventory`, and `economy.startingCoins`
  moves into the new-character inventory in config.
- The character editor gets two sliders for them, and its inventory picker lists the carriable
  definitions from `items.json`. Starting inventories stay in the character editor.
- Reseed fixtures in tests gain the new fields.

## Item editor

A new page, `client/items.html`, built like the character editor and saving `seeds/items.json`
through the same atomic write and validation path. Changes apply on the next server start or
`make reset`.

```
┌ Items ───────┬───────────────────────────────────────────────────────────┐
│ ▸ knife      │ Name [knife]  Plural [knives]   Form (●carriable ○placeable)│
│   bread      │ Glyph [/ 47 ■ color □ bg ▸ sheet]   ☑ visible when carried │
│   oven       │ Properties  [sharp ×] [metal ×] [+ add]                     │
│   door       │ Components  durability  toughness [4]                       │
│              │             weapon  damage [0.20–0.40] hit [0.70] cut       │
│              │             weight  kilograms [0.3]          [+ add]        │
│ Verbs        │ Verbs that apply to it                                      │
│ Conditions   │  ▾ attack   applies to [weapon, held]  target [agent/thing▾]│
│ Reactions    │    reach [1] minutes [1] loud [6]  hit [from weapon.hit]    │
│ Properties   │    Effects (drag to reorder)                                │
│              │     1 damage  on [target▾] [from weapon.damage] ☑ strength  │
│ [+ new item] │     2 wear    on [item▾]   0.02                             │
│              │    [+ effect ▾]                                             │
│              │  ▸ throw    applies to [carriable, weight, held]            │
│              │  [+ verb]                                                   │
│              │ ── How agents see it ────────────────────────────────────── │
│              │ "a knife (attack, throw)"                                   │
│              │ Problems: none                                [Save]        │
└──────────────┴───────────────────────────────────────────────────────────┘
```

- Tabs for **Items**, **Verbs**, **Components**, **Conditions**, **Reactions** and **Properties**
  (with descriptions and "where used"). The Components tab declares components and their fields;
  engine components show their fields locked.
- Any number in a verb can be switched from a literal to "from a component", which offers only the
  fields of components the verb's rule guarantees.
- An item's page lists every verb whose rule matches it, worked out live. Editing one there edits
  the verb itself, so the page warns when the rule matches other items too ("also applies to 4
  other items").
- "+ verb" on an item's page creates a verb with `appliesTo` set to that definition (and
  `location: held` for carriables). The rule can be widened later in the Verbs tab.
- The Verbs tab has an `appliesTo` rule builder with a live list of what each rule matches.
- Effect rows show only the fields that effect type takes; `chance`, `when` and `requiresHit` sit
  behind a "more" toggle.
- Stimulus fields offer every stimulus already used in the file, or a new name.
- Live validation: unknown conditions or items in effects, an aimed verb whose rule doesn't
  require `location: held` or `isUser`, reactions on properties nothing has, `appliesTo` rules
  that match nothing or match living agents, two same-named verbs matching the same thing, a verb
  reading a component its rule doesn't guarantee, `on: item` in an `isUser` verb, a carriable
  without `weight`, a `start` effect that requires a hit, a missing `killed` phrase, and a
  definition still used by the map or seeds being deleted.
- A preview line shows how the item appears in a prompt.
- The item editor only defines items. It never places objects on the map (that stays in Tiled and
  the map generator) and never sets anyone's inventory.

## Fake LLM and soak runs

- The fake responder picks verbs from what's valid, like other actions, and fills `item`, `target`
  and `amount` for them.
- Verbs with a `hitRoll` get a low weight in the fake responder (`fakeLlm.attackWeight` in
  config), so soak runs exercise combat without wiping out the village in an hour.
- The soak run reports deaths, and fails on any thrown error or a reaction chain hitting the depth
  cap.

## Tests

Unit tests cover the code-driven core, named by behavior:

- starvation drain after the grace period, regeneration, and health threshold decisions
- hit chance from agility, the clamp, always hitting sleepers, and damage scaling by strength
- each effect type, effect modifiers (`on`, `chance`, `when`, `requiresHit`), and `tools`
- conditions running per minute, extending rather than stacking, and ending
- reactions, `unless`, ordering, chains, the depth cap, and the source agent carried along a chain
- death: the cause, cancelled actions, dropped in-flight decisions, and taking from a body
- numbers read from components (`from`, `times`) and rejecting reads a rule doesn't guarantee
- `appliesTo` matching each term, `anyOf`/`allOf`/`not`, rejecting overlapping same-named verbs,
  and rejecting rules that match living agents
- `take` and `put` with containers, coins moving as items, the closed-supply warning, and refusing
  to take from a living agent
- grouping entities in prompts, `give` choosing the oldest, and two agents grabbing the same item
- `items.json` validation and the server refusing bad references

## Build order

Each phase ends with `make check` and `make test` passing and its own commits. No phase has to
preserve existing behavior exactly: changing it is fine when it keeps the spirit of the project and
the core sim recognizable, and existing tests that pin old behavior are rewritten or removed.

1. **Status:** health, stats (seeds and character editor), starvation, regen, health words, the
   Status panel, death (the dead agent lying where they fell; no `take` yet).
2. **Entities:** `items.json` and its schema, the entity store, placeables drawn from entities,
   "interaction" renamed to "verb", `AGENTS.md` and `BRIEF.md` updated. Every current interaction
   is ported to a verb with an `appliesTo` rule (bread and ale get `food` and `drink` components),
   so this phase also builds the verb runner, component declarations, and the effects those need
   (`produce`, `destroy`, `take_stock`, `change_need`, `set_open`, `sleep`, `read_notes`,
   `post_note`). Coins become `coin` entities and `give` moves entities. Every carriable gets a
   `weight`. Behavior may change where the new model makes it simpler or better, as long as the
   sim stays recognizable and keeps the project's spirit; tests that pin old behavior are updated
   or replaced rather than kept by contorting the design.
3. **Targets and combat:** verb targets, reach, `tools`, hit rolls, strength scaling, `damage`,
   `heal`, `wear`, `transform`, breaking (`onBroken`), numbers read from components. Content:
   `weapon` and `healing` components, knife, `attack`, `punch`, bandage.
4. **Ground items:** `drop`, `pick up`, `throw`, `take` from bodies, containers with `put` and
   `take`, ground items in perception and on the map.
5. **Conditions and reactions:** bleeding, burning, wet, poisoned, fragile breaking, fire spread,
   depth cap, condition overlays.
6. **Item editor.**

## Decisions

1. "Interaction" is renamed to "verb" everywhere, including the reply field.
2. Per-item content moves from `config.ts` to `seeds/items.json`; config keeps global tunables.
3. Fire spreads between entities only, not across tiles.
4. Agents can't see each other's strength or agility; they learn it by watching.
5. Carried items are visible to others only with `isVisibleWhenCarried`.
6. The item editor doesn't place objects on the map; the character editor sets starting
   inventories.
7. No kill switch for violence.
8. Dodging comes only from the hit roll; there is no active dodge or guard stance.
9. An attack on a sleeping target always hits.
10. Verbs that need no item, like `punch`, are listed in every decision prompt.
11. Nobody can take from a living agent; `take` works only on containers and dead agents.
12. Others see an agent's health as words once it drops below a threshold.
13. No damage resistance by property and no armor; only `toughness` reduces damage.
14. Bodies stay where they fell for good; no carrying, burying or decay for now.
15. Which items exist beyond the examples, and where knives, bandages and the like come from, is
    left to the user's own item design.
16. There is one kind of verb: each is defined once with an `appliesTo` rule. Verbs don't belong
    to definitions or components.
17. A verb's numbers can be literals or read from components of the thing being used, so one verb
    serves many items. A verb can read only components its rule guarantees.
18. Components are declared in `items.json`. Some are also read by engine code; the rest are read
    only by verbs and need no code.
19. Coins are items (`coin` entities), not a number on the agent.
20. A sleeping victim perceives only being hurt, not who hurt them; sight after waking does the
    rest.
21. `attack` can target entities as well as agents, so weapons can break doors and smash jars.
22. People are `flammable` and can catch fire from burning things next to them.
23. Every carriable has a `weight` component, so anything held can be thrown.
