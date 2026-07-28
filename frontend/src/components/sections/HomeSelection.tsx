import { ArrowRight, ClipboardList, SearchCheck, Truck } from "lucide-react";
import Link from "next/link";

import { Container } from "@/components/ui/Container";

const steps = [
  {
    icon: ClipboardList,
    number: "01",
    title: "Получаем запрос",
    text: "Артикул, модель техники, фото детали или описание задачи.",
  },
  {
    icon: SearchCheck,
    number: "02",
    title: "Проверяем данные",
    text: "Уточняем совместимость и доступные варианты поставки.",
  },
  {
    icon: Truck,
    number: "03",
    title: "Готовим предложение",
    text: "Согласуем позиции, условия и способ доставки.",
  },
];

export function HomeSelection() {
  return (
    <section className="home-section home-selection">
      <Container>
        <div className="home-selection__intro">
          <div>
            <p>Понятный процесс</p>
            <h2>Подбор комплектующих под вашу задачу</h2>
          </div>
          <p>
            Если точного артикула нет, отправьте данные о технике и узле.
            Менеджер поможет сформировать запрос без неподтверждённых обещаний
            по наличию и совместимости.
          </p>
        </div>
        <div className="home-selection__steps">
          {steps.map(({ icon: Icon, number, text, title }) => (
            <div className="home-step" key={number}>
              <span>{number}</span>
              <Icon aria-hidden="true" />
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
        <div className="home-selection__cta">
          <div>
            <strong>Нужна помощь с большим списком запчастей?</strong>
            <span>Прикрепление файлов добавим в форму заявки на следующем этапе.</span>
          </div>
          <Link className="button button--accent" href="/contacts#consultation">
            Оставить заявку
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </Container>
    </section>
  );
}
