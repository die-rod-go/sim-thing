# Items as components: design

Status: **proposed**. Nothing here is built. When it is, this replaces the data model, verbs,
effects, conditions, reactions and item editor sections of `ITEMS-AND-STATUS.md`. The status
sections of that document (starvation, regeneration, combat formulas, death, the Status panel)
stay as they are.

Choices that are mine rather than yours are listed under [Open choices](#open-choices) at the end.

## The idea

- **Components hold data and nothing else.** You define all of them. The code does not know the
  name of a single component.
- **Verbs are yours too.** A verb says which things it applies to and lists **steps**.
- **Steps are the only hardcoded parts.** Each step is one small behavior with settings ("use up
  something inside the item", "wait", "roll to hit", "lower a field"). You stack them on a verb and
  choose their order. A step is told which component and field to work on; it never assumes one.
- **Rules** are the same stacked steps on a trigger other than an agent's choice: every few
  minutes, when a stimulus arrives, when a thing changes.
- **World settings** tell the physics that no verb triggers (sight, walking, sound) which of your
  components matter.

### The gun

Four components, all plain data:

```jsonc
"components": {
  "capacity": { "fields": { "max": { "type": "number" } } },
  "weapon":   { "fields": { "damage": { "type": "range" } } },
  "holdable": { "fields": { "kilograms": { "type": "number" } } },
  "range":    { "fields": { "tiles": { "type": "number" } } },
  "ammo":     {}
}
```

Two definitions:

```jsonc
{ "id": "gun", "name": "gun", "plural": "guns", "glyph": { "index": 170, "color": "#9a9aa8" },
  "components": {
    "capacity": { "max": 6 },
    "weapon":   { "damage": { "min": 0.4, "max": 0.7 } },
    "holdable": { "kilograms": 1 },
    "range":    { "tiles": 8 }
  } },
{ "id": "bullet", "name": "bullet", "plural": "bullets", "glyph": { "index": 7, "color": "#d8b060" },
  "components": { "holdable": { "kilograms": 0.01 }, "ammo": {} } }
```

One new verb. It applies to anything held that has the four components, is aimed at anything with
`health`, reaches as far as the gun's `range`, and runs five steps in order:

```jsonc
{
  "name": "shoot",
  "appliesTo": {
    "allOf": [
      { "has": "capacity" },
      { "has": "weapon" },
      { "has": "holdable" },
      { "has": "range" },
      { "where": "held" },
    ],
  },
  "target": { "has": "health" },
  "reach": { "from": "item.range.tiles" },
  "steps": [
    { "step": "use_up", "in": "item", "rule": { "has": "ammo" }, "count": 1 },
    { "step": "wait", "minutes": 1, "loudness": 30 },
    { "step": "roll_hit", "chance": 0.7 },
    {
      "step": "damage",
      "on": "target",
      "field": "health.current",
      "amount": { "from": "item.weapon.damage" },
    },
    { "step": "send", "on": "target", "stimulus": "cut" },
  ],
  "phrases": {
    "hit": "shot {target} with a {item}",
    "missed": "shot at {target} and missed",
    "killed": "shot dead by {actor}",
    "attempt": "shoot {target} with a {item}",
  },
}
```

Loading it needs no new code and no new verb, because `put` and `take` work on anything with
`capacity`:

```jsonc
{ "name": "put", "appliesTo": { "allOf": [{ "has": "holdable" }, { "where": "held" }] },
  "target": { "has": "capacity" }, "takes": ["amount"],
  "steps": [{ "step": "move", "on": "item", "into": "target",
              "limit": { "from": "target.capacity.max" } }] },
{ "name": "take", "appliesTo": { "allOf": [{ "has": "holdable" }, { "where": "inside" }] },
  "takes": ["amount"],
  "steps": [{ "step": "move", "on": "item", "into": "user" }] }
```

Nothing above required the engine to know what `capacity`, `weapon`, `range`, `ammo` or `health`
mean. The steps were pointed at them.

## What is code and what is data

| Code (fixed)                                                         | Data (yours, in `items.json`)                    |
| -------------------------------------------------------------------- | ------------------------------------------------ |
| Where things are: on a tile, or inside another thing                 | Components and their fields                      |
| Time: the clock, and components that expire                          | Definitions                                      |
| The step types                                                       | Verbs: which things, which steps, in which order |
| The rule terms (`has`, `field`, `where`...) and the three triggers   | Rules                                            |
| Sight, sound and walking, asking the world settings what blocks them | World settings                                   |
| Agents: minds, needs, strength and agility, sleep, dying             |                                                  |

There are no built-in components, no component with locked fields, and no component the engine
treats specially.

## Components

A component is a name and a set of typed fields. With no fields it is a tag.

```jsonc
"components": {
  "flammable": { "description": "Catches fire." },
  "burning":   { "description": "On fire.", "words": "on fire", "isVisible": true },
  "health": {
    "description": "How much it can take. A person has 1.",
    "fields": {
      "max":     { "type": "number", "min": 0 },
      "current": { "type": "number", "min": 0, "max": "max" }
    }
  },
  "stock": {
    "fields": {
      "capacity": { "type": "number", "min": 0 },
      "amount": { "type": "number", "min": 0, "max": "capacity",
                  "words": [{ "below": 1, "text": "empty" }, { "text": "{value} left" }] }
    }
  }
}
```

| Declaration field | Meaning                                                             |
| ----------------- | ------------------------------------------------------------------- |
| `description`     | For the editor                                                      |
| `fields`          | Field name to its type and options; omitted for a tag               |
| `words`           | How it reads in an agent's prompt while a thing has it ("on fire")  |
| `isVisible`       | Whether other agents who see the thing get those words (default no) |

| Field option | Meaning                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `type`       | `number`, `range`, `boolean`, `text`, or `item` (a definition id)                                                                |
| `default`    | The value when a definition gives none. A field without a default must be given                                                  |
| `min`, `max` | For numbers: a literal, or another field of the same component. Steps that change the field are clamped to it                    |
| `words`      | For numbers: how the value reads in prompts. The first entry whose `below` the value is under wins; `{value}` is it rounded down |

Properties, conditions and the seven engine components all become this one thing:

- A **property** (`flammable`, `sharp`) is a component with no fields.
- A **condition** (`burning`, `wet`, `bleeding`) is a component a step adds while the sim runs,
  usually for a number of minutes.
- `durability` becomes a `health` component you define. Toughness goes away: a tough thing just has
  more health (a door has 5, a person 1), so one amount of damage means the same on both.
- `form` and the mandatory `weight` become one ordinary component, `holdable`, with a `kilograms`
  field. Things you can pick up have it.
- `openable`, `blocking`, `bed`, `stock`, `container`, `notes`: ordinary components, or gone (see
  [Today's content](#todays-content)).

## Definitions

A definition is what a thing is called, how it is drawn, and its components:

```jsonc
{
  "id": "knife",
  "name": "knife",
  "plural": "knives",
  "glyph": { "index": 47, "color": "#d0d4dc" },
  "components": {
    "holdable": { "kilograms": 0.3 },
    "conspicuous": {},
    "sharp": {},
    "metal": {},
    "health": { "max": 4, "current": 4 },
    "weapon": { "damage": { "min": 0.2, "max": 0.4 }, "hitChance": 0.7, "stimulus": "cut" },
    "breaks_into": { "item": "broken_knife" },
  },
}
```

`form`, `properties`, `isVisibleWhenCarried` and `onBroken` are gone.

A person's body is an ordinary definition as well, replacing the `person` block:

```jsonc
{
  "id": "person",
  "name": "person",
  "glyph": { "index": 2, "color": "#ffffff" },
  "components": { "alive": {}, "flesh": {}, "flammable": {}, "health": { "max": 1, "current": 1 } },
}
```

## Things

A **thing** is an entity or an agent's body. Rules and steps treat both the same.

```ts
interface Entity {
  id: string;
  definitionId: string;
  label: string | null;
  location: { kind: "tile"; place: string; pos: Position } | { kind: "inside"; holderId: string };
  /** What differs from the definition: a changed or added component, or null for a removed one. */
  changes: Record<string, ComponentInstance | null>;
}

interface ComponentInstance {
  /** Field values that differ from the definition's. */
  fields: Record<string, FieldValue>;
  /** Null: lasts until removed. */
  endsAtTick: number | null;
  /** Who caused it, for death causes. */
  sourceAgentId: string | null;
}
```

- **Location is the one thing the engine owns.** A thing is on a tile or inside another thing.
  What a gun, a chest or a person holds is simply the things whose location is inside it. Contents
  are not a field, and no component is needed for a thing to hold others. A limit, where you want
  one, is a number in a component of yours that a `move` step is pointed at.
- An agent's inventory is the things inside its body. The separate `inventory` location goes away.
- `EntityState` and its five hardcoded fields (`durability`, `stock`, `isOpen`, `notes`, `userIds`)
  are gone. A door being closed, a field's stock and a jar on fire are all entries in `changes`,
  so any component of yours can have state.
- Only differences are stored, so editing a definition updates every existing thing of it. A thing
  is "plain", and counted with others of its definition ("3 bread"), when `changes` is empty, it
  has no label and nothing is inside it.
- An agent's body keeps its component changes in `Agent.components`, replacing `Agent.health` and
  `Agent.conditions`.
- Adding a component a thing already has extends it to the later end, as conditions do now.

One module, `server/src/items/things.ts`, reads and writes components, fields, location and
contents for both entities and bodies. It is the only item code that knows they are stored
differently.

## Rules for matching

One small language says "which things", everywhere that question is asked: a verb's `appliesTo`
and `target`, a rule's `if`, a step's `rule`, and the world settings.

| Term                                                         | Matches                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------- |
| `{ "has": "ammo" }`                                          | A thing that has the component right now                            |
| `{ "definition": "oven" }`                                   | A thing of that definition                                          |
| `{ "field": "stock.amount", "atLeast": 3 }`                  | A field comparison: `atLeast`, `atMost`, `above`, `below`, `equals` |
| `{ "where": "held" }`                                        | Where it is, relative to the agent doing a verb (verbs only)        |
| `{ "anyOf": [...] }`, `{ "allOf": [...] }`, `{ "not": ... }` | Combinations                                                        |

`where` is `held` (inside the user's body), `here` (on a tile), `inside` (inside something else the
agent can see into) or `self` (the user's own body).

`component`, `property`, `form`, `location`, `isUser` and `isDeadAgent` are replaced by these.

### Values

Wherever a step takes a number or text, it can be:

- a literal: `0.7`, `"cut"`;
- a field: `{ "from": "item.weapon.damage" }`;
- a roll: `{ "min": 0.05, "max": 0.12 }`, picked with the seeded generator (reading a `range` field
  rolls it the same way);
- any of these with `"times"`, a literal or a number field:
  `{ "min": 0.02, "max": 0.05, "times": "item.holdable.kilograms" }`.

A field path is `<who>.<component>.<field>`. `<who>` is `user`, `item`, `target`, `self` (the thing
a rule fired on), or a name given by an earlier step. `choice.amount`, `choice.minutes` and
`choice.text` are what the agent's decision supplied, and `<who>.name` is a thing's name.

Validation checks that every field read is guaranteed by the rule that picked that thing: `shoot`
may read `item.range.tiles` because its `appliesTo` requires `range`.

## Verbs

```jsonc
{
  "name": "attack",
  "appliesTo": { "allOf": [{ "has": "weapon" }, { "where": "held" }] },
  "target": { "has": "health" },
  "reach": 1,
  "steps": [
    { "step": "wait", "minutes": 1, "loudness": 6 },
    { "step": "roll_hit", "chance": { "from": "item.weapon.hitChance" } },
    {
      "step": "damage",
      "on": "target",
      "field": "health.current",
      "amount": { "from": "item.weapon.damage" },
      "scaledByStrength": true,
    },
    { "step": "send", "on": "target", "stimulus": { "from": "item.weapon.stimulus" } },
    {
      "step": "damage",
      "on": "item",
      "field": "health.current",
      "amount": 0.02,
      "evenOnMiss": true,
    },
  ],
  "phrases": { "hit": "hit {target} with a {item}", "missed": "...", "killed": "..." },
}
```

| Verb field        | Meaning                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `name`            | What the agent says it does                                                                  |
| `appliesTo`       | Which things offer it. The matched thing is `item`. Omitted for a bare-handed verb (`punch`) |
| `target`          | Which things it can be aimed at. Omitted for a verb with no target                           |
| `reach`           | Tiles from the user to the item and the target. A value, so it can come from a field         |
| `takes`           | Which extras of the decision it uses: `amount`, `minutes`, `text`                            |
| `isDoneInPassing` | A walker blocked by a thing this verb applies to does it on the way through (opening a door) |
| `steps`           | The ordered steps                                                                            |
| `phrases`         | How it reads as events, with `{item}`, `{target}`, `{from}` and `{actor}`                    |

How a verb runs:

1. **Check.** Every step is asked whether it could run: is there ammo, is the target in reach and
   sight, is there room. If any can't, the verb fails with that step's reason and nothing has
   happened.
2. **Run top to bottom.** A `wait` pauses the verb for its minutes. So steps above the first `wait`
   happen when the verb starts and steps below it when it finishes. A verb interrupted during a
   `wait` keeps what the earlier steps did and never runs the later ones. This replaces
   `when: start | finish`.
3. **After a `roll_hit`**, later steps run only on a hit, unless they say `evenOnMiss`. This
   replaces `requiresHit`.
4. A step whose thing has since gone (the target left or died during the `wait`) ends the verb with
   a reason, as today.

Things this removes: `target: none | agent | entity | agent_or_entity`, `canTargetSelf`,
`minutes`, `loudness`, `inputs`, `tools`, `hitRoll`, `takesText`, the `chosen` subject, `isUser`,
`isDeadAgent`, and the special handling of bodies. A body is a thing; a bare-handed verb has no
`appliesTo`; who can be targeted is a rule (`{ "has": "alive" }`, `{ "not": { "where": "self" } }`).

When two verbs with the same name both apply to a thing, **the first in the file wins**. Put the
special case above the general one. This replaces the overlap error and the `not` exclusions it
forced.

### What an agent can use

A verb's `item` and `target` can be anything the agent perceives within reach: what it holds, what
is on tiles in sight, other agents' bodies, its own body, and what is inside things it can see
into. An agent sees inside a thing it holds, or one within `perception.contentsReachTiles` that the
world setting `contentsHiddenBy` doesn't match.

That is how "nobody can take from a living agent" stops being code. `take` applies to things
`inside` something; the shipped `contentsHiddenBy` is `{ "has": "alive" }`; so what a living person
carries can't be seen, and so can't be taken.

### The decision reply

| Intent            | Reply                                                              |
| ----------------- | ------------------------------------------------------------------ |
| Bake at the oven  | `verb: "bake bread"`, `item: "oven"`                               |
| Eat bread         | `verb: "eat"`, `item: "bread"`                                     |
| Shoot Tobias      | `verb: "shoot"`, `item: "gun"`, `target: "Tobias"`                 |
| Punch Tobias      | `verb: "punch"`, `target: "Tobias"`                                |
| Load the gun      | `verb: "put"`, `item: "bullet"`, `target: "gun"`, `amount: 6`      |
| Take Mara's coins | `verb: "take"`, `item: "coin"`, `from: "Mara's body"`, `amount: 5` |

`item` is always the thing the verb applies to, and `target` always what it is aimed at. Today the
used thing is `item` when held and `target` when not, which is why validation needs rules to keep
them apart. The one new field, `from`, names what an `inside` item is in; it is needed only when
two things in reach hold the same item. With `takes: ["amount"]`, steps on `item` apply to that
many identical things, oldest first.

## Steps

The complete list. Every step is one behavior, and none of them names a component: the ones that
touch data are told the component, field or rule to use.

**Needing things**

| Step      | Settings                     | Does                                                                                                  |
| --------- | ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| `require` | `in`, `rule`, `count`, `as?` | The verb can't start unless `count` things matching `rule` are inside `in` (`user`, `item`, `target`) |
| `use_up`  | `in`, `rule`, `count`, `as?` | The same, and destroys them. `as` names what was taken, so later steps can read its fields            |
| `check`   | `on`, `if`, `otherwise`      | The verb can't start unless the thing matches `if`; `otherwise` is the reason the agent is given      |

**Taking time and chance**

| Step       | Settings               | Does                                                                                                             |
| ---------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `wait`     | `minutes`, `loudness?` | The verb takes this long, heard this far while it does                                                           |
| `sleep`    | `minutes?`             | The user sleeps until woken by the existing rules, or for `minutes`                                              |
| `roll_hit` | `chance`               | Rolls to hit the target, adjusted by agility as today; things and sleepers are always hit. Gates the later steps |

**Changing data**

| Step     | Settings                                     | Does                                                                             |
| -------- | -------------------------------------------- | -------------------------------------------------------------------------------- |
| `change` | `on`, `field`, `by`                          | Adds `by` to a number field, clamped to the field's `min` and `max`              |
| `damage` | `on`, `field`, `amount`, `scaledByStrength?` | Subtracts `amount` from a number field, optionally scaled by the user's strength |
| `set`    | `on`, `field`, `to`                          | Sets a field                                                                     |
| `add`    | `on`, `component`, `minutes?`, `fields?`     | Adds a component, for `minutes` or until removed                                 |
| `remove` | `on`, `component`                            | Removes a component                                                              |

**Things and places**

| Step        | Settings                                             | Does                                                            |
| ----------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| `move`      | `on`, `into` or `at`, `limit?`                       | Moves a thing inside another, or onto the tile where another is |
| `create`    | `item`, `count`, `into` or `at`, `limit?`, `fields?` | Makes new things, optionally with field values                  |
| `transform` | `on`, `into`                                         | Becomes another definition where it is                          |
| `destroy`   | `on`                                                 | Removes the thing; what was inside falls where it was           |

`into` and `at` take `user`, `item`, `target` or `self`. `limit` is the most things the destination
may hold; the verb can't start if they wouldn't fit. `at: "target"` after a missed roll is a free
tile next to the target.

**Reaching the world and agents**

| Step          | Settings                                | Does                                                                                    |
| ------------- | --------------------------------------- | --------------------------------------------------------------------------------------- |
| `send`        | `on`, `stimulus`                        | Sends a named stimulus to a thing, which may trigger rules                              |
| `sound`       | `on`, `loudness`                        | A one-off sound from where the thing is                                                 |
| `announce`    | `on`, `text`                            | An event about the thing, seen by whoever is in sight ("caught fire")                   |
| `change_need` | `on`, `need`, `amount`, `perOtherUser?` | Raises or lowers an agent's hunger, energy, social or fun                               |
| `read`        | `on`, `field`, `author?`                | The user reads a text field of the thing, and of things inside it, into `seen` memories |

Every step also takes `chance` (0 to 1) and, after a `roll_hit`, `evenOnMiss`. `on` can be `user`,
`item`, `target`, `self`, a name from `as`, or `nearby` with a `radius`.

A step that writes a field skips a thing that doesn't have that component. So throwing a rock at a
wheat field with no `health` does no damage, and the rock still lands.

Adding a step type is the one kind of item change that needs code.

### What each old effect becomes

| Old                                                  | New                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| `inputs`                                             | `use_up` in `user`                                               |
| `tools`                                              | `require` in `user`                                              |
| `hitRoll`                                            | `roll_hit`                                                       |
| `minutes`, `loudness`                                | `wait`                                                           |
| `damage` with a stimulus                             | `damage`, then `send`                                            |
| `wear`                                               | `damage` on the item's own health                                |
| `heal`                                               | `change` on the health field                                     |
| `take_stock`                                         | `check` that there is enough, then `change`                      |
| `set_open`                                           | `add` or `remove` of your `closed` component                     |
| `add_condition`, `remove_condition`                  | `add`, `remove`                                                  |
| `emit`, `make_sound`, `produce`                      | `send`, `sound`, `create`                                        |
| `post_note`, `read_notes`                            | `create` a note in the board; `read`                             |
| `move` to `ground` / `user` / `item` / `target_tile` | `move` `at: user` / `into: user` / `into: target` / `at: target` |
| The thrown thing's `impact` (config)                 | A `send` after the `move` in `throw`                             |

## Rules

A rule is steps on a trigger. A verb is the case where the trigger is an agent's choice; these are
the others.

| Trigger    | Fires                                                              |
| ---------- | ------------------------------------------------------------------ |
| `every`    | Every `minutes` of sim time, on each thing that matches `if`       |
| `stimulus` | When that stimulus reaches a thing that matches `if`               |
| `becomes`  | The moment a thing starts matching `if`, having not matched before |

```jsonc
"rules": [
  { "trigger": "stimulus", "stimulus": "fire",
    "if": { "allOf": [{ "has": "flammable" }, { "not": { "has": "wet" } }] },
    "steps": [
      { "step": "add", "component": "burning", "minutes": 30 },
      { "step": "announce", "text": "caught fire" }
    ] },
  { "trigger": "every", "minutes": 1, "if": { "has": "burning" }, "killed": "burned to death",
    "steps": [
      { "step": "damage", "field": "health.current", "amount": 0.01 },
      { "step": "send", "on": "nearby", "radius": 1, "stimulus": "fire", "chance": 0.05 }
    ] },
  { "trigger": "becomes", "if": { "not": { "has": "burning" } },
    "steps": [{ "step": "announce", "text": "stopped burning" }] },

  { "trigger": "every", "minutes": 60, "if": { "has": "regrows" },
    "steps": [{ "step": "change", "field": "stock.amount", "by": { "from": "self.regrows.perHour" } }] },

  { "trigger": "becomes",
    "if": { "allOf": [{ "field": "health.current", "atMost": 0 }, { "has": "breaks_into" }] },
    "steps": [{ "step": "transform", "into": { "from": "self.breaks_into.item" } }] },
  { "trigger": "becomes",
    "if": { "allOf": [{ "field": "health.current", "atMost": 0 },
                      { "not": { "has": "breaks_into" } }, { "not": { "definition": "person" } }] },
    "steps": [{ "step": "destroy" }] }
]
```

In a rule, `on` defaults to `self`, the thing the rule fired on.

These three triggers replace four separate mechanisms: reactions (`stimulus`), a condition's
`everyMinute` (`every`), stock regrowth (`every`), and `onBroken` with its built-in "destroy
otherwise" (`becomes`). Nothing in code knows that 0 health means broken; the two rules above say
so.

- When several rules fire at once they run in file order, each judged against the thing as it was
  when the trigger happened.
- `becomes` is checked after every step that changes a thing, so a jar shatters the moment the
  damage lands. It does not fire for a thing that is created already matching.
- Rules can set off rules. A chain stops at `reactions.maxDepth`, and the agent who started it
  stays its source, as today.
- A rule that lowers the agents' health field needs a `killed` phrase.
- Steps that need an agent doing something (`wait`, `sleep`, `roll_hit`, `require`, `use_up`,
  `check`) are for verbs only.
- `every` rules are not run against every thing. The engine keeps, per rule, the things that have
  the components its `if` names.

## World settings

Some physics has no verb and no trigger: every tick, sight asks what is in the way. A `world` block
in `items.json` answers with rules over your components. These are the only places the engine
reaches into item data on its own.

```jsonc
"world": {
  "sightBlockedBy":    { "anyOf": [{ "has": "opaque" },
                                   { "allOf": [{ "has": "door" }, { "has": "closed" }] }] },
  "movementBlockedBy": { "anyOf": [{ "has": "solid" },
                                   { "allOf": [{ "has": "door" }, { "has": "closed" }] }] },
  "soundMuffledBy":    { "allOf": [{ "has": "door" }, { "has": "closed" }] },
  "contentsHiddenBy":  { "has": "alive" },
  "shownWhenCarried":  { "has": "conspicuous" },
  "closedSupply":      { "definition": "coin" },
  "agentBody":         "person",
  "agentHealth":       "health.current"
}
```

| Setting             | Used by                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `sightBlockedBy`    | Sight: tiles holding a matching thing block it                                                                                 |
| `movementBlockedBy` | Pathfinding: those tiles are walls, unless an `isDoneInPassing` verb applies to the thing                                      |
| `soundMuffledBy`    | Sound passing those tiles is muffled                                                                                           |
| `contentsHiddenBy`  | Nobody else sees what is inside a matching thing                                                                               |
| `shownWhenCarried`  | Others see a matching thing in its holder's hands ("Tobias, carrying a knife")                                                 |
| `closedSupply`      | Validation only: warns when a verb or rule could make or destroy a matching thing. Replaces `economy.currencyDefinitionId`     |
| `agentBody`         | The definition an agent's body is                                                                                              |
| `agentHealth`       | The field that is an agent's health. Starvation, regeneration, the health words and the Status bar use it; at 0 the agent dies |

`openable`, `blocking`, `isVisibleWhenCarried` and the `person` block are replaced by these.

### Agents

The item system holds an agent's body. Its mind is the agent sim's, and stays in code:

- **Health** is the field `agentHealth` points at. It is your component, so one `damage` step hurts
  a person or a door.
- **Needs** (hunger, energy, social, fun) and **stats** (strength, agility) stay on the `Agent`
  record. They are not components. Steps reach them: `change_need`, `roll_hit` (agility) and
  `scaledByStrength`.
- **Sleep** stays the agent's own state, started by the `sleep` step.
- **Death** happens when the health field reaches 0, and is settled the moment it does, as today.
  The shipped data keeps an `alive` tag in step with it:

```jsonc
{
  "trigger": "becomes",
  "if": { "allOf": [{ "has": "alive" }, { "field": "health.current", "atMost": 0 }] },
  "steps": [{ "step": "remove", "component": "alive" }],
}
```

`move`, `transform` and `destroy` do nothing to an agent's body. Bodies stay where they fell.

## Today's content

**Doors.** A `door` tag and a `closed` component (`"words": "closed", "isVisible": true`). What a
closed door blocks is in the world settings above.

```jsonc
{ "name": "close", "appliesTo": { "allOf": [{ "has": "door" }, { "not": { "has": "closed" } }] },
  "steps": [{ "step": "add", "on": "item", "component": "closed" },
            { "step": "wait", "minutes": 1, "loudness": 3 }] },
{ "name": "open", "appliesTo": { "allOf": [{ "has": "door" }, { "has": "closed" }] },
  "isDoneInPassing": true,
  "steps": [{ "step": "remove", "on": "item", "component": "closed" },
            { "step": "wait", "minutes": 1, "loudness": 3 }] }
```

A walker who reaches a closed door opens it because `open` is done in passing; `config.doors` and
the door code in `walking.ts` go away. A locked door is then data: a `locked` tag, `open` excludes
it, and an `unlock` verb has `{ "step": "require", "in": "user", "rule": { "definition": "key" } }`.
With no in-passing verb applying, the door is a wall and walkers go around.

**Eating and harvesting.**

```jsonc
{ "name": "eat", "appliesTo": { "allOf": [{ "has": "food" }, { "where": "held" }] },
  "steps": [
    { "step": "destroy", "on": "item" },
    { "step": "wait", "minutes": 15 },
    { "step": "change_need", "on": "user", "need": "hunger", "amount": { "from": "item.food.hunger" } }
  ] },
{ "name": "harvest", "appliesTo": { "allOf": [{ "has": "harvestable" }, { "has": "stock" }] },
  "steps": [
    { "step": "check", "on": "item", "if": { "field": "stock.amount", "atLeast": 3 },
      "otherwise": "the {item} is bare" },
    { "step": "change", "on": "item", "field": "stock.amount", "by": -3 },
    { "step": "wait", "minutes": 60, "loudness": 4 },
    { "step": "create", "item": { "from": "item.harvestable.gives" }, "count": 3, "into": "user" },
    { "step": "change_need", "on": "user", "need": "energy", "amount": -0.1 }
  ] }
```

One `harvest` verb serves the wheat field and the trees, which differ in `harvestable.gives`.
`bake bread` is the oven's verb with `use_up` steps for the wheat and wood.

**Moving things.** `put` and `take` are in the gun example. The rest:

```jsonc
{ "name": "pick up", "appliesTo": { "allOf": [{ "has": "holdable" }, { "where": "here" }] },
  "takes": ["amount"], "steps": [{ "step": "move", "on": "item", "into": "user" }] },
{ "name": "drop", "appliesTo": { "where": "held" },
  "takes": ["amount"], "steps": [{ "step": "move", "on": "item", "at": "user" }] },
{ "name": "throw", "appliesTo": { "allOf": [{ "has": "holdable" }, { "where": "held" }] },
  "target": { "not": { "where": "self" } }, "reach": 6,
  "steps": [
    { "step": "wait", "minutes": 1, "loudness": 4 },
    { "step": "roll_hit", "chance": 0.6 },
    { "step": "damage", "on": "target", "field": "health.current", "scaledByStrength": true,
      "amount": { "min": 0.02, "max": 0.05, "times": "item.holdable.kilograms" } },
    { "step": "send", "on": "target", "stimulus": "impact" },
    { "step": "move", "on": "item", "at": "target", "evenOnMiss": true },
    { "step": "send", "on": "item", "stimulus": "impact", "evenOnMiss": true }
  ] }
```

**Sleep.** `bed` is a tag of yours.

```jsonc
{
  "name": "sleep",
  "appliesTo": { "has": "bed" },
  "takes": ["minutes"],
  "steps": [{ "step": "sleep", "minutes": { "from": "choice.minutes" } }],
}
```

**Notes.** A note is a thing with a `writing` component of yours (`text`, `author`), and the notice
board is a thing notes are created inside.

```jsonc
{ "name": "post a note", "appliesTo": { "has": "notice_board" }, "takes": ["text"],
  "steps": [
    { "step": "wait", "minutes": 5 },
    { "step": "create", "item": "note", "count": 1, "into": "item",
      "limit": { "from": "item.capacity.max" },
      "fields": { "writing.text": { "from": "choice.text" },
                  "writing.author": { "from": "user.name" } } }
  ] },
{ "name": "read", "appliesTo": { "anyOf": [{ "has": "writing" }, { "has": "notice_board" }] },
  "steps": [{ "step": "wait", "minutes": 5 },
            { "step": "read", "on": "item", "field": "writing.text", "author": "writing.author" }] }
```

The `notes` component, the `Note[]` state and the two note effects go away. Because a note is a
thing, the existing `take`, `give`, `put` and fire work on it.

## Prompts

No wording stays in item code. For each thing an agent sees, the prompt lists its name (or its
count, when plain), the `words` of its visible components, the `words` of its number fields, what
is inside it when the agent can see in, and the verbs that apply to it. The hardcoded "open",
"closed" and "enough left for 2 more" are deleted. An agent's own health and need words stay in
config, since they have two wordings (own and observed).

## Validation

`findItemFileProblems` stays pure and shared with the editor. It checks:

- unknown components, fields and definitions; field values of the wrong type or out of range;
- a field read that the rule picking that thing doesn't guarantee; `choice.*` without the matching
  `takes`; a name used before the step that gives it;
- `on: item` in a verb without `appliesTo`, `on: target` without `target`, verb-only steps in a
  rule, `evenOnMiss` with no `roll_hit` above it;
- `hit` and `missed` phrases with a `roll_hit`; a `killed` phrase wherever the agents' health field
  is lowered;
- the world settings name real components, and `agentHealth` is a number field of `agentBody`;
- warnings: a rule that matches nothing, a verb always shadowed by an earlier one of the same name,
  a component nothing uses, anything that could make or destroy a `closedSupply` thing;
- definitions the map or seeds name.

Gone: "engine component fields must be exactly", "every carriable needs weight", "an aimed verb
must be held", "appliesTo matches living agents", and the overlap error.

## Item editor

Tabs: **Items**, **Components**, **Verbs**, **Rules**, **World**.

- **Components**: create one, give it fields (name, type, default, min, max, words), prompt words
  and visibility. No component is locked. The page lists the verbs and rules that mention it and
  the items that have it.
- **Items**: name, plural, glyph and a component picker; picking a component shows its fields. The
  page lists the verbs that apply and previews the prompt line, live.
- **Verbs**: applies-to and target rule builders, then the step list. "+ step" opens the palette of
  step types, each with a one-line description; steps drag to reorder. A step's row shows only its
  own settings, and a divider marks what happens before and after each `wait`.
- **Rules**: a trigger, an `if`, and the same step list.
- **World**: the eight settings, each a rule builder or a picker.
- One rule builder and one value input (literal, roll, "from a field", "times") are used
  everywhere. The value input offers only fields the rule in scope guarantees.

## Implementation

### Where the code changes

| Area                                                                                               | Change                                                                                                                            |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `shared/src/items/item-file.ts`                                                                    | New schema: components, definitions, verbs with `steps`, `rules`, `world`. Split by section to stay under 300 lines               |
| `shared/src/items/applies-to.ts`                                                                   | Becomes `rules.ts`: one matcher over a thing's current components, and the guaranteed components of a rule                        |
| `shared/src/items/entity.ts`                                                                       | `changes` replaces `state`; `inside` replaces `inventory`                                                                         |
| `server/src/items/things.ts`                                                                       | New: components, fields, location and contents of entities and bodies. Absorbs `effects/subjects.ts`                              |
| `server/src/items/stock.ts`, `entity-users.ts`, `economy/notice-board.ts`                          | Deleted                                                                                                                           |
| `server/src/sim/effects/*`                                                                         | Becomes `steps/*`, one handler per step with `check` and `run`. The special, object and stock effects are deleted                 |
| `server/src/sim/verb-runner.ts`, `verb-use.ts`, `verb-chosen.ts`, `verb-checks.ts`, `verb-hits.ts` | One runner: resolve `item` and `target`, check all steps, run to the next `wait`. `verb-chosen.ts` and `verb-checks.ts` deleted   |
| `server/src/sim/conditions.ts`, `items/reactions.ts`                                               | Become the rule engine: `every`, `stimulus`, `becomes`, and component expiry                                                      |
| `server/src/sim/world-access.ts`, `walking.ts`                                                     | Sight, sound and walking ask the world settings; in-passing verbs replace the door code                                           |
| `server/src/status/health.ts`, `sim/damage.ts`                                                     | Read and write the `agentHealth` field through the thing module                                                                   |
| `server/src/sim/prompt-entities.ts`                                                                | Wording from `words`; contents by the perception rule                                                                             |
| `server/src/decision/*`                                                                            | Reply: `item` is always the used thing; new `from`                                                                                |
| `server/src/db/*`                                                                                  | `entities.state` becomes `changes`; the agent row gains `components` and loses `health` and `conditions`                          |
| `server/src/config.ts`                                                                             | `doors`, `verbs.landingStimulus`, `verbs.movePhrases`, `economy.currencyDefinitionId` removed                                     |
| `client/src/item-editor/*`                                                                         | As above; the property, condition and declaration panels merge into one component page                                            |
| `seeds/items.json`, `sim/test-seeds.json`, `shared/src/items/test-item-file.ts`                    | Rewritten in the new shape                                                                                                        |
| `AGENTS.md`, `BRIEF.md`                                                                            | Glossary: drop `form`, `property`, `condition`, `reaction`, `effect`, `durability`; add `thing`, `step`, `rule`, `world settings` |

### Build order

Each phase ends with `make check` and `make test` passing and its own commit. Saved sims from
before a phase can't load; the server says to run `make reset`.

1. **Data only.** Properties and conditions become components. `changes` replaces `EntityState`;
   `Agent.components` replaces `Agent.health` and `Agent.conditions`. The thing module. `person`
   becomes a definition and inventories become `inside`. The `world` block replaces the engine
   components for sight, walking, sound and health. Verbs keep their current shape.
2. **One rule language and the rule engine.** `has`, `definition`, `field`, `where`. The `rules`
   list with its three triggers replaces reactions, `everyMinute`, regrowth and `onBroken`.
3. **Steps.** Verbs become step lists run around `wait` and `roll_hit`. The generic steps replace
   the per-component effects; doors, stock, sleep and notes move into `items.json`.
4. **Verb roles and the reply.** `appliesTo` and `target` as rules, `from`, first match wins. The
   `chosen`, body and user special cases are deleted.
5. **Prompts.** Wording from `words`; `contentsHiddenBy`.
6. **Editor**, then the docs and glossary.

### Tests

The existing behavior tests carry over with new fixtures. New ones, named by behavior:

- reading a field through the definition and through a change; adding, extending, expiring and
  removing a component; the same on an agent's body
- each rule term on entities and bodies; the components a rule guarantees
- each step; a failed check leaving nothing changed; steps above and below a `wait`; an interrupted
  verb; steps after a missed roll, with and without `evenOnMiss`
- `use_up` taking from inside the item, and a later step reading what it took
- `move` respecting a `limit` read from a field
- `every` firing only on matching things; `becomes` firing once on the change and not at creation;
  several rules judged against the same moment
- a closed door blocking sight, sound and walking through the world settings; a walker opening it
  in passing; a locked one turning the walker away
- taking from a chest and from a body; not seeing inside a living person
- a posted note being read, taken, handed over and read by the next holder
- first match wins among same-named verbs; the shadowed-verb warning

## Open choices

Decisions I made to get to a complete design. Say if any should go the other way.

1. **A verb is one ordered list, split by `wait`.** Position replaces `when` and `requiresHit`.
   The cost is that order now matters for meaning: a `destroy` above the `wait` happens at the
   start.
2. **Needs, stats and sleep are not components.** They stay on the agent and are reached only
   through steps. Making them components would let `change` do what `change_need` does, at the
   price of more world settings pointing at them.
3. **No toughness.** A tougher thing has more health. Same results as today for the shipped items.
4. **A limit belongs to the `move` step, not to the world.** Anything can hold things; a verb
   decides whether to respect a number. A verb that forgets `limit` can overfill.
5. **`alive` is a tag kept by a rule**, not something the engine maintains. Deleting that rule
   would leave bodies counted as alive by your other rules.
6. **Start and end events of a component are `announce` steps** in rules rather than phrases on
   the component, so components stay data only.
7. **Notes are things.** A full board refuses new notes rather than dropping the oldest, and notes
   can be taken down and carried.
8. **The reply changes.** Placed things move from `target` to `item`, and `from` is added.
9. **First match wins** for same-named verbs.
10. **`give` stays its own action.** It could now be a verb, but it has its own events and gives
    the recipient a decision.
11. **Small behavior changes:** stock shows as a count ("6 left"); moving things is announced with
    the verb's own phrases rather than five event kinds; first-visit memories list doors with the
    other objects.
