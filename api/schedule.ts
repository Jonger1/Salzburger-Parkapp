import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Client } from '@upstash/qstash';
import { isReminder, isSubscription } from './_lib.js';

const MAX_DELAY_MS = 7 * 24 * 3600 * 1000;

// Plant Push-Erinnerungen über Upstash QStash (verzögerte Zustellung an /api/send).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const token = process.env.QSTASH_TOKEN;
  if (!token) return res.status(501).json({ error: 'QSTASH_TOKEN not configured' });

  const { subscription, reminders } = (req.body ?? {}) as { subscription?: unknown; reminders?: unknown };
  if (!isSubscription(subscription) || !Array.isArray(reminders) || reminders.length > 10 || !reminders.every(isReminder)) {
    return res.status(400).json({ error: 'invalid payload' });
  }

  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const target = `${proto}://${host}/api/send`;
  const client = new Client({ token });
  const now = Date.now();

  const ids: string[] = [];
  for (const r of reminders) {
    if (r.at - now > MAX_DELAY_MS) continue;
    const { messageId } = await client.publishJSON({
      url: target,
      body: { subscription, notification: { title: r.title, body: r.body, tag: r.tag } },
      notBefore: Math.max(Math.floor(now / 1000), Math.floor(r.at / 1000)),
      retries: 2,
    });
    ids.push(messageId);
  }
  return res.status(200).json({ ids });
}
