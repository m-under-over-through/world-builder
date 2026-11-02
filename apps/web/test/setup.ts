// Runs before every client test (apps/web/vite.config.ts, setupFiles): an in-memory IndexedDB,
// so the device store works in a test the same way it does in a browser. It must load before
// Dexie, which picks up `indexedDB` when it is imported.
import 'fake-indexeddb/auto';

// The test DOM (jsdom) brings its own Uint8Array, while Node's TextEncoder, which the DOM lacks
// and Vitest lends it, returns Node's. The two are different classes, and the sealing library
// checks `instanceof Uint8Array` on what it is given, so sealing an answer failed in tests and
// nowhere else. One global, Node's, and the two agree; a browser has only ever had one.
const nodeUint8Array = Object.getPrototypeOf(new TextEncoder().encode('')).constructor;
if (globalThis.Uint8Array !== nodeUint8Array) globalThis.Uint8Array = nodeUint8Array;
