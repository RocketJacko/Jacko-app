import { BasePaymentHandler } from './BasePaymentHandler';
import type { PaymentRequest, PaymentResponse } from './PaymentHandler';

export class NequiPaymentHandler extends BasePaymentHandler {
  protected getFunctionName(): string {
    return 'nequi-create-order';
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected buildRequestBody(request: PaymentRequest): Record<string, any> {
    return {
      productId: request.productId,
      paymentMethodId: request.paymentMethodId,
      paymentMethodType: request.paymentMethodType,
      payerName: request.payerName,
      bankName: request.bankName,
      paymentDate: request.paymentDate,
      quantity: request.quantity,
      planId: request.planId,
      guestEmail: request.guestEmail,
      guestName: request.guestName,
      exchangeRate: request.exchangeRate,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected parseResponse(data: any): Partial<PaymentResponse> {
    return {
      uploadUrl: data.uploadUrl,
      uploadPath: data.uploadPath,
      alreadyApproved: data.alreadyApproved,
    };
  }
}
