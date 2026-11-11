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

1. In Safari, open `https://staging--worldbuilder-uot.netlify.app/rural-manufacturing/join/wave-1#p=marco-iphone-safari-01`. You see the welcome: the fanned cards, "The future of local production in America", the paragraph, "This link is yours...", and one black button, "I understand". The address bar ends in `/join/wave-1`, without the `#` part.
2. Tap "I understand". The stack: in front, a card labelled "Try a card" that says "Open a card to answer. Swipe it away to set it aside.", with "Got it".
3. Tap "Got it". The first card comes forward: its area at the top, the question, a pen with "Write an answer".
4. Tap the card. It opens, the keyboard rises, the cursor is in the field. The question sits above the field; "Prefer to talk?" with "Tap the microphone on your keyboard." sits in the card; Save is greyed out. Nothing is hidden behind the keyboard: the question, the field and Save are all on screen.
5. Tap the keyboard's microphone, say one sentence, then tap Save. The card flies down to the right, the next one is in front, the pill at the bottom reads 1.
6. Tap "Set aside". The card leaves sideways and the next one comes forward.
7. Drag the next card a little to the left and let go: it springs back. Drag it past about a third of the screen: it leaves, as with the button.
8. Tap "Your world so far". A white sheet rises: "1 answered · 2 set aside", your answer's tile with your words, two white tiles under "Set aside", and at the foot "Come back whenever you like..." with "Remind me". Tap "Remind me": the Calendar offers the event; cancel it. Drag the sheet down by its top: it closes.
9. Tap "About this app". Back at the top, the title, "The technical details" folded. Tap the fold: it opens. Tap Back: you are on the cards where you left them.
10. On the laptop, open the same link with the same value. No welcome: the cards. In "Your world so far", your iPhone answer shows its question and "Written on another phone." instead of the words.
11. On the iPhone: "About this app", then "Delete everything and start over". The question "Delete everything you sent...?" with "Yes, delete everything" and "Keep my answers". Tap "Keep my answers": the question goes. Tap the delete button again, then "Yes, delete everything". You are on the welcome.
12. On the laptop, reload the page. The welcome says "The link this phone remembered is not in use any more. Open the link from your email again."
13. Settings, Accessibility, Motion, Reduce Motion on. Open the link again (it starts you over), tap "I understand", "Got it", then "Set aside": the card fades where it is, it does not fly. Turn Reduce Motion off.

## 2. iPhone, the Gmail app's built-in browser

Value: `marco-iphone-gmail-01`. Second device: the laptop.

Before: from the laptop, email yourself the link with this value, as a link. In the Gmail app on the iPhone, check in Gmail's settings (Default apps) that links open inside Gmail, not in Safari.

1. In the Gmail app, tap the link. The page opens inside Gmail, with Gmail's bar around it. The welcome says "This link is yours...". If it does not, the `#` part was lost on the way: stop here and note it. This is the newsletter's risk (ADR 0018), and the most important line of this section.
2. Tap "I understand", then "Got it", then the first card. The keyboard rises; the field and Save stay above it, and Gmail's own bar does not cover Save.
3. Write a sentence and tap Save. The next card comes forward; the pill reads 1.
4. Tap "Set aside". The card leaves.
5. Tap "Your world so far": the sheet, your tile, one set-aside tile. Tap ×: it closes.
6. Tap "Remind me" in the sheet. Note what happens: inside Gmail the calendar may not open. That is Gmail's choice, not a failure, as long as the page itself still works after it.
7. Tap "About this app", open the fold, tap Back.
8. Close the in-app browser and tap the link in the email again. Note which of the two you see: the cards where you left them, or the welcome with "This link is yours...". Both are right; on the welcome, "I understand" must land on your cards, with your answer as "Written on another phone." if Gmail kept nothing.
9. From the in-app browser's menu, choose "Open in Safari". Expected today: Safari shows the welcome **without** "This link is yours", because the page had already dropped the `#` part from its address. Do not tap "I understand". Note it: a participant who moves to Safari this way starts over unless they open the email's link in Safari.
10. On the laptop, open the same link with the same value: the cards, your iPhone answer as "Written on another phone."
11. Back in Gmail's browser: "About this app", "Delete everything and start over", "Yes, delete everything". The welcome. Reload on the laptop: "The link this phone remembered is not in use any more...".

## 3. Android, Chrome

Value: `marco-android-chrome-01`. Second device: the iPhone.

