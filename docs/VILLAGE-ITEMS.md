# Village items

Status: **built**. This is the item set in `seeds/items.json`: 11 harvestables, 6 workstations and
29 craftable items, on the framework in `COMPONENTS.md`. Numbers are starting values for tuning.
Where the file differs from this document, the file and `AGENTS.md` are the reference.
[As built](#as-built) lists every place the content goes beyond or reads differently from the spec.

## Core shapes

Every item interaction is one of two shapes.

1. **Source.** A thing in the world with a `stock` counter. A verb takes one harvest out, sometimes
   requiring a held tool. Stock either regrows (`regrows`) or runs out and the source turns into
   its spent form (`depletes_into`).
2. **Recipe.** A verb on a workstation. Ingredients are used up from the user's inventory. The
   result goes into the user's inventory, or onto the user's tile if it is not holdable
   (furniture).

Three global facts:

- **Each source either renews or runs out,** as its definition says.
- **Tools and weapons wear out**, and a broken item is destroyed. The holder is told it broke and
  is gone.
- **Coin stays a closed supply** (`world.closedSupply`). Prices, ownership and trade are left
  entirely to the agents.

## Gathering

Eleven harvestables. Herbs are potion ingredients.

| Harvest    | Source (spent form)    | Tool        | Per harvest   | Stock     | Renewal                         |
| ---------- | ---------------------- | ----------- | ------------- | --------- | ------------------------------- |
| wheat      | wheat field            | none        | 2             | 12        | +0.25 per hour                  |
| water      | well                   | none        | 1             | unlimited | n/a                             |
| wood       | tree (stump)           | axe         | 4             | one chop  | stump becomes a tree after 96 h |
| iron ore   | iron vein (spent vein) | pickaxe     | 1             | 8         | never                           |
| diamond    | diamond vein (spent)   | pickaxe     | 1             | 2         | never                           |
| raw meat   | pig pen                | cleaver     | 2             | 4         | +0.05 per hour                  |
| raw fish   | lake                   | fishing rod | 1, 50% chance | unlimited | n/a                             |
| chamomile  | chamomile patch        | none        | 1             | 6         | +0.1 per hour                   |
| fireweed   | fireweed patch         | none        | 1             | 6         | +0.1 per hour                   |
| mugwort    | mugwort patch          | none        | 1             | 6         | +0.1 per hour                   |
| nightshade | nightshade patch       | none        | 1             | 3         | +0.05 per hour                  |

Stock is counted in the thing harvested: each harvest takes its own count out of stock, and is
refused when less than one harvest is left. Slaughtering at the pig pen yields raw meat directly.

## Recipes

Six workstations. Ingredients come from the user's inventory; results go to the inventory, or onto
the user's tile when marked placed.

| Station         | Inputs              | Output                                        | Minutes |
| --------------- | ------------------- | --------------------------------------------- | ------- |
| oven            | wheat + water       | 2 bread                                       | 60      |
| oven            | raw meat            | cooked meat                                   | 30      |
| oven            | raw fish            | cooked fish                                   | 30      |
| brewing vat     | wheat + water       | 2 ale                                         | 90      |
| forge           | iron ore + wood     | iron                                          | 60      |
| anvil           | iron + wood         | axe, pickaxe or cleaver (one verb each)       | 60      |
| anvil           | 2 iron + wood       | sword                                         | 90      |
| anvil           | iron                | lock + its matching key                       | 60      |
| anvil           | key + iron          | the key back + a copy that fits the same lock | 30      |
| anvil           | iron                | iron ring                                     | 30      |
| anvil           | iron + diamond      | diamond ring                                  | 45      |
| carpentry table | 2 wood              | fishing rod                                   | 30      |
| carpentry table | 2 wood              | bow                                           | 60      |
| carpentry table | wood + iron         | 6 arrows                                      | 30      |
| carpentry table | wood + water        | 4 paper                                       | 30      |
| carpentry table | wood                | dice                                          | 15      |
| carpentry table | 2 wood              | lute                                          | 60      |
| carpentry table | 2 wood              | chest (placed)                                | 60      |
| carpentry table | 3 wood              | door (placed)                                 | 60      |
| carpentry table | 2 wood              | bench (placed)                                | 45      |
| carpentry table | 4 wood              | bed (placed)                                  | 90      |
| cauldron        | mugwort + water     | healing potion                                | 30      |
| cauldron        | chamomile + mugwort | antidote                                      | 30      |
| cauldron        | nightshade + water  | poison                                        | 30      |
| cauldron        | chamomile + water   | sleeping draught                              | 30      |
| cauldron        | fireweed + ale      | fire flask                                    | 30      |

Every potion takes at most two ingredients. Each herb has one job: mugwort heals, chamomile
sedates, nightshade harms, fireweed burns.

## Food and drink

Cooking roughly quintuples what meat and fish are worth, and raw food is a gamble.

| Item         | Effect                 | Spoils into spoiled food after | Risk                   |
| ------------ | ---------------------- | ------------------------------ | ---------------------- |
| bread        | hunger +0.5            | 96 h                           | none                   |
| cooked meat  | hunger +0.5            | 48 h                           | none                   |
| cooked fish  | hunger +0.4            | 24 h                           | none                   |
| raw meat     | hunger +0.1            | 24 h                           | 25% chance of poisoned |
| raw fish     | hunger +0.1            | 12 h                           | 25% chance of poisoned |
| spoiled food | hunger +0.05           | n/a                            | 50% chance of poisoned |
| ale          | fun +0.3, energy -0.05 | never                          | none                   |

Water is an ingredient and douses fire. Food poisoning from raw or spoiled food uses the `poisoned`
component and ends after 30 minutes.

## Potions

Potions act on bodies.

| Potion           | Used by                           | Effect                                                                        |
| ---------------- | --------------------------------- | ----------------------------------------------------------------------------- |
| healing potion   | drink, or give a dose to someone  | health +0.4, removes bleeding                                                 |
| antidote         | drink, or give a dose to someone  | removes poisoned                                                              |
| poison           | drink, or pour into food or drink | adds poisoned with no end time: it lasts until an antidote                    |
| sleeping draught | drink, or pour into food or drink | the drinker sleeps 120 minutes                                                |
| fire flask       | throw at a target                 | shatters on impact and sends fire to the target and its neighbours (radius 1) |

**Lacing.** A held poison or sleeping draught can be poured into a held or nearby food or drink
that isn't laced already. The potion is destroyed and the food gains a hidden component,
`laced_poison` or `laced_sleep`, that no one perceives: a laced loaf reads exactly like any other
and is counted with them. Eating or drinking a laced item applies the potion's effect to the eater.
This is one `pour into` verb per potion, and `if` blocks in `eat` and `drink` that look for the
laced components. Laced raw or spoiled food keeps its food-poisoning risk.

## Tools and weapons

Every tool and weapon starts at health 1 and loses 0.02 per use or swing, so it lasts about 50
uses. At 0 it is destroyed and the holder files "My axe broke and is gone".

| Item        | Gathers           | Damage    | Hit chance | Stimulus | Notes                                                    |
| ----------- | ----------------- | --------- | ---------- | -------- | -------------------------------------------------------- |
| fists       | n/a               | 0.05–0.12 | 0.8        | impact   | always available (`punch`)                               |
| axe         | wood              | 0.25–0.5  | 0.6        | cut      | also forces locks                                        |
| pickaxe     | iron ore, diamond | 0.2–0.45  | 0.55       | impact   |                                                          |
| cleaver     | raw meat          | 0.25–0.45 | 0.65       | cut      |                                                          |
| fishing rod | raw fish          | none      | n/a        | n/a      |                                                          |
| sword       | n/a               | 0.4–0.6   | 0.7        | cut      | conspicuous                                              |
| bow         | n/a               | 0.3–0.5   | 0.6        | cut      | range 8 tiles; uses up 1 arrow per shot; load with `put` |

Damage is scaled by the attacker's strength. Axe, pickaxe, cleaver, sword and bow are
conspicuous. Cuts start bleeding through the bleeding rule. Any holdable can be thrown.

## Locks and keys

A key opens only the lock it was made for. The lock id is a text field (`lock.lockId`,
`key.lockId`, `fitted_lock.lockId`) and the matchers compare it against a value read (see
`COMPONENTS.md`).

1. **Make.** `forge a lock` at the anvil turns 1 iron into a lock and one key; `create` writes a
   fresh id (`{ "newId": true }`) on the lock, and the key copies it.
2. **Copy.** `copy` at the anvil, aimed at a held key, turns 1 iron into a copy with the same id.
   The original stays.
3. **Fit.** A held lock is fitted to a chest or a door. The lock item is destroyed and the target
   records the lock id.
4. **Lock and unlock.** Requires holding a key whose lock id equals the target's. A door must be
   closed to lock.
5. **Effects.** A locked door can't be opened, so it blocks movement (and, closed, sight and
   sound). A locked chest hides its contents (`contentsHiddenBy`) and refuses `put` and `take`.
