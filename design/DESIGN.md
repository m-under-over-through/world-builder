# World Builder — design handoff

Design canvas (live, playable): https://claude.ai/artifact/CBoCXUzsqnwZSPaPiAcGen

## How to use this folder (read this first, Claude Code)

- `DESIGN.md` (this file) is the spec: tokens, layout, components, states, deck logic, motion, a11y.
- `artboards/*.dc.html` are the prototype sources, one per screen. They are self-contained HTML with
  every value inline (colors, sizes, spacing, shadows, copy), so they are the ground truth for
  measurements and copy. They run on a small prototype runtime (`<x-dc>`, `{{holes}}`, `<sc-if>`,
  `<sc-for>`, `DCLogic`), so **do not copy the markup into the app**; read it. The exception is the
  `<script type="text/x-dc">` block in `Phone-Prototype.dc.html` and `Desktop.dc.html`: plain JS,
  and the deck/queue logic in it can be ported as is.
- `artboards/canvas.json` only lays the artboards out on the canvas; ignore it.
- Screens in the app's screen map that are **not** designed yet: Wave/Invite landing, Intro screens as
  separate pages (folded into Onboarding cards here), Demo card (folded into Onboarding card 3),
  dictation hint, About this app (trust page, privacy panel, diagnostics, terms), closing screen,
  storage-unavailable warning. Build those from the screen map in the same system below.

| Screen map row | Artboard | Notes |
|---|---|---|
| Card — `fresh` | `Main.dc.html` | stack + whole card is the tap target |
| Card — `answering` | `Card-Answering.dc.html` | keyboard up, nudge, counter |
| Card — `saved` / next card | `Card-Saved.dc.html` | toast, answered card exits, next promotes |
| (addition) Your world so far | `World-Sheet.dc.html` | bottom sheet on phone; the right column on laptop |
| Core loop, playable | `Phone-Prototype.dc.html` | tap, drag to set aside, save, deferred, sheet, session end |
| Core loop on laptop/tablet | `Desktop.dc.html` | stack left, world right; fluid page |
| Welcome | `Welcome.dc.html` | "Let's start" + "I have a code" |
| Intro 1–3 + Demo + consent | `Onboarding.dc.html` | 4 cards, Back/Next, "I understand" |
| Enter code | `Enter-Code.dc.html` | 16 digits in four groups, numeric keypad |
| Session end | `Session-End.dc.html` | code + Copy, install offer, Remind me, sync line |

---

## Overview

A phone-first web app (PWA) for a creative world-building workshop by Under Over Through + Mechanism.
Participants get a deck of question cards, one question per card: tap to answer, swipe to set aside.
Answers accumulate into "Your world so far". Larger screens show the stack and the growing world side
by side. Tone: simple, clean, playful; a desk with colored index cards, not a bank.

Nameable look: **"index cards on a dotted desk"**. Neutral ink-on-paper chrome, a dot grid ground
(nod to the dotted notebook the exercise came from), all the color carried by the cards.

---

## Design tokens

### Color

| Token | Value | Usage |
|---|---|---|
| `color-ground` | `#F4F3EF` | page background |
| `color-ground-dot` | `#DBD8CF` | dot grid: `radial-gradient(#DBD8CF 1px, transparent 1.3px)`, tile `22px 22px` |
| `color-surface` | `#FFFFFF` | toast, sheet, code card, chips, inputs |
| `color-ink` | `#17171A` | text, primary buttons, focus ring |
| `color-ink-soft` | `#3D3D45` | secondary text **on tinted cards** (≥ 6:1 on every tint) |
| `color-muted` | `#5F5F67` | secondary text on ground/white (5:1), foot link, helper lines |
| `color-line` | `#E3E1DA` | chip and input borders |
| `color-line-dashed` | `#D2CFC6` | empty-state dashed border |
| `color-grabber` | `#D9D6CE` | sheet grabber |
| `tint-sun` | `#FFD86E` | card tint 1 |
| `tint-mint` | `#A7E1BD` | card tint 2 |
| `tint-sky` | `#A6CBF5` | card tint 3 |
| `tint-lilac` | `#CBBCF2` | card tint 4 |
| `progress-aside` | `#CFCCC3` | progress segment, card set aside |
| `progress-empty` | `#E4E2DB` | progress segment, card untouched |
| `scrim` | `rgba(23,23,26,0.40)` | behind the sheet |
| `rule-on-tint` | `rgba(23,23,26,0.18)` | 1px rule between question and answer |
| `ink-wash` | `rgba(23,23,26,0.08)` | close (×) button background on a card |

