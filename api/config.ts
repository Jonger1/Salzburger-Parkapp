import type { VercelRequest, VercelResponse } from '@vercel/node';

// Zeigt, ob der Push-Server vollständig konfiguriert ist (ohne Geheimnisse preiszugeben).
export default function handler(_req: VercelRequest, res: VercelResponse) {
  const e = process.env;
  res.status(200).json({
    push: Boolean(e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY && e.QSTASH_TOKEN && e.QSTASH_CURRENT_SIGNING_KEY && e.QSTASH_NEXT_SIGNING_KEY),
  });
}
