import type { SelectedProduct } from '../stores/useTenderSelection';

/**
 * Converts product recommendations from Entry Detection or threat analysis
 * to SelectedProduct format for the tender store
 */
export function toSelectedProductsFromRecommendations(
  recommendations: Array<{
    entryId: string;
    entryLabel: string;
    maxSpeed: number;
    product: any;
    marker?: any;
  }>
): SelectedProduct[] {
  return recommendations.map(rec => ({
    id: rec.product?.id || rec.product?.product_name || String(Date.now()),
    name: rec.product?.product_name || 'Unbekanntes Produkt',
    entryId: rec.entryId,
    entryLabel: rec.entryLabel,
    requiredSpeedKmh: rec.maxSpeed,
    standards: Array.isArray(rec.product?.standard) 
      ? rec.product.standard 
      : rec.product?.technical_data?.standard 
      ? [rec.product.technical_data.standard]
      : [],
    image: rec.product?.product_image_file || undefined,
    raw: rec.product
  }));
}