Card tint by card number: `tints[(n - 1) % 4]` with `tints = [sun, mint, sky, lilac]`. A card keeps
its tint everywhere it appears (stack, answering, world tile, progress segment).
Text on tints is always `color-ink` or `color-ink-soft`; never `color-muted` on a tint (fails contrast on mint).

### Typography

Google Fonts: `https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=DM+Sans:opsz,wght@9..40,400..700&display=swap`
Self-host them in the PWA (offline must work); the app may not reach Google Fonts.

| Token | Family / size / line / weight / tracking | Usage |
|---|---|---|
| `font-question-phone` | Bricolage Grotesque 36px / 1.04 / 700 / −0.02em | question on the front card (40px when it fits in two lines, e.g. "What is cool?") |
| `font-question-laptop` | Bricolage 42px / 1.04 / 700 / −0.02em | front card on laptop |
| `font-question-answering` | Bricolage 27px (phone) · 28px (laptop) / 1.08 / 700 / −0.02em | question while answering (`<label>` of the field) |
| `font-display-xl` | Bricolage 48px / 1.0 / 700 / −0.02em | "Thank you" |
| `font-display-l` | Bricolage 40px / 1.02 / 700 / −0.02em | Welcome h1 |
| `font-display-m` | Bricolage 32px / 1.04 / 700 / −0.02em | onboarding card titles |
| `font-heading` | Bricolage 26px (phone) · 28px (laptop) / 1.05 / 700 / −0.02em | "Your world so far" |
| `font-tile-q` | Bricolage 16px (phone) · 17px (laptop) / 1.2 / 700 / −0.01em | question on a world tile |
| `font-body` | DM Sans 17px / 1.45 / 400 | paragraphs, session-end copy |
| `font-answer` | DM Sans 18px (phone) · 17px (laptop) / 1.45–1.5 / 400 | the answer field |
| `font-body-s` | DM Sans 15–16px / 1.45–1.5 / 400 | onboarding body, helper paragraphs |
| `font-tile-a` | DM Sans 14px / 1.45 / 400 | answer on a world tile |
| `font-ui` | DM Sans 15px / 600 | buttons, pills |
| `font-ui-primary` | DM Sans 16px / 600 | full-width primary buttons |
| `font-ui-s` | DM Sans 13px / 600 | chips, Copy, toast |
| `font-label` | DM Sans 12px / 700 / 0.08em / uppercase | card label ("03 of 12 · Everyday life") |
| `font-label-s` | DM Sans 11px / 700 / 0.08em / uppercase | tile label, section labels ("Set aside", "Answered") |
| `font-topbar` | DM Sans 15px / 700 / −0.01em + 11px / 500 / 0.02em muted | "World Builder" + "Under Over Through + Mechanism" (16/12 on laptop) |
| `font-helper` | DM Sans 12px / 400 | counter, nudge, "or swipe the card away", foot link |
| `font-code` | DM Sans 19–22px / 600 / 0.04–0.12em, `font-variant-numeric: tabular-nums` | the 16-digit code |

### Radii

| Token | Value | Usage |
|---|---|---|
| `radius-card` | 24px phone · 26px laptop | cards in the stack |
| `radius-tile` | 18px phone · 20px laptop | world tiles, code card, install card |
| `radius-sheet` | 28px (top corners) | bottom sheet |
| `radius-input` | 14px | code inputs |
| `radius-soft` | 16px | glyph boxes on onboarding card 3 |
| `radius-pill` | 999px | all buttons, chips, toast |

### Shadows

