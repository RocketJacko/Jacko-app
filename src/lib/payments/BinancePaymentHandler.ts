import { BasePaymentHandler } from './BasePaymentHandler';
import type { PaymentRequest, PaymentResponse } from './PaymentHandler';

export class BinancePaymentHandler extends BasePaymentHandler {
  protected getFunctionName(): string {
    return 'binance-verify-payment?forceFunctionRegion=eu-central-1';
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected getInvokeOptions(): Record<string, any> {
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      region: 'eu-central-1' as any, // Fuerza la región en el SDK de Supabase
      headers: {
        'x-region': 'eu-central-1', // Fuerza la región vía cabecera HTTP
      },
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected buildRequestBody(request: PaymentRequest): Record<string, any> {
    return {
      productId: request.productId,
      paymentMethodId: request.paymentMethodId,
      paymentMethodType: request.paymentMethodType,
      quantity: request.quantity,
      planId: request.planId,
      binanceOrderId: request.binanceOrderId,
      binanceAmount: request.binanceAmount,
      userId: request.userId,
      guestEmail: request.guestEmail,
      guestName: request.guestName,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected parseResponse(data: any): Partial<PaymentResponse> {
    return {
      success: data.success ?? false,
      alreadyApproved: data.success ?? false,
      redemptionCode: data.redemptionCode,
      error: data.error,
    };
  }
}
