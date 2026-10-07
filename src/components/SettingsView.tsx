import { useState } from 'react';
import { useApp } from '../AppContext';
import { notificationsSupported, requestPermission, serverPushAvailable, showNotification } from '../lib/notify';
import { DEFAULT_SETTINGS, useSettings } from '../lib/store';
import { Card, Segmented, Toggle } from './ui';

const LEAD_OPTIONS = [30, 15, 10, 5];

export function SettingsView() {
  const { t, settings, updateSettings } = useApp();
  const [, , reset] = useSettings();
  const [perm, setPerm] = useState(notificationsSupported() ? Notification.permission : 'unsupported');

  const enableNotifications = async (on: boolean) => {
    if (!on) return updateSettings({ notifications: false, serverPush: false });
    const p = await requestPermission();
    setPerm(p);
    updateSettings({ notifications: p === 'granted' });
  };

  const toggleLead = (m: number) => {
    const set = new Set(settings.leadMinutes);
    if (set.has(m)) set.delete(m);
    else set.add(m);
    updateSettings({ leadMinutes: [...set].sort((a, b) => b - a) });
  };

  return (
    <div className="view">
      <h2>{t('tab.settings')}</h2>

      <Card>
        <h3>{t('settings.general')}</h3>
        <div className="field">
          <span className="muted small">{t('settings.language')}</span>
          <Segmented value={settings.lang} onChange={(lang) => updateSettings({ lang })} options={[{ value: 'de', label: 'Deutsch' }, { value: 'en', label: 'English' }]} />
        </div>
        <div className="field">
          <span className="muted small">{t('settings.theme')}</span>
          <Segmented
            value={settings.theme}
            onChange={(theme) => updateSettings({ theme })}
            options={(['system', 'light', 'dark'] as const).map((v) => ({ value: v, label: t(`settings.theme.${v}`) }))}
          />
        </div>
      </Card>

      <Card>
        <h3>{t('settings.notifications')}</h3>
        {perm === 'unsupported' && <div className="notice warn">{t('settings.notifUnsupported')}</div>}
        {perm === 'denied' && <div className="notice warn">{t('settings.notifDenied')}</div>}
        <Toggle label={t('settings.notifEnable')} checked={settings.notifications} disabled={perm === 'unsupported'} onChange={enableNotifications} />
        {settings.notifications && (
          <>
            <button className="btn ghost" onClick={() => showNotification(t('notif.test'), t('notif.testBody'), 'test')}>{t('settings.notifTest')}</button>
            <Toggle label={t('settings.onPark')} checked={settings.notifyOnPark} onChange={(v) => updateSettings({ notifyOnPark: v })} />
            <div className="field">
              <span className="muted small">{t('settings.leads')}</span>
              <div className="chips">
                {LEAD_OPTIONS.map((m) => (
                  <button key={m} className={`chip ${settings.leadMinutes.includes(m) ? 'active' : ''}`} onClick={() => toggleLead(m)}>{m}</button>
                ))}
              </div>
            </div>
            <Toggle label={t('settings.atExpiry')} checked={settings.notifyAtExpiry} onChange={(v) => updateSettings({ notifyAtExpiry: v })} />
            <Toggle label={t('settings.payStart')} checked={settings.notifyPayStart} onChange={(v) => updateSettings({ notifyPayStart: v })} />
            {settings.notifyPayStart && (
              <label className="field">
                <span className="muted small">{t('settings.payStartLead')}</span>
                <input type="number" min={0} max={120} value={settings.payStartLead} onChange={(e) => updateSettings({ payStartLead: Math.max(0, Number(e.target.value) || 0) })} />
              </label>
            )}
            <Toggle
              label={t('settings.serverPush')}
              hint={serverPushAvailable() ? t('settings.serverPushHint') : t('settings.serverPushUnavailable')}
              checked={settings.serverPush}
              disabled={!serverPushAvailable()}
              onChange={(v) => updateSettings({ serverPush: v })}
            />
          </>
        )}
      </Card>

      <Card>
        <h3>{t('settings.detection')}</h3>
        <Toggle label={t('settings.autoDetect')} hint={t('settings.autoDetectHint')} checked={settings.autoDetect} onChange={(v) => updateSettings({ autoDetect: v })} />
        {settings.autoDetect && (
          <>
            <label className="field">
              <span className="muted small">{t('settings.stopMinutes')}</span>
              <input type="number" min={1} max={30} value={settings.stopMinutes} onChange={(e) => updateSettings({ stopMinutes: Math.min(30, Math.max(1, Number(e.target.value) || 1)) })} />
            </label>
            <Toggle label={t('settings.autoStart')} checked={settings.autoStart} onChange={(v) => updateSettings({ autoStart: v })} />
            <Toggle label={t('settings.zoneEntry')} checked={settings.zoneEntryAlerts} onChange={(v) => updateSettings({ zoneEntryAlerts: v })} />
            <Toggle label={t('settings.wakeLock')} checked={settings.wakeLock} onChange={(v) => updateSettings({ wakeLock: v })} />
          </>
        )}
      </Card>

      <Card>
        <h3>{t('settings.permits')}</h3>
        <Toggle label={t('settings.resident')} checked={settings.residentPermit} onChange={(v) => updateSettings({ residentPermit: v })} />
        {settings.residentPermit && (
          <label className="field">
            <span className="muted small">{t('settings.residentZone')}</span>
            <input value={settings.residentZone} maxLength={4} onChange={(e) => updateSettings({ residentZone: e.target.value.toUpperCase().trim() })} />
          </label>
        )}
        <Toggle label={t('settings.disability')} checked={settings.disabilityPermit} onChange={(v) => updateSettings({ disabilityPermit: v })} />
      </Card>

      <Card>
        <h3>{t('settings.payment')}</h3>
        <div className="field">
          <span className="muted small">{t('settings.paymentPref')}</span>
          <Segmented
            value={settings.payment}
            onChange={(payment) => updateSettings({ payment })}
            options={(['ask', 'easypark', 'automat'] as const).map((v) => ({ value: v, label: t(`settings.payment.${v}`) }))}
          />
        </div>
      </Card>

      <Card>
        <h3>{t('settings.install')}</h3>
        <p className="muted small">{t('settings.installHint')}</p>
      </Card>

      <Card>
        <h3>{t('settings.data')}</h3>
        <button className="btn danger" onClick={() => { reset(); updateSettings({ lang: DEFAULT_SETTINGS.lang }); }}>{t('settings.reset')}</button>
      </Card>
      <p className="muted small center">v1.0 · © OpenStreetMap-Mitwirkende</p>
    </div>
  );
}
