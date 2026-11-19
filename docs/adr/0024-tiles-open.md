# 0024. Tiles open: a card set aside can be answered, and an answer can be changed

Date: 2026-11-18. Status: accepted, Marco's decision of 18 November: "we need to have set asides and saved cards clickable and editable. There is no point in showing something if you cannot open it or edit." Reverses "no revising" (ADR 0014) and closes the open point "Bring back" of ADR 0015. The thank-you card already says "You can always revisit previous answers."

## Context

"Your world so far" shows a tile for every answer and a white tile for every card set aside. Until now a tap on a tile did nothing. An answer could not be reopened, and a card set aside came back only when the deck rules brought it round (ADR 0020). The design had a way to bring a card back; it was put off on 4 November because the engine had no event for it.

Two rules stay as they are and shape everything below. Events are append-only: nothing stored is edited in place. And the server cannot read an answer, so it cannot be asked to change one.

## Decision

- **Every tile opens.** A tile is a button. A tap opens a place to write for that card, the one the blank card has (ADR 0022): the card's area and its question on top, the field, "Not now" and "Save". On a phone it is a sheet, on a laptop a card over the desk, and it fits above the keyboard (ADR 0023).
- **A card set aside opens empty.** Saving records an `answered` event for that card on the round in progress, exactly as answering it in the stack would. The card is then answered: its white tile becomes a tile with the words, and the deck rules never bring it round again. If it happens to be the card in front at that moment, the next card comes forward. "Not now" changes nothing: the card stays set aside.
- **This works for a card set aside twice as well.** It is out of the rounds for good (ADR 0020), and its tile is the way back in.
- **The set-aside tiles are all of them.** The list was the cards set aside in the round in progress. It becomes every card set aside in any round and not answered since, oldest first. A participant does not see where one round ends and the next begins, so a tile must not vanish at that line.
- **An answer opens with its words.** Saving records a new `answered` event for the same card on the round in progress. Nothing stored is changed: the earlier answer stays as it is, and the later one is the answer. "Later" is by the round's number, then by the event's place in the round.
- **A card of the deck opens on its tint.** Added on 18 November, after Marco reopened a saved card on his phone: "It loses the original color." The place to write is then drawn as the open card is: the tint, the question, a rule and the words, with no box around the field. An answer has the tint of its tile. A card set aside has the tint its tile will have once it is answered: its number in the round in progress, which is the tint it has in the stack of that round. Its tile stays white until then. That was Marco's choice the same evening, when asked whether it should stay white like its tile: "Give it colour." Only a blank card opens white: it is in no deck and has no number.
- **One tile per card.** The tile stays where the first answer put it and shows the words of the latest one.
- **A blank card opens the same way.** The new event keeps the blank card's own id.
- **Only what this device can show can be changed here.** An answer written on another phone shows as a tile without words (ADR 0014), and that tile is not a button: there is nothing to edit. A card set aside opens on any device.
- **An empty text cannot be saved.** To take everything back there is "Delete everything".
- **The export gives the latest answer to each card.** One row per participant and card. Earlier versions are left out, and the summary says how many. `--all-versions` puts them back, with a column that marks the latest.

## Consequences

- **No change on the server or in the database.** The server has always taken more than one event for a card; it never looked. The change is in the client and in the export tool.
- **The earlier words stay stored until the deletion day**, sealed like every answer. The privacy policy's "What we store" should say so in a sentence: a changed answer adds to what is kept, and only the latest is used. The policy is Marco's file.
- **On the about page, "What we hold" lists one more `answered` row** for each change. That is the truth of what is held.
- **Two phones of one participant that answer the same card** each record an answer, as before. The export now keeps the later one, where it kept both.
- **The deck engine does not change.** It already ignores an answered card, and a round's replay already accepts an `answered` event for a card that is not in its queue (the blank card relies on it).
- **`revisited`, an event kind that was never used, stays unused.**
- **The status command's count of answers counts events**, so a changed answer counts twice. Its page in the runbook says so.
- **Glossary.** "tile" gains its behaviour; "answer" gains "the latest".

## Alternatives

- **Bringing a set-aside card back to the front of the stack**, as the design drew it. It needs an event the engine understands, so a change to the contract and the engine, two days before the send. Opening it where it lies needs neither, and does what the person wants: answer it.
- **Editing in place.** It would break append-only, and the server could not do it without reading.
- **Letting a phone replace an answer it cannot show.** Possible, but it asks a person to overwrite words they cannot see.
- **Keeping every version in the export.** The research team would have to work out which one counts. The participant already said which, by changing it.
