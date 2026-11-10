import { Client } from '@upstash/qstash';
import { json, readJson } from './_lib.js';

// Storniert geplante Erinnerungen (z. B. wenn das Parken beendet wurde).
async function handle(request: Request): Promise<Response> {
  const token = process.env.QSTASH_TOKEN;
  if (!token) return json({ error: 'QSTASH_TOKEN not configured' }, 501);
  const body = await readJson(request);
  const { ids } = (body?.data ?? {}) as { ids?: unknown };
  if (!Array.isArray(ids) || ids.length > 20 || !ids.every((x) => typeof x === 'string' && /^[\w-]{1,100}$/.test(x))) {
    return json({ error: 'invalid payload' }, 400);
  }
  const client = new Client({ token });
  await Promise.all(ids.map((id: string) => client.messages.delete(id).catch(() => undefined)));
  return json({ ok: true });
}

export default {
  fetch(request: Request): Response | Promise<Response> {
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    return handle(request);
  },
};
