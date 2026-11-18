# 0022. The blank card

Date: 2026-11-18. Status: proposed. It lives on a branch with a preview and is not merged: Marco tests the design and the words first, and it merges only when he is happy with them.

## Context

On 18 November 2026 Marco asked for a longer, unstructured input: "Some people might already have a very specific idea or story they want to tell. In this case they should have a way to add an unstructured answer." He called it a critical addition, to be built apart from the rest and tested safely.

Every answer today belongs to a card. The answer field already takes 4,000 characters (`MAX_ANSWER_CHARS`), about 650 words, so the limit is not what stands in the way. What is missing is a place: a card frames what is written as the answer to its question, in a small field, and a person who arrives with a story has no card that asks for it.

The launch is days away. Whatever this is, it must not need a change on the server while invitations go out.

## Decision

- **A blank card: a card with no question, which the participant writes.** The word fits the app: the cards are index cards on a desk, and this is the one that comes empty.
- **Reachable at any time from the card screen**, by a quiet button under the stack, next to "Set aside". Also when the deck is done, under the thank-you card. Not on the welcome: a person writes after they have seen what this is and agreed to it.
- **It opens as a place of its own to write, not in the stack.** A title, a short hint, a large field, "Save" and "Not now". On a phone it is a sheet over the screen; on a laptop a wide card over the desk. "Not now" keeps the words in memory for the next time it is opened, as a card keeps its draft.
- **The same limit as any answer: 4,000 characters.** The counter shows only near the limit, as on a card.
- **As many as the participant wants.** Each saved blank card is a tile in "Your world so far". The button stays.
- **It is an `answered` event like any other.** Sealed on the device before it leaves, recorded on the round in progress, with a card id of its own: `own-` and eight random characters from the invitation page's alphabet (ADR 0021). The id is not in the deck. The server stores it as it stores any event: it has never checked a card id against a deck. The readable copy stays on the device that wrote it (ADR 0014). No revising, as for cards. "Delete everything" covers it.
- **Unique without a list**, as link values are (learning note 12): a random id needs no counting, and two phones of one participant cannot make the same one.
- **A deck may not use the prefix.** The deck schema refuses a card id that starts with `own-`, so no card of a deck can be mistaken for a blank card.
- **The deck rules do not see it.** It is in no round's queue and does not count towards the end of the deck (`isDeckDone` ignores ids that are not in the deck).
- **The hint asks to leave people's names out.** A free text invites names more than a question does, and the answers are read by the research team.

## Consequences

- **No change on the server, in the database or in the export.** The feature is in the client, plus one rule in the deck schema. It can merge before or after the launch, and a phone still running the older client is unaffected.
- **In the export, a row whose card id starts with `own-` is a blank card.** The runbook says so for whoever reads the file.
- **The status command counts a blank card as an answer.**
- **On a second device the tile shows without its words**, as every answer does there (ADR 0014).
- **The privacy policy's "What we store"** lists what is kept for each card. It should gain a few words for a card the participant writes. The policy is Marco's file.
- **Glossary.** New: **blank card**.

## Alternatives

- **A larger field on every card, or a higher limit.** It gives more room to answer a question, not a place for what no card asks. A higher limit is a change to the contract, the server and the stored size, in launch week.
- **A new kind of event.** The same change to the contract, the server and the database, for nothing a participant would see.
- **One fixed id for the blank card.** The readable copies and the tiles are keyed by round and card id, so a second blank card in the same round would replace the first on the screen.
- **A text box on the welcome page.** It comes before the consent and before the person has seen a card.
- **A card in the deck that says "write anything".** It would come round when the shuffle says so, once, and could be set aside for good. The person with a story should not have to wait for it.

## Open, for Marco on the preview

1. The name on the screen: "Your own card".
2. Where the button sits, and how quiet it is.
3. One or several.
4. The limit of 4,000 characters. More is possible, as a second step with a server change.
5. Every word of the hint.
