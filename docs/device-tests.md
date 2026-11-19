# Device tests

The script Marco runs on real hardware in week 3 (design plan, 9 to 13 November 2026): five devices, then VoiceOver, TalkBack and a low-end Android. Each section is a numbered list of taps and what must be seen or heard. Each of the five device sections takes ten to fifteen minutes; the VoiceOver and TalkBack sections take about twenty, since they are read aloud step by step. The tests in `apps/web/test` cover what a test browser can see; this page covers what only a phone can show: the keyboard, the motion, the screen readers, the in-app browser. The accessibility pass these sections check is in the build log, 11 November 2026.

## Before you start

- **Use staging**: `https://staging--worldbuilder-uot.netlify.app/rural-manufacturing/join/wave-1#p=<value>`. Staging has its own database; nothing here touches the real workshop.
- **The value after `#` names the participant.** The same value on any device is the same person; a new value is a new person. Each section below gives its own value, so the sections never mix. A value is 4 to 80 letters, digits, `-` or `_`. It stays in the browser: it is never sent to our server, and the address bar drops it once the page has read it.
- **The second device.** Each device section ends by opening the same link on another device, then deleting everything. Keep the laptop at hand for the phone sections and a phone for the laptop sections.
- **The words** below are the ones in `workshops/rural-manufacturing/copy.md` today. If a line reads differently because the copy changed, that is not a failure.
- **When something fails**, write down the section, the step number, what you saw, and take a screenshot. Fill the table at the end.

## 1. iPhone, Safari

Value: `marco-iphone-safari-01`. Second device: the laptop.

1. In Safari, open `https://staging--worldbuilder-uot.netlify.app/rural-manufacturing/join/wave-1#p=marco-iphone-safari-01`. You see the welcome: the fanned cards, "The future of local production in America", the paragraph, and one black button, "I understand". The address bar ends in `/join/wave-1`, without the `#` part.
2. Tap "I understand". The stack: in front, a card labelled "Try a card" that says "Open a card to answer. Swipe it away to set it aside.", with "Got it".
3. Tap "Got it". The first card comes forward: its area at the top, the question, a pen with "Write an answer".
4. Tap the card. The card leaves its place in the stack (the cards behind it stay) and a plain card of the same colour grows from that place to the top of the screen, as the open card fades in there over it, in about a quarter of a second (ADR 0027). The open card itself does not move or slide up: it is in its place from the first moment, and only the plain card under it travels. The keyboard rises, the cursor is in the field. From the top of what is left above the keyboard: the card's area with the × on the right, the question, the field, then Save, greyed out. On this first card the tip "Prefer to talk?" sits under the field, its words beside "Got it", and the field is two lines tall or more; tap "Got it" and the field takes the room, three lines or more, with "Prefer to talk?" as a link beside Save. "World Builder" and the "?" are hidden behind the open card. Under Save there is a strip of empty space, about a finger wide, where Safari's address bar floats: the bar must not cover Save. Nothing slides out at the top. **Then only the card scrolls (ADR 0025)**, with the card open and the keyboard up:
   1. Drag the row with the ×, the question, the row with Save, and the grey around the card, up and down, slowly and then quickly. Nothing moves and nothing flickers.
   2. Type more lines than the field shows, about eight. The text scrolls inside the field and the line you type stays in sight. The question and Save stay where they are. Drag up and down inside the field: the text scrolls, the card does not.
   3. Turn the phone on its side, the keyboard up. There is too little room for a × and a Save that stay: the whole card scrolls, with Save at its end, and the page behind still does not move. Turn the phone back.
   4. Drag up and down inside the field while its text is all in sight: nothing moves. Tap Save's row and the ×'s row without dragging: a tap still works. With a long text scrolled to its top, start a drag a little sideways and go on upwards: the text should still scroll. If it does not at the first try, note how often.
   5. Tap × to close: the open card fades out and a plain card of its colour goes from it back down into the stack, landing as the card in front shows again; the card is back in front of the stack, the cards are where they were, "World Builder" at the top, the page has not moved. Tap "Write your own story": the open card fades in where it stands, white, with only the × in its head, nothing travels to it (a new blank card has no place to come from), it does not slide up from the bottom, and the cards behind it do not move. Drag its title, the grey around it and the row with Save: nothing moves. Tap "Prefer to talk?": the tip opens under the field. Tap ×.
   6. Open the card again: your words are still there, in a field of the same height. Delete the words and leave the card open.
