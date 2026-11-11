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
| `make reset`   | Wipe the saved sim and reseed              |

`make check` and `make test` must pass before any task is considered done. Once they do, commit the
finished task without waiting to be asked: one commit per task, with a short imperative message.

## Repo layout

- `server/` simulation loop, world, agents, memory, LLM client, database, WebSocket server
- `server/prompts/` prompt templates (plain text)
- `client/` village view (canvas tiles, DOM agents and bubbles) and React panels
- `shared/` types and WebSocket message definitions used by both sides
- `seeds/` agent seed file
- `maps/` Tiled map files
- `docs/` the brief and other design notes

## The design rule

**Hardcode the containers, not the meaning.** Code decides where information is stored and what an
agent can perceive. The LLM decides what agents do, say, believe and feel. Never add rule-based
social behavior: no trust scores, affinity formulas or scripted reactions. If a feature seems to
need one, ask first.

## Naming

- Use full, descriptive names. No single-letter names, including loop variables and callback
  parameters (`agents.map((agent) => ...)`, not `agents.map((a) => ...)`).
- No abbreviations except widely known ones (`id`, `url`, `json`, `llm`, `ui`).
- Variables and properties are nouns: `nearbyAgents`, `memoryStrength`, `tickCount`.
- Functions are verb phrases: `buildDecisionPrompt`, `fileMemory`, `computeSoundReach`.
- Booleans read as questions: `isAsleep`, `hasPendingDecision`, `canHear`.
- Types and classes are nouns in PascalCase: `Agent`, `Memory`, `DecisionReply`.
- Use the brief's vocabulary exactly (see Glossary). One concept, one name, everywhere.

## Code style

- TypeScript in strict mode. No `any`; use `unknown` and narrow it.
- Small functions with one job. Split a file when it passes roughly 300 lines.
- Prefer pure functions for sim logic: take state in, return new state or events out.
- Named exports only.
- No magic numbers. Every tunable value (rates, caps, weights, loudness, recipes, budgets) lives in
  the config file, as the brief requires.
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
- Cover the code-driven core with unit tests: perception (sight and sound), memory filing, recall
  scoring, forgetting, needs decay, recipes and `give`.
- Name tests by behavior: `"muffles speech heard through a closed door"`.

## Errors and logging

- Never swallow errors. Handle them, or let them surface with context.
- Use the project logger, not `console.log`.

## Security

- Never commit `.env` or log API keys. Add new environment variables to `.env.example`.

## Dependencies

- Ask before adding a dependency. Prefer the standard library and what's already installed.

## Glossary

| Term       | Meaning                                                           |
| ---------- | ----------------------------------------------------------------- |
| tick       | One step of the sim clock (1 sim-minute by default)               |
| decision   | One LLM call that returns a `DecisionReply`                       |
| intention  | The agent's current one-line goal, carried between decisions      |
| bucket     | A category of memories, set by where they came from               |
| strength   | A memory's 0–1 weight; fades by half-life, bumped by recall       |
| awareness  | The structured record of when each other agent was last perceived |
| earshot    | Whether the sound simulation lets a listener hear a sound         |
| needs      | Hunger, energy, social, fun (0–1, 1 = satisfied)                  |
| reflection | The morning, night and weekly LLM passes                          |
