# Memory, people and goals: design

Status: **designed, not built.** This replaces the whole current memory model: buckets, strength
and forgetting, recall, working memory, conversation summaries, the four reflection passes,
dossiers and plans. Nothing here needs to load an old save; the owner resets.

If you are implementing this: read it all once, then work phase by phase from
[Build order](#build-order). `AGENTS.md` still applies to everything, above all the design rule:
code decides where information is stored and what an agent can perceive; the LLM decides what it
means.

Choices that are mine rather than the project owner's are listed under
[Open choices](#open-choices). Don't change them silently; ask.

## The idea

- **Memory is compressed by time, not searched.** An agent sees its most recent events word for
  word, and older time as summaries that get coarser with age: episodes, then chronicles, then one
  day summary, then one history.
- **Nothing is scored or recalled.** There are no buckets, no strength, no forgetting curve and no
  `recall` action. What an agent remembers is what is still on the page.
- **Memory compression is the clock for everything else.** When episodes and chronicles form, the
  agent rewrites what it thinks of people, its goals and who it is.
- **Places are known by sight.** An agent's list of places holds only places it has seen.

## Vocabulary

| Term            | Meaning                                                                          |
| --------------- | -------------------------------------------------------------------------------- |
| stream          | The agent's most recent events, in time order, word for word                     |
| episode         | A summary of the events that left the stream, with a time range                  |
| chronicle       | A summary of several episodes, with a time range                                 |
| day summary     | A summary of one day's chronicles. An agent has at most one: the last full day   |
| history         | One summary of everything before the day summary                                 |
| pass            | An LLM call that rewrites part of what the agent holds (people, goals, identity) |
| person entry    | What the agent holds about one person it knows: four written fields              |
| long-term goal  | A goal with a reason and progress, rewritten when a chronicle forms              |
| short-term goal | A goal with a reason, steps and progress, rewritten every few episodes           |
| seen place      | A place the agent has seen, with the entities it holds                           |

These replace `bucket`, `strength` and `reflection` in the `AGENTS.md` glossary, and the plans and
dossiers the old model kept. `intention` and `mood` stay as they are.

## Settings

Every value lives in the config file under one `memory` block (and `people`, `goals`, `traits`
where noted). None is hardcoded.

| Setting                                | Value | Chosen by | Meaning                                                   |
| -------------------------------------- | ----- | --------- | --------------------------------------------------------- |
| `streamMax`                            | 60    | owner     | Events in the stream before an episode is made            |
| `streamKeep`                           | 5     | owner     | Newest events left in the stream when an episode is made  |
| `episodesMax`                          | 6     | owner     | Episodes before a chronicle is made                       |
| `episodesKeep`                         | 1     | owner     | Newest episodes left when a chronicle is made             |
| `earlierEpisodesShown`                 | 1     | owner     | Earlier episodes the episode summarizer sees for context  |
| `earlierChroniclesShown`               | 1     | owner     | Earlier chronicles the chronicle summarizer sees          |
| `episodeMaxChars`                      | 345   | owner     | Length limit of an episode                                |
| `chronicleMaxChars`                    | 575   | owner     | Length limit of a chronicle                               |
| `daySummaryMaxChars`                   | 690   | owner     | Length limit of the day summary                           |
| `historyMaxChars`                      | 1150  | owner     | Length limit of the history                               |
| `retryAfterTicks`                      | 40    | owner     | Wait before retrying a summary or pass that failed        |
| `people.everyEpisodes`                 | 2     | owner     | New episodes between runs of the people pass              |
| `people.fieldMaxChars`                 | 200   | owner     | Length limit of each of a person entry's four fields      |
| `goals.shortTermEveryEpisodes`         | 2     | owner     | New episodes between runs of the short-term goals pass    |
| `goals.maxShortTerm`                   | 3     | owner     | Most short-term goals (the old `plans.maxPlans`)          |
| `goals.maxSteps`                       | 5     | owner     | Most steps per short-term goal (the old `plans.maxSteps`) |
| `goals.shortTermFieldMaxChars`         | 200   | owner     | Length limit of each short-term goal text                 |
| `goals.maxLongTerm`                    | 5     | owner     | Most long-term goals                                      |
| `goals.longTermFieldMaxChars`          | 250   | owner     | Length limit of each long-term goal text                  |
| `traits.passDeltaClamp`                | 0.003 | owner     | Most a trait moves in one identity pass                   |
| `llm.maxReplyTokens` for each new call | open  | mine      | See [Open choices](#open-choices)                         |

Existing settings that still apply: `llm.attemptsPerCall` (2), `llm.replyTextSlack` (1.5),
`perception.sightRangeTiles` (24), `memory.participationWindowTicks` (10).

For scale: in the save measured while designing this, an agent filed about 370 to 450 events per
sim-day. With the values above that is about 7 episodes and 2 to 3 chronicles per agent per day,
counting the ones made at midnight.

## Data

- **Stream entry:** text, tick, and for merged repeats a count and an end tick. No bucket, strength
  or tags.
- **Summary:** level (`episode`, `chronicle`, `daySummary`, `history`), start tick, end tick, text.
  An agent has any number of episodes and chronicles and at most one day summary and one history.
- **Person entry**, per known person: `whatIThinkOfThem`, `whatTheyThinkOfMe`, `whatIWantFromThem`,
  `whatTheyWantFromMe`.
- **Long-term goal:** `goal`, `reason`, `progress`.
- **Short-term goal:** `goal`, `reason`, `steps` (a list), `progress`.
- **Seen place:** name, the entities there as last seen, first-seen tick, last-seen tick.

All of it is saved in the database and sent to the client.

## The stream

One list per agent, in time order. Everything that used to go to a memory bucket or to working
memory goes here and nowhere else:

- Perceived events, worded exactly as filing words them today: what the agent did, what was done
  to it, what it saw, sounds from elsewhere, speech it took part in (`Cobb said: "…"`), speech it
  overheard, muffled voices. Whether a line reads as "said" or "overheard" still follows the
  participation rule in the speech log.
- Notes the code writes for the agent: a failed action and why, arriving somewhere, what a read
  note said, what an inspection counted, waking in pain, being slowed.

A new entry whose text is identical to the entry just before it is merged into that entry, which
then shows a count and a time range. Merging happens when the entry is added, so the stream's
length counts merged entries once.

## The memory pipeline

**Stream to episode.** When the stream holds `streamMax` entries, every entry except the newest
`streamKeep` goes to the episode summarizer, together with the last `earlierEpisodesShown`
episodes as context. The reply becomes one episode stamped with the ticks of its first and last
entry.

**Episodes to chronicle.** When the agent holds `episodesMax` episodes, every episode except the
newest `episodesKeep` goes to the chronicle summarizer, together with the last
`earlierChroniclesShown` chronicles. The reply becomes one chronicle. There is no cap on
chronicles within a day.

**Midnight** (the sim clock entering a new day), for every living agent:

1. Stream to episode by the rule above, whatever the stream's length. The newest `streamKeep`
   entries stay and carry into the next day.
2. Episodes to chronicle by the rule above, whatever their number. The newest `episodesKeep` stay.
3. Any passes these two steps triggered (see [Order of work](#order-of-work)).
4. All chronicles to the new day summary.
5. The outgoing day summary and the existing history to the new history.
6. The new day summary replaces the old one. The agent now has no chronicles.

**Rules that hold everywhere:**

- One job per agent at a time. A summary or pass that becomes due while another is running waits
  its turn.
- Inputs are removed only when their summary comes back. Until then the agent still sees them, so
  there is never a gap. The stream may hold more than `streamMax` entries while a job runs.
- A step with nothing to summarize is skipped: a stream of `streamKeep` entries or fewer makes no
  episode, `episodesKeep` episodes or fewer make no chronicle, and a day with no chronicles keeps
  the old day summary. On the first midnight there is no outgoing day summary, so step 5 is
  skipped.
- A call that fails all its attempts leaves everything in place and is tried again after
  `retryAfterTicks`. Nothing is dropped silently.
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
- **Every pass reads the same context:** who the agent is, its long-term goals, its short-term
  goals, its person entries, its seen places, and all of its memory (history, day summary,
  chronicles, episodes, stream). Only the question at the end differs. The context comes first in
  the prompt so that passes run back to back read it from the provider's cache.
- Each of the two episode-counting passes keeps its own count of episodes formed since it last
  ran. Episodes made at midnight count like any other.
- The identity pass carries over the old weekly prompt's rule: change a trait only on what the
  agent actually did and felt, never on what it wishes. A trait moves at most
  `traits.passDeltaClamp` per pass. Changes are recorded in the personality history as today.
- Short-term goals should serve the long-term goals and answer what has happened lately. Their
  steps are the plan; there is no separate plan. Steps and progress change only when the pass
  runs; there is no `stepDone` field on a decision.
- **Who has a person entry:** everyone in the agent's seed, and anyone the agent has seen. An
  entry made on first sight starts with empty fields. Someone only heard about has no entry until
  seen; this is intended for now.

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

## The decision prompt

Ordered from most stable to least, with a cache break after each of the first four groups (the
provider allows four).

1. **Same for everyone:** the instructions, "What you can do" and "Reply". No `recall` action, no
   `query` field, no `stepDone` field.
2. **Changes when a chronicle forms:** who you are (profession, traits, core, self-image),
   long-term goals, history, day summary, chronicles.
3. **Changes when an episode forms:** people you know (every person entry, four fields each),
   short-term goals with their steps, episodes.
4. **Places you have seen.**
5. **Changes every decision:** actions offered, how you feel, now (time, status, "You were",
   what triggered the decision, what just went wrong), where you are and what is here, around you,
   belongings, the stream, what your body needs.

Everything above the stream is stamped with absolute times ("Day 8, 3:23 am"), never "38 min
ago": a relative time changes every tick and would defeat the cache. "Now" gives the current time.

Sections that no longer exist: "On your mind", "Current conversation", "Memories", "People on your
mind", "Places you know", "Today's plan", and the foggy-thoughts line.

## Places

- A place is added to an agent's seen places the first time any tile of it is in the agent's view
  (the existing line-of-sight code and `perception.sightRangeTiles`). The entry is permanent.
- Whenever any tile of a seen place is in view, that place's whole entity list is replaced with
  what is really there. Seeing one tile reveals the whole place: agents cannot steer tile by tile,
  and a place must not look empty because of where they stood.
- The list holds placed objects and items on the ground. It leaves out people, what containers
  hold and what people carry. The open road between places is not a place.
- Entities are collapsed for display: unlabelled identical ones as today ("3 bread"), and labels
  that differ only by a trailing number together ("tree ×32", "square bench ×4").
- The section is titled "Places you have seen", so agents do not take it for every place there is.
- `walk_to` accepts any name. A name that is no place on the map and no one in sight fails like
  any other action, with "no place with that name exists", shown in "what just went wrong" and in
  the stream. An agent may walk to a place it has only heard of. A wrong name no longer costs a
  second LLM call.
- The first-visit memory and the visited-places record are removed.

## Seeds and the character form

- `goals` in `agents.json` become the long-term goals: `goal`, `reason`, `progress`. `kind` is
  dropped.
- `peopleNotes` becomes person entries: the four fields per person, each optional.
- A new per-character list of seen places, validated against the map's place names. A seeded place
  starts with the entity list that is really there at tick 0.
- The character form edits all three; seen places is a multi-select of the map's places.
- Short-term goals are not seeded. The short-term goals pass runs once at tick 0.

## What is removed

- **Memory:** the memory store, buckets, strength, forgetting and bucket caps, recall scoring and
  lexical similarity, tags, working memory, the `recall` action, conversation summaries.
- **Passes:** the morning, daytime, night and weekly reflections, with their prompts, schedules
  and settings.
- **Agent state:** plans, the daily plan, dossiers, goal `kind`.
- **Impairment:** recall failure from needs and wounds (`recallFailureChance`, the rolls, both fog
  texts). Slowdown stays.
- **Decision settings that only fed removed sections:** the prompt token target and memory
  trimming, conversation line and linger limits, dossier settings.
- **Client:** the Memory and Relations tabs are rebuilt for the new data.

Leave no branch, field or setting behind for any of these.

## Open choices

Mine, not the owner's. Ask before changing them.

- **Reply token ceilings** for the new calls. Derive them from the length limits, following the
  config's note that JSON can cost about one token per character: roughly 520, 860, 1040 and 1730
  for the four summaries. The passes need ceilings sized to their largest possible reply.
- **Merging repeats** only joins an entry to the one directly before it. Alternating lines do not
  merge.
- **Trailing-number collapsing** for place entities.
- **Place entity lists** leave out people, container contents and carried things.
- **Profession** is changed by the identity pass; the owner only fixed when it changes.
- **The cache layout** in [The decision prompt](#the-decision-prompt).
- **A day with no chronicles** keeps the old day summary.

## Build order

`make check` and `make test` pass at the end of every phase; one commit per phase.

1. **Places.** Seen places, the view-based updates, collapsing, the prompt section, `walk_to`
   accepting any name, the seed field and the form's multi-select. Independent of the rest.
2. **The stream, and the old model out.** One stream replaces the memory store and working memory.
   Remove everything under [What is removed](#what-is-removed) and the prompt sections that went
   with it. After this phase agents decide from identity, seeded goals, places and the stream.
3. **Summaries.** Episodes, chronicles, the midnight roll-up, the per-agent job queue, the retry,
   and the summary sections of the decision prompt with their cache breaks.
4. **Passes.** The shared context, then people, short-term goals, identity and long-term goals;
   the new seed format; the tick-0 short-term goals pass.
5. **Client and measurement.** The rebuilt tabs, the glossary in `AGENTS.md`, and a soak run
   compared against the old model's token use per agent per sim-day.
