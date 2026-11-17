# v2 baseline: the last run before v2

Measured with `npm run measure -w @village/server` from the save that `docs/V2.md` describes
under "What the last run shows", before any v2 change. Later phases are compared with these
numbers. Spend is estimated at list price for Claude Haiku 5.5, with cache reads and writes at
their own prices.

- Save: `data/village.db` from the last run before v2.
- Sim time: Day 1, 6:00 am to Day 2, 8:58 pm, 14 agents.
- 3257 decisions answered, 4862 call attempts in all, about $3.16 at list price.

## Per sim-day

| Day | Hours | Agents | Decisions | Per agent-hour | Continue | Wait | Act | Passes per agent | Tokens     | Spend |
| --- | ----- | ------ | --------- | -------------- | -------- | ---- | --- | ---------------- | ---------- | ----- |
| 1   | 18    | 14     | 1,403     | 5.6            | 28%      | 37%  | 35% | 27.9             | 14,267,479 | $1.35 |
| 2   | 21    | 13     | 1,854     | 6.8            | 29%      | 38%  | 33% | 31.8             | 21,685,386 | $1.81 |

## Per agent

| Agent   | Hours alive | Decisions | Per hour | Continue | Wait | Act | Passes | Spend  |
| ------- | ----------- | --------- | -------- | -------- | ---- | --- | ------ | ------ |
| Jess    | 39          | 212       | 5.4      | 36%      | 13%  | 51% | 57     | $0.225 |
| Z       | 39          | 261       | 6.7      | 33%      | 23%  | 44% | 82     | $0.283 |
| Beckett | 34.9        | 178       | 5.1      | 48%      | 7%   | 44% | 53     | $0.183 |
| Diego   | 36.6        | 325       | 8.9      | 16%      | 43%  | 41% | 83     | $0.340 |
| Tony    | 39          | 215       | 5.5      | 29%      | 44%  | 27% | 44     | $0.177 |
| Pell    | 39          | 278       | 7.1      | 23%      | 53%  | 23% | 64     | $0.266 |
| Wil     | 39          | 199       | 5.1      | 27%      | 39%  | 34% | 41     | $0.169 |
| Nell    | 39          | 158       | 4.1      | 41%      | 16%  | 43% | 40     | $0.150 |
| Cobb    | 5.6         | 58        | 10.4     | 21%      | 33%  | 47% | 17     | $0.062 |
| Ambrose | 39          | 255       | 6.5      | 29%      | 30%  | 40% | 66     | $0.262 |
| Malin   | 39          | 320       | 8.2      | 22%      | 58%  | 20% | 67     | $0.283 |
| Nastya  | 39          | 296       | 7.6      | 31%      | 44%  | 25% | 69     | $0.286 |
| Mell    | 39          | 240       | 6.2      | 28%      | 55%  | 18% | 45     | $0.186 |
| Wabi    | 39          | 262       | 6.7      | 27%      | 35%  | 38% | 77     | $0.287 |

## Why decisions were asked

| Reason                                                                                                                                                | Decisions | Share | Mid-action | Answered continue |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----- | ---------- | ----------------- |
| (nothing to do)                                                                                                                                       | 1,215     | 37%   | 0          | 0                 |
| something new caught my attention                                                                                                                     | 1,043     | 32%   | 533        | 363               |
| {name} came into view                                                                                                                                 | 378       | 12%   | 273        | 200               |
| I saw the goblin attack {name}                                                                                                                        | 113       | 3%    | 96         | 76                |
| {name} is offering me # coins                                                                                                                         | 45        | 1%    | 33         | 23                |
| {name}, {name} came into view                                                                                                                         | 35        | 1%    | 26         | 24                |
| the goblin attacked me                                                                                                                                | 34        | 1%    | 25         | 18                |
| the pig came into view                                                                                                                                | 33        | 1%    | 27         | 17                |
| the woodland deer came into view                                                                                                                      | 28        | 1%    | 21         | 14                |
| the meadow deer came into view                                                                                                                        | 27        | 1%    | 19         | 19                |
| a loud sound reached me in my sleep                                                                                                                   | 23        | 1%    | 21         | 21                |
| my energy                                                                                                                                             | 20        | 1%    | 16         | 11                |
| {name} is offering me # bread                                                                                                                         | 17        | 1%    | 13         | 10                |
| a booming voice from the sky said: "There is a stash of diamonds guarded by goblins hidden where the sun doesn't reach."                              | 14        | 0%    | 13         | 8                 |
| a booming voice from the sky said: "There is a stash of diamonds guarded by goblins hidden where the sun does not reach. Find them in worship of Me." | 14        | 0%    | 14         | 10                |

## Cost by call kind

