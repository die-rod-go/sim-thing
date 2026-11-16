# AGENTS.md

Instructions for AI coding agents (and humans) working in this repo.

## Project

A browser-viewable village simulation: LLM-driven agents with memory, needs, goals and personality.

## Commands

| Command        | Use                                        |
| -------------- | ------------------------------------------ |
| `make install` | Install dependencies                       |
| `make dev`     | Run the sim server and the client together |
| `make check`   | Typecheck and lint                         |
| `make test`    | Run all tests                              |
| `make soak`    | Full three-sim-day headless soak (minutes) |
| `make reset`   | Wipe the saved sim and reseed              |

`make check` and `make test` must pass before any task is considered done. Once they do, commit the
finished task without waiting to be asked: one commit per task, with a short imperative message.

## Repo layout

- `server/` simulation loop, world, agents, memory, LLM client, database, WebSocket server
- `server/prompts/` prompt templates (plain text)
- `client/` village view (canvas tiles, DOM agents and bubbles) and React panels
- `shared/` types and WebSocket message definitions used by both sides
- `seeds/` agent seed file (`agents.json`) and item content (`items.json`)
- `maps/` Tiled map files
- `docs/` the brief and other design notes

## The design rule

**Hardcode the containers, not the meaning.** Code decides where information is stored and what an
agent can perceive. The LLM decides what agents do, say, believe and feel. Never add rule-based
social behavior: no trust scores, affinity formulas or scripted reactions. If a feature seems to
need one, ask first.

Creatures are the one deliberate exception. They are animals, not agents, and are meant to be
scripted: they act on instincts declared in `seeds/items.json` (flee, wander, do a verb), never
through the LLM. Keep that behavior in the data, not in code, and never give agents instincts.
Everything about a creature (how far it sees, how strong it is, what provoked it) is components
on the entity: no creature settings in the config, and no creature state kept by the engine.

## Naming

- Use full, descriptive names. No single-letter names, including loop variables and callback
  parameters (`agents.map((agent) => ...)`, not `agents.map((a) => ...)`).
- No abbreviations except widely known ones (`id`, `url`, `json`, `llm`, `ui`).
- Variables and properties are nouns: `nearbyAgents`, `streamEntry`, `tickCount`.
- Functions are verb phrases: `buildDecisionPrompt`, `fileMemory`, `computeSoundReach`.
- Booleans read as questions: `isAsleep`, `hasPendingDecision`, `canHear`.
- Types and classes are nouns in PascalCase: `Agent`, `Memory`, `DecisionReply`.
- Use the brief's vocabulary exactly (see Glossary). One concept, one name, everywhere.

## Code style

- TypeScript in strict mode. No `any`; use `unknown` and narrow it.
- Small functions with one job. Split a file when it passes roughly 300 lines.
- Prefer pure functions for sim logic: take state in, return new state or events out.
- Named exports only.
- No magic numbers. Every global tunable (rates, caps, weights, loudness, budgets) lives in the
  config file, as the brief requires. Item content (definitions, components, verbs and their
  steps and their numbers, rules, world settings) lives in `seeds/items.json`, validated by the
  schema in `shared/`. No code in `server/` or `shared/` names a component from `items.json`.
- Formatting comes from Prettier and lint rules from ESLint. Don't hand-format or disable rules
  without a reason in the same line.

## Comments

- Minimal. Write code that explains itself through names and structure.
- Comment only the _why_ when it isn't obvious: a non-obvious constraint, a workaround, a
  deliberate trade-off.
- No comments that restate the code, no commented-out code, no stale TODOs.

## Simulation rules

- Sim time comes only from the sim clock, never `Date.now()`, in sim logic.
- All randomness goes through one seeded random generator, so runs can be reproduced.
- The server owns all world state. The client only renders events and sends controls; it never
  computes sim state.

## LLM calls

- All LLM calls go through the one LLM client module. No direct API calls elsewhere.
- Prompts live in `server/prompts/`, never as inline strings in code.
- Validate every reply against its schema (zod) before use. Validate incoming WebSocket messages
  the same way.
