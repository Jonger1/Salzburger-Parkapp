import { describe, expect, it } from 'vitest';
import { buildReminders, sessionState } from './session';
import { DEFAULT_SETTINGS, type Session } from './store';

const MIRABELL = { lat: 47.8058, lng: 13.0425 }; // gebührenpflichtig
const SCHALLMOOS = { lat: 47.812, lng: 13.058 }; // gebührenfrei, Zone B
const ms = (s: string) => new Date(s).getTime();
const session = (pos: { lat: number; lng: number }, start: string, extra: Partial<Session> = {}): Session => ({
  id: 's1', ...pos, startedAt: ms(start), status: 'pay', ...extra,
});
const settings = { ...DEFAULT_SETTINGS, lang: 'de' as const, leadMinutes: [15, 5], notifyAtExpiry: true, notifyPayStart: true, payStartLead: 15 };
const tags = (s: Session, now: string, profile = {}) => buildReminders(s, settings, 'de', new Date(now), profile).map((r) => `${r.tag}@${new Date(r.at).toTimeString().slice(0, 5)}`);

describe('sessionState', () => {
  it('uses the max duration when no ticket is entered', () => {
    const st = sessionState(session(MIRABELL, '2026-11-11T10:00:00'), new Date('2026-11-11T10:05:00'));
    expect(st.expiry).toBe(ms('2026-11-11T13:00:00'));
    expect(st.expiryKind).toBe('max');
  });

  it('uses the ticket when it ends earlier', () => {
    const s = session(MIRABELL, '2026-11-11T10:00:00', { ticketUntil: ms('2026-11-11T11:00:00') });
    const st = sessionState(s, new Date('2026-11-11T10:05:00'));
    expect(st.expiry).toBe(ms('2026-11-11T11:00:00'));
    expect(st.expiryKind).toBe('ticket');
  });

  it('caps a long ticket at the max duration', () => {
    const s = session(MIRABELL, '2026-11-11T10:00:00', { ticketUntil: ms('2026-11-11T15:00:00') });
    expect(sessionState(s, new Date('2026-11-11T10:05:00')).expiry).toBe(ms('2026-11-11T13:00:00'));
  });

  it('has no expiry when the window ends first, and points to the next morning', () => {
    const st = sessionState(session(MIRABELL, '2026-11-11T17:00:00'), new Date('2026-11-11T17:05:00'));
    expect(st.expiry).toBeNull();
    expect(st.nextStart).toEqual({ at: ms('2026-11-12T09:00:00'), kind: 'pay' });
  });

  it('counts the max duration from the start of the window when parked earlier', () => {
    const s = session(MIRABELL, '2026-11-11T07:30:00');
    expect(sessionState(s, new Date('2026-11-11T07:35:00')).nextStart).toEqual({ at: ms('2026-11-11T09:00:00'), kind: 'pay' });
    const later = sessionState(s, new Date('2026-11-11T09:10:00'));
    expect(later.ev.status).toBe('pay');
    expect(later.expiry).toBe(ms('2026-11-11T12:00:00'));
  });

  it('ignores a ticket from the day before', () => {
    const s = session(MIRABELL, '2026-11-10T17:00:00', { ticketUntil: ms('2026-11-10T19:00:00') });
    const st = sessionState(s, new Date('2026-11-11T09:30:00'));
    expect(st.expiryKind).toBe('max');
    expect(st.expiry).toBe(ms('2026-11-11T12:00:00'));
  });

  it('exempt users get neither expiry nor start reminders', () => {
    const st = sessionState(session(SCHALLMOOS, '2026-11-11T10:00:00'), new Date('2026-11-11T10:05:00'), { residentPermit: true, residentZone: 'B' });
    expect(st.expiry).toBeNull();
    expect(st.nextStart).toBeNull();
  });
});

describe('buildReminders', () => {
  it('schedules lead and expiry reminders for a ticket', () => {
    const s = session(MIRABELL, '2026-11-11T10:00:00', { ticketUntil: ms('2026-11-11T11:00:00') });
    expect(tags(s, '2026-11-11T10:01:00')).toEqual(['lead-15@10:45', 'lead-5@10:55', 'expired@11:00']);
  });

  it('drops reminders that are already in the past', () => {
    const s = session(MIRABELL, '2026-11-11T10:00:00', { ticketUntil: ms('2026-11-11T11:00:00') });
    expect(tags(s, '2026-11-11T10:50:00')).toEqual(['lead-5@10:55', 'expired@11:00']);
    expect(tags(s, '2026-11-11T11:30:00')).toEqual([]);
  });

  it('reminds again after the ticket was extended', () => {
    const s = session(MIRABELL, '2026-11-11T10:00:00', { ticketUntil: ms('2026-11-11T11:00:00') });
    const fired = buildReminders(s, settings, 'de', new Date('2026-11-11T10:01:00')).map((r) => r.id);
    const extended = { ...s, ticketUntil: ms('2026-11-11T12:00:00'), fired };
    expect(tags(extended, '2026-11-11T10:58:00')).toEqual(['lead-15@11:45', 'lead-5@11:55', 'expired@12:00']);
  });

  it('does not repeat reminders that already fired', () => {
    const s = session(MIRABELL, '2026-11-11T10:00:00', { ticketUntil: ms('2026-11-11T11:00:00') });
    const first = buildReminders(s, settings, 'de', new Date('2026-11-11T10:44:30'));
    expect(tags({ ...s, fired: [first[0].id] }, '2026-11-11T10:45:10')).toEqual(['lead-5@10:55', 'expired@11:00']);
  });

  it('reminds before fees start the next morning', () => {
    expect(tags(session(MIRABELL, '2026-11-11T20:00:00'), '2026-11-11T20:01:00')).toEqual(['paystart@08:45']);
  });

  it('reminds immediately when fees start within the lead time', () => {
    expect(tags(session(MIRABELL, '2026-11-11T08:50:00'), '2026-11-11T08:50:00')).toEqual(['paystart@08:50']);
  });

  it('skips the weekend in a Mon–Fri zone', () => {
    const r = buildReminders(session(SCHALLMOOS, '2026-11-13T19:30:00'), settings, 'de', new Date('2026-11-13T19:31:00'));
    expect(r.length).toBe(1);
    expect(new Date(r[0].at).toDateString()).toBe(new Date(2026, 10, 16).toDateString());
  });

  it('respects the settings', () => {
    const s = session(MIRABELL, '2026-11-11T10:00:00', { ticketUntil: ms('2026-11-11T11:00:00') });
    const off = { ...settings, leadMinutes: [], notifyAtExpiry: false, notifyPayStart: false };
    expect(buildReminders(s, off, 'de', new Date('2026-11-11T10:01:00'))).toEqual([]);
    expect(buildReminders(session(MIRABELL, '2026-11-11T20:00:00'), off, 'de', new Date('2026-11-11T20:01:00'))).toEqual([]);
  });
});