| Token | Value | Usage |
|---|---|---|
| `shadow-card` | `0 1px 2px rgba(23,23,26,.08), 0 20px 44px rgba(23,23,26,.16)` | front card |
| `shadow-card-back` | `0 10px 28px rgba(23,23,26,.10)` (2nd back `.12`) | cards behind |
| `shadow-card-exit` | `0 1px 2px rgba(23,23,26,.08), 0 24px 48px rgba(23,23,26,.20)` | card flying off |
| `shadow-primary` | `0 8px 24px rgba(23,23,26,.18)` | ink pills |
| `shadow-toast` | `0 2px 10px rgba(23,23,26,.12)` | toast, code card (`.08`) |
| `shadow-sheet` | `0 -10px 40px rgba(23,23,26,.22)` | bottom sheet |

### Spacing

| Token | Value | Usage |
|---|---|---|
| `space-page-x-phone` | 24px (header/footer), 28px (text screens), 32px (stack screens) | |
| `space-page-x-laptop` | 36px | |
| `space-card-pad` | 26px (phone stack card), 30px (laptop), 20px 22px 18px (phone answering), 24px 26px 22px (laptop answering) | |
| `space-stack-gap` | 30px phone · 24px laptop | stack → controls below |
| `space-tile-gap` | 10px (phone list) · 14px (laptop grid) | |
| `space-col-gap` | 32px row / 48px column | laptop two-column body |
| `space-safe-top` | 56px in the mockups → use `env(safe-area-inset-top)` + 12px | |

---

## Layout

### Phone (reference 390×844, design for 360–430)

Vertical: safe-area top → top bar 48px (two lines, centered) → main (flex 1, content centered) → footer:
"Your world so far · n" pill 48px, 16px gap, "About this app" 12px link, 22px bottom padding (+ safe-area).

Stack frame: **326×430**, horizontally centered, 32px side margins. Only the next two cards in the queue
show behind the front one:

| Card | Transform | Shadow |
|---|---|---|
| front | none | `shadow-card` |
| back 1 (queue[1]) | `translateY(-26px) scale(0.94) rotate(-2deg)` | `shadow-card-back` .12 |
| back 2 (queue[2]) | `translateY(-52px) scale(0.88) rotate(3deg)` | `shadow-card-back` .10 |

Below the stack (30px gap): "Set aside →" ghost pill 44px, then "or swipe the card away" 12px muted (8px gap).

Answering: the stack collapses into a single card that fills the space between the top bar and the
keyboard (margins 6px 20px 14px). The keyboard is the system keyboard; the mockup draws one at 270px.

### Laptop / tablet (fluid PAGE, reference 1280×820)

Top bar: 22px 36px 8px padding, name block left (two lines), progress right: 12 segments 6px tall,
4px gap, 180px wide, plus "n of 12 answered" 13px muted. `flex-wrap: wrap`, so it stacks when narrow.

Body: `display: flex; flex-wrap: wrap; gap: 32px 48px; padding: 8px 36px 24px`.
- Stack column: `flex: 0 1 420px; min-width: 300px`, content centered vertically. Stack frame
  **400×520** (`width: 100%; max-width: 400px`), back cards at −28px/−56px (same scale/rotation).
- World column: `flex: 999 1 560px; min-width: 0`. Heading row (title + summary, baseline aligned,
  wraps), then tiles: `display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 14px; align-items: start`, then the "Set aside" row (label + chips, `flex-wrap`).
- Footer: centered "About this app".

Because both columns are flex-basis driven, no media queries are needed for the main switch:

| Width | Behaviour |
|---|---|
| ≥ ~1030px (laptop, tablet landscape) | two columns side by side |
| ~600–1030px (tablet portrait, small laptop windows) | wraps to one column: stack first, world below it; grid becomes 2–3 tiles wide |
| < 600px (phone) | use the phone layout (sheet pattern), not the page; the stack column alone is the screen |

Keep the stack column from going sticky or `100vh`; the page scrolls as one.

---

## Components

