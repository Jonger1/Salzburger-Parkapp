import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Receiver } from '@upstash/qstash';
import { configureWebPush, isSubscription, webpush } from './_lib.js';

export const config = { api: { bodyParser: false } };

async function rawBody(req: VercelRequest): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString('utf8');
}

// Wird von QStash zum geplanten Zeitpunkt aufgerufen und verschickt die Web-Push-Nachricht.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const { QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY } = process.env;
  if (!QSTASH_CURRENT_SIGNING_KEY || !QSTASH_NEXT_SIGNING_KEY || !configureWebPush()) {
    return res.status(501).json({ error: 'push not configured' });
  }

  const body = await rawBody(req);
  const receiver = new Receiver({ currentSigningKey: QSTASH_CURRENT_SIGNING_KEY, nextSigningKey: QSTASH_NEXT_SIGNING_KEY });
  const signature = req.headers['upstash-signature'];
  const valid = typeof signature === 'string' && (await receiver.verify({ signature, body }).catch(() => false));
  if (!valid) return res.status(401).json({ error: 'invalid signature' });

  const { subscription, notification } = JSON.parse(body) as { subscription: unknown; notification: unknown };
  if (!isSubscription(subscription)) return res.status(400).json({ error: 'invalid subscription' });

  try {
    await webpush.sendNotification(subscription, JSON.stringify(notification), { TTL: 3600, urgency: 'high' });
    return res.status(200).json({ ok: true });
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    // 404/410: Abo ungültig → nicht erneut versuchen
    if (status === 404 || status === 410) return res.status(200).json({ ok: false, gone: true });
    return res.status(500).json({ error: 'send failed' });
  }
}
