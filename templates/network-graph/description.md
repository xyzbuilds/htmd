# network-graph

Force-directed node-edge SVG visualization. Layout is computed at
render time with a deterministic PRNG, so identical inputs produce
identical layouts. Read-only; includes an accessible fallback table.

Schema: `{ nodes: [{ id, label, kind? }], edges: [{ source, target, label?, kind? }] }`.
