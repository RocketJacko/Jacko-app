import { describe, it, expect } from 'vitest';
import { PriceCalculator } from './PriceCalculator';
import type { Product, PricingPlan } from '../../components/views/checkout/types';

describe('PriceCalculator', () => {
  // Mock products
  const standardProduct: Product = {
    id: 'prod-1',
    slug: 'git-basico',
    title: 'Git Básico',
    price_cop: 12, // $12.00 USD
    short_description: 'Curso básico de Git',
    thumbnail_url: null,
  };

  const gitGithubProduct: Product = {
    id: 'prod-2',
    slug: 'mini-curso-git-github',
    title: 'Curso Git y GitHub',
    price_cop: 39, // $39.00 USD
    short_description: 'Curso avanzado de Git y GitHub',
    thumbnail_url: null,
    bulk_pricing: {
      '1': 140000 / 3700,
      '2': 220000 / 3700,
      '3': 240000 / 3700,
      '4': 240000 / 3700,
      '5': 300000 / 3700,
    }
  };

  // Mock plans
  const standardPlan: PricingPlan = {
    id: 'plan-1',
    name: 'Plan Mensual',
    price_cop: 8, // $8.00 USD
    short_description: 'Acceso mensual',
    description: 'Suscripción mensual',
  };

  const bulkPricingPlan: PricingPlan = {
    id: 'plan-bulk',
    name: 'Plan Mayorista',
    price_cop: 12, // $12.00 USD
    short_description: 'Plan con precios especiales por volumen',
    description: 'Acceso corporativo',
    bulk_pricing: {
      '1': 12,
      '2': 22,
      '3': 30,
    },
  };

  const pagoUnicoBulkPlan: PricingPlan = {
    id: 'pago-unico',
    name: 'Plan Pago Único',
    price_cop: 17.5, // $17.50 USD
    short_description: 'Pago único por volumen',
    description: 'Pago único',
    bulk_pricing: {
      '1': 16.2,
    },
  };

  describe('getBasePriceCop', () => {
    it('debe retornar el precio del plan si hay un plan seleccionado', () => {
      const price = PriceCalculator.getBasePriceCop(standardProduct, standardPlan);
      expect(price).toBe(29600); // 8.00 * 3700
    });

    it('debe retornar el precio del producto si no hay plan seleccionado', () => {
      const price = PriceCalculator.getBasePriceCop(standardProduct, null);
      expect(price).toBe(44400); // 12.00 * 3700
    });

    it('debe retornar 0 si el producto no tiene precio y no hay plan', () => {
      const freeProduct = { ...standardProduct, price_cop: null };
      const price = PriceCalculator.getBasePriceCop(freeProduct, null);
      expect(price).toBe(0);
    });
  });

  describe('calculateTotalPriceCop', () => {
    it('debe calcular el precio regular multiplicando base por cantidad cuando no hay descuentos', () => {
      const total = PriceCalculator.calculateTotalPriceCop({
        product: standardProduct,
        selectedPlan: standardPlan,
        quantity: 3,
      });
      expect(total).toBe(88800); // 3 * 8.00 * 3700
    });

    it('debe retornar el precio de bulk pricing si la cantidad exacta está definida en el plan', () => {
      const total = PriceCalculator.calculateTotalPriceCop({
        product: standardProduct,
        selectedPlan: bulkPricingPlan,
        quantity: 2,
      });
      expect(total).toBe(81400); // 22.00 * 3700
    });

    it('debe usar el fallback de 60000 por unidad si el plan es pago-unico y la cantidad no está definida en bulk_pricing', () => {
      const total = PriceCalculator.calculateTotalPriceCop({
        product: standardProduct,
        selectedPlan: pagoUnicoBulkPlan,
        quantity: 5,
      });
      expect(total).toBe(300000); // 5 * 60000
    });

    it('debe aplicar la regla especial de mini-curso-git-github cuando no hay plan seleccionado', () => {
      // 1 unidad: 140000
      expect(PriceCalculator.calculateTotalPriceCop({
        product: gitGithubProduct,
        selectedPlan: null,
        quantity: 1,
      })).toBe(140000);

      // 2 unidades: 220000
      expect(PriceCalculator.calculateTotalPriceCop({
        product: gitGithubProduct,
        selectedPlan: null,
        quantity: 2,
      })).toBe(220000);

      // 3 unidades: 240000
      expect(PriceCalculator.calculateTotalPriceCop({
        product: gitGithubProduct,
        selectedPlan: null,
        quantity: 3,
      })).toBe(240000);

      // 4 unidades: 240000
      expect(PriceCalculator.calculateTotalPriceCop({
        product: gitGithubProduct,
        selectedPlan: null,
        quantity: 4,
      })).toBe(240000);

      // >= 5 unidades: qty * 60000
      expect(PriceCalculator.calculateTotalPriceCop({
        product: gitGithubProduct,
        selectedPlan: null,
        quantity: 5,
      })).toBe(300000); // 5 * 60000
    });
  });

  describe('calculateRegularPrice', () => {
    it('debe calcular el precio base multiplicado por la cantidad sin aplicar descuentos', () => {
      const regular = PriceCalculator.calculateRegularPrice(gitGithubProduct, null, 3);
      expect(regular).toBe(432900); // 3 * 39.00 * 3700
    });
  });

  describe('calculateSavings', () => {
    it('debe calcular el ahorro como la diferencia entre regular y total descontado', () => {
      const savings = PriceCalculator.calculateSavings({
        product: gitGithubProduct,
        selectedPlan: null,
        quantity: 3,
      });
      // Regular: 39.00 * 3 * 3700 = 432900
      // Total con descuento: 240000
      // Ahorro: 432900 - 240000 = 192900
      expect(savings).toBe(192900);
    });

    it('debe retornar 0 si no hay ahorro o si el total es mayor que el regular', () => {
      const savings = PriceCalculator.calculateSavings({
        product: standardProduct,
        selectedPlan: standardPlan,
        quantity: 2,
      });
      expect(savings).toBe(0);
    });
  });

  describe('calculateUsdPriceApprox', () => {
    it('debe retornar el valor aproximado en USD como string con 2 decimales', () => {
      const usd = PriceCalculator.calculateUsdPriceApprox(100000, 4000);
      expect(usd).toBe('25.00');
    });

    it('debe manejar decimales correctamente', () => {
      const usd = PriceCalculator.calculateUsdPriceApprox(100000, 3750);
      expect(usd).toBe('26.67'); // 100000 / 3750 = 26.6666...
    });
  });
});
