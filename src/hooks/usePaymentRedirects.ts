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
  setIsVerifyingRedirect: (verifying: boolean) => void,
  showModal: (title: string, message: string) => void,
  showToast: (message: string, type: 'success' | 'error') => void
) {
  // ── Retorno de redirección PayPal ─────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paypalStatus = params.get('paypal_status');
    const token = params.get('token'); // paypalOrderId

    if ((paypalStatus === 'success' && token) || paypalStatus === 'cancel') {
      const handlePaypalReturn = async () => {
        await Promise.resolve();

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
              if (session) {
                invalidateCache('dashboard_data_' + session.user.id);
              }
              invalidateCacheByPrefix('catalog_products');
              showToast('¡Pago procesado con éxito!', 'success');
              
              if (session) {
                showModal('¡Pago exitoso!', '¡Pago aprobado con éxito! Tu orden ha sido aprobada y tu producto está activo en tu Dashboard.');
                setCurrentView('dashboard');
              } else {
                showModal(
                  '¡Pago exitoso!',
                  '¡Pago aprobado con éxito! Tu cuenta temporal ha sido creada. Por favor ingresa con tu correo electrónico en la sección de ingreso para acceder a tus productos.'
                );
                setCurrentView('landing');
              }
            }
          } catch (err: unknown) {
            console.error('Error capturing redirected PayPal payment:', err);
            const msg =
              err instanceof Error ? err.message : 'No se pudo completar la verificación del pago.';
            showToast('Error en el pago', 'error');
            showModal('Error de Verificación', `No se pudo completar la verificación del pago: ${msg}`);
          } finally {
            setIsVerifyingRedirect(false);
            cleanSearchParams();
          }
        } else if (paypalStatus === 'cancel') {
          showToast('Pago cancelado', 'error');
          showModal('Pago Cancelado', 'El pago de PayPal fue cancelado por el usuario.');
          cleanSearchParams();
          setCurrentView('catalogo');
        }
      };

      handlePaypalReturn();
    }
  }, [session, setCurrentView, setIsVerifyingRedirect, showModal, showToast]);

  // ── Retorno de redirección Mercado Pago ───────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mpStatus = params.get('mercadopago_status');

    if (mpStatus === 'success' || mpStatus === 'failure' || mpStatus === 'pending') {
      const handleMercadopagoReturn = async () => {
        await Promise.resolve();

        if (mpStatus === 'success') {
          if (session) {
            invalidateCache('dashboard_data_' + session.user.id);
            showModal('¡Pago exitoso!', '¡Pago procesado con éxito! Tu orden está activa en tu Dashboard.');
            setCurrentView('dashboard');
          } else {
            showModal(
              '¡Pago exitoso!',
              '¡Pago procesado con éxito! Tu cuenta temporal ha sido creada. Por favor ingresa con tu correo electrónico en la sección de ingreso para acceder a tus productos.'
            );
            setCurrentView('landing');
          }
          invalidateCacheByPrefix('catalog_products');
          showToast('¡Pago procesado con éxito!', 'success');
        } else if (mpStatus === 'failure') {
          showToast('Pago fallido', 'error');
          showModal('Pago Rechazado', 'El pago de Mercado Pago fue rechazado o cancelado.');
          setCurrentView('catalogo');
        } else if (mpStatus === 'pending') {
          showToast('Pago pendiente', 'error');
          if (session) {
            showModal('Pago Pendiente', 'El pago está pendiente de aprobación (ej. pago en efectivo o PSE en proceso). Podrás ver el estado en tu Dashboard.');
            setCurrentView('dashboard');
          } else {
            showModal('Pago Pendiente', 'El pago está pendiente de aprobación. Una vez verificado, recibirás un correo para ingresar a tu cuenta.');
            setCurrentView('landing');
          }
        }

        cleanSearchParams();
      };

      handleMercadopagoReturn();
    }
  }, [session, setCurrentView, showModal, showToast]);
}
