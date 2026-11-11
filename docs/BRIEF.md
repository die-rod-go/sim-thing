# AI Village Sim: Implementation Brief

Nov 10, 2026 · @no

## Overview

Build a browser-viewable village simulation in which 6 LLM-driven agents (configurable) walk around a 2D tile map, use objects and items and talk to each other. Each agent has memory buckets, needs, mood, goals and a slowly changing personality. A cheap LLM drives every decision; code handles only physics, perception, time and memory plumbing.

**Design rule: hardcode the containers, not the meaning.** Code decides where information is stored and what an agent can perceive. The LLM decides what to do, what to say, what to believe and how to feel. Do not add rule-based social behavior (trust formulas, affinity scores, scripted reactions).

v1 goals:

- A running sim on a local server, viewable and controllable in the browser.
- Agents choose all actions, including routine ones, via the LLM.
- Memory is bucketed, retrieved by relevance and forgotten over time.
- Every LLM prompt and reply can be inspected in the UI.

## Stack and architecture

The simulation runs on a local Node/Bun server; the browser is only a viewer and control panel, connected over a WebSocket.

&#91;embedded content: architecture · server, browser, LLM API\]

The sim loop is the only writer of world state; the browser never calls the LLM or the database directly.

| Part      | Choice                                        | Notes                                                                                      |
| --------- | --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Language  | TypeScript everywhere                         | One `shared/` package of types used by server and client                                   |
| Server    | Node or Bun + `ws`                            | No web framework needed                                                                    |
| Storage   | SQLite (`better-sqlite3` or `bun:sqlite`)     | Agents, memories, event log; leave room for `sqlite-vec` later                             |
| LLM       | OpenAI-compatible client                      | Base URL, model and key from `.env`; works with OpenRouter or Ollama; use JSON output mode |
| Rendering | Canvas 2D + DOM (no game engine)              | Tiles drawn once to a canvas; agents, speech bubbles and overlays as DOM/SVG above it      |
| UI panels | React via Vite                                | Inspector and controls beside the village view                                             |
| Map       | Tiled JSON + a free CC0 tileset (e.g. Kenney) | Object layer places item definitions from `seeds/items.json`                               |

Suggested layout: `server/` (sim loop, world, agents, memory, llm, db, ws), `server/prompts/` (plain-text prompt templates for decision, interact, morning, night and weekly calls, so prompts can be tuned without code changes), `client/` (village view, React panels), `shared/` (types and WebSocket message definitions), `maps/` (Tiled files), `seeds/` (agent seed file).

WebSocket messages: the server pushes small events (`agent_moved`, `said`, `interacted`, `state_changed`, `tick`, `paused`); the client sends controls (`pause`, `resume`, `step`, `set_speed`, `inspect_agent`, `update_settings`, `reset`). The server also sends a full `snapshot` on connect and after reset, `settings` when speed or budget change, `event_logged` for the event feed, and `agent_detail` (agent, memories, last 20 LLM calls, personality history) in reply to `inspect_agent` and whenever the inspected agent changes. All message types live in `shared/src/messages.ts`.

Persistence: the server saves full state to SQLite every sim-hour and resumes from it on restart. A `reset` control reseeds the world from `seeds/agents.json`.

### Developer commands

The repo is a monorepo (npm or Bun workspaces: `client/`, `server/`, `shared/`), and a root `Makefile` gives the team one set of commands. Each target only calls the workspace scripts; Make adds no logic of its own.

| Command        | Does                                                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `make install` | Installs all dependencies                                                                                                     |
| `make dev`     | Runs the sim server and the Vite client together in one terminal (via `concurrently`), with labeled output; Ctrl+C stops both |
| `make check`   | Typechecks and lints every workspace                                                                                          |
| `make test`    | Runs all tests                                                                                                                |
| `make reset`   | Deletes the saved sim database and reseeds from `seeds/agents.json`                                                           |
| `make build`   | Production build of the client                                                                                                |

