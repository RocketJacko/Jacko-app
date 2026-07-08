import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Package, Search } from 'lucide-react';
import './CatalogView.css';
import { CheckoutView } from './CheckoutView';
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
  } | null>(null);
  const [checkoutProduct, setCheckoutProduct] = useState<Product | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  const getProductImage = (url: string | null) => {
    if (!url || url.includes('placeholder.svg')) {
      return 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop';
    }
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) {
      return url;
    }
    return `https://plybwnfnmvshroaottby.supabase.co/storage/v1/object/public/thumbnails/${url}`;
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

  /* Cargar métodos de pago activos */
  const loadPaymentMethods = useCallback(async () => {
    try {
      const methods = await catalogService.getPaymentMethods();
      setPaymentMethods(methods);
    } catch (err) {
      console.error('Error loading payment methods:', err);
    }
  }, []);

  /* Cargar catálogo (datos públicos/privados según rol e invitación) */
  const loadCatalog = useCallback(
    async (forceRefresh = false) => {
      /* Carga optimista: si ya hay productos en estado, no mostrar spinner. */
      /* El fetch actualiza los datos silenciosamente en background. */
      if (products.length === 0) setIsLoading(true);
      try {
        const data = await catalogService.getCatalogData(forceRefresh, isSuperAdmin);
        const userCtx = {
          isSuperAdmin,
          subscriptionTier: userProfile?.subscription_tier || 'free',
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
      } catch (err: unknown) {
        console.error('Error loading catalog:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [isSuperAdmin, userProfile, products.length]
  );

  /* Carga reactiva del catálogo cuando cambian los permisos o perfil */
  useEffect(() => {
    let active = true;
    const fetchCatalog = async () => {
      await Promise.resolve();
      if (active) {
        await loadCatalog(false);
      }
    };
    fetchCatalog();
    return () => {
      active = false;
    };
  }, [loadCatalog]);

  /* Carga de metadatos del usuario en el primer renderizado */
  useEffect(() => {
    let active = true;
    const fetchUserData = async () => {
      await Promise.resolve();
      if (active) {
        await loadUserProfile();
        await loadPaymentMethods();
      }
    };
    fetchUserData();
    return () => {
      active = false;
    };
  }, [loadUserProfile, loadPaymentMethods]);

  useEffect(() => {
    if (products.length > 0) {
      const triggerSlug = localStorage.getItem('jacko_trigger_checkout_slug');
      if (triggerSlug) {
        const prod = products.find((p) => p.slug === triggerSlug);
        if (prod) {
          setTimeout(() => {
            setCheckoutProduct(prod);
          }, 0);
        }
        localStorage.removeItem('jacko_trigger_checkout_slug');
      }
    }
  }, [products]);
  const handleSelectProduct = (prod: Product) => {
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

  if (checkoutProduct) {
    return (
      <CheckoutView
        userId={userId}
        product={checkoutProduct}
        paymentMethods={paymentMethods}
        onBackToCatalog={() => setCheckoutProduct(null)}
        onSuccess={() => {
          loadUserProfile();
          onRedeemSuccess();
        }}
        onNavigateToDashboard={onNavigateToDashboard}
      />
    );
  }

  return (
    <div className="catalog-wrapper">
      <div className="catalog-content-container">
        <header className="catalog-header">
          <div className="header-text-group">
            <h2>{userId === 'guest' ? 'Nuestros Servicios' : 'Catálogo de Recompensas'}</h2>
          </div>
        </header>

        {/* Buscador y Filtros */}
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
          <div className="catalog-shimmer-grid">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="shimmer-card">
                <div className="shimmer-img"></div>
                <div className="shimmer-info">
                  <div className="shimmer-line short"></div>
                  <div className="shimmer-line"></div>
                  <div className="shimmer-line btn"></div>
                </div>
              </div>
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
                  <div className="product-thumb-container">
                    <img
                      className="product-thumb"
                      src={getProductImage(prod.thumbnail_url)}
                      alt={prod.title}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  <div className="product-info">
                    <div className="product-card-meta">
                      {prod.categories && <span className="product-card-category">{prod.categories.name}</span>}
                      <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                        {prod.visibility === 'invited_only' && (
                          <span
                            style={{
                              background: 'rgba(212, 98, 26, 0.12)',
                              color: 'var(--orange-base)',
                              fontSize: '0.75rem',
                              fontWeight: 800,
                              padding: '2px 8px',
                              borderRadius: '4px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.03em',
                            }}
                          >
                            Exclusivo
                          </span>
                        )}
                        {!prod.is_active && (
                          <span
                            style={{
                              background: 'rgba(239, 68, 68, 0.12)',
                              color: '#ef4444',
                              fontSize: '0.75rem',
                              fontWeight: 800,
                              padding: '2px 8px',
                              borderRadius: '4px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.03em',
                            }}
                          >
                            Inactivo
                          </span>
                        )}
                      </div>
                    </div>
                    <h3 className="product-card-title">{prod.title}</h3>
                    <div className="product-card-pricing" style={{ marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {prod.payment_modes !== 'points' && prod.price_cop !== null && prod.price_cop !== undefined && (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                          <span style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--brown-dark)' }}>
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
                            <span style={{ fontSize: '0.75rem', color: 'var(--brown-dark)', opacity: 0.6, fontWeight: 700 }}>
                              ~ ${prod.price_cop.toFixed(2)} USD
                            </span>
                          )}
                        </div>
                      )}
                      {prod.payment_modes !== 'money' && prod.points_price !== null && prod.points_price !== undefined && (
                        <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--orange-base)' }}>
                          {prod.points_price} pts
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="card-redeem-button"
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