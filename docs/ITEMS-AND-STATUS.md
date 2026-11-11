# Items, verbs and status: design

Status: **agreed design**. Nothing here is built yet. Decisions taken in review are listed at the
end, with the questions still open.

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

| Term            | Meaning                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------- |
| item definition | A template in `seeds/items.json`: name, form, properties, components, verbs                    |
| entity          | One instance of a definition in the world, with its own id, location and state                 |
| form            | `placeable` (sits on a tile, like an oven) or `carriable` (fits in an inventory, like a knife) |
| property        | A plain tag on a definition (`flammable`, `fragile`, `sharp`). Reactions match on these        |
| component       | A structured part with fields (`durability`, `stock`, `openable`)                              |
| verb            | Something an agent can do with or to something (`attack`, `eat`, `bake bread`, `throw`)        |
| effect          | One step a verb, condition or reaction performs (`damage`, `heal`, `emit`, `produce`)          |
| stimulus        | A named physical cause sent by an effect (`fire`, `water`, `impact`, `cut`)                    |
| reaction        | A rule: when a stimulus reaches something with a property or condition, run effects            |
| condition       | A timed state on an agent or entity (`burning`, `bleeding`, `wet`), with per-minute effects    |
| health          | 0–1, 1 = unhurt. At 0 the agent dies                                                           |
| durability      | An entity's 0–1 condition, 1 = intact, on the same scale as health. At 0 it breaks             |
| stats           | `strength` and `agility`, 0–1, set per character in the seeds                                  |
| status          | The UI section showing health, needs and conditions together (was "Needs")                     |

"Interaction" becomes "verb" everywhere: config, code, prompts, and the reply's `interaction`
field, which becomes `verb`. That keeps one name for one concept now that verbs exist on items,
objects and agents.

A dead agent's remains are just the dead agent (see Death). There is no separate corpse entity,
and prompts call it "Mara's body". `Agent.body` keeps its current meaning: the agent's physical
record, which now holds the stats too.

## Data model

### Where things live

- `seeds/items.json`: item definitions, properties, conditions and reactions. This is **content**,
  like `seeds/agents.json`, and the item editor edits it. Validated by a zod schema in `shared/`.
- `server/src/config.ts`: global tunables only (health regen, starvation timing, hit-chance
  spread, strength scaling, default thrown damage, reaction depth cap, reach, health words).
- `AGENTS.md` and `BRIEF.md` are updated to say so: global tunables stay in config, and item
  content lives in `items.json`.

The server refuses to start, naming the problem, if `items.json` has errors, if a map object names
a definition that doesn't exist or isn't placeable, or if a seed inventory names an unknown or
non-carriable definition.

### Item definition

```jsonc
{
  "id": "knife",
  "name": "knife",
  "plural": "knives",
  "form": "carriable",
  "sprite": { "tileset": "village", "tile": 412 },
  "isVisibleWhenCarried": true,
  "properties": ["sharp", "metal"],
  "components": {
    "durability": { "toughness": 4 },
  },
  "thrownDamage": { "min": 0.05, "max": 0.15 },
  "onBroken": [{ "type": "transform", "on": "self", "into": "broken knife" }],
  "verbs": [
    {
      "name": "attack",
      "target": "agent",
      "reach": 1,
      "minutes": 1,
      "loudness": 6,
      "hitRoll": { "baseHitChance": 0.7 },
      "effects": [
        {
          "type": "damage",
          "on": "target",
          "amount": { "min": 0.2, "max": 0.4 },
          "stimulus": "cut",
          "scaledByStrength": true,
        },
        { "type": "wear", "on": "item", "amount": 0.02, "requiresHit": false },
      ],
      "phrases": {
        "ongoing": "attacking {target} with a knife",
        "hit": "stabbed {target}",
        "missed": "swung a knife at {target} and missed",
        "killed": "stabbed by {actor}",
        "attempt": "stab {target}",
      },
    },
  ],
}
```

- `thrownDamage` is optional; without it a thrown item uses `combat.defaultThrownDamage`.
- `onBroken` runs when durability reaches 0. Without it the entity is destroyed.

### Entity (instance)

