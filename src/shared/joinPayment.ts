/** Valor da adesão com Pix: taxa de associação mais, se a sociedade quiser, a anuidade ou mensalidade da categoria */
import type { TenantSettings } from './types.ts';

export function joinAmountCents(settings: Pick<TenantSettings, 'joinPayment' | 'categories'>, categoryId: string): number {
  const jp = settings.joinPayment;
  if (!jp?.enabled) return 0;
  const cat = settings.categories.find(c => c.id === categoryId);
  return jp.feeCents + (jp.includeCategoryFee && cat && cat.period !== 'isento' ? cat.feeCents : 0);
}
