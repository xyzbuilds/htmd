// htmd MCP server entry point. Exposes htmd CLI subcommands as MCP tools
// over stdio. Hand-rolled JSON-RPC dispatch — no SDK dependency. See
// protocol.js for the rationale.
//
// The server is stateless: every tools/call is independent. Same args
// produce the same bytes, every time.

import { runJsonRpcLoop, ERR, RpcError } from './protocol.js';
import { listTools, callTool, getTool } from './tools.js';

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_NAME = 'htmd';

/**
 * Build the message handler — a pure function from (method, params) to
 * result. Exported separately so tests can drive it without spawning a
 * subprocess.
 *
 * @param {{ version: string }} opts
 */
export function createHandler({ version }) {
  return async function handle(method, params) {
    switch (method) {
      case 'initialize':
        return {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: SERVER_NAME, version }
        };

      case 'notifications/initialized':
      case 'initialized':
        return null;

      case 'ping':
        return {};

      case 'tools/list':
        return { tools: listTools() };

      case 'tools/call': {
        const name = params && params.name;
        const args = (params && params.arguments) || {};
        if (!name || !getTool(name)) {
          throw new RpcError(ERR.METHOD_NOT_FOUND, `Unknown tool: ${name || '(missing)'}`);
        }
        try {
          const result = await callTool(name, args);
          return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
            isError: false
          };
        } catch (e) {
          const payload = {
            ok: false,
            error: e.message || String(e),
            ...(e.errors ? { errors: e.errors } : {}),
            ...(e.code ? { code: e.code } : {})
          };
          return {
            content: [{ type: 'text', text: JSON.stringify(payload) }],
            isError: true
          };
        }
      }

      default:
        throw new RpcError(ERR.METHOD_NOT_FOUND, `Method not found: ${method}`);
    }
  };
}

/**
 * Start the MCP server on stdio. Resolves when stdin closes.
 *
 * @param {{ version: string, input?: NodeJS.ReadableStream, output?: NodeJS.WritableStream, logger?: (level: string, msg: string) => void }} opts
 */
export async function startStdioServer(opts) {
  const handle = createHandler({ version: opts.version });
  process.stderr.write(`[htmd mcp] htmd ${opts.version} MCP server ready on stdio\n`);
  await runJsonRpcLoop({
    input: opts.input,
    output: opts.output,
    handle,
    logger: opts.logger
  });
}
