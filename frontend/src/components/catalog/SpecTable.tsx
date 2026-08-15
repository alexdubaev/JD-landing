type SpecificationRow = {
  name: string;
  value: string;
  unit: string | null;
};

/**
 * Parses the dual-read specification rows of a product. The R7A dual-read in
 * `getProductBySlugs` feeds this the WINNING side — canonical
 * product_specifications rows ({ name, value, unit, group_name }) or the
 * mapped legacy products.specifications JSON ({ name | label | title, value }).
 */
const parseSpecifications = (items: unknown[]): SpecificationRow[] =>
  items.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const rawName = record.name ?? record.label ?? record.title;
    const rawValue = record.value;
    if (
      (typeof rawName !== "string" && typeof rawName !== "number") ||
      (typeof rawValue !== "string" && typeof rawValue !== "number")
    ) {
      return [];
    }
    const name = String(rawName).trim();
    const value = String(rawValue).trim();
    const unit =
      typeof record.unit === "string" && record.unit.trim() !== ""
        ? record.unit.trim()
        : null;
    return name && value ? [{ name, value, unit }] : [];
  });

export function SpecTable({ specifications }: { specifications: unknown[] }) {
  const rows = parseSpecifications(specifications);
  if (!rows.length) return null;

  return (
    <section className="product-section" aria-labelledby="specifications-title">
      <h2 id="specifications-title">Характеристики</h2>
      <div className="spec-table-shell">
        <table>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.name}:${index}`}>
                <th scope="row">{row.name}</th>
                <td>{row.unit ? `${row.value} ${row.unit}` : row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
