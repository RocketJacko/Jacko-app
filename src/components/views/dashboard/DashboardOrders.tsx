import { useState, Fragment } from 'react';
import {
  ShoppingBag,
  Search,
  ChevronDown,
  SlidersHorizontal,
  Download,
  MoreVertical,
  Check,
} from 'lucide-react';
import type { Order, ActivationDetail } from './types';
import '../../../styles/data-table.css';

interface DashboardOrdersProps {
  orders: Order[];
  onNavigateToCatalog: () => void;
  onVerifyPaypalOrder: (
    paypalOrderId: string | null | undefined,
    localOrderId: string
  ) => Promise<void>;
  verifyingOrderId: string | null;
  formatCOP: (val: number | null) => string;
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === 'procesado') {
    return <span className="dt-badge dt-badge-success">Completado</span>;
  }
  if (s === 'approved') {
    return (
      <span className="dt-badge" style={{ background: '#3b82f6', color: '#ffffff' }}>
        Pago Aprobado
      </span>
    );
  }
  if (s === 'procesando') {
    return (
      <span className="dt-badge" style={{ background: '#d4621a', color: '#ffffff' }}>
        Activando...
      </span>
    );
  }
  if (s === 'pending' || s === 'pending_nequi') {
    return <span className="dt-badge dt-badge-warning">Pendiente</span>;
  }
  return <span className="dt-badge dt-badge-danger">Rechazado</span>;
}