6. **Force.** `force open`, holding an axe: 30 minutes, loudness 20, the target takes 0.3 damage
   and loses its lock.

Keys are ordinary items: they can be given, lent, stolen or copied in secret.

## Furniture, writing and fun

| Item         | Use                                                                    |
| ------------ | ---------------------------------------------------------------------- |
| chest        | container (20 items); lockable; `inspect` counts what it holds         |
| door         | open and close; blocks movement, sight and sound when closed; lockable |
| bench        | sit: energy +0.1 per 20 minutes                                        |
| bed          | sleep                                                                  |
| paper        | `write on` it anywhere (takes text): it becomes a note                 |
| note         | holds text and author; anyone holding it or next to it can read it     |
| notice board | holds notes only; posting is `put`, so a notice costs a sheet of paper |
| dice         | roll: fun +0.1, +0.05 for each other player                            |
| lute         | play: fun +0.15 for the player and +0.1 for every agent in earshot     |

All furniture, paper, notes, dice and the lute are flammable. Furniture has health and breaks:
chest 4, door 5, bench 3, bed 3.

**Graves.** Anyone can `bury` a dead body, with no tool: 60 minutes. The body is replaced by a
grave on its tile, everything it carried drops there, and the body leaves the world (the agent's
record stays, dead). Anyone can `carve` text on a grave, and anyone can read it.

