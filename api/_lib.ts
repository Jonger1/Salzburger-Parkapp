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

export function isSubscription(x: unknown): x is webpush.PushSubscription {
  const s = x as webpush.PushSubscription;
  return Boolean(s && typeof s.endpoint === 'string' && s.endpoint.startsWith('https://') && s.keys?.p256dh && s.keys?.auth);
}

export function isReminder(x: unknown): x is ReminderPayload {
  const r = x as ReminderPayload;
  return Boolean(
    r && typeof r.id === 'string' && typeof r.at === 'number' && typeof r.title === 'string' &&
      typeof r.body === 'string' && r.title.length <= 200 && r.body.length <= 1000,
  );
}

export { webpush };
