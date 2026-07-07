import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { invalidateCacheByPrefix } from '../../lib/queryCache';
import { 
  Plus, Pencil, Trash2, RefreshCw, AlertTriangle, 
  ShoppingBag, FolderPlus, Key, Upload, ChevronLeft, Search,
  CreditCard, ChevronDown
} from 'lucide-react';
import { PaymentMethodsManager } from './PaymentMethodsManager';
import { ProductEditor } from './ProductEditor';
import './admin-components.css';

export interface AccordionItem {
  title: string;
  content: string;
  items: string[];
}

export interface PricingPlan {
  id: string;
  name: string;
  price_cop: number;
  price_usd?: number | null;
  points_price: number;
  short_description: string;
  description: string;
  require_new_account?: boolean;
  bulk_pricing?: Record<string, number> | null;
  accordions?: AccordionItem[] | null;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

export interface Product {
  id: string;
  category_id: string | null;
  title: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  thumbnail_url: string | null;
  file_path: string | null;
  external_url: string | null;
  credentials: string | null;
  price_cop: number | null;
  price_usd?: number | null;
  points_price: number | null;
  is_active: boolean;
  stock: number | null;
  created_at: string;
  visibility?: string;
  payment_modes?: string;
  accordions?: AccordionItem[] | null;
  plans?: PricingPlan[] | null;
  categories?: {
    name: string;
    slug: string;
  } | null;
}

interface Credential {
  id: string;
  created_at: string;
  email: string;
  status: 'unassigned' | 'assigned' | 'blocked';
  assigned_user_id?: string | null;
  plan_id?: string | null;
}

export function CatalogManager() {
  const [activeSubTab, setActiveSubTab] = useState<'products' | 'categories' | 'payments'>('products');
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  
  // Modals / Editors
  const [editingProduct, setEditingProduct] = useState<Product | 'new' | null>(null);
  const [editingPoolProduct, setEditingPoolProduct] = useState<Product | null>(null);

  // New filters and selection states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategorySlug, setSelectedCategorySlug] = useState('all');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);

  // Cargar Categorías
  const fetchCategories = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      setCategories(data || []);
    } catch (err: unknown) {
      console.error('Error fetching categories:', err);
    }
  }, []);

  // Cargar Productos
  const fetchProducts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('products_with_plans')
        .select('*, categories(name, slug)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setProducts(data || []);
    } catch (err: unknown) {
      console.error('Error fetching products:', err);
    }
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      await Promise.all([fetchCategories(), fetchProducts()]);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al cargar los datos.');
    } finally {
      setIsLoading(false);
    }
  }, [fetchCategories, fetchProducts]);

  useEffect(() => {
    let active = true;
    const fetchAsync = async () => {
      await Promise.resolve();
      if (active) {
        await loadData();
      }
    };
    fetchAsync();
    return () => {
      active = false;
    };
  }, [loadData]);

  // CRUD Categorías
  const handleSaveCategory = async (name: string, slug: string) => {
    setIsLoading(true);
    try {
      const payload = { name, slug: slug.toLowerCase(), is_active: true };
      const { error } = await supabase.from('categories').insert([payload]);
      if (error) throw error;

      await supabase.rpc('admin_log_action', {
        _action: 'create_category',
        _target_table: 'categories',
        _target_id: null,
        _payload: payload
      });

      invalidateCacheByPrefix('catalog_products');
      await fetchCategories();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al guardar categoría.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    if (!window.confirm(`¿Estás seguro de eliminar permanentemente la categoría "${name}"? Todos los productos asociados perderán su categoría.`)) {
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;

      await supabase.rpc('admin_log_action', {
        _action: 'delete_category',
        _target_table: 'categories',
        _target_id: null,
        _payload: { deleted_id: id, name }
      });

      invalidateCacheByPrefix('catalog_products');
      await fetchCategories();
      await fetchProducts();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al eliminar categoría.');
    } finally {
      setIsLoading(false);
    }
  };

  // CRUD Productos
  const handleSaveProduct = async (productData: Partial<Product>) => {
    setIsLoading(true);
    try {
      const payload = {
        title: productData.title?.trim(),
        slug: productData.slug?.trim(),
        category_id: productData.category_id || null,
        short_description: productData.short_description?.trim() || null,
        description: productData.description?.trim() || null,
        price_cop: (productData.price_cop !== undefined && productData.price_cop !== null) ? Number(productData.price_cop) : 0,
        points_price: (productData.points_price !== undefined && productData.points_price !== null) ? Number(productData.points_price) : null,
        stock: productData.stock !== undefined && productData.stock !== null ? Number(productData.stock) : null,
        is_active: !!productData.is_active,
        thumbnail_url: productData.thumbnail_url?.trim() || null,
        file_path: productData.file_path?.trim() || null,
        external_url: productData.external_url?.trim() || null,
        credentials: productData.credentials?.trim() || null,
        accordions: productData.accordions || null,
        plans: productData.plans || null,
        visibility: productData.visibility || 'public',
      };

      if (!payload.title || !payload.slug) {
        throw new Error('El título y el slug son obligatorios.');
      }

      const { plans: plansPayload, ...productPayload } = payload;

      const { data: savedProductId, error: rpcError } = await supabase.rpc('save_product_with_plans', {
        p_product_id: (editingProduct && editingProduct !== 'new') ? editingProduct.id : null,
        p_product_data: productPayload,
        p_plans_data: plansPayload || null
      });

      if (rpcError) throw rpcError;

      await supabase.rpc('admin_log_action', {
        _action: (editingProduct && editingProduct === 'new') ? 'create_product' : 'update_product',
        _target_table: 'products',
        _target_id: savedProductId,
        _payload: payload
      });

      invalidateCacheByPrefix('catalog_products');
      setEditingProduct(null);
      await fetchProducts();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al guardar el producto.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteProduct = async (id: string, title: string) => {
    if (!window.confirm(`¿Estás seguro de eliminar el producto "${title}"? Esta acción borrará registros históricos.`)) {
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;

      await supabase.rpc('admin_log_action', {
        _action: 'delete_product',
        _target_table: 'products',
        _target_id: null,
        _payload: { deleted_id: id, title }
      });

      invalidateCacheByPrefix('catalog_products');
      setSelectedProducts(prev => prev.filter(pId => pId !== id));
      await fetchProducts();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al eliminar el producto.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleActiveProduct = async (prod: Product) => {
    const newStatus = !prod.is_active;
    
    // Optimistic local state update to prevent UI layout shift or scroll resetting
    setProducts(prev => prev.map(p => p.id === prod.id ? { ...p, is_active: newStatus } : p));

    try {
      const { error } = await supabase
        .from('products')
        .update({ is_active: newStatus })
        .eq('id', prod.id);

      if (error) {
        // Rollback state if database update fails
        setProducts(prev => prev.map(p => p.id === prod.id ? { ...p, is_active: !newStatus } : p));
        throw error;
      }

      await supabase.rpc('admin_log_action', {
        _action: newStatus ? 'activate_product' : 'deactivate_product',
        _target_table: 'products',
        _target_id: prod.id,
        _payload: { id: prod.id, is_active: newStatus }
      });

      invalidateCacheByPrefix('catalog_products');
    } catch (err: unknown) {
      alert('Error al cambiar el estado del producto: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleDeleteMultipleProducts = async () => {
    if (selectedProducts.length === 0) return;

    if (!window.confirm(`¿Estás seguro de eliminar permanentemente los ${selectedProducts.length} productos seleccionados? Esta acción borrará registros históricos.`)) {
      return;
    }
    setIsLoading(true);
    try {
      const productsToDelete = products.filter(p => selectedProducts.includes(p.id));
      const deletedTitles = productsToDelete.map(p => p.title).join(', ');

      const { error } = await supabase
        .from('products')
        .delete().in('id', selectedProducts);
        
      if (error) throw error;

      await supabase.rpc('admin_log_action', {
        _action: 'delete_multiple_products',
        _target_table: 'products',
        _target_id: null,
        _payload: { deleted_ids: selectedProducts, titles: deletedTitles }
      });

      invalidateCacheByPrefix('catalog_products');
      setSelectedProducts([]);
      await fetchProducts();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al eliminar los productos seleccionados.');
    } finally {
      setIsLoading(false);
    }
  };

  // Product filtering and selection handlers
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedProducts(filteredProducts.map(p => p.id));
    } else {
      setSelectedProducts([]);
    }
  };

  const handleSelectOne = (prodId: string, checked: boolean) => {
    if (checked) {
      setSelectedProducts([...selectedProducts, prodId]);
    } else {
      setSelectedProducts(selectedProducts.filter(id => id !== prodId));
    }
  };

  const filteredProducts = products.filter(prod => {
    const matchesSearch = prod.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (prod.short_description && prod.short_description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (prod.description && prod.description.toLowerCase().includes(searchQuery.toLowerCase()));
      
    if (!matchesSearch) return false;
    
    if (selectedCategorySlug === 'all') return true;
    return prod.categories?.slug === selectedCategorySlug;
  });

  return (
    <div className="catalog-manager-root">
      {editingProduct !== null ? (
        <ProductEditor
          product={editingProduct === 'new' ? null : editingProduct}
          categories={categories}
          onSave={handleSaveProduct}
          onCancel={() => setEditingProduct(null)}
        />
      ) : editingPoolProduct !== null ? (
        <CredentialsPoolManager
          product={editingPoolProduct}
          onBack={() => setEditingPoolProduct(null)}
        />
      ) : (
        <>
          <div className="catalog-subnav">
            <button type="button" 
              className={`subnav-btn ${activeSubTab === 'products' ? 'active' : ''}`}
              onClick={() => { setActiveSubTab('products'); setSelectedProducts([]); setSelectedCategorySlug('all'); setSearchQuery(''); }}
            >
              <ShoppingBag size={14} /> Productos
            </button>
            <button type="button" 
              className={`subnav-btn ${activeSubTab === 'categories' ? 'active' : ''}`}
              onClick={() => { setActiveSubTab('categories'); setSelectedProducts([]); }}
            >
              <FolderPlus size={14} /> Categorías
            </button>
            <button type="button" 
              className={`subnav-btn ${activeSubTab === 'payments' ? 'active' : ''}`}
              onClick={() => { setActiveSubTab('payments'); setSelectedProducts([]); }}
            >
              <CreditCard size={14} /> Medios de Pago
            </button>
          </div>

          {errorMsg && (
            <div className="admin-error-banner" style={{ marginBottom: '1.5rem' }}>
              <AlertTriangle size={18} />
              <p>{errorMsg}</p>
            </div>
          )}

          {activeSubTab === 'products' ? (
            <ProductsSection
              categories={categories}
              filteredProducts={filteredProducts}
              selectedProducts={selectedProducts}
              selectedCategorySlug={selectedCategorySlug}
              searchQuery={searchQuery}
              isLoading={isLoading}
              onCategoryChange={setSelectedCategorySlug}
              onSearchChange={setSearchQuery}
              onNewProduct={() => setEditingProduct('new')}
              onDeleteMultiple={handleDeleteMultipleProducts}
              onRefresh={loadData}
              onSelectAll={handleSelectAll}
              onSelectOne={handleSelectOne}
              onToggleActive={handleToggleActiveProduct}
              onEditPool={setEditingPoolProduct}
              onEditProduct={setEditingProduct}
              onDeleteProduct={handleDeleteProduct}
            />
          ) : activeSubTab === 'categories' ? (
            <CategoriesSection 
              categories={categories} 
              onSaveCategory={handleSaveCategory}
              onDeleteCategory={handleDeleteCategory}
              isLoading={isLoading}
            />
          ) : (
            <PaymentMethodsManager />
          )}
        </>
      )}
    </div>
  );
}


// Props para la sección de productos
interface ProductsSectionProps {
  categories: Category[];
  filteredProducts: Product[];
  selectedProducts: string[];
  selectedCategorySlug: string;
  searchQuery: string;
  isLoading: boolean;
  onCategoryChange: (slug: string) => void;
  onSearchChange: (query: string) => void;
  onNewProduct: () => void;
  onDeleteMultiple: () => void;
  onRefresh: () => void;
  onSelectAll: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSelectOne: (id: string, checked: boolean) => void;
  onToggleActive: (prod: Product) => void;
  onEditPool: (prod: Product) => void;
  onEditProduct: (prod: Product) => void;
  onDeleteProduct: (id: string, title: string) => void;
}

function ProductsSection({
  categories, filteredProducts, selectedProducts, selectedCategorySlug,
  searchQuery, isLoading, onCategoryChange, onSearchChange, onNewProduct,
  onDeleteMultiple, onRefresh, onSelectAll, onSelectOne,
  onToggleActive, onEditPool, onEditProduct, onDeleteProduct,
}: ProductsSectionProps) {
  return (
    <div className="products-admin-section">
      <div className="dt-container">
        <div className="dt-filter-bar">
          <div className="paypal-filter-select-wrapper">
            <select
              className="paypal-filter-select"
              aria-label="Filtrar por categoría"
              value={selectedCategorySlug}
              onChange={(e) => onCategoryChange(e.target.value)}
            >
              <option value="all">Todas las Categorías</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.slug}>{cat.name}</option>
              ))}
            </select>
            <span className="paypal-filter-select-arrow"><ChevronDown size={14} /></span>
          </div>

          <div className="paypal-search-wrapper" style={{ flex: 1, borderLeft: '1.5px solid var(--beige-dark)', paddingLeft: '16px' }}>
            <span className="paypal-search-icon" style={{ opacity: 0.6, display: 'flex', alignItems: 'center' }}>
              <Search size={16} />
            </span>
            <input
              type="text"
              placeholder="Buscar producto..."
              aria-label="Buscar producto"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="paypal-search-input"
              style={{ width: '100%', border: 'none', background: 'transparent' }}
            />
          </div>

          <div className="dt-filter-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center', borderLeft: '1.5px solid var(--beige-dark)', paddingLeft: '16px' }}>
            <button type="button" className="btn-add-plan" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', margin: 0 }} onClick={onNewProduct}>
              <Plus size={16} /> Nuevo Producto
            </button>
            {selectedProducts.length > 0 && (
              <button type="button" className="btn-admin-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', margin: 0, padding: '8px 16px', borderRadius: '10px' }} onClick={onDeleteMultiple}>
                <Trash2 size={16} /> Eliminar ({selectedProducts.length})
              </button>
            )}
            <button type="button" className="refresh-btn" onClick={onRefresh} disabled={isLoading} title="Refrescar">
              <RefreshCw className={isLoading ? 'spin' : ''} size={16} />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="admin-loading" style={{ padding: '3rem 1.5rem', borderTop: '1px solid var(--beige-light)' }}>
            <div className="loading-spinner"></div>
            <p>Cargando productos...</p>
          </div>
        ) : filteredProducts.length > 0 ? (
          <div className="dt-table-wrapper">
            <table className="dt-table">
              <thead>
                <tr>
                  <th className="col-prod-checkbox-header">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todos"
                      checked={filteredProducts.length > 0 && selectedProducts.length === filteredProducts.length}
                      onChange={onSelectAll}
                      className="task-table-checkbox"
                    />
                  </th>
                  <th className="col-prod-title-header">Producto</th>
                  <th className="col-prod-category-header">Categoría</th>
                  <th className="col-prod-price-header">Precio</th>
                  <th className="col-prod-points-header">Puntos</th>
                  <th className="col-prod-stock-header">Stock</th>
                  <th className="col-prod-status-header">Visibilidad</th>
                  <th className="col-prod-active-header">Estado</th>
                  <th className="col-prod-actions-header">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((prod) => {
                  const isSelected = selectedProducts.includes(prod.id);
                  return (
                    <tr key={prod.id} className={`tasks-tr ${isSelected ? 'row-selected' : ''}`}>
                      <td className="col-prod-checkbox-cell">
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar ${prod.title}`}
                          checked={isSelected}
                          onChange={(e) => onSelectOne(prod.id, e.target.checked)}
                          className="task-table-checkbox"
                        />
                      </td>
                      <td className="col-prod-title-cell">
                        <div className="task-title-wrapper">
                          <span className="task-table-title">{prod.title}</span>
                          <span className="task-table-desc">{prod.short_description || 'Sin descripción corta'}</span>
                          <div className="task-mobile-meta">
                            {prod.categories && <span className="task-mobile-badge type-manual">{prod.categories.name}</span>}
                            {(prod.price_cop !== undefined && prod.price_cop !== null) && (
                              <span className="task-mobile-badge points">${prod.price_cop.toFixed(2)}</span>
                            )}
                            {prod.points_price && <span className="task-mobile-badge points">{prod.points_price} pts</span>}
                          </div>
                        </div>
                      </td>
                      <td className="col-prod-category-cell">
                        {prod.categories
                          ? <span className="task-badge type-manual">{prod.categories.name}</span>
                          : <span className="task-badge badge-neutral">—</span>}
                      </td>
                      <td className="col-prod-price-cell">
                        {(prod.price_cop !== undefined && prod.price_cop !== null)
                          ? <span className="task-badge badge-neutral">${prod.price_cop.toFixed(2)}</span>
                          : <span className="task-badge badge-neutral">—</span>}
                      </td>
                      <td className="col-prod-points-cell">
                        {prod.points_price
                          ? <span className="task-badge badge-brand">{prod.points_price} pts</span>
                          : <span className="task-badge badge-neutral">—</span>}
                      </td>
                      <td className="col-prod-stock-cell">
                        <span className="task-badge badge-neutral">{prod.stock === null ? '∞' : prod.stock}</span>
                      </td>
                      <td className="col-prod-status-cell" style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center', justifyContent: 'center', border: 'none' }}>
                        <span className={`task-badge ${prod.visibility === 'invited_only' || prod.visibility === 'invited' ? 'badge-brand' : 'badge-success'}`} style={{ width: '80px', textAlign: 'center' }}>
                          {prod.visibility === 'invited_only' || prod.visibility === 'invited' ? 'Invitado' : 'General'}
                        </span>
                        <span className={`task-badge ${prod.payment_modes === 'points' ? 'badge-brand' : (prod.payment_modes === 'money' ? 'badge-success' : 'badge-neutral')}`} style={{ width: '80px', textAlign: 'center', textTransform: 'none' }}>
                          {prod.payment_modes === 'points' ? 'Puntos' : (prod.payment_modes === 'money' ? 'Dinero' : 'Ambos')}
                        </span>
                      </td>
                      <td className="col-prod-active-cell">
                        <button
                          type="button"
                          className="pm-card-switch-container"
                          style={{ margin: 0, justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                          aria-label={prod.is_active ? 'Desactivar producto' : 'Activar producto'}
                          onClick={() => onToggleActive(prod)}
                        >
                          <div className={`admin-switch ${prod.is_active ? 'checked' : ''}`}>
                            <div className="admin-switch-handle"></div>
                          </div>
                          <span className="admin-switch-label" style={{ fontSize: '0.8rem' }}>
                            {prod.is_active ? 'Activo' : 'Inactivo'}
                          </span>
                        </button>
                      </td>
                      <td className="col-prod-actions-cell">
                        <div className="row-actions-group">
                          <button type="button" className="row-action-btn edit" onClick={() => onEditPool(prod)} title="Gestionar Pool de Credenciales">
                            <Key size={14} />
                          </button>
                          <button type="button" className="row-action-btn edit" onClick={() => onEditProduct(prod)} title="Editar Producto">
                            <Pencil size={14} />
                          </button>
                          <button type="button" className="row-action-btn delete" onClick={() => onDeleteProduct(prod.id, prod.title)} title="Eliminar Producto">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="dt-table-footer" style={{ borderTop: '1px solid var(--beige-light)' }}>
              <span className="dt-total-count">
                {filteredProducts.length} {filteredProducts.length === 1 ? 'producto' : 'productos'} en total
              </span>
            </div>
          </div>
        ) : (
          <div className="empty-panel-state" style={{ borderTop: '1px solid var(--beige-light)', borderRadius: 0, padding: '3rem 1.5rem' }}>
            <ShoppingBag className="empty-icon" size={48} />
            <h4>No se encontraron productos</h4>
            <p>No hay productos en el catálogo que coincidan con la búsqueda o la categoría seleccionada.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Subsección de Categorías
interface CatSectionProps {
  categories: Category[];
  onSaveCategory: (name: string, slug: string) => Promise<void>;
  onDeleteCategory: (id: string, name: string) => Promise<void>;
  isLoading: boolean;
}

function CategoriesSection({ categories, onSaveCategory, onDeleteCategory, isLoading }: CatSectionProps) {
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const autoSlug = (v: string) => {
    return v
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    await onSaveCategory(name.trim(), autoSlug(name.trim()));
    setName('');
    setIsSubmitting(false);
  };

  return (
    <div className="categories-admin-section">
      <div className="admin-editor-card" style={{ padding: '1.25rem' }}>
        <form onSubmit={handleAdd} className="admin-form" style={{ flexDirection: 'row', alignItems: 'flex-end', gap: '12px' }}>
          <div className="admin-field" style={{ flex: 1 }}>
            <label htmlFor="cat-name">Nombre de la Categoría</label>
            <input 
              id="cat-name"
              type="text" 
              className="admin-input" 
              value={name} 
              placeholder="Ej: Cursos"
              onChange={(e) => setName(e.target.value)} 
            />
          </div>
          <button type="submit" className="btn-admin-action" disabled={isSubmitting || isLoading || !name.trim()}>
            {isSubmitting ? <RefreshCw className="admin-spinner" size={14} /> : <Plus size={14} />}
            Agregar
          </button>
        </form>
      </div>

      <div className="dt-container">
        {categories.length > 0 ? (
          <div className="dt-table-wrapper">
            <table className="dt-table">
              <thead>
                <tr>
                  <th className="col-cat-name-header">Categoría</th>
                  <th className="col-cat-slug-header">Slug / Ruta</th>
                  <th className="col-cat-actions-header" style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id} className="tasks-tr">
                    <td className="col-cat-name-cell">
                      <span className="task-table-title" style={{ margin: 0 }}>{c.name}</span>
                    </td>
                    <td className="col-cat-slug-cell">
                      <span className="task-badge badge-neutral" style={{ fontFamily: 'monospace', textTransform: 'none' }}>
                        /{c.slug}
                      </span>
                    </td>
                    <td className="col-cat-actions-cell" style={{ textAlign: 'right' }}>
                      <div className="row-actions-group" style={{ justifyContent: 'flex-end' }}>
                        <button type="button" className="row-action-btn delete" onClick={() => onDeleteCategory(c.id, c.name)} title="Eliminar Categoría">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="dt-table-footer" style={{ borderTop: '1px solid var(--beige-light)' }}>
              <span className="dt-total-count">
                {categories.length} {categories.length === 1 ? 'categoría' : 'categorías'} en total
              </span>
            </div>
          </div>
        ) : (
          <div className="empty-panel-state" style={{ padding: '3rem 1.5rem' }}>
            <FolderPlus className="empty-icon" size={48} />
            <h4>Sin categorías cargadas</h4>
            <p>Agrega categorías para clasificar tu catálogo digital.</p>
          </div>
        )}
      </div>
    </div>
  );
}


// Administrador de Pool de Credenciales
interface PoolProps {
  product: Product;
  onBack: () => void;
}

function CredentialsPoolManager({ product, onBack }: PoolProps) {
  const [pool, setPool] = useState<Credential[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Carga individual vs masiva (CSV)
  const [isBulk, setIsBulk] = useState(false);
  const [singleEmail, setSingleEmail] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Seguridad Super Admin
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isCheckingRole, setIsCheckingRole] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchPool = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('email_pool')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;

      // Filtrar en memoria por los planes del producto
      const planIds = product.plans ? product.plans.map(p => p.id) : [];
      const filtered = (data || []).filter(item => 
        !item.plan_id || planIds.includes(item.plan_id)
      );
      setPool(filtered);
    } catch (err: unknown) {
      console.error(err);
      alert('Error al cargar la piscina de correos.');
    } finally {
      setIsLoading(false);
    }
  }, [product.plans]);

  useEffect(() => {
    let active = true;
    const fetchAsync = async () => {
      await Promise.resolve();
      if (active) {
        await fetchPool();
      }
    };
    fetchAsync();
    return () => {
      active = false;
    };
  }, [fetchPool]);

  // Verificar rol de Super Admin
  useEffect(() => {
    let active = true;
    const checkRole = async () => {
      try {
        const { data, error } = await supabase.rpc('get_my_access');
        if (error) throw error;
        if (active && data && data.length > 0) {
          setIsSuperAdmin(!!data[0].is_super_admin);
        }
      } catch (err) {
        console.error('Error al verificar rol de usuario:', err);
      } finally {
        if (active) setIsCheckingRole(false);
      }
    };
    checkRole();
    return () => {
      active = false;
    };
  }, []);

  // Carga Individual
  const handleAddSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailStr = singleEmail.trim();
    if (!emailStr || !emailStr.includes('@')) {
      alert('Ingresa un correo electrónico válido.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Validar si ya existe para evitar errores de restricción única
      const { data: existing } = await supabase
        .from('email_pool')
        .select('id')
        .eq('email', emailStr)
        .maybeSingle();

      if (existing) {
        alert(`El correo "${emailStr}" ya se encuentra registrado en el pool.`);
        setIsSubmitting(false);
        return;
      }

      const payload = {
        email: emailStr,
        plan_id: selectedPlanId || null,
        status: 'unassigned' as const,
      };

      const { error } = await supabase.from('email_pool').insert([payload]);
      if (error) throw error;

      await supabase.rpc('admin_log_action', {
        _action: 'add_pool_correo_individual',
        _target_table: 'email_pool',
        _target_id: null,
        _payload: payload
      });

      setSingleEmail('');
      await fetchPool();
    } catch (err: unknown) {
      console.error(err);
      alert('Error al agregar el correo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Carga Masiva CSV (Columna única de emails)
  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      if (!text) return;

      // Separar por líneas
      const lines = text.split(/\r?\n/);
      const emails: string[] = [];

      for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        // Extraer primera columna
        const parts = line.split(/[,;]/);
        const email = parts[0].trim().toLowerCase();

        // Validar formato de email simple
        if (email && email.includes('@')) {
          emails.push(email);
        }
      }

      if (emails.length === 0) {
        alert('No se encontraron correos electrónicos válidos en el archivo CSV.');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      setIsSubmitting(true);
      try {
        // Consultar los que ya existen para filtrarlos
        const { data: existingRows, error: checkError } = await supabase
          .from('email_pool')
          .select('email')
          .in('email', emails);

        if (checkError) throw checkError;

        const existingEmails = new Set(existingRows?.map(r => r.email) || []);
        const newEmails = emails.filter(email => !existingEmails.has(email));

        if (newEmails.length === 0) {
          alert('Todos los correos del archivo CSV ya existen en el pool.');
          if (fileInputRef.current) fileInputRef.current.value = '';
          setIsSubmitting(false);
          return;
        }

        const payloads = newEmails.map(email => ({
          email,
          plan_id: selectedPlanId || null,
          status: 'unassigned' as const
        }));

        const { error: insertError } = await supabase.from('email_pool').insert(payloads);
        if (insertError) throw insertError;

        await supabase.rpc('admin_log_action', {
          _action: 'bulk_upload_emails',
          _target_table: 'email_pool',
          _target_id: null,
          _payload: { count: payloads.length, plan_id: selectedPlanId || null }
        });

        alert(`Carga completada:\n- Nuevos correos agregados: ${newEmails.length}\n- Duplicados omitidos: ${emails.length - newEmails.length}`);
        
        if (fileInputRef.current) fileInputRef.current.value = '';
        await fetchPool();
      } catch (err: unknown) {
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
        _payload: { deleted_correo_id: id }
      });

      await fetchPool();
    } catch (err: unknown) {
      console.error(err);
      alert('Error al eliminar correo.');
    } finally {
      setIsLoading(false);
    }
  };

  const availableCount = pool.filter((c) => c.status === 'unassigned').length;

  return (
    <div className="credentials-pool-manager">
      <div className="admin-action-bar" style={{ marginBottom: '1.5rem' }}>
        <button type="button" className="btn-admin-secondary" onClick={onBack}>
          <ChevronLeft size={16} /> Volver a Productos
        </button>
        <h3 className="admin-card-title" style={{ fontSize: '1.2rem', margin: 0 }}>
          Pool de Correos: {product.title}
        </h3>
      </div>

      {isCheckingRole ? (
        <div className="admin-loading" style={{ padding: '2rem 0' }}>
          <div className="loading-spinner"></div>
          <p>Verificando permisos...</p>
        </div>
      ) : !isSuperAdmin ? (
        <div className="admin-error-banner" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '2rem', textAlign: 'center', background: 'rgba(231, 76, 60, 0.08)', border: '1px solid rgba(231, 76, 60, 0.3)', borderRadius: '12px', color: '#e74c3c', marginBottom: '1.5rem' }}>
          <AlertTriangle size={32} />
          <h4 style={{ margin: 0, fontWeight: 700, fontSize: '1.05rem' }}>Acceso Restringido</h4>
          <p style={{ margin: 0, fontSize: '0.88rem', opacity: 0.85 }}>
            Solo los Super Administradores tienen autorización para agregar, modificar o subir correos al pool.
          </p>
        </div>
      ) : (
        <div className="admin-editor-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h4 className="admin-card-title" style={{ fontSize: '1.05rem', margin: 0 }}>
              Cargar Correos al Pool
            </h4>
            <div className="orders-filters" style={{ margin: 0 }}>
              <button 
                type="button"
                className={`filter-pill ${!isBulk ? 'active' : ''}`}
                onClick={() => setIsBulk(false)}
              >
                Carga Individual
              </button>
              <button 
                type="button"
                className={`filter-pill ${isBulk ? 'active' : ''}`}
                onClick={() => setIsBulk(true)}
              >
                Carga Masiva (CSV)
              </button>
            </div>
          </div>

          <div className="admin-form">
            {product.plans && product.plans.length > 0 && (
              <div className="admin-field" style={{ marginBottom: '1.2rem' }}>
                <label htmlFor="pool-plan-id">Asignar a Plan Específico</label>
                <select
                  id="pool-plan-id"
                  className="admin-select"
                  value={selectedPlanId}
                  onChange={(e) => setSelectedPlanId(e.target.value)}
                >
                  <option value="">General (Todos los planes de este producto)</option>
                  {product.plans.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
                  ))}
                </select>
                <span className="field-description">
                  Los correos se asignarán únicamente a los usuarios que adquieran este plan de precios.
                </span>
              </div>
            )}

            {!isBulk ? (
              <form onSubmit={handleAddSingle} className="admin-field">
                <label htmlFor="pool-single-email">Correo Electrónico</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input 
                    id="pool-single-email"
                    type="email" 
                    className="admin-input" 
                    value={singleEmail} 
                    onChange={(e) => setSingleEmail(e.target.value)} 
                    placeholder="ejemplo@correo.com"
                    required
                    style={{ flex: 1 }}
                  />
                  <button type="submit" className="btn-admin-action" disabled={isSubmitting || isLoading} style={{ minHeight: '40px', padding: '0 20px' }}>
                    {isSubmitting ? <RefreshCw className="admin-spinner" size={14} /> : <Plus size={14} />}
                    Agregar
                  </button>
                </div>
              </form>
            ) : (
              <div className="admin-field">
                <label htmlFor="csv-upload">Cargar Archivo CSV</label>
                <div className="upload-input-group">
                  <input 
                    id="csv-upload"
                    type="file" 
                    ref={fileInputRef}
                    accept=".csv"
                    onChange={handleCSVUpload}
                    style={{ display: 'none' }}
                    disabled={isSubmitting || isLoading}
                  />
                  <button 
                    type="button" 
                    className="btn-admin-action" 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSubmitting || isLoading}
                    style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '8px', minHeight: '45px' }}
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="admin-spinner" size={16} />
                        Procesando CSV...
                      </>
                    ) : (
                      <>
                        <Upload size={16} />
                        Seleccionar Archivo CSV de Correos
                      </>
                    )}
                  </button>
                </div>
                <span className="field-description" style={{ marginTop: '6px', display: 'block' }}>
                  El archivo debe ser un CSV (delimitado por coma o punto y coma) con una sola columna de correos electrónicos. Ejemplo:<br />
                  <code>correo1@dominio.com</code><br />
                  <code>correo2@dominio.com</code>
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="admin-editor-card">
        <h4 className="admin-card-title" style={{ fontSize: '1.05rem', marginBottom: '0.25rem' }}>
          Correos en la Piscina
        </h4>
        <p className="field-description" style={{ marginBottom: '1rem', fontWeight: 600 }}>
          {availableCount} Disponibles / {pool.length} Total
        </p>

        {isLoading ? (
          <div className="admin-loading" style={{ padding: '2rem 0' }}>
            <div className="loading-spinner"></div>
            <p>Cargando piscina...</p>
          </div>
        ) : pool.length > 0 ? (
          <ul className="pool-items-list">
            {pool.map((c) => (
              <li key={c.id} className="pool-item">
                <div className="pool-item-creds">
                  <strong>Email:</strong> {c.email}
                  <span style={{ display: 'block', fontSize: '0.75rem', opacity: 0.6 }}>
                    Creado el: {new Date(c.created_at).toLocaleString('es-CO')}
                  </span>
                  {c.assigned_user_id && (
                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--green-deep)' }}>
                      Asignado a usuario ID: {c.assigned_user_id}
                    </span>
                  )}
                </div>
                <div className="pool-item-actions">
                  {c.plan_id ? (
                    <span className="badge-admin plan-specific" style={{ background: '#fef3c7', color: '#b45309', marginRight: '8px', fontSize: '0.75rem', fontWeight: 700 }}>
                      Plan: {c.plan_id}
                    </span>
                  ) : (
                    <span className="badge-admin general-plan" style={{ background: '#f1f5f9', color: '#475569', marginRight: '8px', fontSize: '0.75rem', fontWeight: 700 }}>
                      General
                    </span>
                  )}
                  
                  <span className={`badge-admin ${c.status === 'assigned' ? 'used' : c.status === 'blocked' ? 'rejected' : 'active'}`} style={{ textTransform: 'capitalize' }}>
                    {c.status === 'unassigned' ? 'sin asignar' : c.status === 'assigned' ? 'asignado' : 'bloqueado'}
                  </span>
                  
                  {c.status === 'unassigned' && isSuperAdmin && (
                    <button type="button" className="btn-pool-delete" onClick={() => handleDelete(c.id)} title="Eliminar Correo">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-panel-state" style={{ padding: '2rem 1rem' }}>
            <Key className="empty-icon" size={32} />
            <p>No hay correos en el pool para este producto.</p>
          </div>
        )}
      </div>
    </div>
  );
}