Mark every target `.PHONY`, indent recipe lines with tabs, and add a `make help` that lists the targets. Restarting or hot-reloading the client must never restart the sim server.

## World model

The world is ground truth and is fully code-driven: map, positions, object state, time and perception.

- **Map:** a Tiled tilemap with named places (rooms or zones such as `bakery`, `tavern`, `square`, homes) and a collision layer, about 40×30 tiles. The implementing agent generates the map JSON with a script (rooms, walls, doors and objects on a Kenney tileset), so it can still be opened and edited in Tiled later. The v1 places are listed under Economy and professions. Movement uses grid pathfinding; one tile per tick.
- **Items and objects:** everything that can be used is an **entity**, one instance of an **item definition** from `seeds/items.json` (see `docs/ITEMS-AND-STATUS.md`). A Tiled object names a placeable definition (`definition: "oven"`) and its own `name` ("bakery door") and loads as an entity on that tile; carried things (bread, wheat, coins) are entities in an agent's inventory. **Verbs** are defined once in `items.json` with an `appliesTo` rule, so the oven offers `bake bread` and any held food offers `eat`. A verb has a duration in minutes and a list of effects (use up the bread, take stock from the field, produce 4 bread, change a need). Per-item content (verbs, recipes, need effects, stock) lives in `items.json`; global tunables stay in config. Doors are entities too, with `open` and `close`; they start open, and a closed door blocks sight and muffles sound. Placed objects are drawn from their entity's sprite, not baked into the map.
- **Perception:** sight and sound, simulated as described below. This is the only gate on information.
- **Sim clock:** discrete ticks; 1 tick = 1 sim-minute (configurable). The sim starts at 06:00 on day 1. The clock advances only after every agent that needs a decision has one; LLM calls for all agents run in parallel with a concurrency limit (default 8). The UI can pause, step one tick and change speed. Speed sets the maximum ticks per real second: at 1x (0.8 ticks/s) a sim-day takes 30 real minutes, plus time spent waiting on the LLM.
- **Event log:** every world event is appended to an `events` table (tick, actor, kind, target, place, text). This drives memory writes and is kept for debugging and future replay.

### Perception: sight and sound

Agents learn about the world only through two small simulations that run in code every tick. Sound bends around corners and through doorways; sight doesn't.

- **Sight:** a raycast on the tile grid from viewer to target, blocked by walls and closed doors, range 12 tiles. Agents see other agents, what they are doing, and objects.
- **Sound:** every event has a loudness in tiles (whisper 2, normal speech 8, shout 20, chopping wood 15, oven 3; all in config). A flood fill spreads from the source over the grid: each open tile costs 1, a closed door costs 4, walls block. A listener whose path cost is within the loudness hears it clearly; within 1.5× they hear it muffled; beyond that, nothing.
- **Muffled speech:** the listener learns that someone is talking and, if it knows the voice, who, but not the words ("I heard Bob's voice from the kitchen but couldn't make out what he said"). It goes in `overheard`.
- **Heard but not seen:** a sound out of sight carries its direction and its source if recognizable ("chopping from the woodlot", "Clara's voice behind the bakery wall").
- **Obvious listeners only:** the prompt states outright that someone would hear you only when they are in sight and within normal speech reach, and it marks who is close enough to hear a whisper. For everyone else, the agent infers from its awareness record (see Memory).
- **Sleeping agents** hear only their own name or sounds at shout level or louder.
- The map is small, so run a flood fill per event; cache fills by source tile if it gets slow.

## Economy and professions

Five of the six agents have a profession tied to a workplace, and a fixed supply of coins lets them trade. Data in `items.json` defines only what each object produces; prices, deals, debts and haggling are entirely up to the agents.

&#91;embedded content: production chain · 2 raw goods, 2 products\]

The baker and tavern keeper both depend on the farmers and the woodcutter, and everyone depends on the baker, so there is pressure to trade from day one.

