# 0026. After "Delete everything", the same tab starts over

Date: 2026-11-18. Status: accepted, from Marco's question of 18 November: "why after deleting everything I get the 'open the email link' message? I get why technically, but as a user my expectation would be to go back to the beginning of the experience since I haven't closed the tab or the browser." Adds to ADR 0018; changes nothing in it.

## Context

"Delete everything and start over" deletes the participant on the server, wipes the device's store, and loads the workshop's home afresh, so nothing of the participant stays in memory. A fresh page with an empty store knows nothing, not even which link this device came through. So the welcome said "To start, open the link you were sent", with no button.

That is true to the machine and wrong for the person. They pressed a button that says "start over", in a tab that is still open, and were sent to look for an email.

A link makes the same participant again (ADR 0018): the value after `#` makes the code, and a join with that code after a delete is a new participant under the same link. So "start over" has a plain meaning: join again with the same code.

Joining again with a fresh code instead would be wrong for anyone whose code came from their link, which is everyone who is sent an invitation. The email's link would then mean a different participant from the one on this device, and the next time the person opened the link, the device would switch to the link's participant and lose sight of what was written in between. A device that joined through a link without a value has a code of its own making, and for it a fresh code would do as well; one rule for both is simpler, and the same code does no harm there.

## Decision

- **After a delete, in the same tab, the welcome offers "I understand" again.** The join goes out with the code the device held, through the wave the participant joined through. It is what opening the email's link again would do.
- **The wave is the one the server recorded for the participant** (`GET /me`), not the last one the device opened. Only when the server has not said is it the wave the device last arrived through.
- **The delete leaves one note for the page load that follows it**: the code and the wave. It is in the tab's session storage, which belongs to that tab and goes when the tab is closed.
- **The note is read once and erased**, at the start of the next load, whatever that load turns out to be.
- **After that the code is in memory only.** It does not go back into the device's store. A reload, a closed tab or another tab knows nothing, and the welcome asks for the link, as before.
- **The note is left only once the server has deleted and the device is wiped.** A refused delete leaves none.
- **Only a participant who came through a wave leaves a note.** An invite token works once and has been used.
- **The note is used only at an address that names no wave and no invite**, as the home the delete loads does. A wave link or an invite opened in that tab instead is a new arrival and joins as one; the note is erased all the same.
- **A link with a value opened in that tab wins over the note.**
- **A stored code wins over the note.** A device that still holds a code is not starting over.
- **The note is checked before it is believed**: its workshop, a code of 16 digits, a wave that is a name. Anything else is no note.

## Consequences

- **The code outlives the wipe for a while.** It sits in the tab's session storage for the length of one page load, and then in memory for as long as the welcome is on the screen in that tab. Nothing on the server belongs to it any more. Someone holding the phone at that moment can tap "I understand" and start as that link, with nothing to see. Before, that took the email; while this welcome is on the screen, the phone alone is enough. Once "I understand" is tapped the code is the device's again, stored as after any join.
- **"Delete everything" still leaves nothing of the participant in the device's store.** Two things are outside that sentence. The note is in session storage for the length of one page load, and the next load erases it; if the tab is closed before that load, the browser discards the note with the tab, and a browser that brings a closed tab back may bring the note back with it, to be erased by the next load then. And the workshop's name is back in local storage as soon as the home has loaded, as it was before this decision: it names the workshop, not the person.
- **If that load never happens** (the phone goes offline at that moment and the page is not kept), the note waits in the tab. The next load of this workshop in that tab takes it, whatever its address, and uses it only at an address without a wave or an invite.
- **The code is still in no address and no log.** The page goes to the workshop's home, as before.
- **No wave open is counted for starting over.** The device does not arrive again; it joins again.
- **Starting over is the beginning**: the onboarding card comes first again, because the device no longer remembers having seen it.
- **No change on the server, in the contract, or in the copy.** The question before the delete already says: "Opening your link again starts you over from nothing."
- **A new idea for the operator**: what a tab remembers, and for how long. Learning note 14.

## Alternatives

- **Keeping the page as it is and resetting the app's memory by hand.** The fresh load is what guarantees that no draft, no answer and no row of the old participant is left in memory. Trading that for a reset written by hand, field by field, to save one note, is the wrong trade.
- **Keeping the wave in the device's store, and joining with a fresh code.** No code would be kept at all. But the participant on the device would no longer be the participant of the email's link (see Context).
- **Keeping the code in the device's store until the next join.** The welcome would survive a reload. But a phone that was told to delete everything would go on holding the code for days.
- **Putting the value back after the `#`.** The device never kept the value, only the code it makes (ADR 0018).
- **Saying only "Everything is deleted" and leaving the rest.** Honest, and still a dead end for a person who pressed "start over".