5. Tap the keyboard's microphone, say one sentence, then tap Save. The open card fades out where it stands, and a plain card of its colour goes from it down to the pill "Your world so far" at the foot of the screen, shrinking to the pill and fading as it reaches it; nothing flies off sideways. While the keyboard is still up the pill is under it, so the card may go behind the keyboard: note what you see. The next card is in front, the pill at the bottom reads 1.
6. Tap "Set aside". The card leaves sideways and the next one comes forward.
7. Drag the next card a little to the left and let go: it springs back. Drag it past about a third of the screen: it leaves, as with the button.
8. Tap "Your world so far". A white sheet rises: "1 answered · 2 set aside", your answer's tile with your words, two white tiles under "Set aside", and at the foot "Come back whenever you like..." with "Remind me". Tap "Remind me": the Calendar offers the event; cancel it. Drag the sheet down by its top: it closes.
9. Tap the round "?" at the top right. Back at the top, the title, "The technical details" folded; no "?" on this page. Tap the fold: it opens. Tap Back: you are on the cards where you left them.
10. On the laptop, open the same link with the same value. No welcome: the cards. In "Your world so far", your iPhone answer shows its question and "Written on another phone." instead of the words.
11. On the iPhone: the "?", then "Delete everything and start over". The question "Delete everything you sent...?" with "Yes, delete everything" and "Keep my answers". Tap "Keep my answers": the question goes. Tap the delete button again, then "Yes, delete everything". You are on the welcome, with "I understand" under it (ADR 0026). Tap it: the first card with "Got it" comes first again, and "Your world so far" is empty. Then delete once more and reload the welcome: "I understand" is gone and the page says "To start, open the link you were sent." That is right: a reload forgets.
12. On the laptop, reload the page. The welcome says "The link this phone remembered is not in use any more. Open the link from your email again."
13. Settings, Accessibility, Motion, Reduce Motion on. Open the link again (it starts you over), tap "I understand", "Got it", then "Set aside": the card fades where it is, it does not fly. Tap the card in front: the open card fades in and nothing grows from the stack. Tap ×: it fades out and nothing goes back to the stack. Open it again, type a word, Save: it fades out and nothing goes to the pill. Turn Reduce Motion off.

## 1b. iPhone, Safari: tiles open (ADR 0024)

Value: `marco-iphone-tiles-01`. Second device: the laptop.

1. Open the staging link with this value, "I understand", "Got it". Answer the first card ("First words"), set the next one aside, and with "Write your own story" save a blank card ("My story").
2. Tap "Your world so far". Each tile, the white one too, has a small pen in its top right corner. The tiles are no taller than before.
3. Tap the white tile under "Set aside". The sheet closes and a plain card grows from where the tile was to the top of the screen as the open card fades in over it, the same box as for the card in front, in the colour the card had in the stack: the card's area and the × on top, its question, a thin line under it, the field empty with no box around it, the keyboard up, "Prefer to talk?" and "Save" above it with the strip under them. The tip is not open by itself here. Type a few words and tap ×: a plain card goes from the open card down to the pill, since the tile is in the closed sheet, and you are back on the cards. Open the sheet and tap the same tile: your words are there. Tap "Save": a plain card goes to the pill, and you are on the cards. Open the sheet: the white tile is gone, the card is a tinted tile with your words, and the summary reads "3 answered · 0 set aside".
4. In the sheet, tap the tile with "First words". The open card has the colour of the tile you tapped, a thin line under the question and no box around the words. The question on top and "First words" in the field. Change them and tap "Save". Open the sheet: the tile is in the same place, with the new words. The pill still reads 3.
5. Tap the blank card's tile: white, with a box around the field. "Your own card", the hint, "My story" in the field. Delete everything in the field: "Save" is greyed out. Type new words, "Save": still one blank card tile, with the new words.
6. The front card has not moved through any of this. Reload the page: the same front card, the same tiles, the same words.
7. On the laptop, open the same link with the same value. The tiles show "Written on another phone." and are not buttons: a click does nothing and the pointer is an arrow. A card set aside on the iPhone and not answered would still open there.
8. Set aside the front card, answer cards until it comes round again in front, then open its white tile from the sheet and save it: the next card comes forward.

