import { useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { invalidateCache, invalidateCacheByPrefix } from '../lib/queryCache';
import type { AppView } from '../App';

/** Elimina todos los query params de la URL actual sin recargar la página. */
function cleanSearchParams(): void {
  const cleanUrl =
    window.location.protocol + '//' + window.location.host + window.location.pathname;
  window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
}

export function usePaymentRedirects(
  session: Session | null,
  setCurrentView: (view: AppView) => void,
  setIsVerifyingRedirect: (verifying: boolean) => void
) {
  // ── Retorno de redirección PayPal ─────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paypalStatus = params.get('paypal_status');
    const token = params.get('token'); // paypalOrderId

    if ((paypalStatus === 'success' && token) || paypalStatus === 'cancel') {
      const handlePaypalReturn = async () => {
        await Promise.resolve();
        if (!session) return;

        if (paypalStatus === 'success' && token) {
          setIsVerifyingRedirect(true);
          try {
            const { data, error } = await supabase.functions.invoke('paypal-capture-order', {
              body: { paypalOrderId: token },
            });
            if (error || !data) {
              throw new Error(error?.message || 'Error al capturar el pago en el servidor.');
            }
            if (data.success && data.status === 'approved') {
              invalidateCache('dashboard_data_' + session.user.id);
              invalidateCacheByPrefix('catalog_products');
              alert('¡Pago capturado con éxito! Tu orden ha sido aprobada y tu producto está activo en tu Dashboard.');
              setCurrentView('dashboard');
            }
          } catch (err: unknown) {
            console.error('Error capturing redirected PayPal payment:', err);
            const msg =
              err instanceof Error ? err.message : 'No se pudo completar la verificación del pago.';
            alert(`Error en verificación de pago: ${msg}`);
          } finally {
            setIsVerifyingRedirect(false);
            cleanSearchParams();
          }
        } else if (paypalStatus === 'cancel') {
          alert('Pago de PayPal cancelado por el usuario.');
          cleanSearchParams();
          setCurrentView('catalogo');
        }
      };

      handlePaypalReturn();
    }
  }, [session, setCurrentView, setIsVerifyingRedirect]);

  // ── Retorno de redirección Mercado Pago ───────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mpStatus = params.get('mercadopago_status');

    if (mpStatus === 'success' || mpStatus === 'failure' || mpStatus === 'pending') {
      const handleMercadopagoReturn = async () => {
        await Promise.resolve();
        if (!session) return;

        if (mpStatus === 'success') {
          invalidateCache('dashboard_data_' + session.user.id);
          invalidateCacheByPrefix('catalog_products');
          alert('¡Pago procesado con éxito! Tu orden está activa en tu Dashboard.');
          setCurrentView('dashboard');
        } else if (mpStatus === 'failure') {
          alert('El pago de Mercado Pago fue rechazado o cancelado.');
          setCurrentView('catalogo');
        } else if (mpStatus === 'pending') {
          alert(
            'El pago está pendiente de aprobación (ej. pago en efectivo o PSE en proceso). Podrás ver el estado en tu Dashboard.',
          );
          setCurrentView('dashboard');
        }

        cleanSearchParams();
      };

      handleMercadopagoReturn();
    }
  }, [session, setCurrentView]);
}
