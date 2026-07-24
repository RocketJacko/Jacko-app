/**
 * projectDuration.ts — JACKO™ App
 * Lógica para calcular la duración restante y el precio dinámico del proyecto hasta el 31 de Diciembre.
 * 
 * Reglas de Duración:
 * - Inicia a bajar a partir de Agosto.
 * - Julio/Agosto: 5 meses.
 * - Septiembre: 4 meses.
 * - Octubre: 3 meses.
 * - Noviembre: 2 meses.
 * - Diciembre: 1 mes (hasta el 31 de Diciembre).
 * 
 * Reglas de Precio (Disparador en BD / Fallback en Cliente):
 * - Precio base inicial: 40 USD.
 * - A partir del 31 de Agosto (Septiembre en adelante), baja 8 USD por cada mes transcurrido:
 *   - Hasta 31 de Agosto: 40 USD
 *   - Septiembre: 32 USD (40 - 8)
 *   - Octubre: 24 USD (40 - 16)
 *   - Noviembre: 16 USD (40 - 24)
 *   - Diciembre: 8 USD (40 - 32)
 */

export interface RemainingMonthsInfo {
  count: number;
  label: string;
  badgeText: string;
  expirationDateText: string;
  computedPriceUsd: number;
}

export function calculateDynamicProjectPriceUsd(currentDate: Date = new Date()): number {
  const month = currentDate.getMonth(); // 0: Ene, ..., 6: Jul, 7: Ago, 8: Sep, 9: Oct, 10: Nov, 11: Dic
  const basePrice = 40;
  const monthlyDecrease = 8;

  if (month <= 7) {
    // Hasta el 31 de Agosto (Meses 0 a 7 inclusive)
    return basePrice;
  }

  // A partir de Septiembre (mes 8)
  const monthsPassed = Math.min(4, month - 7); // Sep(1), Oct(2), Nov(3), Dic(4)
  return Math.max(8, basePrice - (monthsPassed * monthlyDecrease));
}

export function getRemainingProjectMonths(currentDate: Date = new Date()): RemainingMonthsInfo {
  const month = currentDate.getMonth(); // 0: Ene, ..., 6: Jul, 7: Ago, 8: Sep, 9: Oct, 10: Nov, 11: Dic
  let count = 5;

  if (month >= 7 && month <= 11) {
    count = 12 - month; // Ago (7) -> 5, Sep (8) -> 4, Oct (9) -> 3, Nov (10) -> 2, Dic (11) -> 1
  } else {
    count = 5; // Julio y meses anteriores se fijan en el ciclo de 5 meses iniciales
  }

  const monthWord = count === 1 ? "mes" : "meses";
  const computedPriceUsd = calculateDynamicProjectPriceUsd(currentDate);

  return {
    count,
    label: `${count} ${monthWord}`,
    badgeText: `${count} ${monthWord} (hasta el 31 de Dic)`,
    expirationDateText: "31 de Diciembre",
    computedPriceUsd,
  };
}
