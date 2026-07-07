import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  QrCode,
  Link as LinkIcon,
  CreditCard,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';
import './admin-components.css';
import '../../styles/data-table.css';

interface PaymentMethod {
  id: string;
  name: string;
  type: 'nequi' | 'bre_b' | 'paypal' | 'bancolombia' | 'binance' | 'other';
  account_value: string | null;
  instructions: string | null;
  qr_image_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export function PaymentMethodsManager() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Editor state
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | 'new' | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [type, setType] = useState<PaymentMethod['type']>('bre_b');
  const [accountValue, setAccountValue] = useState('');
  const [instructions, setInstructions] = useState('');
  const [qrImageUrl, setQrImageUrl] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState(0);

  // Loading sub-states
  const [actionLoading, setActionLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyValue = async (value: string, id: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (err) {
      console.error('Error copying payment account:', err);
    }
  };

  // Load methods
  const loadMethods = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;
      setMethods(data || []);
    } catch (err: unknown) {
      console.error('Error loading payment methods:', err);
      setErrorMsg(
        'No se pudieron cargar los métodos de pago: ' +
          (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      await Promise.resolve();
      loadMethods();
    };
    init();
  }, []);

  // Set form values on edit
  useEffect(() => {
    let active = true;
    const syncForm = async () => {
      await Promise.resolve();
      if (!active) return;
      if (editingMethod && editingMethod !== 'new') {
        setName(editingMethod.name);
        setType(editingMethod.type);
        setAccountValue(editingMethod.account_value || '');
        setInstructions(editingMethod.instructions || '');
        setQrImageUrl(editingMethod.qr_image_url || '');
        setIsActive(editingMethod.is_active);
        setSortOrder(editingMethod.sort_order);
      } else {
        setName('');
        setType('bre_b');
        setAccountValue('');
        setInstructions('');
        setQrImageUrl('');
        setIsActive(true);
        setSortOrder(
          methods.length > 0 ? Math.max(...methods.map((m) => m.sort_order)) + 10 : 10
        );
      }
    };
    syncForm();
    return () => {
      active = false;
    };
  }, [editingMethod, methods]);

