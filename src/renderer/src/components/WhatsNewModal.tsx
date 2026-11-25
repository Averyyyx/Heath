import { Button, Modal } from './ui';
import { WHATS_NEW } from '../content/whats-new';

type WhatsNewModalProps = {
  version: string;
  onClose: () => void;
};

export function WhatsNewModal({ version, onClose }: WhatsNewModalProps) {
  const release = WHATS_NEW.find((entry) => entry.version === version);
  if (!release) return null;

  return (
    <Modal title="Что нового" onClose={onClose} width="wide" footer={<Button variant="primary" onClick={onClose}>Понятно</Button>}>
      <div className="hr-whats-new">
        <div className="hr-whats-new-eyebrow">HEARTH · {version}</div>
        <p className="hr-whats-new-lead">{release.title}</p>
        <ul>
          {release.items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </div>
    </Modal>
  );
}
