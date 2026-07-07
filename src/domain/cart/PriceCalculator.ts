import type { Product, PricingPlan } from '../../components/views/checkout/types';

export class PriceCalculator {
  /**
   * Obtiene el precio base de dinero en USD para el producto o plan seleccionado.
   */
  static getBasePriceUsd(product: Product, selectedPlan: PricingPlan | null): number {
    if (selectedPlan) {
      return selectedPlan.price_cop || 0;
    }
    return product.price_cop || 0;
  }

  /**
   * Obtiene el precio base de dinero (COP) para el producto o plan seleccionado.
   */
  static getBasePriceCop(product: Product, selectedPlan: PricingPlan | null, exchangeRate: number = 3700): number {
    const baseUsd = this.getBasePriceUsd(product, selectedPlan);
    return Math.round(baseUsd * exchangeRate);
  }

  /**
   * Calcula el precio total en USD considerando descuentos por volumen (bulk pricing).
   */
  static calculateTotalPriceUsd({
    product,
    selectedPlan,
    quantity,
    exchangeRate = 3700,
  }: {
    product: Product;
    selectedPlan: PricingPlan | null;
    quantity: number;
    exchangeRate?: number;
  }): number {
    const basePriceUsd = this.getBasePriceUsd(product, selectedPlan);
    const activePricingSource = selectedPlan || product;

    if (activePricingSource && activePricingSource.bulk_pricing) {
      const qtyStr = String(quantity);
      if (activePricingSource.bulk_pricing[qtyStr] !== undefined) {
        return activePricingSource.bulk_pricing[qtyStr];
      }

      // Fallback rule for the pago-unico plan ID
      if (selectedPlan?.id === 'pago-unico') {
        return (quantity * 60000) / exchangeRate;
      }

      // Extrapolate price based on the maximum key defined in bulk pricing
      const keys = Object.keys(activePricingSource.bulk_pricing).map(Number).sort((a, b) => a - b);
      if (keys.length > 0) {
        const maxKey = keys[keys.length - 1];
        if (quantity > maxKey) {
          const maxPrice = activePricingSource.bulk_pricing[String(maxKey)];
          const unitRate = maxPrice / maxKey;
          return quantity * unitRate;
        }
      }

      return basePriceUsd * quantity;
    }

    return basePriceUsd * quantity;
  }

  /**
   * Calcula el precio total en dinero (COP) considerando descuentos por volumen (bulk pricing).
   */
  static calculateTotalPriceCop({
    product,
    selectedPlan,
    quantity,
    exchangeRate = 3700,
  }: {
    product: Product;
    selectedPlan: PricingPlan | null;
    quantity: number;
    exchangeRate?: number;
  }): number {
    const totalUsd = this.calculateTotalPriceUsd({ product, selectedPlan, quantity, exchangeRate });
    return Math.round(totalUsd * exchangeRate);
  }

  /**
   * Calcula el precio regular sin aplicar descuentos por volumen en USD.
   */
  static calculateRegularPriceUsd(product: Product, selectedPlan: PricingPlan | null, quantity: number): number {
    return this.getBasePriceUsd(product, selectedPlan) * quantity;
  }

  /**
   * Calcula el precio regular sin aplicar descuentos por volumen.
   */
  static calculateRegularPrice(product: Product, selectedPlan: PricingPlan | null, quantity: number, exchangeRate: number = 3700): number {
    return Math.round(this.calculateRegularPriceUsd(product, selectedPlan, quantity) * exchangeRate);
  }

  /**
   * Calcula el ahorro obtenido (regularPrice - totalPrice) en COP.
   */
  static calculateSavings({
    product,
    selectedPlan,
    quantity,
    exchangeRate = 3700,
  }: {
    product: Product;
    selectedPlan: PricingPlan | null;
    quantity: number;
    exchangeRate?: number;
  }): number {
    const regular = this.calculateRegularPrice(product, selectedPlan, quantity, exchangeRate);
    const total = this.calculateTotalPriceCop({ product, selectedPlan, quantity, exchangeRate });
    return regular > total ? regular - total : 0;
  }

  /**
   * Calcula el ahorro obtenido en USD.
   */
  static calculateSavingsUsd({
    product,
    selectedPlan,
    quantity,
    exchangeRate = 3700,
  }: {
    product: Product;
    selectedPlan: PricingPlan | null;
    quantity: number;
    exchangeRate?: number;
  }): number {
    const regular = this.calculateRegularPriceUsd(product, selectedPlan, quantity);
    const total = this.calculateTotalPriceUsd({ product, selectedPlan, quantity, exchangeRate });
    return regular > total ? regular - total : 0;
  }

  /**
   * Calcula la equivalencia aproximada en USD.
   */
  static calculateUsdPriceApprox(totalPriceCop: number, exchangeRate: number): string {
    return (totalPriceCop / exchangeRate).toFixed(2);
  }
}