  // Save Method
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('El nombre es obligatorio.');
      return;
    }
    setActionLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    const payload = {
      name: name.trim(),
      type,
      account_value: accountValue.trim() || null,
      instructions: instructions.trim() || null,
      qr_image_url: qrImageUrl.trim() || null,
      is_active: isActive,
      sort_order: sortOrder,
    };
    try {
      if (editingMethod === 'new') {
        const { data, error } = await supabase
          .from('payment_methods')
          .insert([payload])
          .select()
          .single();
        if (error) throw error;
        // Log audit action
        await supabase.rpc('admin_log_action', {
          _action: 'create_payment_method',
          _target_table: 'payment_methods',
          _target_id: data?.id || null,
          _payload: payload,
        });
        setSuccessMsg('Método de pago creado con éxito.');
      } else if (editingMethod) {
        const { error } = await supabase
          .from('payment_methods')
          .update(payload)
          .eq('id', editingMethod.id);
        if (error) throw error;
        // Log audit action
        await supabase.rpc('admin_log_action', {
          _action: 'update_payment_method',
          _target_table: 'payment_methods',
          _target_id: editingMethod.id,
          _payload: { id: editingMethod.id, ...payload },
        });
        setSuccessMsg('Método de pago actualizado con éxito.');
      }
      setEditingMethod(null);
      await loadMethods();
    } catch (err: unknown) {
      console.error('Error saving payment method:', err);
      setErrorMsg('Error al guardar: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setActionLoading(false);
    }
  };

  // Toggle active status directly
  const handleToggleActive = async (method: PaymentMethod) => {
    setErrorMsg('');
    setSuccessMsg('');
    const newStatus = !method.is_active;
    try {
      const { error } = await supabase
        .from('payment_methods')
        .update({ is_active: newStatus })
        .eq('id', method.id);
      if (error) throw error;
      // Log audit
      await supabase.rpc('admin_log_action', {
        _action: newStatus ? 'activate_payment_method' : 'deactivate_payment_method',
        _target_table: 'payment_methods',
        _target_id: method.id,
        _payload: { id: method.id, is_active: newStatus },
      });
      // Update state locally
      setMethods((prev) =>
        prev.map((m) => (m.id === method.id ? { ...m, is_active: newStatus } : m))
      );
      setSuccessMsg(`Método ${method.name} ${newStatus ? 'activado' : 'desactivado'}.`);
    } catch (err: unknown) {
      console.error('Error toggling status:', err);
      setErrorMsg(
        'Error al cambiar estado: ' + (err instanceof Error ? err.message : String(err))
      );
    }
  };

  // Delete Method
  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este método de pago?')) return;
    setActionLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const { error } = await supabase.from('payment_methods').delete().eq('id', id);
      if (error) throw error;
      // Log audit
      await supabase.rpc('admin_log_action', {
        _action: 'delete_payment_method',
        _target_table: 'payment_methods',
        _target_id: id,
        _payload: { id },
      });
      setSuccessMsg('Método de pago eliminado con éxito.');
      await loadMethods();
    } catch (err: unknown) {
      console.error('Error deleting payment method:', err);
      setErrorMsg('Error al eliminar: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setActionLoading(false);
    }
  };

  const getMethodIcon = (methodType: PaymentMethod['type']) => {
    switch (methodType) {
      case 'nequi':
        return <QrCode />;
      case 'paypal':
        return <LinkIcon />;
      case 'bre_b':
        return <CreditCard />;
      case 'bancolombia':
        return <CreditCard />;
      case 'binance':
        return <QrCode />;
      default:
        return <CreditCard />;
    }
  };

  const getMethodTypeLabel = (methodType: PaymentMethod['type']) => {
    switch (methodType) {
      case 'nequi':
        return 'Nequi (QR o Celular)';
      case 'bre_b':
        return 'Bre-B (Llave / Celular)';
      case 'paypal':
        return 'PayPal (Enlace)';
      case 'bancolombia':
        return 'Bancolombia (Cuenta)';
      case 'binance':
        return 'Binance Pay (ID / QR)';
      default:
        return 'Otro';
    }
  };

  return (
    <div className="admin-panel-container">
      <div className="admin-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Métodos de Pago</h2>
        {editingMethod === null && (
          <button
            type="button"
            className="btn-add-plan"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', margin: 0 }}
            onClick={() => setEditingMethod('new')}
          >
            <Plus size={16} /> Nuevo Método
          </button>
        )}
      </div>

      {/* Messages */}
      {errorMsg && <div className="admin-error-banner" style={{ marginBottom: '1.5rem' }}>{errorMsg}</div>}
      {successMsg && <div className="admin-success-banner" style={{ marginBottom: '1.5rem', background: '#dcfce7', color: '#15803d', padding: '12px', borderRadius: '12px', fontWeight: 700 }}>{successMsg}</div>}

      {/* Editor */}
      {editingMethod !== null && (
        <div className="admin-editor-card" style={{ background: '#ffffff', border: '1.5px solid var(--beige-dark)', padding: '24px', borderRadius: '20px', marginBottom: '24px' }}>
          <div className="admin-editor-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--beige-light)', paddingBottom: '12px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>
              {editingMethod === 'new' ? 'Crear Nuevo Método de Pago' : 'Editar Método de Pago'}
            </h3>
            <button
              type="button"
              onClick={() => setEditingMethod(null)}
              aria-label="Cerrar"
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSave}>
            <div className="admin-form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div className="form-group">
                <label htmlFor="pm-name" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>Nombre Comercial</label>
                <input
                  id="pm-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Nequi, PayPal, Daviplata"
                  required
                  style={{ width: '100%', padding: '12px', border: '1.5px solid var(--beige-dark)', borderRadius: '10px' }}
                />
              </div>
              <div className="form-group">
                <label htmlFor="pm-type" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>Tipo de Método (Constraint DB)</label>
                <select
                  id="pm-type"
                  value={type}
                  onChange={(e) => setType(e.target.value as PaymentMethod['type'])}
                  style={{ width: '100%', padding: '12px', border: '1.5px solid var(--beige-dark)', borderRadius: '10px' }}
                >
                  <option value="nequi">Nequi</option>
                  <option value="bre_b">Bre-B</option>
                  <option value="paypal">PayPal</option>
                  <option value="bancolombia">Bancolombia</option>
                  <option value="binance">Binance Pay</option>
                  <option value="other">Otro</option>
                </select>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label htmlFor="pm-account" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>
                {type === 'paypal' || type === 'other'
                  ? 'Enlace / URL de Pago o Cuenta'
                  : 'Llave / Número de Cuenta'}
              </label>
              <input
                id="pm-account"
                type="text"
                value={accountValue}
                onChange={(e) => setAccountValue(e.target.value)}
                placeholder={type === 'paypal' ? 'https://paypal.me/tu-usuario' : 'Ej. 3001234567 o alias'}
                style={{ width: '100%', padding: '12px', border: '1.5px solid var(--beige-dark)', borderRadius: '10px' }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label htmlFor="pm-logo" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>Logo Oficial / Imagen URL (Opcional)</label>
              <input
                id="pm-logo"
                type="text"
                value={qrImageUrl}
                onChange={(e) => setQrImageUrl(e.target.value)}
                placeholder="https://... URL de la imagen del logo"
                style={{ width: '100%', padding: '12px', border: '1.5px solid var(--beige-dark)', borderRadius: '10px' }}
              />
              {qrImageUrl && (
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <img
                    src={qrImageUrl}
                    alt="Vista previa del logo"
                    style={{ height: '40px', objectFit: 'contain', borderRadius: '6px', border: '1px solid var(--beige-dark)' }}
                  />
                  <button
                    type="button"
                    onClick={() => setQrImageUrl('')}
                    style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}
                  >
                    Quitar logo
                  </button>
                </div>
              )}
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label htmlFor="pm-instructions" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>Instrucciones para el Cliente</label>
              <textarea
                id="pm-instructions"
                rows={3}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Ej. Envía el monto exacto y escribe tu email de registro en la descripción."
                style={{ width: '100%', padding: '12px', border: '1.5px solid var(--beige-dark)', borderRadius: '10px', fontFamily: 'inherit' }}
              />
            </div>

            <div className="admin-form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px', alignItems: 'center' }}>
              <div className="form-group">
                <label htmlFor="pm-order" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>Orden de Visualización</label>
                <input
                  id="pm-order"
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
                  style={{ width: '100%', padding: '12px', border: '1.5px solid var(--beige-dark)', borderRadius: '10px' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="pm-card-switch-container"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}
                  onClick={() => setIsActive(!isActive)}
                >
                  <div className={`admin-switch ${isActive ? 'checked' : ''}`}>
                    <div className="admin-switch-handle"></div>
                  </div>
                  <span className="admin-switch-label" style={{ fontSize: '0.9rem', fontWeight: 700 }}>Método Activo</span>
                </button>
              </div>
            </div>

            <div className="admin-editor-actions" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', borderTop: '1px solid var(--beige-light)', paddingTop: '16px' }}>
              <button
                type="button"
                className="btn-admin-secondary"
                onClick={() => setEditingMethod(null)}
                disabled={actionLoading}
                style={{ padding: '10px 20px', borderRadius: '10px', border: '1.5px solid var(--beige-dark)', background: '#ffffff', cursor: 'pointer', fontWeight: 700 }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn-add-plan"
                disabled={actionLoading}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', margin: 0 }}
              >
                <Save size={16} />
                {actionLoading ? 'Guardando...' : 'Guardar Método'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Methods List */}
      {loading ? (
        <div className="admin-loading" style={{ textAlign: 'center', padding: '40px 0' }}>
          <div className="loading-spinner" style={{ margin: '0 auto 12px auto' }}></div>
          <p>Cargando métodos de pago...</p>
        </div>
      ) : methods.length === 0 ? (
        <div className="empty-panel-state" style={{ textAlign: 'center', padding: '40px 20px', border: '2px dashed var(--beige-dark)', borderRadius: '20px' }}>
          <CreditCard size={48} style={{ margin: '0 auto 12px auto', opacity: 0.3 }} />
          <h4>No hay métodos de pago</h4>
          <p>No hay métodos de pago configurados. Presiona "Nuevo Método" para agregar uno.</p>
        </div>
      ) : (
        <div className="dt-container">
          {/* Desktop Table */}
          <div className="dt-table-wrapper">
            <table className="dt-table">
              <thead>
                <tr>
                  <th style={{ width: '80px' }}>Icono</th>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>Datos / Enlace</th>
                  <th>Instrucciones</th>
                  <th style={{ width: '100px', textAlign: 'center' }}>Prioridad</th>
                  <th style={{ width: '100px', textAlign: 'center' }}>Estado</th>
                  <th style={{ width: '100px', textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {methods.map((method) => (
                  <tr key={method.id}>
                    <td>
                      <div className="dt-avatar" style={{ margin: 0 }}>
                        {method.qr_image_url ? (
                          <img src={method.qr_image_url} alt={method.name} />
                        ) : (
                          <div
                            className="dt-avatar-placeholder"
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}
                          >
                            {getMethodIcon(method.type)}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ fontWeight: 700 }}>{method.name}</td>
                    <td>{getMethodTypeLabel(method.type)}</td>
                    <td>
                      {method.account_value ? (
                        method.type === 'paypal' ? (
                          <a
                            href={method.account_value}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="dt-cell-link"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            Enlace de pago <ExternalLink size={13} />
                          </a>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <code>{method.account_value}</code>
                            <button
                              type="button"
                              onClick={() => handleCopyValue(method.account_value || '', method.id)}
                              style={{ padding: '4px', minWidth: 'auto', border: 'none', background: 'transparent', cursor: 'pointer' }}
                              title="Copiar"
                            >
                              {copiedId === method.id ? (
                                <Check size={14} style={{ color: '#10b981' }} />
                              ) : (
                                <Copy size={14} />
                              )}
                            </button>
                          </div>
                        )
                      ) : (
                        <span className="dt-badge dt-badge-neutral">—</span>
                      )}
                    </td>
                    <td
                      style={{ fontSize: '0.8rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={method.instructions || ''}
                    >
                      {method.instructions || <span className="dt-badge dt-badge-neutral">Sin instrucciones</span>}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{method.sort_order}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className="pm-card-switch-container"
                        style={{ display: 'inline-flex', cursor: 'pointer', margin: '0 auto', background: 'none', border: 'none' }}
                        onClick={() => handleToggleActive(method)}
                        aria-label={method.is_active ? 'Desactivar método' : 'Activar método'}
                      >
                        <div className={`admin-switch ${method.is_active ? 'checked' : ''}`}>
                          <div className="admin-switch-handle"></div>
                        </div>
                      </button>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="dt-actions-group" style={{ justifyContent: 'flex-end', display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          className="dt-row-btn edit"
                          onClick={() => setEditingMethod(method)}
                          title="Editar"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="dt-row-btn danger"
                          onClick={() => handleDelete(method.id)}
                          title="Eliminar"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="dt-mobile-cards">
            {methods.map((method) => (
              <div key={method.id} className="dt-mobile-card">
                <div className="dt-mobile-card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="dt-avatar" style={{ width: '28px', height: '28px', margin: 0 }}>
                      {method.qr_image_url ? (
                        <img src={method.qr_image_url} alt={method.name} />
                      ) : (
                        <div
                          className="dt-avatar-placeholder"
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', fontSize: '0.8rem' }}
                        >
                          {getMethodIcon(method.type)}
                        </div>
                      )}
                    </div>
                    <strong style={{ fontSize: '0.88rem' }}>{method.name}</strong>
                  </div>
                  <span className="dt-mobile-card-hint">
                    {getMethodTypeLabel(method.type)}
                  </span>
                </div>
                {method.account_value && (
                  <div className="dt-mobile-card-row">
                    <span className="dt-mobile-card-label">Datos</span>
                    <span className="dt-mobile-card-value" style={{ fontFamily: 'monospace' }}>
                      {method.account_value}
                    </span>
                  </div>
                )}
                <div className="dt-mobile-card-row">
                  <span className="dt-mobile-card-label">Prioridad</span>
                  <span className="dt-mobile-card-value">{method.sort_order}</span>
                </div>
                <div className="dt-mobile-card-footer">
                  <button
                    type="button"
                    className="pm-card-switch-container"
                    onClick={() => handleToggleActive(method)}
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none' }}
                    aria-label={method.is_active ? 'Desactivar método' : 'Activar método'}
                  >
                    <div className={`admin-switch ${method.is_active ? 'checked' : ''}`}>
                      <div className="admin-switch-handle"></div>
                    </div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                      {method.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </button>
                  <div className="dt-actions-group" style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      className="dt-row-btn edit"
                      onClick={() => setEditingMethod(method)}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      className="dt-row-btn danger"
                      onClick={() => handleDelete(method.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="dt-table-footer">
            <span className="dt-total-count">
              {methods.length} {methods.length === 1 ? 'método' : 'métodos'} en total
            </span>
          </div>
        </div>
      )}
    </div>
  );
}