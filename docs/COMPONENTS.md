# Items as components: design

Status: **proposed**. Nothing here is built. When it is, this replaces the data model, verbs,
effects, conditions, reactions and item editor sections of `ITEMS-AND-STATUS.md`. The status
sections of that document (starvation, regeneration, combat formulas, death, the Status panel)
stay as they are.

Choices that are mine rather than yours are collected under [Open choices](#open-choices) at the
end. Each one says what I picked, why, and what the alternative is.

## Why change it

The current model works, but it has more concepts than it needs and several of them know about
specific things:

| Today                                                                                                                         | The problem                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Properties, components and conditions are three concepts                                                                      | All three are "something a thing has". A property is a component with no fields                |
| Seven engine components with locked, purpose-shaped fields (`openable`, `bed`, `notes`...)                                    | `openable` is a door, `notes` is a notice board. A new kind of thing needs engine code         |
| Entity state is five hardcoded fields (`durability`, `stock`, `isOpen`, `notes`, `userIds`)                                   | A new component can't have state                                                               |
| Five effects exist for one component each (`take_stock`, `set_open`, `sleep`, `read_notes`, `post_note`)                      | Effects aren't combinable parts, they are wrappers                                             |
| `form`, `isVisibleWhenCarried`, `onBroken` sit on the definition; every carriable must have `weight`                          | Per-definition flags and a rule that exists only so `throw` can read a number                  |
| Agents are a separate case: `person`, `isUser`, `isDeadAgent`, `usedBodyId`, a hardcoded "can't take from the living"         | Every rule and effect has an agent branch                                                      |
| The used thing is the reply's `item` when held and `target` when not; `chosen` is inferred from a `move` effect's destination | The reply fields mean different things per verb, and validation needs rules to keep them apart |
| Reactions match `property` / `condition` / `unless`; verbs match `appliesTo`                                                  | Two rule languages                                                                             |
| Numbers can be read only from the used thing, only in verbs                                                                   | A reaction or a condition can't read a field                                                   |
| Prompt wording is in code ("open", "closed", "enough left for 2 more")                                                        | A new component can't describe itself                                                          |

## The model in one page

There are four kinds of data and one kind of code.

- **Component**: a named set of typed fields. No fields makes it a tag. Everything a thing _is_ or
  _has right now_ is a component: `flammable`, `weapon`, `closed`, `burning`, `asleep`.
- **Definition**: a template. An id, a name, a glyph and a list of components with field values.
  Nothing else.
- **Thing**: one instance in the world. It starts with its definition's components, and components
  can be added, removed and changed while the sim runs. Agents' bodies are things too.
- **Rule**: a query over components plus a list of effects. There are two kinds. A **verb** runs
  when an agent chooses it. A **reaction** runs when a stimulus arrives.
- **Engine system**: code. It reads a short, fixed list of **built-in components** (`health`,
  `container`, `blocks_sight`...) and does the physics the data can't: sight, sound, walking,
  containment, damage, sleep.

So a door is not an `openable`. It is a thing that sometimes has `closed`, `blocks_sight` and
`muffles_sound`, and two verbs that add and remove them. A notice board is a container that notes
are put in. Fire is a component with a reaction that runs every minute.

How it fits the design rule: components are containers. The engine decides what a thing has, where
it is and what can be perceived of it. Nothing here adds social behavior.

## Components

Every component is declared once, in `items.json`:

```jsonc
"components": {
  "flammable": { "description": "Catches fire." },
  "fragile":   { "description": "Shatters on impact.", "words": "fragile", "isVisible": true },
  "weapon": {
    "description": "Something to fight with.",
    "fields": {
      "damage":    { "type": "range" },
      "hitChance": { "type": "number", "min": 0, "max": 1 },
      "stimulus":  { "type": "text" }
    }
  },
  "stock": {
    "description": "Something that runs out.",
    "fields": {
      "capacity": { "type": "number", "min": 0 },
      "amount": {
        "type": "number", "min": 0, "max": "capacity",
        "words": [{ "below": 1, "text": "empty" }, { "text": "{value} left" }]
      }
    }
  },
  "burning": {
    "description": "On fire.",
    "words": "on fire",
    "isVisible": true,
    "minutes": 30,
    "phrases": { "added": "caught fire", "removed": "stopped burning" }
  }
}
```

| Declaration field | Meaning                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| `description`     | For the editor                                                                                         |
| `fields`          | Field name to its type and options; omitted for a tag                                                  |
| `words`           | How it reads in prompts while a thing has it ("on fire"); the component's name when omitted            |
| `isVisible`       | Whether `words` shows to agents who see the thing (default `false`)                                    |
| `minutes`         | How long it lasts when an effect adds it without saying; omitted or `null` means until removed         |
| `phrases`         | `added` and `removed`: the events seen when it starts and ends ("caught fire"). Without them, no event |

| Field option | Meaning                                                                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`       | `number`, `range`, `boolean`, `text`, or `item` (a definition id, checked by validation)                                                                                         |
| `default`    | The value when a definition doesn't give one. A field without a default must be given                                                                                            |
| `min`, `max` | For numbers: a literal, or the name of another field of the same component. Changes are clamped to it                                                                            |
| `words`      | For numbers: how the value reads in prompts. The first entry whose `below` the value is under wins; an entry without `below` always matches. `{value}` is the value rounded down |

That is the whole of what used to be properties (a component with no fields), conditions (a
component that is added at run time, usually with `minutes`) and components.

There is no difference between "constant" and "state" fields. Any field can be changed on a thing;
most never are.

### Built-in components

A built-in is a component the engine reads. Built-ins are declared in code
(`shared/src/items/built-in-components.ts`), in the same shape as the ones in `items.json`, so the
editor shows them like any other component, locked. `items.json` can't declare a component with a
built-in's name. This list is the engine's entire contact with item data: outside it, no code names
a component.

Each built-in is one physical capability, not one kind of object:

| Built-in             | Fields                              | What the engine does with it                                                                                                |
| -------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `health`             | `current` (default 1), `toughness`  | `damage` lowers `current` by amount ÷ `toughness`. At 0 the thing breaks, or the agent dies                                 |
| `container`          | `capacity`                          | Other things can be inside it. Contents move with it and spill when it is destroyed                                         |
| `hides_contents`     |                                     | Nobody can see what is inside it                                                                                            |
| `blocks_movement`    |                                     | Pathfinding treats its tile as a wall                                                                                       |
| `blocks_sight`       |                                     | Sight treats its tile as a wall                                                                                             |
| `muffles_sound`      |                                     | Sound passing its tile is muffled                                                                                           |
| `shows_when_carried` |                                     | Others see it in its holder's hands ("Tobias, carrying a knife")                                                            |
| `writing`            | `text`, `author`                    | The `read` effect files it as a memory                                                                                      |
| `asleep`             |                                     | On an agent: no perception, slower need decay, energy recovers, wakes by the existing rules                                 |
| `alive`              |                                     | On an agent: kept by the engine. Removed at death                                                                           |
| `needs`              | `hunger`, `energy`, `social`, `fun` | On an agent: a view of `Agent.needs`, so effects can change needs like any other field                                      |
| `stats`              | `strength`, `agility`               | On an agent: a view of `Agent.body`. Hit rolls and strength scaling read it                                                 |
| `in_use`             | `others`                            | Read-only, on anything: how many other agents are using it in a verb right now (the card table bonus)                       |
| `conserved`          |                                     | Validation only: warns when any rule could make or destroy a thing with it (coins). Replaces `economy.currencyDefinitionId` |

Compared with today: `durability` is `health` (things and people take damage the same way);
`openable`'s three flags become three tags that verbs add and remove; `blocking` becomes two tags;
`bed`, `stock`, `weight`, `food`, `drink`, `weapon` and `healing` are ordinary components in
`items.json`; `notes` goes away (see Notes below); `form` goes away, replaced by an ordinary
`carriable` component whose `kilograms` field is the old `weight`.

## Definitions

```jsonc
{
  "id": "knife",
  "name": "knife",
  "plural": "knives",
  "glyph": { "index": 47, "color": "#d0d4dc" },
  "components": {
    "carriable": { "kilograms": 0.3 },
    "shows_when_carried": {},
    "sharp": {},
    "metal": {},
    "health": { "toughness": 4 },
    "weapon": { "damage": { "min": 0.2, "max": 0.4 }, "hitChance": 0.7, "stimulus": "cut" },
    "breaks_into": { "item": "broken_knife" },
  },
}
```

`id`, `name`, `plural` and `glyph` say what it is called and how it is drawn. Everything else is a
component. `form`, `properties`, `isVisibleWhenCarried` and `onBroken` are gone.

Agents' bodies come from an ordinary definition too. It replaces the `person` block:

```jsonc
{
  "id": "person",
  "name": "person",
  "glyph": { "index": 2, "color": "#ffffff" },
  "components": {
    "alive": {},
    "flesh": {},
    "flammable": {},
    "health": { "toughness": 1 },
    "container": { "capacity": 1000 },
    "hides_contents": {},
    "needs": {},
    "stats": {},
  },
}
```

`config.agents.bodyDefinitionId` names it. The map can place any definition and a seed inventory
can hold any definition; the "must be placeable" and "must be carriable" checks go away with
`form`.

## Things

A thing is an entity or an agent's body. All item code addresses both through one reference and
one small module (`server/src/items/things.ts`), which is the only place that knows they are stored
differently:

```ts
type ThingRef = { kind: "entity"; entityId: string } | { kind: "agent"; agentId: string };

interface ComponentInstance {
  /** Field values that differ from the definition's. */
  fields: Record<string, FieldValue>;
  /** Null: lasts until removed. */
  endsAtTick: number | null;
  /** Who caused it, for death causes. */
  sourceAgentId: string | null;
}

/** What differs from the definition: a changed or added component, or null for a removed one. */
type ComponentChanges = Record<string, ComponentInstance | null>;

interface Entity {
  id: string;
  definitionId: string;
  label: string | null;
  location: { kind: "tile"; place: string; pos: Position } | { kind: "inside"; holderId: string };
  changes: ComponentChanges;
}
```

- `EntityState` and its five fields are gone. A door being closed, a field's stock, a knife's wear
  and a jar being on fire are all entries in `changes`.
- Storing only the differences keeps the definition as the reference: editing a definition changes
  every existing thing of it on the next start. It also makes "plain" trivial: an entity can be
  counted with others of its definition ("3 bread") when `changes` is empty, it has no label and
  nothing is inside it. `isStateless` no longer lists fields.
- An agent gets `Agent.components: ComponentChanges` in place of `Agent.health` and
  `Agent.conditions`. `needs` and `stats` are views: reading or writing their fields reads or
  writes `Agent.needs` and `Agent.body`, so the needs loop and the seeds don't change.
  `Agent.death` stays as the record of when and why.
- An inventory is the things inside the agent's body: `{ kind: "inside", holderId: agentId }`. The
  separate `inventory` location kind goes away.
- `userIds` is gone. Who is using a thing is read from the verbs agents are running, which is what
  `in_use.others` reports.
- Adding a component a thing already has extends it to the later end, as conditions do now.

The module exposes `readComponents`, `hasComponent`, `readField`, `writeField`, `addComponent`,
`removeComponent`, `locateThing`, `listContents` and `describeThingName`. Rules, effects, prompts
and validation use only these.

## Rules

One rule language is used everywhere a rule appears: a verb's `item` and `target`, and a reaction's
`if`.

| Term                                                         | Matches                                                        |
| ------------------------------------------------------------ | -------------------------------------------------------------- |
| `{ "has": "food" }`                                          | A thing that has the component now                             |
| `{ "definition": "oven" }`                                   | A thing of that definition                                     |
| `{ "field": "stock.amount", "atLeast": 3 }`                  | A field comparison: `atLeast`, `below` or `equals`             |
| `{ "where": "held" }`                                        | Where it is, relative to the agent doing the verb (verbs only) |
| `{ "anyOf": [...] }`, `{ "allOf": [...] }`, `{ "not": ... }` | Combinations                                                   |

`where` is one of `held` (inside the user's own body), `here` (on a tile), `inside` (inside a
container or body the agent can see into) and `self` (the user's own body).

`component`, `property`, `form`, `location`, `isUser` and `isDeadAgent` are replaced by these.
A dead agent is a thing without `alive`.

### Values

Any number, range or text in a rule's effects can be a literal or read from a field:

- `{ "from": "item.weapon.damage" }` takes the field as it is.
- `{ "value": 0.02, "times": "item.carriable.kilograms" }` multiplies a literal by a number field.

A path is `<role>.<component>.<field>`. The roles are `user`, `item`, `target` and `self`, plus
`choice` for what the decision supplied (`choice.amount`, `choice.minutes`, `choice.text`) and
`<role>.name` for a thing's name. Reactions can read fields now, through `self`.

Validation keeps today's guarantee, for every role: a rule may read a component only if the rule
that picks that role guarantees it.

## Verbs

A verb names up to two things, each picked by a rule:

- `item`: the thing the verb is done with or to. The held knife, the oven, the coin in the chest.
  A verb without an `item` rule is done bare-handed (`punch`).
- `target`: what it is aimed at, for verbs that have one.

```jsonc
{
  "name": "attack",
  "item": { "allOf": [{ "has": "weapon" }, { "where": "held" }] },
  "target": { "has": "health" },
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
    {
      "type": "damage",
      "on": "item",
      "amount": { "min": 0.02, "max": 0.02 },
      "requiresHit": false,
    },
  ],
  "phrases": { "hit": "hit {target} with a {item}", "missed": "...", "killed": "..." },
}
```

| Verb field  | Meaning                                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| `name`      | What the agent says it does                                                                                       |
| `item`      | Rule for the thing used; omitted for a bare-handed verb                                                           |
| `target`    | Rule for what it is aimed at; omitted for a verb with no target                                                   |
| `reach`     | Tiles from the user to the item and to the target. Held things are always in reach                                |
| `minutes`   | How long it takes                                                                                                 |
| `loudness`  | Sound reach while it runs; `null` if silent                                                                       |
| `takes`     | Which of the decision's extras it uses: `amount`, `minutes`, `text`                                               |
| `holding`   | Other things the user must hold: `[{ "rule": ..., "count": 2, "isUsedUp": true }]`. Replaces `inputs` and `tools` |
| `inPassing` | A walker blocked by a thing this verb applies to does the verb and walks on (opening a door)                      |
| `hitRoll`   | As today                                                                                                          |
| `effects`   | The ordered effects                                                                                               |
| `phrases`   | As today, with `{item}`, `{target}`, `{from}` (what the item was inside) and `{actor}`                            |

What this removes:

- `target: none | agent | entity | agent_or_entity` and `canTargetSelf`. The target rule says it:
  `{ "has": "alive" }` is any living person, `{ "has": "health" }` anything that can be damaged,
  and `{ "not": { "where": "self" } }` keeps a verb off its user.
- `chosen`. "Take 5 coins from the chest" is the verb `take` with the coins as its `item`
  (`where: inside`). "Put 2 bread in the chest" is `put` with the bread as `item` and the chest as
  `target`. With `takes: ["amount"]`, effects on `item` apply to that many identical things, oldest
  first.
- `isUser`, `isDeadAgent`, the `body` and `user` kinds of used thing, and `usedBodyId`. A body is a
  thing, and a bare-handed verb just has no `item`.
- The rule that an aimed verb must be used with something held, and the rule that `appliesTo` must
  never match a living agent. Both existed because `target` did two jobs.
- `minutes: null`. Sleep is no longer a verb that runs for hours (see Sleep).
- `takesText`, `inputs`, `tools`, `perOtherUser`.

Two same-named verbs may match the same thing: **the first in the file wins.** Put the special case
above the general one (a poisoned `eat` above `eat`). Validation warns only about a verb that can
never be reached. This replaces the overlap error and the `not` exclusions it forced.

### What an agent can use

A verb's `item` and `target` can be anything the agent perceives within reach: what it holds, what
is on tiles in sight, other agents, its own body, and what is inside containers it can see into.
An agent sees inside a thing when it holds it, or stands within `perception.contentsReachTiles`
of it and the thing doesn't have `hides_contents`.

That one perception rule replaces the hardcoded "nobody can take from a living agent". A person has
`hides_contents`, so nothing inside a living person can be the `item` of anyone else's verb. A
reaction removes it at death (see Reactions), and the body can be searched.

### The decision reply

| Intent            | Reply                                                              |
| ----------------- | ------------------------------------------------------------------ |
| Bake at the oven  | `verb: "bake bread"`, `item: "oven"`                               |
| Eat bread         | `verb: "eat"`, `item: "bread"`                                     |
| Stab Tobias       | `verb: "attack"`, `item: "knife"`, `target: "Tobias"`              |
| Punch Tobias      | `verb: "punch"`, `target: "Tobias"`                                |
| Bandage yourself  | `verb: "use"`, `item: "bandage"`, `target: "yourself"`             |
| Drop 2 bread      | `verb: "drop"`, `item: "bread"`, `amount: 2`                       |
| Put 2 bread away  | `verb: "put"`, `item: "bread"`, `target: "chest"`, `amount: 2`     |
| Take Mara's coins | `verb: "take"`, `item: "coin"`, `from: "Mara's body"`, `amount: 5` |

`item` is always what the verb's `item` rule picked and `target` always what its `target` rule
picked. The one new field, `from`, names the container or body an `inside` item is in; it is needed
only when two containers in reach hold the same thing.

## Effects

Twelve effect types, none tied to a user-defined component. The modifiers (`on`, `chance`, `when`,
`requiresHit`, `radius`) work as today. `on` is `user`, `item`, `target`, `self` or `nearby`.

| Effect       | Parameters                                 | Does                                                                                                                                                              |
| ------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `add`        | `component`, `minutes?`, `fields?`         | Adds a component, for `minutes` or its declared default                                                                                                           |
| `remove`     | `component`                                | Removes a component                                                                                                                                               |
| `set`        | `field`, `to`                              | Sets a field (`"field": "writing.text"`)                                                                                                                          |
| `change`     | `field`, `by`, `isAllOrNothing?`           | Adds to a number field, clamped to its `min` and `max`. With `isAllOrNothing`, the verb can't start unless the whole change fits (harvesting from an empty field) |
| `damage`     | `amount`, `stimulus?`, `scaledByStrength`  | Lowers `health.current` by amount ÷ toughness, then sends the stimulus                                                                                            |
| `emit`       | `stimulus`                                 | Sends a stimulus                                                                                                                                                  |
| `produce`    | `item`, `count`, `into` or `at`, `fields?` | Makes new things, optionally with field values (a note with its text)                                                                                             |
| `move`       | `into` or `at`                             | Moves the thing                                                                                                                                                   |
| `transform`  | `into`                                     | Becomes another definition where it is. `changes` are dropped                                                                                                     |
| `destroy`    |                                            | Removes the thing; its contents spill                                                                                                                             |
| `make_sound` | `loudness`                                 | A one-off sound                                                                                                                                                   |
| `read`       |                                            | The user reads the thing's `writing`, or that of each thing inside it, into `seen` memories                                                                       |

`into` and `at` take a role. `into: "user"` is the user's inventory and `into: "target"` is inside
the target, which must be a `container` with room. `at: "user"` is the tile at the user's feet and
`at: "target"` is the target's tile; after a missed hit roll it is a free tile next to it.

What each old effect becomes:

| Old                                                  | New                                                                                |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `add_condition`, `remove_condition`                  | `add`, `remove`                                                                    |
| `change_need`                                        | `change` on `needs.hunger` and the rest                                            |
| `perOtherUser`                                       | A second `change` with `"by": { "value": 0.1, "times": "item.in_use.others" }`     |
| `heal`                                               | `change` on `health.current`                                                       |
| `wear`                                               | `damage` with no stimulus (it already was)                                         |
| `take_stock`                                         | `change` on `stock.amount` with `isAllOrNothing`                                   |
| `set_open`                                           | `add` and `remove` of `closed`, `blocks_sight`, `muffles_sound`, `blocks_movement` |
| `sleep`                                              | `add` `asleep` on `user`                                                           |
| `post_note`                                          | `produce` a `note` `into` the board, with `writing` fields                         |
| `read_notes`                                         | `read`                                                                             |
| `move` to `ground` / `user` / `item` / `target_tile` | `move` `at: user` / `into: user` / `into: target` / `at: target`                   |
| The thrown item's landing `impact` (from config)     | An explicit `emit` after the `move` in `throw`                                     |
| `onBroken`                                           | Reactions to `broken`                                                              |

`move` no longer picks one of five event kinds from where things went. A verb is announced with its
own phrases ("took {item} from {from}"), like every other verb.

## Reactions

A reaction is the only kind of rule that runs by itself: when a stimulus reaches a thing its `if`
matches, run effects with that thing as `self`.

```jsonc
{
  "to": "fire",
  "if": { "allOf": [{ "has": "flammable" }, { "not": { "has": "wet" } }] },
  "effects": [{ "type": "add", "component": "burning" }],
}
```

Stimuli sent by effects (`fire`, `impact`, `cut`, `water`) are free names, as today. The engine
sends four of its own:

| Engine stimulus | Sent to                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------- |
| `minute`        | Everything, once per sim-minute                                                             |
| `hour`          | Everything, once per sim-hour                                                               |
| `broken`        | A thing whose `health.current` reached 0. If no reaction matches, it is destroyed, as today |
| `died`          | An agent's body, after its death is settled                                                 |

So there is no separate "every minute" mechanism and no regrowth system:

```jsonc
{ "to": "minute", "if": { "has": "burning" }, "killed": "burned to death",
  "effects": [
    { "type": "damage", "amount": { "min": 0.01, "max": 0.01 } },
    { "type": "emit", "on": "nearby", "radius": 1, "stimulus": "fire", "chance": 0.05 }
  ] },
{ "to": "hour", "if": { "has": "regrows" },
  "effects": [{ "type": "change", "field": "stock.amount", "by": { "from": "self.regrows.perHour" } }] },
{ "to": "broken", "if": { "has": "breaks_into" },
  "effects": [{ "type": "transform", "into": { "from": "self.breaks_into.item" } }] },
{ "to": "died", "if": { "has": "hides_contents" },
  "effects": [{ "type": "remove", "component": "hides_contents" }] }