| Component | Spec |
|---|---|
| **Top bar** | two centered lines on phone, left-aligned block on laptop; nothing else in it (screen map). |
| **Card, front (fresh)** | one `<button>` filling the frame; padding 26px; column, `space-between`: label (`font-label`, ink-soft) / question / affordance row ("Tap to answer" or "Click to answer" on fine pointers, 14px/600 ink-soft, 18px tap icon). Tint by card number. |
| **Card, answering** | same tint, column, gap 12–14px: label row with × close (32px circle, `ink-wash`), question as `<label for="answer">`, 1px `rule-on-tint`, `<textarea>` transparent/borderless/no-resize filling the rest, meta row (nudge left, counter right, 12px ink-soft), action row ("Prefer to talk?" link with mic icon, 14px/600, 1.5px underline; Save ink pill 44px, 24px side padding). |
| **Set aside button** | ghost pill 44px, 1.5px ink border, "Set aside" + arrow-right 18px; padding 0 16px 0 20px. Hint under it on phone only. |
| **Your world pill** (phone) | ink pill 48px, `shadow-primary`, stack icon + "Your world so far" + white count badge (22px, 12px/700). Opens the sheet. The badge takes the tint of the card just saved for the saved-state screen; white otherwise (optional flourish). |
| **Toast** | white pill 36px, `shadow-toast`, 22px ink circle with a check + 13px/600 text. Centered under the top bar (phone: its own 42px slot so nothing jumps; laptop: absolute, top 4px). |
| **World tile** | tint of its card, `radius-tile`, padding 16px 16px 18px (phone) / 18px 18px 20px (laptop), column gap 6–8px: label (`font-label-s` "01 · Everyday life"), question (`font-tile-q`), answer (`font-tile-a`). No truncation; tiles grow. |
| **Set-aside chip** | 40px pill, 1.5px `color-line`, ground (phone) / white (laptop) fill, 13px/600 question text (`white-space: nowrap`), trailing 30px ink circle "bring back" button (phone, icon-only, `aria-label`) or ink mini-pill "↩ Bring back" (laptop). Phone: horizontal scroll row; laptop: wraps. |
| **Sheet** (phone) | from 112px down to the bottom; white, `radius-sheet` top, `shadow-sheet`, padding 10px 20px 0; 40×5 grabber; header (title + "7 answered · 2 set aside · 3 to go" 13px muted; 36px close circle); "Set aside" chip row; "Answered" tile list (scrolls). Scrim behind. |
| **Primary button** | ink pill, white text, 54px full-width ("Let's start", "Continue", "I understand" 50px) or 44–48px inline; disabled = `opacity: .45`, `disabled` attr. |
| **Ghost button** | transparent, 1.5px ink border, ink text, 44px. |
| **Text link** | ink, underline (border-bottom 1.5px for the mic link); muted 12–14px for quiet links ("I have a code", "About this app"). |
| **Progress strip** | 12 segments, 6px, `radius 3px`: answered = card tint, set aside = `progress-aside`, untouched = `progress-empty`. `aria-hidden`; the text "n of 12 answered" is the accessible version. |
| **Code display** | white card `radius-tile`, 16px 18px padding: code 19px/600 tabular in groups of four + ghost "Copy" 36px. |
| **Code inputs** | four `<input inputmode="numeric" maxlength="4">`, 58px, `radius-input`, 1.5px `color-line`; active 2px ink; 22px/600 centered, 0.12em tracking. Labels "1–4", "5–8", "9–12", "13–16" in `font-label-s` muted. |
| **Foot link** | "About this app", 12px muted, centered, on every screen. |

---

## States and interactions

### Card (core loop)

| State (screen map) | What shows | Behaviour |
|---|---|---|
| `fresh` | stack, label, question, "Tap to answer", Set aside + swipe hint, world pill | tap/click/Enter on the card → `answering`. Swipe (either direction) past the threshold or Set aside → `dismissed` (or `deferred`, see deck logic). |
| `answering` | card expanded, keyboard, field focused, nudge "Please don't name real people.", counter, Prefer to talk?, Save | Save disabled while the trimmed draft is empty. × discards the draft and returns to `fresh` (keep the draft in memory for the session so reopening the same card restores it; not in the prototype). |
| `saving` | Save reads "Saving…", disabled (opacity .6), card stays | sealing + writing the outbox; usually < 300ms, no spinner. |
| `saved` | toast "Saved on this device" 1.6s; answered card exits bottom-right; next card promotes; world count +1 | offline-first: this is the normal end state. |
| `synced` | toast "Synced", same style | only when the sync happens while the card is still on screen; otherwise silent. |
| `dismissed` | card exits sideways in the swipe direction; toast "Set aside" | writes `dismissed`; card goes to the end of the deck. |
| `deferred` | same exit; toast "Set aside for another day" | second dismissal of the same card; it leaves this session's queue. |
| end of queue | "Thank you" block replaces the stack (session-end content inline on laptop; on phone navigate to Session end) | |

