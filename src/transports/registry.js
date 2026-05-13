// src/transports/registry.js — bare registry, no other imports.
//
// Kept separate from src/transports/index.js so transport files can
// import `registerTransport` without participating in an import cycle
// with the bootstrap module.

const REGISTRY = new Map();

export function registerTransport(transport) {
  if (!transport || typeof transport !== 'object') {
    throw new Error('registerTransport: transport must be an object');
  }
  if (!transport.name || typeof transport.name !== 'string') {
    throw new Error('registerTransport: transport.name is required');
  }
  if (typeof transport.publish !== 'function') {
    throw new Error(`registerTransport(${transport.name}): publish() is required`);
  }
  if (typeof transport.deliver !== 'function') {
    throw new Error(`registerTransport(${transport.name}): deliver() is required`);
  }
  REGISTRY.set(transport.name, transport);
  return transport;
}

export function getTransport(name) {
  if (!REGISTRY.has(name)) {
    throw new Error(`htmd: unknown transport "${name}". Available: ${listTransports().join(', ') || '(none)'}`);
  }
  return REGISTRY.get(name);
}

export function hasTransport(name) {
  return REGISTRY.has(name);
}

export function listTransports() {
  return [...REGISTRY.keys()];
}
