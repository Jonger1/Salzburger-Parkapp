import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ctx, type AppCtx, type Tab } from './AppContext';
import { DriveContext } from './drive';
import { EndParkingContext } from './parking';
import { evaluate, zonesAt } from './lib/evaluate';
import type { LatLng } from './lib/geo';
import { formatTime, translate } from './lib/i18n';
import { ParkingDetector, reverseGeocode, useLocation, type Fix } from './lib/location';
import {
  buildReminders, cancelServer, clearLocal, scheduleLocal, scheduleServer, serverPushAvailable, showNotification,
} from './lib/notify';
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
  const currentFix = driveActive ? driveFix : fix;

  // Theme & Sprache
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = settings.theme;
    root.lang = lang;
    document.title = t('app.title');
  }, [settings.theme, lang, t]);

  const profile = useMemo(
    () => ({ disabilityPermit: settings.disabilityPermit, residentPermit: settings.residentPermit, residentZone: settings.residentZone }),
    [settings.disabilityPermit, settings.residentPermit, settings.residentZone],
  );

  const endParking = useCallback(() => {
    if (!session) return;
    clearLocal();
    void cancelServer(session.serverIds);
    setHistory((h) => [{ ...session, endedAt: Date.now(), serverIds: undefined }, ...h].slice(0, 200));
    setSession(null);
  }, [session, setHistory, setSession]);

  const startParking = useCallback(
    (point: LatLng) => {
      const now = new Date();
      const ev = evaluate(point, now, profile);
      if (session) {
        clearLocal();
        void cancelServer(session.serverIds);
        setHistory((h) => [{ ...session, endedAt: Date.now(), serverIds: undefined }, ...h].slice(0, 200));
      }
      const s: Session = {
        id: `${now.getTime()}`,
        lat: point[0],
        lng: point[1],
        startedAt: now.getTime(),
        zoneId: ev.zone?.id,
        zoneName: ev.zone?.name,
        status: ev.status,
        maxDeadline: ev.deadline?.getTime() ?? null,
        windowEnd: ev.windowEnd?.getTime(),
        nextAt: ev.next?.at.getTime(),
        nextKind: ev.next?.kind,
      };
      setSession(s);
      setPicked(null);
      reverseGeocode(point, lang).then((address) => address && setSession((cur) => (cur?.id === s.id ? { ...cur, address } : cur)));

      if (settings.notifications && settings.notifyOnPark) {
        const parts = [t(`desc.${ev.status}`)];
        if (ev.deadline) parts.push(`${t('now.leaveBy')}: ${formatTime(lang, ev.deadline)}`);
        else if (ev.windowEnd && ev.status !== 'free') parts.push(`${t('now.until')}: ${formatTime(lang, ev.windowEnd)}`);
        if (ev.next && (ev.status === 'free' || !ev.deadline)) parts.push(t('now.nextAt', { status: t(`status.${ev.next.kind}`), when: formatTime(lang, ev.next.at) }));
        void showNotification(t('notif.parkedTitle', { status: t(`status.${ev.status}`) }), parts.join('\n'), 'parked');
      }
    },
    [profile, session, setHistory, setSession, lang, settings.notifications, settings.notifyOnPark, t],
  );

  // Erinnerungen planen (lokal + optional Server)
  const remindersKey = useRef('');
  useEffect(() => {
    if (!session || !settings.notifications) {
      clearLocal();
      return;
    }
    const reminders = buildReminders(session, settings, lang).filter((r) => !session.fired?.includes(r.id));
    scheduleLocal(reminders, (r) => {
      void showNotification(r.title, r.body, r.tag);
      setSession((cur) => (cur ? { ...cur, fired: [...(cur.fired ?? []), r.id] } : cur));
    });

    const key = JSON.stringify(reminders.map((r) => [r.id, r.at])) + String(settings.serverPush);
    if (key === remindersKey.current) return;
    remindersKey.current = key;
    if (settings.serverPush && serverPushAvailable()) {
      const old = session.serverIds;
      void cancelServer(old)
        .then(() => scheduleServer(reminders))
        .then((ids) => setSession((cur) => (cur?.id === session.id ? { ...cur, serverIds: ids } : cur)))
        .catch((e) => console.warn('Server-Push fehlgeschlagen', e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.ticketUntil, settings.notifications, settings.leadMinutes.join(','), settings.notifyAtExpiry, settings.notifyPayStart, settings.payStartLead, settings.serverPush, lang]);

  // Fahrmodus / automatische Erkennung
  const detector = useRef<ParkingDetector | null>(null);
  const lastZone = useRef<string | null | undefined>(undefined);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const startParkingRef = useRef(startParking);
  startParkingRef.current = startParking;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const stopDrive = useCallback(() => {
    detector.current?.stop();
    detector.current = null;
    void wakeLock.current?.release().catch(() => undefined);
    wakeLock.current = null;
    lastZone.current = undefined;
    setDriveActive(false);
    setSpeed(0);
  }, []);

  const startDrive = useCallback(async () => {
    if (detector.current) return;
    const d = new ParkingDetector({
      stopMinutes: settingsRef.current.stopMinutes,
      onFix: (f, kmh) => {
        setDriveFix(f);
        setSpeed(kmh);
        const z = zonesAt(f.point).find((x) => x.ruleSet);
        const id = z?.id ?? null;
        if (lastZone.current !== undefined && id !== lastZone.current && z && kmh > 5 && settingsRef.current.zoneEntryAlerts && settingsRef.current.notifications) {
          const ev = evaluate(f.point, new Date(), profile);
          void showNotification(translate(settingsRef.current.lang, 'notif.zoneEntryTitle', { zone: z.name }), translate(settingsRef.current.lang, `desc.${ev.status}`), 'zone');
        }
        lastZone.current = id;
      },
      onPark: (f) => {
        const s = settingsRef.current;
        if (s.autoStart) {
          startParkingRef.current(f.point);
        } else {
          const ev = evaluate(f.point, new Date(), profile);
          setPicked(f.point);
          setTab('now');
          if (s.notifications) {
            void showNotification(
              translate(s.lang, 'notif.detectedTitle', { status: translate(s.lang, `status.${ev.status}`) }),
              translate(s.lang, `desc.${ev.status}`),
              'detected',
            );
          }
        }
      },
    });
    d.start();
    detector.current = d;
    setDriveActive(true);
    if (settingsRef.current.wakeLock && 'wakeLock' in navigator) {
      wakeLock.current = await navigator.wakeLock.request('screen').catch(() => null);
    }
  }, [profile]);

  useEffect(() => {
    detector.current?.update({ stopMinutes: settings.stopMinutes });
  }, [settings.stopMinutes]);
  useEffect(() => {
    if (!settings.autoDetect) stopDrive();
  }, [settings.autoDetect, stopDrive]);
  // Wake Lock nach Tab-Wechsel erneuern
  useEffect(() => {
    const fn = async () => {
      if (document.visibilityState === 'visible' && detector.current && settingsRef.current.wakeLock && 'wakeLock' in navigator) {
        wakeLock.current = await navigator.wakeLock.request('screen').catch(() => null);
      }
    };
    document.addEventListener('visibilitychange', fn);
    return () => document.removeEventListener('visibilitychange', fn);
  }, []);

  const ctx: AppCtx = {
    lang,
    t,
    settings,
    updateSettings,
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
      <DriveContext.Provider value={{ active: driveActive, speed, start: () => void startDrive(), stop: stopDrive }}>
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
                <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)} aria-current={tab === k}>
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