## 2. iPhone, the Gmail app's built-in browser

Value: `marco-iphone-gmail-01`. Second device: the laptop.

Before: from the laptop, email yourself the link with this value, as a link. In the Gmail app on the iPhone, check in Gmail's settings (Default apps) that links open inside Gmail, not in Safari.

1. In the Gmail app, tap the link. The page opens inside Gmail, with Gmail's bar around it. The welcome shows, with "I understand". Nothing on it says whether the `#` part arrived: the welcome looks the same with and without it. Steps 8 and 10 together are the check, and the most important lines of this section (the newsletter's risk, ADR 0018).
2. Tap "I understand", then "Got it", then the first card. The keyboard rises; the ×, the question, the field and Save stay above it, and Gmail's own bar does not cover Save.
3. Write a sentence and tap Save. The next card comes forward; the pill reads 1.
4. Tap "Set aside". The card leaves.
5. Tap "Your world so far": the sheet, your tile, one set-aside tile. Tap ×: it closes.
6. Tap "Remind me" in the sheet. Note what happens: inside Gmail the calendar may not open. That is Gmail's choice, not a failure, as long as the page itself still works after it.
7. Tap the "?" at the top right, open the fold, tap Back.
8. Close the in-app browser and tap the link in the email again. Note which of the two you see: the cards where you left them, or the welcome. Both are right; on the welcome, "I understand" must land on your cards, with your answer as "Written on another phone." if Gmail kept nothing. If it lands on a first card with nothing answered, the `#` part was lost on the way: stop here and note it. Landing on your cards does not yet prove the link arrived: if Gmail kept its storage, the cards come back from the phone itself. Step 10 is the other half.
9. From the in-app browser's menu, choose "Open in Safari". Expected today: Safari shows the welcome as for a new person, because the page had already dropped the `#` part from its address. Do not tap "I understand". Note it: a participant who moves to Safari this way starts over unless they open the email's link in Safari.
10. On the laptop, open the same link with the same value: the cards, your iPhone answer as "Written on another phone." If the laptop shows the welcome instead of the cards, the `#` part never reached the page in Gmail: the phone joined under a code of its own, and the server has not met this link. Stop here and note it.
11. Back in Gmail's browser: the "?", "Delete everything and start over", "Yes, delete everything". The welcome, with "I understand". Do not tap it. Reload on the laptop: "The link this phone remembered is not in use any more...".

## 3. Android, Chrome

Value: `marco-android-chrome-01`. Second device: the iPhone.

1. In Chrome, open the staging link with this value. The welcome with "I understand"; the address bar without the `#` part.
2. Tap "I understand": "Try a card". Tap "Got it": the first card, with its area, the question and "Write an answer".
3. Tap the card. The open card fades in over the screen, where it stands, and a plain card of its colour grows from the stack to it under it as it does; the card's place in the stack is empty meanwhile. The keyboard rises and the open card fits above it: the area and the ×, the question, the field and Save all show, and the page does not jump. "Prefer to talk?" sits in the card with "Tap the microphone on your keyboard." There is no empty strip under Save here: Chrome has no floating bar. **Then only the card scrolls (ADR 0025)**, with the card open and the keyboard up:
   1. Drag the question, the row with Save, and the grey around the card, up and down. Nothing moves and nothing flickers.
   2. Type more lines than the field shows. The text scrolls inside the field and the line you type stays just above the keyboard. The question and Save stay where they are.
   3. Turn the phone on its side, the keyboard up: the whole card scrolls, with Save at its end, and the page behind does not move. Turn it back.
   4. Drag up and down inside the field while its text is all in sight: nothing moves.
   5. Hide the keyboard with Back: the card fills the screen again, Save at its foot, the field taller. Close the card with ×: it fades out, a plain card goes back to the stack, and the cards are where they were. On Android the keyboard shortens the page, so the stack may be smaller while the keyboard is up and grow as it goes down: note whether the plain card lands on a card of another size. Tap "Write your own story": the open card fades in, nothing travels to it, and the cards behind do not move. Tap ×: nothing travels.
   6. Open the card again and delete the words.
