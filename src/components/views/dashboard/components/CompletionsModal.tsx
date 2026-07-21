import { m } from 'motion/react';
import { X, Calendar, Mail } from 'lucide-react';

interface CompletionItem {
  email: string;
  created_at: string;
}

interface Props {
  taskTitle: string;
  completions: CompletionItem[];
  onClose: () => void;
}

export function CompletionsModal({ taskTitle, completions, onClose }: Props) {
  return (
    <div className="custom-modal-backdrop" onClick={onClose}>
      <m.div 
        className="custom-modal-card"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', duration: 0.3 }}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '500px' }}
      >
        <div className="custom-modal-header">
          <h4 className="custom-modal-title">Registros Exitosos</h4>
          <button type="button" className="custom-modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="custom-modal-body" style={{ padding: '0 0 10px 0' }}>
          <p style={{ fontWeight: 600, color: 'var(--orange-deep)', margin: '0 0 4px 0', fontSize: '0.95rem' }}>
            {taskTitle}
          </p>
          <p style={{ fontSize: '0.8rem', opacity: 0.7, margin: 0 }}>
            A continuación se listan las direcciones de correo electrónico registradas con éxito para esta tarea:
          </p>
        </div>
        
        <div style={{ 
          maxHeight: '220px', 
          overflowY: 'auto', 
          margin: '10px 0 20px 0', 
          paddingRight: '6px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          {completions.length === 0 ? (
            <p style={{ textAlign: 'center', opacity: 0.5, fontSize: '0.85rem', margin: '20px 0' }}>
              No hay registros completados.
            </p>
          ) : (
            completions.map((item, idx) => (
              <div key={idx} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                background: '#faf6f0',
                border: '1.5px solid var(--beige-dark)',
                borderRadius: '12px',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                  <Mail size={14} style={{ color: 'var(--orange-base)', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {item.email}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, opacity: 0.7, fontSize: '0.72rem' }}>
                  <Calendar size={12} />
                  <span>
                    {new Date(item.created_at).toLocaleDateString('es-CO')} {new Date(item.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="custom-modal-footer" style={{ marginTop: 0 }}>
          <button type="button" className="btn-modal-action primary" onClick={onClose} style={{ width: '100%' }}>
            Cerrar
          </button>
        </div>
      </m.div>
    </div>
  );
}
