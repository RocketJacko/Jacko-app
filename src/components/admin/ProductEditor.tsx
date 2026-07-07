import React, { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { 
  X, Upload, Plus, Trash2, Save, RefreshCw 
} from 'lucide-react';
import type { PricingPlan, Category, Product } from './CatalogManager';

interface FormPricingPlan extends Omit<PricingPlan, 'bulk_pricing' | 'accordions'> {
  bulk_pricing_raw: string;
  accordions_raw: string;
}

export interface ProductEditorProps {
  product: Product | null;
  categories: Category[];
  onSave: (data: Partial<Product>) => Promise<void>;
  onCancel: () => void;
}

export function ProductEditor({ product, categories, onSave, onCancel }: ProductEditorProps) {
  const [title, setTitle] = useState(product?.title ?? '');
  const [slug, setSlug] = useState(product?.slug ?? '');
  const [categoryId, setCategoryId] = useState(product?.category_id ?? '');
  const [shortDesc, setShortDesc] = useState(product?.short_description ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  
  const [priceUsd, setPriceUsd] = useState<string>(product?.price_cop?.toString() ?? '');

  const [pointsPrice, setPointsPrice] = useState<string>(product?.points_price?.toString() ?? '');
  const [stock, setStock] = useState<string>(product?.stock?.toString() ?? '');
  const [isActive, setIsActive] = useState(product?.is_active ?? true);
  const [visibility, setVisibility] = useState(product?.visibility ?? 'public');
  const [paymentModes, setPaymentModes] = useState(product?.payment_modes ?? 'both');
  const [thumbnailUrl, setThumbnailUrl] = useState(product?.thumbnail_url ?? '');
  const [filePath, setFilePath] = useState(product?.file_path ?? '');
  const [externalUrl, setExternalUrl] = useState(product?.external_url ?? '');
  const [credentials, setCredentials] = useState(product?.credentials ?? '');
  
  const [deliveryType, setDeliveryType] = useState<'pool' | 'credentials' | 'file' | 'url'>(() => {
    if (product?.file_path) return 'file';
    if (product?.external_url) return 'url';
    if (product?.credentials) return 'credentials';
    return 'pool';
  });

  const [pricingType, setPricingType] = useState<'fixed' | 'plans'>(() => {
    if (product?.plans && product.plans.length > 0) return 'plans';
    return 'fixed';
  });
  const accordions = product?.accordions || [];

  const [plans, setPlans] = useState<FormPricingPlan[]>(() => {
    return (product?.plans || []).map((p: PricingPlan) => ({
      ...p,
      price_usd: p.price_cop !== undefined && p.price_cop !== null ? p.price_cop : 0,
      bulk_pricing_raw: p.bulk_pricing ? JSON.stringify(p.bulk_pricing) : '',
      accordions_raw: p.accordions ? JSON.stringify(p.accordions, null, 2) : '',
    }));
  });

  const handleAddPlan = () => {
    setPlans([
      ...plans,
      {
        id: '',
        name: '',
        price_cop: 0,
        points_price: 0,
        short_description: '',
        description: '',
        require_new_account: false,
        bulk_pricing_raw: '',
        accordions_raw: '',
      }
    ]);
  };

  const handleRemovePlan = (index: number) => {
    setPlans(plans.filter((_, i) => i !== index));
  };

  const handleUpdatePlan = (index: number, field: string, value: string | number | boolean) => {
    const nextPlans = [...plans];
    nextPlans[index] = {
      ...nextPlans[index],
      [field]: value
    } as FormPricingPlan;
    setPlans(nextPlans);
  };

  const getFullThumbnailUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) {
      return url;
    }
    return `https://plybwnfnmvshroaottby.supabase.co/storage/v1/object/public/thumbnails/${url}`;
  };

  const [isUploadingThumb, setIsUploadingThumb] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const autoSlug = (v: string) => {
    return v
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTitle(val);
    if (!product) {
      setSlug(autoSlug(val));
    }
  };

  const sanitizeStorageFileName = (name: string) => {
    const lastDotIndex = name.lastIndexOf('.');
    const ext = lastDotIndex !== -1 ? name.slice(lastDotIndex) : '';
    const base = lastDotIndex !== -1 ? name.slice(0, lastDotIndex) : name;
    const cleanBase = base.replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanExt = ext.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    return cleanExt ? `${cleanBase}.${cleanExt}` : cleanBase;
  };

  const uploadThumbnail = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingThumb(true);
    try {
      const cleanName = sanitizeStorageFileName(file.name);
      const path = `products/${Date.now()}-${cleanName}`;
      const { error } = await supabase.storage.from('thumbnails').upload(path, file, { upsert: false });
      if (error) throw error;
      const { data: pubUrl } = supabase.storage.from('thumbnails').getPublicUrl(path);
      setThumbnailUrl(pubUrl.publicUrl);
      alert('Miniatura subida exitosamente.');
    } catch (err: unknown) {
      console.error(err);
      alert('Error al subir miniatura: ' + (err instanceof Error ? err.message : 'Error desconocido'));
    } finally {
      setIsUploadingThumb(false);
    }
  };

  const uploadProductFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingFile(true);
    try {
      const cleanName = sanitizeStorageFileName(file.name);
      const path = `${Date.now()}-${cleanName}`;
      const { error } = await supabase.storage.from('products').upload(path, file, { upsert: false });
      if (error) throw error;
      setFilePath(path);
      alert('Archivo de entrega subido exitosamente.');
    } catch (err: unknown) {
      console.error(err);
      alert('Error al subir archivo: ' + (err instanceof Error ? err.message : 'Error desconocido'));
    } finally {
      setIsUploadingFile(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const parsedPlans = plans.map(p => {
        const bulk_pricing = (() => {
          if (!p.bulk_pricing_raw) return null;
          try {
            return JSON.parse(p.bulk_pricing_raw);
          } catch (err) {
            alert(`Error de JSON en el precio por volumen del plan ${p.name || p.id}: ${err instanceof Error ? err.message : ''}`);
            throw err;
          }
        })();

        const accordionsData = (() => {
          if (!p.accordions_raw) return null;
          try {
            return JSON.parse(p.accordions_raw);
          } catch (err) {
            alert(`Error de JSON en los acordeones del plan ${p.name || p.id}: ${err instanceof Error ? err.message : ''}`);
            throw err;
          }
        })();

        const planPriceUsd = p.price_usd !== undefined && p.price_usd !== null ? Number(p.price_usd) : 0;
        const planPriceCop = planPriceUsd;

        return {
          id: p.id,
          name: p.name,
          price_cop: planPriceCop,
          points_price: p.points_price,
          short_description: p.short_description,
          description: p.description,
          require_new_account: p.require_new_account,
          bulk_pricing,
          accordions: accordionsData,
        };
      });

      const hasPlans = pricingType === 'plans';
      const finalPriceCop = !hasPlans ? ((priceUsd !== undefined && priceUsd !== null && priceUsd !== '') ? Number(priceUsd) : 0) : (parsedPlans[0]?.price_cop || 0);

      await onSave({
        title,
        slug: slug || autoSlug(title),
        category_id: categoryId || null,
        short_description: shortDesc || null,
        description: description || null,
        price_cop: finalPriceCop,
        points_price: !hasPlans ? ((pointsPrice !== undefined && pointsPrice !== null && pointsPrice !== '') ? Number(pointsPrice) : null) : (parsedPlans[0]?.points_price || null),
        stock: !hasPlans ? ((stock !== undefined && stock !== null && stock !== '') ? Number(stock) : null) : null,
        is_active: isActive,
        thumbnail_url: thumbnailUrl || null,
        file_path: deliveryType === 'file' ? (filePath || null) : null,
        external_url: deliveryType === 'url' ? (externalUrl || null) : null,
        credentials: deliveryType === 'credentials' ? (credentials || null) : null,
        accordions: accordions && accordions.length > 0 ? accordions : null,
        plans: hasPlans && parsedPlans.length > 0 ? parsedPlans : null,
        visibility,
        payment_modes: paymentModes,
      });
    } catch (err) {
      console.error('Validation failed', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="admin-editor-card">
      <div className="admin-action-bar" style={{ borderBottom: '1px solid var(--beige-light)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
        <h3 className="admin-card-title" style={{ fontSize: '1.3rem', margin: 0 }}>
          {product ? 'Editar Producto' : 'Crear Nuevo Producto'}
        </h3>
        <button type="button" className="action-icon-btn btn-delete" onClick={onCancel} title="Cancelar">
          <X size={16} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="admin-form">
        <div className="form-grid-2">
          <div className="admin-field">
            <label htmlFor="title">Título del Producto</label>
            <input 
              id="title"
              type="text" 
              className="admin-input" 
              value={title} 
              onChange={handleTitleChange} 
              required
            />
          </div>
          <div className="admin-field">
            <label htmlFor="slug">Slug (URL)</label>
            <input 
              id="slug"
              type="text" 
              className="admin-input" 
              value={slug} 
              onChange={(e) => setSlug(autoSlug(e.target.value))} 
              required
            />
          </div>
        </div>

        <div className="form-grid-2">
          <div className="admin-field">
            <label htmlFor="category">Categoría</label>
            <select 
              id="category"
              className="admin-select"
              value={categoryId} 
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Sin Categoría</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="admin-field" style={{ justifyContent: 'flex-start' }}>
            <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }} 
              className="admin-switch-container" 
              onClick={() => setIsActive(!isActive)}
              style={{ marginTop: '1.8rem' }}
            >
              <div className={`admin-switch ${isActive ? 'checked' : ''}`}>
                <div className="admin-switch-handle"></div>
              </div>
              <span className="admin-switch-label">Producto Activo</span>
            </div>
          </div>
        </div>

        <div className="form-grid-2">
          <div className="admin-field">
            <label htmlFor="visibility">Visibilidad del Producto</label>
            <select 
              id="visibility"
              className="admin-select"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
            >
              <option value="public">General (Público)</option>
              <option value="invited_only">Solo Invitados</option>
            </select>
          </div>

          <div className="admin-field">
            <label htmlFor="payment_modes">Modos de Pago Permitidos</label>
            <select 
              id="payment_modes"
              className="admin-select"
              value={paymentModes}
              onChange={(e) => setPaymentModes(e.target.value)}
            >
              <option value="both">Ambos (Puntos y Dinero)</option>
              <option value="money">Solo Dinero (COP)</option>
              <option value="points">Solo Puntos</option>
            </select>
          </div>
        </div>

        <div className="form-grid-2">
          <div className="admin-field">
            <label htmlFor="pricing-type">Esquema de Cobro / Precios</label>
            <select 
              id="pricing-type"
              className="admin-select"
              value={pricingType}
              onChange={(e) => setPricingType(e.target.value as 'fixed' | 'plans')}
            >
              <option value="fixed">Precio Fijo (Pago Único)</option>
              <option value="plans">Múltiples Planes (Ej: Mensual / Pago Único)</option>
            </select>
          </div>

          <div className="admin-field">
            <label htmlFor="delivery-type">Método de Entrega / Producto</label>
            <select 
              id="delivery-type"
              className="admin-select"
              value={deliveryType}
              onChange={(e) => setDeliveryType(e.target.value as 'pool' | 'credentials' | 'file' | 'url')}
            >
              <option value="pool">Pool de Cuentas (Asignación Automática)</option>
              <option value="credentials">Credenciales Fijas (Usuario/Clave Fijos)</option>
              <option value="file">Descarga de Archivo (Fichero Privado)</option>
              <option value="url">Enlace Externo (Redirección a URL)</option>
            </select>
          </div>
        </div>

        <div className="admin-field">
          <label htmlFor="short-desc">Descripción corta (Tarjeta)</label>
          <input 
            id="short-desc"
            type="text" 
            className="admin-input" 
            value={shortDesc} 
            onChange={(e) => setShortDesc(e.target.value)} 
            maxLength={200}
          />
        </div>

        <div className="admin-field">
          <label htmlFor="long-desc">Descripción detallada</label>
          <textarea 
            id="long-desc"
            className="admin-textarea" 
            rows={4} 
            value={description} 
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {pricingType === 'fixed' && (
          <div className="form-grid-3">
            <div className="admin-field">
              <label htmlFor="price-usd">Precio USD (Dólares)</label>
              <input 
                id="price-usd"
                type="number" 
                step="0.01"
                min="0" 
                className="admin-input" 
                value={priceUsd} 
                onChange={(e) => setPriceUsd(e.target.value)} 
                placeholder="Ej: 8.00"
              />
            </div>
            <div className="admin-field">
              <label htmlFor="points-price">Precio en Puntos</label>
              <input 
                id="points-price"
                type="number" 
                min="0" 
                className="admin-input" 
                value={pointsPrice} 
                onChange={(e) => setPointsPrice(e.target.value)} 
                placeholder="Ej: 100"
              />
            </div>
            <div className="admin-field">
              <label htmlFor="stock">Stock disponible</label>
              <input 
                id="stock"
                type="number" 
                min="0" 
                className="admin-input" 
                value={stock} 
                onChange={(e) => setStock(e.target.value)} 
                placeholder="Ilimitado"
              />
            </div>
          </div>
        )}

        <div className="admin-field">
          <label htmlFor="thumbnail">Imagen del Producto (Catálogo)</label>
          <div className="upload-input-group">
            <input
              id="thumbnail"
              type="text"
              className="admin-input"
              value={thumbnailUrl}
              onChange={(e) => setThumbnailUrl(e.target.value)}
              placeholder="Pega una URL del Storage o sube un archivo"
            />
            <label className="upload-btn-label" title="Subir imagen al Storage">
              {isUploadingThumb ? <RefreshCw className="admin-spinner" size={14} /> : <Upload size={14} />}
              Subir
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={uploadThumbnail}
                disabled={isUploadingThumb}
              />
            </label>
          </div>
          {thumbnailUrl && (
            <div style={{ marginTop: '10px', position: 'relative', display: 'inline-block' }}>
              <img
                src={getFullThumbnailUrl(thumbnailUrl)}
                alt="Vista previa"
                className="thumb-preview-img"
                style={{ width: '120px', height: '80px', objectFit: 'cover', borderRadius: '10px' }}
              />
              <button
                type="button"
                onClick={() => setThumbnailUrl('')}
                style={{
                  position: 'absolute', top: '-6px', right: '-6px',
                  background: '#e74c3c', border: 'none', borderRadius: '50%',
                  width: '20px', height: '20px', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: 'pointer', color: '#fff',
                }}
                title="Quitar imagen"
              >
                <X size={11} />
              </button>
            </div>
          )}
          <span className="field-description">
            Esta es la imagen de portada que se mostrará en la tienda/catálogo general para este producto.
          </span>
        </div>

        {deliveryType === 'file' && (
          <div className="admin-field">
            <label htmlFor="file-path">Archivo de entrega (Fichero Privado)</label>
            <div className="upload-input-group">
              <input 
                id="file-path"
                type="text" 
                className="admin-input" 
                value={filePath} 
                onChange={(e) => setFilePath(e.target.value)} 
                placeholder="Ruta en bucket o sube un archivo"
              />
              <label className="upload-btn-label">
                {isUploadingFile ? <RefreshCw className="admin-spinner" size={14} /> : <Upload size={14} />}
                Subir
                <input 
                  type="file" 
                  className="hidden" 
                  style={{ display: 'none' }} 
                  onChange={uploadProductFile} 
                />
              </label>
            </div>
            <span className="field-description">Se subirá de forma segura al bucket "products" y se entregará mediante un enlace firmado.</span>
          </div>
        )}

        {deliveryType === 'url' && (
          <div className="admin-field">
            <label htmlFor="ext-url">URL Externa</label>
            <input 
              id="ext-url"
              type="url" 
              className="admin-input" 
              value={externalUrl} 
              onChange={(e) => setExternalUrl(e.target.value)} 
              placeholder="https://..."
            />
          </div>
        )}

        {deliveryType === 'credentials' && (
          <div className="admin-field">
            <label htmlFor="credentials">Credenciales fijas</label>
            <textarea 
              id="credentials"
              className="admin-textarea" 
              rows={3} 
              value={credentials} 
              onChange={(e) => setCredentials(e.target.value)} 
              placeholder={"Usuario: mi_correo@ejemplo.com\nContraseña: 123456"}
            />
            <span className="field-description">
              Todos los clientes que compren o canjeen este producto recibirán estas credenciales fijas.
            </span>
          </div>
        )}

        {pricingType === 'plans' && (
          <div className="accordions-editor-section" style={{ marginTop: '2rem', borderTop: '2px solid var(--beige-light)', paddingTop: '2rem' }}>
            <div className="accordions-editor-title">
              <span>💎 Planes de Precios Dinámicos (Opcional)</span>
              <button
                type="button"
                className="btn-admin-action"
                style={{ padding: '6px 12px', fontSize: '0.8rem', borderRadius: '8px' }}
                onClick={handleAddPlan}
              >
                <Plus size={14} /> Añadir Plan de Precios
              </button>
            </div>

            {plans.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--brown-dark)', opacity: 0.6, fontStyle: 'italic', margin: '0 0 1.5rem 0' }}>
                No hay planes de precios dinámicos configurados. El producto usará sus valores base.
              </p>
            ) : (
              <div className="plans-list" style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '1.5rem' }}>
                {plans.map((plan, planIdx) => (
                  <div key={planIdx} className="accordion-editor-item" style={{ borderLeft: '4px solid var(--orange)' }}>
                    <div className="accordion-editor-header">
                      <h5 style={{ color: 'var(--orange-deep)', fontWeight: 'bold' }}>Plan #{planIdx + 1}: {plan.name || 'Sin Nombre'}</h5>
                      <button
                        type="button"
                        className="btn-pool-delete"
                        onClick={() => handleRemovePlan(planIdx)}
                        title="Eliminar Plan"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="accordion-editor-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                      <div className="admin-field" style={{ gridColumn: 'span 2' }}>
                        <label htmlFor={`plan-id-${planIdx}`}>ID del Plan (Único, ej: pago-unico, mensual) *</label>
                        <input
                          id={`plan-id-${planIdx}`}
                          type="text"
                          aria-label="ID del Plan"
                          className="admin-input"
                          value={plan.id || ''}
                          onChange={(e) => handleUpdatePlan(planIdx, 'id', e.target.value)}
                          required
                        />
                      </div>

                      <div className="admin-field">
                        <label htmlFor={`plan-name-${planIdx}`}>Nombre del Plan (ej: Plan Mensual) *</label>
                        <input
                          id={`plan-name-${planIdx}`}
                          type="text"
                          aria-label="Nombre del Plan"
                          className="admin-input"
                          value={plan.name || ''}
                          onChange={(e) => handleUpdatePlan(planIdx, 'name', e.target.value)}
                          required
                        />
                      </div>

                      <div className="admin-field">
                        <label htmlFor={`plan-shortdesc-${planIdx}`}>Descripción corta (ej: Mensualidad (Cuenta nueva)) *</label>
                        <input
                          id={`plan-shortdesc-${planIdx}`}
                          type="text"
                          aria-label="Descripción corta"
                          className="admin-input"
                          value={plan.short_description || ''}
                          onChange={(e) => handleUpdatePlan(planIdx, 'short_description', e.target.value)}
                          required
                        />
                      </div>

                      <div className="admin-field">
                        <label htmlFor={`plan-priceusd-${planIdx}`}>Precio USD *</label>
                        <input
                          id={`plan-priceusd-${planIdx}`}
                          type="number"
                          aria-label="Precio USD"
                          step="0.01"
                          className="admin-input"
                          value={plan.price_usd !== undefined && plan.price_usd !== null ? plan.price_usd : ''}
                          onChange={(e) => {
                            const val = e.target.value === '' ? '' : Number(e.target.value);
                            handleUpdatePlan(planIdx, 'price_usd', val);
                          }}
                          required
                        />
                      </div>

                      <div className="admin-field">
                        <label htmlFor={`plan-pointsprice-${planIdx}`}>Precio en Puntos *</label>
                        <input
                          id={`plan-pointsprice-${planIdx}`}
                          type="number"
                          aria-label="Precio en Puntos"
                          className="admin-input"
                          value={plan.points_price}
                          onChange={(e) => handleUpdatePlan(planIdx, 'points_price', Number(e.target.value))}
                          required
                        />
                      </div>

                      <div className="admin-field" style={{ gridColumn: 'span 2' }}>
                        <label htmlFor={`plan-desc-${planIdx}`}>Descripción detallada</label>
                        <textarea
                          id={`plan-desc-${planIdx}`}
                          aria-label="Descripción detallada"
                          className="admin-textarea"
                          rows={3}
                          value={plan.description || ''}
                          onChange={(e) => handleUpdatePlan(planIdx, 'description', e.target.value)}
                        />
                      </div>

                      <div className="admin-field" style={{ gridColumn: 'span 2' }}>
                        <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }} className="admin-switch-container" onClick={() => handleUpdatePlan(planIdx, 'require_new_account', !plan.require_new_account)}>
                          <div className={`admin-switch ${plan.require_new_account ? 'checked' : ''}`}>
                            <div className="admin-switch-handle"></div>
                          </div>
                          <span className="admin-switch-label">Requiere Cuenta Nueva (Bloquea Cuenta Existente)</span>
                        </div>
                      </div>

                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="admin-form-actions">
          <button type="button" className="btn-admin-secondary" onClick={onCancel} disabled={isSaving}>
            Cancelar
          </button>
          <button type="submit" className="btn-admin-action" disabled={isSaving}>
            {isSaving ? <RefreshCw className="admin-spinner" size={14} /> : <Save size={14} />}
            Guardar Producto
          </button>
        </div>
      </form>
    </div>
  );
}