```ts
interface Entity {
  id: string; // from a counter in the world state, so runs reproduce
  definitionId: string;
  location:
    | { kind: "inventory"; agentId: string } // carried, by a living or dead agent
    | { kind: "tile"; place: string; pos: Position }; // placed objects and items on the ground
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
  sourceAgentId: string | null; // who caused it, for death causes ("bled to death after...")
}
```

- Inventories stop being `Record<string, number>`. An agent's inventory is every entity whose
  location is that agent. Prompts and the UI still group identical, stateless entities, so the
  agent sees "3 bread, a knife (worn), a burning torch".
- **Coins stay a number** on the agent. They're a closed currency, not things with state, so
  `give` and `take` handle them as they do now.
- `WorldObject` and `ObjectKind` go away. Tiled objects name a definition id instead of a kind and
  load as `tile` entities. Doors, beds, ovens, the wheat field, trees, the card table and the notice
  board become definitions.
- `give 2 bread` hands over two matching entities, oldest first.
- Placeables can't be picked up. There is no inventory limit, as today.

### Components (code-defined containers, data-filled)

| Component    | Fields                                                    | Used for                                                    |
| ------------ | --------------------------------------------------------- | ----------------------------------------------------------- |
| `durability` | `toughness`                                               | Damage and wear are divided by `toughness`; 1 = as a person |
| `stock`      | `capacity`, `regrowPerDay`                                | Wheat field, trees                                          |
| `openable`   | `startsOpen`, `blocksSightWhenClosed`, `muffleWhenClosed` | Doors. A destroyed door counts as open for sight and sound  |
| `blocking`   | `blocksMovement`, `blocksSight`                           | Placeables that are in the way                              |
| `notes`      | `maxNotes`                                                | Notice board                                                |
| `bed`        | —                                                         | Something you can `sleep` in                                |

An entity without `durability` can't be damaged (the wheat field). Adding a component type is a
code change (it needs an implementation). Using one is data.

### Properties

Properties are free tags defined in `items.json`, each with a description and an optional prompt
word (a `fragile` jar shows as "a fragile jar" only if the property has `isVisible: true`). Code
never checks a property by name; only reactions do. So adding `cursed` or `slippery` is pure data,
and it does nothing until a reaction mentions it.

Agents have properties too, from a built-in `person` definition (`flesh`, `flammable`), which also
holds the innate verbs.

## Verbs

A verb lives on a definition. Where it can be used depends on where it lives:

- on a **carriable** item: used while held, anywhere (eat bread, attack with a knife)
- on a **placeable** object: used next to it (bake bread at the oven, open the door)
- on the **person** definition: innate, needs no item (`punch`)
- **built in**, for everything of a kind: every carriable gets `drop`, `pick up` and `throw`; every
  agent (living or dead) can be the target of `take` from its inventory; every `openable` gets
  `open` and `close`.

| Verb field      | Meaning                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------- |
| `name`          | What the agent says it does                                                                 |
| `target`        | `none` (just the item or object itself), `agent`, `entity`, `agent_or_entity`, `tile`       |
| `canTargetSelf` | Whether `agent` targets include the user ("bandage yourself"); default `false`              |
| `reach`         | Tiles between user and target (1 for melee, 6 for throw). The target must also be in sight  |
| `minutes`       | Duration; `null` means it ends by its own rules (sleep)                                     |
| `loudness`      | Sound reach while it runs; `null` if silent                                                 |
| `takesText`     | Whether it uses the decision's `text` (post a note)                                         |
| `inputs`        | Items used up when it starts (`{ "wheat": 2, "wood": 1 }`)                                  |
| `requires`      | Held but not used up: definition ids or properties (`{ "properties": ["sharp"] }` to carve) |
| `hitRoll`       | Present on attacks; see Combat                                                              |
| `effects`       | The ordered list of effects to run                                                          |
| `phrases`       | `ongoing`, `done`, `attempt`, and for attacks `hit`, `missed` and `killed` templates        |

### Effects

Effect types are code (each needs an implementation); which effects a verb has, their order and
numbers are data. Every effect takes these **modifiers**, which is where the Noita-style combining
comes from:

- `on`: who or what the effect applies to:
  - `target`: what the verb was aimed at
  - `user`: the agent doing it
  - `item`: the entity the verb lives on (the held knife, the oven). Nothing for innate verbs
  - `self`: whatever carries the condition or reaction running the effect
  - `nearby`: every agent and entity within `radius` of the target, or of `self` in a condition
