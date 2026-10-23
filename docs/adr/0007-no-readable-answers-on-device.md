# 0007. No readable answer is kept on the device after sync

Date: 2026-10-23. Status: accepted.

## Context

The operator decided that participants do not reread or revise: the experience is meditative, what is written is written, and a better answer can be given the next time a card comes round.

## Decision

The client seals the answer immediately, stores only the sealed envelope in the outbox, and removes it once the server has accepted it. Nothing readable remains on the device. The privacy panel shows sealed bodies as sealed.

## Consequences

- A shared or lost phone reveals no answers. The claim "an answer leaves your phone encrypted and nothing readable stays behind" is literally true.
- "See what we store about you" shows rows and sizes, not text. That is honest and the trust page explains it.
- The participant cannot reread. That is the intended experience.