Counter: count **code points** (`Array.from(text).length`), limit 4,000, enforced by refusing input
past the limit (never cut an emoji). The design shows "n / 4,000" always, quiet 12px; the screen map says
"near 4,000", so acceptable: hide below 3,000, show from 3,000, weight 700 from 3,900.

### Swipe (phone and touch tablets)

| Parameter | Value |
|---|---|
| Gesture | horizontal pointer drag on the front card; `touch-action: pan-y` so vertical scroll still works |
| Follow | `translateX(dx)` + `rotate(dx / 18 deg)`, no transition while dragging |
| Threshold | `|dx| > 100px` at release → set aside; else snap back (250ms ease) |
| Exit | `translateX(±520px)` 250ms ease, then the deck updates (~200ms) |
| Click suppression | a drag of > 6px cancels the tap-to-answer click |
| Non-gesture equivalent | the Set aside button (always present) |

### Other

| Element | State | Behaviour |
|---|---|---|
| Front card / buttons | focus-visible | `outline: 2px solid ink; outline-offset: 3px` |
| Ink pill | hover | no color change needed; optional `transform: translateY(-1px)`; links go muted on hover |
| Ghost pill | hover | background `ink-wash` |
| Bring back (chip) | click | card returns to the **front** of the deck, dismissal count reset; sheet closes on phone |
| World pill | tap | opens the sheet; sheet closes with ×, scrim tap, swipe down, Esc |
| Code inputs | typing | auto-advance after 4 digits; backspace on an empty group goes back; paste of 16 digits (with or without spaces/dashes) fills all four |
| Continue (code) | disabled until 16 digits; `AUTH_CODE_UNKNOWN` → one calm line under the inputs: "That code is not ours; check the digits." ink-soft, no red box |
| Copy (code) | click | copies "4921 0387 1164 2208" (with spaces); label flips to "Copied" for 1.6s |
| Onboarding | Next / Back / dots; last card "I understand" | "I understand" = consent (generates the code, calls join); Back is a ghost pill, Next an ink pill; dots: current ink, done = that card's tint, ahead `color-line-dashed` |

---

## Deck logic (port from `Phone-Prototype.dc.html` / `Desktop.dc.html`)

```
state: deck = [card ids in order], answers = {id: text}, dismissed = {id: count}
queue()      = deck.filter(id => !answers[id] && (dismissed[id] || 0) < 2)
front        = queue[0]; back cards = queue[1], queue[2]
save(text)   = answers[front] = text                       → event answer, toast "Saved on this device"
setAside()   = dismissed[front] += 1; move front to the END of deck
               count 1 → event dismissed; count 2 → event deferred (leaves this session's queue)
bringBack(id)= delete dismissed[id]; move id to the FRONT of deck
session end  = queue is empty
```

"Your world so far" lists `answers` in card order; "Set aside" lists cards with `dismissed > 0` and no
answer (deferred ones included, still bring-back-able). Progress: answered → tint, dismissed > 0 →
`progress-aside`, else `progress-empty`. Persist all three maps per workshop slug on the device.
Note: "bring back" is not an event in the screen map; either add one or treat it as local reordering.

---

## Motion

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| front card | drag | follows pointer, rotates dx/18° | 0 | — |
| front card | release under threshold | back to rest | 250ms | ease |
| front card | set aside | translateX ±520px + rotation, fades out | 250ms | ease |
| answered card | save | `translate(210px, 330px) rotate(16deg)`, shadow-card-exit, fades | 320ms | ease-in |
| back cards | deck advances | each moves one slot forward (transform only) | 250ms | ease-out |
| card → answering | tap | card grows to the answering frame while the stack fades behind | 220ms | ease-out |
| toast | show / hide | fade + 6px rise; hold 1.6s | 160ms | ease-out |
| sheet | open / close | slides from the bottom; scrim fades | 280ms | cubic-bezier(.2,.8,.2,1) |
| world tile | new answer | fade + 8px rise into the grid | 200ms | ease-out |

