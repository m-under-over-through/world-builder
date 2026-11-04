# Design

The design of the client lives in `design/DESIGN.md`: the spec (tokens, layout, components, states, deck logic, motion, accessibility) from the design canvas Marco handed over on 3 November 2026, with the prototype sources beside it in `design/artboards/`. Read that file; this one is the pointer the design tooling looks for, with the tokens as the client declares them.

The look is "index cards on a dotted desk": neutral ink on paper for the chrome, a dot grid for the ground, all the colour on the cards. The tokens are custom properties on `:root` in `apps/web/src/app.css`, named as the spec names them.

| Token                                                                                                                 | Value                                                               |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `--color-ground`, `--color-ground-dot`                                                                                | `#F4F3EF`, `#DBD8CF` (dot grid, 22px tile)                          |
| `--color-surface`, `--color-ink`, `--color-ink-soft`, `--color-muted`                                                 | `#FFFFFF`, `#17171A`, `#3D3D45` (on tints), `#5F5F67` (on ground)   |
| `--color-line`, `--color-line-dashed`, `--color-grabber`                                                              | `#E3E1DA`, `#D2CFC6`, `#D9D6CE`                                     |
| `--tint-sun`, `--tint-mint`, `--tint-sky`, `--tint-lilac`                                                             | `#FFD86E`, `#A7E1BD`, `#A6CBF5`, `#CBBCF2`, by card number          |
| `--progress-aside`, `--progress-empty`, `--scrim`, `--rule-on-tint`, `--ink-wash`                                     | `#CFCCC3`, `#E4E2DB`, `rgba(23,23,26,.4)`, `.18`, `.08`             |
| `--font-display`, `--font-ui`                                                                                         | Bricolage Grotesque, DM Sans (self-hosted, `apps/web/public/fonts`) |
| `--radius-card`, `--radius-tile`, `--radius-sheet`, `--radius-input`, `--radius-pill`                                 | 24px (26 laptop), 18px (20 laptop), 28px, 14px, 999px               |
| `--shadow-card`, `--shadow-card-back-1`, `--shadow-card-exit`, `--shadow-primary`, `--shadow-toast`, `--shadow-sheet` | as the spec's table                                                 |
| `--tap`                                                                                                               | 44px, the smallest target                                           |

Every participant-facing word comes from `workshops/<slug>/copy.md`; nothing is typed into a component. Plain words, no em-dashes.
