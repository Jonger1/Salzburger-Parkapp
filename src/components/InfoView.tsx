import { useApp } from '../AppContext';
import { Card, Icon } from './ui';

const SOURCES = [
  { label: 'Stadt Salzburg – Kurzparkzone', url: 'https://www.stadt-salzburg.at/kurzparkzone' },
  { label: 'Stadt Salzburg – Parkzonenpläne', url: 'https://www.stadt-salzburg.at/parkzone/1' },
  { label: 'Salzburg Info – Park & Ride', url: 'https://www.salzburg.info/de/reiseinfos/anreise-verkehr/auto/park-ride' },
  { label: 'EasyPark', url: 'https://www.easypark.com/de-at' },
];

export function InfoView() {
  const { t } = useApp();
  const sections = ['paid', 'free', 'pedestrian', 'altstadt', 'resident', 'disability', 'pr', 'umland', 'limits'];
  return (
    <div className="view">
      <h2>{t('info.title')}</h2>
      <div className="notice warn">{t('info.disclaimer')}</div>
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
