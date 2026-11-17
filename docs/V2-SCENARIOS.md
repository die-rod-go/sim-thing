# Village Sim v2: how it plays out

Status: **review** (2026-11-17) of the design in `docs/V2.md`. It replays moments of the last run
through that design, then walks through stories worth wanting, to check that the design does what
it claims and to find what it misses. What it found is folded into `docs/V2.md` and listed under
[What this changed](#what-this-changed).

One caution holds throughout. v2 can make a story possible and likely; the model still decides.
Where an outcome depends on the model being bold, this says so.

## The last run, replayed

### The voice from the sky (Day 1, 7:20 am)

The viewer put eleven goblins in the old shaft at 7:16 and 7:20 and, in the same minute, spoke:
"There is a stash of diamonds guarded by goblins hidden where the sun doesn't reach." In the last
run all 42 decisions it gave carried on as before.

Under v2 the voice is a significant reason, so each of the fourteen decisions is a reckoning, at
medium effort, ending in "Something has happened". Every prompt already holds the catalog (diamond
veins are mined with a pickaxe; goblins are animals) and the agent's seen places (the old shaft:
glittering vein, deep diamond vein). Reckonings the seeds make plausible:

- **Cobb**, whose long-term goal is a diamond from the glittering vein: the old shaft, now, with his
  pickaxe. His agenda is rewritten.
- **Malin**, who wants everyone to depend on him: diamonds are power. Get there first, or buy them
  off Cobb.
- **Ambrose**, the chapel keeper: "in worship of Me" is a sign, or a test. To the chapel.
- **Wabi**, the guard: goblins near the village. No one goes alone.
- **Jess**: nonsense; bread first. Doubt is a reaction too. What matters is that it is hers.

Talk follows ("did you hear that?"), names are said, and decisions come fast: perhaps fifty in ten
minutes, about two cents. The day can turn into an expedition, a race between Cobb and Malin, or a
quarrel over what the voice was.

### Cobb alone at the quarry (Day 1, 10:32 to 11:34 am)

A goblin clawed Cobb at 10:32. He fought it off, went back to mining, and a second goblin killed him
at 11:34. Nobody noticed for 27 hours.

Under v2 the first scratch is a reckoning, and Cobb knows from the world rules that he is poisoned
and bleeding and that antidotes and healing potions exist (Beckett carries both). He might keep
mining, as he did, or head for the village shouting.

A shout carries 24 tiles clearly and farther muffled. As `docs/V2.md` was first written, a muffled
voice never interrupted anyone, so a cry for help heard through the trees would have waited for its
listeners' next decisions. This review changed that: a sound loud enough to wake a sleeper now turns
an awake head even when muffled, and is filed as "I heard Cobb shout from the quarry".

If he dies unheard, the village has no way to know. What v2 adds is that his absence shows. Most
last saw him at the tavern at 9:28, saying he was off to the quarry, so by evening their prompts
hold "Cobb: seen 10 hours ago at the tavern, walking to the quarry" under "Not seen
lately". It is a clue as well as an absence. This review gave that line to the day plan and the
reflection too, which before saw only memory. The likeliest to wonder are those with a reason: Mell, whose best customer never misses his
evening ale; Nastya, who needs his ore; Tony, who wants his fight. Nastya's "Get iron ore from Cobb"
is an outcome, so it stays open until it happens, and it can send her looking. Whoever finds him has
a reckoning, and "who needs to know?" is in its prompt.

Not guaranteed. If no one cares enough to wonder, he lies there, which is also true to life.

### The ore and the debt (Day 1, 6:31 am)

In the last run Cobb handed over the ore on trust, walked up to Nastya six times in six minutes for
payment, and Nastya later paid him twice.

Under v2 Cobb can offer "2 iron ore for 10 coins" as a trade: one accept, and both move at once. Or
he gives on trust, as before, and the debt is real. If she walks off, "Nastya, pay me" names her,
which is urgent, so she answers ("After the ring, Cobb!"). The second time he says it, his stream
shows `I said to Nastya (×2): ...` next to her answer. Paying twice can't happen: she sees her own
pending offer, and a second one to the same person fails. Her seed says she forgets what she owes;
that can still happen, and now it is her character rather than a bug.

### The locked bakery (Day 2 morning)

In the last run Jess locked the door, and Diego and Wil got "they couldn't find a way there" 25
times between them.

