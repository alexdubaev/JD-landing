import { Check } from "lucide-react";

import {
  BulkPartsRequest,
  type PartsRequestMode,
} from "@/components/forms/BulkPartsRequest";
import { Reveal } from "@/components/motion/Reveal";
import { Container } from "@/components/ui/Container";
import type { PageSection } from "@/types/content";

export function HomePartsRequest({
  compact = false,
  initialMode,
  section,
}: {
  compact?: boolean;
  initialMode?: PartsRequestMode;
  section: PageSection;
}) {
  const cmsOutcomes = section.items.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (item && typeof item === "object" && "title" in item && typeof item.title === "string") return [item.title];
    return [];
  });
  return (
    <section
      className={`home-parts-request${compact ? " home-parts-request--compact" : ""}`}
      id="parts-request"
    >
      <Container>
        {compact ? (
          section.text ? (
            <p className="home-parts-request__intro">{section.text}</p>
          ) : null
        ) : (
          <Reveal className="home-parts-request__heading">
            {section.subtitle ? <p>{section.subtitle}</p> : null}
            <h2>{section.title}</h2>
            {section.text ? <p>{section.text}</p> : null}
          </Reveal>
        )}
        <div className="home-parts-request__grid">
          <Reveal className="home-parts-request__form" direction="left">
            <BulkPartsRequest initialMode={initialMode} />
          </Reveal>
          <Reveal className="home-parts-request__outcomes" direction="right">
            <p>По запросу подготовим</p>
            <ul>
              {cmsOutcomes.map((outcome) => (
                <li key={outcome}>
                  <Check aria-hidden="true" />
                  {outcome}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