- Log every call (prompt, reply, tokens, latency) to `llm_calls` so it appears in the prompt viewer.

## Tests

- Tests never call a real LLM. Use the fake LLM client with fixed replies.
- Cover the code-driven core with unit tests: perception (sight and sound), seen places, event
  filing, the stream (appending, merging repeats), summaries (what is due, the midnight steps), passes (what is due, applying replies), needs
  decay, each step type, the verb runner,
  rules, matchers, `items.json` validation, `give` and creature instincts.
- Name tests by behavior: `"muffles speech heard through a closed door"`.
- Tests live in each workspace's `tests/` folder (`server/tests`, `client/tests`, `shared/tests`),
  mirroring the layout of its `src/`. Test-only helpers live there too; helpers that runtime code
  also uses (the fake LLM client, `test-sim` for the soak) stay in `src/`.

## Errors and logging

- Never swallow errors. Handle them, or let them surface with context.
- Use the project logger, not `console.log`.

## Security

- Never commit `.env` or log API keys. Add new environment variables to `.env.example`.

## Dependencies

- Ask before adding a dependency. Prefer the standard library and what's already installed.

## Glossary

| Term            | Meaning                                                                               |
| --------------- | ------------------------------------------------------------------------------------- |
| tick            | One step of the sim clock (1 sim-minute by default)                                   |
| decision        | One LLM call that returns a `DecisionReply`                                           |
| intention       | The agent's current one-line goal, carried between decisions                          |
| stream          | The agent's most recent events, in time order, word for word                          |
| episode         | A summary of the events that left the stream, with a time range                       |
| chronicle       | A summary of several episodes, with a time range                                      |
| day summary     | A summary of one day's chronicles. An agent has at most one: the last full day        |
| history         | One summary of everything before the day summary                                      |
| pass            | An LLM call that rewrites part of what the agent holds (people, goals, identity)      |
| person entry    | What the agent holds about one person it knows: five written fields                   |
| long-term goal  | A goal with a reason and progress, rewritten when a chronicle forms                   |
| short-term goal | A goal with a reason, steps and progress, rewritten every few episodes                |
| reality pass    | A pass that checks the agent against the world's rules and may give it one thought    |
| awareness       | The structured record of when each other agent was last perceived                     |
| earshot         | Whether the sound simulation lets a listener hear a sound                             |
| seen place      | A place the agent has seen, with the entities it held when last looked into           |
| needs           | Hunger, energy, social, fun (0–1, 1 = satisfied)                                      |
| component       | A named set of typed fields declared in `items.json`. With no fields it is a tag      |
| definition      | A template in `seeds/items.json`: id, name, glyph and components with field values    |
| entity          | One instance of a definition in the world, with its own id, location and changes      |
| body            | An agent's physical presence: an instance of the `agentBody` definition               |
| thing           | An entity or a body. Rules and steps work on things                                   |
| verb            | Something an agent can do: an `appliesTo` matcher, an optional `target`, and steps    |
| step            | One hardcoded behavior with settings (`use_up`, `wait`, `damage`). The only item code |
| rule            | Steps that run on a trigger: `every`, `stimulus` or `becomes`                         |
| matcher         | The expression that says "which things" (`has`, `definition`, `field`, `where`)       |
| stimulus        | A named message a `send` step delivers to a thing (`fire`, `impact`, `cut`)           |
| world settings  | The `world` block of `items.json`: matchers and names the engine's physics reads      |
| health          | 0–1, 1 = unhurt. At 0 the agent dies                                                  |
| stats           | `strength` and `agility`, 0–1, set per character in the seeds                         |
| status          | The UI section showing health, needs and visible components together                  |
| glyph           | How a tile or item is drawn: a CP437 index in the glyph sheet, a color, a background  |
| creature        | An entity some instinct applies to: an animal that acts with no LLM                   |
| instinct        | A creature's scripted behavior in `items.json`: `verb`, `flee` or `wander`            |
