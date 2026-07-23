import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { invalidateCache, invalidateCacheByPrefix } from '../lib/queryCache';

export interface UseOrderSubscriptionProps {
  orderId: string | undefined;
  userId: string;
  onApproved: () => void;
  onCancelled?: () => void;
}

export function useOrderSubscription({
  orderId,
  userId,
  onApproved,
  onCancelled,
}: UseOrderSubscriptionProps) {
  useEffect(() => {
    if (!orderId) return;

    console.log(`[useOrderSubscription] Subscribing to updates for order: ${orderId}`);

    const channel = supabase
      .channel(`checkout-pending-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          const status = payload.new?.status;
          console.log(`[useOrderSubscription] Order ${orderId} status updated:`, status);
          if (status === 'approved' || status === 'procesando' || status === 'procesado') {
            invalidateCacheByPrefix('catalog_products');
            invalidateCache('dashboard_data_' + userId);
            onApproved();
          } else if (status === 'cancelled' || status === 'expired') {
            invalidateCache('dashboard_data_' + userId);
            if (onCancelled) {
              onCancelled();
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, userId, onApproved, onCancelled]);
}