- `chance`: 0–1, rolled with the seeded generator
- `when`: `start` or `finish` (default `finish`)
- `requiresHit`: only if the verb's hit roll succeeded (default `true` on verbs with `hitRoll`)

| Effect                             | Parameters                                         | Does                                                                      |
| ---------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------- |
| `damage`                           | `amount {min,max}`, `stimulus`, `scaledByStrength` | Lowers health, or durability ÷ toughness, then sends `stimulus`           |
| `heal`                             | `amount`                                           | Raises health                                                             |
| `change_need`                      | `need`, `amount`, `perOtherUser?`                  | Hunger, energy, social, fun (the card-table bonus becomes `perOtherUser`) |
| `emit`                             | `stimulus`                                         | Sends a stimulus without damage (`water`, `fire`)                         |
| `add_condition`                    | `condition`, `minutes?`                            | Starts a condition                                                        |
| `remove_condition`                 | `condition`                                        | Ends a condition                                                          |
| `produce`                          | `item`, `count`, `into` (`user` or `ground`)       | Creates entities (bake → 4 bread)                                         |
| `consume`                          | —                                                  | Uses up the entity (eating the bread)                                     |
| `wear`                             | `amount`                                           | Lowers durability ÷ toughness, with no stimulus                           |
| `transform`                        | `into`                                             | Replaces the entity with another definition, keeping its location         |
| `destroy`                          | —                                                  | Removes the entity                                                        |
| `take_stock`                       | `amount`                                           | Takes from a `stock` component                                            |
| `set_open`                         | `isOpen`                                           | Doors                                                                     |
| `move`                             | `to` (`ground`, `user`, `target_tile`)             | Drop, pick up, throw. A thrown item sends `impact` where it lands         |
| `make_sound`                       | `loudness`                                         | A one-off sound (a crash, a creak of hinges)                              |
| `sleep`, `read_notes`, `post_note` | —                                                  | Wrap the existing special mechanics                                       |

All amounts are on the 0–1 health scale, so the same knife numbers work on a person and a door
(a door with toughness 5 takes a fifth of the damage).

Example combinations that need no new code:

- **Poisoned bread:** `eat` with `change_need hunger +0.5` then `add_condition poisoned` (chance 0.5).
- **Molotov:** a fragile, flammable bottle with condition `burning`. Thrown, it sends `impact` →
  `fragile` breaks it → the `burning` condition's `onEnd` effect sends `fire` to `nearby` radius 1.
- **Lantern:** `light` verb with `emit fire` on `target`, reach 1.
- **Bandage:** `use` with `heal 0.15` and `remove_condition bleeding` on `target`, target `agent`,
  `canTargetSelf: true`, reach 1, then `consume` on `item`.
- **Carving:** `carve` on wood with `requires: { properties: ["sharp"] }` and `produce` a spoon.

### Conditions

Defined in `items.json`; can sit on agents or entities.

```jsonc
{
  "name": "burning",
  "words": "on fire",
  "isVisible": true,
  "defaultMinutes": 30,
  "everyMinute": [
    { "type": "damage", "on": "self", "amount": { "min": 0.01, "max": 0.01 }, "stimulus": "fire" },
    { "type": "emit", "on": "nearby", "radius": 1, "stimulus": "fire", "chance": 0.05 },
  ],
  "onEnd": [],
}
```

- `everyMinute` effects run once per sim-minute, so they don't change if `minutesPerTick` does.
- `defaultMinutes: null` lasts until something removes it (poison until cured).
- Adding a condition that's already there extends it to the later end; it doesn't stack.
- A condition remembers who caused it, so bleeding out names the attacker.

Starting conditions:

| Condition  | Lasts       | Does                                                          |
| ---------- | ----------- | ------------------------------------------------------------- |
| `bleeding` | 20 min      | Health −0.01 per minute. A bandage ends it                    |
| `burning`  | 30 min      | Damage with stimulus `fire` each minute; may spread to nearby |
| `wet`      | 60 min      | Nothing by itself; reactions stop wet things catching fire    |
| `poisoned` | until cured | Health −0.003 per minute                                      |

### Reactions

A global table: when a stimulus reaches something with a property (or condition), run effects.
`unless` skips the reaction if the receiver has that property or condition.

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