| Kind             | Calls | Uncached in | Cache read | Cache write | Out       | Spend  | Per call |
| ---------------- | ----- | ----------- | ---------- | ----------- | --------- | ------ | -------- |
| decision         | 3,485 | 4,780,286   | 17,699,624 | 4,528,697   | 1,525,107 | $1.98  | $0.001   |
| reality          | 235   | 2,227,113   | 0          | 0           | 264,182   | $0.355 | $0.002   |
| short_term_goals | 245   | 1,375,950   | 0          | 0           | 279,463   | $0.277 | $0.001   |
| people           | 161   | 968,482     | 0          | 0           | 316,357   | $0.255 | $0.002   |
| episode          | 488   | 751,313     | 0          | 0           | 72,899    | $0.112 | $0.000   |
| long_term_goals  | 103   | 516,667     | 0          | 0           | 93,858    | $0.099 | $0.001   |
| identity         | 61    | 372,419     | 0          | 0           | 29,573    | $0.052 | $0.001   |
| chronicle        | 62    | 104,402     | 0          | 0           | 22,263    | $0.022 | $0.000   |
| day_summary      | 13    | 14,705      | 0          | 0           | 3,996     | $0.003 | $0.000   |
| interact         | 9     | 4,553       | 0          | 0           | 956       | $0.001 | $0.000   |

## Decision prompt by section

Mean decision prompt: 18,238.4 characters, about 7,929.8 tokens.

| Section                      | Mean characters | Share |
| ---------------------------- | --------------- | ----- |
| People you know              | 3,877.9         | 21%   |
| Places you have seen         | 2,787.9         | 15%   |
| Short-term goals             | 2,000.4         | 11%   |
| What you can do              | 1,832           | 10%   |
| Just now                     | 1,649.4         | 9%    |
| More recently                | 1,500.8         | 8%    |
| Long-term goals              | 746.5           | 4%    |
| Earlier today                | 712.2           | 4%    |
| Who you are                  | 611.9           | 3%    |
| Yesterday                    | 492.4           | 3%    |
| Around you                   | 422.5           | 2%    |
| Reply                        | 344             | 2%    |
| Belongings                   | 310.4           | 2%    |
| Now                          | 264.4           | 1%    |
| Where you are                | 241.4           | 1%    |
| (top)                        | 211             | 1%    |
| Actions offered now          | 88.5            | 0%    |
| What your body needs now     | 83.7            | 0%    |
| How you feel                 | 49.5            | 0%    |
| Your last reply was rejected | 12.7            | 0%    |

## Talk

- Near-repeat speech: 117 of 1290 lines (9%).
- Conversations: 110; lines per conversation: mean 9.7, median 5, longest 114.
- Overheard lines the hearer later passed on: 61 of 1350.

## Failed acts

175 failed acts.

| Reason                                                                             | Count |
| ---------------------------------------------------------------------------------- | ----- |
| {name} hasn't answered another offer yet                                           | 38    |
| they couldn't find a way there                                                     | 37    |
| {name} is too far away to hand anything to: they have to be right next to them     | 27    |
| they don't have any water: they need # water                                       | 8     |
| they can't see inside the grey wolf, and there is nothing else they can do with it | 8     |
| they were already right next to them                                               | 8     |
| there was no grey wolf here                                                        | 4     |
| the grey wolf was out of reach                                                     | 4     |
| they don't have any raw fish                                                       | 3     |
| they don't have any wood: they need # wood                                         | 3     |
| they were already there                                                            | 2     |
| they didn't name the thing to sleep: the item could be apothecary bed              | 2     |
| they named no target, and 'punch' has to be aimed at someone or something          | 2     |
| they can't see inside the goblin, and there is nothing else they can do with it    | 2     |
| that doesn't work on the notice board                                              | 1     |

## Merged repeats

225 merged entries; the largest counts 4.

| Agent   | Times | Entry                                                                                         |
| ------- | ----- | --------------------------------------------------------------------------------------------- |
| Mell    | 4     | I said: "Ale for sale, five coins a cup, no haggling."                                        |
| Z       | 4     | I heard muffled sounds from the town square, to the east                                      |
| Mell    | 4     | I heard Nastya's voice from the smithy, to the south-west but couldn't make out the words     |
| Pell    | 4     | I heard Nastya's voice from the smithy, to the south-west but couldn't make out the words     |
| Wabi    | 4     | I heard muffled sounds from the town square, to the east                                      |
| Ambrose | 4     | I heard Nastya's voice from the smithy, to the south-east but couldn't make out the words     |
| Malin   | 3     | I heard Cobb's voice from the town square, to the south-east but couldn't make out the words  |
| Nastya  | 3     | I heard Diego's voice from the bakery, to the north but couldn't make out the words           |
| Nell    | 3     | I heard Jess's voice from the bakery, to the north-west but couldn't make out the words       |
| Z       | 3     | I heard Mell's voice from the tavern, to the north but couldn't make out the words            |
| Jess    | 3     | I saw Nastya speaking but couldn't hear the words                                             |
| Mell    | 3     | I heard Z's voice from the town hall, to the north but couldn't make out the words            |
| Mell    | 3     | I heard Z's voice from the carpenter's workshop, to the south but couldn't make out the words |
| Beckett | 3     | I heard Malin's voice from the bakery, to the south-east but couldn't make out the words      |
| Beckett | 3     | I heard Malin's voice from the bakery, to the south-east but couldn't make out the words      |

## Deaths

| Who     | Died            | First seen by | Seen after  | Named by others after | Named by the finder after |
| ------- | --------------- | ------------- | ----------- | --------------------- | ------------------------- |
| Cobb    | Day 1, 11:34 am | Nastya        | 27 h 16 min | never                 | 1 min                     |
| Beckett | Day 2, 4:54 pm  | Z             | 0 min       | 0 min                 | 0 min                     |
| Diego   | Day 2, 6:34 pm  | Nastya        | 0 min       | 1 h 27 min            | 3 min                     |
