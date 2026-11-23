import { useEffect } from 'react';
import { WHATS_NEW } from '../content/whats-new';

type WhatsNewModalProps = {
  version: string;
  onClose: () => void;
};

export function WhatsNewModal({ version, onClose }: WhatsNewModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const release = WHATS_NEW.find((entry) => entry.version === version);
  if (!release) return null;

  return (
    <div className="modal-backdrop hr-whats-new-backdrop" role="presentation">
      <section className="modal-panel hr-whats-new" role="dialog" aria-modal="true" aria-labelledby="hr-whats-new-title">
        <div className="hr-whats-new-eyebrow">HEARTH · {version}</div>
        <h2 id="hr-whats-new-title">Что нового</h2>
        <p className="hr-whats-new-lead">{release.title}</p>
        <ul>
          {release.items.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <div className="hr-whats-new-actions">
          <button type="button" className="primary" onClick={onClose}>Понятно</button>
        </div>
      </section>
    </div>
  );
}
