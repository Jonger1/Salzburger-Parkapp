import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../AppContext';
import type { RuleSet, Weekday } from '../data/rules';
import { DATA_DATE } from '../data/zones';
import { nearestMachine } from '../data/places';
import { estimateCost, evaluate, type Evaluation } from '../lib/evaluate';
import type { LatLng } from '../lib/geo';
import { formatDate, formatMoney, formatTime, formatWhen } from '../lib/i18n';
import { notificationsSupported, requestPermission } from '../lib/notify';
import { useSession } from '../lib/store';
import { Card, Icon, Row, STATUS_COLOR } from './ui';
import { PaymentOptions } from './PaymentOptions';
import { SessionCard } from './SessionCard';
import { DriveCard } from './DriveCard';

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

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function NowView() {
  const { t, lang, fix, locError, retryLocation, picked, setPicked, settings, updateSettings, profile, startParking } = useApp();
  const [session] = useSession();
  const now = useNow();
  const [customTime, setCustomTime] = useState<string>('');
  const point = picked ?? fix?.point ?? null;
  const custom = customTime ? new Date(customTime) : null;
  const at = custom && !Number.isNaN(custom.getTime()) ? custom : now;
  const ev = useMemo(() => (point ? evaluate(point, at, profile) : null), [point?.[0], point?.[1], at.getTime(), profile]); // eslint-disable-line react-hooks/exhaustive-deps
  const needsAction = ev && (ev.status === 'pay' || ev.status === 'disc');

  return (
    <div className="view">
      {!notificationsSupported() && isIos() && !isStandalone() && <div className="banner">{t('now.installIos')}</div>}
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

      {ev && point && (
        <>
          <StatusCard ev={ev} point={point} customTime={Boolean(customTime)} />
          {!customTime && !session && ev.status !== 'outside' && ev.status !== 'no_parking' && (
            <button className="btn primary big" onClick={() => startParking(point)}>
              <Icon name="car" /> {t('now.parkHere')}
            </button>
          )}
          {needsAction && !session && <PaymentOptions kind={ev.status === 'disc' ? 'disc' : 'pay'} />}
          {ev.ruleSet && ev.zone?.kind !== 'pedestrian' && <ScheduleCard rs={ev.ruleSet} />}
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
                {t('now.resetTime')}
              </button>
            )}
          </div>
        </Card>
      )}
      {fix && !picked && fix.accuracy > 30 && <p className="small center warn-text">{t('now.lowAccuracy', { m: Math.round(fix.accuracy) })}</p>}
      {fix && !picked && fix.accuracy <= 30 && <p className="muted small center">{t('now.accuracy', { m: Math.round(fix.accuracy) })}</p>}
      <p className="muted small center">{t('now.dataDate', { date: formatDate(lang, DATA_DATE) })}</p>
    </div>
  );
}

