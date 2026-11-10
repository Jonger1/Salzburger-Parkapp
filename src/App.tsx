import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ctx, type AppCtx, type Tab } from './AppContext';
import { DriveContext } from './drive';
import { EndParkingContext } from './parking';
import { evaluate, zoneAt, type Profile } from './lib/evaluate';
import type { LatLng } from './lib/geo';
import { formatTime, formatWhen, translate } from './lib/i18n';
import { ParkingDetector, reverseGeocode, useLocation, type Fix } from './lib/location';
import { cancelServer, clearLocal, scheduleLocal, scheduleServer, serverPushAvailable, showNotification } from './lib/notify';
import { buildReminders } from './lib/session';
import { useHistory, useSession, useSettings, type Session } from './lib/store';
import { NowView } from './components/NowView';
import { MapView } from './components/MapView';
import { HistoryView } from './components/HistoryView';
import { InfoView } from './components/InfoView';
import { SettingsView } from './components/SettingsView';
import { Icon } from './components/ui';

const TABS: Tab[] = ['now', 'map', 'history', 'info', 'settings'];

export default function App() {
  const [settings, updateSettings] = useSettings();
  const [session, setSession] = useSession();
  const [, setHistory] = useHistory();
  const [tab, setTab] = useState<Tab>('now');
  const [picked, setPicked] = useState<LatLng | null>(null);
  const [driveActive, setDriveActive] = useState(false);
  const [speed, setSpeed] = useState(0);
  const lang = settings.lang;
  const t = useCallback((k: string, v?: Record<string, string | number>) => translate(lang, k, v), [lang]);
  const { fix, error: locError, retry: retryLocation } = useLocation(!driveActive);
  const [driveFix, setDriveFix] = useState<Fix | null>(null);
  const currentFix = driveActive ? (driveFix ?? fix) : fix;

  // Theme & Sprache
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = settings.theme;
    root.lang = lang;
    document.title = t('app.title');
  }, [settings.theme, lang, t]);

  const profile = useMemo<Profile>(
    () => ({ disabilityPermit: settings.disabilityPermit, residentPermit: settings.residentPermit, residentZone: settings.residentZone }),
    [settings.disabilityPermit, settings.residentPermit, settings.residentZone],
  );

  const archive = useCallback(
    (s: Session) => {
      clearLocal();
      void cancelServer(s.serverIds);
      setHistory((h) => [{ ...s, endedAt: Date.now(), serverIds: undefined, fired: undefined }, ...h].slice(0, 200));
    },
    [setHistory],
  );

  const endParking = useCallback(() => {
    if (!session) return;
    archive(session);
    setSession(null);
  }, [session, archive, setSession]);

  const startParking = useCallback(
    (point: LatLng) => {
      const now = new Date();
      const ev = evaluate(point, now, profile);
      if (session) archive(session);
      const s: Session = {
        id: `${now.getTime()}`,
        lat: point[0],
        lng: point[1],
        startedAt: now.getTime(),
        zoneId: ev.zone?.id,
        zoneName: ev.zone?.name ?? ev.district,
        status: ev.status,
      };
      setSession(s);
      setPicked(null);
      void reverseGeocode(point, lang).then((address) => address && setSession((cur) => (cur?.id === s.id ? { ...cur, address } : cur)));

      if (settings.notifications && settings.notifyOnPark) {
        const parts = [ev.exempt ? t(ev.exempt === 'resident' ? 'now.exemptResident' : 'now.exemptDisability', { zone: profile.residentZone }) : t(`desc.${ev.status}`)];
        if (ev.status === 'pay' || ev.status === 'disc') {
          if (ev.deadline) parts.push(`${t('now.leaveBy')}: ${formatTime(lang, ev.deadline)}`);
          else if (ev.windowEnd) parts.push(`${t('now.until')}: ${formatTime(lang, ev.windowEnd)}`);
        }
        if (ev.next && !ev.exempt && !ev.deadline && ev.next.kind !== 'no_parking') {
          parts.push(t('now.nextAt', { status: t(`status.${ev.next.kind}`), when: formatWhen(lang, ev.next.at, now) }));
        }
        void showNotification(t('notif.parkedTitle', { status: t(`status.${ev.status}`) }), parts.join('\n'), 'parked');
      }
    },
    [profile, session, archive, setSession, lang, settings.notifications, settings.notifyOnPark, t],
  );

  // Die Erinnerungen hängen vom aktuellen Zeitpunkt ab (z. B. über Nacht geparkt) → regelmäßig neu berechnen
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    const id = setInterval(bump, 60000);
    const onVisible = () => document.visibilityState === 'visible' && bump();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Erinnerungen planen (lokal + optional Server)
  const serverKey = useRef('');
  useEffect(() => {
    const useServer = settings.notifications && settings.serverPush && serverPushAvailable();
    if (!session || !settings.notifications) {
      clearLocal();
      if (session?.serverIds?.length) {
        void cancelServer(session.serverIds);
        setSession((cur) => (cur ? { ...cur, serverIds: undefined } : cur));
      }
      serverKey.current = '';
      return;
    }
    const reminders = buildReminders(session, settings, lang, new Date(), profile);
    scheduleLocal(reminders, (r) => {
      void showNotification(r.title, r.body, r.tag);
      setSession((cur) => (cur ? { ...cur, fired: [...(cur.fired ?? []), r.id].slice(-50) } : cur));
    });

    const key = `${useServer}|${lang}|${reminders.map((r) => `${r.id}@${r.at}`).join(',')}`;
    if (key === serverKey.current) return;
    serverKey.current = key;
    const sessionId = session.id;
    const old = session.serverIds;
    void cancelServer(old)
      .then(() => (useServer ? scheduleServer(reminders) : []))
      .then((ids) => {
        if (ids.length || old?.length) setSession((cur) => (cur?.id === sessionId ? { ...cur, serverIds: ids.length ? ids : undefined } : cur));
      })
      .catch((e) => console.warn('Server-Push fehlgeschlagen', e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.ticketUntil, settings.notifications, settings.leadMinutes.join(','), settings.notifyAtExpiry, settings.notifyPayStart, settings.payStartLead, settings.serverPush, lang, profile, tick]);

  // Fahrmodus / automatische Erkennung
  const detector = useRef<ParkingDetector | null>(null);
  const lastZone = useRef<string | null | undefined>(undefined);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const startParkingRef = useRef(startParking);
  startParkingRef.current = startParking;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const acquireWakeLock = useCallback(async () => {
    if (!settingsRef.current.wakeLock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    wakeLock.current = await navigator.wakeLock.request('screen').catch(() => null);
  }, []);

  const stopDrive = useCallback(() => {
    detector.current?.stop();
    detector.current = null;
    void wakeLock.current?.release().catch(() => undefined);
    wakeLock.current = null;
    lastZone.current = undefined;
    setDriveActive(false);
    setDriveFix(null);
    setSpeed(0);
  }, []);

  const startDrive = useCallback(() => {
    if (detector.current) return;
    const d = new ParkingDetector({
      stopMinutes: settingsRef.current.stopMinutes,
      onFix: (f, kmh) => {
        setDriveFix(f);
        setSpeed(kmh);
        const s = settingsRef.current;
        const z = zoneAt(f.point);
        const id = z?.id ?? null;
        // Nur beim Hineinfahren in eine andere Zone melden, nicht bei GPS-Sprüngen im Stand
        if (lastZone.current !== undefined && id !== lastZone.current && z && kmh > 5 && f.accuracy <= 30 && s.zoneEntryAlerts && s.notifications) {
          const ev = evaluate(f.point, new Date(), profileRef.current);
          void showNotification(translate(s.lang, 'notif.zoneEntryTitle', { zone: z.name }), `${translate(s.lang, `status.${ev.status}`)} – ${translate(s.lang, `desc.${ev.status}`)}`, 'zone');
        }
        if (f.accuracy <= 30) lastZone.current = id;
      },
      onPark: (f) => {
        const s = settingsRef.current;
        if (s.autoStart) {
          startParkingRef.current(f.point);
          setTab('now');
          return;
        }
        const ev = evaluate(f.point, new Date(), profileRef.current);
        setPicked(f.point);
        setTab('now');
        if (s.notifications) {
          void showNotification(
            translate(s.lang, 'notif.detectedTitle', { status: translate(s.lang, `status.${ev.status}`) }),
            translate(s.lang, `desc.${ev.status}`),
            'detected',
          );
        }
      },
    });
    d.start();
    detector.current = d;
    setDriveActive(true);
    void acquireWakeLock();
  }, [acquireWakeLock]);

  useEffect(() => {
    detector.current?.update({ stopMinutes: settings.stopMinutes });
  }, [settings.stopMinutes]);
  useEffect(() => {
    if (!settings.autoDetect) stopDrive();
  }, [settings.autoDetect, stopDrive]);
  useEffect(() => stopDrive, [stopDrive]);
  // Der Wake Lock geht verloren, wenn die App in den Hintergrund wechselt → beim Zurückkommen erneuern
  useEffect(() => {
    const fn = () => detector.current && void acquireWakeLock();
    document.addEventListener('visibilitychange', fn);
    return () => document.removeEventListener('visibilitychange', fn);
  }, [acquireWakeLock]);

  const ctx: AppCtx = {
    lang,
    t,
    settings,
    updateSettings,
    profile,
    fix: currentFix,
    locError,
    retryLocation,
    picked,
    setPicked,
    goTo: setTab,
    startParking,
  };

  return (
    <Ctx.Provider value={ctx}>
      <DriveContext.Provider value={{ active: driveActive, speed, start: startDrive, stop: stopDrive }}>
        <EndParkingContext.Provider value={endParking}>
          <div className="app">
            <header className="topbar">
              <div className="brand">
                <span className="logo">P</span>
                <span>{t('app.title')}</span>
              </div>
              {session && tab !== 'now' && (
                <button className="pill-btn" onClick={() => setTab('now')}>
                  <Icon name="car" size={16} /> {t('session.active')}
                </button>
              )}
            </header>
            <main className={tab === 'map' ? 'main map-main' : 'main'}>
              {tab === 'now' && <NowView />}
              {tab === 'map' && <MapView />}
              {tab === 'history' && <HistoryView />}
              {tab === 'info' && <InfoView />}
              {tab === 'settings' && <SettingsView />}
            </main>
            <nav className="tabbar">
              {TABS.map((k) => (
                <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)} aria-current={tab === k ? 'page' : undefined}>
                  <Icon name={k} size={22} />
                  <span>{t(`tab.${k}`)}</span>
                </button>
              ))}
            </nav>
          </div>
        </EndParkingContext.Provider>
      </DriveContext.Provider>
    </Ctx.Provider>
  );
}
