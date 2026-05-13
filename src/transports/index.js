// src/transports/index.js — transport interface + registry entry point.
//
// A transport is the glue between htmd's routing decision and a specific
// chat surface. See docs/PHASE3_DESIGN.md §Transport-interface.
//
// HtmdTransport shape (informal — JSDoc, not TS):
//
//   {
//     name: string,
//     async publish({ slug, renderedHtml, markdown, meta }) →
//       { id, url, submitEndpoint, ... },
//     async deliver({ id, action, payload }) → { ok, detail? }
//   }
//
// Adding a new transport = one file in src/transports/ that imports
// `registerTransport` from ./registry.js, plus an import line in
// loadBuiltins() below (or a third-party package).

export { registerTransport, getTransport, hasTransport, listTransports } from './registry.js';

// Built-ins. Load synchronously at module init via top-level await; the
// registry lives in a sibling module so this top-level await never
// participates in an import cycle.
await import('./stdio.js');
await import('./openclaw-telegram.js');