```

The rest is unchanged: every matching reaction runs in file order, each judged against the receiver
as it was when the stimulus arrived; chains stop at `reactions.maxDepth`; the agent who started a
chain stays its source; a reaction that damages `self` needs a `killed` phrase.

`minute` and `hour` are not really delivered to every thing. The engine keeps, per reaction, the
things that currently have the components its `if` requires, and updates that when components are
added or removed.

## How today's content looks

### Doors

```jsonc
// definition
{ "id": "door", "name": "door", "plural": "doors", "glyph": { "index": 43, "color": "#e0b060" },
  "components": { "door": {}, "flammable": {}, "health": { "toughness": 5 } } }

// verbs
{ "name": "close", "item": { "allOf": [{ "has": "door" }, { "not": { "has": "closed" } }] },
  "minutes": 1, "loudness": 3,
  "effects": [
    { "type": "add", "on": "item", "component": "closed", "when": "start" },
    { "type": "add", "on": "item", "component": "blocks_movement", "when": "start" },
    { "type": "add", "on": "item", "component": "blocks_sight", "when": "start" },
    { "type": "add", "on": "item", "component": "muffles_sound", "when": "start" }
  ] },
{ "name": "open", "item": { "has": "closed" }, "inPassing": true, "minutes": 1, "loudness": 3,
  "effects": [ /* the four removes */ ] }
