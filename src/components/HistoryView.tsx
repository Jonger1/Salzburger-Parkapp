import { useApp } from '../AppContext';
import { formatHM } from '../lib/i18n';
import { useHistory } from '../lib/store';
import { Card, Icon, STATUS_COLOR } from './ui';

export function HistoryView() {
  const { t, lang } = useApp();
  const [history, setHistory] = useHistory();
  const fmt = (ms: number) =>
    new Date(ms).toLocaleString(lang === 'de' ? 'de-AT' : 'en-GB', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="view">
      <h2>{t('history.title')}</h2>
      {history.length === 0 && <Card><p className="muted">{t('history.empty')}</p></Card>}
      {history.map((s) => (
        <Card key={s.id} className="history-item">
          <div className="inline between">
            <div>
              <div className="strong">{s.address ?? s.zoneName ?? `${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}`}</div>
              <div className="muted small">{fmt(s.startedAt)}{s.endedAt ? ` · ${t('history.duration')} ${formatHM(s.endedAt - s.startedAt)}` : ''}</div>
              {s.note && <div className="small">{s.note}</div>}
            </div>
            <span className="pill" style={{ ['--status' as string]: STATUS_COLOR[s.status] }}>{t(`status.${s.status}`)}</span>
          </div>
          <a className="link small" href={`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`} target="_blank" rel="noreferrer">
            <Icon name="map" size={14} /> {lang === 'de' ? 'Auf Karte zeigen' : 'Show on map'}
          </a>
        </Card>
      ))}
      {history.length > 0 && (
        <button className="btn danger" onClick={() => confirm(t('history.confirmClear')) && setHistory([])}>{t('history.clear')}</button>
      )}
    </div>
  );
}
