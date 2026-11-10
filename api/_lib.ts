import webpush from 'web-push';

export function configureWebPush(): boolean {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  return true;
}

export interface ReminderPayload {
  id: string;
  at: number;
  title: string;
  body: string;
  tag: string;
}

// Nur an die Push-Dienste der Browser-Hersteller senden – sonst ließe sich der Server
// dazu bringen, beliebige fremde Adressen aufzurufen.
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
];

export function isSubscription(x: unknown): x is webpush.PushSubscription {
  const s = x as webpush.PushSubscription | null;
  if (!s || typeof s.endpoint !== 'string' || typeof s.keys?.p256dh !== 'string' || typeof s.keys?.auth !== 'string') return false;
  if (s.endpoint.length > 2000 || s.keys.p256dh.length > 200 || s.keys.auth.length > 100) return false;
  try {
    const url = new URL(s.endpoint);
    return url.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}

export function isReminder(x: unknown): x is ReminderPayload {
  const r = x as ReminderPayload | null;
  return Boolean(
    r && typeof r.id === 'string' && r.id.length <= 100 && Number.isFinite(r.at) && typeof r.title === 'string' &&
      typeof r.body === 'string' && typeof r.tag === 'string' && r.title.length <= 200 && r.body.length <= 1000 && r.tag.length <= 50,
  );
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

/** JSON-Body lesen, höchstens `maxBytes` groß; `null` bei ungültigem Inhalt */
export async function readJson(request: Request, maxBytes = 20000): Promise<{ raw: string; data: unknown } | null> {
  const raw = await request.text();
  if (raw.length > maxBytes) return null;
  try {
    return { raw, data: JSON.parse(raw) };
  } catch {
    return null;
  }
}

export { webpush };