```

`closed` is an ordinary component with `"words": "closed", "isVisible": true`. A walker reaching a
closed door opens it in passing because `open` says `inPassing`; `config.doors` and the door code
in `walking.ts` go away. A destroyed door blocks nothing because it no longer exists; no rule is
needed to say so.

A lockable door is then pure data: a `locked` tag, `open` gets `{ "not": { "has": "locked" } }` in
its rule, and an `unlock` verb has `"holding": [{ "rule": { "definition": "key" } }]`. Because
`open` no longer applies, walkers can't pass and pathfinding goes around.

### Eating, harvesting, cards

```jsonc
{ "name": "eat", "item": { "allOf": [{ "has": "food" }, { "where": "held" }] }, "minutes": 15,
  "effects": [
    { "type": "destroy", "on": "item", "when": "start" },
    { "type": "change", "on": "user", "field": "needs.hunger", "by": { "from": "item.food.hunger" } }
  ] },
{ "name": "harvest", "item": { "has": "harvestable" }, "minutes": 60, "loudness": 4,
  "effects": [
    { "type": "change", "on": "item", "field": "stock.amount", "by": -3,
      "isAllOrNothing": true, "when": "start" },
    { "type": "produce", "on": "user", "item": { "from": "item.harvestable.gives" },
      "count": 3, "into": "user" },
    { "type": "change", "on": "user", "field": "needs.energy", "by": -0.1 }
  ] },
{ "name": "play cards", "item": { "definition": "card_table" }, "minutes": 30, "loudness": 6,
  "effects": [
    { "type": "change", "on": "user", "field": "needs.fun", "by": 0.2 },
    { "type": "change", "on": "user", "field": "needs.fun",
      "by": { "value": 0.1, "times": "item.in_use.others" } }
  ] }
