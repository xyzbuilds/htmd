// src/transports/openclaw-telegram.js — Phase 3 transport that wraps
// today's OpenClaw + Telegram pipeline.
//
// Intentionally a thin shim over `serve-helpers.publishRender` and the
// existing `serve.deliverSubmission` path. The goal of v0.5.0-alpha is
// to prove the transport abstraction holds without rewriting any
// working code.
//
// Publish:
//   - Writes the rendered HTML to the local render dir.
//   - Emits a Telegram message JSON envelope (the same shape `htmd
//     button` produces) with a `web_app` button pointing at the Mini
//     App URL when HTMD_MINI_APP_BASE is set, otherwise at the local
//     viewUrl.
//
// Deliver:
//   - Delegates to the existing `deliverSubmission()` so today's modes
//     (`openclaw-ssh`, `openclaw-local`, `telegram`, `file`) keep
//     working.
//
// The Telegram message envelope is *returned to the caller* rather than
// sent directly — htmd does not own a Telegram bot token at this layer.
// The harness adapter takes the envelope and posts it via whatever bot
// it already runs (OpenClaw's outbound message bus, in our case).

import { defaultRenderDir, deliverSubmission } from '../serve.js';
import { publishRender, publicHost } from '../serve-helpers.js';
import { registerTransport } from './registry.js';

function miniAppBase() {
  return (process.env.HTMD_MINI_APP_BASE || '').replace(/\/+$/, '');
}

function buildTelegramEnvelope({ id, viewUrl, slug, meta }) {
  const base = miniAppBase();
  const buttonUrl = base ? `${base}/r/${id}` : viewUrl;
  const buttonText = (meta && meta.buttonText) || 'Open in Telegram';
  const message = (meta && meta.message) || `Tap to open: ${slug || 'reply'}`;
  return {
    chat_id: (meta && meta.chatId) || '<set at delivery time>',
    text: message,
    reply_markup: {
      inline_keyboard: [[
        { text: buttonText, web_app: { url: buttonUrl } }
      ]]
    }
  };
}

export const openclawTelegramTransport = {
  name: 'openclaw-telegram',

  async publish({ slug, renderedHtml, markdown, meta }) {
    const dir = defaultRenderDir();
    const host = publicHost();
    const { id, file, viewUrl, submitUrl } = publishRender({
      html: renderedHtml,
      slug: slug || (meta && meta.slug) || 'reply',
      dir,
      host
    });
    const telegramMessage = buildTelegramEnvelope({ id, viewUrl, slug, meta });
    return {
      id,
      url: viewUrl,
      submitEndpoint: submitUrl,
      file,
      // Adapter takes this and hands it to OpenClaw's outbound bus.
      telegramMessage
    };
  },

  async deliver({ id, action, payload }) {
    const mode = (process.env.HTMD_SUBMIT_MODE || 'openclaw-local').toLowerCase();
    const body = { action, payload };
    const result = await deliverSubmission({ id, body, mode });
    return { ok: !!result.ok, detail: result.detail || result.error || '' };
  }
};

registerTransport(openclawTelegramTransport);
