# Items, verbs and status: design

Status: **draft for review**. Nothing here is built yet. Open questions are collected at the end.

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
  others. Nothing in code makes an agent angry, afraid or vengeful. There is no aggression stat.
- Witnesses only perceive the event, and get a decision so they can react.

## Vocabulary

These join the glossary in `AGENTS.md`. One concept, one name.

| Term            | Meaning                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------- |
| item definition | A template in `seeds/items.json`: name, form, properties, components, verbs                    |
| entity          | One instance of a definition in the world, with its own id, location and state                 |
| form            | `placeable` (sits on a tile, like an oven) or `carriable` (fits in an inventory, like a knife) |
| property        | A plain tag on a definition (`flammable`, `fragile`, `sharp`). Reactions match on these        |
| component       | A structured part with fields (`durability`, `stock`, `openable`, `container`)                 |
| verb            | Something an agent can do with or to an entity (`attack`, `eat`, `bake bread`, `throw`)        |
| effect          | One step a verb, condition or reaction performs (`damage`, `heal`, `emit`, `produce`)          |
| stimulus        | A named physical cause sent by an effect (`fire`, `water`, `impact`, `cut`)                    |
| reaction        | A rule: when a stimulus reaches an entity with a property or condition, run effects            |
| condition       | A timed state on an agent or entity (`burning`, `bleeding`, `wet`), with per-tick effects      |
| health          | 0–1, 1 = unhurt. At 0 the agent dies                                                           |
| stats           | `strength` and `agility`, 0–1, set per character in the seeds                                  |
| status          | The UI section showing health, needs and conditions together (was "Needs")                     |
| body            | What a dead agent leaves: an entity on the tile, holding their inventory                       |

**Rename:** "interaction" becomes "verb" everywhere (config, code, prompts, the reply's
`interaction` field becomes `verb`). That keeps one name for one concept now that verbs exist on
items, objects and bodies. See open question 1.

## Data model

### Where things live

- `seeds/items.json`: item definitions, conditions and reactions. This is **content**, like
  `seeds/agents.json`, and the item editor edits it. Validated by a zod schema in `shared/`.
- `server/src/config.ts`: global tunables only (health regen, starvation timing, hit-chance spread,
  strength scaling, reaction depth cap, reach). Per-item numbers move out of config into
  `items.json`.

