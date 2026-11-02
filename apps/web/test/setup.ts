// Runs before every client test (apps/web/vite.config.ts, setupFiles): an in-memory IndexedDB,
// so the device store works in a test the same way it does in a browser. It must load before
// Dexie, which picks up `indexedDB` when it is imported.
import 'fake-indexeddb/auto';
