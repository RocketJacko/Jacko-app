import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Search, Check, RefreshCw, X, MessageSquare, Clipboard } from 'lucide-react';
import './admin-components.css';
import '../../styles/data-table.css';

interface SupportTicket {
  id: string;
  ticket_number: number;
  email: string;
  phone: string;
  topic: 'pago' | 'cuentas' | 'cupon' | 'otros';
  message: string;
  status: 'open' | 'resolved' | 'closed';
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

const TOPIC_LABELS: Record<string, string> = {
  pago: '💳 Pago',
  cuentas: '👥 Cuentas',
  cupon: '🎟️ Cupón',
  otros: '⚙️ Otros',
};

export function SupportTicketsManager() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('all');

  /* Selected ticket details */
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchTickets = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    setErrorMsg('');
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTickets((data as SupportTicket[]) || []);
    } catch (err: unknown) {
      console.error('Error loading tickets:', err);
      setErrorMsg(
        err instanceof Error ? err.message : 'No se pudieron cargar los tickets de soporte.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const fetchAsync = async () => {
      await Promise.resolve();
      if (active) {
        await fetchTickets();
      }
    };
    fetchAsync();
    return () => {
      active = false;
    };
  }, [fetchTickets]);

  const handleSelectTicket = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setAdminNote(ticket.admin_note || '');
  };

  const handleUpdateTicketStatus = async (newStatus: 'resolved' | 'closed' | 'open') => {
    if (!selectedTicket) return;
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('support_tickets')
        .update({
          status: newStatus,
          admin_note: adminNote.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedTicket.id);
      if (error) throw error;

      alert(
        `Ticket actualizado a estado: ${
          newStatus === 'resolved' ? 'Resuelto' : newStatus === 'closed' ? 'Cerrado' : 'Abierto'
        }`
      );
      await fetchTickets(true);
      setSelectedTicket((prev) =>
        prev ? { ...prev, status: newStatus, admin_note: adminNote.trim() || null } : null
      );
    } catch (err: unknown) {
      console.error('Error updating ticket:', err);
      alert(
        'Error al actualizar el estado: ' + (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setIsUpdating(false);
    }
  };

  /* Filter lists based on search & status */
  const filteredTickets = tickets.filter((t) => {
    const matchesSearch =
      t.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.phone.includes(searchQuery) ||
      `#T-${1000 + t.ticket_number}`.includes(searchQuery);
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'open' && t.status === 'open') ||
      (statusFilter === 'resolved' && t.status === 'resolved');
    return matchesSearch && matchesStatus;
  });

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selectedTicket ? '1fr 380px' : '1fr', gap: '20px' }}>
      {/* Columna principal: Tabla de tickets */}
      <div className="paypal-table-card">
        <div className="admin-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '0 10px' }}>
          <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>Listado de Tickets</h3>
          <button
            type="button"
            className="refresh-btn"
            onClick={() => fetchTickets(true)}
            disabled={isLoading || isUpdating}
            title="Refrescar"
          >
            <RefreshCw size={16} className={isLoading || isUpdating ? 'spin' : ''} />
          </button>
        </div>

        {/* Toolbar de filtros y búsquedas */}
        <div className="dt-filter-bar">
          <div className="paypal-search-wrapper" style={{ flex: 1 }}>
            <span className="paypal-search-icon">
              <Search size={16} />
            </span>
            <input
              type="text"
              className="paypal-search-input"
              placeholder="Buscar por ticket, email o celular..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <nav className="dashboard-tabs" style={{ margin: 0 }} aria-label="Filtro de estados">
            <button
              type="button"
              className={`tab-btn${statusFilter === 'all' ? ' active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              Todos ({tickets.length})
            </button>
            <button
              type="button"
              className={`tab-btn${statusFilter === 'open' ? ' active' : ''}`}
              onClick={() => setStatusFilter('open')}
            >
              Abiertos ({tickets.filter((t) => t.status === 'open').length})
            </button>
            <button
              type="button"
              className={`tab-btn${statusFilter === 'resolved' ? ' active' : ''}`}
              onClick={() => setStatusFilter('resolved')}
            >
              Resueltos ({tickets.filter((t) => t.status === 'resolved').length})
            </button>
          </nav>
        </div>

        {errorMsg && (
          <div className="admin-error-banner" style={{ margin: '15px 10px' }}>
            <span>{errorMsg}</span>
          </div>
        )}

        {isLoading ? (
          <div className="admin-loading" style={{ textAlign: 'center', padding: '40px 0' }}>
            <div className="loading-spinner" style={{ margin: '0 auto 12px auto' }}></div>
            <span>Cargando tickets...</span>
          </div>
        ) : filteredTickets.length > 0 ? (
          <div className="paypal-table-wrapper">
            <table className="paypal-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Ticket</th>
                  <th>Usuario / Email</th>
                  <th>Celular</th>
                  <th>Asunto</th>
                  <th>Estado</th>
                  <th style={{ textAlign: 'center' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map((t) => {
                  const ticketNum = `#T-${1000 + t.ticket_number}`;
                  return (
                    <tr
                      key={t.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleSelectTicket(t)}
                    >
                      <td>{formatDate(t.created_at)}</td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 'bold', color: 'var(--orange-deep)' }}>
                        {ticketNum}
                      </td>
                      <td>
                        <span style={{ fontWeight: '600', display: 'block', color: 'var(--brown-dark)' }}>
                          {t.email}
                        </span>
                      </td>
                      <td>{t.phone}</td>
                      <td>
                        <span style={{ margin: 0 }}>
                          {TOPIC_LABELS[t.topic] || t.topic}
                        </span>
                      </td>
                      <td>
                        <span
                          className="dt-badge"
                          style={{
                            backgroundColor:
                              t.status === 'resolved'
                                ? 'rgba(43, 138, 62, 0.12)'
                                : t.status === 'closed'
                                ? 'rgba(0,0,0,0.1)'
                                : 'rgba(212, 98, 26, 0.12)',
                            color:
                              t.status === 'resolved'
                                ? '#2b8a3e'
                                : t.status === 'closed'
                                ? 'var(--brown-dark)'
                                : 'var(--orange-base)',
                          }}
                        >
                          {t.status === 'resolved' ? 'RESUELTO' : t.status === 'closed' ? 'CERRADO' : 'ABIERTO'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="dt-row-btn success"
                          style={{ margin: 0, padding: '4px 10px', fontSize: '0.8rem' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectTicket(t);
                          }}
                        >
                          Atender
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-panel-state" style={{ textAlign: 'center', padding: '40px 20px', border: '2px dashed var(--beige-dark)', borderRadius: '20px', margin: '20px 10px' }}>
            <Clipboard size={48} style={{ margin: '0 auto 12px auto', opacity: 0.3 }} />
            <h4>No hay tickets</h4>
            <p>No se encontraron tickets que coincidan con los filtros seleccionados.</p>
          </div>
        )}
      </div>

      {/* Columna lateral: Panel de Atención (Solo visible si hay un ticket seleccionado) */}
      {selectedTicket && (
        <div className="admin-editor-card" style={{ display: 'flex', flexDirection: 'column', height: 'fit-content', background: '#ffffff', border: '1.5px solid var(--beige-dark)', padding: '24px', borderRadius: '20px' }}>
          <div className="admin-editor-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--beige-light)', paddingBottom: '12px' }}>
            <h4 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--brown-dark)', fontSize: '1.1rem', fontWeight: 800 }}>
              Detalles de Ticket
            </h4>
            <button
              type="button"
              onClick={() => setSelectedTicket(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <X size={18} />
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--orange-deep)', marginBottom: '4px' }}>Ticket Nro</span>
              <strong style={{ fontSize: '1.1rem', color: 'var(--brown-dark)' }}>
                #T-{1000 + selectedTicket.ticket_number}
              </strong>
            </div>
            <div>
              <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--orange-deep)', marginBottom: '4px' }}>Contacto</span>
              <span style={{ display: 'block', fontWeight: 'bold', color: 'var(--brown-dark)' }}>{selectedTicket.email}</span>
              <span style={{ display: 'block', color: 'var(--brown-dark)', opacity: 0.8 }}>{selectedTicket.phone}</span>
            </div>
            <div>
              <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--orange-deep)', marginBottom: '4px' }}>Asunto</span>
              <span style={{ display: 'block', color: 'var(--brown-dark)', fontWeight: 600 }}>
                {TOPIC_LABELS[selectedTicket.topic] || selectedTicket.topic}
              </span>
            </div>
            <div>
              <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--orange-deep)', marginBottom: '4px' }}>Comentario de Usuario</span>
              <div style={{ background: 'var(--beige-light)', padding: '12px', borderRadius: '10px', fontSize: '0.85rem', color: 'var(--brown-dark)', lineHeight: '1.4', border: '1px solid var(--beige-dark)' }}>
                {selectedTicket.message}
              </div>
            </div>
            <div style={{ borderTop: '1px solid var(--beige-light)', paddingTop: '14px', marginTop: '4px' }}>
              <label htmlFor="admin-ticket-note" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--orange-deep)', marginBottom: '6px' }}>
                Nota Administrativa (Interna)
              </label>
              <textarea
                id="admin-ticket-note"
                rows={4}
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder="Añade detalles sobre la resolución de este ticket..."
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid var(--beige-dark)',
                  fontFamily: 'var(--font-body), sans-serif',
                  fontSize: '0.85rem',
                }}
                disabled={isUpdating}
              />
            </div>
            <div className="admin-editor-actions" style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              {selectedTicket.status === 'open' ? (
                <>
                  <button
                    type="button"
                    className="btn-add-plan"
                    onClick={() => handleUpdateTicketStatus('resolved')}
                    disabled={isUpdating}
                    style={{ padding: '10px 16px', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '6px', margin: 0, flex: 1 }}
                  >
                    <Check size={16} />
                    <span>Resolver Ticket</span>
                  </button>
                  <button
                    type="button"
                    className="btn-admin-secondary"
                    onClick={() => handleUpdateTicketStatus('closed')}
                    disabled={isUpdating}
                    style={{ padding: '10px 16px', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', border: '1.5px solid var(--beige-dark)', borderRadius: '10px', background: '#fff', fontWeight: 700 }}
                  >
                    <X size={16} />
                    <span>Cerrar sin Resolver</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn-add-plan"
                  onClick={() => handleUpdateTicketStatus('open')}
                  disabled={isUpdating}
                  style={{ padding: '10px 16px', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '6px', margin: 0, width: '100%' }}
                >
                  <MessageSquare size={16} />
                  <span>Reabrir Ticket</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}