import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Trash2, Plus, RefreshCw, Search, Ticket, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react';
import './admin-components.css';

interface InvitationCode {
  id: string;
  code: string;
  max_uses: number;
  uses_count: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

interface Redemption {
  id: string;
  redeemed_at: string;
  user: {
    id: string;
    email: string;
    full_name: string | null;
  } | null;
}

export function InvitationCodesManager() {
  const [codes, setCodes] = useState<InvitationCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBackgroundLoading, setIsBackgroundLoading] = useState(false);

  // Form states
  const [codeVal, setCodeVal] = useState('');
  const [maxUses, setMaxUses] = useState(1);
  const [expiresAt, setExpiresAt] = useState('');
  
  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [filterActive, setFilterActive] = useState('all'); // all, active, inactive, expired, exhausted

  // Selected code for viewing redemptions details
  const [selectedCodeId, setSelectedCodeId] = useState<string | null>(null);
  const [selectedCodeVal, setSelectedCodeVal] = useState<string>('');
  const [selectedRedemptions, setSelectedRedemptions] = useState<Redemption[]>([]);
  const [isLoadingRedemptions, setIsLoadingRedemptions] = useState(false);

  // Load codes
  const fetchCodes = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    else setIsBackgroundLoading(true);

    try {
      const { data, error } = await supabase
        .from('invitation_codes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCodes(data || []);
    } catch (err) {
      console.error('Error fetching invitation_codes:', err);
    } finally {
      setIsLoading(false);
      setIsBackgroundLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCodes();
  }, [fetchCodes]);