| Place                                     | Objects: verbs                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Homes (one per agent except the newcomer) | bed: sleep. Which home is whose is only persona and seed text, not a rule; the tavern has one spare bed |
| Town square                               | notice board: read, post a note; bench: sit                                                             |
| Farm                                      | wheat field: harvest wheat                                                                              |
| Woodlot                                   | trees: chop wood                                                                                        |
| Bakery                                    | oven: bake bread                                                                                        |
| Tavern                                    | brew kettle: brew ale; card table: play cards                                                           |

Starting verb values (all in `seeds/items.json`; tune by watching):

| Verb          | Inputs          | Outputs                                             | Ticks                                                    | Need effects                                                                                                           |
| ------------- | --------------- | --------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| harvest wheat | —               | 3 wheat (one shared field holds 12, regrows 12/day) | 60                                                       | energy −0.1                                                                                                            |
| chop wood     | —               | 2 wood (trees hold 10, regrow 10/day)               | 60                                                       | energy −0.15                                                                                                           |
| bake bread    | 2 wheat, 1 wood | 4 bread                                             | 90                                                       | energy −0.05                                                                                                           |
| brew ale      | 2 wheat, 1 wood | 6 ale                                               | 120                                                      | energy −0.05                                                                                                           |
| eat (bread)   | 1 bread         | —                                                   | 15                                                       | hunger +0.5                                                                                                            |
| drink (ale)   | 1 ale           | —                                                   | 15                                                       | fun +0.3, energy −0.05                                                                                                 |
| play cards    | —               | —                                                   | 30                                                       | fun +0.2, +0.1 more per other player at the table                                                                      |
| sit on bench  | —               | —                                                   | 20                                                       | energy +0.1                                                                                                            |
| sleep (bed)   | —               | —                                                   | until rested or woken, or the nap length the agent chose | energy + the agent's own recovery rate per hour, halved while hunger is below 0.3; other needs decay at a quarter rate |

- **Money:** a closed supply of `coin` entities. Each agent starts with 30 coins in its inventory. Nothing makes or destroys coins (validation warns if a verb could). There are no wages, set prices or shop logic: agents sell what they make by saying so and using `give`. Credit, debt, haggling and refusing to trade all emerge from talk.
- **Inventory:** an agent's inventory is every entity it carries. Prompts group identical ones ("30 coins, 3 bread (eat)"). Held items offer verbs through their components (bread has `food`: eat; ale has `drink`: drink). Any agent may use any object in v1, and everyone nearby sees it.
- **Notice board:** an object whose state is a list of short notes (author, text, tick). Reading puts the newest 5 into the reader's `seen` bucket. It gives the square a purpose: offers, prices, rumors.
- **Scarcity:** there is one wheat field, shared by both farmers, and one stand of trees, and both regrow slowly. Each agent needs about 2 bread a day, so the village needs about 3 bakes daily (6 wheat, 3 wood) plus ale, which supply only just covers. No death in v1; at zero hunger an agent just feels starving.
- **Professions are persona text, not code.** Nothing stops a baker from chopping wood or the newcomer from taking up farming.

v1 cast, 6 agents: a farmer, a second farmer competing with the first, a woodcutter, a baker, a tavern keeper, and a newcomer with no profession, no home and 10 coins. The newcomer's seed notes mention the tavern's spare bed; where they actually sleep is up to them. Everyone starts with 2 bread; the baker also starts with 4 wheat and 2 wood, and the tavern keeper with 6 ale, so day 1 doesn't open in a famine.

## Agent model

Each agent has four layers that change on different clocks: needs (minutes), mood (hours), goals (days) and personality (weeks).