function MachineHint({ point }: { point: LatLng }) {
  const { t } = useApp();
  const near = useMemo(() => nearestMachine(point), [point[0], point[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!near) return null;
  const href = `https://www.google.com/maps/dir/?api=1&destination=${near.machine.pos[0]},${near.machine.pos[1]}&travelmode=walking`;
  return (
    <Row
      label={t('now.machine')}
      value={
        <a href={href} target="_blank" rel="noreferrer">
          {near.machine.name} · {Math.max(10, Math.round(near.distance / 10) * 10)} m
        </a>
      }
    />
  );
}

export function StatusCard({ ev, point, customTime, compact }: { ev: Evaluation; point: LatLng; customTime?: boolean; compact?: boolean }) {
  const { t, lang, settings } = useApp();
  const color = STATUS_COLOR[ev.status];
  const halfStr = ev.perHalfHour !== undefined ? formatMoney(lang, ev.perHalfHour) : '';
  const hourStr = ev.perHalfHour !== undefined ? formatMoney(lang, ev.perHalfHour * 2) : '';
  // Kosten bis zur Höchstparkdauer, höchstens aber bis zum Ende der Gebührenpflicht
  const payMinutes =
    ev.status === 'pay' && ev.maxMinutes && ev.windowEnd ? Math.min(ev.maxMinutes, Math.ceil((ev.windowEnd.getTime() - ev.at.getTime()) / 60000)) : 0;
  const maxCost = ev.ruleSet && payMinutes > 0 ? estimateCost(ev.ruleSet, ev.at, payMinutes) : null;
  const place = [ev.zone?.kind === 'pedestrian' ? t('rule.pedestrian') : ev.zone?.name, ev.district ?? (ev.inCity ? 'Salzburg' : undefined)]
    .filter(Boolean)
    .join(' · ');
  const residentMismatch =
    settings.residentPermit && !ev.exempt && (ev.status === 'pay' || ev.status === 'disc') && ev.ruleSet?.residentExempt;

  return (
    <Card className="status-card">
      <div className="status-head" style={{ ['--status' as string]: color }}>
        <span className="status-icon"><Icon name={ev.status} size={28} /></span>
        <div>
          <div className="status-title">{t(`status.${ev.status}`)}</div>
          <div className="status-zone">{place}</div>
        </div>
      </div>
      {customTime && <p className="muted small">{formatWhen(lang, ev.at)}</p>}
      <p className="status-desc">
        {ev.exempt === 'disability'
          ? t('now.exemptDisability')
          : ev.exempt === 'resident'
            ? t('now.exemptResident', { zone: settings.residentZone })
            : t(`desc.${ev.status}`)}
      </p>

      {!compact && (
        <div className="rows">
          {ev.ruleSet && ev.zone?.kind !== 'pedestrian' && <Row label={t('now.zoneType')} value={t(ev.ruleSet.labelKey)} />}
          {ev.maxMinutes && ev.status !== 'free' && <Row label={t('now.maxDuration')} value={`${ev.maxMinutes / 60} h`} />}
          {ev.windowEnd && (ev.status === 'pay' || ev.status === 'disc') && <Row label={t('now.until')} value={formatWhen(lang, ev.windowEnd, ev.at)} />}
          {(ev.status === 'pay' || ev.status === 'disc') && (
            <Row label={t('now.leaveBy')} value={ev.deadline ? formatTime(lang, ev.deadline) : t('now.noDeadline')} />
          )}
          {ev.status === 'pay' && ev.perHalfHour !== undefined && <Row label={t('now.tariff')} value={t('now.tariffValue', { half: halfStr, hour: hourStr })} />}
          {maxCost !== null && <Row label={t('now.costMax', { min: payMinutes })} value={`${formatMoney(lang, maxCost)} €`} />}
          {ev.status === 'pay' && <MachineHint point={point} />}
          {ev.next && !ev.exempt && ev.next.kind !== 'no_parking' && (
            <Row label={t('now.next')} value={t('now.nextAt', { status: t(`status.${ev.next.kind}`), when: formatWhen(lang, ev.next.at, ev.at) })} />
          )}
          {ev.residentZone && <Row label={t('now.residentZone')} value={ev.residentZone} />}
        </div>
      )}

      {ev.altstadtAccess && (
        <div className="notice warn">
          <strong>{t('now.overlayAltstadt')}</strong>
          <span>{t('now.overlayAltstadtText')}</span>
        </div>
      )}
      {residentMismatch && (
        <div className="notice">
          {ev.zone?.noResident ? t('now.residentNotValid') : t('now.residentOtherZone', { zone: settings.residentZone || '–' })}
        </div>
      )}
      {(ev.status === 'unregulated' || ev.zone) && <p className="muted small">{t('now.signsFirst')}</p>}
    </Card>
  );
}

/** „09:00“ → „9“, „09:30“ → „9:30“ */
const shortTime = (hhmm: string) => hhmm.replace(/^0/, '').replace(/:00$/, '');

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
                    {shortTime(w.from)}–{shortTime(w.to)} · {t(`status.${w.kind}`)}
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