4. Dictate one sentence with the keyboard's microphone, then Save. The open card fades out and a plain card goes from it to the pill, shrinking and fading as it reaches it; the next card is in front, the pill reads 1.
5. Tap "Set aside", then drag the next card away sideways. Both leave; a short drag springs back.
6. Tap "Your world so far": the sheet, "1 answered · 2 set aside", your tile, two set-aside tiles, "Remind me" at the foot.
7. With the sheet open, use Android's Back (the gesture or the button). Note what happens. Expected today: the sheet does not catch Back, so Chrome goes back a page and leaves the app. Open the link again: you land on your cards, nothing lost.
8. Open the sheet and tap "Remind me": the calendar app offers the event, or Chrome downloads `reminder.ics`. Note which. Close the sheet with ×.
9. The "?" at the top right: the title, the fold opens and closes, Back returns to the card.
10. On the iPhone, in Safari, open the same link with the same value: the cards, your Android answer as "Written on another phone."
11. On the Android: the "?", "Delete everything and start over", "Keep my answers" (the question goes), delete again, "Yes, delete everything": the welcome, with "I understand". Tap it: the first card again.
12. On the iPhone, reload: "The link this phone remembered is not in use any more...".

## 4. Laptop, Chrome

Value: `marco-laptop-chrome-01`. Second device: the iPhone. This section uses the keyboard only, from step 3.

1. Open the staging link with this value in a window at least 1,100 pixels wide. The welcome; "I understand" with the mouse.
2. "Got it". The page: the stack on the left, "Your world so far" on the right with its empty notice, and "0 answered" in the top bar.
3. Click the page's empty background once, then press Tab. A black ring shows around each control in turn: the "?" at the top right, the card, "Set aside", "Write your own story", "Remind me". No control is skipped, none is without a ring.
4. Tab to the card and press Enter. A plain card of its colour grows from the stack to the centre of the page as the open card fades in there over it, over the dimmed page, with the cursor in the field; the card's place in the stack is empty meanwhile. The open card itself does not move. Press Tab a dozen times: the ring stays inside the open card. Press Esc: the open card fades and a plain card goes from it back to the stack, landing as the card in front shows again; the ring is on the card in front. Press Enter again, type a sentence, Tab to Save and press Enter. The open card fades out and a plain card goes from it to the first tile on the right, which shows as it lands; the top bar reads "1 answered", and the next card has the ring. Write your own story, Save: a white card with a dark line goes to the new tile. Open "Write your own story" again and press Esc: it only fades, nothing travels.
5. Tab to "Set aside", press Enter. A white tile appears under "Set aside" on the right.
6. Make the window narrower than 600 pixels. The phone layout: the pill at the bottom. Tab to the pill, press Enter. The sheet opens with the ring on ×. Press Tab a dozen times: the ring stays inside the sheet. Press Esc: the sheet closes and the ring is on the pill. Widen the window again.
7. Tab to the "?" at the top right (it is named "About this app"), press Enter. The page opens and the focus is on its title. Tab to "The technical details", press Enter: it opens; Enter again: it closes.
8. Tab to "Delete everything and start over", press Enter. The focus moves to the question. Tab: "Yes, delete everything", then "Keep my answers". Press Enter on "Keep my answers": the ring is back on the delete button.
9. Press Ctrl and + until the zoom reads 200%. Everything is still on screen, nothing is cut off, and the page does not scroll sideways. Ctrl and 0 to reset.
10. On the iPhone, open the same link: the cards, your laptop answer as "Written on another phone."
11. On the laptop: delete everything ("Yes, delete everything"). On the iPhone, reload: "The link this phone remembered is not in use any more...".