```ts
interface Agent {
  id: string;
  name: string;
  place: string;
  pos: { x: number; y: number };
  personality: {
    traits: Record<
      "extraversion" | "agreeableness" | "conscientiousness" | "neuroticism" | "openness",
      number
    >; // -1..1
    core: string; // values, desires, fears, secrets (prose)
    selfImage: string; // how they see themselves; may differ from traits
  };
  body: { sleepRecoveryPerHour: number }; // seeded per agent, 0.12–0.18
  profession: string; // persona text, e.g. "baker; works at the bakery" (not enforced)
  // What it carries is the entities whose location is this agent: coins, bread, wheat...
  needs: Record<"hunger" | "energy" | "social" | "fun", number>; // 0..1, 1 = satisfied
  mood: string; // short text the agent writes itself
  goals: {
    text: string;
    why: string;
    progress: string;
    kind: "world" | "social" | "self";
  }[];
  dailyPlan: string; // written each morning
  intention: string; // from the last decision reply; see Decision reply
  currentAction: {
    kind: string;
    target?: string;
    endsAtTick: number | null;
  } | null;
  workingMemory: string[]; // last 8 events, raw
  awareness: Record<string, Awareness>; // who was around recently; see Memory
}
```

- **Needs** decay every tick in code. Traits set the rates: e.g. social decays faster for high extraversion, and being in a crowd restores social for extroverts but costs energy for introverts. Needs reach the prompt as words ("quite hungry, a bit lonely"), never numbers. Default decay per sim-day awake: hunger 1.0, energy 0.8, social 0.8 (±50% by extraversion), fun 0.6. Needs start at 0.8. Sleep has no fixed length: it ends when energy reaches 1.0, when the agent is woken (its name, or a sound at shout level, gives it a decision to wake or keep sleeping), when hunger drops below 0.1, or when a nap length it chose runs out. So a well-fed agent with a fast recovery rate sleeps briefly, and a hungry, exhausted one sleeps long and wakes hungry. Social rises 0.05 for each line the agent says or hears while taking part in a conversation; fun and energy come from the interactions in the recipe table. Decay rates, thresholds and each interaction's need effects live in config.
- **Traits** reach the prompt as words too ("quite introverted, very conscientious").
- **Mood** is text the agent updates through its action output.
- **Goals** are generated from personality at creation and revised at weekly reflection. Goals of `kind: 'self'` (e.g. become more outgoing) are allowed; they change nothing directly.
- Seed the 6 agents from a `seeds/agents.json` file with hand-written personas, private goals and secrets that conflict with each other, and a few starting people notes about each other (it's a village, so they aren't strangers). Every agent starts knowing all place names. The implementing agent drafts the six personas; they live in the seed file for the user to edit.

## Memory

Memories are short text items filed into buckets by their source, retrieved by a relevance score, and forgotten by fading unless recalled. No classifier model is needed: where a memory came from decides its bucket.

```ts
interface Memory {
  id: string;
  agentId: string;
  bucket: Bucket;
  tick: number;
  text: string; // first-person, e.g. "Bob told me the bakery closes early today"
  tags: string[]; // people, objects, places involved
  strength: number; // 0..1
}
type Bucket = "seen" | "conversations" | "overheard" | "did" | "people" | "places" | "reflections";
```

| Bucket          | Filled by                                                                           |
| --------------- | ----------------------------------------------------------------------------------- |
| `did`           | The agent's own actions and their results                                           |
| `conversations` | Speech the agent said, or heard while taking part; replaced by a summary at its end |
| `overheard`     | Speech heard while not taking part, and muffled speech                              |
| `seen`          | Other agents' actions in sight, and non-speech sounds heard                         |
| `people`        | The agent's own `note` field about a person, plus nightly rewrites of those notes   |
| `places`        | First visit to a place, objects found there                                         |
| `reflections`   | Daily and weekly reflection output                                                  |

**Writing.** One `broadcast(event)` function files each world event: the actor gets a `did` memory (so does the recipient of a give); each perceiver gets `conversations`, `overheard` or `seen`. Tags come from the event (actor, target, place) plus any known agent, object or place name found in speech text by string match. An agent is taking part if it has spoken within earshot of the speaker in the last 10 ticks. File an action once when it starts and once with its result, never per tick of walking, and skip a memory if the same actor did the same thing within the agent's last 30 ticks. Keep each memory to one sentence (200 characters or less).

