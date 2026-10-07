import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../AppContext';
import type { RuleSet, Weekday } from '../data/rules';
import { estimateCost, evaluate, type Evaluation } from '../lib/evaluate';
import { formatMoney, formatTime, formatWhen } from '../lib/i18n';
import { Card, Icon, Row, STATUS_COLOR } from './ui';
import { PaymentOptions } from './PaymentOptions';
import { SessionCard } from './SessionCard';
import { DriveCard } from './DriveCard';
import { useSession } from '../lib/store';
import { notificationsSupported, requestPermission } from '../lib/notify';

function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function NowView() {
  const { t, lang, fix, locError, retryLocation, picked, setPicked, settings, updateSettings, startParking } = useApp();
  const [session] = useSession();
  const now = useNow();
  const [customTime, setCustomTime] = useState<string>('');
  const point = picked ?? fix?.point ?? null;
  const at = customTime ? new Date(customTime) : now;
  const profile = { disabilityPermit: settings.disabilityPermit, residentPermit: settings.residentPermit, residentZone: settings.residentZone };
  const ev = useMemo(() => (point ? evaluate(point, at, profile) : null), [point?.[0], point?.[1], at.getTime(), settings.disabilityPermit]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="view">
      {!settings.notifications && notificationsSupported() && Notification.permission !== 'denied' && (
        <div className="banner">
          <span>{t('now.enableNotif')}</span>
          <button className="btn primary" onClick={async () => updateSettings({ notifications: (await requestPermission()) === 'granted' })}>
            {t('now.enableNotifBtn')}
          </button>
        </div>
      )}
      {session && <SessionCard />}
      {settings.autoDetect && <DriveCard />}

      {picked && (
        <div className="banner">
          <span>{t('now.pickedPoint')}</span>
          <button className="link" onClick={() => setPicked(null)}>{t('now.useGps')}</button>
        </div>
      )}

      {!point && (
        <Card>
          <p className="muted">{locError ? t('now.noLocation') : t('now.locating')}</p>
          {locError && (
            <button className="btn" onClick={retryLocation}>
              <Icon name="locate" /> {t('now.locate')}
            </button>
          )}
        </Card>
      )}

      {ev && (
        <>
          <StatusCard ev={ev} customTime={Boolean(customTime)} />
          {!customTime && !session && ev.status !== 'outside' && (
            <button className="btn primary big" onClick={() => startParking(point!)}>
              <Icon name="car" /> {t('now.parkHere')}
            </button>
          )}
          {(ev.rawStatus === 'pay' || ev.rawStatus === 'disc' || ev.next) && !session && (
            <PaymentOptions kind={ev.rawStatus === 'disc' || (ev.rawStatus !== 'pay' && ev.next?.kind === 'disc') ? 'disc' : 'pay'} />
          )}
          {ev.ruleSet && ev.ruleSet.windows.length > 0 && <ScheduleCard rs={ev.ruleSet} />}
        </>
      )}

      {point && (
        <Card>
          <h3>{t('now.checkTime')}</h3>
          <p className="muted small">{t('now.checkTimeHint')}</p>
          <div className="inline">
            <input type="datetime-local" value={customTime || toLocalInput(now)} onChange={(e) => setCustomTime(e.target.value)} />
            {customTime && (
              <button className="btn ghost" onClick={() => setCustomTime('')}>
                {lang === 'de' ? 'Jetzt' : 'Now'}
              </button>
            )}
          </div>
        </Card>
      )}
      {fix && !picked && <p className="muted small center">{t('now.accuracy', { m: Math.round(fix.accuracy) })}</p>}
    </div>
  );
}

