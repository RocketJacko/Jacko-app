import { m } from 'motion/react';
import { X } from 'lucide-react';

interface Props {
  title: string;
  message: string;
  onClose: () => void;
}

export function CustomAlertModal({ title, message, onClose }: Props) {
  return (
    <div className="custom-modal-backdrop" onClick={onClose}>
      <m.div 
        className="custom-modal-card"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', duration: 0.3 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="custom-modal-header">
          <h4 className="custom-modal-title">{title}</h4>
          <button type="button" className="custom-modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <p className="custom-modal-body">{message}</p>
        <div className="custom-modal-footer">
          <button type="button" className="btn-modal-action primary" onClick={onClose}>
            Aceptar
          </button>
        </div>
      </m.div>
    </div>
  );
}
