import { BasePaymentHandler } from './BasePaymentHandler';
import type { PaymentRequest, PaymentResponse } from './PaymentHandler';

export class PaypalPaymentHandler extends BasePaymentHandler {
  protected getFunctionName(): string {
    return 'paypal-create-order';
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected buildRequestBody(request: PaymentRequest): Record<string, any> {
    return {
      productId: request.productId,
      paymentMethodId: request.paymentMethodId,
      paymentMethodType: request.paymentMethodType,
      quantity: request.quantity,
      planId: request.planId,
      guestEmail: request.guestEmail,
      guestName: request.guestName,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected parseResponse(data: any): Partial<PaymentResponse> {
    return {
      approveUrl: data.approveUrl,
    };
  }
}