Respect `prefers-reduced-motion`: keep opacity fades, drop the transforms.

---

## Content

| Item | Rule |
|---|---|
| Question | max ~60 characters, wraps to ≤ 4 lines at 36px inside 326×430; a longer question drops to 32px |
| Answer | 4,000 code points; multiline; `white-space: pre-wrap` on tiles |
| Card label | `NN of 12 · Theme`; tile label `NN · Theme`; two-digit zero-padded number |
| Placeholder | "Say it the way you would say it out loud." |
| Nudge | "Please don't name real people." (always visible while answering) |
| Empty world | "Nothing here yet. Answer a card and it lands here." (phone); laptop adds "…one tile per question. Set-aside cards gather at the bottom until you bring them back." dashed box, `color-line-dashed` |
| Session end | heading "Thank you"; code sentence "If you ever want to continue on another phone, this is you:"; install card "Keep it on your home screen" (iPhone steps; Android gets the Install button); "The next cards wait for you another day. Remind me"; sync line "3 answers waiting to sync. They are safe on this phone." only while the outbox is non-empty |
| Long strings / i18n | everything wraps; chips are the only `nowrap` text and scroll horizontally on phone |
| Offline | no visual change except the saved toast wording; never block the loop |

Sample questions used in the design (from the workshop notebook), with the theme labels I assigned —
the real set and labels come from `workshops/<slug>/copy.md`:
01 What is the typical Tuesday night? · 02 What is embarrassing? · 03 What is cool? (Everyday life) ·
04 What are the most important classes at school? · 10 What is the most important institution? (Institutions) ·
05 Are there immigrants? What do they do? (People) · 06 Who gets richer, or poorer? How? ·
09 What is abundant? What is scarce? (Economy) · 07 What is considered inhumane? · 11 What is a crime? (Values) ·
08 What happens when something breaks? (Systems) · 12 What are the bots doing? (Machines)

---

## Accessibility

- The front card is a real `<button>`; the swipe has the Set aside button as its keyboard/switch equivalent.
- The answer `<textarea>` is labelled by the question (`<label for="answer">`); nudge and counter are
  `aria-describedby` of the field.
- Icon-only buttons carry `aria-label` ("Close without saving", "Bring back: <question>", "Close", "Back").
- Toast: `role="status"`, `aria-live="polite"`.
- Sheet: `role="dialog"`, `aria-modal="true"`, labelled "Your world so far", focus moves to the close
  button on open, trapped inside, Esc closes, focus returns to the world pill.
- Progress strip and decorative stacks/cards are `aria-hidden`; the text alternative is present nearby.
- Focus order on the card screen: card → Set aside → world pill → About this app.
- Contrast: `color-ink-soft` on every tint ≥ 6:1; `color-muted` on ground 5:1 and on white 5.6:1;
  white on ink 17:1. Tints are distinguished by lightness as well as hue; nothing depends on color alone.
- Touch targets ≥ 44px (the 30px bring-back circle sits inside a 40px chip; pad its hit area to 44).
- Focus ring: 2px ink, 3px offset, on every interactive element, including the textarea.

---

## Open items / placeholders

- Playlist links on onboarding card 2 (`#spotify`, `#apple-music`, `#youtube`) are placeholders.
- Consent copy on onboarding card 4 and all intro copy are paraphrases; take the real lines from `copy.md`.
- "Your world so far" (sheet on phone, column on laptop) and "Bring back" are additions to the screen map.
- Theme labels on cards are an assumption; drop the theme and keep "NN of 12" if the workshop has none.
- Stack on the left / world on the right on laptop; mirror it if the facilitators prefer.
- Keyboard and keypad in the mockups are illustrations of the system keyboard, not UI to build.
- Not designed yet: About this app, Wave/Invite landing, closing screen, dictation hint, storage warning.
