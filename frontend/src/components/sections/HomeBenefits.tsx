import {
  ClipboardCheck,
  Headset,
  PackageCheck,
  ShieldCheck,
  Truck,
} from "lucide-react";

import { Container } from "@/components/ui/Container";

const benefits = [
  {
    icon: PackageCheck,
    title: "Каталог комплектующих",
    text: "Поиск по артикулам и категориям",
  },
  {
    icon: ClipboardCheck,
    title: "Проверка запроса",
    text: "Сверим данные перед предложением",
  },
  {
    icon: Truck,
    title: "Доставка по России",
    text: "Согласуем удобный способ отправки",
  },
  {
    icon: Headset,
    title: "Помощь менеджера",
    text: "Разберём заявку и уточним детали",
  },
  {
    icon: ShieldCheck,
    title: "Работа с бизнесом",
    text: "Подготовим предложение под задачу",
  },
];

export function HomeBenefits() {
  return (
    <section className="home-benefits" aria-label="Преимущества сервиса">
      <Container className="home-benefits__grid">
        {benefits.map(({ icon: Icon, text, title }) => (
          <div className="home-benefit" key={title}>
            <Icon aria-hidden="true" />
            <div>
              <strong>{title}</strong>
              <span>{text}</span>
            </div>
          </div>
        ))}
      </Container>
    </section>
  );
}
