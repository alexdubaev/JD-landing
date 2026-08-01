import { Check } from "lucide-react";

import { BulkPartsRequest } from "@/components/forms/BulkPartsRequest";
import { Reveal } from "@/components/motion/Reveal";
import { Container } from "@/components/ui/Container";

const outcomes = [
  "Цену по каждой позиции",
  "Наличие",
  "Срок поставки",
  "Возможные замены",
  "Оригинал или аналог",
  "Условия доставки",
  "Коммерческое предложение",
];

export function HomePartsRequest() {
  return (
    <section className="home-parts-request" id="parts-request">
      <Container>
        <Reveal className="home-parts-request__heading">
          <p>Проверка нескольких позиций</p>
          <h2>Проверьте список запчастей</h2>
          <p>
            Вставьте артикулы в поле или загрузите Excel. Мы проверим цены,
            наличие, сроки и возможные замены.
          </p>
        </Reveal>
        <div className="home-parts-request__grid">
          <Reveal className="home-parts-request__form" direction="left">
            <BulkPartsRequest />
          </Reveal>
          <Reveal className="home-parts-request__outcomes" direction="right">
            <p>По запросу подготовим</p>
            <ul>
              {outcomes.map((outcome) => (
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
