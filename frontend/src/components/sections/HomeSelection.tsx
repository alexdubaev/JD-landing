import {
  ArrowRight,
  BadgeCheck,
  ClipboardList,
  FileSearch,
  Handshake,
} from "lucide-react";
import Link from "next/link";

import { ProcessMotion } from "@/components/motion/ProcessMotion";
import { Container } from "@/components/ui/Container";
import type { PageSection } from "@/types/content";

const icons = [ClipboardList, FileSearch, BadgeCheck, Handshake];

type ProcessItem = {
  number?: string;
  icon?: string;
  text: string;
  title: string;
  details?: string[];
};

const isProcessItem = (value: unknown): value is ProcessItem => {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ProcessItem>;
  return typeof item.title === "string" && typeof item.text === "string";
};

const selectionInputs = [
  "Артикул или номер детали",
  "Модель техники",
  "Фото маркировки",
  "Описание задачи",
];

const fallbackSteps: ProcessItem[] = [
  {
    number: "01",
    title: "Отправьте номера деталей",
    text: "Вставьте артикулы, загрузите Excel или прикрепите фото",
  },
  {
    number: "02",
    title: "Мы проверим запрос",
    text: "Уточним применимость, наличие, замену и комплектацию",
  },
  {
    number: "03",
    title: "Получите предложение",
    text: "Цена, сроки, склад и доступные варианты",
  },
  {
    number: "04",
    title: "Оформите поставку",
    text: "Выставим счёт и отправим заказ в ваш регион",
  },
];

const stringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

export function HomeSelection({
  ctaSection,
  section,
}: {
  ctaSection?: PageSection;
  section: PageSection;
}) {
  const steps = section.items.filter(isProcessItem);
  const visibleSteps = steps.length ? steps : fallbackSteps;
  const helpInputs = stringArray(section.settings.help_inputs);
  const ctaTitle =
    ctaSection?.title ??
    (typeof section.settings.cta_title === "string"
      ? section.settings.cta_title
      : "Нужна помощь с подбором?");
  const ctaText =
    ctaSection?.text ??
    (typeof section.settings.cta_text === "string"
      ? section.settings.cta_text
      : "Передайте исходные данные — проверим запрос и уточним следующий шаг.");
  const ctaUrl = ctaSection?.buttonUrl ?? section.buttonUrl ?? "#consultation";
  const ctaLabel =
    ctaSection?.buttonText ?? section.buttonText ?? "Отправить запрос";

  return (
    <section className="home-section home-selection">
      <Container>
        <div className="home-selection__intro">
          <div>
            {section.subtitle ? <p>{section.subtitle}</p> : null}
            <h2>{section.title ?? "Как происходит подбор"}</h2>
          </div>
          {section.text ? <p>{section.text}</p> : null}
        </div>
        <ProcessMotion>
          <div className="home-selection__steps">
            {visibleSteps.map(({ details, number, text, title }, index) => {
              const Icon = icons[index % icons.length];
              return (
                <article className="home-step" key={`${title}:${index}`}>
                  <span>{number ?? String(index + 1).padStart(2, "0")}</span>
                  <Icon aria-hidden="true" />
                  <h3>{title}</h3>
                  <p>{text}</p>
                  {details?.length ? (
                    <ul>
                      {details.slice(0, 3).map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              );
            })}
          </div>
        </ProcessMotion>
        <div className="home-selection__bottom">
          <div className="home-selection__inputs">
            <strong>Что поможет подбору</strong>
            <ul>
              {(helpInputs.length ? helpInputs : selectionInputs).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="home-selection__cta">
            <div>
              <strong>{ctaTitle}</strong>
              <span>{ctaText}</span>
            </div>
            <Link className="button button--accent" href={ctaUrl}>
              {ctaLabel}
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