## 4b. Laptop, Chrome: tiles open with the keyboard (ADR 0024)

1. With an answer and a card set aside on the right, Tab until a tile has the ring: it is a button. Press Enter. A plain card grows from the tile to the centre of the page as the open card fades in there: the open card in the centre of the page, the same as for the card in front, and the tile's place on the right is empty meanwhile: the area and the ×, the question, the field with the cursor in it (empty for a card set aside, holding the words for an answer). The card of an answer has the colour of its tile; a card set aside in this round has the colour it had in the stack, and its tile takes that colour once it is saved. Only "Your own card" is white.
2. Press Esc: it closes, a plain card goes back to the tile, and the ring is back on the same tile. Press Enter again, click the dimmed page around the open card: it closes too, keeping the words. Press Enter again, change the words, Tab to "Save", Enter. A plain card goes to the tile, and the tile shows the new words in the same place; "n answered" in the top bar has not changed.

## 5. Laptop, Safari

Value: `marco-laptop-safari-01`. Second device: the Android.

Safari does not move Tab to buttons and links unless asked: in Safari, Settings, Advanced, tick "Press Tab to highlight each item on a webpage". Or hold Option while pressing Tab.

1. Open the staging link with this value. The welcome; "I understand"; "Got it".
2. Tab through the page: a black ring on the "?", the card, "Set aside", "Write your own story", "Remind me".
3. Enter on the card, type, Tab to Save, Enter. The tile on the right; "1 answered" in the top bar; the ring on the next card.
4. Set aside a card with the keyboard. The white tile on the right.
5. Narrow the window below 600 pixels, open the sheet from the pill with Enter, Tab inside it, Esc to close: the ring returns to the pill. Widen again.
6. The "?" with Enter. Open the fold with Enter: Safari draws no arrow of its own beside "The technical details", only ours, which turns.
7. Delete in two steps with the keyboard: Enter on delete, the focus on the question, "Keep my answers" returns it to the delete button.
8. Click "Remind me": Safari downloads `reminder.ics` or opens Calendar. Note which.
9. System Settings, Accessibility, Display, Reduce motion on. Set aside a card: it fades in place. Open the card in front, press Esc, open it again, type, Save: the open card only fades each time, nothing grows from the stack or goes to a tile. Turn it off.
10. On the Android, open the same link: the cards, your answer as "Written on another phone."
11. Delete everything on the laptop. Reload on the Android: "The link this phone remembered is not in use any more...".

## 6. VoiceOver on the iPhone

Value: `marco-iphone-voiceover-01`, in Safari.

Turn VoiceOver on and off: Settings, Accessibility, Accessibility Shortcut, choose VoiceOver; then a triple-click of the side button switches it. The gestures:

| Gesture                                                    | Does                                          |
| ---------------------------------------------------------- | --------------------------------------------- |
| Swipe right / left with one finger                         | next / previous item                          |
| Double-tap                                                 | presses the item VoiceOver is on              |
| Two-finger swipe up                                        | reads everything from the top                 |
| Turn two fingers like a dial (the rotor), stop on Headings | then swipe down / up: next / previous heading |
| Three-finger swipe up / down                               | scrolls                                       |
| Two-finger double-tap, in a text field                     | starts and stops dictation                    |

