# 0014. Answers stay readable on the device, for the participant

Date: 2026-11-04. Status: accepted. Supersedes the storage rule of ADR 0007; keeps its rule on revising.

## Context

The new design (`design/DESIGN.md`) has "Your world so far": the participant's answers accumulate on the device, as tiles, so the exercise builds a world the person can see. ADR 0007 forbade that: after sync, nothing readable stayed on the device, so a lost or shared phone revealed no answers.

Marco weighed the two on 4 November 2026 and reversed the rule. His reasoning, in his words: participants are not worried that someone picks up their unlocked phone; most phones have a biometric lock. They are worried that we record that a named person answered a card with a joke on a given day, and that the answer surfaces a year later, with their name, in public. That is the guarantee the app exists to give, and it does not depend on what the participant's own phone keeps.

## Decision

- The client keeps a readable copy of the participant's own answers on the device that wrote them, per workshop, next to the sealed outbox. "Your world so far" shows them. Nothing else changes about sealing: every answer is sealed on the device before it leaves, the API never sees plain text, and the server holds only sealed envelopes.
- Revising stays off. What is written is written; a better answer can be given the next time the card comes round. The copy is for reading.
- "Delete everything I sent" wipes the readable copies with everything else on the device, as it does the code and the outbox.
- The about page says plainly what this phone keeps: your answers, readable, for you, until you delete them or the workshop ends. The sentence "nothing readable stays behind" leaves every text that carried it.
- The copy is not sent anywhere, not even to a second device: a participant who continues on another phone sees the questions they answered, not the words. That is a limit of this decision, accepted.

## Consequences

- The guarantee that matters is unchanged and now stated as such in `CLAUDE.md`: nobody, the operator and the partner included, can ever attribute an answer to a person. The code is random, hashed on the server, and never in a URL or a log; the answers are sealed to the partner's key; no name, no email, no address is ever collected.
- An unlocked phone in someone else's hands shows that person the owner's answers. The device lock and delete-me are the protection; the trust text says so instead of claiming more.
- The storage on the device grows by the size of the answers, a few kilobytes per session.
- Readable text on the device means the client's tests must prove the text never enters an event, a request, a log line or a URL: the sealing path is unchanged, and a test asserts that the outbox and the sync body carry sealed bodies only.
- ADR 0007's consequences about "see what we store about you" are reversed: the rows can show the text. Its rule against revising stands.
