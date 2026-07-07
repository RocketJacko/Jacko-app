import { useState, useRef, Fragment } from 'react';
import {
  ShoppingBag,
  Search,
  ChevronDown,
  SlidersHorizontal,
  Download,
  Check,
  X,
  Upload,
  Loader2,
} from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import { invalidateCache } from '../../../lib/queryCache';
import type { Order, ActivationDetail } from './types';
import { ActivationModal } from './ActivationModal';
import { userService } from '../../../services/userService';
import '../../../styles/data-table.css';

interface DashboardHistoryProps {
  orders: Order[];
  onNavigateToCatalog: () => void;
  userId: string;
  userName: string;
  onRefresh: (force?: boolean) => Promise<void>;
  formatCOP: (val: number | null) => string;
}

interface HistoryItem {
  id: string;
  created_at: string;
  type: 'Compra Directa' | 'Canje Puntos';
  description: string;
  reference_note: string | null;
  status: string;
  amount_cop: number | null;
  points_used: number | null;
  points_awarded: null;
  isOrder: boolean;
  order: Order;
}

function getUIStatus(item: HistoryItem): 'Completado' | 'Pendiente' | 'Rechazado' {
  const s = item.status.toLowerCase();
  if (s === 'procesado') return 'Completado';
  if (s === 'approved') {
    if (!item.isOrder) return 'Completado';
    const o = item.order;
    const activations = o && Array.isArray(o.activation_details) ? o.activation_details : [];
    const quantity = o?.quantity || 1;
    if (activations.length < quantity) return 'Pendiente';
    return 'Completado';
  }
  if (s === 'procesando' || s === 'pending' || s === 'pending_nequi') {
    return 'Pendiente';
  }
  return 'Rechazado';
}

function StatusBadge({ item }: { item: HistoryItem }) {
  const s = item.status.toLowerCase();
  if (s === 'procesado') {
    return <span className="dt-badge dt-badge-success">Completado</span>;
  }
  if (s === 'approved') {
    if (!item.isOrder) {
      return <span className="dt-badge dt-badge-success">Completado</span>;
    }
    const o = item.order;
    const activations = o && Array.isArray(o.activation_details) ? o.activation_details : [];
    const quantity = o?.quantity || 1;
    if (activations.length === 0) {
      return <span className="dt-badge dt-badge-info">Pago Aprobado</span>;
    }
    if (activations.length < quantity) {
      return <span className="dt-badge dt-badge-info">Cuenta Activada</span>;
    }
    return <span className="dt-badge dt-badge-success">Completado</span>;
  }
  if (s === 'procesando') {
    return (
      <span className="dt-badge" style={{ background: 'var(--orange-base)', color: '#ffffff' }}>
        Activando...
      </span>
    );
  }
  if (s === 'pending' || s === 'pending_nequi') {
    return <span className="dt-badge dt-badge-warning">Pago Pendiente</span>;
  }
  return <span className="dt-badge dt-badge-danger">Rechazado</span>;
}

