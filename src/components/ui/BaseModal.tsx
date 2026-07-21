import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

export interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  isProcessing?: boolean;
  maxWidth?: string;
  showCloseButton?: boolean;
  ariaLabel?: string;
}

export function BaseModal({
  isOpen,
  onClose,
  title,
  children,
  isProcessing = false,
  maxWidth = '500px',
  showCloseButton = true,
  ariaLabel,
}: BaseModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isProcessing) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isProcessing, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel || title || 'Modal'}
      tabIndex={-1}
      className="custom-modal-backdrop"
      onClick={() => !isProcessing && onClose()}
    >
      <div
        className="custom-modal-card"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {(title || showCloseButton) && (
          <div className="custom-modal-header">
            {title && <h4 className="custom-modal-title">{title}</h4>}
            {showCloseButton && (
              <button
                type="button"
                className="custom-modal-close"
                onClick={() => !isProcessing && onClose()}
                disabled={isProcessing}
                aria-label="Cerrar modal"
              >
                <X size={20} />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
