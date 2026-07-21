import { supabase } from '../supabaseClient';
import { getSupabaseConfig } from '../supabaseConfig';
import type { PaymentHandler, PaymentRequest, PaymentResponse } from './PaymentHandler';

export abstract class BasePaymentHandler implements PaymentHandler {
  protected abstract getFunctionName(): string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected abstract buildRequestBody(request: PaymentRequest): Record<string, any>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected abstract parseResponse(data: any): Partial<PaymentResponse>;

  async initiate(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      const functionName = this.getFunctionName();
      const body = this.buildRequestBody(request);

      // Obtener el JWT del usuario activo
      const { data: sessionData } = await supabase.auth.getSession();
      const userToken = sessionData?.session?.access_token;

      const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();
      const functionUrl = `${supabaseUrl}/functions/v1/${functionName}`;

      // Usar fetch directo: supabase.functions.invoke inyecta el anon key
      // en Authorization y puede sobreescribir el JWT del usuario.
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${userToken || supabaseAnonKey}`,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data) {
        const errorMsg = data?.error || `Error ${response.status} al conectar con la pasarela de pagos.`;
        return { success: false, error: errorMsg };
      }

      if (data.error) {
        return { success: false, error: data.error };
      }

      return {
        success: data.success ?? true,
        orderId: data.orderId || data.localOrderId || data.paypalOrderId || data.preferenceId,
        ...this.parseResponse(data),
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Error desconocido al procesar el pago.';
      return { success: false, error: message };
    }
  }
}
