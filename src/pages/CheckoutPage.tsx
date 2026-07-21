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
    if (!session) return;

    const loadData = async () => {
      try {
        const slug = localStorage.getItem('jacko_trigger_checkout_slug');
        if (!slug) {
          navigate('/dashboard', { replace: true });
          return;
        }

        // Cargar catálogo para buscar el producto pendiente
        const catalog = await catalogService.getCatalogData(false, false);
        const prod = catalog.products.find((p) => p.slug === slug);
        if (!prod) {
          navigate('/dashboard', { replace: true });
          return;
        }

        // Cargar métodos de pago
        const methods = await catalogService.getPaymentMethods();

        setProduct(prod);
        setPaymentMethods(methods);
      } catch (err) {
        console.error("Error loading checkout data:", err);
        navigate('/dashboard', { replace: true });
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [session, navigate]);

  if (!session) return null;
  if (isLoading) return <LoadingScreen />;
  if (!product) return null;

  const qtyStr = localStorage.getItem('jacko_trigger_checkout_qty');
  const initialQty = qtyStr ? parseInt(qtyStr, 10) : 1;

  const handleCleanStorageAndNavigate = () => {
    localStorage.removeItem('jacko_trigger_checkout_slug');
    localStorage.removeItem('jacko_trigger_checkout_qty');
    navigate('/dashboard');
  };

  return (
    <CheckoutView
      userId={session.user.id}
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