**Recall.** Build a cue from the current place, the agents in the "Around you" section, nearby objects, the current action's target, and known names (agents, objects, places, by string match) found in the current conversation and the agent's intention. The intention matters because it points at what the agent is about to deal with, even before it arrives ("buy bread from Mara" pulls up memories about Mara and the bakery on the walk there). The daily plan and goals are left out: they name too much and would dilute every cue. Score each memory, then take the top k per bucket (defaults: people 3, conversations 5, seen 3, overheard 2, did 3, places 2, reflections 2):

```ts
score =
  (1.0 * tagOverlap(m.tags, cueTags)) / cueTags.length +
  0.5 * 0.5 ** (simHoursSince(m.tick) / RECENCY_HALF_LIFE_HOURS) + // recency, default 6
  0.5 * m.strength;
```

After the first pass, add the tags of the top 3 results to the cue and run a second, small pass (k = 2) for association. Every recalled memory gets `strength = min(1, strength + 0.2)`. Bump a given memory at most once per sim-hour, so the same few memories can't keep reinforcing themselves. Keep weights in config; embeddings are a later addition, so leave a hook for a `similarity` term.

**Agent-driven recall.** A `recall(query)` action searches all buckets by tags found in the query (known names, by string match) and puts results in working memory for the next few decisions.

**Awareness (short-term).** Besides the buckets, each agent keeps a small structured record of when it last perceived each other agent. Code updates it from perception every tick. This is plumbing, not interpretation.

```ts
interface Awareness {
  agentId: string;
  tick: number;
  via: "saw" | "heard" | "heard_muffled";
  place: string; // where they were, or where the sound came from
  doing: string; // "walking into the back room", "talking"
}
```

Every decision prompt renders it as an "Around you" section, for any purpose, not only speech:

> In sight, would hear you: Bob (kneading dough), Clara. Recently around, now out of sight: Dave, seen 3 min ago walking into the back room. Ed's voice, heard 5 min ago from the street.

Entries older than 60 sim-minutes drop out of the prompt but stay in the record; a recall that names an agent also returns where it was last perceived. From this, the agent infers whether someone out of view might still be listening, where someone went, or who might have witnessed something.

**Forgetting.** Memories fade unless they're used. Each memory's strength halves over its bucket's half-life (in sim-time), and each recall bumps it back up, as above. Memories the agent keeps recalling persist; the rest fade away. Delete any memory below strength 0.05. If a bucket still exceeds its cap (default 60), delete its weakest memories until it fits. Example: a did memory (1-day half-life) that is never recalled falls to 0.5 after a day, 0.25 after two, and is deleted after about 4 days. If it keeps coming up, for instance because the person it involves is often around, each recall pushes it back up and it can last indefinitely. Anything an agent wants to keep for sure, such as a debt or a promise, it can note into people, which fades over weeks.

| Bucket                  | Default half-life |
| ----------------------- | ----------------- |
| `seen`, `overheard`     | 12 sim-hours      |
| `conversations`, `did`  | 1 sim-day         |
| `places`                | 3 sim-days        |
| `people`, `reflections` | 7 sim-days        |

**Conversation summaries.** Remembered lines alone don't tell an agent what a conversation settled, so agents repeat themselves. When an agent's conversation ends (no remembered line for 15 ticks, or 30 lines piled up), one LLM call shows it the lines as it heard them, plus what it overheard during and just before (a line addressed to an agent before it has spoken is filed as overheard), and it writes one first-person summary of what it will remember: who, what about, and anything asked, agreed, promised or left open. The summary goes into `conversations`, tagged with every tag the lines had, and the lines are deleted; overheard memories are left as they are. If the call fails, the lines stay and the agent tries again 30 ticks later. Summaries are logged to `llm_calls` like any other call.

## Decision loop and actions

An agent is asked what to do only when it needs a decision. Most ticks cost no LLM call.

An agent needs a decision when:

