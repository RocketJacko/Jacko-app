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
  short_description: string;
  description: string;
  require_new_account?: boolean;
  bulk_pricing?: Record<string, number> | null;
  accordions?: AccordionItem[] | null;
}

export interface Product {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  short_description: string | null;
  price_cop: number | null;
  price_usd?: number | null;
  thumbnail_url: string | null;
  file_path?: string | null;
  credentials?: string | null;
  bulk_pricing?: Record<string, number> | null;
  accordions?: AccordionItem[] | null;
  plans?: PricingPlan[] | null;
  visibility?: string | null;
  payment_modes?: string | null;
  categories?: {
    name: string;
    slug: string;
  } | null;
}

export interface PaymentMethod {
  id?: string;
  name: string;
  type: 'nequi' | 'bre_b' | 'paypal' | 'bancolombia' | 'mercadopago' | 'binance' | 'other';
  account_value: string | null;
  instructions: string | null;
  qr_image_url: string | null;
  is_active: boolean;
}

export interface ReceiptData {
  title: string;
  subtitle: string;
  amount: string;
  statusLabel: string;
  statusType: 'success' | 'pending';
  date: string;
  method: string;
  referenceId: string;
  productTitle: string;
}