1. Open the link. Swipe right from the top. You hear: "World Builder", the organizer line ("Under Over Through x Mechanism" for this workshop), "The future of local production in America, heading level 1", the purpose line, the paragraphs, "I understand, button". The fanned cards say nothing.
2. Double-tap "I understand". VoiceOver lands on "World Builder, heading level 1". Swipe right: the organizer, "About this app, button" (the "?"), "Try a card", "Open a card to answer. Swipe it away to set it aside.", "Got it, button", "Set aside, button", "or swipe the card away", "Your world so far, 0 answered, button". The cards behind say nothing.
3. Double-tap "Got it". VoiceOver lands on the first card: its area, its question, "Write an answer, button".
4. Double-tap. The open card opens: you hear the question as the field's name, then "text field". Dictate a sentence (two-finger double-tap). Swipe right to "Save, button" (before you write it says "dimmed"); double-tap. You hear "Saved", and VoiceOver is on the next card.
5. Swipe to "Set aside, button", double-tap. You hear "Set aside".
6. Rotor on Headings, swipe down: the only heading on the card screen is "World Builder".
7. Swipe to "Your world so far, 1 answered, button", double-tap. VoiceOver is on "Close, button". Swipe right: "Your world so far, heading level 2", "1 answered · 1 set aside", "Answered, heading level 3", your tile (area, question, words), "Set aside, heading level 3", the set-aside tile, the "Come back whenever..." line, "Remind me, link". Swipe right again: VoiceOver stays in the sheet; nothing from the cards behind. Swipe back to "Close, button", double-tap: the sheet closes and VoiceOver is on the pill. Open the sheet again and swipe to your tile: it reads as a button, its area, question and words, then "Change your answer"; the set-aside tile ends with "Answer this card". Double-tap the set-aside tile: VoiceOver is in the field, named by the question. Swipe left to "Close without saving, button", double-tap: VoiceOver is on the pill.
8. Swipe back to "About this app, button", just after the organizer, double-tap. You hear "About this app, heading level 1". Swipe right to "The technical details" (it says collapsed, or a button); double-tap: it says expanded; swipe right: "How your answers are protected, heading level 2".
9. Find "Delete everything and start over, button", double-tap. VoiceOver reads the question, "Delete everything you sent, from this phone and from our server? It cannot be brought back." Swipe right: "Yes, delete everything, button", "Keep my answers, button". Double-tap Keep: VoiceOver is back on the delete button.
10. Swipe left until "Back, button" at the top, double-tap: "World Builder, heading level 1" again.
11. Turn VoiceOver off. Delete everything for this value if you like.

## 7. TalkBack on the Android

Value: `marco-android-talkback-01`, in Chrome.

Turn TalkBack on and off: Settings, Accessibility, TalkBack. Once the shortcut is set there, holding both volume keys for three seconds switches it. The gestures:

| Gesture                                                                                                                               | Does                                          |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Swipe right / left with one finger                                                                                                    | next / previous item                          |
| Double-tap                                                                                                                            | presses the item TalkBack is on               |
| Two-finger swipe                                                                                                                      | scrolls                                       |
| Reading controls: swipe up or down (older TalkBack), or three-finger swipe up or down (TalkBack 12 and later), until it says Headings | then swipe down / up: next / previous heading |
| Swipe down then left, or the Back button                                                                                              | Back                                          |

1. Open the link. Swipe right from the top. You hear the app's name, the organizer, "The future of local production in America, heading 1", the paragraphs, "I understand, button". The fanned cards say nothing.
2. Double-tap "I understand". TalkBack lands on "World Builder, heading 1". Swipe right: the organizer, "About this app, button" (the "?"), "Try a card", its words, "Got it, button", "Set aside, button", the swipe hint, "Your world so far, 0 answered, button".
3. Double-tap "Got it": TalkBack is on the first card, read as one button with its area, its question and "Write an answer".
4. Double-tap. TalkBack says the question as the field's name and "edit box". Type or dictate a sentence. Swipe to "Save, button", double-tap: you hear "Saved", and TalkBack is on the next card.
5. "Set aside, button", double-tap: you hear "Set aside".
6. Choose Headings in the reading controls: on the card screen there is one, "World Builder".
7. Open "Your world so far" with a double-tap. TalkBack is on "Close, button". Swipe right through the sheet: the heading, the summary, "Answered", your tile, "Set aside", the tile, "Remind me, link". Swipe on past the end: TalkBack stays in the sheet. Double-tap Close: TalkBack is back on the pill.
8. "About this app, button", just after the organizer: "About this app, heading 1". "The technical details": it says collapsed; double-tap: expanded.
9. "Delete everything and start over", double-tap: TalkBack reads the question. "Keep my answers", double-tap: TalkBack is back on the delete button.
10. Back at the top of the page: "World Builder, heading 1" again.
11. Turn TalkBack off.

