import { supabase } from '../lib/supabaseClient';
import { getCachedData } from '../lib/queryCache';
import type { Profile, Order } from '../components/views/dashboard/types';

export interface DashboardData {
  profile: Profile | null;
  orders: Order[];
}

export const userService = {
  async getDashboardData(userId: string, forceRefresh = false): Promise<DashboardData> {
    return getCachedData<DashboardData>(
      'dashboard_data_' + userId,
      async () => {
        const [
          { data: profileData },
          { data: ordersData }
        ] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
          supabase.from('orders').select('*, products(title, slug), payment_methods(type, name)').eq('user_id', userId).order('created_at', { ascending: false }).limit(30)
        ]);
        return {
          profile: profileData as Profile | null,
          orders: (ordersData as Order[]) || []
        };
      },
      10000, // 10 seconds cache
      forceRefresh,
      2,
      false
    );
  },

  async verifyPaypalOrder(paypalOrderId: string): Promise<{ success: boolean; status: string; message?: string }> {
    const { data, error } = await supabase.functions.invoke('paypal-capture-order', {
      body: { paypalOrderId }
    });
    if (error) {
      throw new Error(error.message || 'El pago aún no ha sido completado o no se pudo verificar.');
    }
    if (!data) {
      throw new Error('No se recibió respuesta del servidor de verificación.');
    }
    return data;
  },

  async activateOrder(
    orderId: string,
    firstName: string,
    lastName: string,
    email: string
  ): Promise<{ success: boolean; activatedCount: number; totalQuantity: number; message: string }> {
    const { data, error } = await supabase.functions.invoke('activate-order', {
      body: { orderId, firstName, lastName, email }
    });
    if (error) {
      // AbortError = el cliente esperó 50s sin respuesta del servidor
      if (error.name === 'AbortError' || error.message?.includes('aborted')) {
        throw new Error(
          'El servidor de activación no respondió en el tiempo esperado (50s). ' +
          'Es posible que la activación haya sido procesada igualmente. ' +
          'Recarga la página para verificar el estado de tu orden.'
        );
      }

      let customMsg = error.message;
      const httpError = error as { context?: { json?: () => Promise<{ error?: string }> } };
      if (httpError.context && typeof httpError.context.json === 'function') {
        try {
          const body = await httpError.context.json();
          if (body && body.error) {
            customMsg = body.error;
          }
        } catch {
          // ignore
        }
      }
      throw new Error(customMsg || 'Ocurrió un error al intentar activar el servicio.');
    }
    if (!data) {
      throw new Error('No se recibió respuesta del servidor de activación.');
    }
    return data;
  }
};
