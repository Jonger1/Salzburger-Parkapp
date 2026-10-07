import { formatTime, translate, type Lang } from './i18n';
import type { Session, Settings } from './store';

export interface Reminder {
  id: string;
  at: number;
  title: string;
  body: string;
  tag: string;
}

export const VAPID_PUBLIC_KEY: string = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '';

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
}

export async function requestPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  return Notification.requestPermission();
}

export async function showNotification(title: string, body: string, tag?: string): Promise<void> {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, {
      body,
      tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge.png',
      data: { url: '/' },
    });
  } catch {
    new Notification(title, { body, tag });
  }
}

/** Wann läuft die Parkberechtigung ab? (Ticket bzw. Höchstparkdauer, gedeckelt durch das Fensterende) */
export function sessionExpiry(s: Session): number | null {
  if (s.status !== 'pay' && s.status !== 'disc') return null;
  const candidates = [s.maxDeadline ?? undefined, s.status === 'pay' ? s.ticketUntil : undefined].filter(
    (x): x is number => typeof x === 'number',
  );
  if (!candidates.length) return null;
  const expiry = Math.min(...candidates);
  if (s.windowEnd && expiry >= s.windowEnd) return null;
  return expiry;
}

export function buildReminders(s: Session, settings: Settings, lang: Lang): Reminder[] {
  const t = (k: string, v?: Record<string, string | number>) => translate(lang, k, v);
  const out: Reminder[] = [];
  const now = Date.now();
  const expiry = sessionExpiry(s);
  if (expiry) {
    const what = s.status === 'pay' && s.ticketUntil && s.ticketUntil <= expiry ? t('notif.ticket') : t('notif.maxDuration');
    for (const lead of settings.leadMinutes) {
      out.push({
        id: `${s.id}-lead-${lead}`,
        at: expiry - lead * 60000,
        title: t('notif.leadTitle', { n: lead }),
        body: t('notif.leadBody', { what, time: formatTime(lang, new Date(expiry)) }),
        tag: `lead-${lead}`,
      });
    }
    if (settings.notifyAtExpiry) {
      out.push({ id: `${s.id}-expired`, at: expiry, title: t('notif.expiredTitle'), body: t('notif.expiredBody'), tag: 'expired' });
    }
  }
  // Auto bleibt über das Fensterende hinaus stehen → vor dem nächsten regulierten Zeitraum erinnern
  if (settings.notifyPayStart && s.nextAt && s.nextKind && s.nextKind !== 'no_parking' && (!expiry || s.status === 'free')) {
    out.push({
      id: `${s.id}-paystart`,
      at: s.nextAt - settings.payStartLead * 60000,
      title: t('notif.payStartTitle'),
      body: t('notif.payStartBody', {
        time: formatTime(lang, new Date(s.nextAt)),
        what: s.nextKind === 'pay' ? t('status.pay') : t('status.disc'),
      }),
      tag: 'paystart',
    });
  }
  return out.filter((r) => r.at > now - 60000);
}

// ---------- lokale Timer (solange die App läuft) ----------

const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleLocal(reminders: Reminder[], onFire: (r: Reminder) => void) {
  clearLocal();
  const now = Date.now();
  for (const r of reminders) {
    const delay = Math.max(0, r.at - now);
    if (delay > 2 ** 31 - 1) continue;
    timers.set(
      r.id,
      setTimeout(() => {
        timers.delete(r.id);
        onFire(r);
      }, delay),
    );
  }
}

export function clearLocal() {
  timers.forEach((t) => clearTimeout(t));
  timers.clear();
}

// ---------- Server-Push (Vercel + QStash) ----------

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function serverPushAvailable(): boolean {
  return Boolean(VAPID_PUBLIC_KEY) && notificationsSupported() && 'PushManager' in window;
}

async function getSubscription(): Promise<PushSubscription> {
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
}

export async function scheduleServer(reminders: Reminder[]): Promise<string[]> {
  if (!reminders.length) return [];
  const subscription = await getSubscription();
  const res = await fetch('/api/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription, reminders }),
  });
  if (!res.ok) throw new Error(`schedule failed: ${res.status}`);
  const data = (await res.json()) as { ids: string[] };
  return data.ids;
}

export async function cancelServer(ids: string[] | undefined): Promise<void> {
  if (!ids?.length) return;
  await fetch('/api/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  }).catch(() => undefined);
}

// ---------- Kalender-Export ----------

export function buildIcs(s: Session, reminders: Reminder[], lang: Lang): string {
  const fmt = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (x: string) => x.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const events = reminders.map(
    (r) => [
      'BEGIN:VEVENT',
      `UID:${r.id}@salzburg-parken`,
      `DTSTAMP:${fmt(Date.now())}`,
      `DTSTART:${fmt(r.at)}`,
      `DTEND:${fmt(r.at + 5 * 60000)}`,
      `SUMMARY:${esc(r.title)}`,
      `DESCRIPTION:${esc(r.body)}`,
      `GEO:${s.lat};${s.lng}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(r.title)}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    ].join('\r\n'),
  );
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//Salzburg Parken//${lang.toUpperCase()}`,
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}

export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
