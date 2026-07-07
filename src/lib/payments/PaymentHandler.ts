export interface AccordionItem {
  title: string;
  content: string;
  items: string[];
}

export interface PricingPlan {
  id: string;
  name: string;
  price_cop: number;
  price_usd?: number | null;
  points_price: number;
  short_description: string;
  description: string;
  require_new_account?: boolean;
  bulk_pricing?: Record<string, number> | null;
  accordions?: AccordionItem[] | null;
}

export interface PaymentRequest {
  productId: string;
  paymentMethodId?: string;
  paymentMethodType?: string;
  quantity: number;
  userId: string;
  payerName?: string;       // para Nequi
  bankName?: string;        // para Nequi
  paymentDate?: string;     // para Nequi
  planId?: string;          // para planes de precios dinámicos
  binanceOrderId?: string;  // para Binance Pay
  binanceAmount?: number;   // para Binance Pay
  guestEmail?: string;      // para Checkout modo invitado
  guestName?: string;       // para Checkout modo invitado
  exchangeRate?: number;    // TRM para conversiones dinámicas en backend local
}

export interface PaymentResponse {
  success: boolean;
  orderId?: string;
  approveUrl?: string;       // para PayPal y Mercado Pago redirects
  uploadUrl?: string;        // para Nequi upload
  uploadPath?: string;       // para Nequi upload
  alreadyApproved?: boolean; // para Nequi matching instantáneo
  redemptionCode?: string;   // código de canje generado
  error?: string;
}

export interface PaymentHandler {
  initiate(request: PaymentRequest): Promise<PaymentResponse>;
}
