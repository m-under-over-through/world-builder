# 0020. The deck rules of 5 November

Date: 2026-11-04 (the machine's day; Marco's notes date the pass 5 November). Status: proposed. Revises the card engine of the architecture plan, section 8, and the "no end of the deck" of ADR 0017.

## Context

In his morning pass of 5 November 2026 Marco went through the app with rounds following one another (ADR 0017) and wrote down how the deck should behave (fix 19 of his morning pass). The old rule, in his words, shoved set-aside cards back in the same order, and that read as passive-aggressive: a card set aside went to the end of the round and came straight back; a card set aside twice opened the next round, in the order the cards had been set aside; and once a set's fresh cards ran out, cards already answered came round again, so the deck never ended.

The engine is `packages/deck`: pure functions with no storage and no network. The client replays a round from its seed and its append-only events (`apps/web/src/lib/session.ts`), so whatever the rules are, they must give the same queue on a reload and on a second device. The events `dismissed` and `deferred` are in the contracts and stay as they are.

## Decision

Five rules, in `planSession`, `applyDismiss` and a new `isDeckDone`:

1. **A round is 3 warm-ups then 1 checkpoint** (the counts in `workshop.json`), every card drawn from the seed by the seeded shuffle. Nothing comes first because of what happened before: the "deferred first" rule goes.
2. **A card set aside once leaves the round at once** and comes back in a later round. The event is still `dismissed`. In the later round it is placed right after a fresh card (one never shown before) and never after the same fresh card as another card coming back: so it is never the first card of a round and never next to another card set aside. As many come back as a round has room for under that rule; the seed draws which ones and where, and the others wait. The place depends on the seed and the events only, so a replay on any device gives the same queue.
3. **A card set aside a second time leaves the deck for good.** The event is still `deferred`. It never comes round again; the client still lists it among the cards set aside.
4. **An answered card never comes round again.** The fallback that showed answered cards once a set's fresh cards ran out goes.
5. **The deck ends.** When every card is answered or out for good, `isDeckDone(deck, answeredIds, deferredIds)` is true and `planSession` plans an empty queue. `LiveSession.deckDone` carries it to the screens, which show a thank-you card (the copy block "Thank you card") as the last card of the stack.

Two choices the rules left open:

- **When a set runs short of fresh cards.** The cards coming back still fill the round's places, spread as far apart as the fresh cards left allow. Keeping them apart wins over "never first": with one fresh warm-up and two coming back, the warm-ups read set-aside, fresh, set-aside. The other way round would put the two side by side, which is the pile Marco objected to. With no fresh card left in a set, the cards coming back stand side by side; there is nothing to put between them.
- **"Never in the same order as before."** Marco's sentence is read as two guarantees the rules above give without anything more: the cards come back in an order drawn from the seed, not in the order they were set aside; and a card that comes back never stands beside the cards it stood beside before, since those were answered, set aside twice, or set aside once, and none of them can be next to it. Its place within the round (second or third) is not compared with its old one: the events do not record where a card stood, the card label no longer shows a number (fix 8), and a checkpoint has only one place in a round of 3 and 1.

## Consequences

- The events keep their meaning: `dismissed` is the first set-aside of a card, `deferred` the second. What changes is what follows them, and when: a `deferred` event may now come rounds after the `dismissed` one, since the card returns in a later round, where under the old rule the two were minutes apart; analysis that reads the pair should expect the gap. Histories recorded under the old rule replay without error; the client does not need to know which rule a round was played under.
- `SessionPlanInput` takes a new field, `dismissedIds` (the cards set aside once in earlier rounds and not answered or out since), and `deferredIds` now means the cards out for good, from every earlier round rather than the previous one. `SessionPlan` gains `setAsideBefore`, the cards of this queue that came back, so `applyDismiss(plan, cardId)` names the event from the plan and needs no third argument. `lib/session.ts` feeds both from the history (`dismissedBefore`, `deferredBefore`).
- A card set aside leaves `plan.queue` at once. Code that read once-set-aside cards from the queue (the world's set-aside chips in `state.svelte.ts`) reads them from the `dismissed` and `deferred` sets instead.
- The deck ends. With 30 warm-ups and 12 checkpoints, a participant who answers everything sees 10 rounds of 3 and 1, then 2 rounds of one checkpoint, then the thank-you card. Each card set aside adds a showing.
- `LiveSession.deckDone` is worked out when a round is replayed, which the client does as each round starts. The client starts one more round after the last card, which plans nothing and carries `deckDone`; that empty round is a session row with no events.
- `docs/learn/09-seeded-shuffle.md` explains how a card coming back finds its place.

## Alternatives not taken

- **The old rule**: a first set-aside sends the card to the end of the round, a second sends it to the front of the next round, and answered cards come round again once a set runs out. It is the behaviour Marco called passive-aggressive, and it means the deck never ends.
- **A pure random re-draw**: put the cards set aside back into the shuffle with the fresh ones, with no rule about where they land. Simpler to explain, but a card could open the next round right after being set aside at the end of the last one, and two cards set aside together could come back together, which is what the rules are there to stop.
- **Recording where each card stood**, so that its new place in the round can differ from its old one. The events carry no place, and the contracts are not changed for it; the client would have to replay every earlier round to find it. Left as an open question for Marco below.

## Open

- Whether a warm-up coming back should also avoid the place (second or third) it held before, for its tint. It needs the place each card held, which the client can only get by replaying every round from the first. Marco's call.
- The thank-you card's rendering is the screens' session's; its words are Marco's (the block is a placeholder).
- The deck tuning in `workshop.json` (3 and 1) is Marco's; the rules hold for any counts the schema allows.
- A set with one place in a round (one warm-up, or the one checkpoint when the warm-ups before it were not fresh) has no gap after a fresh card, so a card set aside in that set waits until the set's fresh cards have run out. True of the rule as written; whether to relax it is Marco's call.
- A set with no places at all (a count of zero, which the schema allows) and a card set aside in it: the deck never counts as done and the client sits on an empty stack. Not a case of this workshop; a guard in `workshop.json`'s checks would close it.
- Events that reach the device late (a sync from another phone) change a later round's plan after the fact, for set-asides as they already did for answers; a round in progress keeps its queue until the next one.