## 7b. A short screen: an iPhone SE or iPhone 8, or any phone with large browser bars

The card screen has to fit without scrolling. On a short screen there is no room for three rows under the cards (build log, 18 November 2026).

1. Open the link, tap "I understand", then "Got it".
2. Look at the top: "World Builder" is readable on the left, the round "?" on the right, and there is clear space, at least a fingertip, between them and the highest card behind the front one.
3. Look under the cards: "Set aside" and "Write your own story" stand side by side on one row. The line "or swipe the card away" is not shown. On a tall phone they are one under the other, with that line between them.
4. Nothing sits under or over the black "Your world so far" button. Tap it: the sheet rises.
5. Close the sheet. Tap "Write your own story": the open card opens. Tap ×.
6. Tap the "?" at the top right: the page opens on the first tap.
7. Tap Back, then tap the card. The ×, the question, the field and Save all show above the keyboard (part 1, step 4). Set cards aside until one with a long question is in front, and open it: if the question and three lines of the field do not fit above the keyboard, the question and the field scroll together inside the card, and Save stays where it is (ADR 0025).

## 8. A low-end Android

Value: `marco-android-lowend-01`, in Chrome, on the oldest or cheapest Android at hand. This section is about what to watch, not about words.

1. **The stack's motion.** Drag a card slowly sideways: it follows the finger, turning as it goes, without stutter or lag. Let go short: it springs back. Drag past a third of the screen: it flies off and the next card moves forward in one smooth step.
2. **Save.** Answer a card. From the tap on Save to the next card in front should feel immediate, under half a second, with the open card fading out in one movement, not in jerks.
3. **The keyboard over the open card.** Tap a card. When the keyboard rises, the ×, the question, the field and Save are all above it, and the page does not jump or flicker. Type ten lines: the text scrolls inside the field, and the question and Save stay where they are (ADR 0025). Close the keyboard with Back: the card fills the screen again.
4. **Rotate** the phone with the keyboard up: the words you typed are still there.
5. **The sheet.** It slides up smoothly; with a few answers in it, scrolling the tiles is smooth; dragging its top down closes it.
6. **No motion.** Settings, Accessibility, Remove animations (on some phones: Developer options, animation scales off). Set aside a card: it fades in place. The sheet fades in instead of sliding. Open the card in front, close it with ×, open it again and Save: the open card only fades, nothing travels from the stack or to the pill. Turn it back.
7. **Background.** Start an answer, leave Chrome for five minutes, come back: the same card. The half-written answer is kept only while Chrome keeps the page in memory; if the page reloaded, it is gone. Note which happened: a phone that reloads often loses drafts.
8. Delete everything for this value.

## Not in this script

- The thank-you card: it needs every card of the deck answered or set aside twice. The tests cover it (`apps/web/test/card.test.ts`, `apps/web/test/accessibility.test.ts`).
- The closed screen: staging stays open. The tests cover it.
- Safari's removal of a site's storage after seven days without a visit: the link brings the participant back (ADR 0018); the readable copies of the answers stay only where Safari kept them.

## Results

| Section | Device and version | Date | Pass or fail | Notes, with step numbers |
| ------- | ------------------ | ---- | ------------ | ------------------------ |
| 1       |                    |      |              |                          |
| 2       |                    |      |              |                          |
| 3       |                    |      |              |                          |
| 4       |                    |      |              |                          |
| 5       |                    |      |              |                          |
| 6       |                    |      |              |                          |
| 7       |                    |      |              |                          |
| 8       |                    |      |              |                          |