## Trinkets

Rings and diamonds are worth whatever the agents decide: a proposal, a bribe, an heirloom, proof of
a theft. Diamonds (mined, rare and finite), iron rings and diamond rings are all conspicuous.

## World rules

| Rule           | Trigger                                    | What happens                                                                     |
| -------------- | ------------------------------------------ | -------------------------------------------------------------------------------- |
| Fire           | `fire` on a flammable thing that isn't wet | burning for 30 minutes: 0.01 damage per minute, 5% chance per minute to spread   |
| Douse          | `water` on a flammable thing               | removes burning; wet for 60 minutes, and a wet thing won't catch fire            |
| Bleeding       | `cut` on flesh                             | 40% chance of bleeding for 20 minutes: 0.01 health per minute                    |
| Poison         | has poisoned                               | 0.003 health per minute until removed or expired                                 |
| Fire flask     | `impact` on an incendiary thing            | sends fire to everything within 1 tile                                           |
| Fragile        | `impact` on a fragile thing                | health set to 0                                                                  |
| Break          | health reaches 0 (not a person)            | announce "broke and is gone", then destroy                                       |
| Regrow         | every 60 minutes                           | `stock.amount` += `regrows.perHour`                                              |
| Deplete        | stock reaches 0                            | transform into the `depletes_into` form                                          |
| Grow and spoil | every 60 minutes                           | `turns_into.hoursLeft` -1; at 0, transform (stump to tree, food to spoiled food) |
| Death          | a body's health reaches 0                  | removes alive                                                                    |