- its current action has finished,
- it hears speech while taking part in a conversation, or hears its own name (always), or something new enters its perception, such as a person arriving or an action nearby (at most once every 10 ticks per agent, so a busy room doesn't flood the LLM), or
- a need crosses a threshold (e.g. hunger below 0.2).

For a perception interrupt mid-action, the prompt includes the current action and "continue" is a valid choice.

Each decision:

1. Build the context: persona (traits as words, core, self-image), mood, needs as words, goals, daily plan, current intention, place, nearby entities with their verbs, the "Around you" awareness section, belongings with their verbs, working memory, the current conversation (up to 12 lines heard in the last 30 ticks), recalled memories grouped by bucket, and the action menu. Target about 3,000 tokens; trim recalled memories first if over.
2. Call the LLM in JSON mode; validate the reply against a schema; retry once on invalid output or an API error (with backoff), then fall back to `wait`.
3. Execute in the world, then `broadcast` the resulting event.
4. Save the full prompt and reply to a `llm_calls` table, with token counts and latency, for the inspector.

### Decision reply

The reply is the most important interface in the sim, because every behavior passes through it. It is built for cheap models: flat, short, reasoning before commitment, and one physical act plus optional free ones.

```ts
interface DecisionReply {
  thought: string; // 1–2 private sentences: what I notice and why I'm choosing this. Not stored as memory.
  intention: string; // one line: what I'm trying to get done and why. Shown in later prompts until changed.
  say?: string; // words spoken aloud as this action starts; omit to stay silent
  volume?: "whisper" | "normal" | "shout"; // default 'normal'
  action: "walk_to" | "interact" | "give" | "recall" | "wait" | "continue";
  target?: string; // place, agent, or something here (the oven), by display name
  verb?: string; // for interact, if the agent already knows it; otherwise a second call asks
  text?: string; // for verbs that take words (posting a note)
  item?: string; // something carried, by definition name ("bread", "coin"): used by interact, handed over by give
  amount?: number; // for give
  query?: string; // for recall
  minutes?: number; // for wait (a maximum; interrupts still wake the agent) or for a nap
  note?: { person: string; text: string }; // written into the people bucket
  mood?: string; // new mood text, only if it changed
}
```

Why it looks like this:

- **Flat, not nested.** One `action` enum plus optional fields is the shape small models fill most reliably. Send it as a strict JSON schema where the provider supports structured output, with `action`, `target` and `item` as enums built from what is valid right now (nearby agents and objects, known places; held items for `item`), so invalid names can't be produced at all. Otherwise validate and retry once.
- **Thought, then intention, then the act.** Fields are generated in order, so the model reasons before it commits. Keep `thought` short; it is for choice quality and the prompt viewer, not for storage.
- **Intention is the agent's thread.** Without it, an agent that walks to the bakery to buy bread arrives with no idea why. The next prompt opens with it ("You were: going to buy bread from Mara, offering 2 coins"), and the agent rewrites it whenever it changes its mind. It bridges the daily plan and single actions.
- **Speech rides along with any action.** `say` is not an action, so an agent can talk while walking, working or handing over coins. Pure conversation is `say` plus `wait`. Speech happens on the action's first tick and costs no extra call.
- **Free mental acts.** `note` and `mood` happen alongside the action at no cost.
- **Recall asks again.** `recall` runs the search, puts results in working memory, and immediately asks for a new decision in the same tick; at most one recall per decision, so it can't loop.
- **Impossible acts fail in the world, not the parser.** A well-formed reply that can't be carried out (Bob walked out of reach, no wheat left) isn't retried. The failure is filed in `did` and working memory ("I tried to hand Bob the bread but he'd walked off"), and the agent decides again next tick, learning from it like anything else.
- **Names, not ids.** Agents use display names; the server maps them case-insensitively to ids.

| Action     | Uses                                             | Behavior                                                                                                                                                    |
| ---------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `walk_to`  | `target`                                         | Pathfind to a known place or a visible agent; ends on arrival                                                                                               |
| `interact` | `target` or `item`, `verb`?, `text`?, `minutes`? | Uses something here (`target`, walking to it first if needed) or something carried (`item`). If `verb` is missing or unknown, a second call lists its verbs |
| `give`     | `target`, `item`, `amount`                       | Hands items or coins to an agent within 1 tile, oldest first; the only way goods and money change hands                                                     |
| `recall`   | `query`                                          | Searches memory into working memory, then decides again                                                                                                     |
| `wait`     | `minutes`                                        | Idle or pause between lines of conversation; any interrupt wakes the agent                                                                                  |
| `continue` | —                                                | Keep doing the current action; offered only when interrupted mid-action                                                                                     |

There is no conversation object and no addressee. The "Around you" section shows who would obviously hear and who else was recently nearby, and the agent decides what to say and to whom in its own words, so group conversations come for free. The "current conversation" in the prompt is up to 12 lines heard in the last 30 ticks.

### Tick order and resolved details

Each tick runs in a fixed order, so runs are reproducible:

1. **Mechanics:** stocks regrow; needs decay (other needs at a quarter rate while asleep); sleepers recover energy; the crowd effect applies to those awake.
2. **Actions progress:** walkers take one step along their stored path; arrival ends `walk_to` (first visit to a place files a `places` memory); verbs finish at their end tick; sleepers wake on their own (rested, hungry, nap over); waits run out. Every event is broadcast (perceived, filed, added to working memory) as it happens.
3. **Sight:** each agent's awareness is refreshed from what it can see; someone newly in view is a new perception.
4. **Needs** that crossed the decision threshold flag a decision.
5. **Decisions** run in parallel through the concurrency limiter; the tick waits for all of them, then applies them in agent order (speech first, then the act), so the outcome doesn't depend on which call returned first. Events from this step flag decisions for the next tick (a reply to what was just said comes one tick later).
6. **Upkeep:** bucket caps are enforced, memories fade every sim-hour, old conversation lines are pruned, then the reflection hook runs.

Resolved details:

- **Doors:** pathfinding treats doors as floor. Walking onto a closed door opens it (an event everyone nearby perceives); it stays open until someone closes it with the `close` verb.
- **Voices:** in a village everyone knows everyone's voice, so a listener recognizes any agent it hears out of sight.
- **Who gets a decision:** an agent with no action decides every tick until it has one. Hearing its own name clearly, speech in a conversation it takes part in, being handed something, a need crossing its threshold, or (for sleepers) any sound loud enough to reach them always give a decision. Anything else new it perceives (someone coming into view, an action nearby, overheard speech) gives one at most once per `interruptCooldownTicks`.
- **Interact:** the verb is settled when the agent decides (including the second call when needed), then the agent walks to the object if it isn't already next to it, and the verb starts on arrival. Held items work anywhere. Everything is checked again when the act is applied; when two agents reach for the same thing, the second fails ("someone got to it first").
- **Changing course:** choosing anything but `continue` stops the current action first: a verb is cancelled with no refund (its `start` effects stay done, its `finish` effects never run), a sleeper wakes, a walk or wait ends. `give` is instant and leaves the agent free to decide again on the next tick.
- **Failures** are broadcast as `action_failed` events, so the actor files "I tried to ... but ..." in `did` and onlookers see it; the text is also shown once as "What just went wrong" in the next prompt.
- **Offline runs:** `LLM_PROVIDER=fake` replaces the LLM with a seeded stand-in that picks valid actions from the reply schema, for running without a key and for the headless soak test (`npm run soak -w @village/server`).
- **Reflection timing:** falling asleep or waking only notes which pass is due; the passes run at the end of that tick (all agents in parallel), and the clock waits for them as it waits for decisions. Reflection calls count against the token budget and are logged like decisions.
- **Reset** keeps the `token_usage` table, so resetting the world never resets the daily spend.

**Spend cap:** the server counts tokens per calendar day and pauses the sim with a banner when `DAILY_TOKEN_BUDGET` is reached (default 10,000,000). The budget is editable in config and in a UI settings field without a restart. As a rough guide, expect 6 agents to use 1–3 million tokens per sim-day; measure and adjust.

## Reflection

Three scheduled LLM passes per agent turn experience into plans, opinions and slow personality change.

**Morning (when the agent wakes from a sleep of 4 hours or more):** the agent writes its `dailyPlan` from its goals, needs and yesterday's reflection.

**Night (when the agent starts a sleep and hasn't had a night pass in the last 16 sim-hours, or at 02:00 if still awake):**

1. Write a short summary of the day plus a one-line mood entry (both stored in `reflections`).
2. Produce 1–3 insights from the day's memories, stored as high-strength `reflections` memories.
3. Optionally rewrite notes about people it interacted with (`people` bucket).
4. Delete memories that have faded below the strength threshold.

**Weekly (every 7th night, after the nightly pass):** show the agent its traits, core, self-image, goals, and the last 7 day summaries and mood entries (these survive because `reflections` has a 7-day half-life). It returns:

- proposed trait deltas, each with a reason; code clamps each to ±0.05 per week and keeps traits within −1..1;
- an optional revised `core` and `selfImage`;
- goals to keep, revise, add or drop.

Wanting to change does nothing by itself: the prompt must ask the agent to base trait changes on what it actually did and felt, not on its goals. Log every personality change to a `personality_history` table for the UI.

## Frontend UI

The page is the village view on the left and a React side panel on the right; the prompt viewer is the most important screen.

- **Village view:** the tile map, agent sprites with name labels, smooth movement between tiles, and speech bubbles for each line spoken (fade after a few seconds). Clicking an agent selects it. A debug toggle shades the selected agent's line of sight and the reach of its normal speech.
- **Top bar:** sim day and time, pause/resume, step one tick, speed (1x, 4x, 16x), count of in-flight LLM calls, total tokens used today.
- **Agent inspector** (selected agent): name, place, current action, mood, needs as bars, coins and inventory, traits as sliders (read-only), core, self-image, goals and daily plan.
- **Memory tab:** each bucket as a list with strength shown, newest first; filter by tag. A second panel shows the awareness record.
- **Prompt viewer:** the last 20 LLM calls for that agent. Each shows the full prompt with bucket sections collapsible, the raw reply and the parsed action.
- **Event feed:** a scrolling log of world events, filterable by agent or place.

## Milestones and acceptance

Build in five milestones; each ends with something visible running in the browser.

1. **World skeleton:** server tick loop, generated map loaded, agents walking random paths, WebSocket streaming to the village view, pause/step/speed working. No LLM.
2. **LLM decisions:** sight-based perception, action menu, JSON decisions, `walk_to`, `interact` (two-step), `wait`, needs decay and effects, entities and verbs from `items.json`, coins, give, notice board, prompt viewer.
3. **Memory:** buckets, broadcast filing, recall scoring with association pass, fading with recall bumps, memory tab.
4. **Talking:** `say` with the sound simulation, doors, awareness and the "Around you" section, conversation participation, `overheard`, `note`, `recall`, speech bubbles.
5. **Reflection:** morning plan, nightly reflection, weekly personality pass with clamping, personality history.

Done when:

- [ ] All 6 agents run for 3 sim-days with no crashes or stuck agents.
- [ ] Every agent action traces back to a stored LLM call visible in the prompt viewer.
- [ ] An agent mentions something it overheard but was not told directly.
- [ ] Goods change hands for coins through agent-negotiated `give`s, with nothing scripted.
- [ ] After 7 sim-days, `personality_history` shows at least one trait change with a stated reason.
- [ ] Memory per agent stays under its bucket caps after 3 sim-days.
- [ ] The LLM provider and model switch by changing `.env` only.
- [ ] All global weights, caps, decay rates, k values, loudness values and the token budget live in one config file; item content (definitions, verbs, recipes) lives in `seeds/items.json`.

misc:

using open router so set up .env with something like
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_API_KEY=sk-or-...
LLM_MODEL=anthropic/claude-haiku-5.5

for me to fill in
