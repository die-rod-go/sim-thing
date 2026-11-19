Stupid ai generated readme read at your own risk but the instructions should be correct for the most part.

# Village Sim

A browser-viewable village simulation. A handful of LLM-driven agents walk a 2D tile map, use
items, talk to each other, and carry memory, needs, goals and a slowly changing personality. Code
handles physics, perception, time and memory plumbing; the LLM decides what agents do, say and
believe.

## Requirements

- Node.js 20.12 or newer
- `make` (optional: every target is a thin wrapper around an `npm` script)
- An API key for an OpenAI-compatible endpoint (OpenRouter by default) or Anthropic, unless you run
  with the fake LLM

## Getting started

```sh
make install          # or: npm install
cp .env.example .env  # then edit .env
make dev              # or: npm run dev
```

Open the URL Vite prints (usually http://localhost:5173). The sim server runs on `SIM_PORT`
(8787 by default) and the client proxies its WebSocket to it.

### Configuring `.env`

| Variable               | Meaning                                                                         |
| ---------------------- | ------------------------------------------------------------------------------- |
| `LLM_PROVIDER`         | `openai` (any OpenAI-compatible endpoint), `anthropic`, or `fake`               |
| `LLM_BASE_URL`         | Endpoint, e.g. `https://openrouter.ai/api/v1` or `https://api.anthropic.com/v1` |
| `LLM_API_KEY`          | Your key                                                                        |
| `LLM_MODEL`            | Model for decisions and summaries                                               |
| `LLM_REFLECTION_MODEL` | Optional stronger model for the reflection passes                               |
| `SIM_PORT`             | Sim server port                                                                 |
| `SIM_DATABASE_PATH`    | Where the saved sim lives (SQLite)                                              |

To try the sim without a key, set `LLM_PROVIDER=fake`: agents act on deterministic stand-in replies.
See `.env.example` for the remaining options.

## Using the sim

The village view (`/`) shows the map, agents and speech bubbles, with controls to pause, step,
change speed, inspect an agent and read every LLM prompt and reply. Editors for the other content:

- `/characters.html` edits the agents in `seeds/agents.json`
- `/items.html` edits item definitions in `seeds/items.json`
- `/maps.html` edits `maps/village.json` (see [maps/README.md](maps/README.md))

The sim saves to SQLite as it runs and resumes on restart. Seed and map changes take effect after a
reset (`make reset`, or reset from the UI).

## Playing a character

You can play any villager yourself: select them and click **Play as** in their sheet. To start the
sim already playing someone, tick **Played by you** for that character in the character editor and
reset.

- **The clock waits for you** when your character has nothing to do, or something urgent happens
  to them: someone says their name, offers them something or attacks them. While they walk, work or
  sleep, the village runs on. A wait, which is how you listen after speaking, also ends when
  someone answers.
- **Controls:** click the map to walk there, use the arrow keys or WASD to move one tile (Q, E, Z
  and C go diagonally), and press Enter to talk. The play panel lists what is here and what you
  carry with every verb you can use, the people in sight (walk to, follow, give or trade), places
  to walk to, your needs and your journal.
- **See only what they see and hear:** on by default. It darkens what is out of sight, hides the
  people and animals there, shows only the speech your character heard (muffled lines as "…") and
  hides everyone's thoughts. The side panel still shows everything.
- **Stop playing** hands the character back to the LLM. It finds what you did in its memory as its
  own doings, plans the rest of its day and takes stock in a reflection.

While you play someone, the LLM makes no decisions for them and runs no day plan, reflection or
reality pass for them; their memory is still summarized. The other villagers treat them like
anyone else.

## Commands

| Command        | Use                                        |
| -------------- | ------------------------------------------ |
| `make install` | Install dependencies                       |
| `make dev`     | Run the sim server and the client together |
| `make check`   | Typecheck, lint and format check           |
| `make test`    | Run all tests (never calls a real LLM)     |
| `make soak`    | Full three-sim-day headless soak (minutes) |
| `make reset`   | Wipe the saved sim and reseed              |
| `make build`   | Production build of the client             |

## Repo layout

- `server/` simulation loop, world, agents, memory, LLM client, database, WebSocket server
- `server/prompts/` prompt templates (plain text)
- `server/src/config.ts` global tunables (rates, caps, budgets)
- `client/` village view and React panels
- `shared/` types and WebSocket messages used by both sides
- `seeds/` agents (`agents.json`) and item content (`items.json`)
- `maps/` Tiled map and glyph sheet
- `docs/` the design brief and notes

## Contributing

Read [AGENTS.md](AGENTS.md) for the design rule, naming and code style, and
[docs/BRIEF.md](docs/BRIEF.md) for the full design. `make check` and `make test` must pass before a
change is done.

## Troubleshooting

- **Every test fails on Windows:** run from a path with an uppercase drive letter (`C:\...`, not
  `c:\...`); Vitest is sensitive to the drive-letter case.
- **`better-sqlite3` fails to install:** it builds a native module; make sure your Node version has
  prebuilt binaries or that build tools are installed.