```

With a `harvestable { gives }` component the wheat field and the trees can share one verb, or keep
two; both work.

### Moving things

```jsonc
{ "name": "pick up", "item": { "allOf": [{ "has": "carriable" }, { "where": "here" }] },
  "takes": ["amount"], "effects": [{ "type": "move", "on": "item", "into": "user" }] },
{ "name": "take", "item": { "allOf": [{ "has": "carriable" }, { "where": "inside" }] },
  "takes": ["amount"], "effects": [{ "type": "move", "on": "item", "into": "user" }] },
{ "name": "drop", "item": { "where": "held" },
  "takes": ["amount"], "effects": [{ "type": "move", "on": "item", "at": "user" }] },
{ "name": "put", "item": { "where": "held" },
  "target": { "allOf": [{ "has": "container" }, { "not": { "has": "alive" } }] },
  "takes": ["amount"], "effects": [{ "type": "move", "on": "item", "into": "target" }] },
{ "name": "throw", "item": { "allOf": [{ "has": "carriable" }, { "where": "held" }] },
  "target": { "not": { "where": "self" } }, "reach": 6, "hitRoll": { "baseHitChance": 0.6 },
  "effects": [
    { "type": "damage", "on": "target", "stimulus": "impact", "scaledByStrength": true,
      "amount": { "min": 0.02, "max": 0.05, "times": "item.carriable.kilograms" } },
    { "type": "move", "on": "item", "at": "target", "requiresHit": false },
    { "type": "emit", "on": "item", "stimulus": "impact", "requiresHit": false }
  ] }
