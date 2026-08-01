import Image from "next/image";

import { Container } from "@/components/ui/Container";
import { directusAssetUrl } from "@/lib/directus/assets";
import type { RecentSupply } from "@/types/content";

export function HomeRecentSupplies({ supplies }: { supplies: RecentSupply[] }) {
  const meaningfulSupplies = supplies.filter((supply) => Boolean(
    supply.imageId ||
      supply.equipmentType ||
      supply.positions.length ||
      supply.region ||
      supply.deliveryTerm ||
      supply.supplyFormat,
  ));
  if (!meaningfulSupplies.length) return null;

  return (
    <section className="home-section home-recent-supplies">
      <Container>
        <div className="home-section__heading"><h2>Недавние поставки</h2></div>
        <div className="home-recent-supplies__grid">
          {meaningfulSupplies.map((supply) => {
            const imageUrl = directusAssetUrl(supply.imageId, {
              width: 720, height: 480, fit: "cover", quality: 84, format: "webp",
            });
            return (
              <article key={supply.id}>
                {imageUrl ? <Image alt={supply.alt ?? "Поставка комплектующих"} height={480} loading="lazy" src={imageUrl} width={720} /> : null}
                {supply.equipmentType ? <strong>{supply.equipmentType}</strong> : null}
                {supply.positions.length ? <p>{supply.positions.join(", ")}</p> : null}
                {supply.region ? <span>{supply.region}</span> : null}
                {supply.deliveryTerm ? <span>{supply.deliveryTerm}</span> : null}
                {supply.supplyFormat ? <span>{supply.supplyFormat}</span> : null}
              </article>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
