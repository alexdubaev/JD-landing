type Specification = {
  name: string;
  value: string;
};

const parseSpecifications = (items: unknown[]): Specification[] =>
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
    return name && value ? [{ name, value }] : [];
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
                <td>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