```

### Sleep

`sleep` stops being a verb that lasts all night. It is a one-minute verb that adds `asleep`:

```jsonc
{
  "name": "sleep",
  "item": { "has": "bed" },
  "minutes": 1,
  "takes": ["minutes"],
  "effects": [
    {
      "type": "add",
      "on": "user",
      "component": "asleep",
      "when": "start",
      "minutes": { "from": "choice.minutes" },
    },
  ],
}
```

The sleep system (energy recovery, waking when rested, hungry, hurt or at a loud sound) keys on
`asleep` rather than on the current action. `asleep` declares `"phrases": { "added": "fell
asleep", "removed": "woke up" }`. `bed` becomes a plain tag in `items.json`.

### Notes

A note is a thing: a `note` definition with `carriable` and `writing`. The notice board is a
container.

```jsonc
{ "name": "post a note", "item": { "has": "notice_board" }, "minutes": 5, "takes": ["text"],
  "effects": [{ "type": "produce", "on": "user", "item": "note", "count": 1, "into": "item",
                "fields": { "writing.text": { "from": "choice.text" },
                            "writing.author": { "from": "user.name" } } }] },
{ "name": "read", "item": { "anyOf": [{ "has": "writing" }, { "has": "notice_board" }] },
  "minutes": 5, "effects": [{ "type": "read", "on": "item", "when": "start" }] }
```

The `notes` component, `Note[]` state and the two note effects go away. Because a note is a thing,
it can be taken down, carried, handed over, read by whoever holds it, hidden in a chest or burned,
all with verbs that already exist.

## Prompts

Nothing about wording stays in item code. For each thing an agent sees, the prompt builder lists:

1. its name, or its count with others when it is plain ("3 bread");
2. the `words` of every visible component it has ("closed", "on fire", "fragile");
3. the `words` of every number field that has them ("empty", "6 left");
4. what is inside it, when the agent can see in;
5. the verbs whose `item` rule matches it.

`describeEntityCondition`, with its "open"/"closed" and "enough left for 2 more", is deleted. An
agent's own health and need words stay in config, since they have two wordings (own and observed).

## Validation

`findItemFileProblems` stays pure and shared with the editor. It checks:

- unknown components, fields, definitions and field types, and field values outside `min`/`max`;
- a component named like a built-in;
- a read of a component the role's rule doesn't guarantee; `choice.*` without the matching `takes`;
- `on: item` or `on: target` in a verb without that rule; verb-only roles in a reaction;
- `hit` and `missed` phrases with `hitRoll`; a `killed` phrase wherever `self` or a target is
  damaged;
- warnings: a rule that matches nothing, a verb that an earlier same-named verb always shadows, a
  component nothing uses, anything that could make or destroy a `conserved` thing;
- definitions the map or seeds name.

Gone: "engine component fields must be exactly", "every carriable needs weight", "an aimed verb
must be held", "appliesTo matches living agents", and the overlap error.

## Item editor

Tabs: **Items**, **Components**, **Verbs**, **Reactions**. Properties and Conditions fold into
Components.

- **Components** is where new parts are made. A component page has its description, prompt words,
  visibility, default minutes, phrases and a field table (name, type, default, min, max, words).
  Below that: every verb and reaction whose rule requires the component, editable in place, and
  every item that has it. "+ verb" and "+ reaction" there start with `{ "has": <this> }` filled in.
  So although rules are stored in two flat lists, a component and its behavior are edited together.
- Built-ins appear in the same list with a lock and a line saying what the engine does with them.
- **Items**: name, plural, glyph and a component picker. Adding a component shows its fields. The
  page lists the verbs that apply and a preview of the prompt line, worked out live as now.
- One rule builder for `item`, `target` and `if`. One value input (literal, "from a field", "times
  a field") that offers only the fields the rule in scope guarantees.
- Effect rows: `add` and `remove` offer components; `set` and `change` offer fields of the right
  type; `produce` and `transform` offer definitions.

The editor loses its special cases: locked engine fields, the form switch, the automatic `weight`,
the `person` panel and the separate property and condition panels.

## Implementation

### Where the code changes

| Area                                                                               | Change                                                                                                                                                                   |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shared/src/items/item-file.ts`                                                    | New schema: component declarations with field options; definitions; verbs with `item`/`target`; reactions with `to`/`if`; twelve effects                                 |
| `shared/src/items/built-in-components.ts`                                          | New. The built-in list, merged into the catalog                                                                                                                          |
| `shared/src/items/applies-to.ts`                                                   | Becomes `rules.ts`: one matcher over a thing's live components, and `listGuaranteedComponents` for every role                                                            |
| `shared/src/items/entity.ts`                                                       | `Entity.changes` replaces `state`; `inside` replaces `inventory`                                                                                                         |
| `server/src/items/things.ts`                                                       | New. The thing API; the only agent-or-entity branch. Absorbs `effects/subjects.ts`                                                                                       |
| `server/src/items/stock.ts`, `entity-users.ts`, `economy/notice-board.ts`          | Deleted                                                                                                                                                                  |
| `server/src/sim/effects/*`                                                         | `special-effects.ts`, `object-effects.ts`, `need-effects.ts` deleted; a `component-effects.ts` (`add`, `remove`, `set`, `change`); `move` and `produce` take `into`/`at` |
| `server/src/sim/conditions.ts`                                                     | Becomes component timers: expiry, and sending `minute` and `hour`                                                                                                        |
| `server/src/sim/verb-runner.ts`, `verb-use.ts`, `verb-chosen.ts`, `verb-checks.ts` | One path: resolve `item` and `target` things, check `holding`, run effects. `verb-chosen.ts` deleted                                                                     |
| `server/src/sim/world-access.ts`                                                   | Sight, sound and walking read the three blocking tags; `inPassing` verbs replace the door code                                                                           |
| `server/src/economy/sleep.ts`, `status/health.ts`, `sim/damage.ts`                 | Read `asleep`, `alive` and `health` through the thing API                                                                                                                |
| `server/src/sim/prompt-entities.ts`                                                | Generic wording from `words`; contents by the perception rule                                                                                                            |
| `server/src/decision/*`                                                            | Reply: `item` always the used thing, new `from`; enums built from perceivable things                                                                                     |
| `server/src/db/*`                                                                  | `entities.state` becomes `changes`; the agent row gains `components`, loses `health` and `conditions`                                                                    |
| `client/src/item-editor/*`                                                         | As above. `DeclarationPanels`, `ConditionPanels` merge into one component page                                                                                           |
| `client` village and panels                                                        | Read `changes` (condition chips become visible components); `openable` is not read anywhere today                                                                        |
| `seeds/items.json`, `sim/test-seeds.json`, `shared/src/items/test-item-file.ts`    | Rewritten in the new shape                                                                                                                                               |
| `AGENTS.md`, `BRIEF.md`                                                            | Glossary: drop `form`, `property`, `condition`, `durability`; add `thing`, `built-in`, `rule`; update `component`, `verb`, `reaction`                                    |

### Build order

Each phase ends with `make check` and `make test` passing and its own commit. Saved sims from
before a phase can't load; the server says to run `make reset`.

1. **One kind of part.** Properties and conditions become components; declarations get field
   options. `Entity.changes` and `Agent.components` replace `EntityState`, `Agent.health` and
   `Agent.conditions`. The thing API. `person` becomes a definition and inventories become
   `inside`. Verbs and effects keep their current shape but go through the thing API.
2. **One rule language.** `has` / `definition` / `field` / `where`; reactions get `to` and `if`;
   values read from any role. Engine stimuli `minute`, `hour`, `broken` and `died` replace
   `everyMinute`, stock regrowth and `onBroken`.
3. **Generic effects.** `add`, `remove`, `set`, `change`, and `move` / `produce` with `into` and
   `at`. The built-ins are split into capabilities: doors, sleep, notes and stock move into
   `items.json`. `form` and `weight` become `carriable`.
4. **Verb roles.** `item` and `target` rules, `holding`, `takes`, `inPassing`, first match wins.
   The reply's `item` and `from`. `chosen` and the body and user special cases are deleted.
5. **Prompts.** Wording from `words`; the contents perception rule; `hides_contents`.
6. **Editor**, then the docs and glossary.

### Tests

The existing behavior tests carry over with new fixtures. New unit tests, named by behavior:

- the thing API: reading a field through the definition, through a change, and through an agent
  view; adding, extending, expiring and removing a component
- rule matching for each term on entities and agents; guaranteed components per role
- `change` clamping to a literal and to a sibling field; `isAllOrNothing` blocking a verb
- engine stimuli: `minute` reaching only things that match, `broken` falling back to destroy,
  `died` opening a body to search
- a closed door blocking sight, sound and walking; a walker opening it in passing; a locked one
  turning the walker away
- taking from a chest, from a held basket and from a body; refusing what is inside a living person
- a posted note being read, taken, handed over and read by the next holder
- first match wins among same-named verbs; the shadowed-verb warning
- grouping: things with no changes are counted together, a changed one is listed alone

## Open choices

These are decisions I made to get to a complete design. Each is easy to flip now and harder later.

1. **Rules are stored in flat lists, not inside components.** Verbs and reactions each name the
   components they need in their rule, as verbs do today (decision 16 of the previous design). The
   editor shows them on the component's page. The alternative is to nest them
   (`components.food.verbs`), which is tidier for one-component rules but has no place for
   bare-handed verbs, one-definition verbs (`play cards`) or rules that need two components.
2. **`health` for things and people.** One built-in replaces `durability`, and "durability" leaves
   the glossary. The alternative is keeping both names for the same mechanism.
3. **Notes are things.** This changes behavior: notes can be removed and carried, a full board
   refuses new notes rather than dropping the oldest, and the author is stamped by the `post a
note` verb's data, so a forging verb would be possible to write. If you want the board to stay
   an append-only record, `writing` could hold a list and keep the two note effects.
4. **The reply changes.** Placed things move from `target` to `item` ("bake bread" names the oven
   as `item`), and `from` is added. Prompts and the fake responder change with it.
5. **Privacy of pockets is data.** `hides_contents` on `person`, removed by a `died` reaction. With
   the shipped data nothing changes (no taking from the living), but deleting that tag or writing a
   verb around it is now possible in the editor. Similarly, `put`'s rule excludes living people; if
   it didn't, agents could plant things on each other.
6. **Sleep is a component.** Any verb can add `asleep`, so sleeping somewhere other than a bed
   becomes possible if a verb for it is written. The shipped data keeps it to beds.
7. **First match wins** for same-named verbs, replacing the overlap error.
8. **`conserved`** replaces `economy.currencyDefinitionId`. Coins stay a closed supply by the same
   warning.
9. **Agent state is partly viewed, not moved.** `needs` and `stats` stay on the `Agent` record and
   are exposed as components; `health` and conditions move into `Agent.components`. Moving
   everything would be purer and a much larger change to the needs and seed code.
10. **Combat stays a verb feature.** `hitRoll` and `scaledByStrength` keep their config formulas.
    They read `stats`, so they work on any thing that has it, but they are not expressible as
    plain effects.
11. **`give` stays its own action.** It could now be a verb (`move` `into: target` with a living
    target), but it has its own events and gives the recipient a decision.
12. **Stock shows as a number** ("6 left") instead of "enough left for 2 more", which was worked
    out from the verb. Thresholds with words are available if you would rather not show a count.
13. **Small behavior changes:** move events use the verb's own phrases rather than five event
    kinds; first-visit memories list doors along with other objects; a thrown thing's `impact` is
    an effect in `throw` rather than a config value.
