import { useApp } from '../AppContext';
import { DATA_DATE } from '../data/zones';
import { formatDate } from '../lib/i18n';
import { Card, Icon } from './ui';

const SOURCES = [
  { label: 'Stadt Salzburg – Kurzparkzone', url: 'https://www.stadt-salzburg.at/kurzparkzone' },
  { label: 'Stadt Salzburg – Parkpickerl (Bewohner:innen)', url: 'https://www.stadt-salzburg.at/parkpickerl' },
  { label: 'Stadtplan der Stadt Salzburg', url: 'https://maps.stadt-salzburg.at' },
  { label: 'Open Data Stadt Salzburg', url: 'https://data.stadt-salzburg.at/' },
  { label: 'Salzburg Info – Park & Ride', url: 'https://www.salzburg.info/de/reiseinfos/anreise-verkehr/auto/park-ride' },
  { label: 'EasyPark', url: 'https://www.easypark.com/de-at' },
];

export function InfoView() {
  const { t, lang } = useApp();
  const sections = ['paid', 'free', 'pedestrian', 'altstadt', 'resident', 'disability', 'pr', 'umland', 'limits'];
  return (
    <div className="view">
      <h2>{t('info.title')}</h2>
      <div className="notice warn">{t('info.disclaimer')}</div>
      <p className="muted small">{t('now.dataDate', { date: formatDate(lang, DATA_DATE) })}</p>
      {sections.map((s) => (
        <Card key={s}>
          <h3>{t(`info.${s}`)}</h3>
          <p>{t(`info.${s}Text`)}</p>
        </Card>
      ))}
      <Card>
        <h3>{t('info.sources')}</h3>
        <ul className="links">
          {SOURCES.map((s) => (
            <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.label} <Icon name="external" size={14} /></a></li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
