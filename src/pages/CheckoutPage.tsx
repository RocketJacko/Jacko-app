import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { CheckoutView } from "../components/views/CheckoutView";
import { catalogService } from "../services/catalogService";
import type { Product, PaymentMethod } from "../services/catalogService";
import { LoadingScreen } from "../components/layout/LoadingScreen";

export function CheckoutPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [product, setProduct] = useState<Product | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      try {
        const slug = localStorage.getItem('jacko_trigger_checkout_slug') || 'plan-anual';

        // Cargar catálogo para buscar el producto activo (disponible públicamente)
        const catalog = await catalogService.getCatalogData(false, false);
        let prod = catalog.products.find((p) => p.slug === slug);
        if (!prod && catalog.products.length > 0) {
          prod = catalog.products[0];
        }
        if (!prod) {
          if (active) navigate('/', { replace: true });
          return;
        }

        // Cargar métodos de pago activos
        const methods = await catalogService.getPaymentMethods();

        if (active) {
          setProduct(prod);
          setPaymentMethods(methods);
        }
      } catch (err) {
        console.error("Error cargando datos de checkout:", err);
        if (active) navigate('/', { replace: true });
      } finally {
        if (active) setIsLoading(false);
      }
    };

    loadData();

    return () => {
      active = false;
    };
  }, [navigate]);

  if (isLoading) return <LoadingScreen />;
  if (!product) return null;

  const qtyStr = localStorage.getItem('jacko_trigger_checkout_qty');
  const initialQty = qtyStr ? parseInt(qtyStr, 10) : 1;

  const handleCleanStorageAndNavigate = () => {
    localStorage.removeItem('jacko_trigger_checkout_slug');
    localStorage.removeItem('jacko_trigger_checkout_qty');
    if (session) {
      navigate('/dashboard');
    } else {
      navigate('/');
    }
  };

  return (
    <CheckoutView
      userId={session?.user?.id || ""}
      product={product}
      paymentMethods={paymentMethods}
      initialQuantity={initialQty > 0 ? initialQty : 1}
      onBackToCatalog={handleCleanStorageAndNavigate}
      onSuccess={handleCleanStorageAndNavigate}
      onNavigateToDashboard={handleCleanStorageAndNavigate}
    />
  );
}

export default CheckoutPage;
