import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Package, Search, ArrowLeft } from 'lucide-react';
import './CatalogView.css';
import { CheckoutView } from './CheckoutView';
import { ProductCardSkeleton } from '../ui/skeleton';
import { catalogService } from '../../services/catalogService';
import type { Product, Category, PaymentMethod } from '../../services/catalogService';
import { VisibilityStrategyFactory } from '../../domain/visibility/VisibilityStrategyFactory';
import { useGeoLocation } from '../../hooks/useGeoLocation';

interface Props {
  userId: string;
  onRedeemSuccess: () => void;
  onNavigateToDashboard?: () => void;
}

export function CatalogView({ userId, onRedeemSuccess, onNavigateToDashboard }: Props) {
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuth();
  const { userCurrency, exchangeRate } = useGeoLocation();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<{
    points: number;
    subscription_tier: 'free' | 'mensual' | 'anual';
    isInvited?: boolean;
  } | null>(null);
  const [checkoutProduct, setCheckoutProduct] = useState<Product | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [initialQty, setInitialQty] = useState<number>(1);
  const hasProductsRef = useRef(false);

  const getProductImage = (url: string | null, slug: string, categorySlug?: string) => {
    if (!url || url.includes('placeholder.svg')) {
      if (slug.includes('anual')) {
        return 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?q=80&w=600&auto=format&fit=crop';
      }
      if (slug.includes('mensual')) {
        return 'https://images.unsplash.com/photo-1563013544-824ae1d704d3?q=80&w=600&auto=format&fit=crop';
      }
      if (categorySlug === 'cursos') {
        return 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=600&auto=format&fit=crop';
      }
      if (categorySlug === 'plantillas') {
        return 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?q=80&w=600&auto=format&fit=crop';
      }
      if (categorySlug === 'recursos') {
        return 'https://images.unsplash.com/photo-1626785774573-4b799315345d?q=80&w=600&auto=format&fit=crop';
      }
      return 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop';
    }
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) {
      return url;
    }
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://plybwnfnmvshroaottby.supabase.co';
    return `${supabaseUrl}/storage/v1/object/public/thumbnails/${url}`;
  };

  /* Cargar usuario y perfil completo (suscripción) */
  const loadUserProfile = useCallback(async () => {
    if (userId === 'guest') {
      setUserProfile({ points: 0, subscription_tier: 'free' });
      return;
    }
    try {
      const profile = await catalogService.getUserProfile(userId);
      setUserProfile(profile);
    } catch (err) {
      console.error('Error getting user profile:', err);
    }
  }, [userId]);

  /* Cargar métodos de pago activos (on-demand) */
  const loadPaymentMethods = useCallback(async () => {
    try {
      const methods = await catalogService.getPaymentMethods();
      setPaymentMethods(methods);
      return methods;
    } catch (err) {
      console.error('Error loading payment methods:', err);
      return [];
    }
  }, []);

  const subTier = userProfile?.subscription_tier || 'free';
  const isInvitedUser = userProfile?.isInvited || false;

  /* Cargar catálogo (datos públicos/privados según rol e invitación) */
  const loadCatalog = useCallback(
    async (forceRefresh = false) => {
      /* Carga optimista: si ya hay productos en estado, no mostrar spinner. */
      /* El fetch actualiza los datos silenciosamente en background. */
      if (!hasProductsRef.current) setIsLoading(true);
      try {
        const data = await catalogService.getCatalogData(forceRefresh, isSuperAdmin);
        const userCtx = {
          userId,
          isSuperAdmin,
          subscriptionTier: subTier,
          isInvited: isInvitedUser,
        };
        const filteredProducts = (data.products || []).filter((prod) => {
          /* Ocultar productos inactivos */
          if (!prod.is_active && !isSuperAdmin) {
            return false;
          }
          const strategy = VisibilityStrategyFactory.getStrategy(prod.visibility);
          return strategy.isVisible(userCtx);
        });
        setCategories(data.categories);
        setProducts(filteredProducts);
        hasProductsRef.current = true;
      } catch (err: unknown) {
        console.error('Error loading catalog:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [isSuperAdmin, subTier, isInvitedUser]
  );

  /* Carga inicial unificada de perfil y catálogo en paralelo (desacoplada de paymentMethods) */
  useEffect(() => {
    let active = true;
    const initData = async () => {
      if (!active) return;
      await Promise.all([loadUserProfile(), loadCatalog(false)]);
    };
    initData();
    return () => {
      active = false;
    };
  }, [loadUserProfile, loadCatalog]);

  useEffect(() => {
    if (products.length > 0) {
      const triggerSlug = localStorage.getItem('jacko_trigger_checkout_slug');
      if (triggerSlug) {
        const prod = products.find((p) => p.slug === triggerSlug);
        if (prod) {
          const qtyStr = localStorage.getItem('jacko_trigger_checkout_qty');
          const qty = qtyStr ? parseInt(qtyStr, 10) : 1;
          setInitialQty(qty > 0 ? qty : 1);
          setTimeout(async () => {
            if (paymentMethods.length === 0) {
              await loadPaymentMethods();
            }
            setCheckoutProduct(prod);
          }, 0);
        }
        localStorage.removeItem('jacko_trigger_checkout_slug');
        localStorage.removeItem('jacko_trigger_checkout_qty');
      }
    }
  }, [products, paymentMethods.length, loadPaymentMethods]);

  const handleSelectProduct = async (prod: Product) => {
    if (paymentMethods.length === 0) {
      await loadPaymentMethods();
    }
    setCheckoutProduct(prod);
  };

  /* Filtrar productos por búsqueda y categoría */
  const filteredProducts = products.filter((p) => {
    if (!p.is_active && !isSuperAdmin) {
      return false;
    }
    const matchesCategory = activeCategory ? p.categories?.slug === activeCategory : true;
    const matchesSearch =
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.short_description &&
        p.short_description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const hasTriggerSlug = !!localStorage.getItem('jacko_trigger_checkout_slug');

  if (hasTriggerSlug && !checkoutProduct) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          color: 'var(--brown-dark)',
        }}
      >
        <div
          className="animate-spin"
          style={{
            border: '3px solid rgba(212, 98, 26, 0.1)',
            borderTop: '3px solid var(--orange-base)',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
          }}
        />
        <p style={{ marginTop: '16px', fontSize: '0.95rem', fontWeight: 600, fontFamily: 'var(--font-body)', opacity: 0.8 }}>
          Preparando tu orden de pago...
        </p>
      </div>
    );
  }

  if (checkoutProduct) {
    return (
      <CheckoutView
        userId={userId}
        product={checkoutProduct}
        paymentMethods={paymentMethods}
        initialQuantity={initialQty}
        onBackToCatalog={() => {
          if (userId === 'guest') {
            navigate('/');
          } else {
            setCheckoutProduct(null);
            setInitialQty(1);
          }
        }}
        onSuccess={() => {
          loadUserProfile();
          onRedeemSuccess();
        }}
        onNavigateToDashboard={onNavigateToDashboard}
      />
    );
  }

  return (
    <div className="catalog-container">
      <div className="catalog-content">
        <header className="catalog-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            {userId === 'guest' && (
              <button
                type="button"
                className="btn-catalog-back"
                onClick={() => {
                  navigate('/');
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('scroll-to-section', { detail: 'register' }));
                  }, 50);
                }}
              >
                <ArrowLeft size={16} /> Volver a los Planes / Registro
              </button>
            )}
            <h2>{userId === 'guest' ? 'Nuestros Servicios' : 'Catálogo de Recompensas'}</h2>
          </div>
        </header>

        {/* Buscador y Filtros */}
        <div className="catalog-toolbar">
          <div className="catalog-search-wrapper">
            <Search size={18} className="catalog-search-icon" />
            <input
              type="text"
              className="catalog-search-input"
              placeholder="Buscar productos en la tienda..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <nav className="categories-filter" aria-label="Filtro de categorías">
            <button
              type="button"
              className={`category-pill${activeCategory === null ? ' active' : ''}`}
              onClick={() => setActiveCategory(null)}
            >
              Todas ({products.length})
            </button>
            {categories.map((c) => {
              const count = products.filter((p) => p.categories?.slug === c.slug).length;
              if (count === 0) return null;
              return (
                <button
                  type="button"
                  key={c.id}
                  className={`category-pill${activeCategory === c.slug ? ' active' : ''}`}
                  onClick={() => setActiveCategory(c.slug)}
                >
                  {c.name} ({count})
                </button>
              );
            })}
          </nav>
        </div>

        {isLoading ? (
          <div className="products-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : filteredProducts.length > 0 ? (
          <div className="products-grid">
            {filteredProducts.map((prod) => {
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
                  key={prod.id}
                  className="product-card"
                  onClick={() => handleSelectProduct(prod)}
                >
                  {/* Badges de Conversión Dinámicos */}
                  {prod.slug.includes('anual') && (
                    <span className="product-badge-featured primary">Ahorra 20%</span>
                  )}
                  {prod.slug.includes('mensual') && (
                    <span className="product-badge-featured secondary">Popular</span>
                  )}
                  {prod.categories?.slug === 'plantillas' && (
                    <span className="product-badge-featured secondary">Premium</span>
                  )}
                  {prod.categories?.slug === 'recursos' && (
                    <span className="product-badge-featured secondary">Recurso</span>
                  )}

                  <div className="product-thumb-container">
                    <img
                      className="product-thumb"
                      src={getProductImage(prod.thumbnail_url, prod.slug, prod.categories?.slug)}
                      alt={prod.title}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  <div className="product-info">
                    <div className="product-card-meta">
                      {prod.categories && <span className="product-card-category">{prod.categories.name}</span>}
                      <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                        {!prod.is_active && (
                          <span className="product-badge-inactive">
                            Inactivo
                          </span>
                        )}
                      </div>
                    </div>
                    <h3 className="product-card-title">{prod.title}</h3>
                    <div className="product-card-pricing" style={{ marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {prod.payment_modes !== 'points' && prod.price_cop !== null && prod.price_cop !== undefined && (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--orange-deep)' }}>
                            {(() => {
                              const priceLocal = prod.price_cop * exchangeRate;
                              const hasDecimals = userCurrency !== 'COP';
                              return `$${priceLocal.toLocaleString(userCurrency === 'COP' ? 'es-CO' : 'en-US', {
                                minimumFractionDigits: hasDecimals ? 2 : 0,
                                maximumFractionDigits: hasDecimals ? 2 : 0,
                              })} ${userCurrency}`;
                            })()}
                          </span>
                          {userCurrency !== 'USD' && (
                            <span style={{ fontSize: '0.8rem', color: 'var(--brown-dark)', opacity: 0.6, fontWeight: 700 }}>
                              ~ ${prod.price_cop.toFixed(2)} USD
                            </span>
                          )}
                        </div>
                      )}
                      {prod.payment_modes !== 'money' && prod.points_price !== null && prod.points_price !== undefined && (
                        <span className="product-card-points-badge">
                          {prod.points_price} pts
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="card-redeem-button available"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectProduct(prod);
                      }}
                    >
                      Ver detalles
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="catalog-empty-state">
            <Package size={48} />
            <h4>No hay productos disponibles</h4>
            <p>Por ahora no se encontraron productos cargados en esta categoría.</p>
          </div>
        )}
      </div>
    </div>
  );
}