1. In Chrome, open the staging link with this value. The welcome with "This link is yours..." and "I understand"; the address bar without the `#` part.
2. Tap "I understand": "Try a card". Tap "Got it": the first card, with its area, the question and "Write an answer".
3. Tap the card. The keyboard rises. The card shrinks to fit above it: the question, the field and Save all show, and the page does not jump. "Prefer to talk?" sits in the card with "Tap the microphone on your keyboard."
4. Dictate one sentence with the keyboard's microphone, then Save. The card flies off, the next is in front, the pill reads 1.
5. Tap "Set aside", then drag the next card away sideways. Both leave; a short drag springs back.
6. Tap "Your world so far": the sheet, "1 answered · 2 set aside", your tile, two set-aside tiles, "Remind me" at the foot.
7. With the sheet open, use Android's Back (the gesture or the button). Note what happens. Expected today: the sheet does not catch Back, so Chrome goes back a page and leaves the app. Open the link again: you land on your cards, nothing lost.
8. Open the sheet and tap "Remind me": the calendar app offers the event, or Chrome downloads `reminder.ics`. Note which. Close the sheet with ×.
9. "About this app": the title, the fold opens and closes, Back returns to the card.
10. On the iPhone, in Safari, open the same link with the same value: the cards, your Android answer as "Written on another phone."
11. On the Android: "About this app", "Delete everything and start over", "Keep my answers" (the question goes), delete again, "Yes, delete everything": the welcome.
12. On the iPhone, reload: "The link this phone remembered is not in use any more...".

## 4. Laptop, Chrome

Value: `marco-laptop-chrome-01`. Second device: the iPhone. This section uses the keyboard only, from step 3.

1. Open the staging link with this value in a window at least 1,100 pixels wide. The welcome; "I understand" with the mouse.
2. "Got it". The page: the stack on the left, "Your world so far" on the right with its empty notice, and "0 answered" in the top bar.
3. Click the page's empty background once, then press Tab. A black ring shows around each control in turn: the card, "Set aside", "Remind me", "About this app". No control is skipped, none is without a ring.
4. Tab to the card and press Enter. The card opens with the cursor in the field. Type a sentence. Tab to Save and press Enter. The answer appears as a tile on the right, the top bar reads "1 answered", and the next card has the ring.
5. Tab to "Set aside", press Enter. A white tile appears under "Set aside" on the right.
6. Make the window narrower than 600 pixels. The phone layout: the pill at the bottom. Tab to the pill, press Enter. The sheet opens with the ring on ×. Press Tab a dozen times: the ring stays inside the sheet. Press Esc: the sheet closes and the ring is on the pill. Widen the window again.
7. Tab to "About this app", press Enter. The page opens and the focus is on its title. Tab to "The technical details", press Enter: it opens; Enter again: it closes.
8. Tab to "Delete everything and start over", press Enter. The focus moves to the question. Tab: "Yes, delete everything", then "Keep my answers". Press Enter on "Keep my answers": the ring is back on the delete button.
9. Press Ctrl and + until the zoom reads 200%. Everything is still on screen, nothing is cut off, and the page does not scroll sideways. Ctrl and 0 to reset.
10. On the iPhone, open the same link: the cards, your laptop answer as "Written on another phone."
11. On the laptop: delete everything ("Yes, delete everything"). On the iPhone, reload: "The link this phone remembered is not in use any more...".

## 5. Laptop, Safari

Value: `marco-laptop-safari-01`. Second device: the Android.

Safari does not move Tab to buttons and links unless asked: in Safari, Settings, Advanced, tick "Press Tab to highlight each item on a webpage". Or hold Option while pressing Tab.

1. Open the staging link with this value. The welcome; "I understand"; "Got it".
2. Tab through the page: a black ring on the card, "Set aside", "Remind me", "About this app".
3. Enter on the card, type, Tab to Save, Enter. The tile on the right; "1 answered" in the top bar; the ring on the next card.
4. Set aside a card with the keyboard. The white tile on the right.
5. Narrow the window below 600 pixels, open the sheet from the pill with Enter, Tab inside it, Esc to close: the ring returns to the pill. Widen again.
6. "About this app" with Enter. Open the fold with Enter: Safari draws no arrow of its own beside "The technical details", only ours, which turns.
7. Delete in two steps with the keyboard: Enter on delete, the focus on the question, "Keep my answers" returns it to the delete button.
8. Click "Remind me": Safari downloads `reminder.ics` or opens Calendar. Note which.
9. System Settings, Accessibility, Display, Reduce motion on. Set aside a card: it fades in place. Turn it off.
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

