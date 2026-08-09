import {
  ClipboardCheck,
  Headset,
  PackageCheck,
  ShieldCheck,
  Truck,
} from "lucide-react";

import { Container } from "@/components/ui/Container";
import type { PageSection } from "@/types/content";

const iconByName = {
  clipboard: ClipboardCheck,
  headset: Headset,
  package: PackageCheck,
  shield: ShieldCheck,
  truck: Truck,
} as const;

type BenefitItem = {
  icon?: keyof typeof iconByName;
  text: string;
  title: string;
};

const isBenefit = (value: unknown): value is BenefitItem => {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<BenefitItem>;
  return typeof item.title === "string" && typeof item.text === "string";
};

export function HomeBenefits({ section }: { section: PageSection }) {
  const benefits = section.items.filter(isBenefit);
  if (!benefits.length) return null;

  return (
    <section
      aria-label={section.title ?? "Преимущества сервиса"}
      className="home-benefits"
    >
      <Container>
        {section.title ? (
          <div className="home-benefits__heading">
            {section.subtitle ? <p>{section.subtitle}</p> : null}
            <h2>{section.title}</h2>
          </div>
        ) : null}
        <div className="home-benefits__grid">
          {benefits.map(({ icon = "package", text, title }) => {
            const Icon = iconByName[icon] ?? PackageCheck;
            return (
              <div className="home-benefit" key={title}>
                <Icon aria-hidden="true" />
                <div>
                  <strong>{title}</strong>
                  <span>{text}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
