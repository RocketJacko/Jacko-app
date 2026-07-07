import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Trash2, Plus, Upload, Key, RefreshCw, Search, Check, ShieldAlert } from 'lucide-react';
import './admin-components.css';

interface PricingPlan {
  id: string;
  name: string;
  price_cop?: number;
}

interface Product {
  id: string;
  title: string;
  plans: PricingPlan[] | null;
}

interface Credential {
  id: string;
  created_at: string;
  email: string;
  status: 'unassigned' | 'assigned' | 'blocked';
  assigned_user_id?: string | null;
  product_id?: string | null;
  plan_id?: string | null;
}

export function PoolCorreosManager() {
  const [products, setProducts] = useState<Product[]>([]);
  const [pool, setPool] = useState<Credential[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Role checking
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isCheckingRole, setIsCheckingRole] = useState(true);

  // Form states
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState(''); // Selected plan for uploading
  const [isBulk, setIsBulk] = useState(false);
  const [singleEmail, setSingleEmail] = useState('');

  // Filters & Search
  const [filterProductId, setFilterProductId] = useState('all');
  const [filterPlanId, setFilterPlanId] = useState('all');
  const [filterEstado, setFilterEstado] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get selected product object
  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const filterProduct = products.find((p) => p.id === filterProductId);

  // Load products from DB
  const fetchProducts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('products_with_plans')
        .select('id, title, plans')
        .order('title', { ascending: true });
      if (error) throw error;
      setProducts(data || []);
    } catch (err) {
      console.error('Error fetching products:', err);
    }
  }, []);

  // Load pool
  const fetchPool = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('email_pool')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPool(data || []);
    } catch (err) {
      console.error('Error fetching email_pool:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check super_admin role
  useEffect(() => {
    let active = true;
    const checkRole = async () => {
      try {
        const { data, error } = await supabase.rpc('get_my_access');
        if (error) throw error;
        if (active && data && data.length > 0) {
          setIsSuperAdmin(!!data[0].is_admin || !!data[0].is_super_admin);
        }
      } catch (err) {
        console.error('Error checking user role:', err);
      } finally {
        if (active) setIsCheckingRole(false);
      }
    };
    checkRole();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      await Promise.resolve();
      if (active) {
        await Promise.all([fetchProducts(), fetchPool()]);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [fetchProducts, fetchPool]);

  // Carga Individual
  const handleAddSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) {
      alert('Por favor selecciona un producto primero.');
      return;
    }

    const emailStr = singleEmail.trim().toLowerCase();
    if (!emailStr || !emailStr.includes('@')) {
      alert('Ingresa un correo electrónico válido.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: existing } = await supabase
        .from('email_pool')
        .select('id')
        .eq('email', emailStr)
        .maybeSingle();

      if (existing) {
        alert(`El correo "${emailStr}" ya se encuentra registrado.`);
        setIsSubmitting(false);
        return;
      }

      const payload = {
        email: emailStr,
        product_id: selectedProductId,
        plan_id: selectedPlanId || null,
        status: 'unassigned' as const,
      };

      const { error } = await supabase.from('email_pool').insert([payload]);
      if (error) throw error;

      await supabase.rpc('admin_log_action', {
        _action: 'add_pool_correo_individual',
        _target_table: 'email_pool',
        _target_id: null,
        _payload: payload,
      });

      setSingleEmail('');
      await fetchPool();
      alert('Correo agregado exitosamente.');
    } catch (err) {
      console.error(err);
      alert('Error al agregar el correo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Carga Masiva CSV
  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedProductId) {
      alert('Por favor selecciona un producto primero.');
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r?\n/);
      const emails: string[] = [];

      for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        const parts = line.split(/[,;]/);
        const email = parts[0].trim().toLowerCase();

        if (email && email.includes('@')) {
          emails.push(email);
        }
      }

      if (emails.length === 0) {
        alert('No se encontraron correos válidos en el archivo CSV.');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      setIsSubmitting(true);
      try {
        const { data: existingRows, error: checkError } = await supabase
          .from('email_pool')
          .select('email')
          .in('email', emails);

        if (checkError) throw checkError;

        const existingEmails = new Set(existingRows?.map((r) => r.email) || []);
        const newEmails = emails.filter((email) => !existingEmails.has(email));

        if (newEmails.length === 0) {
          alert('Todos los correos del CSV ya existen en el pool.');
          if (fileInputRef.current) fileInputRef.current.value = '';
          setIsSubmitting(false);
          return;
        }

        const payloads = newEmails.map((email) => ({
          email,
          product_id: selectedProductId,
          plan_id: selectedPlanId || null,
          status: 'unassigned' as const,
        }));

        const { error: insertError } = await supabase.from('email_pool').insert(payloads);
        if (insertError) throw insertError;

        await supabase.rpc('admin_log_action', {
          _action: 'bulk_upload_emails',
          _target_table: 'email_pool',
          _target_id: null,
          _payload: { count: payloads.length, plan_id: selectedPlanId || null },
        });

        alert(
          `Carga completada:\n- Nuevos: ${newEmails.length}\n- Omitidos por duplicado: ${
            emails.length - newEmails.length
          }`
        );
        if (fileInputRef.current) fileInputRef.current.value = '';
        await fetchPool();
      } catch (err) {
        console.error(err);
        alert('Error al realizar la carga masiva.');
      } finally {
        setIsSubmitting(false);
      }
    };
    reader.readAsText(file);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Estás seguro de eliminar este correo del pool?')) return;
    setIsLoading(true);
    try {
      const { error } = await supabase.from('email_pool').delete().eq('id', id);
      if (error) throw error;
      await supabase.rpc('admin_log_action', {
        _action: 'delete_pool_correo',
        _target_table: 'email_pool',
        _target_id: null,
        _payload: { deleted_correo_id: id },
      });
      await fetchPool();
    } catch (err) {
      console.error(err);
      alert('Error al eliminar correo.');
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to map plan_id and product_id to Product Title and Plan Name
  const getProductAndPlanInfo = (planId?: string | null, productId?: string | null) => {
    if (!planId && !productId) {
      return { product: 'General (Fallback)', plan: 'Global' };
    }
    const prod = productId ? products.find((p) => p.id === productId) : null;
    if (prod) {
      if (!planId) {
        return { product: prod.title, plan: 'General' };
      }
      const plan = prod.plans?.find((p) => p.id === planId);
      return { product: prod.title, plan: plan ? plan.name : planId };
    }
    if (planId) {
      for (const p of products) {
        const plan = p.plans?.find((x) => x.id === planId);
        if (plan) {
          return { product: p.title, plan: plan.name };
        }
      }
    }
    return { product: 'General (Fallback)', plan: 'Global' };
  };

  // Handle product select change
  const handleProductChange = (productId: string) => {
    setSelectedProductId(productId);
    setSelectedPlanId(''); // Reset plan
  };

  // Filter & Search pool correos
  const filteredPool = pool.filter((item) => {
    const matchesSearch = item.email.toLowerCase().includes(searchQuery.toLowerCase());
    // Product filtering logic
    let matchesProduct = true;
    if (filterProductId !== 'all') {
      const info = getProductAndPlanInfo(item.plan_id, item.product_id);
      const prod = products.find((p) => p.id === filterProductId);
      matchesProduct = info.product === prod?.title;
    }
    // Plan filtering logic
    let matchesPlan = true;
    if (filterPlanId !== 'all') {
      if (filterPlanId === 'null') {
        matchesPlan = !item.plan_id;
      } else {
        matchesPlan = item.plan_id === filterPlanId;
      }
    }
    const matchesEstado = filterEstado === 'all' || item.status === filterEstado;
    return matchesSearch && matchesProduct && matchesPlan && matchesEstado;
  });

  const stats = {
    total: pool.length,
    available: pool.filter((c) => c.status === 'unassigned').length,
    assigned: pool.filter((c) => c.status === 'assigned').length,
  };

  if (isCheckingRole) {
    return (
      <div style={{ padding: '3rem 0', textAlign: 'center' }}>
        <div className="loading-spinner" style={{ margin: '0 auto 12px auto' }}></div>
        <p>Verificando permisos de administrador...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Resumen de estadísticas */}
      <div
        className="stats-row"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}
      >
        <div
          className="stat-card"
          style={{
            background: '#ffffff',
            border: '1px solid var(--beige-dark)',
            padding: '20px',
            borderRadius: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            minHeight: 'auto',
          }}
        >
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', opacity: 0.6 }}>
              Total Correos
            </span>
            <h3 style={{ margin: '4px 0 0 0', fontSize: '1.8rem', fontWeight: 900 }}>{stats.total}</h3>
          </div>
          <div className="activity-icon-container">
            <Key size={20} />
          </div>
        </div>

        <div
          className="stat-card"
          style={{
            background: '#ffffff',
            border: '1px solid var(--beige-dark)',
            padding: '20px',
            borderRadius: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            minHeight: 'auto',
          }}
        >
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', opacity: 0.6 }}>
              Disponibles
            </span>
            <h3 style={{ margin: '4px 0 0 0', fontSize: '1.8rem', fontWeight: 900 }}>{stats.available}</h3>
          </div>
          <div className="activity-icon-container" style={{ color: '#16a34a', background: 'rgba(22, 163, 74, 0.1)' }}>
            <Check size={20} />
          </div>
        </div>

        <div
          className="stat-card"
          style={{
            background: '#ffffff',
            border: '1px solid var(--beige-dark)',
            padding: '20px',
            borderRadius: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            minHeight: 'auto',
          }}
        >
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', opacity: 0.6 }}>
              Asignados
            </span>
            <h3 style={{ margin: '4px 0 0 0', fontSize: '1.8rem', fontWeight: 900 }}>{stats.assigned}</h3>
          </div>
          <div className="activity-icon-container">
            <RefreshCw size={20} />
          </div>
        </div>
      </div>

      {!isSuperAdmin ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px',
            padding: '3rem',
            textAlign: 'center',
            background: 'rgba(231, 76, 60, 0.08)',
            border: '1px solid rgba(231, 76, 60, 0.3)',
            borderRadius: '24px',
            color: '#e74c3c',
          }}
        >
          <ShieldAlert size={48} />
          <h3 style={{ margin: 0, fontWeight: 800, fontSize: '1.3rem' }}>Acceso Restringido</h3>
          <p style={{ margin: 0, opacity: 0.8 }}>
            Solo los Super Administradores tienen autorización para agregar, modificar o subir archivos CSV al pool de correos.
          </p>
        </div>
      ) : (
        <>
          {/* Panel de Carga */}
          <div
            className="admin-editor-card"
            style={{
              background: '#ffffff',
              border: '1.5px solid var(--beige-dark)',
              padding: '24px',
              borderRadius: '20px',
            }}
          >
            <div
              className="admin-editor-header"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
                borderBottom: '1px solid var(--beige-light)',
                paddingBottom: '12px',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <h3 style={{ fontSize: '1.2rem', margin: 0, fontWeight: 800 }}>
                Cargar Nuevos Correos al Inventario
              </h3>
              <div className="auth-toggle-container" style={{ margin: 0 }}>
                <button
                  type="button"
                  className={`auth-toggle-btn${!isBulk ? ' active' : ''}`}
                  onClick={() => setIsBulk(false)}
                >
                  Carga Individual
                </button>
                <button
                  type="button"
                  className={`auth-toggle-btn${isBulk ? ' active' : ''}`}
                  onClick={() => setIsBulk(true)}
                >
                  Carga Masiva (CSV)
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="admin-form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {/* Selector de Producto */}
                <div className="form-group">
                  <label htmlFor="upload-product" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>
                    Seleccionar Producto *
                  </label>
                  <select
                    id="upload-product"
                    value={selectedProductId}
                    onChange={(e) => handleProductChange(e.target.value)}
                    required
                    style={{ width: '100%', padding: '12px', border: '1.5px solid var(--beige-dark)', borderRadius: '10px' }}
                  >
                    <option value="">-- Selecciona un Producto --</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Selector de Plan */}
                <div className="form-group">
                  <label htmlFor="upload-plan" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>
                    Asignar a Plan del Producto
                  </label>
                  <select
                    id="upload-plan"
                    value={selectedPlanId}
                    onChange={(e) => setSelectedPlanId(e.target.value)}
                    disabled={!selectedProductId}
                    style={{ width: '100%', padding: '12px', border: '1.5px solid var(--beige-dark)', borderRadius: '10px' }}
                  >
                    <option value="">General (Todos los planes de este producto)</option>
                    {selectedProduct?.plans?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.id})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginTop: '-0.5rem', fontSize: '0.8rem', opacity: 0.7, fontWeight: 600 }}>
                Al asociar un correo a un plan, el disparador automático lo entregará únicamente cuando un usuario compre ese plan específico de ese producto.
              </div>

              {!isBulk ? (
                <form onSubmit={handleAddSingle} style={{ marginTop: '0.5rem' }}>
                  <label htmlFor="single-email-input" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>
                    Correo Electrónico
                  </label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                      id="single-email-input"
                      type="email"
                      value={singleEmail}
                      onChange={(e) => setSingleEmail(e.target.value)}
                      placeholder="ejemplo@correo.com"
                      required
                      disabled={!selectedProductId}
                      style={{ flex: 1, padding: '12px', border: '1.5px solid var(--beige-dark)', borderRadius: '10px' }}
                    />
                    <button
                      type="submit"
                      className="btn-add-plan"
                      disabled={isSubmitting || !selectedProductId}
                      style={{ minHeight: '45px', padding: '0 24px', display: 'inline-flex', alignItems: 'center', gap: '6px', margin: 0 }}
                    >
                      {isSubmitting ? <RefreshCw size={16} className="spin" /> : <Plus size={16} />}
                      Agregar Correo
                    </button>
                  </div>
                </form>
              ) : (
                <div style={{ marginTop: '0.5rem' }}>
                  <label htmlFor="input-gen-3ti9nx" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>
                    Seleccionar Archivo CSV
                  </label>
                  <div>
                    <input
                      id="input-gen-3ti9nx"
                      aria-label="Archivo CSV"
                      type="file"
                      ref={fileInputRef}
                      accept=".csv"
                      onChange={handleCSVUpload}
                      style={{ display: 'none' }}
                      disabled={isSubmitting || !selectedProductId}
                    />
                    <button
                      type="button"
                      className="btn-add-plan"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isSubmitting || !selectedProductId}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', margin: 0 }}
                    >
                      {isSubmitting ? (
                        <>
                          <RefreshCw size={16} className="spin" /> Procesando CSV e Insertando Registros...
                        </>
                      ) : (
                        <>
                          <Upload size={16} />
                          {selectedProductId
                            ? 'Subir Archivo CSV (.csv)'
                            : 'Selecciona un producto primero'}
                        </>
                      )}
                    </button>
                  </div>
                  <span style={{ marginTop: '8px', display: 'block', lineHeight: '1.4', fontSize: '0.75rem', opacity: 0.6 }}>
                    Sube un archivo delimitado por comas (CSV) que contenga los correos electrónicos en la primera columna. El sistema omitirá automáticamente las direcciones repetidas.
                  </span>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Listado y Filtros */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1.1rem', margin: 0, fontWeight: 800 }}>
            Listado del Pool de Correos
          </h3>
          <button
            type="button"
            className="refresh-btn"
            onClick={fetchPool}
            disabled={isLoading}
            title="Actualizar"
          >
            <RefreshCw size={16} className={isLoading ? 'spin' : ''} />
          </button>
        </div>

        {/* Fila de Filtros */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '12px',
          }}
        >
          <div>
            <label htmlFor="filter-search" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>
              Buscar Correo
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="filter-search"
                type="text"
                placeholder="Buscar por email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '10px 10px 10px 32px', border: '1.5px solid var(--beige-dark)', borderRadius: '10px' }}
              />
              <Search
                size={14}
                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}
              />
            </div>
          </div>

          <div>
            <label htmlFor="filter-product" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>
              Filtrar por Producto
            </label>
            <select
              id="filter-product"
              value={filterProductId}
              onChange={(e) => {
                setFilterProductId(e.target.value);
                setFilterPlanId('all');
              }}
              style={{ width: '100%', padding: '10px', border: '1.5px solid var(--beige-dark)', borderRadius: '10px' }}
            >
              <option value="all">Todos los productos</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-plan" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>
              Filtrar por Plan
            </label>
            <select
              id="filter-plan"
              value={filterPlanId}
              onChange={(e) => setFilterPlanId(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1.5px solid var(--beige-dark)', borderRadius: '10px' }}
            >
              <option value="all">Todos los planes</option>
              <option value="null">General / Sin plan</option>
              {filterProductId !== 'all' &&
                filterProduct?.plans?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.id})
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-status" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>
              Filtrar por Estado
            </label>
            <select
              id="filter-status"
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1.5px solid var(--beige-dark)', borderRadius: '10px' }}
            >
              <option value="all">Todos los estados</option>
              <option value="unassigned">Sin Asignar</option>
              <option value="assigned">Asignado</option>
              <option value="blocked">Bloqueado</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div style={{ padding: '2rem 0', textAlign: 'center' }}>
            <div className="loading-spinner" style={{ margin: '0 auto 12px auto' }}></div>
            <p>Cargando correos del inventario...</p>
          </div>
        ) : filteredPool.length > 0 ? (
          <div className="dt-container">
            <div className="dt-table-wrapper">
              <table className="dt-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Producto</th>
                    <th>Plan Asignado</th>
                    <th>Estado</th>
                    <th>Fecha Carga</th>
                    <th>Usuario Asignado</th>
                    {isSuperAdmin && <th style={{ textAlign: 'right' }}>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredPool.map((item) => {
                    const info = getProductAndPlanInfo(item.plan_id, item.product_id);
                    return (
                      <tr key={item.id}>
                        <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{item.email}</td>
                        <td style={{ fontWeight: 600 }}>{info.product}</td>
                        <td>
                          {item.plan_id ? (
                            <span
                              style={{
                                background: '#fef3c7',
                                color: '#b45309',
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                              }}
                            >
                              {info.plan} ({item.plan_id})
                            </span>
                          ) : (
                            <span
                              style={{
                                background: '#f1f5f9',
                                color: '#475569',
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                              }}
                            >
                              General
                            </span>
                          )}
                        </td>
                        <td>
                          <span
                            className={`dt-badge ${
                              item.status === 'unassigned'
                                ? 'dt-badge-warning'
                                : item.status === 'assigned'
                                ? 'dt-badge-success'
                                : 'dt-badge-danger'
                            }`}
                          >
                            {item.status === 'unassigned'
                              ? 'sin asignar'
                              : item.status === 'assigned'
                              ? 'asignado'
                              : 'bloqueado'}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                          {new Date(item.created_at).toLocaleDateString('es-CO')}
                        </td>
                        <td style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>
                          {item.assigned_user_id ? item.assigned_user_id.slice(0, 8) + '...' : '—'}
                        </td>
                        {isSuperAdmin && (
                          <td style={{ textAlign: 'right' }}>
                            {item.status === 'unassigned' ? (
                              <button
                                type="button"
                                className="dt-row-btn danger"
                                onClick={() => handleDelete(item.id)}
                                title="Eliminar correo del pool"
                              >
                                <Trash2 size={14} />
                              </button>
                            ) : (
                              <span style={{ fontSize: '0.75rem', opacity: 0.5, fontStyle: 'italic', paddingRight: '8px' }}>
                                En uso
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="dt-table-footer">
              <span className="dt-total-count">
                {filteredPool.length} correos encontrados en el filtro
              </span>
            </div>
          </div>
        ) : (
          <div className="empty-panel-state" style={{ textAlign: 'center', padding: '40px 20px', border: '2px dashed var(--beige-dark)', borderRadius: '20px' }}>
            <Key size={32} style={{ opacity: 0.5, marginBottom: '10px' }} />
            <p style={{ margin: 0, opacity: 0.7 }}>
              No hay correos registrados que coincidan con la búsqueda o filtros.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}