This changes the brief's "recipes live in config" rule, so `AGENTS.md` and `BRIEF.md` get updated
with it. See open question 2.

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
    "durability": { "max": 40 },
  },
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
        { "type": "wear", "on": "item", "amount": 1 },
      ],
    },
  ],
}
```

### Entity (instance)

```ts
interface Entity {
  id: string;
  definitionId: string;
  location:
    | { kind: "inventory"; agentId: string }
    | { kind: "tile"; place: string; pos: Position } // placed objects and items on the ground
    | { kind: "inside"; containerId: string }; // e.g. in a body
  state: {
    durability?: number;
    stock?: number;
    isOpen?: boolean;
    notes?: Note[];
    userIds?: string[];
    conditions: ActiveCondition[]; // { name, endsAtTick }
  };
}
```

- Inventories stop being `Record<string, number>`. An agent's inventory is every entity whose
  location is that agent. Prompts and the UI still group identical, stateless entities, so the
  agent sees "3 bread, a knife (worn), a burning torch".
- `WorldObject` and `ObjectKind` go away. Tiled objects name a definition id instead of a kind, and
  load as `tile` entities. Doors, beds, ovens and the notice board become definitions.
- `give 2 bread` hands over two matching entities, oldest first.

### Components (code-defined containers, data-filled)

| Component    | Fields                                                    | Used for                                                               |
| ------------ | --------------------------------------------------------- | ---------------------------------------------------------------------- |
| `durability` | `max`                                                     | Wear and breaking; at 0 the `on_broken` effects run (default: destroy) |
| `stock`      | `capacity`, `regrowPerDay`                                | Wheat field, trees                                                     |
| `openable`   | `startsOpen`, `blocksSightWhenClosed`, `muffleWhenClosed` | Doors                                                                  |
| `blocking`   | `blocksMovement`, `blocksSight`                           | Placeables that are in the way                                         |
| `container`  | `capacity`                                                | Bodies, later chests and baskets                                       |
| `notes`      | `maxNotes`                                                | Notice board                                                           |
| `bed`        | —                                                         | Marks something you can `sleep` in                                     |

Adding a component type is a code change (it needs an implementation). Using one is data.

### Properties

Properties are free tags defined in `items.json`, each with a description and optional prompt word
(a `fragile` jar shows as "a fragile jar" only if the property has `isVisible: true`). Code never
checks a property by name; only reactions do. So adding `cursed` or `slippery` is pure data, and it
does nothing until a reaction mentions it.

Agents have properties too, from a built-in `person` definition: `flesh`, `flammable`.

## Verbs

A verb lives on a definition. Where it can be used depends on the definition's form:

- on a **carriable** item: used while held, anywhere (eat bread, attack with a knife, throw a jar)
- on a **placeable** object: used next to it (bake bread at the oven, open the door)
- on the **person** definition: innate, needs no item (`punch`, later `shove`)
- on a **component**: shared by everything with it. Every carriable gets `drop`, `pick up` and
  `throw`; every `container` gets `take`; every `openable` gets `open` and `close`.

| Verb field  | Meaning                                                                               |
| ----------- | ------------------------------------------------------------------------------------- |
| `name`      | What the agent says it does                                                           |
| `target`    | `none` (just the item or object itself), `agent`, `entity`, `agent_or_entity`, `tile` |
| `reach`     | Tiles between user and target (1 for melee, 6 for throw)                              |
| `minutes`   | Duration; `null` means it ends by its own rules (sleep)                               |
| `loudness`  | Sound reach while it runs; `null` if silent                                           |
| `takesText` | Whether it uses the decision's `text` (post a note)                                   |
| `inputs`    | Items used up when it starts (`{ "wheat": 2, "wood": 1 }`)                            |
| `hitRoll`   | Present on attacks; see Combat                                                        |
| `effects`   | The ordered list of effects to run                                                    |
| `phrases`   | `ongoing`, `done`, `attempt` templates, as `interactionPhrases` today                 |

### Effects

Effect types are code (each needs an implementation); which effects a verb has, their order and
numbers are data. Every effect takes these **modifiers**, which is where the Noita-style combining
comes from:

- `on`: `target`, `user`, `item` (the thing used), `self` (whatever carries a condition or reaction), or `nearby` (everything within `radius`)
- `chance`: 0–1, rolled with the seeded generator
- `when`: `start` or `finish` (default `finish`)
- `requiresHit`: only if the verb's hit roll succeeded (default `true` on verbs with `hitRoll`)

| Effect                             | Parameters                                         | Does                                                                      |
| ---------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------- |
| `damage`                           | `amount {min,max}`, `stimulus`, `scaledByStrength` | Lowers an agent's health or an entity's durability, then sends `stimulus` |
| `heal`                             | `amount`                                           | Raises health                                                             |
| `change_need`                      | `need`, `amount`, `perOtherUser?`                  | Hunger, energy, social, fun (the card-table bonus becomes `perOtherUser`) |
| `emit`                             | `stimulus`                                         | Sends a stimulus without damage (`water`, `fire`)                         |
| `add_condition`                    | `condition`, `minutes?`                            | Starts a condition                                                        |
| `remove_condition`                 | `condition`                                        | Ends a condition                                                          |
| `produce`                          | `item`, `count`, `into` (`user` or `ground`)       | Creates entities (bake → 4 bread)                                         |
| `consume`                          | —                                                  | Uses up the entity (eating the bread)                                     |
| `wear`                             | `amount`                                           | Lowers durability                                                         |
| `transform`                        | `into`                                             | Replaces the entity with another definition (jar → shards)                |
| `destroy`                          | —                                                  | Removes the entity                                                        |
| `take_stock`                       | `amount`                                           | Takes from a `stock` component                                            |
| `set_open`                         | `isOpen`                                           | Doors                                                                     |
| `move`                             | `to` (`ground`, `user`, `target_tile`)             | Drop, pick up, throw. A thrown item sends `impact` where it lands         |
| `make_sound`                       | `loudness`                                         | A one-off sound (a crash, a creak of hinges)                              |
| `sleep`, `read_notes`, `post_note` | —                                                  | Wrap the existing special mechanics                                       |

Example combinations that need no new code:

- **Poisoned bread:** `eat` with `change_need hunger +0.5` then `add_condition poisoned` (chance 0.5).
- **Molotov:** a fragile, flammable bottle with condition `burning`. Thrown, it sends `impact` →
  `fragile` breaks it → the `burning` condition's `on_end` effect sends `fire` to `nearby` radius 1.
- **Lantern:** `light` verb with `emit fire` on `target`, `requiresHit: false`, reach 1.
- **Bandage:** `use` with `heal 0.15` and `remove_condition bleeding` on `target` (agent, reach 1)
  so you can bandage someone else.

### Conditions

Defined in `items.json`; can sit on agents or entities.

```jsonc
{
  "name": "burning",
  "words": "on fire",
  "isVisible": true,
  "defaultMinutes": 30,
  "everyTick": [
    { "type": "damage", "on": "self", "amount": { "min": 0.01, "max": 0.01 }, "stimulus": "fire" },
    { "type": "emit", "on": "nearby", "radius": 1, "stimulus": "fire", "chance": 0.05 },
  ],
  "onEnd": [],
  "endsOn": ["water"],
}
```

`self` is the agent or entity carrying the condition. `bleeding`, `wet`, `poisoned` and `broken`
are the other starters.

### Reactions

A global table: when a stimulus reaches something with a property (or condition), run effects.

```jsonc
[
  {
    "stimulus": "fire",
    "property": "flammable",
    "effects": [{ "type": "add_condition", "condition": "burning" }],
  },
  {
    "stimulus": "impact",
    "property": "fragile",
    "effects": [
      { "type": "transform", "into": "shards" },
      { "type": "make_sound", "loudness": 10 },
    ],
  },
  {
    "stimulus": "water",
    "condition": "burning",
    "effects": [{ "type": "remove_condition", "condition": "burning" }],
  },
  {
    "stimulus": "cut",
    "property": "flesh",
    "effects": [{ "type": "add_condition", "condition": "bleeding", "chance": 0.4 }],
  },
]
```

Reactions can trigger reactions (fire spreads, a burning shelf drops a jar...). A depth cap in
config (`reactions.maxDepthPerTick`) stops loops. Each reaction that changes something visible makes
a world event, so agents perceive it and remember it.

## Status: health, stats, conditions

### Health

- `Agent.health`, 0–1, starts at 1. It isn't a need: needs keep their own decay loop and health
  only changes through damage, starvation and healing.
- **Starvation:** once hunger has been 0 for `health.starvationGraceHours` (default 12), health
  drains `health.starvationDrainPerHour` (default 0.1). An agent without food dies after roughly
  two days.
- **Regeneration:** `health.regenPerHourAwake` (0.01) and `health.regenPerHourAsleep` (0.04), only
  while hunger is above `health.regenHungerThreshold` (0.4). Healing items add on top.
- **Prompt words:** "unhurt", "bruised", "hurt", "badly wounded", "near death", in config like
  need words. Never numbers.
- **Decisions:** health crossing `0.5` or `0.25` gives a decision, like a need crossing its
  threshold. Being attacked (hit or miss) always gives the target a decision, asleep or not.

### Stats

`strength` and `agility`, 0–1 (0.5 is average), set per character in `seeds/agents.json` and the
character editor. They reach the agent's own prompt as words ("quite strong, clumsy") so it knows
its body. Other agents don't see them; they find out by watching. See open question 4.

### Combat

A verb with `hitRoll` rolls before its effects, with the seeded generator:

```
hitChance = clamp(baseHitChance + (attacker.agility - defender.agility) * combat.agilitySpread,
                  combat.minHitChance, combat.maxHitChance)
