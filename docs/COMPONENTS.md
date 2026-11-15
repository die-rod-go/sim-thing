# Items as components: design

Status: **built** (all six phases of the build order). This replaces the data model, verbs,
effects, conditions, reactions and item editor sections of `ITEMS-AND-STATUS.md`. The status
sections of that document (starvation, regeneration, the combat formulas, death, the Status panel)
stay as they are. Where the code differs from this document, the code and `AGENTS.md` are the
reference.

If you are implementing this: read it all once, then work phase by phase from
[Build order](#build-order). The shipped content is described in `VILLAGE-ITEMS.md`. `AGENTS.md`
still applies to everything.

Choices that are mine rather than the project owner's are listed under
[Open choices](#open-choices). Don't change them silently; ask.

## The idea

- **Components hold data and nothing else.** All of them are defined in `items.json`. The code
  does not know the name of a single component.
- **Verbs are data too.** A verb says which things it applies to and lists **steps**.
- **Steps are the only hardcoded parts.** Each step is one small behavior with settings ("use up
  something inside the item", "wait", "roll to hit", "lower a field"). They are stacked on a verb
  in a chosen order. A step is told which component and field to work on; it never assumes one.
- **Rules** are the same stacked steps on a trigger other than an agent's choice: every few
  minutes, when a stimulus arrives, when a thing changes.
- **World settings** tell the physics that no verb triggers (sight, walking, sound) which
  components matter.

### The gun

Five components, all plain data:

```jsonc
"components": {
  "capacity": { "fields": { "max": { "type": "number" } } },
  "firearm":  { "fields": { "damage": { "type": "range" }, "hitChance": { "type": "number" } } },
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
    "firearm":  { "damage": { "min": 0.4, "max": 0.7 }, "hitChance": 0.7 },
    "holdable": { "kilograms": 1 },
    "range":    { "tiles": 8 }
  } },
{ "id": "bullet", "name": "bullet", "plural": "bullets", "glyph": { "index": 7, "color": "#d8b060" },
  "components": { "holdable": { "kilograms": 0.01 }, "ammo": {} } }
```

One new verb. It applies to anything held that has the four components, is aimed at anything that
still has health, reaches as far as the gun's `range`, and runs five steps in order:

```jsonc
{
  "name": "shoot",
  "appliesTo": {
    "allOf": [
      { "has": "capacity" },
      { "has": "firearm" },
      { "has": "holdable" },
      { "has": "range" },
      { "where": "held" },
    ],
  },
  "target": { "field": "health.current", "above": 0 },
  "reach": { "from": "item.range.tiles" },
  "steps": [
    { "step": "use_up", "in": "item", "rule": { "has": "ammo" }, "count": 1 },
    { "step": "wait", "minutes": 1, "loudness": 30 },
    { "step": "roll_hit", "chance": { "from": "item.firearm.hitChance" } },
    {
      "step": "damage",
      "on": "target",
      "field": "health.current",
      "amount": { "from": "item.firearm.damage" },
    },
    { "step": "send", "on": "target", "stimulus": "cut" },
  ],
  "phrases": {
    "ongoing": "shooting at {target} with a {item}",
    "hit": "shot {target} with a {item}",
    "missed": "shot at {target} and missed",
    "killed": "shot dead by {actor}",
    "attempt": "shoot {target} with a {item}",
  },
}
```

Loading it needs no new code and no new verb, because the shipped `put` and `take` work on anything
with `capacity`:

```jsonc
{ "name": "put", "appliesTo": { "allOf": [{ "has": "holdable" }, { "where": "held" }] },
  "target": { "has": "capacity" }, "takes": ["amount"],
  "steps": [{ "step": "move", "on": "item", "into": "target",
              "limit": { "from": "target.capacity.max" } }] },
{ "name": "take", "appliesTo": { "allOf": [{ "has": "holdable" }, { "where": "inside" }] },
  "takes": ["amount"],
  "steps": [{ "step": "move", "on": "item", "into": "user" }] }
```

Nothing above required the engine to know what `capacity`, `firearm`, `range`, `ammo` or `health`
mean. The steps were pointed at them.

The gun uses its own `firearm` component rather than the knife's `weapon` on purpose: `attack`
applies to anything held with `weapon`, so a gun with `weapon` could also be swung like a knife for
bullet damage. Which verbs a thing offers is exactly the set of rules its components match.

## Vocabulary

These replace the matching rows of the `AGENTS.md` glossary when phase 6 lands.

| Term           | Meaning                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------- |
| component      | A named set of typed fields declared in `items.json`. With no fields it is a tag             |
| definition     | A template: id, name, glyph and components with field values                                 |
| entity         | One instance of a definition in the world                                                    |
| body           | An agent's physical presence: an instance of the `agentBody` definition, stored on the agent |
| thing          | An entity or a body. Rules and steps work on things                                          |
| verb           | Something an agent can do: an `appliesTo` rule, an optional `target` rule, and steps         |
| step           | One hardcoded behavior with settings. The only item logic in code                            |
| rule           | Steps that run on a trigger: `every`, `stimulus` or `becomes`                                |
| matcher        | The expression that says "which things" (`has`, `field`, `where`, `anyOf`...)                |
| stimulus       | A named message a `send` step delivers to a thing (`fire`, `impact`, `cut`)                  |
| world settings | The `world` block of `items.json`: matchers and names the engine's physics reads             |
| item           | In a verb: the thing its `appliesTo` matched. In the reply: the field naming it              |
| target         | In a verb: the thing its `target` matched. In the reply: the field naming it                 |

Dropped: `form`, `property`, `condition`, `reaction`, `effect`, `durability`, `toughness`.

## What is code and what is data

| Code (fixed)                                                         | Data (in `items.json`)                           |
| -------------------------------------------------------------------- | ------------------------------------------------ |
| Where things are: on a tile, or inside another thing                 | Components and their fields                      |
| Time: the clock, and components that expire                          | Definitions                                      |
| The step types                                                       | Verbs: which things, which steps, in which order |
| The matcher terms and the three rule triggers                        | Rules                                            |
| Sight, sound and walking, asking the world settings what blocks them | World settings                                   |
| Agents: minds, needs, strength and agility, sleep, dying             |                                                  |

There are no built-in components, no component with locked fields, and no component the engine
treats specially. A grep of `server/` and `shared/` for any component name from `items.json` must
come back empty outside tests.

## Components

A component is a name and a set of typed fields.

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

| Declaration field | Meaning                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `description`     | For the editor                                                                               |
| `fields`          | Field name to its type and options; omitted for a tag                                        |
| `words`           | How it reads in prompts while a thing has it ("on fire"). Omitted: it is never mentioned     |
| `isVisible`       | Whether agents who see the thing get `words`. The thing's own agent always does (default no) |

| Field option | Meaning                                                                                                                                                                                                                                                                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`       | `number`, `range` (`{ min, max }`), `boolean`, `text`, or `item` (a definition id)                                                                                                                                                                                                                                                                         |
| `default`    | The value when a definition gives none. A field without a default must be given by every definition that has the component                                                                                                                                                                                                                                 |
| `min`, `max` | Numbers only: a literal, or the name of another number field of the same component. Every write to the field is clamped to them                                                                                                                                                                                                                            |
| `words`      | Numbers only: how the value reads in prompts. The first entry whose `below` the value is under wins; an entry without `below` always matches; `{value}` is the value rounded down, and `{<field>}` another field of the same component, an `item` field read as its definition's name ("turns into {item} in {value} h"). No entry matching: nothing shown |

Names: components are snake_case, fields are camelCase, as today.

What the old concepts become:

- A **property** (`flammable`, `sharp`) is a component with no fields.
- A **condition** (`burning`, `wet`, `bleeding`) is a component a step adds while the sim runs,
  usually for a number of minutes. Its per-minute effects and its start and end events are rules.
- `durability` becomes a `health` component from `items.json`. **Toughness goes away**: a tough
  thing has more health (a door 5, a person 1), so one amount of damage means the same on both.
  The numbers work out as before: a knife with toughness 4 lost 0.02 ÷ 4 per swing from 1, and now
  loses 0.02 per swing from 4.
- `form` and the mandatory `weight` become one ordinary component, `holdable`, with a `kilograms`
  field. Things that can be picked up have it.
- `openable`, `blocking`, `bed`, `stock`, `container`, `notes`: ordinary components, or gone (see
  `VILLAGE-ITEMS.md`).

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

`form`, `properties`, `isVisibleWhenCarried` and `onBroken` are gone. `id`, `name`, `plural` and
`glyph` keep their current rules.

An agent's body is an ordinary definition as well, replacing the `person` block. The world setting
`agentBody` names it:

```jsonc
{
  "id": "person",
  "name": "person",
  "glyph": { "index": 2, "color": "#ffffff" },
  "components": { "alive": {}, "flesh": {}, "flammable": {}, "health": { "max": 1, "current": 1 } },
}
```

The map can place any definition except `agentBody`, and a seed inventory can hold any definition
except `agentBody`. The "must be placeable" and "must be carriable" checks go away with `form`.

## Things

A **thing** is an entity or an agent's body. Everything in this document that says "thing" works on
both.

```ts
/** `entity-12` or an agent's id. The two never collide: seed validation rejects an agent id that starts with `entity-`. */
type ThingId = string;

type ThingRef = { kind: "entity"; entityId: string } | { kind: "agent"; agentId: string };

interface ComponentInstance {
  /** Field values that differ from the definition's. */
  fields: Record<string, FieldValue>;
  /** Null: lasts until removed. */
  endsAtTick: number | null;
  /** The agent behind whatever added or last changed it, for death causes. */
  sourceId: string | null;
}

/** What differs from the definition: a changed or added component, or null for a removed one. */
type ComponentChanges = Record<string, ComponentInstance | null>;

interface Entity {
  id: string;
  definitionId: string;
  label: string | null;
  location: { kind: "tile"; place: string; pos: Position } | { kind: "inside"; holderId: ThingId };
  changes: ComponentChanges;
}

interface Agent {
  // ...everything it has today, except `health` and `conditions`, plus:
  bodyChanges: ComponentChanges;
}
```

- **Location is the one thing the engine owns.** A thing is on a tile or inside another thing.
  What a gun, a chest or a person holds is the things whose `holderId` is its id. Contents are not
  a field, and no component is needed for a thing to hold others. A limit, where one is wanted, is
  a number in a component that a `move` step is pointed at.
- An agent's inventory is the entities whose `holderId` is the agent's id. The separate
  `inventory` location kind goes away. A body's own position stays `Agent.pos` and `Agent.place`.
- `EntityState` and its five hardcoded fields (`durability`, `stock`, `isOpen`, `notes`,
  `userIds`) are gone. A door being closed, a field's stock and a jar on fire are entries in
  `changes`, so any component can have state.
- Who is using a thing (`userIds`) is no longer stored. It is read from the verbs agents are
  running.

### Reading and writing components

The components a thing has right now are its definition's, with its changes applied:

1. Start from the definition's components, each field filled from the definition or the
   declaration's `default`.
2. For each entry in the changes: `null` removes that component; an instance adds it (if the
   definition lacks it) and overrides the fields it lists.

This resolution is a pure function in `shared/` (`resolveComponents(declarations, definition,
changes)`), because the client needs it too.

Writes go through four operations, all in `server/src/items/things.ts`. They are the only code that
changes a component, which is what lets `becomes` rules work:

| Operation                                    | Effect on the changes                                                                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `writeField(thing, "health.current", 0.4)`   | Clamps to the field's `min` and `max`, then stores the value; if it equals the definition's value the override is dropped. Does nothing if the thing lacks the component |
| `addComponent(thing, name, minutes, fields)` | Adds it. If the thing already has it, keeps the later end (no end beats any end) and takes the newer source, as conditions do today                                      |
| `removeComponent(thing, name)`               | If the definition has it, stores `null`; otherwise deletes the entry                                                                                                     |
| `replaceDefinition(thing, definitionId)`     | For `transform`: new definition, changes cleared, label cleared                                                                                                          |

An entry that no longer differs from the definition is deleted, so an untouched thing has empty
changes.

The end tick for an added component is `tick + 1 + ceil(minutes / minutesPerTick)`, as
`computeConditionEndTick` does today.

### Agent health

One field of the body is the agent's health: the world setting `agentHealth` names it
(`"health.current"`). `Agent.health` goes away; `readAgentHealth(agent)` reads the field.

`writeField` on that field of a body is special in exactly these ways:

- On a **dead** agent it does nothing. Death is permanent.
- **Lowering** it on a living agent goes through today's `applyDamage`: a sleeper wakes in pain,
  crossing a threshold gives a decision, and reaching 0 settles death at once, with the cause taken
  from the run that did it (see [Cause](#cause)).
- Raising it is a plain write.

Starvation and regeneration call the same `writeField`.

## Matchers

One small language says "which things", everywhere that question is asked: a verb's `appliesTo`
and `target`, a rule's `if`, the `rule` of `require` and `use_up`, the `if` of `check`, and the
world settings.

| Term                                                         | Matches                                                                                                                                        |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ "has": "ammo" }`                                          | A thing that has the component right now                                                                                                       |
| `{ "definition": "oven" }`                                   | A thing of that definition                                                                                                                     |
| `{ "field": "stock.amount", "atLeast": 3 }`                  | A field comparison: one of `atLeast`, `atMost`, `above`, `below`, `equals`, with a literal or a read. False when the thing lacks the component |
| `{ "where": "held" }`                                        | Where it is, relative to the agent doing a verb                                                                                                |
| `{ "anyOf": [...] }`, `{ "allOf": [...] }`, `{ "not": ... }` | Combinations                                                                                                                                   |

`where` values:

| Value    | Matches                                                                            |
| -------- | ---------------------------------------------------------------------------------- |
| `held`   | An entity directly inside the user's body                                          |
| `here`   | A thing on a tile: an entity at the user's place, or another agent's body in sight |
| `inside` | An entity inside something other than the user, that the user can see into         |
| `self`   | The user's own body                                                                |

`where` is only allowed in a verb's `appliesTo` and `target`. Everywhere else it is a validation
error, since there is no user.

**Comparing with a value.** In a step's matcher (the `rule` of `require` and `use_up`, the `if` of
`check`) a comparison may read a value of the run instead of a literal:

```jsonc
{
  "step": "require",
  "in": "user",
  "rule": {
    "allOf": [
      { "has": "key" },
      { "field": "key.lockId", "equals": { "from": "item.fitted_lock.lockId" } },
    ],
  },
}
```

The read is checked like any other value read (see [Values and paths](#values-and-paths)): its
`who` must be sure to have the component, an ordering comparison needs a number, and `equals` needs
the type of the field it compares. It is resolved from the run when the step runs, from a snapshot
when the thing is gone. A comparison whose read has nothing to read (an `as` name not picked) does
not match. Before a verb starts, a matcher reading a name a step will pick later can't be judged,
so it doesn't refuse then. A read in `appliesTo`, `target`, a rule's `if` or a world setting is a
validation error: there is no run to read from.

`component`, `property`, `form`, `location`, `isUser` and `isDeadAgent` are replaced by these.

The matcher lives in `shared/` and takes the thing's resolved components, its definition id and,
for verbs, its `where`. `listGuaranteedComponents(matcher)` keeps its current meaning (the
components every match is sure to have) with `has` and `field` terms both counting, plus the
components of a `definition` term's definition.

## Values and paths

Two kinds of path appear, and they are different:

- A **component path**, `component.field`, is relative to one thing. Used by a step's `field`, a
  matcher's `field`, `read`'s `field` and `author`, and `agentHealth`.
- A **value path**, `who.component.field`, names whose field to read. Used inside values.

Wherever a step setting is described as a value, it can be:

| Form                                                              | Meaning                                                         |
| ----------------------------------------------------------------- | --------------------------------------------------------------- |
| `0.7`, `"cut"`, `"bread"`                                         | A literal                                                       |
| `{ "from": "item.weapon.damage" }`                                | The field's value. A `range` field is rolled                    |
| `{ "min": 0.05, "max": 0.12 }`                                    | A roll within the range, on the seeded generator (numbers only) |
| any of the above with `"times": 0.5` or `"times": "<value path>"` | Multiplied by a literal or a number field (numbers only)        |
| `{ "newId": true }`                                               | A text id no other `newId` in the world gave (text fields only) |

`newId` is allowed wherever a step writes a field: `create`'s `fields`, `set`'s `to`, `add`'s
`fields`. Each time it is resolved it gives new text (`id-12`) from a counter the world keeps and
saves, so it is the same on every run of a seed. `create` with `count: 3` gives each entity its own;
`set` on a stack gives the whole stack one. A lock and its key share one:

```jsonc
{ "step": "create", "item": "lock", "count": 1, "into": "user", "as": "newLock",
  "fields": { "lock.lockId": { "newId": true } } },
{ "step": "create", "item": "key", "count": 1, "into": "user",
  "fields": { "key.lockId": { "from": "newLock.lock.lockId" } } }
```

`who` in a value path:

| `who`    | Is                                                                                       |
| -------- | ---------------------------------------------------------------------------------------- |
| `user`   | The body of the agent doing the verb                                                     |
| `item`   | The thing the verb's `appliesTo` matched (the first of the stack)                        |
| `target` | The thing the verb's `target` matched                                                    |
| `self`   | In a rule: the thing the rule fired on                                                   |
| a name   | What an earlier `require`, `use_up` or `create` step named with `as`                     |
| `choice` | What the decision supplied: `choice.amount`, `choice.minutes`, `choice.text` (two parts) |

`<who>.name` (two parts) is the thing's display name.

Reads are answered from a **snapshot** when the thing is gone: the run keeps the resolved
components of `item`, of `target` and of each `as` name as they were when last present. So `eat`
can destroy the bread first and still read `item.food.hunger` afterwards.

Validation checks every read is guaranteed: the matcher that picked `who` must guarantee the
component (`shoot` may read `item.range.tiles` because its `appliesTo` requires `range`), and the
field's type must fit the setting. `choice.minutes` and `choice.text` need the matching `takes`. A
name `create` gave is sure of its definition's components (nothing, when the definition is read
from a field). After a `transform` into a literal definition, later steps read the thing as that
definition: paper transformed into a note can have `writing.text` set and read. A thing that could
be a body might stay as it was (a living body doesn't transform), so it is sure only of the
components it and the new definition share.

## Verbs

```jsonc
{
  "name": "attack",
  "appliesTo": { "allOf": [{ "has": "weapon" }, { "where": "held" }] },
  "target": {
    "allOf": [{ "field": "health.current", "above": 0 }, { "not": { "where": "self" } }],
  },
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
  "phrases": {
    "ongoing": "attacking {target} with a {item}",
    "hit": "hit {target} with a {item}",
    "missed": "swung a {item} at {target} and missed",
    "killed": "killed by {actor} with a {item}",
    "attempt": "attack {target} with a {item}",
  },
}
```

| Verb field        | Meaning                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| `name`            | What the agent says it does                                                                                       |
| `appliesTo`       | Matcher for the entity the verb is done with or to: the `item`. Omitted for a bare-handed verb (`punch`)          |
| `target`          | Matcher for what it is aimed at. Omitted for a verb with no target                                                |
| `reach`           | A number value (default 1): tiles from the user to the item and to the target                                     |
| `takes`           | Which extras of the decision it uses: `amount`, `minutes`, `text`                                                 |
| `isDoneInPassing` | A walker blocked by an entity this verb applies to does it on the way through (opening a door)                    |
| `steps`           | The ordered steps                                                                                                 |
| `phrases`         | `ongoing`, `done`, `attempt`, `hit`, `missed`, `killed`, as today, with `{item}`, `{target}`, `{from}`, `{actor}` |

The two roles:

- **`item` is always an entity**, never a body: you use things, and aim at people. It can be held,
  on a tile at the user's place, or inside something the user can see into.
- **`target` can be any thing**: an entity at the user's place, an entity the user holds, another
  agent's body in sight (living or dead), or the user's own body. The matcher narrows it:
  `{ "has": "alive" }` is a living person, `{ "not": { "where": "self" } }` keeps a verb off its
  user.

What this removes: `target: none | agent | entity | agent_or_entity`, `canTargetSelf`, `minutes`,
`loudness`, `inputs`, `tools`, `hitRoll`, `takesText`, the `chosen` subject, `isUser`,
`isDeadAgent`, `usedBodyId` and the `body` and `user` kinds of used thing, the rule that an aimed
verb must be used with something held, and the hardcoded "dead agents can't be attacked" and
"nobody can take from the living" (both are now matchers and a world setting).

### From a reply to a running verb

The reply's fields:

| Intent            | Reply                                                              |
| ----------------- | ------------------------------------------------------------------ |
| Bake at the oven  | `verb: "bake bread"`, `item: "oven"`                               |
| Eat bread         | `verb: "eat"`, `item: "bread"`                                     |
| Shoot Tobias      | `verb: "shoot"`, `item: "gun"`, `target: "Tobias"`                 |
| Punch Tobias      | `verb: "punch"`, `target: "Tobias"`                                |
| Bandage yourself  | `verb: "use"`, `item: "bandage"`, `target: "yourself"`             |
| Load the gun      | `verb: "put"`, `item: "bullet"`, `target: "gun"`, `amount: 6`      |
| Take Mara's coins | `verb: "take"`, `item: "coin"`, `from: "Mara's body"`, `amount: 5` |

`item` always names the verb's item and `target` always what it is aimed at. (Today a placed thing
is named in `target` and a held one in `item`.) `from` is new and optional: the thing an `inside`
item is in. It is needed only when two things in reach hold the same item.

Resolution, in `decision-runner.ts` and `verb-use.ts`:

1. **Candidates for `item`.** Every entity the agent could mean by that name (definition name,
   plural, or map label), in this order: held, oldest first; on a tile at the agent's place,
   nearest first; inside things the agent can see into, nearest holder first. With `from`, only
   what is directly inside the thing `from` names.
2. **Pick the verb.** Go through the verbs with that name in file order. The first whose
   `appliesTo` matches some candidate wins, with the first such candidate as the item. **First
   match wins**: put a special case above the general one (a poisoned `eat` above `eat`). With no
   `item` in the reply, the first verb of that name without `appliesTo` wins.
3. **The stack.** With `amount` in `takes`, the item is up to `choice.amount` entities (default 1):
   the chosen one and others of the same definition from the same place (held, or the same tile, or
   the same holder), oldest first, that `appliesTo` also matches. Fewer are taken when that is all
   there is, as today. Steps `on: "item"` apply to each.
4. **The target.** If the verb has a `target` matcher, the reply's `target` is resolved among:
   `yourself` or the agent's own name (the user's body), agents in sight (the dead by their body
   name), entities at the agent's place, and entities the agent holds other than the item. It must
   match the matcher. When it doesn't, a later verb of the same name that also applies to the item
   and whose `target` does match is used instead ("put" a note in a chest, though the notice-board
   "put" comes first).
5. **Reach.** The item and the target must each be within `reach` tiles (held things and the
   user's own body always are; an `inside` thing is where its outermost holder is), and the target
   in sight. Otherwise the agent walks first, to the item and then to the target, using today's
   approach and chase code, and everything above is resolved again on arrival.

Failures use today's wording where it exists ("there was no bread here", "someone got to it
first", "I can't shoot that", "Tobias got away").

### How a verb runs

1. **Check.** Each step is asked whether it could run now (see the "Can refuse" column below). If
   any can't, the verb fails with that step's reason and nothing has changed.
2. **Run top to bottom.** A `wait` or `sleep` pauses the verb. So steps above the first `wait`
   happen when the verb starts and steps below it when it finishes. This replaces
   `when: start | finish`.
3. **Resuming after a pause**, the roles are checked again: the item must still exist where it was
   (unless this verb destroyed or moved it), and the target must still exist, still match the
   `target` matcher, and be in sight and in reach. If not, the verb fails with a reason. One
   exception, as today: if the next step is a `roll_hit` and the target is only out of reach, the
   roll is a miss.
4. **After a `roll_hit`**, later steps run only on a hit, unless they say `evenOnMiss`. This
   replaces `requiresHit`.
5. A verb interrupted during a pause (the agent chose something else, or died) keeps what the
   earlier steps did and never runs the later ones.

The running verb, kept in the agent runtime and saved with it:

```ts
interface VerbRun {
  agentId: string;
  /** Index into `items.json` verbs, with the name to detect a changed file. */
  verbIndex: number;
  verbName: string;
  itemIds: string[];
  itemName: string;
  from: ThingRef | null;
  target: ThingRef | null;
  targetName: string | null;
  choice: { amount: number; minutes?: number; text?: string };
  /** The next step to run. */
  stepIndex: number;
  /** Null until a `roll_hit` has run. */
  isHit: boolean | null;
  /** Last known components of `item`, `target` and each `as` name. */
  snapshots: Record<string, ThingSnapshot>;
  startedAtTick: number;
}
```

`Agent.currentAction` stays as the viewer's summary; its `endsAtTick` is the end of the current
`wait`.

### Events a verb makes

| When                                      | Event                                                                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| The first `wait` is reached               | `action_started`, "started {ongoing}", with that `wait`'s `loudness`                                                   |
| The last step has run, verb had a `wait`  | `action_finished`, "finished {ongoing}" plus ", making 4 bread" when it created things                                 |
| The last step has run, verb had no `wait` | `action_finished`, the `done` phrase ("dropped 2 bread")                                                               |
| A `roll_hit` runs                         | `attacked` or `missed`, the `hit` or `missed` phrase, with the first `wait`'s `loudness`. No `action_finished` follows |
| A `sleep` step runs                       | `fell_asleep`; `woke` when it ends, as today                                                                           |
| The verb fails                            | `action_failed` through `failAction`, with the `attempt` phrase                                                        |

In phrases, `{item}` is counted when the stack is more than one ("2 bread"), `{from}` is the
holder's name, and aimed phrases keep today's perspective rules ("hit me", "themselves").

Steps no longer announce themselves. `move` used to pick one of five event kinds from where things
went; now `drop`, `put` and `take` are announced by their own `done` phrases like every other verb.

## Steps

The complete list: twenty-three. None names a component; the ones that touch data are told the
component, field or matcher to use.

**Needing things**

| Step      | Settings                      | Does                                                                                                                               | Can refuse                |
| --------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `require` | `in`, `rule`, `count?`, `as?` | Needs `count` (default 1) entities matching `rule` directly inside `in` (`user`, `item` or `target`). The item itself never counts | When there aren't enough  |
| `use_up`  | `in`, `rule`, `count?`, `as?` | The same, and destroys them, oldest first                                                                                          | When there aren't enough  |
| `check`   | `on`, `if`, `otherwise`       | Needs the thing to match the matcher `if`                                                                                          | With the text `otherwise` |

`as` names the first entity found, so later steps can use it as a `who` or an `on`. A step's
own settings can't read the name it gives.

**Logic**

| Step     | Settings   | Does                                                                                 |
| -------- | ---------- | ------------------------------------------------------------------------------------ |
| `if`     | `on`, `if` | Runs the steps up to its `else` or `end_if` only when every thing `on` names matches |
| `else`   |            | Runs the steps up to its `end_if` only when its `if` didn't match                    |
| `end_if` |            | Closes the block                                                                     |

Blocks nest, and the list stays flat so a paused verb resumes by step index. `if` and `check`
judge alike: a thing already gone (eaten) as it was last seen. Before a verb runs, its steps are
checked along the branches that match then; a condition on a name not picked yet isn't judged,
and its block isn't checked. A step that then reads a `choice` the decision didn't give refuses
when it runs. After `end_if`, a name is known only when both branches gave it, and a `transform`
in either branch means the thing could be as either branch left it. `if` can't fan out to
`nearby` or `earshot`, the markers take no `chance` or `evenOnMiss`, and `roll_hit` can't go in a
block. Each branch has its own first `wait`, whose `loudness` is how far the verb is heard.

**Taking time and chance**

| Step       | Settings               | Does                                                                                                                                                    | Can refuse                                       |
| ---------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `wait`     | `minutes`, `loudness?` | Pauses the verb for `minutes` (rounded up to whole ticks, at least one)                                                                                 |                                                  |
| `sleep`    | `minutes?`             | The user sleeps: today's sleep mechanics, until woken or for `minutes`. Pauses the verb until then                                                      | When already asleep, or `minutes` isn't positive |
| `roll_hit` | `chance`               | Rolls with today's formula: `chance` adjusted by the user's agility against the target's. A target that is an entity, asleep, or the user is always hit |                                                  |

**Changing data**

| Step     | Settings                                     | Does                                                                                                                    |
| -------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `change` | `on`, `field`, `by`                          | Adds the number `by` to the field                                                                                       |
| `damage` | `on`, `field`, `amount`, `scaledByStrength?` | Subtracts the number `amount` from the field, multiplied by today's strength factor of the user when `scaledByStrength` |
| `set`    | `on`, `field`, `to`                          | Sets the field                                                                                                          |
| `add`    | `on`, `component`, `minutes?`, `fields?`     | Adds the component, for `minutes` or until removed. `fields` is field name to value                                     |
| `remove` | `on`, `component`                            | Removes the component                                                                                                   |

`change`, `damage` and `set` skip a thing that lacks the component. So throwing a rock at a wheat
field with no `health` does no damage, and the rock still lands.

**Things and places**

| Step        | Settings                                                    | Does                                                                                                                                    | Can refuse                                |
| ----------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `move`      | `on`, `into` or `at`, `limit?`                              | Moves the thing inside another, or onto the tile where another is                                                                       | Over `limit`; into itself or its contents |
| `create`    | `item`, `count`, `into` or `at`, `limit?`, `fields?`, `as?` | Makes `count` new entities of the definition `item`, with `fields` (`"component.field"` to value) written on each; `as` names the first | Over `limit`                              |
| `transform` | `on`, `into`                                                | The entity becomes the definition `into` where it is; a dead agent's body is replaced by one (below)                                    |                                           |
| `destroy`   | `on`                                                        | Removes the entity; what was inside it goes to where it was                                                                             |                                           |

`into` and `at` take `user`, `item`, `target`, `self` or an `as` name. `into` is inside that thing;
`at` is the tile where that thing is. `limit` is a number value: the most entities the destination
may directly hold after the step. `at: "target"` after a missed `roll_hit` is a random free tile
next to the target, as today.

`move` and `destroy` do nothing to a body: bodies stay where they fell. `as` on `create` works
only in verbs; a rule keeps no names.

**Burial.** `transform` on a dead agent's body makes an entity of `into` on the body's tile, drops
everything directly inside the body onto that tile (as `move at` would), and takes the body out of
the world: it is no longer perceived, listed in prompts or reply enums, a target, a thing rules
fire on, or drawn by the viewer. The agent stays, dead, with its death, memories and history;
`Agent.bodyReplacedById` names the entity that replaced the body. Others keep their memories and
awareness of having seen the body. On a living body `transform` does nothing. The new entity is
untouched: a grave says nothing of who lies in it until someone carves it.

```jsonc
{
  "name": "bury",
  "target": { "allOf": [{ "definition": "person" }, { "not": { "has": "alive" } }] },
  "steps": [
    { "step": "wait", "minutes": 60, "loudness": 6 },
    { "step": "transform", "on": "target", "into": "grave" },
  ],
}
```

**Reaching the world and agents**

| Step          | Settings                                | Does                                                                                                                                                                                                                                                              |
| ------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `send`        | `on`, `stimulus`                        | Sends the stimulus (a text value) to the thing, firing `stimulus` rules                                                                                                                                                                                           |
| `sound`       | `on`, `loudness`                        | A `sound` event from where the thing is, as `make_sound` does today                                                                                                                                                                                               |
| `announce`    | `on`, `text`, `isPrivate?`              | An `announced` event whose subject is the thing ("the jar broke", "Tobias caught fire")                                                                                                                                                                           |
| `change_need` | `on`, `need`, `amount`, `perOtherUser?` | Adds to a living agent's hunger, energy, social or fun. `perOtherUser` adds that much again per other agent running a verb on the same item. Skips anything that isn't a living agent                                                                             |
| `read`        | `on`, `field`, `author?`                | The user files `seen` memories of the text in `field` (and the writer in `author`) of the thing, and of the newest `reading.thingsShownOnRead` entities directly inside it that have the field. Already-remembered texts are skipped, as today                    |
| `inspect`     | `on`, `emptyText?`                      | The user files a `seen` memory of the thing: its visible words ("6 left") and what is directly inside it, counted ("holding 2 wheat"), or `emptyText` when nothing is. A thing that hides its contents reads as `inspecting.hiddenText`. A recount is filed again |

An `announce` on a living agent's body is that agent's own event: the agent files it in the first
person ("I caught fire") and gets an urgent decision, which is what a condition starting does
today. With `isPrivate`, nobody else perceives it (being poisoned).

An event about an entity an agent carries (directly, or inside something they carry) names it as
theirs: onlookers file "I saw that Mara's pickaxe broke", and Mara, when she perceives it, files
"My pickaxe broke" (`steps.carriedThingNames` in config).

**Common settings**

- `on`: `user`, `item`, `target`, `self`, an `as` name, `nearby` or `earshot`. In a rule it
  defaults to `self`. In a verb it is required wherever a step lists it.
- `on: "nearby"` takes `radius` and `around` (a `who`; defaults to `self` in a rule, required in a
  verb). The step runs once on every thing within `radius` tiles of `around`, not counting `around`
  itself, each with its own `chance` roll. A carried or contained thing is where its outermost
  holder is.
- `on: "earshot"` takes `loudness` (a number value) and `around` (as for `nearby`). The step runs
  once on the body of every living agent who would clearly hear a sound of that loudness made where
  `around` is, not counting `around` itself, each with its own `chance` roll. It is the sound
  simulation's own reckoning: walls block, what `soundMuffledBy` matches costs more to pass, and a
  sleeper hears only what is loud enough to wake them. It doesn't work on `sound`, whose listeners
  already hear the sound.

```jsonc
{
  "name": "play",
  "appliesTo": { "allOf": [{ "has": "instrument" }, { "where": "held" }] },
  "steps": [
    { "step": "wait", "minutes": 30, "loudness": 8 },
    { "step": "change_need", "on": "user", "need": "fun", "amount": 0.15 },
    {
      "step": "change_need",
      "on": "earshot",
      "loudness": 8,
      "around": "user",
      "need": "fun",
      "amount": 0.1,
    },
  ],
}
```

- `chance`: 0 to 1, rolled on the seeded generator; the step is skipped on a failed roll.
- `evenOnMiss`: runs after a missed `roll_hit` too.

**Missing choices.** `choice.amount` defaults to 1. `sleep` treats a missing `choice.minutes` as
"until woken". Any other step whose value reads a missing `choice` refuses with "I didn't say
what/how long". `choice.text` is cut to `verbs.maxTextChars`.

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
| `set_open`                                           | `add` or `remove` of a `closed` component                        |
| `add_condition`, `remove_condition`                  | `add`, `remove`                                                  |
| `emit`, `make_sound`, `produce`                      | `send`, `sound`, `create`                                        |
| `post_note`, `read_notes`                            | `create` a note in the board; `read`                             |
| `move` to `ground` / `user` / `item` / `target_tile` | `move` `at: user` / `into: user` / `into: target` / `at: target` |
| The thrown thing's `impact` (config)                 | A `send` after the `move` in `throw`                             |
| `sleep`                                              | `sleep`                                                          |
| `change_need`                                        | `change_need`                                                    |

## Rules

A rule is steps on a trigger. A verb is the case where the trigger is an agent's choice; these are
the others.

| Trigger    | Settings   | Fires                                                                   |
| ---------- | ---------- | ----------------------------------------------------------------------- |
| `every`    | `minutes`  | Every `minutes` of sim time, on each thing that matches `if`            |
| `stimulus` | `stimulus` | When that stimulus reaches a thing that matches `if`                    |
| `becomes`  |            | The moment a thing starts matching `if`, having not matched just before |

```jsonc
"rules": [
  { "trigger": "stimulus", "stimulus": "fire",
    "if": { "allOf": [{ "has": "flammable" }, { "not": { "has": "wet" } }] },
    "steps": [{ "step": "add", "component": "burning", "minutes": 30 }] },
  { "trigger": "becomes", "if": { "has": "burning" },
    "steps": [{ "step": "announce", "text": "caught fire" }] },
  { "trigger": "every", "minutes": 1, "if": { "has": "burning" }, "killed": "burned to death",
    "steps": [
      { "step": "damage", "field": "health.current", "amount": 0.01 },
      { "step": "send", "on": "nearby", "radius": 1, "stimulus": "fire", "chance": 0.05 }
    ] },
  { "trigger": "becomes", "if": { "not": { "has": "burning" } },
    "steps": [{ "step": "announce", "text": "stopped burning" }] },

  { "trigger": "becomes",
    "if": { "allOf": [{ "field": "health.current", "atMost": 0 }, { "has": "breaks_into" }] },
    "steps": [{ "step": "announce", "text": "broke" },
              { "step": "transform", "into": { "from": "self.breaks_into.item" } }] }
]
```

A rule has `trigger`, its setting, `if`, `steps`, and an optional `killed` phrase. `on` defaults to
`self`, the thing the rule fired on.

These three triggers replace four mechanisms: reactions (`stimulus`), a condition's `everyMinute`
(`every`), stock regrowth (`every`), and `onBroken` with its built-in "destroy otherwise"
(`becomes`). Nothing in code knows that 0 health means broken; rules say so.

Steps that need an agent doing something are for verbs only: `require`, `use_up`, `check`, `wait`,
`sleep`, `roll_hit`, `read`, `inspect`, and the settings `scaledByStrength` and `evenOnMiss`.

### Exactly when rules fire

**`stimulus`.** A `send` step collects the rules for that stimulus whose `if` matches the receiver
now, in file order, then runs them. All are judged against the receiver as it was when the stimulus
arrived, as reactions are today.

**`becomes`.** Each of the write operations in [Things](#reading-and-writing-components) does
this:

1. Before writing, note which `becomes` rules match the thing.
2. Write.
3. The rules that match now and didn't before fire, in file order.

So a jar shatters the moment the damage lands, and a rule on `{ "not": { "has": "burning" } }`
fires when burning is removed, not on things that never burned. `becomes` does not fire when a
thing is created, when it is transformed (it counts as a new thing), or when it only moves.
On a body's health field, death is settled first and `becomes` rules fire after.

**`every`.** In the mechanics phase of each tick, after expired components are removed (each
removal is a `removeComponent`, so `becomes` rules fire). A rule with `minutes: m` fires once for
each multiple of `m` sim-minutes the tick covers, so it doesn't depend on `minutesPerTick`. Things
are visited in a fixed order (agents in their order, then entities by id), rules in file order. A
component added during this phase is first seen on the next tick.

**In all three**, a rule that was collected is skipped if an earlier one destroyed or transformed
the thing.

**Chains.** Rules set off rules: a step in a rule can `send`, or write and trigger `becomes`. Each
nested firing is one level deeper; at `rules.maxDepth` (today's `reactions.maxDepth`) the firing is
dropped and logged, and soak runs fail on it, as today.

For speed, the rule engine indexes `every` and `becomes` rules by the components their `if`
mentions, and looks only at things that have or just changed one of them.

### Cause

Every run carries who is behind it and how a death from it reads:

| Run                    | Source agent                                                                                        | Death phrase                        |
| ---------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------- |
| A verb                 | The user                                                                                            | The verb's `killed` phrase          |
| A rule fired by a step | The same as the run that fired it                                                                   | The rule's `killed`, else inherited |
| An `every` rule        | The `sourceId` of the first component named by a `has` in its `if` that the thing has with a source | The rule's `killed`                 |
| A component expiring   | None                                                                                                | None                                |

`add` stamps the run's source agent on the component it adds. So Tobias's thrown torch sets a
shelf burning with Tobias as its source, and whoever that fire kills "burned to death after being
hurt by Tobias", as today (`conditions.causedBySuffix`). The source can also be a creature
(an entity id), and then the death reads "mauled to death by the wolf".

## Creatures

A **creature** is an entity some **instinct** applies to: animals that walk around and act with
no LLM. They aren't agents. They have no mind, memory or needs, only an entity's components, so
health, bleeding, burning, `punch`, `attack` and every rule already work on them.

Everything about a creature is in its components. There is no creature config: how far it sees,
how skittish it is, how strong and nimble it is and how long it holds a grudge are fields on the
entity, and its state (hungry, provoked) is components it gains and loses.

```jsonc
"wolf": {
  "creature":  { "sightTiles": 10, "wanderChance": 0.3 },
  "predator":  { "fleeRadius": 6, "fleeBelowHealth": 0.2 },
  "defensive": { "grudgeMinutes": 60 },
  "stats":     { "strength": 0.6, "agility": 0.7 },
  "jaws":      { "damage": { "min": 0.06, "max": 0.14 }, "hitChance": 0.65 },
  "drops":     { "item": "raw_meat", "count": 1 }
}
```

`items.json` has an `instincts` list. An instinct is to a creature what a rule is to `flammable`:
the component is the state, the instinct gives it meaning. Each has an `appliesTo` matcher, checked
against the creature itself (`where: self`), and is one of three kinds:

| `do`     | Settings                                                | What the creature does                                                                            |
| -------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `verb`   | `verb`, `range`, optional `target`, optional `sourceOf` | Walks to the nearest thing within `range` that fits the verb's `target` and this one, and does it |
| `flee`   | `from` (a matcher), `radius`                            | Steps away from what it fears within `radius` tiles                                               |
| `wander` | `chance`                                                | Takes a random step with that chance each tick                                                    |

`range`, `radius` and `chance` are number values. A read must be `self.component.field`, of a
component the instinct's `appliesTo` requires, so the number is the creature's own:

```jsonc
{
  "do": "flee",
  "appliesTo": { "has": "timid" },
  "from": { "definition": "person" },
  "radius": { "from": "self.timid.radius" },
}
```

A field comparison in an instinct's `appliesTo` can read the creature's own fields the same way,
so even "when" is per creature: the wolf runs once `health.current` is below
`self.predator.fleeBelowHealth`.

Each tick (phase 2b, after agents' actions progress), a creature busy with a verb carries on with
it. Otherwise it tries its instincts in file order and follows the first that finds something to
do. Instincts are a priority list, not effects that all run.

Creatures act through ordinary verbs. A creature's verb uses its own body as the `item`: its
`appliesTo` ends in `where: self` (`bite`: `{ "allOf": [{ "has": "jaws" }, { "where": "self" }] }`).
An agent never meets an entity as `self`, so agents are never offered these verbs. Steps read the
creature's fields as `item.*`, and `user` is the creature. Because they are verbs, their events
are ordinary events: onlookers file "I saw that the wolf bit Mara", and the target files "The wolf
bit me" and gets an urgent decision. The verb runner reaches its user only through
`sim/verb-user.ts`, so it never branches on agent versus creature. Validation refuses an instinct
whose verb has a step only an agent can do (`sleep`, `read`, `inspect`).

Striking back uses the cause every run already carries. A hit sends a stimulus (`cut`, `impact`),
and a rule adds a timed `provoked` component to a `defensive` creature. `add` stamps who is
behind the run on the component, so the attacker is `provoked`'s source. An instinct with
`"sourceOf": "provoked"` goes only for that source. The grudge ends when the component expires
(`defensive.grudgeMinutes`); a blow that misses sends no stimulus and provokes nothing. The engine
keeps nothing about a creature but its verb in progress.

Each creature has its own strength and agility in the fields `world.creatureStrength` and
`world.creatureAgility` name (the shipped `stats` component). Strength scales its
`scaledByStrength` damage, and agility moves its hit rolls both ways, as an agent's does: an agile
wolf lands bites more often and dodges more blows. Validation requires both settings, and those
components on every creature definition, once the file has creatures. There is no default.

A creature sees as far as the instinct's `range` (walls and closed doors block sight). It moves
one tile a tick on the agents' walking grid, so walls and closed doors stop it too. An agent sees
creatures as it sees people: one coming into view gives a non-urgent decision ("the wolf came into
view"), under the same interrupt cooldown.

Everything else is rules. Dying is a `becomes` rule on `health.current` that creates the `drops`
item where the creature stood and then destroys it. Spawning is an `every` rule on a den with
`stock`, `regrows` and `spawns`. Being _hungry_ is just not having the timed `sated` component a
meal adds.

## World settings

Some physics has no verb and no trigger: every tick, sight asks what is in the way. A `world` block
in `items.json` answers. These are the only places the engine reaches into item data on its own.

```jsonc
"world": {
  "sightBlockedBy":    { "allOf": [{ "has": "door" }, { "has": "closed" }] },
  "movementBlockedBy": { "anyOf": [{ "has": "solid" },
                                   { "allOf": [{ "has": "door" }, { "has": "closed" }] }] },
  "soundMuffledBy":    { "allOf": [{ "has": "door" }, { "has": "closed" }] },
  "contentsHiddenBy":  { "has": "alive" },
  "shownWhenCarried":  { "has": "conspicuous" },
  "lyingWhenOnTile":   { "has": "holdable" },
  "closedSupply":      { "definition": "coin" },
  "agentBody":         "person",
  "agentHealth":       "health.current",
  "creatureStrength":  "stats.strength",
  "creatureAgility":   "stats.agility"
}
```

| Setting             | Kind           | Used by                                                                                                                                    |
| ------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `sightBlockedBy`    | matcher        | Sight: a tile with a matching entity on it blocks sight                                                                                    |
| `movementBlockedBy` | matcher        | Pathfinding: a tile with a matching entity on it is a wall, unless an `isDoneInPassing` verb applies to that entity                        |
| `soundMuffledBy`    | matcher        | Sound: passing a tile with a matching entity is muffled (today's closed-door cost)                                                         |
| `contentsHiddenBy`  | matcher        | Perception: nobody but its own agent sees what is inside a matching thing                                                                  |
| `shownWhenCarried`  | matcher        | Perception: others see a matching entity directly inside an agent ("Tobias, carrying a knife")                                             |
| `lyingWhenOnTile`   | matcher        | Prompts: a matching entity on a tile reads as lying "on the floor" or "on the ground", so a dropped knife is told apart from a placed oven |
| `closedSupply`      | matcher        | Validation only: warns when a verb or rule could make or destroy a matching thing. Replaces `economy.currencyDefinitionId`                 |
| `agentBody`         | definition id  | The definition of every agent's body                                                                                                       |
| `agentHealth`       | component path | The number field that is an agent's health                                                                                                 |
| `creatureStrength`  | component path | The number field that is a creature's strength; needed once the file has creatures                                                         |
| `creatureAgility`   | component path | The number field that is a creature's agility; needed once the file has creatures                                                          |

Only entities on tiles block sight, movement and sound; what is carried or contained never does.
All matchers are optional (omitted: nothing matches); `agentBody` and `agentHealth` are required.

`openable`, `blocking`, `isVisibleWhenCarried` and the `person` block are replaced by these.

**Walking and `isDoneInPassing`.** Pathfinding treats a movement-blocking entity as passable when
some `isDoneInPassing` verb's `appliesTo` matches it (as `here`). When a walker's next step is such
a tile, the walker does that verb at once: its steps are checked and run with every `wait` taking
no time, and it is announced with its `done` phrase and its first `wait`'s loudness. If a step
refuses, or the tile is still blocked afterwards, the walk fails with a reason. This replaces
`config.doors` and `openDoorOnTile` in `walking.ts`.

### Agents

The item system holds an agent's body. Its mind is the agent sim's, and stays in code:

- **Health** is the field `agentHealth` points at. It is a component from `items.json`, so one
  `damage` step hurts a person or a door. The health words, thresholds, regeneration and starvation
  in config are unchanged.
- **Needs** (hunger, energy, social, fun) and **stats** (strength, agility) stay on the `Agent`
  record. They are not components. Steps reach them: `change_need`, `roll_hit` (agility) and
  `scaledByStrength`.
- **Sleep** stays the agent's own state, started by the `sleep` step.
- **Death** happens when the health field reaches 0, and is settled the moment it does, as today.
  `isDead` keeps reading `Agent.death`. The shipped data keeps an `alive` tag in step with it:

```jsonc
{
  "trigger": "becomes",
  "if": { "allOf": [{ "has": "alive" }, { "field": "health.current", "atMost": 0 }] },
  "steps": [{ "step": "remove", "component": "alive" }],
}
```

## Perception and prompts

**Seeing inside.** An agent sees what is directly inside a thing when the agent is that thing's own
agent, or holds it, or stands within `perception.contentsReachTiles` (new, default 1) of it; and,
unless it is the agent's own body, `contentsHiddenBy` doesn't match it. To see something nested
deeper, every holder on the way must pass the same test. This replaces "within reach of a verb that
takes from it" and the hardcoded refusal to take from the living.

**What a prompt line says.** For each thing an agent sees, built in `prompt-entities.ts`:

1. its name: the map label, or the definition's name;
2. the `words` of each of its components that has them and is visible (all of them for the agent's
   own body), in component declaration order;
3. the `words` of each of its number fields that has them;
4. "on the floor" or "on the ground" (`perception.groundWords`) for an entity on a tile that the
   world setting `lyingWhenOnTile` matches (this replaces the check for `form: carriable`);
5. what is inside it, counted by definition ("holding 3 bread, 2 coins"), when the agent can see
   in and it isn't empty;
6. the names of the verbs whose `appliesTo` matches it, each once.

**Grouping.** Entities are counted together ("3 bread") when their whole line is identical and
they have no label. This replaces `isStateless` and its list of state fields, and means a worn
knife is counted with a fresh one unless a component's `words` tell them apart.

**Sections.** Belongings lists what the agent holds; Here lists entities at its place, then bodies
in sight with what they hold when it can be seen; contents of things it can see into are listed
under their holder with their own verbs. "You can also:" lists verbs without `appliesTo`. Around
you is unchanged, with visible component words where condition words are today.

**Reply enums.** `item`: names of held entities, entities here, and entities inside things the
agent can see into. `from`: names of things the agent can see into. `target`: as today (places,
agents in sight, entities here, `yourself`, held entities).

The hardcoded "open", "closed" and "enough left for 2 more" (`describeEntityCondition`) are
deleted. `server/prompts/decision.txt` and `interact.txt` are updated for the reply's new meaning
of `item`, `target` and `from`.

## Validation

`findItemFileProblems` stays pure and shared with the editor. Errors:

- an unknown component, field, definition or step type; a field value of the wrong type or outside
  a literal `min`/`max`; a missing field with no default; an `item` field naming no definition;
- a `min` or `max` naming a field that isn't a number field of the same component;
- `where` outside a verb's `appliesTo` and `target`; `where: "self"` in `appliesTo`; an `appliesTo`
  that can match the `agentBody` definition;
- a value read that isn't guaranteed, or of the wrong type; `choice.minutes` or `choice.text`
  without the matching `takes`; an `as` name used before the step that gives it (a step's own
  settings included), or equal to `user`, `item`, `target`, `self`, `choice`, `nearby` or
  `earshot`; `as` on a `create` in a rule;
- a comparison reading a value outside a step's `rule` or `if`; `equals` reading a value to compare
  with a `range` field; a `newId` for a field that isn't text;
- `on: "earshot"` without `loudness`, or in a verb without `around`; `sound` on earshot; `loudness`
  on any other step that isn't on earshot;
- `on: "item"`, `in: "item"` or a read of `item` in a verb without `appliesTo`; the same for
  `target`; `self` in a verb; `user`, `item` or `target` in a rule;
- a verb-only step or setting in a rule; `evenOnMiss` or `at: "target"`-on-miss with no `roll_hit`
  above; more than one `roll_hit`; a `roll_hit` in a verb without `target`; `loudness` on a `wait`
  that isn't the first;
- a verb with a `roll_hit` lacking `hit` or `missed` phrases; a verb or rule with a `damage` step
  on the `agentHealth` field that could reach a body, lacking a `killed` phrase;
- `agentBody` naming no definition; `agentHealth` not a number field of a component that
  definition has;
- a definition the map or seeds use that doesn't exist, or the map or seeds using `agentBody`.

Warnings:

- a matcher that no definition can ever match (considering components rules could add);
- a verb that an earlier verb of the same name always shadows;
- a component that no definition has and no step adds;
- anything that could make or destroy a `closedSupply` thing: a `create` or `transform` into a
  matching definition (for a `{ "from": ... }`, any value that field takes in the file), or a
  `destroy`, `use_up` or `transform` whose subject could match.

Gone: "engine component fields must be exactly", "every carriable needs weight", "an aimed verb
must be held", "appliesTo matches living agents", and the same-name overlap error.

`findUnbuiltFeatures` in `load-items.ts` stays, checking step types against the step registry.

## Item editor

Tabs: **Items**, **Components**, **Verbs**, **Rules**, **World**.

- **Components**: create one, give it fields (name, type, default, min, max, words), prompt words
  and visibility. No component is locked. The page lists the verbs and rules that mention it and
  the items that have it.
- **Items**: name, plural, glyph and a component picker; picking a component shows its fields. The
  page lists the verbs that apply and previews the prompt line, live.
- **Verbs**: applies-to and target matcher builders, reach, takes, then the step list. "+ step"
  opens the palette of step types, each with a one-line description; steps drag to reorder. A
  step's row shows only its own settings. A divider marks each `wait` ("when it starts" above,
  "when it finishes" below) and the `roll_hit` ("on a hit" below).
- **Rules**: a trigger with its setting, an `if`, a `killed` phrase, and the same step list.
- **World**: the nine settings, each a matcher builder or a picker.
- One matcher builder and one value input (literal, roll, "from a field", "times") are used
  everywhere. The value input offers only fields that are guaranteed in that spot.

The editor loses its special cases: locked engine fields, the form switch, the automatic `weight`,
the `person` panel, and the separate property and condition panels. The save path, atomic write and
the `load_item_file` / `save_item_file` messages are unchanged, except that `item_file` no longer
carries `currencyDefinitionId`.

## Implementation

### Modules

New or reshaped modules, with what each owns. Keep files under roughly 300 lines; split when they
pass it.

**`shared/src/items/`**

| File                  | Owns                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `component-schema.ts` | zod: component declarations, field options, field values                                  |
| `matcher-schema.ts`   | zod: matchers                                                                             |
| `value-schema.ts`     | zod: values, value paths, component paths                                                 |
| `step-schema.ts`      | zod: the twenty steps as a discriminated union on `step`, and the common settings         |
| `item-file.ts`        | zod: definitions, verbs, rules, `world`, the whole file; `parseItemFile`                  |
| `components.ts`       | `resolveComponents`, `ComponentChanges`, `ComponentInstance`; pure                        |
| `matchers.ts`         | `matchesThing(matcher, view)`, `listGuaranteedComponents`; pure. Replaces `applies-to.ts` |
| `catalog.ts`          | `ItemCatalog`: the file plus lookups by definition id and component name                  |
| `*-validation.ts`     | `findItemFileProblems`, split by section as today                                         |

`matchesThing` takes a view, so the same code serves server, editor and validation:

```ts
interface ThingView {
  definitionId: string;
  components: ResolvedComponents; // component name -> field name -> value
  /** Absent outside verbs. */
  where?: "held" | "here" | "inside" | "self";
}
```

**`server/src/items/`**

| File               | Owns                                                                                                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `things.ts`        | `ThingRef`; reading (`readComponents`, `hasComponent`, `readField`), locating (`locateThing`, `listContents`, `describeThingName`). The only item code that branches on entity or agent. Absorbs `sim/effects/subjects.ts` |
| `thing-writes.ts`  | `writeField`, `addComponent`, `removeComponent`, `replaceDefinition`: clamp, write, mark changed, route the agent health field to `applyDamage`, then tell the rule engine                                                 |
| `entity-store.ts`  | Creating, moving and removing entities, as today, with `changes` and `inside`                                                                                                                                              |
| `values.ts`        | Resolving a value against a run (literals, reads from live things or snapshots, rolls, `times`). Replaces `verb-numbers.ts`                                                                                                |
| `world-physics.ts` | The world settings as functions: `blocksSight(entity)`, `blocksMovement(entity)`, `mufflesSound(entity)`, `canSeeInto(agentId, thing)`, `isShownWhenCarried(entity)`                                                       |

Deleted: `stock.ts`, `entity-users.ts`, `containers.ts` (its nesting check moves to the `move`
step; `listContents` to `things.ts`), `reactions.ts`, `verb-numbers.ts`, `economy/notice-board.ts`.

**`server/src/sim/steps/`** (replaces `sim/effects/`)

One handler per step, registered in `step-registry.ts`:

```ts
interface StepRun {
  context: TickContext;
  /** Null in a rule. */
  verbRun: VerbRun | null;
  /** The thing a rule fired on; null in a verb. */
  self: ThingRef | null;
  sourceId: string | null;
  /** How a death from this run reads, before `{actor}` is filled. */
  killedPhrase: string;
  /** 0 for a verb or an `every` rule; one more for each rule fired from inside a run. */
  depth: number;
}

type StepOutcome =
  | { kind: "done"; made?: { definitionId: string; count: number } }
  | { kind: "pause"; untilTick: number | null }; // null: until the agent wakes

interface StepHandler<Type extends StepType> {
  isVerbOnly: boolean;
  /** Why it can't run now, or null. Must not change anything. */
  findRefusal?(run: StepRun, step: StepOfType<Type>): string | null;
  run(run: StepRun, step: StepOfType<Type>): StepOutcome;
}
```

`applyStep(run, step)` in the registry handles the common settings (`chance`, `on: "nearby"`
fan-out) before calling the handler, as `applyEffect` does today.

**`server/src/sim/`**

| File                 | Owns                                                                                                                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rule-engine.ts`     | `sendStimulus(run, thing, name)`, `collectBecomes` / `fireBecomes` around a write, `runEveryRules(context)`, `expireComponents(context)`, the depth cap. Replaces `conditions.ts` and `effects/stimulus.ts` |
| `verb-resolve.ts`    | Reply to item, stack, verb and target (the five steps under "From a reply to a running verb"). Replaces `verb-use.ts`, `verb-chosen.ts`, `verb-offers.ts` and the name-resolution half of `verb-aim.ts`     |
| `verb-runner.ts`     | Check all steps, run to the next pause, resume, finish, cancel; the events table. Absorbs `verb-checks.ts` and `verb-hits.ts`                                                                               |
| `verb-approach.ts`   | Walking to the item and target first, and the chase, as today                                                                                                                                               |
| `prompt-entities.ts` | The prompt lines, grouping and reply enums described above                                                                                                                                                  |
| `world-access.ts`    | `buildPerceptionWorld` and `buildWalkingGrid` call `world-physics.ts`                                                                                                                                       |

Other touch points:

- `status/health.ts`, `sim/damage.ts`: read health with `readAgentHealth`; `applyDamage` is called
  by `thing-writes.ts` and by starvation.
- `economy/sleep.ts`, `sim/action-stopping.ts`: unchanged mechanics, called from the `sleep` step;
  the bed is the run's item.
- `economy/give.ts`: `give` moves entities to `{ kind: "inside", holderId }`. It stays its own
  action.
- `seeds.ts`, `world/map-loader.ts`, `items/load-items.ts`: drop `requiredForm`; reject
  `agentBody` in the map and inventories; reject agent ids starting with `entity-`.
- `decision/*`: the reply gains `from` (nullable enum, like `target`); `PlannedUse` collapses to
  the reply's names, resolved by `verb-resolve.ts` when the action is applied.
- `llm/fake-responder.ts`: builds `item` for things here as well as held, fills `from` for inside
  items, and finds attack verbs as "verbs with a `roll_hit` step" (`listHitRollVerbNames`).
  `fakeLlm.itemChoosingVerbs` goes away.

### Wire and client

- `Entity` on the wire is the new shape (`changes`, `inside`).
- The snapshot carries `componentDeclarations` (replacing `conditionDefinitions`) and the `world`
  settings, beside `itemDefinitions`. With these and `resolveComponents`, the client derives
  everything it shows; it still computes no sim state.
- `Agent` on the wire has `bodyChanges` and no `health` or `conditions`. The client reads health
  with a shared `readAgentHealth(agent, catalog)`. A buried agent has `bodyReplacedById` set, and
  the viewer stops drawing its body (`isBodyInWorld`).
- Client files that read the old shape and must move to the shared helpers:
  `format/conditions.ts`, `format/character-sheet.ts`, `state/apply-server-message.ts`,
  `ui/OverviewTab.tsx`, `ui/RosterRail.tsx`, `village/AgentMarker.tsx`,
  `village/EntityConditionOverlays.tsx`, `village/HoverCard.tsx`, `village/tile-inspection.ts`,
  `village/entity-glyphs.ts`, `village/VillageWorld.tsx`, `fixtures/sample-data.ts`,
  `client/scripts/mock-server.ts`.
- Condition chips and overlays become "components with `words` that are visible". The overlay
  keeps its CSS class per component name (`condition-burning`), which is styling, not sim logic.
- `WorldEventKind`: remove `dropped`, `picked_up`, `threw`, `put`, `took`, `posted_note`, `broke`,
  `caught_fire`, `stopped_burning`, `condition_started`, `condition_ended`; add `announced`.
  `format/event-feed.ts` and `format/conversations.ts` map kinds and need the same edit.

### Persistence

- `entities.state` becomes `entities.changes` (JSON), and `location` uses the new shape.
- The agent row is the `Agent` JSON as today; `currentAgentFieldsSchema` in `world-repository.ts`
  requires `bodyChanges` and no longer `health` or `conditions`, so an old save fails with the
  existing "run `make reset`" message.
- The agent runtime's `verbRun` uses the new `VerbRun` schema. On load, a run whose `verbName`
  doesn't match the verb at `verbIndex` is dropped and the agent's action cleared.
- `findOrphanedEntities` stays.
- The meta table keeps `nextFreshId`, the counter `newId` values come from, and the agent row
  requires `bodyReplacedById`.

### Config

Removed: `doors`, `verbs.landingStimulus`, `verbs.movePhrases`, `verbs.livingHolderReason`,
`conditions.defaultStartedPhrase`, `conditions.defaultEndedPhrase`, `conditions.eventKinds`,
`effects.thingBrokeDescription`, `combat.brokePhrase`, `economy.currencyDefinitionId`,
`noticeBoard`, `llm.fakeResponder.itemChoosingVerbs`.

Added or renamed: `rules.maxDepth` (was `reactions.maxDepth`), `perception.contentsReachTiles`,
`verbs.maxTextChars` (was `noticeBoard.maxNoteChars`), `reading.thingsShownOnRead` (was
`noticeBoard.notesShownOnRead`), and `reading` memory templates ("I read a note from {author} on
the {holder}: \"{text}\"", and the forms without an author or a holder, and "there was nothing to
read").

Unchanged: everything under `health`, `combat` formulas, `death`, `needs`,
`conditions.causedBySuffix`, `verbs.defaultPhrases`, `verbs.selfTargetName` and the perspective
words, `perception.groundWords`, `perception.contentsWords`.

### Build order

Each phase ends with `make check` and `make test` passing and its own commit, and each rewrites
`seeds/items.json`, `server/src/sim/test-seeds.json` and `shared/src/items/test-item-file.ts` as
far as that phase's schema goes. Saved sims from before a phase can't load; the server says to run
`make reset`. Existing tests that pin replaced behavior are rewritten, not worked around.

1. **Data only.**
   - Component declarations with field options; properties and conditions fold into components.
   - `changes` replaces `EntityState`; `bodyChanges` replaces `Agent.health` and
     `Agent.conditions`; `resolveComponents`; `things.ts` and `thing-writes.ts`.
   - `person` becomes a definition; `inventory` becomes `inside`; `form` and `weight` become
     `holdable`; `durability` becomes `health` with no toughness.
   - The `world` block and `world-physics.ts` replace `openable`, `blocking`,
     `isVisibleWhenCarried` and `currencyDefinitionId`.
   - Wire, client and persistence follow the new shapes.
   - Verbs, effects and reactions keep their current shape, reading through `things.ts`.
   - Done when: no code reads `entity.state`, `agent.health` or `agent.conditions`.
2. **Matchers and the rule engine.**
   - `has` / `definition` / `field` / `where` replace the `appliesTo` terms and the reaction's
     `property` / `condition` / `unless`.
   - `rules` with `every`, `stimulus`, `becomes` replace reactions, `everyMinute`, `onEnd`, stock
     regrowth and `onBroken`. `announce` exists (as an effect for now).
   - Done when: `conditions.ts`, `stock.ts`'s regrowth and `breaking.ts`'s `onBroken` are gone, and
     burning, bleeding, breaking and regrowth behave as before in their tests.
3. **Steps.**
   - Verbs and rules list `steps`. The runner runs around `wait`, `sleep` and `roll_hit`, with the
     events table. The twenty handlers replace the effect handlers.
   - Doors (`closed`, in passing), stock (`check` + `change`), sleep and notes (`note` entities,
     `read`) move into `items.json`.
   - Done when: `sim/effects/` is gone and no code names a component.
4. **Roles and the reply.**
   - `appliesTo` and `target` as matchers, the stack, `from`, first match wins,
     `verb-resolve.ts`. The `chosen`, body and user special cases are deleted. Prompt templates
     and the fake responder follow.
5. **Perception and prompts.**
   - `canSeeInto` and `contentsHiddenBy`; lines from `words`; grouping by identical line.
6. **Editor**, then `AGENTS.md`, `BRIEF.md` and the note at the top of `ITEMS-AND-STATUS.md`.

### Tests

The existing behavior tests carry over with new fixtures. New ones, named by behavior:

- resolving components: from the definition, with an override, with a removal, with an addition;
  an entry that matches the definition being dropped
- each write operation, clamping to a literal and to a sibling field, extending a timed component,
  and the same on a body
- lowering a living agent's health field waking a sleeper and settling death; writes to a dead
  agent's health doing nothing
- each matcher term on entities and bodies, each `where` value, and the guaranteed components
- resolving a reply: held before here before inside; `from`; first match wins; the stack taking
  fewer than asked; a target that doesn't match
- running a verb: a refusal leaving nothing changed; steps above and below a `wait`; an
  interrupted verb; a target that stopped matching during the `wait`; steps after a missed roll,
  with and without `evenOnMiss`; reading a destroyed item from its snapshot
- each step type
- `use_up` taking from inside the item, and a later step reading what it took by its `as` name
- `move` and `create` refusing over a `limit` read from a field, and refusing self-nesting
- `stimulus` rules judged against the same moment; `becomes` firing once on the change, not at
  creation and not on a transform; `every` firing once per multiple at any `minutesPerTick`; a rule
  skipped after an earlier one destroyed the thing; the depth cap; the source agent carried along
- a closed door blocking sight, sound and walking through the world settings; a walker opening it
  in passing; a locked one turning the walker away
- taking from a chest, from a held container and from a body; not seeing inside a living person
- a posted note being read, taken, handed over and read by the next holder
- prompt lines from `words`; grouping identical lines
- validation: each error and warning above

## Appendix: the shipped content

The shipped `seeds/items.json` is described in `VILLAGE-ITEMS.md`. The content this document was
first built against has been replaced.

## Open choices

Decisions made to get to a complete design. Each is flagged for the project owner; implementers
should not change them without asking.

1. **A verb is one ordered list, split by `wait`.** Position replaces `when` and `requiresHit`.
   The cost is that order now carries meaning: a `destroy` above the `wait` happens at the start.
2. **Needs, stats and sleep are not components.** They stay on the agent and are reached only
   through steps. Making them components would let `change` do what `change_need` does, at the
   price of more world settings pointing at them.
3. **No toughness.** A tougher thing has more health. Same results as today for the shipped items.
4. **A limit belongs to the `move` step, not to the world.** Anything can hold things; a verb
   decides whether to respect a number. A verb that leaves out `limit` can overfill.
5. **`alive` is a tag kept by a rule**, not something the engine maintains. Deleting that rule
   would leave bodies matched as alive by the other rules.
6. **Start and end events of a component are `announce` steps** in `becomes` rules rather than
   phrases on the component, so components stay data only. It costs two short rules per
   condition-like component.
7. **Notes are things.** A full board refuses new notes rather than dropping the oldest, and notes
   can be taken down, carried and handed over.
8. **The reply changes.** Placed things move from `target` to `item`, and `from` is added.
9. **First match wins** for same-named verbs.
10. **`give` stays its own action.** It could now be a verb, but it has its own events and gives
    the recipient a decision.
11. **Small behavior changes:** stock shows as a count ("6 left"); moving things is announced with
    the verb's own phrases rather than five event kinds; dead bodies can be thrown at but not
    attacked or shot (their health is 0); first-visit memories list doors with the other objects.

## Confirmed choices

Agreed with the project owner on 2026-11-11. These are settled.

1. **`item` is always an entity.** People can only be targets, as today.
2. **Things are grouped when their prompt lines are identical**, not when they have no state.
3. **A breaking thing is always its own event** ("the jar broke"), whoever caused it.
4. **A fragile thing hit by `impact` has its health set to 0**, so one set of breaking rules covers
   falls, wear and attacks.
