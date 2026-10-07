import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Client } from '@upstash/qstash';

// Storniert geplante Erinnerungen (z. B. wenn das Parken beendet wurde).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const token = process.env.QSTASH_TOKEN;
  if (!token) return res.status(501).json({ error: 'QSTASH_TOKEN not configured' });
  const { ids } = (req.body ?? {}) as { ids?: unknown };
  if (!Array.isArray(ids) || ids.length > 20 || !ids.every((x) => typeof x === 'string' && /^[\w-]{1,100}$/.test(x))) {
    return res.status(400).json({ error: 'invalid payload' });
  }
  const client = new Client({ token });
  await Promise.all(ids.map((id) => client.messages.delete(id).catch(() => undefined)));
  return res.status(200).json({ ok: true });
}
