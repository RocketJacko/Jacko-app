import type { PaymentHandler } from './PaymentHandler';
import { NequiPaymentHandler } from './NequiPaymentHandler';
import { PaypalPaymentHandler } from './PaypalPaymentHandler';
import { BinancePaymentHandler } from './BinancePaymentHandler';
import { MercadopagoPaymentHandler } from './MercadopagoPaymentHandler';

export class PaymentHandlerFactory {
  static getHandler(
    methodType: 'nequi' | 'bre_b' | 'paypal' | 'binance' | 'mercadopago'
  ): PaymentHandler {
    switch (methodType) {
      case 'nequi':
      case 'bre_b':
        return new NequiPaymentHandler();
      case 'paypal':
        return new PaypalPaymentHandler();
      case 'binance':
        return new BinancePaymentHandler();
      case 'mercadopago':
        return new MercadopagoPaymentHandler();
      default:
        throw new Error(`Método de pago no soportado: ${methodType}`);
    }
  }
}