Under v2 the failure reads "the bakery door is locked". Diego shouts "Jess, open up!", which names
her: she unlocks it, or she doesn't ("After my batch."). The lock stops being a mystery and becomes
leverage, since Jess decides who uses the oven and on what terms. Diego's "Cook my meat" stays open;
he can give it an hour ("after Jess's batch, 9 am"), and the reminders this review added bring that
hour back to him.

### Wabi's hearings (Day 1, 1:58 to 6:43 pm)

In the last run Wabi asked Mell for her side of an ale quarrel for nearly five hours.

Under v2 Wabi's agenda holds "Settle the ale quarrel between Pell and Mell", an outcome. When Mell
refuses, the decision guidance says to act on a refusal or let it rest; the second time,
`I said to Mell (×2)` shows the pattern; the third owes a reality pass. Wabi might accept that
Mell's price is hers to set, tell Pell so, and mark the item done, or press harder, in character.

The deeper cause is the seed: "values order and process" asks the model for hearings, and it gives
them. That needs a different persona, not code.

### Diego's meat (Days 1 and 2)

In the last run Diego pitched "three coins a portion" in 26 lines and found one buyer, because no
one was hungry.

Under v2, with hunger at 0.5 a day, most of the village is hungry by the second morning and the
bread is running short. Meat is food. "Sell my cooked meat" stays open and finds buyers at
mealtimes, at the tavern, among the hungry. Beckett still won't touch it, and that stays between
them.

### Malin buys the bread (Day 1, 7:17 am)

In the last run Malin paid 60 coins for six loaves Jess didn't have, and three refunds followed.

Under v2 he offers "60 coins for 6 bread". Jess has two, so the trade can't happen and she counters.
With hunger at 0.5 a day, a Malin who keeps buying every loaf is a real threat by the second day:
people go hungry, prices rise, and the village has a reason to deal with him. Jess can refuse him,
Wil can sell wheat around him, and Nell and Diego can feed people instead.

### Beckett's last hour (Day 2, 4:26 to 4:54 pm)

The last run had its best moment here, Diego punching a goblin to shield Beckett, and its flattest
aftermath.

Under v2:

- Beckett's first scratch and Diego's are reckonings.
- When Beckett dies, everyone who sees it has a reckoning. `docs/V2.md` first gave reckonings one
  cooldown, which would have swallowed a death that came within an hour of a scratch; this review
  limited the cooldown to being attacked.
