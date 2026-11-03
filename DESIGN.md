---
name: World Builder
description: A conversation on paper: one question at a time, warm paper and dark ink, one accent for the one action on the screen.
colors:
  paper: "#f6f0e5"
  paper-deep: "#ece4d4"
  card: "#fffcf7"
  ink: "#2b2520"
  ink-soft: "#5e554c"
  line: "#d9cfbf"
  accent: "#a4441f"
  accent-deep: "#83351a"
  on-accent: "#fffaf3"
  state: "#2e6b4c"
  dark-paper: "#1e1a16"
  dark-card: "#2a2420"
  dark-ink: "#f3ece1"
  dark-accent: "#e0805a"
  dark-state: "#8fcfae"
typography:
  title:
    fontFamily: "Iowan Old Style, Palatino Linotype, Palatino, Charter, Book Antiqua, Georgia, ui-serif, serif"
    fontSize: "1.75rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  question:
    fontFamily: "Iowan Old Style, Palatino Linotype, Palatino, Charter, Book Antiqua, Georgia, ui-serif, serif"
    fontSize: "1.625rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  heading:
    fontFamily: "Iowan Old Style, Palatino Linotype, Palatino, Charter, Book Antiqua, Georgia, ui-serif, serif"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1.3
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.55
  small:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.55
  code:
    fontFamily: "ui-monospace, Menlo, Consolas, monospace"
    fontSize: "1.625rem"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "0.08em"
rounded:
  control: "12px"
  card: "20px"
spacing:
  xs: "8px"
  sm: "16px"
  md: "24px"
  lg: "32px"
  xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.accent-deep}"
    textColor: "{colors.on-accent}"
  button-secondary:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 20px"
    height: "44px"
  button-link:
    backgroundColor: "transparent"
    textColor: "{colors.accent}"
    typography: "{typography.body}"
    padding: "8px 0"
    height: "44px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "24px 16px 16px"
  answer-field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "16px"
  hint:
    backgroundColor: "{colors.paper-deep}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "16px"
  warning:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
---

# World Builder

<!-- Written on 3 November 2026 by the UI builder from apps/web/src/app.css after the visual pass (UI item 10), as the brief's "/impeccable document" step. The tokens above are the stylesheet's :root; the partner's colours replace `accent` and `accent-deep` when they arrive. -->

## Overview

A card-based reflection app for workshops: a participant opens a link from a newsletter and answers one question at a time, in their own words, over a few short sessions. The design direction, decided by Marco on 2 November 2026: warm, creative, informal. A conversation on paper, not a form; a workshop, not a product. Not the look of an AI product: no purple, no gradients, no glassy panels, no robot cheer. One thing per screen: one action in the accent, everything else quiet. The copy file is the voice; the design makes room for it.

The client talks to one origin only (the Content Security Policy is `self`), so fonts are the system stacks and there are no images beyond the app's own icons. Every value here is a custom property on `:root` in `apps/web/src/app.css`; nothing is hard-coded in a component.

## Colors

- **Paper and ink.** `paper` is the page, `card` the card on it, `paper-deep` the stack behind the card and the hint; `ink` is text, `ink-soft` secondary text, `line` the hairlines. Dark scheme: the same roles on `dark-paper`, `dark-card`, `dark-ink`.
- **One accent** for the one action on a screen (`accent`, `accent-deep` on hover, `on-accent` for its text): the primary button, links, the caret, the focus ring. Nothing else is orange.
- **One state colour** (`state`, green) only for "Saved on this device." and "Synced." under a card.
- Contrast: ink on paper 13:1; accent on card 5.9:1; on-accent on accent 5.9:1; state on card 5.3:1; ink-soft on paper 6.4:1. All text 4.5:1 or better in both schemes.

## Typography

- **Reading** in the system humanist sans (`body`, 18 px, line height 1.55; `small` at 15 px for labels and the quieter lines). Paragraphs are at most 65 characters wide.
- **The question and the headings** in the system serif with character (`question` at 26 px on the card; `title` at 28 px for the screen's heading; `heading` at 20 px for sections). Balanced wrapping, a touch of negative tracking.
- **The code** in the system monospace, 26 px, spaced, tabular numerals: four groups of four.
- No display face is bundled; the brief allows the system stack, and the partner's typeface, if one arrives, replaces `--font-display` in one line.

## Layout

- One column, 36 rem at most, centred; 16 px side gutters; usable at 320 px wide and with the system font size at its largest (everything is in rem).
- Spacing scale: 8, 16, 24, 32, 48. Tight inside a group, generous between groups; more space above a heading than below it.
- The top bar is the workshop's name, truncated, and "Your privacy". The foot of every screen links to the trust page, the terms and the policy.
- Every control is at least 44 px tall.

## Elevation & Depth

- The card carries the one shadow in the app (`--shadow-card`: a soft offset shadow), and the next card is hinted behind it as a tilted `paper-deep` rectangle (`.card::before`) with a lighter shadow. Nothing else floats.
- The privacy panel's rows are hairlines, not cards. Cards are for cards.

## Shapes

- Cards: 20 px radius. Controls, fields, the hint, the warning: 12 px.
- Hairline borders in `line`, 1 px on fields and cards, 1.5 px on buttons.

## Components

- **Primary button** (`button.primary`): accent, one per screen (Next, I understand, Save, Got it, Yes delete).
- **Secondary button** (`button`): card background, hairline, ink text (Back, Set aside, Reveal, Copy, Not now, I have a code).
- **Link button** (`button.link`): underlined accent text, for the foot's three pages.
- **Card** (`.card`): the question in the serif, the answer field on paper, the nudge, the row of buttons, the state line in green with a drawn tick.
- **Answer field** (`textarea`): paper on the card, 9 rem tall, accent caret.
- **Hint** (`.hint`): a `paper-deep` note under the card with a title and a line.
- **Warning** (`.warning`): an accent hairline box, for the storage warning and "code not accepted".
- **Panel rows** (`dl`): label and value in two columns, one column under 360 px.

## Do's and Don'ts

- Do keep one accent element per screen; a second action is a secondary button.
- Do put every word in `copy.md`; the design never carries text.
- Do keep motion to the card leaving and the tick appearing; `prefers-reduced-motion` turns all of it off.
- Don't add gradients, glass, purple, emoji as icons, or a second shadow.
- Don't use the accent for text that is not a link or the one action.
- Don't nest cards: the panel, the hint and the pages are flat.