1. Open the link. Swipe right from the top. You hear: "World Builder", the organizer line ("Under Over Through x Mechanism" for this workshop), "The future of local production in America, heading level 1", the purpose line, the paragraphs, "This link is yours...", "I understand, button". The fanned cards say nothing.
2. Double-tap "I understand". VoiceOver lands on "World Builder, heading level 1". Swipe right: the organizer, "Try a card", "Open a card to answer. Swipe it away to set it aside.", "Got it, button", "Set aside, button", "or swipe the card away", "Your world so far, 0 answered, button", "About this app, button". The cards behind say nothing.
3. Double-tap "Got it". VoiceOver lands on the first card: its area, its question, "Write an answer, button".
4. Double-tap. You hear the question as the field's name, then "text field". Dictate a sentence (two-finger double-tap). Swipe right to "Save, button" (before you write it says "dimmed"); double-tap. You hear "Saved", and VoiceOver is on the next card.
5. Swipe to "Set aside, button", double-tap. You hear "Set aside".
6. Rotor on Headings, swipe down: the only heading on the card screen is "World Builder".
7. Swipe to "Your world so far, 1 answered, button", double-tap. VoiceOver is on "Close, button". Swipe right: "Your world so far, heading level 2", "1 answered · 1 set aside", "Answered, heading level 3", your tile (area, question, words), "Set aside, heading level 3", the set-aside tile, the "Come back whenever..." line, "Remind me, link". Swipe right again: VoiceOver stays in the sheet; nothing from the cards behind. Swipe back to "Close, button", double-tap: the sheet closes and VoiceOver is on the pill.
8. Swipe to "About this app, button", double-tap. You hear "About this app, heading level 1". Swipe right to "The technical details" (it says collapsed, or a button); double-tap: it says expanded; swipe right: "How your answers are protected, heading level 2".
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

1. Open the link. Swipe right from the top. You hear the app's name, the organizer, "The future of local production in America, heading 1", the paragraphs, "This link is yours...", "I understand, button". The fanned cards say nothing.
2. Double-tap "I understand". TalkBack lands on "World Builder, heading 1". Swipe right: "Try a card", its words, "Got it, button", "Set aside, button", the swipe hint, "Your world so far, 0 answered, button", "About this app, button".
3. Double-tap "Got it": TalkBack is on the first card, read as one button with its area, its question and "Write an answer".
4. Double-tap. TalkBack says the question as the field's name and "edit box". Type or dictate a sentence. Swipe to "Save, button", double-tap: you hear "Saved", and TalkBack is on the next card.
5. "Set aside, button", double-tap: you hear "Set aside".
6. Choose Headings in the reading controls: on the card screen there is one, "World Builder".
7. Open "Your world so far" with a double-tap. TalkBack is on "Close, button". Swipe right through the sheet: the heading, the summary, "Answered", your tile, "Set aside", the tile, "Remind me, link". Swipe on past the end: TalkBack stays in the sheet. Double-tap Close: TalkBack is back on the pill.
8. "About this app": "About this app, heading 1". "The technical details": it says collapsed; double-tap: expanded.
9. "Delete everything and start over", double-tap: TalkBack reads the question. "Keep my answers", double-tap: TalkBack is back on the delete button.
10. Back at the top of the page: "World Builder, heading 1" again.
11. Turn TalkBack off.

## 8. A low-end Android

Value: `marco-android-lowend-01`, in Chrome, on the oldest or cheapest Android at hand. This section is about what to watch, not about words.

1. **The stack's motion.** Drag a card slowly sideways: it follows the finger, turning as it goes, without stutter or lag. Let go short: it springs back. Drag past a third of the screen: it flies off and the next card moves forward in one smooth step.
2. **Save.** Answer a card. From the tap on Save to the next card in front should feel immediate, under half a second, with the answered card flying off in one movement, not in jerks.
3. **The keyboard over the answering card.** Tap a card. When the keyboard rises, the question, the field and Save are all above it, and the page does not jump or flicker. Type ten lines: the field scrolls inside the card, Save stays reachable. Close the keyboard with Back: the card fills the screen again.
4. **Rotate** the phone with the keyboard up: the words you typed are still there.
5. **The sheet.** It slides up smoothly; with a few answers in it, scrolling the tiles is smooth; dragging its top down closes it.
6. **No motion.** Settings, Accessibility, Remove animations (on some phones: Developer options, animation scales off). Set aside a card: it fades in place. The sheet fades in instead of sliding. Turn it back.
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
