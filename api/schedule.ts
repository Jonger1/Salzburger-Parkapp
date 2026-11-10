import { Client } from '@upstash/qstash';
import { isReminder, isSubscription, json, readJson } from './_lib.js';

const MAX_DELAY_MS = 7 * 24 * 3600 * 1000;

// Plant Push-Erinnerungen über Upstash QStash (verzögerte Zustellung an /api/send).
async function handle(request: Request): Promise<Response> {
  const token = process.env.QSTASH_TOKEN;
  if (!token) return json({ error: 'QSTASH_TOKEN not configured' }, 501);

  const body = await readJson(request);
  const { subscription, reminders } = (body?.data ?? {}) as { subscription?: unknown; reminders?: unknown };
  if (!isSubscription(subscription) || !Array.isArray(reminders) || reminders.length > 10 || !reminders.every(isReminder)) {
    return json({ error: 'invalid payload' }, 400);
  }

  // Ziel ist immer dieses Deployment selbst, nie eine Adresse aus der Anfrage
  const target = new URL('/api/send', request.url);
  target.protocol = 'https:';
  const client = new Client({ token });
  const now = Date.now();

  const ids: string[] = [];
  for (const r of reminders) {
    if (r.at - now > MAX_DELAY_MS || r.at < now - 60000) continue;
    const { messageId } = await client.publishJSON({
      url: target.toString(),
      body: { subscription, notification: { title: r.title, body: r.body, tag: r.tag } },
      notBefore: Math.max(Math.floor(now / 1000), Math.floor(r.at / 1000)),
      retries: 2,
    });
    ids.push(messageId);
  }
  return json({ ids });
}

export default {
  fetch(request: Request): Response | Promise<Response> {
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    return handle(request);
  },
};
