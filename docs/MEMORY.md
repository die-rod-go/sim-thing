# Memory, people and goals: design

Status: **being built.** Phases 1 to 4 of the [Build order](#build-order) (places, the stream,
summaries, passes) are done; phase 5 (measurement) is not; "Where things are today" below describes the code before phase 1. This replaces the old
memory model, the reflection passes, dossiers and plans. Old saves do not need to load; the owner
resets.

If you are implementing this: read it all once, then work phase by phase from
[Build order](#build-order). `AGENTS.md` still applies to everything, above all the design rule:
code decides where information is stored and what an agent can perceive; the LLM decides what it
means.

Choices that are mine rather than the project owner's are listed under
[Open choices](#open-choices). Don't change them silently; ask.

## The idea

- **Memory is compressed by time.** An agent sees its most recent events word for word, and older
  time as summaries that get coarser with age: episodes, then chronicles, then one day summary,
  then one history.
- **What an agent remembers is what is in its prompt.** All of its memory is shown on every
  decision.
- **Memory compression is the clock for everything else.** When episodes and chronicles form, the
  agent rewrites what it thinks of people, its goals and who it is.
- **Places are known by sight.** An agent's list of places holds the places it has seen.

## Vocabulary

| Term            | Meaning                                                                          |
| --------------- | -------------------------------------------------------------------------------- |
| stream          | The agent's most recent events, in time order, word for word                     |
| episode         | A summary of the events that left the stream, with a time range                  |
| chronicle       | A summary of several episodes, with a time range                                 |
| day summary     | A summary of one day's chronicles. An agent has at most one: the last full day   |
| history         | One summary of everything before the day summary                                 |
| pass            | An LLM call that rewrites part of what the agent holds (people, goals, identity) |
| person entry    | What the agent holds about one person it knows: five written fields              |
| long-term goal  | A goal with a reason and progress, rewritten when a chronicle forms              |
| short-term goal | A goal with a reason, steps and progress, rewritten every few episodes           |
| seen place      | A place the agent has seen, with the entities it holds                           |

Update the `AGENTS.md` glossary and test list in the phase that builds or removes each thing.

## Settings

Every value lives in the config file, in the block named in the table. None is hardcoded.

| Setting                         | Value | Chosen by | Meaning                                                  |
| ------------------------------- | ----- | --------- | -------------------------------------------------------- |
| `memory.streamMax`              | 30    | owner     | Entries in the stream before an episode is made          |
| `memory.streamKeep`             | 5     | owner     | Newest entries left in the stream when an episode forms  |
| `memory.episodesMax`            | 6     | owner     | Episodes before a chronicle is made                      |
| `memory.episodesKeep`           | 1     | owner     | Newest episodes left when a chronicle forms              |
| `memory.earlierEpisodesShown`   | 1     | owner     | Earlier episodes the episode summarizer sees for context |
| `memory.earlierChroniclesShown` | 1     | owner     | Earlier chronicles the chronicle summarizer sees         |
| `memory.streamEntryMaxChars`    | 200   | existing  | Length limit of one entry (today's `maxMemoryChars`)     |
| `memory.episodeMaxChars`        | 345   | owner     | Length limit of an episode                               |
| `memory.chronicleMaxChars`      | 1150  | owner     | Length limit of a chronicle                              |
| `memory.daySummaryMaxChars`     | 1150  | owner     | Length limit of the day summary                          |
| `memory.historyMaxChars`        | 1700  | owner     | Length limit of the history                              |
| `memory.retryAfterTicks`        | 40    | owner     | Wait before retrying a summary or pass that failed       |
| `people.everyEpisodes`          | 3     | owner     | New episodes between runs of the people pass             |
| `people.fieldMaxChars`          | 200   | owner     | Length limit of each of a person entry's five fields     |
| `goals.shortTermEveryEpisodes`  | 3     | owner     | New episodes between runs of the short-term goals pass   |
| `goals.maxShortTerm`            | 3     | owner     | Most short-term goals                                    |
| `goals.maxSteps`                | 5     | owner     | Most steps per short-term goal                           |
| `goals.shortTermFieldMaxChars`  | 200   | owner     | Length limit of each short-term goal text                |
| `goals.maxLongTerm`             | 5     | owner     | Most long-term goals                                     |
| `goals.longTermFieldMaxChars`   | 250   | owner     | Length limit of each long-term goal text                 |
| `traits.passDeltaClamp`         | 0.003 | owner     | Most a trait moves in one identity pass                  |

Existing settings the new model uses as they are: `llm.attemptsPerCall`, `llm.replyTextSlack`,
`perception.sightRangeTiles`, `memory.participationWindowTicks`, and `traitValueDecimals`, which
moves from the `reflection` block to `traits`.

For scale: in the save measured while designing this, an agent filed about 370 to 450 events per
sim-day. With the values above that is about 7 episodes and 2 to 3 chronicles per agent per day,
counting the ones made at midnight.

## Data

- **Stream entry:** text, tick, and for merged repeats a count and an end tick.
- **Summary:** level (`episode`, `chronicle`, `daySummary`, `history`), start tick, end tick, text.
  An agent has any number of episodes and chronicles and at most one day summary and one history.
- **Person entry**, per known person: `whatIThinkOfThem`, `whatTheyThinkOfMe`, `whatIWantFromThem`,
  `whatTheyWantFromMe`, `misc`.
- **Long-term goal:** `goal`, `reason`, `progress`.
- **Short-term goal:** `goal`, `reason`, `steps` (a list), `progress`.
- **Seen place:** name, first-seen tick, and the entities there as last seen with the tick they
  were seen, or none yet when the agent has only seen the place from outside.

All of it is saved in the database and sent to the client.

## The stream

One list per agent, in time order. It holds:

- Perceived events, worded exactly as filing words them today: what the agent did, what was done
  to it, what it saw, sounds from elsewhere, speech it took part in (`Cobb said: "…"`), speech it
  overheard, muffled voices. Whether a line reads as "said" or "overheard" follows the
  participation rule in the speech log.
- Notes the code writes for the agent: a failed action and why, arriving somewhere, what a read
  note said, what an inspection counted, waking in pain, being slowed.

A new entry whose text is identical to the entry just before it is merged into that entry, which
then shows a count and a time range. Merging happens when the entry is added, so a merged entry
counts once toward `streamMax`.

## The memory pipeline

**Stream to episode.** When the stream holds `streamMax` entries, every entry except the newest
`streamKeep` goes to the episode summarizer, together with the last `earlierEpisodesShown`
episodes as context. The reply becomes one episode stamped with the ticks of its first and last
entry.

**Episodes to chronicle.** When the agent holds `episodesMax` episodes, every episode except the
newest `episodesKeep` goes to the chronicle summarizer, together with the last
`earlierChroniclesShown` chronicles. The reply becomes one chronicle. Any number of chronicles can
form in a day.

**Midnight** (the sim clock's day number going up), for every living agent, each step once:

1. Stream to episode by the rule above, whatever the stream's length. The newest `streamKeep`
   entries stay and carry into the next day.
2. Episodes to chronicle by the rule above, whatever their number. The newest `episodesKeep` stay.
3. Any passes these two steps made due (see [Order of work](#order-of-work)).
4. All chronicles to the new day summary.
5. The outgoing day summary and the existing history to the new history.
6. The new day summary replaces the old one, and the chronicles are gone.

**Rules that hold everywhere:**

- One job per agent at a time, across all summaries and passes. A job that becomes due while
  another is running waits its turn.
- Inputs are removed only when their summary comes back. Until then the agent still sees them. The
  stream may hold more than `streamMax` entries while a job runs.
- A step with nothing to summarize is skipped: a stream of `streamKeep` entries or fewer makes no
  episode, and `episodesKeep` episodes or fewer make no chronicle. On the first midnight there is
  no outgoing day summary, so step 5 is skipped.
- The day summary is always about the day that just ended. On a day with no chronicles no new day
  summary is made: the outgoing one still moves into the history (step 5), and the agent holds no
  day summary until a day makes one. What little happened that day is still in its episodes and
  stream, so nothing in the prompt is ever dated to the wrong day.
- A call that fails all its attempts leaves everything in place and is tried again after
  `retryAfterTicks`.
- Summaries are written in the first person and past tense. Each reply is one `summary` field,
  validated against its length limit with the existing slack and retry.

## The passes

| Pass             | Runs when                                                         | Rewrites                             | Reply                                                     |
| ---------------- | ----------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------- |
| People           | Every `people.everyEpisodes` new episodes                         | Person entries                       | Only the people whose entry changes; others are untouched |
| Short-term goals | Every `goals.shortTermEveryEpisodes` new episodes; once at tick 0 | The short-term goal list             | The full list                                             |
| Identity         | A chronicle forms                                                 | Traits, core, self-image, profession | Only what changes; each trait change carries its reason   |
| Long-term goals  | A chronicle forms                                                 | The long-term goal list              | The full list                                             |

- Each pass is its own LLM call with its own prompt template and call kind.
- **Every pass reads the same context:** all of the agent's memory (history, day summary,
  chronicles, episodes, stream), its seen places, who it is, its long-term goals, its short-term
  goals and its person entries. Only the question at the end differs. Pass prompts are not
  cached: each pass sends its own reply schema and the stream moves on between passes, so no
  pass could read another's cached prompt.
- Each of the two episode-counting passes keeps its own count of episodes formed since it last
  ran. Episodes made at midnight count like any other.
- The identity pass follows the rules of today's weekly prompt: change a trait only on what the
  agent actually did and felt, never on what it wishes. A trait moves at most
  `traits.passDeltaClamp` per pass.
- Changes to traits, core, self-image, profession and long-term goals are recorded in the
  personality history and raise the existing personality and goal moments.
- Short-term goals should serve the long-term goals and answer what has happened lately. Their
  steps are the plan. Steps and progress change only when the pass runs.
- **Who has a person entry:** everyone in the agent's seed, and anyone the agent has seen or
  heard. Every voice in the village is known, so hearing someone counts. An entry made this way
  starts with empty fields. Someone only talked about gets an entry when first seen or heard.

### Order of work

When several things are due for one agent at once, memory compression runs first, then the passes
from slowest-changing to fastest:

1. Episode
2. Chronicle
3. Identity
4. Long-term goals
5. People
6. Short-term goals
7. At midnight only: day summary, then history

Step 7 is last so the passes read the day before it is compressed.

### What is due

What is due for an agent is read from saved state, so a failed call or a restart loses nothing:
the stream's length, the number of episodes, each episode-counting pass's count, whether the
identity and long-term goals passes are owed since the last chronicle, and how far the agent's
midnight steps have got for the current day.

## The decision prompt

Ordered from most stable to least, with a cache break after each of the first four groups (the
provider allows four).

1. **Same for everyone:** the instructions, "What you can do" and "Reply".
2. **Changes when a chronicle forms:** who you are (profession, traits, core, self-image),
   long-term goals, history, day summary, chronicles.
3. **Changes when an episode forms:** people you know (every person entry, five fields each),
   short-term goals with their steps, episodes.
4. **Places you have seen.**
5. **Changes every decision:** actions offered, how you feel, now (time, status, "You were",
   what triggered the decision, what just went wrong), where you are and what is here, around you,
   belongings, the stream, what your body needs.

Every time in the prompt is absolute ("Day 8, 3:23 am"). A relative time ("38 min ago") changes
every tick and would defeat the cache. "Now" gives the current time.

## Places

- A place is added to an agent's seen places the first time any tile of it is in the agent's view,
  a wall included: walking past the bakery is enough to know where the bakery is. The entry is
  permanent.
- The place's entity list is filled, and replaced with what is really there, whenever a tile of
  the place that does not block sight is in view: from inside, or through an open door or a
  window. Seeing one such tile reveals the whole place: agents cannot steer tile by tile, and a
  place must not look empty because of where they stood.
- A place whose inside the agent has not seen yet is listed by its name alone. A place seen
  inside shows what it held when last seen ("bakery: oven, 2 bread"), and "nothing" when it was
  empty. The line carries no time, so it changes only when what the place holds changes and the
  section stays in the provider's cache while the agent walks about.
- The list holds placed objects and items on the ground.
- Entities are collapsed for display: unlabelled identical ones as today ("3 bread"), and labels
  that differ only by a trailing number together ("tree ×32", "square bench ×4").
- The section is titled "Places you have seen".
- `walk_to` accepts any name. It resolves, in order, to a place on the map, a person in sight, a
  thing here, and then to the place, the map object anywhere (a well, a door, a fishing spot) or
  the thing here whose name shares the most words with it (`places.walkNameMatch`): "north spot"
  reaches the north fishing spot. Loose items and creatures elsewhere are never found this way,
  since where they are is known only by sight. Ties go to things in places the agent has seen,
  then to the nearest. A name like nothing at all fails like any other action, with "nothing in
  the village goes by that name", shown in "what just went wrong" and in the stream. An agent may
  walk to a place or object it has only heard of; it joins its seen places only once seen.

## Seeds and the character form

- `goals` in `agents.json` become the long-term goals: `goal`, `reason`, `progress`.
- `peopleNotes` becomes person entries: the five fields per person, each optional. Today's
  one-line notes move to `whatIThinkOfThem`.
- A new per-character list of seen places, validated against the map's place names. A seeded place
  starts with the entity list that is really there at tick 0.
- The character form edits everything a seed holds: each long-term goal's three fields, all four
  fields of each person entry, and seen places as a multi-select of the map's places.
- Short-term goals are not seeded. The short-term goals pass runs once at tick 0.

## What is removed

Remove each of these completely: no branch, field, setting, prompt or test left behind.

- **Memory:** the memory store and `memories` table, buckets, strength, forgetting and bucket caps,
  recall scoring and lexical similarity, tags, the duplicate window, working memory, the
  first-visit memory and visited-places record, conversation summaries.
- **Decision:** the `recall` action and `query` field, the `stepDone` field, the unknown-name
  retry for `walk_to`, the prompt token target and memory trimming, and the sections "On your
  mind", "Current conversation", "Memories", "People on your mind", "Places you know" and "Today's
  plan" with their settings.
- **Passes:** the morning, daytime, night and weekly reflections, the reflection hook and its sleep
  callbacks, reflection schedules, and the `daily_plan` and `reflection` moments.
- **Agent state:** plans, the daily plan, dossiers, goal `kind`.
- **Impairment:** recall failure from needs and wounds (`recallFailureChance`, the rolls, both fog
  texts). Slowdown stays.
- **Client:** the Memory and Relations tabs, rebuilt for the new data.

## Where things are today

- **Filing:** `server/src/memory/filing.ts` words each perceived event for each perceiver. Keep
  its wording; its output becomes stream entries.
- **Two paths into one:** `sim/event-broadcast.ts` adds every filed memory to the store and also
  pushes it to working memory. `rememberBriefly` in `sim/world-access.ts` pushes code-written
  notes to working memory only. Both become "append to the stream".
- **Speech log:** `memory/conversation.ts`. The new model uses `isTakingPart` only.
- **Background LLM work:** `sim/background-work.ts` runs one piece per agent and applies results
  in agent order on the tick after they return. `sim/conversation-summaries.ts` shows the whole
  pattern: start what is due, apply on collect, retry after some ticks, and wait for every call
  when `shouldCallLlmInBackground` is off (tests). Use one `BackgroundWork` for all summaries and
  passes; decisions keep their own.
- **Tick order:** `sim/tick-pipeline.ts`. The sight phase, `updateSight` in `sim/tick-phases.ts`,
  is where seen places and first-sight person entries belong.
- **Identity:** `reflection/weekly.ts` already applies trait changes with a clamp, rounding,
  personality history and moments, and `server/prompts/weekly.txt` holds the rules for judging
  oneself. Move both into the identity pass.
- **Decision prompt:** the template is `server/prompts/decision.txt`, with `<<<cache>>>` lines as
  cache breaks. The context is built in `sim/context-builder.ts` and rendered in
  `decision/decision-prompt.ts` and `decision/sections.ts`. The reply schema is
  `decision/reply-schema.ts`.

Traps:

1. The sim starts at 6 am (`clock.startHour`). Find midnight from the day number `toSimTime`
   gives, not from the tick count.
2. An indoor place's rectangle includes its walls, and `canSee` reports a wall as seen when it is
   the tile looked at. Seeing a wall adds the place; only a tile that does not block sight fills
   its entity list.
3. Tiles outside every place belong to `config.map.defaultOutdoorPlace`, which is not in
   `map.places` and is never a seen place.
4. The decision reply's `target` is one field checked against one list of names for `walk_to`,
   `give` and `interact`. Only `walk_to` takes any name. The JSON schema also lists the names
   unless `isReplySchemaStable` is set.
5. A job's result is applied ticks after the job started. Remove exactly the entries or episodes
   that were sent, and write only the fields that job owns. An entry that has been sent takes no
   further merges.
6. Pass replies name people. Resolve them with `resolveName` and ignore names with no person
   entry.
7. The fake LLM client needs a default reply for every new call kind: the tick-0 short-term goals
   pass runs in every sim test.
8. Each new call kind needs an entry in `LlmCallKind` (shared) and `llm.maxReplyTokens`.
   `llm.reflectionKinds` routes kinds to `LLM_REFLECTION_MODEL`: the four passes go in it, the
   four summaries stay on the default model.
9. Seen places are worked out for every agent on every tick. Stop at the first visible tile of
   each place.

## Open choices

Mine, not the owner's. Ask before changing them.

- **Seeded one-line people notes** move to `whatIThinkOfThem`.
- **Moments:** goal moments are raised for long-term goals only.

Decided by the owner (2026-11-14), no longer open: a place not yet looked into is listed by name
with no mark; place entity lists hold placed objects and ground items only; merging repeats only
joins an entry to the one directly before it; profession is changed by the identity pass; a day
with no chronicles makes no day summary (see [The memory pipeline](#the-memory-pipeline)); the
cache layout of the decision prompt; the four passes
go in `llm.reflectionKinds` and the four summaries use the default model; reply token ceilings
are derived from the length limits (roughly 520, 1730, 1730 and 2550 for the four summaries), with
each pass's ceiling sized to its largest possible reply.

## Build order

`make check` and `make test` pass at the end of every phase; one commit per phase. Each phase
updates the client, the database and `AGENTS.md` for what it changes.

1. **Places.** Seen places, the view-based updates, collapsing, the prompt section, `walk_to`
   taking any name, the seed list and the form's multi-select.
2. **The stream.** One stream replaces the memory store and working memory. Everything under
   "Memory", "Decision", "Passes" and "Impairment" in [What is removed](#what-is-removed) goes,
   along with plans and the daily plan. Dossiers, the "People on your mind" section and goals stay
   as they are until phase 4, shown from their seeded values.
3. **Summaries.** Episodes, chronicles, the midnight steps, the per-agent job queue, the retry,
   and the summary sections of the decision prompt with their cache breaks.
4. **Passes.** The shared context, then people, short-term goals, identity and long-term goals;
   person entries replace dossiers and long-term goals replace goals, with the new seed format and
   form; the tick-0 short-term goals pass.
5. **Measurement.** A soak run compared against the old model's token use per agent per sim-day.
