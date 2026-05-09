// shell.js — kept for plugin authors who want to wrap their own output.
// The main render path uses src/render.js#wrapShell which inlines tokens + reset.
// This module re-exports it for convenience.
export { wrapShell } from '../../src/render.js';
