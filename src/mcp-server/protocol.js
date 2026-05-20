// MCP stdio transport — newline-delimited JSON-RPC 2.0.
//
// Why hand-rolled: the official @modelcontextprotocol/sdk pulls in Express,
// Hono, JOSE, cors, and ~15 other transitive deps for what stdio MCP actually
// is — a unidirectional newline-framed JSON-RPC channel. htmd's design rules
// (no frameworks, no chart libs, deterministic CLI) make those deps a poor
// fit. The stdio protocol is ~30 lines; the dispatch loop is another ~50.
//
// Spec: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports

import { createInterface } from 'node:readline';

// JSON-RPC 2.0 error codes plus MCP additions.
export const ERR = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603
};

/**
 * Run a JSON-RPC dispatch loop over a readable+writable pair of streams.
 *
 * @param {{
 *   input?: NodeJS.ReadableStream,
 *   output?: NodeJS.WritableStream,
 *   handle: (method: string, params: any) => Promise<any> | any,
 *   onClose?: () => void,
 *   logger?: (level: 'error'|'info', msg: string) => void
 * }} opts
 * @returns {Promise<void>} resolves when input ends
 */
export function runJsonRpcLoop(opts) {
  const input = opts.input || process.stdin;
  const output = opts.output || process.stdout;
  const log = opts.logger || ((level, msg) => {
    if (level === 'error') process.stderr.write(`[htmd mcp] ${msg}\n`);
  });

  function write(obj) {
    // MCP stdio: one JSON message per line, no embedded newlines.
    const line = JSON.stringify(obj);
    if (line.includes('\n')) {
      // Defensive: JSON.stringify shouldn't produce newlines, but if upstream
      // somehow injected one, strip it rather than corrupt the framing.
      output.write(line.replace(/\n/g, ' ') + '\n');
    } else {
      output.write(line + '\n');
    }
  }

  const rl = createInterface({ input, terminal: false });

  return new Promise((resolve) => {
    rl.on('line', async (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let msg;
      try {
        msg = JSON.parse(trimmed);
      } catch (e) {
        write({ jsonrpc: '2.0', id: null, error: { code: ERR.PARSE_ERROR, message: `Parse error: ${e.message}` } });
        return;
      }
      if (msg.jsonrpc !== '2.0') {
        // Be lenient — accept missing jsonrpc field but log it.
        log('error', `Missing or wrong jsonrpc field on incoming message`);
      }
      // Notifications have no id; we don't reply.
      const isNotification = msg.id === undefined || msg.id === null;
      try {
        const result = await opts.handle(msg.method, msg.params || {});
        if (!isNotification) {
          write({ jsonrpc: '2.0', id: msg.id, result });
        }
      } catch (e) {
        if (isNotification) {
          log('error', `Notification handler "${msg.method}" threw: ${e.message}`);
          return;
        }
        const code = typeof e.rpcCode === 'number' ? e.rpcCode : ERR.INTERNAL_ERROR;
        write({
          jsonrpc: '2.0',
          id: msg.id,
          error: {
            code,
            message: e.message || String(e),
            ...(e.data !== undefined ? { data: e.data } : {})
          }
        });
      }
    });
    rl.on('close', () => {
      if (opts.onClose) opts.onClose();
      resolve();
    });
  });
}

export class RpcError extends Error {
  constructor(code, message, data) {
    super(message);
    this.rpcCode = code;
    if (data !== undefined) this.data = data;
  }
}