export function StatusCard({ ev, customTime, compact }: { ev: Evaluation; customTime?: boolean; compact?: boolean }) {
  const { t, lang, settings } = useApp();
  const color = STATUS_COLOR[ev.status];
  const halfStr = ev.perHalfHour !== undefined ? formatMoney(lang, ev.perHalfHour) : '';
  const hourStr = ev.perHalfHour !== undefined ? formatMoney(lang, ev.perHalfHour * 2) : '';
  const maxCost = ev.ruleSet && ev.rawStatus === 'pay' && ev.maxMinutes ? estimateCost(ev.ruleSet, ev.at, ev.maxMinutes) : null;

  return (
    <Card className="status-card">
      <div className="status-head" style={{ ['--status' as string]: color }}>
        <span className="status-icon"><Icon name={ev.status} size={28} /></span>
        <div>
          <div className="status-title">{t(`status.${ev.status}`)}</div>
          <div className="status-zone">{ev.zone?.name ?? (ev.inCity ? 'Stadt Salzburg' : '')}</div>
        </div>
      </div>
      {customTime && <p className="muted small">{formatWhen(lang, ev.at)}</p>}
      <p className="status-desc">{ev.exempt === 'disability' ? t('now.exemptDisability') : t(`desc.${ev.status}`)}</p>

      {!compact && (
        <div className="rows">
          {ev.maxMinutes && ev.status !== 'free' && <Row label={t('now.maxDuration')} value={`${ev.maxMinutes / 60} h`} />}
          {ev.windowEnd && ev.status !== 'free' && <Row label={t('now.until')} value={formatWhen(lang, ev.windowEnd, ev.at)} />}
          {(ev.status === 'pay' || ev.status === 'disc') && (
            <Row label={t('now.leaveBy')} value={ev.deadline ? formatTime(lang, ev.deadline) : t('now.noDeadline')} />
          )}
          {ev.rawStatus === 'pay' && ev.perHalfHour !== undefined && <Row label={t('now.tariff')} value={t('now.tariffValue', { half: halfStr, hour: hourStr })} />}
          {maxCost !== null && ev.status === 'pay' && <Row label={t('now.costMax', { min: ev.maxMinutes! })} value={`${formatMoney(lang, maxCost)} €`} />}
          {ev.next && (
            <Row label={t('now.next')} value={t('now.nextAt', { status: t(`status.${ev.next.kind}`), when: formatWhen(lang, ev.next.at, ev.at) })} />
          )}
        </div>
      )}

      {ev.overlays.map((o) => (
        <div key={o.id} className="notice warn">
          <strong>{t('now.overlayAltstadt')}</strong>
          <span>{o.note}</span>
        </div>
      ))}
      {ev.zone?.note && ev.zone.kind !== 'altstadt_access' && (
        <div className="notice"><strong>{t('now.zoneNote')}:</strong> <span>{ev.zone.note}</span></div>
      )}
      {settings.residentPermit && ev.ruleSet?.residentExempt && (ev.rawStatus === 'pay' || ev.rawStatus === 'disc') && (
        <div className="notice ok">
          <span>{t('now.residentHint', { zone: settings.residentZone || '?' })}</span>
          {settings.residentZone && (
            <a href={`https://www.stadt-salzburg.at/parkzone/${encodeURIComponent(settings.residentZone)}`} target="_blank" rel="noreferrer">
              {t('now.residentPlan')} <Icon name="external" size={14} />
            </a>
          )}
        </div>
      )}
      {ev.zone && !ev.zone.verified && <p className="muted small">{t('now.unverifiedGeo')}</p>}
    </Card>
  );
}

export function ScheduleCard({ rs }: { rs: RuleSet }) {
  const { t } = useApp();
  const days: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
  return (
    <Card>
      <h3>{t('now.schedule')} · {t(rs.labelKey)}</h3>
      <div className="schedule">
        {days.map((d) => {
          const wins = rs.windows.filter((w) => w.days.includes(d));
          return (
            <div key={d} className="schedule-row">
              <span className="schedule-day">{t(`day.${d}`)}</span>
              <span className="schedule-val">
                {wins.length === 0 && <span className="pill" style={{ ['--status' as string]: STATUS_COLOR.free }}>{t('status.free')}</span>}
                {wins.map((w, i) => (
                  <span key={i} className="pill" style={{ ['--status' as string]: STATUS_COLOR[w.kind] }}>
                    {w.from === '00:00' && w.to === '24:00' ? '0–24' : `${w.from}–${w.to}`} · {t(`status.${w.kind}`)}
                    {w.maxMinutes ? ` · max ${w.maxMinutes / 60} h` : ''}
                  </span>
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

