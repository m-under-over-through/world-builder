# 09. The seeded shuffle: randomness you can replay

The idea, why it is here, the procedure in this repository, how to check it yourself, what can go wrong, and what it does not do. Written on 2 November 2026, the day the deck engine landed.

## The idea

A computer has two kinds of randomness. One is the real thing: bytes from the operating system, fed by hardware noise, different every time and impossible to predict. The anonymous code, the session ids and the workshop keys come from that kind, through `crypto.getRandomValues` and `crypto.randomUUID`.

The other kind is a recipe. A **pseudo-random generator** starts from a number, the **seed**, and turns out a long stream of numbers that look random: no pattern a statistical test can find, every value about as common as every other. But the stream is a pure function of the seed. Start from the same seed and you get the same stream, on any machine, in any year. That is a weakness for secrets and exactly the property a shuffle needs when it has to be replayed.

A shuffle that uses such a stream is a **seeded shuffle**. The order of the cards is a function of the seed and the cards, nothing else. Store the seed and you have stored the order, without storing the order.

## Why it is here

The architecture plan, section 8, says every session gets a random seed stored with the session, so that resuming mid-session is deterministic. A participant opens the app, sees three cards, is interrupted, and comes back an hour later. The client finds the session in its store, with its seed, and asks the engine for the plan again. Because the plan is a function of the seed, the deck and the history, the fourth card is the one that would have been shown an hour ago. Nothing about the order had to be written down; the 16 hex characters of the seed are enough.

Two more things follow from this. A plan can be reasoned about in a test: "seed `example`, this deck, these counts" always gives the same four ids, so a rule like "deferred cards first" is checked against a known order rather than against a probability. And a session can be shown to the operator or the partner on a laptop with the same seed as a participant's phone would use, which is how the deck will be tuned on staging.

## The procedure in this repository

Three small functions in `packages/deck/src/random.ts`, each a few lines, no dependency. Together they are what `planSession` calls.

1. **Seed string to number: FNV-1a.** The seed is text (16 hex characters from the client; any string works). A generator wants a 32-bit number, so the text is run through FNV-1a, a hash from 1991 that is one multiply and one exclusive-or per character. It is not secure and does not need to be; it only has to spread similar strings apart, and it does. Known answers are published, and the test checks two of them.

2. **Number to stream: mulberry32.** The generator is mulberry32, by Tommy Ettinger, in the public domain. Its whole state is one 32-bit number. Each call adds a constant to the state, then mixes the result with a few multiplies and shifts, and the mixed value is the output. It passes the usual statistical test suites and repeats only after four billion numbers; a session draws fewer than a hundred. The published version returns a fraction between 0 and 1; ours returns the whole 32-bit number, because the shuffle wants a whole number, and the test compares the first outputs for three seeds against the published version.

3. **Stream to order: Fisher-Yates.** The shuffle walks the cards from the last position down to the second. At each position it draws one number from the stream, takes the remainder when divided by the number of positions not yet fixed, and swaps the card there into the current position. When the walk ends every order is equally likely. The remainder step has a bias of at most the number of cards divided by four billion, which for a deck of a hundred cards is under one in forty million; it is noted in the code and ignored.

`planSession` adds two choices on top. Each set gets its own sub-seed, `<seed>:warmup` and `<seed>:checkpoint`, so the order of the checkpoints does not depend on how many warm-ups the deck has. And the ids of a set are sorted before the shuffle, so the order depends on which cards the set holds and not on where they sit in `deck.json`. Both choices make the same statement: the order of a set is a function of the seed and the set's ids, and of nothing else.

## How a card set aside finds its place

Added on 5 November 2026, with the deck rules of that day (ADR 0020). The rule "deferred cards first" named above is gone; this is what replaced it.

A card set aside once leaves its round and comes back in a later one. Where it lands is decided from the seed, the same way the order is, so a reload or a second device puts it in the same place. The engine lays out each set of a round in three steps.