## Status: health, stats, conditions

### Health

- `Agent.health`, 0–1, starts at 1 and isn't seeded. It isn't a need: needs keep their own decay
  loop, and health changes only through damage, conditions, starvation and healing.
- **Starvation:** `Agent.starvingSinceTick` is set when hunger reaches 0 and cleared when it rises.
  After `health.starvationGraceHours` (default 12) of it, health drains `health.starvationDrainPerHour`
  (default 0.1). An agent who starts the day fed and never eats dies after about two days.
- **Regeneration:** `health.regenPerHourAwake` (0.01) and `health.regenPerHourAsleep` (0.04), only
  while hunger is above `health.regenHungerThreshold` (0.4). Healing items add on top.
- **Prompt words:** "unhurt", "bruised", "hurt", "badly wounded", "near death", in config like need
  words. Never numbers.
- **Decisions:** health crossing a value in `health.decisionThresholds` (default `[0.5, 0.25]`) gives
  a decision, like a need crossing its threshold. Being attacked (hit or miss) always gives the
  target a decision. Any damage wakes a sleeper.

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
- An asleep or dead target, or an entity, is always hit. Dodging comes only from agility; there is
  no dodge or guard action.
- `scaledByStrength` damage is multiplied by `1 + (attacker.strength - 0.5) * combat.strengthSpread`
  (default spread 0.6, so 0.7× to 1.3×), after rolling within `{min, max}`.
- **Throwing at an agent** uses a hit roll with `combat.throwBaseHitChance` (0.6). On a hit the
  target takes `thrownDamage` (scaled by strength, stimulus `impact`) and the item lands on its
  tile. On a miss it lands on a random tile next to the target. Either way the item receives
  `impact` where it lands.
- Starting numbers: punch 0.05–0.12 at base 0.8, costing the puncher 0.01 energy; knife 0.2–0.4 at
  base 0.7, plus a 40% chance of bleeding. A healthy agent survives two or three knife hits and many
  punches.
- Each swing is one decision. A fight is a run of decisions, so it costs LLM calls and moves at the
  speed replies arrive.
- A miss is still an event ("swung a knife at Tobias and missed") that everyone in sight perceives.

### Conditions on agents

Shown in the prompt next to needs ("Body and spirits: hurt and bleeding, quite hungry, rested").
Visible conditions on others show in "Around you" ("Tobias, bleeding").

### UI: the "Needs" section becomes "Status"

Health bar first (red as it drops), then the four need bars, then condition chips (`bleeding 12m`,
`burning`). Dead agents show "Died day 3, 14:20: stabbed by Tobias" in place of the bars.

## Death

At health 0 the agent dies, the moment the damage lands (a death in the middle of a tick is
settled before the next agent acts).

- A `died` event, seen by everyone in sight and heard nearby at `health.deathLoudness`.
- `Agent.death = { tick, cause }`. The cause comes from the `killed` phrase of the last damage, or
  of the condition's source ("stabbed by Tobias", "bled to death after being stabbed by Tobias",
  "starved"). It's for the viewer; agents learn the cause only from what they witnessed.
- The agent's current action stops: an interaction is cancelled and they leave the object's users
  (the card table).
- A decision still in flight for them is dropped when it arrives, as replies for a replaced world
  are now.
- From then on: no decisions, no need decay, no regeneration, no reflections, no forgetting. Their
  memories stay readable in the viewer.
- The dead agent stays on their tile, keeping their inventory and coins, so the coin supply stays
  closed. Others see "Mara's body", which doesn't block movement. Anyone in reach can `take` from it.
  A dead agent still has the `person` properties, so a body can burn.
- Witnesses get a `seen` memory of the death; the killer gets a `did` memory. Everyone else learns
  by finding the body or being told. No code makes anyone grieve or suspect.
- A `died` moment goes to the viewer's highlights. The client draws the marker lying down and greyed
  out, and the roster shows them as dead.
- Permanent. `make reset` brings everyone back.

## Decisions and prompts

The reply stays flat. The `interact` action keeps its name; its `interaction` field becomes `verb`:

