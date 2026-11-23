import { useEffect } from 'react';

type WhatsNewModalProps = {
  version: string;
  onClose: () => void;
  releaseNotes?: string;
};

export function WhatsNewModal({ version, onClose, releaseNotes = '' }: WhatsNewModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop hr-whats-new-backdrop" role="presentation">
      <section className="modal-panel hr-whats-new" role="dialog" aria-modal="true" aria-labelledby="hr-whats-new-title">
        <div className="hr-whats-new-eyebrow">HEARTH · {version}</div>
        <h2 id="hr-whats-new-title">Что нового</h2>
        <p className="hr-whats-new-lead">Nexo становится Hearth.</p>
        <ul>
          <li>Обновлено название приложения и его внутренние компоненты.</li>
          <li>Пользовательские данные скопированы в новую папку Hearth. Исходная папка Nexo сохранена.</li>
          <li>После переноса может потребоваться войти в аккаунт ещё раз.</li>
        </ul>
        <p className="hr-whats-new-note">Не удаляйте старую папку Nexo, пока не убедитесь, что ваши данные и настройки на месте.</p>
        {releaseNotes.trim() && <div className="hr-whats-new-release-notes" aria-label="Примечания к выпуску">{releaseNotes}</div>}
        <div className="hr-whats-new-actions">
          <button type="button" className="primary" onClick={onClose}>Понятно</button>
        </div>
      </section>
    </div>
  );
}
