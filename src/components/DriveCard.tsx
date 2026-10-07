import { useApp } from '../AppContext';
import { useDrive } from '../drive';
import { Card, Icon } from './ui';

export function DriveCard() {
  const { t } = useApp();
  const { active, speed, start, stop } = useDrive();
  return (
    <Card className={`drive ${active ? 'on' : ''}`}>
      <div className="inline between">
        <div>
          <h3>{t('drive.title')}</h3>
          <p className="muted small">{active ? t('drive.on') : t('settings.autoDetectHint')}</p>
        </div>
        {active && <span className="speed">{t('drive.speed', { v: Math.round(speed) })}</span>}
      </div>
      {active ? (
        <button className="btn" onClick={stop}>{t('drive.stop')}</button>
      ) : (
        <button className="btn primary" onClick={start}><Icon name="car" /> {t('drive.off')}</button>
      )}
    </Card>
  );
}