| Intent               | Reply                                                                             |
| -------------------- | --------------------------------------------------------------------------------- |
| Bake at the oven     | `interact`, `target: "oven"`, `verb: "bake bread"`                                |
| Eat bread            | `interact`, `item: "bread"`, `verb: "eat"`                                        |
| Stab Tobias          | `interact`, `item: "knife"`, `target: "Tobias"`, `verb: "attack"`                 |
| Punch Tobias         | `interact`, `target: "Tobias"`, `verb: "punch"`                                   |
| Bandage yourself     | `interact`, `item: "bandage"`, `target: "yourself"`, `verb: "use"`                |
| Throw the jar at him | `interact`, `item: "jar"`, `target: "Tobias"`, `verb: "throw"`                    |
| Drop 2 bread         | `interact`, `item: "bread"`, `verb: "drop"`, `amount: 2`                          |
| Take Mara's coins    | `interact`, `target: "Mara's body"`, `verb: "take"`, `item: "coins"`, `amount: 5` |

- `item` means "the thing in your hands for this act", as it already does for `give`, except for
  `take`, where it's the thing taken. It becomes an enum of held items plus `coins`, as `target`
  already is. `target` gains ground items, bodies and `yourself`.
- A target out of reach makes the agent walk there first, as `interact` does now. A moving target
  is followed for up to `combat.chaseTicks`, then the act fails ("Tobias got away").
- Replies arrive in the background, a few ticks after they were asked for. So everything is checked
  again when the reply is applied: the target is still alive (unless dead targets are allowed), in
  sight, the item still held. If not, it fails with a reason ("Tobias was already gone").
- **Belongings** list verbs inline, so most acts need no second call: "You carry: 3 bread (eat,
  throw), a knife (attack someone, throw)". The second interact call stays for objects with many
  verbs or missing details.
- **Here** and **Around you** show items on the ground, visible conditions and visible carried
  items ("Tobias, carrying a knife", "a broken jar on the floor", "the door (on fire)"). A carried
  item is visible to others only if its definition sets `isVisibleWhenCarried` (a knife yes, coins
  no).
- Prompts present verbs plainly. They don't encourage or discourage violence.
- Reflection prompts (morning, night, weekly) get the same status words, so an agent reflects on
  being hurt.

## Perception, events and memory

- Sight sees entities on tiles as it sees objects now. What a dead agent holds isn't visible.
- New `WorldEventKind`s: `attacked`, `missed`, `hurt`, `died`, `dropped`, `picked_up`, `threw`,
  `took`, `broke`, `caught_fire`, `stopped_burning`, `condition_started`, `condition_ended`. Each is
  filed through the existing `broadcast(event)` path. Fast repeats (a fire burning for 30 minutes)
  file one memory when it starts and one when it ends, as actions do now.
- Witnessing an attack or a death gives a decision and skips the interrupt cooldown.
- Definition names join the known names used for memory tags, and the recall cue's "nearby
  objects" becomes nearby entities, including items on the ground.
- When two agents act on the same thing in the same tick (both grab the knife), they're applied in
  agent order and the second fails ("Someone got to it first").

## Tick order

The new systems slot into the brief's tick order:

1. **Mechanics:** as now, plus condition `everyMinute` effects, starvation, regeneration, and
   conditions that run out. Reactions resolve as their stimuli arrive. Deaths are settled here.
2. **Actions progress:** as now; verbs finishing run their `finish` effects and reactions.
3. **Sight**, 4. **Needs and health thresholds**, 5. **Decisions** (applied in agent order; an act
   by an agent who died earlier in the order is dropped), 6. **Upkeep**: as now, skipping the dead.

## Client

- The snapshot and its deltas carry entities instead of `objects`, with an `entities_changed`
  message for anything that moves, breaks or changes state.
- **Placeables are drawn from their entity's sprite, not baked into the map.** The map generator
  stops drawing objects into the decor layer, so a burned or broken object visibly changes or
  disappears. Ground items are drawn the same way.
- Visible conditions get an overlay on agents and entities (flames for `burning`).
- The event and story feeds get phrasing for the new event kinds, the inspector gets the Status
  section, and the hover card shows visible conditions.

## Persistence

- A new `entities` table (`id`, `definition_id`, `location` json, `state` json). The agent row
  loses `inventory` and gains `health`, `starvingSinceTick`, `conditions` and `death`. Stats join
  `body`.
