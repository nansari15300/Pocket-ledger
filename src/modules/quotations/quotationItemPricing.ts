import type { Item } from "@/components/items/types";

export function getItemDefaultSaleUnit(item: { salePriceUnit?: string; unitConversions?: unknown[] }): string {
  const conversions = (item.unitConversions || []) as { fromUnit?: string }[];
  return item.salePriceUnit || conversions[0]?.fromUnit || "";
}

export function getUnitBasedSalePrice(item: Item, unit: string): number {
  const conversions = (item.unitConversions || []) as {
    fromUnit?: string;
    toUnit?: string;
    conversionFactor?: number;
  }[];
  if (conversions.length === 0) {
    return Number(item.salePrice) || 0;
  }

  const smallestUnit = conversions[conversions.length - 1].toUnit;
  const basePrice = Number(item.salePrice) || 0;
  const baseUnit = item.salePriceUnit;

  let smallestUnitPrice = basePrice;
  if (baseUnit && baseUnit !== smallestUnit) {
    let factor = 1;
    let current = baseUnit;
    while (current !== smallestUnit) {
      const conv = conversions.find((c) => c.fromUnit === current);
      if (!conv) {
        factor = 0;
        break;
      }
      factor *= Number(conv.conversionFactor) || 1;
      current = conv.toUnit || "";
    }
    smallestUnitPrice = basePrice / (factor || 1);
  }

  let targetPrice = smallestUnitPrice;
  if (unit !== smallestUnit) {
    let factor = 1;
    let current = unit;
    while (current !== smallestUnit) {
      const conv = conversions.find((c) => c.fromUnit === current);
      if (!conv) {
        factor = 0;
        break;
      }
      factor *= Number(conv.conversionFactor) || 1;
      current = conv.toUnit || "";
    }
    targetPrice *= factor;
  }

  return targetPrice;
}