export function DashboardHistory({
  orders,
  onNavigateToCatalog,
  userId,
  userName,
  onRefresh,
  formatCOP,
}: DashboardHistoryProps) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('Todos');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [activatingOrder, setActivatingOrder] = useState<Order | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  /* Modal upload state */
  const [uploadModalItem, setUploadModalItem] = useState<HistoryItem | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [verifyingOrderId, setVerifyingOrderId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* 1. Merge & De-duplicate Data */
  const unifiedItems: HistoryItem[] = [];
  orders.forEach((o) => {
    const isPoints = o.points_used > 0;
    unifiedItems.push({
      id: o.id,
      created_at: o.created_at,
      type: isPoints ? 'Canje Puntos' : 'Compra Directa',
      description: o.products?.title || 'Producto Digital',
      reference_note: o.reference_note || null,
      status: o.status,
      amount_cop: isPoints ? null : o.amount_cop,
      points_used: isPoints ? o.points_used : null,
      points_awarded: null,
      isOrder: true,
      order: o,
    });
  });

  /* Sort unified history chronologically (descending) */
  const sortedItems = unifiedItems.sort((a, b) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  /* 2. Filter data based on search and filters */
  const filtered = sortedItems.filter((item) => {
    /* A. Type Filter */
    if (typeFilter !== 'Todos' && item.type !== typeFilter) {
      return false;
    }
    /* B. Status Filter */
    if (statusFilter !== 'Todos') {
      const uiStatus = getUIStatus(item);
      if (statusFilter !== uiStatus) {
        return false;
      }
    }
    /* C. Search Input */
    const q = search.toLowerCase();
    return (
      item.id.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      (item.reference_note || '').toLowerCase().includes(q)
    );
  });

  /* Checkbox functions */
  const toggleSelectItem = (id: string) => {
    const next = new Set(selectedItems);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedItems(next);
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === filtered.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filtered.map((i) => i.id)));
    }
  };

  const toggleExpandItem = (id: string) => {
    const next = new Set(expandedItems);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedItems(next);
  };

  /* Export JSON */
  const handleExport = () => {
    const targets =
      selectedItems.size > 0 ? sortedItems.filter((i) => selectedItems.has(i.id)) : filtered;
    if (targets.length === 0) {
      alert('No hay transacciones para exportar.');
      return;
    }
    const dataStr =
      'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(targets, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `historial_jacko_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  /* Handle image drag & drop selection */
  const handleImageSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setUploadError('Solo se admiten imágenes (JPG, PNG, WEBP, HEIC).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('La imagen no puede superar 5 MB.');
      return;
    }
    setImageFile(file);
    setUploadError('');
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleImageSelect(file);
  };

  /* Handle uploading the payment proof */
  const handleUploadProof = async () => {
    if (!uploadModalItem || !imageFile) {
      setUploadError('Por favor selecciona una imagen del comprobante.');
      return;
    }
    setIsUploading(true);
    setUploadError('');
    try {
      const orderId = uploadModalItem.id;
      const cleanUserName = userName.trim().replace(/[^a-zA-Z0-9]/g, '_');
      const fileExt = imageFile.name.split('.').pop() || 'jpg';
      const filePath = `${userId}/Pendiente_Validacion_Pago_${cleanUserName}_${orderId}.${fileExt}`;

      /* 1. Upload file to storage */
      const { error: uploadErr } = await supabase.storage
        .from('nequi-comprobantes')
        .upload(filePath, imageFile, { upsert: true });
      if (uploadErr) {
        throw new Error(`Error de Storage: ${uploadErr.message}`);
      }

      /* 2. Generate the URL */
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const comprobanteUrl = `${supabaseUrl}/storage/v1/object/public/nequi-comprobantes/${filePath}`;

      /* 3. Update database row */
      const { error: updateErr } = await supabase
        .from('orders')
        .update({ receipt_url: comprobanteUrl })
        .eq('id', orderId);
      if (updateErr) {
        throw new Error(`Error de Base de Datos: ${updateErr.message}`);
      }

      setUploadSuccess(true);
      setTimeout(async () => {
        setUploadSuccess(false);
        setUploadModalItem(null);
        setImageFile(null);
        setImagePreview(null);
        await onRefresh(true);
      }, 2000);
    } catch (err: unknown) {
      console.error('Error uploading payment receipt:', err);
      setUploadError(
        err instanceof Error ? err.message : 'No se pudo subir el comprobante. Intenta de nuevo.'
      );
    } finally {
      setIsUploading(false);
    }
  };

  /* Verify PayPal Payment inside actions menu */
  const handleVerifyPaypal = async (
    paypalOrderId: string | null | undefined,
    localOrderId: string
  ) => {
    if (!paypalOrderId) {
      alert('No se encontró número de referencia de PayPal para verificar.');
      return;
    }
    setVerifyingOrderId(localOrderId);
    try {
      const { data, error } = await supabase.functions.invoke('paypal-capture-order', {
        body: { paypalOrderId },
      });
      if (error) {
        throw new Error(
          error.message || 'El pago aún no ha sido completado o no se pudo verificar.'
        );
      }
      if (data && data.success && data.status === 'approved') {
        invalidateCache('dashboard_data_' + userId);
        await onRefresh(true);
        alert('¡Pago verificado y capturado con éxito! Tu producto ha sido desbloqueado.');
      } else {
        alert('El pago no está listo o aprobado aún.');
      }
    } catch (err: unknown) {
      console.error('Error verifying paypal order:', err);
      alert(err instanceof Error ? err.message : 'No se pudo verificar el pago en PayPal.');
    } finally {
      setVerifyingOrderId(null);
    }
  };

  /* Handle order activation confirmation */
  const handleConfirmActivation = async (firstName: string, lastName: string, email: string) => {
    if (!activatingOrder) return;
    try {
      const result = await userService.activateOrder(activatingOrder.id, firstName, lastName, email);
      invalidateCache('dashboard_data_' + userId);
      await onRefresh(true);
      alert(result.message || 'Activación completada con éxito.');
    } catch (err: unknown) {
      console.error('Error activating order:', err);
      throw err;
    }
  };

  /* Row Credentials / Activations Details Drawer */
  const renderDetails = (item: HistoryItem) => {
    if (!item.isOrder || !item.order) return null;
    const o = item.order;
    const isMiniCurso = o.delivered_credentials === 'Acceso al mini-curso entregado tras canje';
    const activations = Array.isArray(o.activation_details) ? o.activation_details : [];
    const statusLower = o.status.toLowerCase();
    const isPending =
      statusLower === 'pending' || statusLower === 'pending_nequi' || statusLower === 'procesando';

    return (
      <div style={{ padding: '0' }}>
        <div
          style={{
            background: '#ffffff',
            border: '1px solid var(--modern-border, #E6E2DA)',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            width: '100%',
          }}
        >
          {/* Main Info Row (Reference, Date, Amount) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
              borderBottom: '1px solid var(--modern-border, #E6E2DA)',
              paddingBottom: '12px',
            }}
          >
            {o.reference_note && (
              <div>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: 'var(--modern-text-secondary, #6B7280)',
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: '2px',
                  }}
                >
                  Referencia
                </span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--modern-text-primary, #1E1E1E)',
                  }}
                >
                  {o.reference_note}
                </span>
              </div>
            )}
            {o.amount_cop !== null && o.amount_cop > 0 && (
              <div>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: 'var(--modern-text-secondary, #6B7280)',
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: '2px',
                  }}
                >
                  Monto
                </span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: 'var(--modern-text-primary, #1E1E1E)',
                  }}
                >
                  {formatCOP(o.amount_cop)}
                </span>
              </div>
            )}
            {o.points_used !== null && o.points_used > 0 && (
              <div>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: 'var(--modern-text-secondary, #6B7280)',
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: '2px',
                  }}
                >
                  Puntos Canjeados
                </span>
                <span
                  style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--orange-base)' }}
                >
                  {o.points_used.toLocaleString('es-CO')} pts
                </span>
              </div>
            )}
          </div>

          {/* Redemption Code (Código de Canje) */}
          {o.redemption_code && (
            <div
              style={{
                background: 'var(--modern-bg, #F8F7F4)',
                border: '1px dashed var(--orange-base, #d4621a)',
                borderRadius: '12px',
                padding: '14px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                boxShadow: '0 2px 8px rgba(212, 98, 26, 0.05)',
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: 'var(--modern-text-secondary, #6B7280)',
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: '4px',
                    letterSpacing: '0.5px',
                  }}
                >
                  Código de Canje
                </span>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '1.15rem',
                    fontWeight: 800,
                    color: 'var(--orange-base, #d4621a)',
                    letterSpacing: '1px',
                  }}
                >
                  {o.redemption_code}
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(o.redemption_code || '');
                  alert('¡Código de canje copiado al portapapeles!');
                }}
                style={{
                  backgroundColor: 'var(--orange-base, #d4621a)',
                  color: '#ffffff',
                  fontSize: '0.75rem',
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                  transition: 'transform 0.1s, opacity 0.1s',
                }}
              >
                Copiar Código
              </button>
            </div>
          )}

          {/* Credentials / Delivery Status */}
          {o.delivered_credentials && (
            <div
              style={{ borderBottom: '1px solid var(--modern-border, #E6E2DA)', paddingBottom: '12px' }}
            >
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: 'var(--modern-text-secondary, #6B7280)',
                  textTransform: 'uppercase',
                  display: 'block',
                  marginBottom: '4px',
                }}
              >
                {isMiniCurso ? 'Acceso Curso' : 'Credenciales Entregadas'}
              </span>
              <pre
                style={{
                  margin: 0,
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  background: 'var(--modern-bg, #F8F7F4)',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--modern-border, #E6E2DA)',
                  color: 'var(--modern-text-primary, #1E1E1E)',
                  fontWeight: 600,
                }}
              >
                {o.delivered_credentials}
              </pre>
            </div>
          )}

          {/* Slots Activations block */}
          {o.payment_type !== 'points' &&
            o.points_used === 0 &&
            (activations.length > 0 ||
              (!o.delivered_credentials &&
                (o.status === 'approved' || o.status === 'procesando'))) && (
              <div
                style={{
                  borderBottom: '1px solid var(--modern-border, #E6E2DA)',
                  paddingBottom: '12px',
                }}
              >
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: 'var(--modern-text-secondary, #6B7280)',
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: '8px',
                  }}
                >
                  Registro y Asignación de Cuentas (Slots)
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {activations.map((act: ActivationDetail, idx: number) => (
                    <div
                      key={idx}
                      style={{
                        border: '1px solid var(--modern-border, #E6E2DA)',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: 'var(--modern-bg, #F8F7F4)',
                      }}
                    >
                      <div>
                        <span
                          style={{
                            display: 'block',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            color: 'var(--modern-text-primary, #1E1E1E)',
                          }}
                        >
                          Slot #{idx + 1}: {act.first_name} {act.last_name}
                        </span>
                        <span
                          style={{ color: 'var(--modern-text-secondary, #6B7280)', fontSize: '0.75rem' }}
                        >
                          {act.correo || act.email}
                        </span>
                      </div>
                      <span className="dt-badge dt-badge-success">Activa</span>
                    </div>
                  ))}
                  {(o.status === 'approved' || o.status === 'procesando') &&
                    Array.from({
                      length: Math.max(0, (o.quantity || 1) - activations.length),
                    }).map((_, rIdx) => {
                      const slotIndex = activations.length + rIdx + 1;
                      return (
                        <div
                          key={`empty-${rIdx}`}
                          style={{
                            border: '1px dashed var(--modern-border, #E6E2DA)',
                            padding: '10px 14px',
                            borderRadius: '8px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: '#ffffff',
                          }}
                        >
                          <div>
                            <span
                              style={{
                                display: 'block',
                                fontWeight: 700,
                                fontStyle: 'italic',
                                fontSize: '0.75rem',
                                color: 'var(--modern-text-secondary, #6B7280)',
                              }}
                            >
                              Slot #{slotIndex}: Sin asignar
                            </span>
                            <span
                              style={{
                                color: 'var(--modern-text-secondary, #6B7280)',
                                opacity: 0.7,
                                fontSize: '0.75rem',
                              }}
                            >
                              Pendiente por registrar
                            </span>
                          </div>
                          {rIdx === 0 ? (
                            <button
                              type="button"
                              style={{
                                backgroundColor: 'var(--orange-base, #d4621a)',
                                color: '#ffffff',
                                fontSize: '0.75rem',
                                padding: '6px 12px',
                                border: 'none',
                                borderRadius: '6px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                              onClick={() => setActivatingOrder(o)}
                            >
                              🔑 Registrar Correo
                            </button>
                          ) : (
                            <span
                              style={{
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                color: 'var(--modern-text-secondary, #6B7280)',
                                opacity: 0.5,
                                padding: '4px 10px',
                              }}
                            >
                              En espera
                            </span>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

          {/* Pending points redemption status */}
          {(o.payment_type === 'points' || (o.points_used && o.points_used > 0)) &&
            (o.status === 'approved' || o.status === 'procesando') &&
            !o.delivered_credentials && (
              <div style={{ borderLeft: '3px solid var(--orange-base)', paddingLeft: '12px' }}>
                <span>Estado del Canje</span>
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.75rem',
                    color: 'var(--modern-text-primary, #1E1E1E)',
                    fontWeight: 500,
                  }}
                >
                  Asignando cuenta de los servidores... Por favor espera unos segundos o recarga la
                  página.
                </p>
              </div>
            )}

          {/* Proof upload link */}
          {o.receipt_url && (
            <div
              style={{ borderBottom: '1px solid var(--modern-border, #E6E2DA)', paddingBottom: '12px' }}
            >
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: 'var(--modern-text-secondary, #6B7280)',
                  textTransform: 'uppercase',
                  display: 'block',
                  marginBottom: '4px',
                }}
              >
                Soporte de Pago
              </span>
              <a
                href={o.receipt_url.replace(
                  '/object/nequi-comprobantes/',
                  '/object/public/nequi-comprobantes/'
                )}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ver imagen de comprobante ↗
              </a>
            </div>
          )}

          {/* Admin Note block */}
          {(() => {
            const cleanNote = o.admin_note
              ? o.admin_note.replace(/\[ADVERTENCIA:[^\]]*\]/gi, '').trim()
              : '';
            if (!cleanNote) return null;
            return (
              <div style={{ borderLeft: '3px solid var(--orange-base)', paddingLeft: '12px' }}>
                <span>Nota Administrativa</span>
                <pre
                  style={{
                    margin: 0,
                    fontFamily: 'inherit',
                    fontSize: '0.75rem',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    color: 'var(--modern-text-primary, #1E1E1E)',
                    fontWeight: 500,
                  }}
                >
                  {cleanNote}
                </pre>
              </div>
            );
          })()}

          {/* Actions inline inside details panel */}
          {isPending && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button
                type="button"
                className="dt-inline-action orange"
                onClick={() => setUploadModalItem(item)}
              >
                📷 Subir Soporte de Pago
              </button>
              {o.payment_methods?.type === 'paypal' && (
                <button
                  type="button"
                  className="dt-inline-action"
                  onClick={() => handleVerifyPaypal(o.reference_note, item.id)}
                  disabled={verifyingOrderId === item.id}
                >
                  {verifyingOrderId === item.id ? 'Verificando...' : 'Verificar Pago en PayPal'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (sortedItems.length === 0) {
    return (
      <div className="dt-empty-state">
        <ShoppingBag size={36} />
        <h4 style={{ fontWeight: 800 }}>Sin historial aún</h4>
        <p style={{ opacity: 0.85, fontWeight: 500 }}>
          Aquí aparecerán tus compras directas y suscripciones activas.
        </p>
        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <button type="button" onClick={onNavigateToCatalog} style={{ fontWeight: 700 }}>
            Ir al Catálogo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="paypal-table-card">
      {/* Filter Bar Capsule */}
      <div className="dt-filter-bar">
        {/* Dropdown Type Filter */}
        <div className="paypal-filter-select-wrapper">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="Todos">Tipo: Todos</option>
            <option value="Compra Directa">Compra Directa</option>
            <option value="Canje Puntos">Canje Puntos</option>
          </select>
          <span className="paypal-filter-select-arrow">
            <ChevronDown size={14} />
          </span>
        </div>

        {/* Dropdown Status Filter */}
        <div className="paypal-filter-select-wrapper">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="Todos">Estado: Todos</option>
            <option value="Completado">Completado</option>
            <option value="Pendiente">Pendiente</option>
            <option value="Rechazado">Rechazado</option>
          </select>
          <span className="paypal-filter-select-arrow">
            <ChevronDown size={14} />
          </span>
        </div>

        {/* Search Field */}
        <div className="paypal-search-wrapper" style={{ flex: 1 }}>
          <span className="paypal-search-icon">
            <Search size={16} />
          </span>
          <input
            aria-label="Buscar historial"
            type="text"
            className="paypal-search-input"
            placeholder="Buscar por producto, ID o referencia..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Filter Actions */}
        <div className="dt-filter-actions">
          <button
            type="button"
            className="dt-btn-icon"
            onClick={() => {
              setSearch('');
              setTypeFilter('Todos');
              setStatusFilter('Todos');
              setSelectedItems(new Set());
            }}
            style={{ fontWeight: 700 }}
          >
            <SlidersHorizontal size={14} />
            <span>Restablecer filtros</span>
          </button>
          <button
            type="button"
            className="dt-btn-icon"
            title="Exportar en JSON"
            onClick={handleExport}
          >
            <Download size={15} />
          </button>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="paypal-table-wrapper">
        {filtered.length === 0 ? (
          <div className="dt-empty-state">
            <ShoppingBag size={32} />
            <h4 style={{ fontWeight: 800 }}>Sin resultados</h4>
            <p style={{ opacity: 0.85 }}>Ninguna transacción coincide con tus filtros o búsqueda.</p>
          </div>
        ) : (
          <table className="paypal-table">
            <thead>
              <tr style={{ borderBottom: '1.5px solid var(--modern-border, #E6E2DA)' }}>
                <th style={{ width: '40px', paddingLeft: '8px' }}>
                  <div
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.currentTarget.click();
                      }
                    }}
                    className={`paypal-checkbox-container${
                      selectedItems.size === filtered.length && filtered.length > 0 ? ' checked' : ''
                    }`}
                    onClick={toggleSelectAll}
                    aria-label="Seleccionar todo"
                  >
                    {selectedItems.size === filtered.length && filtered.length > 0 && (
                      <Check size={12} strokeWidth={3} />
                    )}
                  </div>
                </th>
                <th style={{ fontWeight: 600 }}>Estado</th>
                <th style={{ fontWeight: 600 }}>Producto / Descripción</th>
                <th style={{ textAlign: 'right', fontWeight: 600 }}>Monto / Puntos</th>
                <th style={{ fontWeight: 600 }}>Fecha</th>
                <th aria-label="Control" style={{ width: '40px', paddingRight: '8px' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const isSelected = selectedItems.has(item.id);
                const isExpanded = expandedItems.has(item.id);
                const isPointSpend = item.type === 'Canje Puntos';
                return (
                  <Fragment key={item.id}>
                    <tr
                      onClick={() => toggleExpandItem(item.id)}
                      style={{ cursor: 'pointer', borderBottom: '1px solid var(--modern-border, #E6E2DA)' }}
                      className={isSelected ? 'row-selected' : ''}
                    >
                      {/* Checkbox column */}
                      <td onClick={(e) => e.stopPropagation()} style={{ paddingLeft: '8px' }}>
                        <div
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.currentTarget.click();
                            }
                          }}
                          className={`paypal-checkbox-container${isSelected ? ' checked' : ''}`}
                          onClick={() => toggleSelectItem(item.id)}
                          aria-label="Seleccionar fila"
                        >
                          {isSelected && <Check size={12} strokeWidth={3} />}
                        </div>
                      </td>
                      {/* 1. Status Column */}
                      <td>
                        <StatusBadge item={item} />
                      </td>
                      {/* 2. Description Column */}
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--modern-text-primary, #1E1E1E)' }}>
                          {item.description}
                        </div>
                        <div
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--modern-text-secondary, #6B7280)',
                            fontWeight: 500,
                          }}
                        >
                          {item.type}
                        </div>
                        {item.isOrder &&
                          item.order &&
                          item.order.status.toLowerCase() === 'approved' &&
                          (() => {
                            const order = item.order;
                            const activations = Array.isArray(order.activation_details)
                              ? order.activation_details
                              : [];
                            const quantity = order.quantity || 1;
                            const pending = quantity - activations.length;
                            if (pending > 0) {
                              return (
                                <div style={{ marginTop: '4px' }}>
                                  <button
                                    type="button"
                                    className="dt-inline-action orange"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActivatingOrder(order);
                                    }}
                                  >
                                    🔑 {quantity === 1 ? 'Activar Cuenta' : 'Activar siguiente cuenta'}
                                  </button>
                                  {quantity > 1 && (
                                    <span
                                      style={{
                                        fontSize: '0.75rem',
                                        color: 'var(--modern-text-secondary, #6B7280)',
                                        fontWeight: 600,
                                        marginLeft: '8px',
                                      }}
                                    >
                                      ({quantity} adquiridas · {activations.length} activadas ·{' '}
                                      {pending} pendientes)
                                    </span>
                                  )}
                                </div>
                              );
                            }
                            return null;
                          })()}
                      </td>
                      {/* 3. Amount / Points Column */}
                      <td
                        style={{
                          textAlign: 'right',
                          fontWeight: 700,
                          color: isPointSpend ? 'var(--orange-base)' : 'var(--modern-text-primary, #1E1E1E)',
                        }}
                      >
                        {isPointSpend && `-${item.points_used?.toLocaleString('es-CO')} pts`}
                        {item.type === 'Compra Directa' && formatCOP(item.amount_cop)}
                      </td>
                      {/* 4. Date Column */}
                      <td style={{ color: 'var(--modern-text-secondary, #6B7280)' }}>
                        <div style={{ fontWeight: 600 }}>
                          {new Date(item.created_at).toLocaleDateString('es-CO')}
                        </div>
                        <div style={{ fontSize: '0.75rem', opacity: 0.8, fontWeight: 500 }}>
                          {new Date(item.created_at).toLocaleTimeString('es-CO', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>
                      {/* 5. Chevron Expand Column */}
                      <td style={{ textAlign: 'center', paddingRight: '8px' }}>
                        <ChevronDown
                          size={16}
                          style={{
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s',
                            color: 'var(--modern-text-secondary, #6B7280)',
                          }}
                        />
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="dt-expanded-row">
                        <td colSpan={6}>{renderDetails(item)}</td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Mobile Card List View */}
      <div className="dt-mobile-cards">
        {filtered.length === 0 ? (
          <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
            <ShoppingBag size={28} />
            <h4 style={{ fontWeight: 800 }}>Sin resultados</h4>
          </div>
        ) : (
          filtered.map((item) => {
            const isSelected = selectedItems.has(item.id);
            const isExpanded = expandedItems.has(item.id);
            const isPointSpend = item.type === 'Canje Puntos';
            return (
              <div
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.currentTarget.click();
                  }
                }}
                key={item.id}
                className={`dt-mobile-card${isSelected ? ' row-selected' : ''}`}
                onClick={() => toggleExpandItem(item.id)}
                style={{ cursor: 'pointer' }}
              >
                {/* Header row (Status + Checkbox/Chevron) */}
                <div className="dt-mobile-card-header">
                  <StatusBadge item={item} />
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.currentTarget.click();
                        }
                      }}
                      className={`paypal-checkbox-container${isSelected ? ' checked' : ''}`}
                      onClick={() => toggleSelectItem(item.id)}
                      aria-label="Seleccionar fila"
                    >
                      {isSelected && <Check size={12} strokeWidth={3} />}
                    </div>
                    <ChevronDown
                      size={16}
                      style={{
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s',
                        color: 'var(--modern-text-secondary, #6B7280)',
                      }}
                    />
                  </div>
                </div>

                {/* Content row (Title + Value) */}
                <div className="dt-mobile-card-title-wrap" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', margin: '8px 0' }}>
                  <div style={{ flex: 1 }}>
                    <span className="dt-mobile-card-title" style={{ display: 'block', fontWeight: 700 }}>
                      {item.description}
                    </span>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--modern-text-secondary, #6B7280)',
                        fontWeight: 500,
                      }}
                    >
                      {item.type}
                    </span>
                    {item.isOrder &&
                      item.order &&
                      item.order.status.toLowerCase() === 'approved' &&
                      (() => {
                        const order = item.order;
                        const activations = Array.isArray(order.activation_details)
                          ? order.activation_details
                          : [];
                        const quantity = order.quantity || 1;
                        const pending = quantity - activations.length;
                        if (pending > 0) {
                          return (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              style={{ marginTop: '4px' }}
                            >
                              <button
                                type="button"
                                className="dt-inline-action orange"
                                onClick={() => setActivatingOrder(order)}
                              >
                                🔑 {quantity === 1 ? 'Activar Cuenta' : 'Activar siguiente cuenta'}
                              </button>
                              {quantity > 1 && (
                                <span
                                  style={{
                                    fontSize: '0.75rem',
                                    color: 'var(--modern-text-secondary, #6B7280)',
                                    fontWeight: 600,
                                    display: 'block',
                                    marginTop: '4px',
                                  }}
                                >
                                  ({quantity} adquiridas · {activations.length} activadas ·{' '}
                                  {pending} pendientes)
                                </span>
                              )}
                            </div>
                          );
                        }
                        return null;
                      })()}
                  </div>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      textAlign: 'right',
                      color: isPointSpend ? 'var(--orange-base)' : 'var(--modern-text-primary, #1E1E1E)',
                    }}
                  >
                    {isPointSpend && `-${item.points_used?.toLocaleString('es-CO')} pts`}
                    {item.type === 'Compra Directa' && formatCOP(item.amount_cop)}
                  </span>
                </div>

                {/* Footer row (Date) */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.75rem',
                    color: 'var(--modern-text-secondary, #6B7280)',
                    fontWeight: 500,
                  }}
                >
                  <span>
                    {new Date(item.created_at).toLocaleDateString('es-CO')} ·{' '}
                    {new Date(item.created_at).toLocaleTimeString('es-CO', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                {/* Mobile details block */}
                {isExpanded && (
                  <div style={{ marginTop: '8px' }} onClick={(e) => e.stopPropagation()}>
                    {renderDetails(item)}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer Total Items Count */}
      <div className="dt-table-footer">
        <span style={{ fontWeight: 600 }}>
          {filtered.length} de {sortedItems.length} transacciones{' '}
          {selectedItems.size > 0 && `(${selectedItems.size} seleccionadas)`}
        </span>
      </div>

      {/* =========================================================================
          MODAL DE CARGA DE COMPROBANTE / SOPORTE DE PAGO
          ========================================================================= */}
      {uploadModalItem && (
        <div
          className="support-modal-backdrop"
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.4)',
            zIndex: 9999,
          }}
        >
          <div
            className="support-modal-panel"
            style={{
              maxWidth: '450px',
              width: '90%',
              background: 'var(--white-warm)',
              padding: '24px',
              borderRadius: '24px',
              border: '2px solid rgba(212, 98, 26, 0.2)',
              boxShadow: '0 20px 48px rgba(42, 26, 10, 0.15)',
              position: 'relative',
            }}
          >
            {/* Header */}
            <div className="support-modal-header">
              <div
                className="support-modal-header-info"
                style={{ background: 'var(--orange-deep)', color: '#ffffff', fontWeight: 800 }}
              >
                <span>Soporte de Pago</span>
              </div>
              <button
                type="button"
                className="support-modal-close"
                onClick={() => {
                  setUploadModalItem(null);
                  setImageFile(null);
                  setImagePreview(null);
                  setUploadError('');
                }}
                disabled={isUploading}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            {uploadSuccess ? (
              <div className="support-modal-success" style={{ textAlign: 'center', padding: '20px 0' }}>
                <div className="support-modal-success-icon">
                  <Check size={24} />
                </div>
                <h3>¡Soporte Cargado!</h3>
                <p>
                  El comprobante fue recibido correctamente y se encuentra listo para validación
                  manual.
                </p>
              </div>
            ) : (
              <div>
                <h4 className="support-modal-title">Subir Comprobante</h4>
                <p>
                  Adjunta el screenshot de tu transferencia bancaria (Nequi, Davivienda, etc.) para
                  que el administrador pueda validar tu pago manualmente.
                </p>

                <div
                  className="support-modal-info-box"
                  style={{
                    background: '#f8f7f4',
                    padding: '12px',
                    borderRadius: '12px',
                    marginBottom: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--brown-dark)', opacity: 0.7, fontWeight: 700 }}>
                      Producto:
                    </span>
                    <strong style={{ color: 'var(--brown-dark)', marginLeft: 'auto' }}>
                      {uploadModalItem.description}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--brown-dark)', opacity: 0.7, fontWeight: 700 }}>
                      Monto:
                    </span>
                    <strong style={{ color: 'var(--brown-dark)', marginLeft: 'auto' }}>
                      {formatCOP(uploadModalItem.amount_cop)}
                    </strong>
                  </div>
                </div>

                {/* Dropzone / Upload area */}
                {imagePreview ? (
                  <div className="support-modal-preview" style={{ textAlign: 'center', marginBottom: '16px' }}>
                    <img
                      src={imagePreview}
                      alt="Vista previa comprobante"
                      style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '12px', marginBottom: '10px' }}
                    />
                    <button
                      type="button"
                      className="support-modal-cancel"
                      onClick={() => {
                        setImageFile(null);
                        setImagePreview(null);
                      }}
                    >
                      <X size={14} /> Cambiar imagen
                    </button>
                  </div>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.currentTarget.click();
                      }
                    }}
                    className={`support-modal-dropzone${isDragging ? ' dragging' : ''}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: '2px dashed var(--beige-dark)',
                      borderRadius: '16px',
                      padding: '24px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      marginBottom: '16px',
                      background: isDragging ? 'rgba(212, 98, 26, 0.05)' : 'transparent',
                      transition: 'all 0.2s',
                    }}
                  >
                    <Upload
                      style={{ margin: '0 auto 8px auto', color: 'var(--brown-dark)' }}
                      size={24}
                    />
                    <span>
                      Arrastra tu screenshot aquí o <strong>haz clic para explorar</strong>
                    </span>
                    <span style={{ display: 'block', fontSize: '0.75rem', opacity: 0.6, marginTop: '4px' }}>
                      JPG, PNG, WEBP, HEIC · Máx. 5 MB
                    </span>
                    <input
                      aria-label="Archivo de comprobante"
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleImageSelect(f);
                      }}
                    />
                  </div>
                )}

                {uploadError && <div className="support-modal-error">⚠️ {uploadError}</div>}

                {/* Actions */}
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="support-modal-cancel"
                    onClick={() => {
                      setUploadModalItem(null);
                      setImageFile(null);
                      setImagePreview(null);
                      setUploadError('');
                    }}
                    disabled={isUploading}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="support-modal-submit"
                    onClick={handleUploadProof}
                    disabled={isUploading || !imageFile}
                    style={{
                      padding: '8px 16px',
                      fontSize: '0.75rem',
                      borderRadius: '12px',
                      border: 'none',
                      background:
                        isUploading || !imageFile
                          ? 'var(--beige-dark)'
                          : 'var(--orange-base, #d4621a)',
                      color: '#ffffff',
                      cursor: isUploading || !imageFile ? 'not-allowed' : 'pointer',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 size={14} className="spin" />
                        <span>Subiendo...</span>
                      </>
                    ) : (
                      <span>Confirmar y Subir</span>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activatingOrder && (
        <ActivationModal
          order={activatingOrder}
          onClose={() => setActivatingOrder(null)}
          onConfirm={handleConfirmActivation}
        />
      )}
    </div>
  );
}