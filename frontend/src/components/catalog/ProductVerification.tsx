import { formatRuDate } from "@/lib/format/date";
import type { Product } from "@/types/catalog";

type VerificationProduct = Pick<
  Product,
  "sku" | "category" | "verifiedAt" | "reviewedBy" | "sourceName" | "sourceUrl"
>;

const formattedDate = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return formatRuDate(value);
};

const validSourceUrl = (value: string | null | undefined) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

export function ProductVerification({
  product,
}: {
  product: VerificationProduct;
}) {
  const date = formattedDate(product.verifiedAt);
  const sourceUrl = validSourceUrl(product.sourceUrl);
  const hasVerification = Boolean(
    date || product.reviewedBy || product.sourceName || sourceUrl,
  );

  if (!hasVerification) return null;

  return (
    <section className="product-section" aria-labelledby="product-verification">
      <h2 id="product-verification">Проверка данных</h2>
      <p>
        Данные проверены по сведениям, доступным для позиции {product.sku}.
      </p>
      {date ? <p>Дата проверки: {date}.</p> : null}
      {product.reviewedBy ? <p>Проверил: {product.reviewedBy}.</p> : null}
      {product.sourceName ? (
        <p>
          Источник: {sourceUrl ? <a href={sourceUrl}>{product.sourceName}</a> : product.sourceName}.
        </p>
      ) : null}
    </section>
  );
}
