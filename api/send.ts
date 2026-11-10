import { Receiver } from '@upstash/qstash';
import { configureWebPush, isSubscription, json, readJson, webpush } from './_lib.js';

// Wird von QStash zum geplanten Zeitpunkt aufgerufen und verschickt die Web-Push-Nachricht.
async function handle(request: Request): Promise<Response> {
  const { QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY } = process.env;
  if (!QSTASH_CURRENT_SIGNING_KEY || !QSTASH_NEXT_SIGNING_KEY || !configureWebPush()) {
    return json({ error: 'push not configured' }, 501);
  }

  // Die Signatur gilt für den unveränderten Body, daher erst prüfen, dann auswerten
  const body = await readJson(request);
  const signature = request.headers.get('upstash-signature');
  if (!body || !signature) return json({ error: 'invalid signature' }, 401);
  const receiver = new Receiver({ currentSigningKey: QSTASH_CURRENT_SIGNING_KEY, nextSigningKey: QSTASH_NEXT_SIGNING_KEY });
  const valid = await receiver.verify({ signature, body: body.raw }).catch(() => false);
  if (!valid) return json({ error: 'invalid signature' }, 401);

  const { subscription, notification } = body.data as { subscription?: unknown; notification?: unknown };
  if (!isSubscription(subscription)) return json({ error: 'invalid subscription' }, 400);

  try {
    await webpush.sendNotification(subscription, JSON.stringify(notification ?? {}), { TTL: 3600, urgency: 'high' });
    return json({ ok: true });
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    // 404/410: Abo ungültig → nicht erneut versuchen
    if (status === 404 || status === 410) return json({ ok: false, gone: true });
    return json({ error: 'send failed' }, 500);
  }
}

export default {
  fetch(request: Request): Response | Promise<Response> {
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    return handle(request);
  },
};
