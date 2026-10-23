// @wb/contracts: the shared vocabulary of the system.
//
// Everything that crosses a boundary (device to API, repository to deploy, database to export)
// is described here once, as a Zod schema, and validated against it on both sides.
// Changing anything in this package is an integrator decision; see CLAUDE.md.

export * from './primitives.ts';
export * from './code.ts';
export * from './events.ts';
export * from './session.ts';
export * from './deck.ts';
export * from './workshop.ts';
export * from './api.ts';