```

- Defaults: `agilitySpread` 0.5, `minHitChance` 0.1, `maxHitChance` 0.95.
- An asleep or dead target is always hit.
- `scaledByStrength` damage is multiplied by `1 + (attacker.strength - 0.5) * combat.strengthSpread`
  (default spread 0.6, so 0.7× to 1.3×), after rolling within `{min, max}`.
- Starting numbers: punch 0.05–0.12 at base 0.8 hit chance; knife 0.2–0.4 at base 0.7, plus a
  40% chance of bleeding (0.01 health per minute for 20 minutes unless bandaged). A healthy agent
  survives two or three knife hits and many punches.
- A miss is still an event ("swung a knife at Tobias and missed") that everyone in sight perceives.

### Conditions on agents

Shown in the prompt next to needs ("Body and spirits: hurt and bleeding, quite hungry, rested").

### UI: the "Needs" section becomes "Status"

Health bar first (red as it drops), then the four need bars, then condition chips (`bleeding 12m`,
`burning`). Dead agents show "Died day 3, 14:20: stabbed by Tobias" in place of the bars.

## Death and bodies

- At health 0 the agent dies: a `died` event (seen by everyone in sight, and loud enough to hear
  nearby), with a cause taken from the last damage ("stabbed by Tobias", "starved").
- `Agent.death = { tick, cause }`. Dead agents get no decisions, no need decay, no reflections.
  Their memories stay readable in the viewer.
- A **body** entity takes their tile: `form: placeable`, a `container` holding their inventory,
  shown to others as "Mara's body". Anyone can `take` from it. Coins move into the body too, so
  the coin supply stays closed.
- Witnesses get a `seen` memory of the death; the killer gets a `did` memory. Everyone else learns
  by finding the body or being told. No code makes anyone grieve or suspect.
- The client draws the marker lying down and greyed out; the roster shows them as dead.
- Permanent. `make reset` brings everyone back.

## Decisions and prompts

The reply stays flat. `interact` keeps its name (see open question 1 for `verb`):

| Intent               | Reply                                                                |
| -------------------- | -------------------------------------------------------------------- |
| Bake at the oven     | `interact`, `target: "oven"`, `verb: "bake bread"`                   |
| Eat bread            | `interact`, `item: "bread"`, `verb: "eat"`                           |
| Stab Tobias          | `interact`, `item: "knife"`, `target: "Tobias"`, `verb: "attack"`    |
| Punch Tobias         | `interact`, `target: "Tobias"`, `verb: "punch"`                      |
| Throw the jar at him | `interact`, `item: "jar"`, `target: "Tobias"`, `verb: "throw"`       |
| Take Mara's coins    | `interact`, `target: "Mara's body"`, `verb: "take"`, `item: "coins"` |

- `item` means "the thing in your hands for this act", as it already does for `give`.
- Targets out of reach make the agent walk there first, as `interact` does now. A moving target
  is followed for up to `combat.chaseTicks`, then the act fails ("Tobias got away").
- **Belongings** list verbs inline, so most acts need no second call: "You carry: 3 bread (eat,
  throw), a knife (attack someone, throw)". The second interact call stays for objects with many
  verbs or missing details.
- **Here** and **Around you** show items on the ground, visible conditions and visible carried
  items ("Tobias, carrying a knife", "a broken jar on the floor", "the door (on fire)").
- Prompts present verbs plainly. They don't encourage or discourage violence.

## Events and memory

New `WorldEventKind`s: `attacked`, `missed`, `hurt`, `died`, `dropped`, `picked_up`, `threw`,
`took`, `broke`, `caught_fire`, `stopped_burning`, `condition_started`, `condition_ended`. Each is
filed through the existing `broadcast(event)` path. Fast repeats (a fire burning for 30 ticks) file
one memory when it starts and one when it ends, as actions do now.

Witnessing an attack or a death gives a decision and skips the interrupt cooldown.

## Persistence

- New `entities` table (`id`, `definition_id`, `location` json, `state` json). The agent row loses
  `inventory` and gains `health`, `stats`, `conditions`, `death`.
- Saved sims from before this change can't load; the server says to run `make reset`.

## Item editor

A new page, `client/items.html`, built like the character editor and saving `seeds/items.json`
through the same atomic write and validation path. Changes apply on `make reset`, like characters.

```
┌ Items ───────┬─────────────────────────────────────────────────────────┐
│ ▸ knife      │ Name [knife]  Plural [knives]   Form (●carriable ○placeable)│
│   bread      │ Sprite [▦ pick tile]   ☑ visible when carried            │
│   oven       │ Properties  [sharp ×] [metal ×] [+ add]                   │
│   door       │ Components  durability  max [40]           [+ add]        │
│ ──────────── │ Verbs                                                     │
│ Conditions   │  ▾ attack   target [agent ▾] reach [1] minutes [1] loud [6]│
│ Reactions    │    ☑ hit roll  base [0.70]                                │
│ Properties   │    Effects (drag to reorder)                              │
│              │     1 damage  on [target▾] 0.20–0.40 cut ☑ strength       │
│ [+ new item] │     2 wear    on [item▾]   1                              │
│              │    [+ effect ▾]                                           │
│              │  [+ verb]                                                 │
│              │ ── How agents see it ──────────────────────────────────── │
│              │ "a knife (attack someone, throw)"                         │
│              │ Problems: none                              [Save]        │
└──────────────┴─────────────────────────────────────────────────────────┘
```

- Tabs for **Items**, **Conditions**, **Reactions** and **Properties** (with descriptions and
  "where used").
- Effect rows show only the fields that effect type takes; `chance`, `when` and `requiresHit` sit
  behind a "more" toggle.
- Live validation: unknown conditions or items in effects, verbs whose target kind doesn't fit the
  form, reactions on properties nothing has.
- A preview line shows how the item appears in a prompt.
- The character editor's inventory picker lists definitions from this file.
- Placing new placeables on the map stays in Tiled or the map generator for now (open question 6).

## Build order

Each phase ends with `make check` and `make test` passing and its own commits.

1. **Status:** health, stats (seeds and character editor), starvation, regen, health words,
   "Status" panel, death and bodies (no `take` yet). Unit tests for starvation, regen and death.
2. **Entities:** `items.json` and its schema, the entity store, all current objects and items
   ported. Behavior unchanged; existing tests prove it.
3. **Verbs and effects:** the effect runner, targets, reach, hit rolls, strength scaling. Content:
   knife `attack`, body `punch`, bandage. Tests for hit chance, damage scaling and each effect.
4. **Ground items:** `drop`, `pick up`, `throw`, `take` from bodies, ground items in perception and
   on the map.
5. **Conditions and reactions:** bleeding, burning, wet, fragile breaking, fire spread, depth cap.
6. **Item editor.**

## Open questions

1. **Rename "interaction" to "verb" everywhere,** including the reply field? Recommended, for one
   name per concept. It touches prompts, fake replies and many tests.
2. **`seeds/items.json` vs `config.ts`:** fine to move per-item numbers out of config into the
   editable content file (and update the "everything in config" rule)?
3. **Fire on tiles:** should fire spread only between entities (as designed), or also across floor
   tiles and grass? Tile fire is a bigger change (tiles would need properties too).
4. **Can agents judge others' strength/agility** by looking ("a burly man")? Proposed: no, they
   learn by watching.
5. **Who sees carried items?** Proposed: only definitions with `isVisibleWhenCarried` (a knife yes,
   a coin purse no).
6. **Should the item editor also place objects on the map** and set starting inventories, or leave
   that to Tiled and the character editor?
7. **A viewer kill switch** (config flag that removes `attack` verbs) for runs where you want a
   peaceful village?
8. **Knife supply:** who starts with one, or how are knives made (a smithy, a recipe)?