  // Generate random code
  const handleGenerateRandomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'INV-';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCodeVal(result);
  };

  // Create code
  const handleCreateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeVal.trim()) return;

    setIsSubmitting(true);
    try {
      const formattedCode = codeVal.trim().toUpperCase();
      const payload = {
        code: formattedCode,
        max_uses: maxUses,
        is_active: true,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      };

      const { error } = await supabase
        .from('invitation_codes')
        .insert([payload]);

      if (error) {
        if (error.code === '23505') {
          alert('El código de invitación ya existe.');
        } else {
          throw error;
        }
        return;
      }

      setCodeVal('');
      setMaxUses(1);
      setExpiresAt('');
      await fetchCodes(true);
    } catch (err: unknown) {
      console.error('Error creating invitation code:', err);
      alert(err instanceof Error ? err.message : 'Error al crear el código.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle active status
  const handleToggleActive = async (id: string, currentVal: boolean) => {
    try {
      const { error } = await supabase
        .from('invitation_codes')
        .update({ is_active: !currentVal })
        .eq('id', id);

      if (error) throw error;
      await fetchCodes(true);
    } catch (err: unknown) {
      console.error('Error toggling code status:', err);
      alert(err instanceof Error ? err.message : 'Error al cambiar estado.');
    }
  };

  // Delete code
  const handleDeleteCode = async (id: string) => {
    if (!window.confirm('¿Estás seguro de eliminar este código? Se borrarán también todos sus registros de canje.')) return;

    try {
      const { error } = await supabase
        .from('invitation_codes')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      if (selectedCodeId === id) {
        setSelectedCodeId(null);
      }
      await fetchCodes(true);
    } catch (err: unknown) {
      console.error('Error deleting code:', err);
      alert(err instanceof Error ? err.message : 'Error al eliminar el código.');
    }
  };

  // Load redemptions details
  const handleViewRedemptions = async (codeId: string, codeStr: string) => {
    setSelectedCodeId(codeId);
    setSelectedCodeVal(codeStr);
    setIsLoadingRedemptions(true);
    setSelectedRedemptions([]);

    try {
      const { data, error } = await supabase
        .from('invitation_redemptions')
        .select(`
          id,
          redeemed_at,
          profiles (
            id,
            full_name,
            signup_ip
          )
        `)
        .eq('code_id', codeId)
        .order('redeemed_at', { ascending: false });

      if (error) throw error;

      // Extract details
      const formatted = (data || []).map((r: any) => {
        // Find if auth email is accessible or profiles has email/user details
        // Since profiles has full_name, we can map it
        return {
          id: r.id,
          redeemed_at: r.redeemed_at,
          user: {
            id: r.profiles?.id || '',
            email: r.profiles?.signup_ip || 'Usuario Registrado', // Fallback details
            full_name: r.profiles?.full_name || 'Sin nombre',
          }
        };
      });

      setSelectedRedemptions(formatted);
    } catch (err) {
      console.error('Error fetching redemptions:', err);
    } finally {
      setIsLoadingRedemptions(false);
    }
  };

  // Filter & Search
  const filteredCodes = codes.filter((item) => {
    const codeMatch = item.code.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (!codeMatch) return false;

    const now = new Date();
    const isExpired = item.expires_at ? new Date(item.expires_at) < now : false;
    const isExhausted = item.uses_count >= item.max_uses;

    if (filterActive === 'active') {
      return item.is_active && !isExpired && !isExhausted;
    }
    if (filterActive === 'inactive') {
      return !item.is_active;
    }
    if (filterActive === 'expired') {
      return isExpired;
    }
    if (filterActive === 'exhausted') {
      return isExhausted;
    }

    return true;
  });

  // Stats
  const stats = {
    total: codes.length,
    active: codes.filter(c => {
      const now = new Date();
      const isExpired = c.expires_at ? new Date(c.expires_at) < now : false;
      return c.is_active && !isExpired && c.uses_count < c.max_uses;
    }).length,
    totalUses: codes.reduce((acc, curr) => acc + curr.uses_count, 0)
  };

  const getStatusBadge = (item: InvitationCode) => {
    const now = new Date();
    const isExpired = item.expires_at ? new Date(item.expires_at) < now : false;
    const isExhausted = item.uses_count >= item.max_uses;

    if (!item.is_active) {
      return <span className="dt-badge dt-badge-danger">Inactivo</span>;
    }
    if (isExpired) {
      return <span className="dt-badge dt-badge-danger">Expirado</span>;
    }
    if (isExhausted) {
      return <span className="dt-badge dt-badge-info">Agotado</span>;
    }
    return <span className="dt-badge dt-badge-success">Activo</span>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Resumen de Tarjetas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div className="stat-card" style={{ background: '#ffffff', border: '1px solid var(--modern-border, #E6E2DA)', borderRadius: '12px', padding: '16px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--modern-text-secondary, #6B7280)', textTransform: 'uppercase' }}>Total Códigos</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '8px', color: 'var(--modern-text-primary, #1E1E1E)' }}>{stats.total}</div>
        </div>
        <div className="stat-card" style={{ background: '#ffffff', border: '1px solid var(--modern-border, #E6E2DA)', borderRadius: '12px', padding: '16px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--modern-text-secondary, #6B7280)', textTransform: 'uppercase' }}>Códigos Activos</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '8px', color: 'var(--orange-base, #d4621a)' }}>{stats.active}</div>
        </div>
        <div className="stat-card" style={{ background: '#ffffff', border: '1px solid var(--modern-border, #E6E2DA)', borderRadius: '12px', padding: '16px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--modern-text-secondary, #6B7280)', textTransform: 'uppercase' }}>Canjes Totales</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '8px', color: '#10B981' }}>{stats.totalUses}</div>
        </div>
      </div>

      {/* Grid Principal Formulario + Tabla */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', alignItems: 'flex-start' }}>
        
        {/* Formulario */}
        <div style={{ background: '#ffffff', border: '1px solid var(--modern-border, #E6E2DA)', borderRadius: '12px', padding: '20px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Ticket size={20} style={{ color: 'var(--orange-base)' }} />
            Crear Código de Invitación
          </h3>
          <form onSubmit={handleCreateCode} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--modern-text-secondary, #6B7280)' }}>Código</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="VIP-2026"
                  value={codeVal}
                  onChange={(e) => setCodeVal(e.target.value.toUpperCase())}
                  className="input-search"
                  style={{ flex: 1, borderRadius: '8px', height: '40px', padding: '0 12px', border: '1px solid var(--modern-border, #E6E2DA)' }}
                />
                <button
                  type="button"
                  onClick={handleGenerateRandomCode}
                  className="btn-modal-action secondary"
                  style={{ height: '40px', padding: '0 12px', whiteSpace: 'nowrap', borderRadius: '8px' }}
                >
                  Generar
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--modern-text-secondary, #6B7280)' }}>Usos Máximos</label>
              <input
                type="number"
                min={1}
                value={maxUses}
                onChange={(e) => setMaxUses(parseInt(e.target.value) || 1)}
                className="input-search"
                style={{ borderRadius: '8px', height: '40px', padding: '0 12px', border: '1px solid var(--modern-border, #E6E2DA)' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--modern-text-secondary, #6B7280)' }}>Fecha Expiración (Opcional)</label>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="input-search"
                style={{ borderRadius: '8px', height: '40px', padding: '0 12px', border: '1px solid var(--modern-border, #E6E2DA)' }}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !codeVal.trim()}
              className="btn-modal-action primary"
              style={{
                width: '100%',
                height: '42px',
                borderRadius: '8px',
                marginTop: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              {isSubmitting ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
              Crear Código
            </button>
          </form>
        </div>

        {/* Listado de Códigos */}
        <div style={{ background: '#ffffff', border: '1px solid var(--modern-border, #E6E2DA)', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Listado de Códigos</h3>
            <button
              type="button"
              className="dt-reload-btn"
              onClick={() => fetchCodes(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={14} className={isBackgroundLoading ? 'spin' : ''} />
              Refrescar
            </button>
          </div>

          {/* Filtros */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '150px' }}>
              <input
                type="text"
                placeholder="Buscar código..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  height: '36px',
                  borderRadius: '6px',
                  border: '1px solid var(--modern-border, #E6E2DA)',
                  paddingLeft: '32px',
                  fontSize: '0.8rem'
                }}
              />
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '11px', color: '#9CA3AF' }} />
            </div>
            <select
              value={filterActive}
              onChange={(e) => setFilterActive(e.target.value)}
              style={{
                height: '36px',
                borderRadius: '6px',
                border: '1px solid var(--modern-border, #E6E2DA)',
                padding: '0 8px',
                fontSize: '0.8rem'
              }}
            >
              <option value="all">Todos los Estados</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
              <option value="expired">Expirados</option>
              <option value="exhausted">Agotados</option>
            </select>
          </div>

          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '30px' }}>
              <Loader2 className="spin" size={24} style={{ color: 'var(--orange-base)' }} />
            </div>
          ) : filteredCodes.length > 0 ? (
            <div className="table-responsive" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table className="dt-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Estado</th>
                    <th>Canjes</th>
                    <th>Expiración</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCodes.map((item) => (
                    <tr key={item.id} style={{ cursor: 'pointer' }} onClick={() => handleViewRedemptions(item.id, item.code)}>
                      <td style={{ fontWeight: 700, color: 'var(--modern-text-primary, #1E1E1E)' }}>{item.code}</td>
                      <td>{getStatusBadge(item)}</td>
                      <td style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                        {item.uses_count} / {item.max_uses}
                      </td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--modern-text-secondary)' }}>
                        {item.expires_at ? new Date(item.expires_at).toLocaleDateString('es-CO') : 'Nunca'}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(item.id, item.is_active)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                            title={item.is_active ? 'Desactivar' : 'Activar'}
                          >
                            {item.is_active ? (
                              <ToggleRight size={20} style={{ color: 'var(--orange-base)' }} />
                            ) : (
                              <ToggleLeft size={20} style={{ color: '#9CA3AF' }} />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCode(item.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                            title="Eliminar"
                          >
                            <Trash2 size={16} style={{ color: '#EF4444' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--modern-text-secondary)', fontSize: '0.85rem' }}>
              No se encontraron códigos de invitación.
            </div>
          )}
        </div>
      </div>

      {/* Detalles de Redenciones en la parte inferior */}
      {selectedCodeId && (
        <div style={{ background: '#ffffff', border: '1px solid var(--modern-border, #E6E2DA)', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>
              Canjes para el código: <span style={{ color: 'var(--orange-base)' }}>{selectedCodeVal}</span>
            </h3>
            <button
              type="button"
              className="dt-inline-action"
              onClick={() => setSelectedCodeId(null)}
              style={{ fontSize: '0.75rem' }}
            >
              Cerrar Detalles
            </button>
          </div>

          {isLoadingRedemptions ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
              <Loader2 className="spin" size={20} style={{ color: 'var(--orange-base)' }} />
            </div>
          ) : selectedRedemptions.length > 0 ? (
            <div className="table-responsive">
              <table className="dt-table">
                <thead>
                  <tr>
                    <th>Usuario (Nombre)</th>
                    <th>Fecha de Canje</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRedemptions.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.user?.full_name}</td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--modern-text-secondary)' }}>
                        {new Date(r.redeemed_at).toLocaleString('es-CO')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ fontSize: '0.85rem', color: 'var(--modern-text-secondary)', padding: '10px' }}>
              Nadie ha canjeado este código todavía.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
