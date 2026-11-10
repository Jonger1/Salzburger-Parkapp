import { useEffect, useState } from 'react';
import { useApp } from '../AppContext';
import { formatDuration, formatTime, formatWhen } from '../lib/i18n';
import { buildIcs, downloadFile } from '../lib/notify';
import { buildReminders, sessionState } from '../lib/session';
import { useSession } from '../lib/store';
import { Card, Icon, Row, STATUS_COLOR } from './ui';
import { PaymentOptions } from './PaymentOptions';
import { useEndParking } from '../parking';

const DURATIONS = [30, 60, 90, 120, 180];

export function SessionCard() {
  const { t, lang, settings, profile } = useApp();
  const [session, setSession] = useSession();
  const endParking = useEndParking();
  const [now, setNow] = useState(Date.now());
  const [custom, setCustom] = useState('');
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!session) return null;

  const nowDate = new Date(now);
  const { ev, expiry, nextStart } = sessionState(session, nowDate, profile);
  const remaining = expiry !== null ? expiry - now : null;
  const reminders = buildReminders(session, settings, lang, nowDate, profile);
  const setTicket = (minutes: number) => minutes > 0 && setSession({ ...session, ticketUntil: Date.now() + minutes * 60000 });
  const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${session.lat},${session.lng}&travelmode=walking`;
  const amaps = `https://maps.apple.com/?daddr=${session.lat},${session.lng}&dirflg=w`;
  const ticketActive = ev.status === 'pay' && session.ticketUntil !== undefined && session.ticketUntil > now;

  return (
    <Card className="session">
      <div className="status-head" style={{ ['--status' as string]: STATUS_COLOR[ev.status] }}>
        <span className="status-icon"><Icon name="car" size={28} /></span>
        <div>
          <div className="status-title">{t('session.active')} · {t(`status.${ev.status}`)}</div>
          <div className="status-zone">
            {t('session.since', { time: formatWhen(lang, new Date(session.startedAt), nowDate) })}
            {session.address ? ` · ${session.address}` : ''}
          </div>
        </div>
      </div>

      {remaining !== null && (
        <div className={`countdown ${remaining < 0 ? 'expired' : remaining < 10 * 60000 ? 'soon' : ''}`}>
          <span className="muted small">{t('session.remaining')}</span>
          <span className="countdown-val">{remaining < 0 ? t('session.expired') : formatDuration(remaining)}</span>
          <span className="muted small">→ {formatTime(lang, new Date(expiry!))}</span>
        </div>
      )}
      {remaining === null && nextStart && (
        <div className="notice">
          {t('session.freeUntil', { when: formatWhen(lang, new Date(nextStart.at), nowDate), status: t(`status.${nextStart.kind}`) })}
        </div>
      )}
      {ev.status === 'pay' && !ticketActive && <div className="notice warn">{t('session.noTicket')}</div>}

      {ev.status === 'pay' && (
        <div className="ticket">
          <div className="muted small">{t('session.setTicket')}</div>
          <div className="chips">
            {DURATIONS.map((m) => (
              <button key={m} className="chip" onClick={() => setTicket(m)}>{t('session.minutes', { n: m })}</button>
            ))}
            <span className="chip-input">
              <input inputMode="numeric" placeholder={t('session.custom')} value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, '').slice(0, 3))} />
              <button className="chip" disabled={!Number(custom)} onClick={() => { setTicket(Number(custom)); setCustom(''); }}>OK</button>
            </span>
          </div>
          {ticketActive && <Row label={t('session.ticketUntil')} value={formatTime(lang, new Date(session.ticketUntil!))} />}
        </div>
      )}

      <label className="field">
        <span className="muted small">{t('session.note')}</span>
        <input value={session.note ?? ''} maxLength={120} onChange={(e) => setSession({ ...session, note: e.target.value })} />
      </label>

      <div className="rows">
        <div className="muted small">{t('session.reminders')}</div>
        {reminders.length === 0 && <p className="muted small">{t('session.noReminders')}</p>}
        {reminders.length > 0 && !settings.notifications && <p className="small warn-text">{t('session.notifOff')}</p>}
        {reminders.map((r) => (
          <Row key={r.id} label={<><Icon name="bell" size={14} /> {formatWhen(lang, new Date(r.at), nowDate)}</>} value={r.title} />
        ))}
      </div>

      <div className="btn-grid">
        <a className="btn" href={gmaps} target="_blank" rel="noreferrer"><Icon name="nav" /> Google Maps</a>
        <a className="btn" href={amaps} target="_blank" rel="noreferrer"><Icon name="nav" /> Apple Maps</a>
        {reminders.length > 0 && (
          <button className="btn" onClick={() => downloadFile('parken.ics', buildIcs(session, reminders, lang), 'text/calendar')}>
            <Icon name="calendar" /> {t('session.addCalendar')}
          </button>
        )}
        <button className="btn danger" onClick={endParking}>{t('session.end')}</button>
      </div>

      {(ev.status === 'pay' || ev.status === 'disc') && <PaymentOptions kind={ev.status} />}
    </Card>
  );
}
