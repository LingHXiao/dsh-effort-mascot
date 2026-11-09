/**
 * Host half of the model-effort bundle.
 *
 * The feature itself is the Client half (exports["./client"]), which shadows the
 * composer's `conversation.input.model` seat.
 *
 * This half also owns two loopback routes the Client half needs:
 *
 * - `POST /model-effort/log` — a diagnostic sink. The Client half posts a crash
 *   it could not render; the handler appends one JSON line to
 *   `$HOME/.dsh/model-effort.log`. The browser console is not readable from a
 *   shell, so this is the only way a Client-side render error can be inspected
 *   without a person copying it out.
 *
 *   Only failures reach this route: the Client half's ordinary trace channel is
 *   gated behind `globalThis.__MEC_TRACE`, so a normal install records nothing
 *   about which model or effort the user picked.
 * - `GET /model-effort/asset/<name>` — the tier illustrations. A Client bundle
 *   cannot import an image, so the file ships in `assets/` and is served here.
 */

import { appendFile, mkdir, readFile, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const LOG_PATH = path.join(os.homedir(), '.dsh', 'model-effort.log');
/** Rotate once the sink passes this; a diagnostic aid must not fill the disk. */
const LOG_MAX_BYTES = 1024 * 1024;
/** Writes allowed per window. Stops a render loop from spinning on this route. */
const LOG_RATE_LIMIT = 30;
const LOG_RATE_WINDOW_MS = 10_000;
const MAX_BODY = 64 * 1024;
const ASSET_DIR = fileURLToPath(new URL('./assets/', import.meta.url));
/**
 * Only plain asset names ship here; no subdirectories, no traversal.
 *
 * `svg` is deliberately absent: an SVG is a document, not an image, so serving
 * one from this origin lets a crafted file run script when opened directly.
 * The four shipped illustrations are `webp`.
 */
const ASSET_NAME = /^[a-z0-9_-]+\.(webp|png|jpe?g)$/;
const ASSET_TYPES = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};
/** Asset bodies are immutable for a release; keep them in memory after the first read. */
const assetCache = new Map();

let rateWindowStart = 0;
let rateWindowCount = 0;

/**
 * Take one slot from a fixed window, so a runaway Client cannot fill the log.
 * @returns {boolean} whether the write is allowed.
 */
function takeRateToken() {
  const now = Date.now();
  if (now - rateWindowStart > LOG_RATE_WINDOW_MS) {
    rateWindowStart = now;
    rateWindowCount = 0;
  }
  if (rateWindowCount >= LOG_RATE_LIMIT) return false;
  rateWindowCount += 1;
  return true;
}

/**
 * Append one line to the sink, creating `~/.dsh` on first use and rotating the
 * file once it grows past `LOG_MAX_BYTES`.
 * @param {string} line - one JSON line, without the trailing newline.
 * @returns {Promise<void>} resolves once the line is on disk.
 */
async function appendLine(line) {
  // A fresh machine has no `~/.dsh`; without this the append fails into the
  // catch below and the one crash worth reading is lost in silence.
  await mkdir(path.dirname(LOG_PATH), { recursive: true });
  try {
    const info = await stat(LOG_PATH);
    if (info.size > LOG_MAX_BYTES) await rename(LOG_PATH, `${LOG_PATH}.1`);
  } catch {
    // No file yet, or it vanished: nothing to rotate.
  }
  await appendFile(LOG_PATH, `${line}\n`, 'utf8');
}

/**
 * Read a small JSON request body.
 * @param {import('node:http').IncomingMessage} req - incoming request.
 * @returns {Promise<unknown>} parsed body, or undefined when absent/invalid.
 */
async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) return undefined;
    chunks.push(chunk);
  }
  if (chunks.length === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return undefined;
  }
}

/**
 * @param {import('node:http').ServerResponse} res - response to finish.
 * @param {number} status - HTTP status.
 */
function end(res, status) {
  res.writeHead(status, { 'cache-control': 'no-store' });
  res.end();
}

/**
 * Host plugin body: mount a diagnostic sink once the Web carrier exists.
 * @param {import('@deepseek-ai/cordis').Context} ctx - host context.
 */
export function apply(ctx) {
  ctx.inject(['webServer'], (web) => {
    web.effect(() => web.webServer.register({
      kind: 'prefix',
      path: '/model-effort',
      handler: async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');

        if (req.method === 'GET' && url.pathname.startsWith('/model-effort/asset/')) {
          const name = url.pathname.slice('/model-effort/asset/'.length);
          const ext = ASSET_NAME.exec(name)?.[1];
          if (ext === undefined) {
            end(res, 404);
            return;
          }
          const file = path.join(ASSET_DIR, name);
          // Cache on the file's own stamp so replacing an illustration takes
          // effect on the next page reload, without restarting the Host.
          let stamp;
          try {
            const info = await stat(file);
            stamp = `${info.mtimeMs}:${info.size}`;
          } catch {
            end(res, 404);
            return;
          }
          const etag = `"${stamp}"`;
          // `no-cache` means "store, but revalidate", not "do not store": the
          // browser keeps the bytes and a reload costs one cheap 304. That is
          // what makes `README`'s "replace the file, reload" true.
          if (req.headers['if-none-match'] === etag) {
            res.writeHead(304, { etag, 'cache-control': 'no-cache' });
            res.end();
            return;
          }
          let body = assetCache.get(`${name}@${stamp}`);
          if (body === undefined) {
            try {
              body = await readFile(file);
            } catch {
              end(res, 404);
              return;
            }
            for (const key of assetCache.keys()) {
              if (key.startsWith(`${name}@`)) assetCache.delete(key);
            }
            assetCache.set(`${name}@${stamp}`, body);
          }
          res.writeHead(200, {
            'content-type': ASSET_TYPES[ext],
            'content-length': body.byteLength,
            'cache-control': 'no-cache',
            etag,
          });
          res.end(body);
          return;
        }

        if (req.method !== 'POST' || url.pathname !== '/model-effort/log') {
          end(res, 404);
          return;
        }
        // Any page the user visits can POST here without reading the reply
        // (`mode: 'no-cors'`). Same-origin only.
        const origin = req.headers.origin;
        if (origin !== undefined) {
          let host;
          try {
            host = new URL(origin).host;
          } catch {
            host = undefined;
          }
          if (host !== req.headers.host) {
            end(res, 403);
            return;
          }
        }
        if (!takeRateToken()) {
          end(res, 429);
          return;
        }
        const body = await readJson(req);
        if (body === undefined) {
          end(res, 400);
          return;
        }
        const line = JSON.stringify({ at: new Date().toISOString(), ...body });
        try {
          await appendLine(line);
        } catch {
          // The sink is diagnostic only: a failed append must not fail the page.
        }
        end(res, 204);
      },
    }), 'model-effort: 客户端崩溃日志');
  });
}
