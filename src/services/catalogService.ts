import { supabase } from '../lib/supabaseClient';
import { getCachedData } from '../lib/queryCache';

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

export interface Product {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  short_description: string | null;
  price_cop: number | null;
  price_usd?: number | null;
  points_price: number | null;
  thumbnail_url: string | null;
  file_path?: string | null;
  credentials?: string | null;
  is_active?: boolean;
  accordions?: AccordionItem[] | null;
  plans?: PricingPlan[] | null;
  visibility?: string;
  payment_modes?: 'money' | 'points' | 'both';
  categories?: {
    name: string;
    slug: string;
  } | null;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
}

export interface PaymentMethod {
  id?: string;
  name: string;
  type: 'nequi' | 'paypal' | 'bancolombia' | 'mercadopago' | 'binance' | 'other';
  account_value: string | null;
  instructions: string | null;
  qr_image_url: string | null;
  is_active: boolean;
}

export const catalogService = {
  async getUserPoints(userId: string): Promise<number> {
    const { data } = await supabase
      .from('profiles')
      .select('points')
      .eq('id', userId)
      .maybeSingle();
    return data?.points || 0;
  },

  async getUserProfile(userId: string): Promise<{ points: number; subscription_tier: 'free' | 'mensual' | 'anual' }> {
    const { data } = await supabase
      .from('profiles')
      .select('points, subscription_tier')
      .eq('id', userId)
      .maybeSingle();

    return {
      points: data?.points || 0,
      subscription_tier: (data?.subscription_tier as 'free' | 'mensual' | 'anual') || 'free'
    };
  },

  async getPaymentMethods(): Promise<PaymentMethod[]> {
    const { data } = await supabase
      .from('payment_methods')
      .select('name, type, account_value, instructions, qr_image_url, is_active')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    return (data as PaymentMethod[]) || [];
  },

  async getCatalogData(forceRefresh = false, isSuperAdmin = false): Promise<{ categories: Category[]; products: Product[] }> {
    const cacheKey = isSuperAdmin ? 'catalog_products_superadmin' : 'catalog_products';
    return getCachedData<{
      categories: Category[];
      products: Product[];
    }>(
      cacheKey,
      async () => {
        const categoriesQuery = supabase.from('categories').select('*').order('name');
        let productsQuery = supabase.from('products_with_plans').select('*, categories(name, slug)');
        
        if (!isSuperAdmin) {
          productsQuery = productsQuery.eq('is_active', true);
        }
        
        productsQuery = productsQuery.order('created_at', { ascending: false });

        const [
          { data: categoriesData },
          { data: productsData }
        ] = await Promise.all([
          categoriesQuery,
          productsQuery
        ]);
        return {
          categories: (categoriesData as Category[]) || [],
          products: (productsData as Product[]) || []
        };
      },
      30000, // 30 seconds
      forceRefresh,
      2,
      false
    );
  }
};