1. **The fresh cards, in seeded order.** The cards of the set never answered, never set aside and not out for good, shuffled from `<seed>:warmup` (or `:checkpoint`) as before. The cards coming back are shuffled too, from their own sub-seed `<seed>:warmup:back`, sorted first so the order they were set aside in does not matter.
2. **The gaps.** Picture the fresh cards in a row with a gap after each one. A card coming back may only go into a gap, and each gap takes at most one. That single rule gives both of Marco's: a card in a gap has a fresh card right before it, so it is never first and never next to another card coming back. The gap before the first fresh card is open only when the place before the set holds a fresh card, which is how a checkpoint coming back can follow the last warm-up.
3. **The draw.** Which gaps are used is drawn from `<seed>:warmup:places` with the same shuffle: the open gaps are shuffled and the first ones taken. The cards coming back go into them in their seeded order. As many come back as there are gaps for; the rest wait for a later round, where the draw starts again.

A worked case, with the six cards of the worked example and counts 3 and 1. Round 1, seed `example`, is `cool, on-tv, embarrassing, immigrants`. Set "cool" aside and answer the other three. Round 2, seed `next`: one fresh warm-up is left, `tuesday-night`, so the warm-ups have two places, one fresh card and one gap after it; "cool" takes the gap. Round 2 is `tuesday-night, cool, rich-poor`. Set "cool" aside again and it is out for good: round 3 is `rich-poor` alone, and after that the deck is done.

Two finer points. When a set has more cards coming back than gaps, because its fresh cards are running out, every gap opens, the one before the first fresh card included, and the cards are spread as evenly as they go: with one fresh card and two coming back, the set reads set-aside, fresh, set-aside. Keeping them apart was chosen over keeping the first place fresh (ADR 0020). And when the next set has a card waiting to come back, the last gap of this set is kept empty if there is another to use, so the checkpoint can come back in the same round: with three warm-ups, a warm-up coming back then always lands second and the checkpoint last.

To see it, from the repository root:

```
npx vitest run packages/deck -t "comes back"
```

The test names read as the rules: "it comes back in the next round when there is room, never first", "its place in the round is drawn from the seed: the second or the third", "with one fresh warm-up left and two coming back, they stand on either side of it". Two longer tests play a deck to its end, a small one 25 times and the real one 20 times, with a coin for each card (answer or set aside), and check every round against the rules.

## How to check it yourself

The tests, named as behaviours:

```
npx vitest run packages/deck
```

`seeded-shuffle.test.ts` holds the published answers for the hash and the generator, the permutation and no-mutation checks, and a fairness check: six items, three thousand seeds, every item in every position about five hundred times. `plan-session.test.ts` holds the rules of section 8, and the worked example: a deck of six cards, counts 3 and 1, seed `example`, which gives `cool, on-tv, embarrassing, immigrants`.

To see the determinism with your own eyes, from the repository root:

```
node -e "import('./packages/deck/src/random.ts').then(m => console.log(m.seededShuffle(['a','b','c','d','e'], 'example'), m.seededShuffle(['a','b','c','d','e'], 'example')))"
```

The two arrays are the same; change the seed and both change together.

## What can go wrong

- **Changing the generator, the hash or the shuffle reorders every stored session.** A participant who resumes a session after such a change sees different cards, and a card they already answered may come back in the same session. The known-answer tests exist to make such a change loud. If one is ever intended, it has to ship with a rule for sessions started before it, such as storing the engine version with the session.
- **A seed that is not stored before the first card is shown.** If the client generated a seed, showed a card, and only then wrote the session, a crash in between would make the next open start a different session. The client writes the session, seed included, before it asks for the plan.
- **Using this randomness for anything secret.** mulberry32 can be run backwards from a few outputs, and FNV-1a is not a secure hash. A code, a key, an invite token or an id made with it would be guessable. The engine's file says so at the top, and nothing in the repository imports it for that.

## What it does not do

- It does not make the order unpredictable to the participant. Nobody is meant to be surprised by card order; the point is that the order can be replayed.
- It does not use the seed for anything but order. The seed is not an identifier, is never sent on its own, and is not in any URL; it rides with the session record, as the session schema says.
- It does not decide what the cards say or how many a session has. The counts are in `workshop.json`, the cards in `deck.json`; the engine only orders what it is given.
