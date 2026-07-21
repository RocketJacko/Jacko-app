import React from 'react';
import { m } from 'motion/react';
import { X } from 'lucide-react';

interface Props {
  email: string;
  setEmail: (val: string) => void;
  error: string;
  setError: (val: string) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function ValidationModal({ email, setEmail, error, setError, onClose, onSubmit }: Props) {
  return (
    <div className="custom-modal-backdrop" onClick={onClose}>
      <m.form 
        className="custom-modal-card"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', duration: 0.3 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
      >
        <div className="custom-modal-header">
          <h4 className="custom-modal-title">Verificación de Registro</h4>
          <button type="button" className="custom-modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <p className="custom-modal-body">
          ¿Te has registrado en la plataforma externa? Si es así, por favor ingresa el correo electrónico con el cual realizaste tu registro para verificar tu tarea.
        </p>
        <div className="custom-modal-field">
          <label htmlFor="validation-email-field">Correo de Registro</label>
          <input 
            id="validation-email-field"
            type="email"
            className={`custom-modal-input ${error ? 'error-state' : ''}`}
            placeholder="ejemplo@correo.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError('');
            }}
            autoFocus
          />
          {error && (
            <p className="custom-modal-error-text">{error}</p>
          )}
        </div>
        <div className="custom-modal-footer">
          <button type="button" className="btn-modal-action secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-modal-action primary">
            Confirmar y Enviar
          </button>
        </div>
      </m.form>
    </div>
  );
}
