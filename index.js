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
 * - `GET /model-effort/asset/<name>` — the tier illustrations. A Client bundle
 *   cannot import an image, so the file ships in `assets/` and is served here.
 */

import { appendFile, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const LOG_PATH = path.join(os.homedir(), '.dsh', 'model-effort.log');
const MAX_BODY = 64 * 1024;
const ASSET_DIR = fileURLToPath(new URL('./assets/', import.meta.url));
/** Only plain asset names ship here; no subdirectories, no traversal. */
const ASSET_NAME = /^[a-z0-9_-]+\.(webp|png|jpe?g|svg)$/;
const ASSET_TYPES = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
};
/** Asset bodies are immutable for a release; keep them in memory after the first read. */
const assetCache = new Map();

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
            'cache-control': 'public, max-age=3600',
          });
          res.end(body);
          return;
        }

        if (req.method !== 'POST' || url.pathname !== '/model-effort/log') {
          end(res, 404);
          return;
        }
        const body = await readJson(req);
        if (body === undefined) {
          end(res, 400);
          return;
        }
        const line = JSON.stringify({ at: new Date().toISOString(), ...body });
        try {
          await appendFile(LOG_PATH, `${line}\n`, 'utf8');
        } catch {
          // The sink is diagnostic only: a failed append must not fail the page.
        }
        end(res, 204);
      },
    }), 'model-effort: 客户端崩溃日志');
  });
}
