import type { WindowKind } from '../data/rules';
import { evaluate, type Evaluation, type Profile } from './evaluate';
import { formatTime, translate, type Lang } from './i18n';
import type { Session, Settings } from './store';

export interface Reminder {
  id: string;
  at: number;
  title: string;
  body: string;
  tag: string;
}

export interface SessionState {
  /** Was am Parkplatz gerade gilt */
  ev: Evaluation;
  /** Zeitpunkt, zu dem das Auto weg sein muss bzw. das Ticket endet (kann in der Vergangenheit liegen) */
  expiry: number | null;
  expiryKind: 'ticket' | 'max' | null;
  /** Beginn der nächsten Regelung, bis zu der das Auto stehen bleiben darf */
  nextStart: { at: number; kind: WindowKind } | null;
}

/**
 * Aktueller Stand eines Parkvorgangs. Wird laufend neu berechnet, damit auch Autos richtig
 * behandelt werden, die vor Beginn der Kurzparkzeit abgestellt wurden oder über Nacht stehen.
 */
export function sessionState(s: Session, now: Date, profile?: Partial<Profile>): SessionState {
  const ev = evaluate([s.lat, s.lng], now, profile);
  const regulated = (ev.status === 'pay' || ev.status === 'disc') && ev.windowStart && ev.windowEnd;
  if (!regulated) {
    // Befreite (Bewohner, § 29b) brauchen keine Erinnerung an den nächsten Beginn
    const next = ev.exempt || !ev.next || ev.next.kind === 'no_parking' ? null : { at: ev.next.at.getTime(), kind: ev.next.kind };
    return { ev, expiry: null, expiryKind: null, nextStart: ev.status === 'no_parking' ? null : next };
  }

  const windowStart = ev.windowStart!.getTime();
  const windowEnd = ev.windowEnd!.getTime();
  // Die Höchstparkdauer zählt ab Ankunft, frühestens ab Beginn der Kurzparkzeit
  const arrival = Math.max(s.startedAt, windowStart);
  let expiry = ev.maxMinutes ? arrival + ev.maxMinutes * 60000 : Infinity;
  let expiryKind: SessionState['expiryKind'] = 'max';
  if (ev.status === 'pay' && s.ticketUntil && s.ticketUntil > windowStart && s.ticketUntil < expiry) {
    expiry = s.ticketUntil;
    expiryKind = 'ticket';
  }
  if (expiry >= windowEnd) {
    const next = ev.next && ev.next.kind !== 'no_parking' ? { at: ev.next.at.getTime(), kind: ev.next.kind } : null;
    return { ev, expiry: null, expiryKind: null, nextStart: next };
  }
  return { ev, expiry, expiryKind, nextStart: null };
}

/** Anstehende Erinnerungen für den Parkvorgang, vom Zeitpunkt `now` aus gesehen */
export function buildReminders(s: Session, settings: Settings, lang: Lang, now: Date, profile?: Partial<Profile>): Reminder[] {
  const t = (k: string, v?: Record<string, string | number>) => translate(lang, k, v);
  const { expiry, expiryKind, nextStart } = sessionState(s, now, profile);
  const nowMs = now.getTime();
  const out: Reminder[] = [];

  if (expiry !== null) {
    const what = t(expiryKind === 'ticket' ? 'notif.ticket' : 'notif.maxDuration');
    for (const lead of settings.leadMinutes) {
      out.push({
        id: `${s.id}-lead-${lead}-${expiry}`,
        at: expiry - lead * 60000,
        title: t('notif.leadTitle', { n: lead }),
        body: t('notif.leadBody', { what, time: formatTime(lang, new Date(expiry)) }),
        tag: `lead-${lead}`,
      });
    }
    if (settings.notifyAtExpiry) {
      out.push({ id: `${s.id}-expired-${expiry}`, at: expiry, title: t('notif.expiredTitle'), body: t('notif.expiredBody'), tag: 'expired' });
    }
  }

  if (nextStart && settings.notifyPayStart && nextStart.at > nowMs) {
    out.push({
      id: `${s.id}-paystart-${nextStart.at}`,
      // Ist die Vorlaufzeit schon angebrochen, sofort erinnern statt gar nicht
      at: Math.max(nextStart.at - settings.payStartLead * 60000, nowMs),
      title: t('notif.payStartTitle'),
      body: t('notif.payStartBody', {
        time: formatTime(lang, new Date(nextStart.at)),
        what: t(nextStart.kind === 'pay' ? 'notif.needTicket' : 'notif.needDisc'),
      }),
      tag: 'paystart',
    });
  }

  const fired = new Set(s.fired ?? []);
  return out.filter((r) => r.at > nowMs - 60000 && !fired.has(r.id)).sort((a, b) => a.at - b.at);
}