- Saved sims from before this change can't load; the server says to run `make reset`.

## Seeds and the character editor

- `seeds/agents.json` gains `strength` and `agility` per agent, with the range checked like trait
  values.
- The character editor gets two sliders for them, and its inventory picker lists the carriable
  definitions from `items.json`. Starting inventories stay in the character editor.
- Reseed fixtures in tests gain the new fields.

## Item editor

A new page, `client/items.html`, built like the character editor and saving `seeds/items.json`
through the same atomic write and validation path. Changes apply on `make reset`, like characters.

```
┌ Items ───────┬───────────────────────────────────────────────────────────┐
│ ▸ knife      │ Name [knife]  Plural [knives]   Form (●carriable ○placeable)│
│   bread      │ Sprite [▦ pick tile]   ☑ visible when carried              │
│   oven       │ Properties  [sharp ×] [metal ×] [+ add]                     │
│   door       │ Components  durability  toughness [4]       [+ add]         │
│ ──────────── │ Verbs                                                       │
│ Conditions   │  ▾ attack   target [agent ▾] reach [1] minutes [1] loud [6] │
│ Reactions    │    ☑ hit roll  base [0.70]                                  │
│ Properties   │    Effects (drag to reorder)                                │
│              │     1 damage  on [target▾] 0.20–0.40 cut ☑ strength         │
│ [+ new item] │     2 wear    on [item▾]   0.02                             │
│              │    [+ effect ▾]                                             │
│              │  [+ verb]                                                   │
│              │ ── How agents see it ────────────────────────────────────── │
│              │ "a knife (attack someone, throw)"                           │
│              │ Problems: none                                [Save]        │
└──────────────┴───────────────────────────────────────────────────────────┘
```

- Tabs for **Items**, **Conditions**, **Reactions** and **Properties** (with descriptions and
  "where used").
- Effect rows show only the fields that effect type takes; `chance`, `when` and `requiresHit` sit
  behind a "more" toggle.
- Stimulus fields offer every stimulus already used in the file, or a new name.
- Live validation: unknown conditions or items in effects, verbs whose target kind doesn't fit the
  form, reactions on properties nothing has, `on: item` in an innate verb, a definition still used
  by the map or seeds being deleted.
- A preview line shows how the item appears in a prompt.
- The item editor only defines items. It never places objects on the map (that stays in Tiled and
  the map generator) and never sets anyone's inventory.

## Fake LLM and soak runs

- The fake responder picks verbs from what's valid, like other actions, and fills `item`, `target`
  and `amount` for them.
- Attack verbs get a low weight in the fake responder (`fakeLlm.attackWeight` in config), so soak
  runs exercise combat without wiping out the village in an hour.
- The soak run reports deaths, and fails on any thrown error or a reaction chain hitting the depth
  cap.

## Tests

Unit tests cover the code-driven core, named by behavior:

- starvation drain after the grace period, regeneration, and health threshold decisions
- hit chance from agility, the clamp, always hitting sleepers, and damage scaling by strength
- each effect type, effect modifiers (`on`, `chance`, `when`, `requiresHit`), and `requires`
- conditions running per minute, extending rather than stacking, and ending
- reactions, `unless`, ordering, chains and the depth cap
- death: the cause, cancelled actions, dropped in-flight decisions, and taking from a body
- grouping entities in prompts, `give` choosing the oldest, and two agents grabbing the same item
- `items.json` validation and the server refusing bad references

## Build order

Each phase ends with `make check` and `make test` passing and its own commits.

1. **Status:** health, stats (seeds and character editor), starvation, regen, health words, the
   Status panel, death (the dead agent lying where they fell; no `take` yet).
2. **Entities:** `items.json` and its schema, the entity store, all current objects and items
   ported, placeables drawn from entities, "interaction" renamed to "verb", `AGENTS.md` and
   `BRIEF.md` updated. Behavior unchanged; existing tests prove it.
3. **Verbs and effects:** the effect runner, targets, reach, `requires`, hit rolls, strength
   scaling. Content: knife `attack`, `punch`, bandage.
4. **Ground items:** `drop`, `pick up`, `throw`, `take` from bodies, ground items in perception and
   on the map.
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

## Still open

- **Knife supply:** who starts with one, or how knives are made. To be decided before phase 3
  content.