Plus the status announcements: caught fire, stopped burning, started and stopped bleeding, got wet,
dried off, and (privately) was poisoned and got over the poison. Fragile things: the fire flask
and windows.

## Full item list

| Group          | Count | Definitions                                                                                                                             |
| -------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Harvested      | 11    | wheat, water, wood, iron ore, diamond, raw meat, raw fish, chamomile, fireweed, mugwort, nightshade                                     |
| Food and drink | 4     | bread, cooked meat, cooked fish, ale                                                                                                    |
| Potions        | 5     | healing potion, antidote, poison, sleeping draught, fire flask                                                                          |
| Metal          | 1     | iron                                                                                                                                    |
| Tools          | 4     | axe, pickaxe, cleaver, fishing rod                                                                                                      |
| Weapons        | 3     | sword, bow, arrow                                                                                                                       |
| Security       | 2     | lock, key                                                                                                                               |
| Furniture      | 4     | chest, door, bench, bed                                                                                                                 |
| Writing        | 2     | paper, note                                                                                                                             |
| Fun            | 2     | dice, lute                                                                                                                              |
| Trinkets       | 2     | iron ring, diamond ring                                                                                                                 |
| Other carried  | 2     | coin, spoiled food                                                                                                                      |
| Sources        | 13    | wheat field, well, tree, stump, iron vein, diamond vein, spent vein, pig pen, lake, chamomile, fireweed, mugwort and nightshade patches |
| Workstations   | 6     | oven, brewing vat, forge, anvil, carpentry table, cauldron                                                                              |
| Fixtures       | 3     | notice board, grave, window                                                                                                             |
| Body           | 1     | person                                                                                                                                  |

## As built

Choices made while building that the spec didn't settle. Ask before changing them.

- **Engine work.** Field matchers in `require`, `use_up` and `check` can compare against a value
  read; `create` takes `as`; `{ "newId": true }` makes a fresh, deterministic id; steps can run
  `on: "earshot"` (the lute, by the sound simulation: walls and closed doors muffle it); and
  `transform` on a dead body buries it. All in `COMPONENTS.md`.
- **Stock units.** Stock counts the harvested thing, so the pig pen's 4 is two slaughters and
  regrows one slaughter's worth in 40 hours.
- **Verb names.** `harvest`, `draw water`, `chop down`, `mine`, `slaughter a pig`, `fish`; recipes
  read `bake bread`, `forge an axe`, `make a bed`, `brew a sleeping draught`; potions given to
  someone else use `give a dose of` (the engine's `give` hands things over).
- **Copying a key** is aimed at the held key (`copy`, item anvil, target key), so the agent says
  which key when it holds several.
- **Notice board and bow take only their own things.** `put` has three variants: ammo into a ranged
  weapon ("load"), a note onto a notice board ("pin"), anything else into a plain container.
- **Energy costs** on labor, carried over from the previous content: chopping −0.15, mining,
  slaughtering and smithing −0.08, most crafting −0.05, brewing potions −0.03, burying −0.15.
- **Loudness**: smithing 12, carpentry 8, oven and vat 3, cauldron 2, mining and chopping 15,
  bow 3, lute 8, forcing a lock 20.
- **Dropped from the old rules**, since the spec lists only these: fire drying a wet thing, and a
  breaking window making its own sound.
- **Workstations and the well are solid and not flammable.** Nothing on the map starts locked:
  every lock has to be forged with its key.
- **Laced food that spoils** turns into ordinary spoiled food: the transform clears the lacing.
- **Water** has no drink verb.