export function DashboardOrders({
  orders,
  onNavigateToCatalog,
  onVerifyPaypalOrder,
  verifyingOrderId,
  formatCOP,
}: DashboardOrdersProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  /* Filter orders */
  const filtered = orders.filter((o) => {
    /* 1. Status Filter */
    const s = o.status.toLowerCase();
    if (statusFilter !== 'Todos') {
      const isCompleted = s === 'procesado';
      const isPending =
        s === 'pending' || s === 'pending_nequi' || s === 'approved' || s === 'procesando';
      if (statusFilter === 'Completado' && !isCompleted) return false;
      if (statusFilter === 'Pendiente' && !isPending) return false;
      if (statusFilter === 'Rechazado' && (isCompleted || isPending)) return false;
    }
    /* 2. Search Text */
    const q = search.toLowerCase();
    return (
      o.id.toLowerCase().includes(q) ||
      (o.products?.title || '').toLowerCase().includes(q) ||
      (o.reference_note || '').toLowerCase().includes(q) ||
      o.status.toLowerCase().includes(q)
    );
  });

  /* Toggle Row Selection */
  const toggleSelectRow = (id: string) => {
    const next = new Set(selectedOrders);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedOrders(next);
  };

  /* Toggle All Selection */
  const toggleSelectAll = () => {
    if (selectedOrders.size === filtered.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(filtered.map((o) => o.id)));
    }
  };

  /* Toggle Row Expansion */
  const toggleExpandRow = (id: string) => {
    const next = new Set(expandedOrders);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedOrders(next);
  };

  /* Export Selected Orders */
  const handleExport = () => {
    const targetOrders =
      selectedOrders.size > 0 ? orders.filter((o) => selectedOrders.has(o.id)) : filtered;
    if (targetOrders.length === 0) {
      alert('No hay órdenes para exportar.');
      return;
    }
    const dataStr =
      'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(targetOrders, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `compras_jacko_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  if (orders.length === 0) {
    return (
      <div className="dt-empty-state">
        <ShoppingBag size={36} style={{ color: '#000' }} />
        <h4 style={{ color: '#000' }}>Sin compras aún</h4>
        <p style={{ color: '#000', opacity: 0.8 }}>
          Canjea tus puntos por recompensas exclusivas o adquiere una cuenta para empezar.
        </p>
        <button
          type="button"
          onClick={onNavigateToCatalog}
          style={{ color: '#000', borderColor: '#000' }}
        >
          Ir al Catálogo
        </button>
      </div>
    );
  }

  const renderCredentials = (o: Order) => {
    const isMiniCurso = o.delivered_credentials === 'Acceso al mini-curso entregado tras canje';
    const activations = Array.isArray(o.activation_details) ? o.activation_details : [];
    return (
      <div className="dt-details-expanded" style={{ padding: '12px' }}>
        {o.delivered_credentials && (
          <div className="dt-credentials-block" style={{ marginBottom: '12px' }}>
            <strong>{isMiniCurso ? 'Acceso Curso' : 'Credenciales de Cuenta'}</strong>
            <pre>{o.delivered_credentials}</pre>
          </div>
        )}
        {activations.length > 0 && (
          <div className="dt-activations-block" style={{ marginBottom: '12px' }}>
            <h5>Cuentas Activadas</h5>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
              {activations.map((act: ActivationDetail, idx: number) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    background: '#f8f7f4',
                    padding: '8px 12px',
                    borderRadius: '8px',
                  }}
                >
                  <span>
                    #{idx + 1}: {act.first_name} {act.last_name}
                  </span>
                  <span>{act.correo || act.email}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {(() => {
          const cleanNote = o.admin_note
            ? o.admin_note.replace(/\[ADVERTENCIA:[^\]]*\]/gi, '').trim()
            : '';
          if (!cleanNote) return null;
          return (
            <div style={{ borderLeft: '3px solid #d4621a', paddingLeft: '10px' }}>
              <h5>Nota Administrativa</h5>
              <pre>{cleanNote}</pre>
            </div>
          );
        })()}
        {!o.delivered_credentials && activations.length === 0 && !o.admin_note && (
          <div style={{ color: '#000', fontSize: '0.75rem' }}>
            No hay detalles adicionales de entrega disponibles para esta orden.
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="paypal-table-card">
      {/* Filter Bar Capsule */}
      <div className="dt-filter-bar">
        {/* Dropdown status selection */}
        <div className="paypal-filter-select-wrapper">
          <select
            className="paypal-filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="Todos">Todos</option>
            <option value="Completado">Completado</option>
            <option value="Pendiente">Pendiente</option>
            <option value="Rechazado">Rechazado</option>
          </select>
          <span className="paypal-filter-select-arrow">
            <ChevronDown size={14} />
          </span>
        </div>

        {/* Search input field */}
        <div className="paypal-search-wrapper" style={{ flex: 1 }}>
          <span className="paypal-search-icon">
            <Search size={16} />
          </span>
          <input
            type="text"
            className="paypal-search-input"
            placeholder="Buscar por producto, ID o referencia..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Actions buttons */}
        <div className="dt-filter-actions">
          <button
            type="button"
            className="dt-btn-icon"
            onClick={() => {
              setSearch('');
              setStatusFilter('Todos');
              setSelectedOrders(new Set());
            }}
          >
            <SlidersHorizontal size={14} />
            <span>Restablecer filtros</span>
          </button>
          <button
            type="button"
            className="dt-btn-icon"
            title="Exportar órdenes en JSON"
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
            <ShoppingBag size={32} style={{ color: '#000' }} />
            <h4 style={{ color: '#000' }}>Sin resultados</h4>
            <p style={{ color: '#000', opacity: 0.7 }}>
              Ninguna orden coincide con tu búsqueda o filtros.
            </p>
          </div>
        ) : (
          <table className="paypal-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
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
                      selectedOrders.size === filtered.length && filtered.length > 0 ? ' checked' : ''
                    }`}
                    onClick={toggleSelectAll}
                    aria-label="Seleccionar todo"
                  >
                    {selectedOrders.size === filtered.length && filtered.length > 0 && (
                      <Check size={12} strokeWidth={3} />
                    )}
                  </div>
                </th>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Producto / Referencia</th>
                <th>Estado</th>
                <th style={{ textAlign: 'right' }}>Costo / Bruto</th>
                <th style={{ textAlign: 'center', width: '80px' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const isSelected = selectedOrders.has(o.id);
                const isExpanded = expandedOrders.has(o.id);
                const statusLower = o.status.toLowerCase();
                const isPoints = o.points_used > 0;
                return (
                  <Fragment key={o.id}>
                    <tr className={isSelected ? 'row-selected' : ''}>
                      {/* Checkbox column */}
                      <td>
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
                          onClick={() => toggleSelectRow(o.id)}
                          aria-label="Seleccionar fila"
                        >
                          {isSelected && <Check size={12} strokeWidth={3} />}
                        </div>
                      </td>
                      {/* Date Column */}
                      <td>
                        <div style={{ color: '#000', fontWeight: 700 }}>
                          {new Date(o.created_at).toLocaleDateString('es-CO')}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#333', opacity: 0.7 }}>
                          {new Date(o.created_at).toLocaleTimeString('es-CO', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>
                      {/* Category Column */}
                      <td style={{ color: '#000', fontWeight: 600 }}>
                        {isPoints ? 'Canje Puntos' : 'Compra Directa'}
                      </td>
                      {/* Product Name & Reference Column */}
                      <td>
                        <div style={{ color: '#000', fontWeight: 800 }}>
                          {o.products?.title || 'Producto Digital'}
                        </div>
                        {o.reference_note && (
                          <span
                            className="dt-ref-badge"
                            title={`PayPal Ref: ${o.reference_note}`}
                          >
                            Ref: {o.reference_note.slice(0, 15)}
                          </span>
                        )}
                      </td>
                      {/* Status badge Column */}
                      <td>
                        <StatusBadge status={o.status} />
                        {statusLower === 'pending' && o.payment_methods?.type === 'paypal' && (
                          <button
                            type="button"
                            className="dt-inline-action orange"
                            onClick={() => onVerifyPaypalOrder(o.reference_note, o.id)}
                            disabled={verifyingOrderId === o.id}
                          >
                            {verifyingOrderId === o.id ? 'Verificando...' : 'Verificar Pago'}
                          </button>
                        )}
                      </td>
                      {/* Cost / Amount Column */}
                      <td style={{ textAlign: 'right', fontWeight: 800, color: '#000' }}>
                        {isPoints ? (
                          <span style={{ color: '#d4621a' }}>
                            -{o.points_used.toLocaleString('es-CO')} pts
                          </span>
                        ) : (
                          <span>{formatCOP(o.amount_cop)}</span>
                        )}
                      </td>
                      {/* Actions dropdown ellipsis */}
                      <td style={{ textAlign: 'center' }}>
                        <div className="dt-actions-group">
                          <button
                            type="button"
                            className="dt-row-btn"
                            onClick={() => toggleExpandRow(o.id)}
                            title={isExpanded ? 'Ocultar detalles' : 'Ver detalles'}
                          >
                            <MoreVertical size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="dt-expanded-row">
                        <td colSpan={7}>{renderCredentials(o)}</td>
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
          <div style={{ color: '#000', padding: '2rem 1rem' }}>
            <ShoppingBag size={28} style={{ color: '#000' }} />
            <h4 style={{ color: '#000' }}>Sin resultados</h4>
          </div>
        ) : (
          filtered.map((o) => {
            const isSelected = selectedOrders.has(o.id);
            const isExpanded = expandedOrders.has(o.id);
            const statusLower = o.status.toLowerCase();
            const isPoints = o.points_used > 0;
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
                key={o.id}
                className={`dt-mobile-card${isSelected ? ' row-selected' : ''}`}
                onClick={() => toggleSelectRow(o.id)}
              >
                <div className="dt-mobile-card-header">
                  <span className="dt-mobile-card-date">
                    {new Date(o.created_at).toLocaleDateString('es-CO')}
                  </span>
                  <StatusBadge status={o.status} />
                </div>
                <div className="dt-mobile-card-title">
                  {o.products?.title || 'Producto Digital'}
                </div>
                <div className="dt-mobile-card-row">
                  <span className="dt-mobile-card-label">Tipo</span>
                  <span className="dt-mobile-card-value" style={{ color: '#000' }}>
                    {isPoints ? 'Canje Puntos' : 'Compra Directa'}
                  </span>
                </div>
                <div className="dt-mobile-card-row">
                  <span className="dt-mobile-card-label">Costo</span>
                  <span
                    className="dt-mobile-card-value"
                    style={{ color: isPoints ? '#d4621a' : '#000' }}
                  >
                    {isPoints ? `-${o.points_used.toLocaleString('es-CO')} pts` : formatCOP(o.amount_cop)}
                  </span>
                </div>
                {o.reference_note && (
                  <div className="dt-mobile-card-row">
                    <span className="dt-mobile-card-label">Ref</span>
                    <span
                      className="dt-mobile-card-value"
                      style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                    >
                      {o.reference_note.slice(0, 15)}...
                    </span>
                  </div>
                )}
                {statusLower === 'pending' && o.payment_methods?.type === 'paypal' && (
                  <button
                    type="button"
                    className="dt-inline-action orange"
                    style={{ width: '100%', marginTop: '6px' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onVerifyPaypalOrder(o.reference_note, o.id);
                    }}
                    disabled={verifyingOrderId === o.id}
                  >
                    {verifyingOrderId === o.id ? 'Verificando...' : 'Verificar Pago'}
                  </button>
                )}
                {/* Mobile expand details trigger */}
                <button
                  type="button"
                  className="dt-row-btn"
                  style={{ width: '100%', marginTop: '6px', justifyContent: 'center' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpandRow(o.id);
                  }}
                >
                  <span>{isExpanded ? 'Ocultar Detalles' : 'Ver Detalles'}</span>
                  <ChevronDown
                    size={14}
                    style={{
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                    }}
                  />
                </button>
                {/* Mobile details block */}
                {isExpanded && (
                  <div
                    style={{ marginTop: '8px', borderTop: '1px dashed #cbd5e1', paddingTop: '8px' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {renderCredentials(o)}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer Total Items Count */}
      <div className="dt-table-footer">
        <span>
          {filtered.length} de {orders.length} órdenes{' '}
          {selectedOrders.size > 0 && `(${selectedOrders.size} seleccionadas)`}
        </span>
      </div>
    </div>
  );
}