- **Diego**, who loved her: grief or rage, his choice, and the moment kept.
- **Nastya**, who loved her and never said so: what her people pass wrote last run ("the ring I made
  for her is now useless to her") is kept at once and reaches her core at the next reflection,
  instead of leaving her with a crush on a dead woman.
- **Ambrose** only hears it ("Beckett is dead"). Speech is nothing code can rank, so as first
  written he'd have had an ordinary decision and waited hours for a reflection. This review made
  `remember` available on every decision: he marks the moment, which owes a reflection, and adds
  "Bury Beckett in the graveyard at sunset" to his agenda with an hour.
- At sunset the reminder brings him back. He picks up her body (`carry`), takes it to the graveyard,
  buries it (`bury`, an hour, heard nearby) and carves the grave. Whoever he told and cared enough
  put it in their own agenda.

## Stories worth wanting

| Story                             | What makes it work                                                                                          | Can it happen?                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Gossip that changes as it travels | Overheard talk is filed and interrupts; retelling is in each teller's words; person entries keep the source | Yes                                                                            |
| A reputation for not paying       | Debts live in person entries; complaints spread as gossip; trades let the wary insist on payment            | Yes                                                                            |
| A confession, taken or refused    | Whispers reach only those beside you; `remember` marks it; the reflection rewrites what each holds          | Yes, with `remember` on every decision (added)                                 |
| Jealousy                          | Rings show when worn; seeing two people together is filed                                                   | Yes                                                                            |
| Hoarding and a price war          | Hunger at 0.5 a day; a closed supply of coins; trades                                                       | Yes, once hunger bites                                                         |
| Spiking the ale                   | Recipes in the catalog; lacing can't be seen but pouring can; `pour into` in `noticedVerbs`                 | Yes, if the model plays it                                                     |
| Arson                             | Fire flasks (fireweed and ale) set flammable things alight; fire spreads; water puts it out                 | Yes                                                                            |
| A theft and a whodunit            | Chests, locks, copied keys, forcing open; witnesses' streams and "last seen" lines                          | For about a day; after that only what witnesses chose to keep (open choice 17) |
| A funeral                         | `carry`, `bury`, `carve`; reckonings; an hour to gather                                                     | Yes, with reminders (added)                                                    |
| Grief that changes someone        | Reckoning, key memories, core and self-image rewritten                                                      | Yes                                                                            |
| Arming up against the goblins     | The catalog (swords, arrows); an hour to meet; following a leader                                           | Yes, with reminders and `follow` (added)                                       |
| Faith or doubt about the voice    | A reckoning for everyone; long-term goals; a chapel keeper                                                  | Yes                                                                            |
| A feud settled with fists         | `punch`; the first blow is a reckoning; onlookers' decisions are urgent                                     | Yes, and it can end in a death                                                 |
| A newcomer finding a place        | Person entries that fill as people meet; day plans                                                          | Yes (a newcomer knows every voice from the start, a small oddity)              |
| A decree                          | A signed note on the notice board; talk                                                                     | As words only: nothing enforces it                                             |
| A cover-up                        | Carry a body far off and bury it, after taking what it carried                                              | Yes, and a new grave in the woods is a clue in itself                          |
| Hiring help                       | Coins for work; what is made lands in the worker's hands                                                    | Yes, and trust is the problem, as it should be                                 |
| A trial and a cell                | Hearings are talk; the jail cell opens into the guard house with no door                                    | No: the cell needs a door with a lock                                          |
| A dice game for money             | Dice give fun, more when played together, but no number                                                     | No: a bet is settled only by whoever claims to have won                        |
| An anonymous letter               | Every note is signed by whoever wrote it                                                                    | No: blackmail works in a whisper, not in a letter                              |
| Picking a pocket                  | What a living person carries can't be seen or reached                                                       | No, by design: theft is from chests and the dead                               |

### Mell spikes the ale

Mell's seed wants Pell's tavern to fail, and v2 shows her the means: a sleeping draught is chamomile
and water at a cauldron, and nobody can tell a laced drink.

1. Her day plan: "Get a sleeping draught". The cauldron is in the apothecary, Beckett's place. Mell
   asks Beckett for one with a lie ("I can't sleep"), or slips in while Beckett naps, which her seed
   says is often.
2. She pours it into ale. Pell's ale is out of reach while Pell carries it, so Mell laces her own and
   sells it to Pell's customers, or laces the stock in the tavern chest.
3. A customer drinks and sleeps two hours where they sat. Everyone in sight sees them fall asleep.
   The sleeper wakes knowing only that they drank ale and slept, and the catalog tells them sleeping
   draughts exist. Talk follows: Pell's ale knocks you flat.
4. If anyone saw Mell pour, `pour into` is in `noticedVerbs`: they are interrupted, and the
   confrontation can start then and there.

What it can't promise is that the model, as Mell, goes through with it. A persona that licenses it
and a line in the decision guidance that characters needn't be kind (open choice 22) make it more
likely.

### The records go missing

Ambrose writes down what each villager does; Malin wants the records chest.

1. Ambrose knows from the world rules that a record is a note and nothing else, so his agenda reads
   "Write the entries and put them in the records chest", and perhaps "Have Nastya forge a lock for
   it" (one iron makes a lock and its key).
2. Malin's agenda: "Get the records out of the chest". With a lock fitted he needs the key, which
   Ambrose carries out of reach; or a copy, which the anvil makes only from the key in hand; or an
   axe to force it, and Tony, who has one, is in love with him.
3. Taking makes no sound. Forcing a chest open takes half an hour and is loud enough to wake a
   sleeper, so whoever hears it, even muffled through the town hall walls, turns to look.
4. Ambrose finds out when he next looks inside, and asks around. Wil, who saw Malin walk into the
   town hall at noon, has it word for word in his stream that afternoon, and as "Malin: seen 3 hours
   ago at the town hall" for as long as that is his last sight of Malin.
5. A day later, Wil remembers it only if his own summary kept it. The summary prompts ask for who was
   where, but a sighting that seemed nothing at the time is exactly what a summary drops. That is
   the case for an archive and `recall` (open choice 17).

### Arming up against the goblins

After Beckett and Diego die, the goblins are still out.

1. Wabi shouts across the square: everyone who can fight, at the well at dawn. Those who mean to go
   add it to their agenda with the hour.
2. Nastya's agenda: "Forge swords for the hunt". The catalog tells her a sword is two iron and a
   wood, iron is ore and wood at the forge, and ore comes from the quarry's veins with a pickaxe.
   Cobb's lies beside his body there. That chain crosses four places; each decision queues the next
   few acts.
3. At six the reminders bring them to the well. Wabi sets off for the old shaft and the others
   `follow` him.
4. The fight runs at full attention: decisions hold the clock while it lasts, and each person's
   first wound is a reckoning.
5. Afterwards there is the glittering vein, and who gets the diamonds is the next story.

### A confession

Nastya loves Beckett; Beckett loves Diego; Diego loves Beckett.

1. Nastya's reflection has written "tell her before it's too late" into her long-term goals, and her
   day plan reads "Find Beckett alone and tell her".
2. She whispers it. A whisper reaches only those right beside her, and "Within whisper reach" in her
   prompt says who that is. If Diego is a step away, he hears it too.
3. Beckett is named, so her decision is urgent, and her answer is her own. She can `remember` it,
   which owes a reflection that rewrites what she holds about Nastya, and perhaps about herself.
4. If Diego overheard, he can `remember` it as well, and the next time he sees Nastya's iron ring on
   Beckett's hand, which everyone can see, it means something.

## What this changed

Folded into `docs/V2.md`:

1. **Loud sounds turn heads** (change 2). A sound at least `perception.sleeperHearingLoudness` loud
   is notable for awake listeners even when muffled, and a muffled shout is filed as a shout.
2. **Reminders** (change 4). An agenda item may carry an hour; at that hour the agent gets an urgent
   decision, and a sleeper finds it missed on waking. Funerals, meetings, hunts and tavern nights
   need them; with fewer interrupts and queued acts, agents would otherwise miss appointments.
3. **`remember` on every decision** (changes 5 to 7). Code can rank events but not speech, so a
   confession, a betrayal or news of a death would otherwise wait hours for a reflection. A
   `remember` files the moment in the stream and owes a reflection, which decides whether it becomes
   a key memory. The reflection has a minimum gap.
4. **The reckoning cooldown covers only being attacked** (change 5). Deaths, bodies, the voice and
   being moved always reckon.
5. **No agenda races** (changes 4 and 7). The day plan lands before the first decision after waking,
   and a reflection's agenda is used only if nothing changed the agenda while it ran.
6. **Plans see where everyone is** (changes 7 and 9). The day plan and the reflection read "Not seen
   lately", where the agent is and who is around; "Not seen lately" says how long ago.
7. **Acts** (changes 8 and 10). Each act may carry its own words; an act after a give waits until
   the offer is answered or lapses; a new `follow` act keeps within reach of someone for a while, for
   escorts, processions, patrols and "walk with me", which last run cost a decision per step.
8. **A bug**: `give` reaches through walls, since it checks only distance.
9. **Open choices 18 to 22** for the above, and a line in the decision guidance that characters
   needn't be kind or honest.

## What the world can't do yet

Content and map choices, the owner's to make, none of them code in `server/`:

- **Dice show no number**, so a bet can't be settled except by whoever claims to have won. A roll
  that lands in its event ("rolled a five") needs a small new step type.
- **Every note is signed** (`write on` sets the author), so there are no anonymous letters or
  forgeries. Leaving the author out, or making signing part of what is written, would allow them.
- **The jail cell has no door**: it opens into the guard house. A door there, with a lock, would make
  a cell.
- **Nobody can reach into a living person's things**, so there is no pickpocketing. That looks
  deliberate and fits; it is listed so it isn't mistaken for a gap.

## What v2 still can't promise

- **Boldness.** Haiku leans polite and procedural. v2 takes away what pushed it there but doesn't
  make it daring; personas and the decision guidance carry that.
- **Marking items done.** If decisions forget, finished items linger and can be done twice. The day
  plan and the reflection prune them, and the measurement script counts items finished, dropped and
  left standing.
- **Cost when the village comes alive.** More to talk about means more talk. The estimates in
  `docs/V2.md` assume the last run's amount of conversation.
- **Long memory for small things.** A detail that mattered only later survives only if a summary
  kept it (open choice 17).
