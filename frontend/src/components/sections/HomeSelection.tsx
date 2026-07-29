import { ArrowRight, ClipboardList, SearchCheck, Truck } from "lucide-react";
import Link from "next/link";

import { Reveal } from "@/components/motion/Reveal";
import { ProcessMotion } from "@/components/motion/ProcessMotion";
import { Container } from "@/components/ui/Container";
import type { PageSection } from "@/types/content";

const icons = [ClipboardList, SearchCheck, Truck];

type ProcessItem = {
  number?: string;
  text: string;
  title: string;
};

const isProcessItem = (value: unknown): value is ProcessItem => {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ProcessItem>;
  return typeof item.title === "string" && typeof item.text === "string";
};

export function HomeSelection({ section }: { section: PageSection }) {
  const steps = section.items.filter(isProcessItem);
  if (!steps.length) return null;

  return (
    <section className="home-section home-selection">
      <Container>
        <Reveal className="home-selection__intro">
          <div>
            {section.subtitle ? <p>{section.subtitle}</p> : null}
            <h2>{section.title ?? "Как проходит подбор"}</h2>
          </div>
          {section.text ? <p>{section.text}</p> : null}
        </Reveal>
        <ProcessMotion>
          <div className="home-selection__steps">
            {steps.map(({ number, text, title }, index) => {
              const Icon = icons[index % icons.length];
              return (
                <div className="home-step" key={`${title}:${index}`}>
                  <span>{number ?? String(index + 1).padStart(2, "0")}</span>
                  <Icon aria-hidden="true" />
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              );
            })}
          </div>
        </ProcessMotion>
        {section.buttonText && section.buttonUrl ? (
          <Reveal className="home-selection__cta">
            <div>
              <strong>{section.settings.cta_title as string}</strong>
              {section.settings.cta_text ? (
                <span>{String(section.settings.cta_text)}</span>
              ) : null}
            </div>
            <Link className="button button--accent" href={section.buttonUrl}>
              {section.buttonText}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Reveal>
        ) : null}
      </Container>
    </section>
  );
}
