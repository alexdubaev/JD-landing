import { BRAND_NAME } from "@/lib/brand";

export function buildRootTitle(seoTitle: string | null | undefined, companyName: string) {
  return seoTitle?.trim() || `${companyName || BRAND_NAME} — каталог комплектующих John Deere`;
}
