import { supabase } from '../supabaseClient';
import type { PaymentHandler, PaymentRequest, PaymentResponse } from './PaymentHandler';

export abstract class BasePaymentHandler implements PaymentHandler {
  protected abstract getFunctionName(): string;
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected abstract buildRequestBody(request: PaymentRequest): Record<string, any>;
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected abstract parseResponse(data: any): Partial<PaymentResponse>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected getInvokeOptions(): Record<string, any> {
    return {};
  }

  async initiate(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      const functionName = this.getFunctionName();
      const body = this.buildRequestBody(request);
      const options = this.getInvokeOptions();

      // Ensure user's access token is explicitly sent to Edge Functions
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const headers = {
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const { data, error } = await supabase.functions.invoke(functionName, {
        body,
        ...options,
        headers,
      });

      if (error || !data) {
        return {
          success: false,
          error: error?.message || `Error al conectar con la pasarela de pagos.`,
        };
      }

      return {
        success: data.success ?? true,
        orderId: data.orderId || data.localOrderId || data.paypalOrderId || data.preferenceId,
        ...this.parseResponse(data),
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Error desconocido al procesar el pago.';
      return {
        success: false,
        error: message,
      };
    }
  }
}
