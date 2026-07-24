import type { PaymentMethod } from './types';

/**
 * Filtra los métodos de pago disponibles según la ubicación geográfica del usuario (Colombia vs Internacional).
 */
export const getAvailablePaymentMethods = (
  paymentMethods: PaymentMethod[] = [],
  isColombia: boolean
): PaymentMethod[] => {
  if (!Array.isArray(paymentMethods)) return [];
  return paymentMethods.filter((method) => {
    if (!method) return false;
    const isLocal =
      method.type === 'bre_b' || method.type === 'nequi' || method.type === 'mercadopago';
    const isIntl = method.type === 'paypal' || method.type === 'binance';
    if (!isColombia) {
      return isIntl && (method.type === 'paypal' || method.type === 'binance');
    }
    return isLocal || isIntl;
  });
};
