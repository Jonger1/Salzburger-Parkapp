import { useApp } from '../AppContext';
import { Card, Icon } from './ui';

export const EASYPARK_URL = 'https://www.easypark.com/de-at';

export function PaymentOptions({ kind }: { kind: 'pay' | 'disc' }) {
  const { t, settings } = useApp();
  if (kind === 'disc') {
    return (
      <Card className="pay">
        <h3>{t('pay.disc')}</h3>
        <p className="muted small">{t('pay.discHint')}</p>
      </Card>
    );
  }
  const showPhone = settings.payment !== 'automat';
  const showMachine = settings.payment !== 'easypark';
  return (
    <Card className="pay">
      <h3>{t('session.pay')}</h3>
      {showPhone && (
        <a className="btn primary" href={EASYPARK_URL} target="_blank" rel="noreferrer">
          <Icon name="external" /> {t('pay.easypark')}
        </a>
      )}
      {showPhone && <p className="muted small">{t('pay.easyparkHint')}</p>}
      {showMachine && (
        <div className="notice">
          <strong>{t('pay.automat')}</strong>
          <span>{t('pay.automatHint')}</span>
        </div>
      )}
    </Card>
  );
}
