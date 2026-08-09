import { Clock3, MapPin, MessageCircle, Phone } from "lucide-react";
import Link from "next/link";

import { LeadForm } from "@/components/forms/LeadForm";
import { Container } from "@/components/ui/Container";
import {
  ContactChannelLink,
  MobileContactBar,
  TrackedPhoneLink,
} from "@/components/sections/HomeContactActions";
import type {
  ContactChannel,
  PageSection,
  SiteSettings,
} from "@/types/content";

const phoneHref = (phone: string) => phone.replace(/[^\d+]/gu, "");

export function HomeContactHub({
  contacts,
  contactSection,
  formSection,
  settings,
}: {
  contacts: ContactChannel[];
  contactSection?: PageSection;
  formSection?: PageSection;
  settings: SiteSettings;
}) {
  const communicationTypes = new Set(["phone", "messenger", "telegram", "whatsapp"]);
  const publishedChannels = contacts.filter((item) => communicationTypes.has(item.type));
  const publishedPhones = publishedChannels.filter((item) => item.type === "phone");
  const phoneFallback =
    publishedPhones.length === 0 && settings.phone
      ? [{
          id: "settings-phone",
          type: "phone",
          label: "Телефон",
          value: settings.phone,
          url: `tel:${phoneHref(settings.phone)}`,
          icon: null,
        }]
      : [];
  const channels = [...publishedPhones, ...phoneFallback, ...publishedChannels.filter(
    (item) => item.type !== "phone",
  )].filter((channel, index, all) =>
    all.findIndex((item) => `${item.type}:${item.value}` === `${channel.type}:${channel.value}`) === index,
  );
  const primaryPhone = channels.find((channel) => channel.type === "phone");
  const address = settings.address ?? contacts.find((item) => item.type === "address")?.value ?? null;
  const workingHours = settings.workingHours ?? contacts.find((item) => item.type === "hours")?.value ?? null;

  return (
    <section className="home-section home-contact-hub" id="consultation">
      <Container className="home-contact-hub__grid">
        <div className="home-contact-hub__details">
          {contactSection?.subtitle ? <p>{contactSection.subtitle}</p> : <p>Подбор комплектующих</p>}
          <h2>{contactSection?.title ?? "Не нашли нужную деталь?"}</h2>
          <p>
            {contactSection?.text ??
              "Отправьте артикул, список или фотографию маркировки. Менеджер проверит варианты поставки."}
          </p>
          <div className="home-contact-hub__actions">
            <a className="button button--accent" href="#contact-form">Отправить запрос</a>
            <Link className="button button--secondary" href="/parts-request">Загрузить список</Link>
            {primaryPhone ? <TrackedPhoneLink className="button button--secondary" phone={primaryPhone.value}>Позвонить</TrackedPhoneLink> : null}
          </div>
          <address>
            {channels.map((channel) => {
              const Icon =
                channel.type === "phone"
                  ? Phone
                  : MessageCircle;
              return (
                <span key={channel.id}>
                  <Icon aria-hidden="true" />
                  <span>
                    <small>{channel.label}</small>
                    <ContactChannelLink channel={channel} />
                  </span>
                </span>
              );
            })}
            {address ? (
              <span>
                <MapPin aria-hidden="true" />
                <span><small>Адрес</small>{address}</span>
              </span>
            ) : null}
            {workingHours ? (
              <span>
                <Clock3 aria-hidden="true" />
                <span><small>Часы работы</small>{workingHours}</span>
              </span>
            ) : null}
          </address>
        </div>
        <div className="home-contact-hub__form" id="contact-form">
          <p>{formSection?.subtitle ?? "Заявка на подбор"}</p>
          <h2>{formSection?.title ?? "Опишите, что нужно найти"}</h2>
          <p>
            {formSection?.text ??
              "Оставьте контакт и исходные данные. Менеджер уточнит совместимость и условия поставки."}
          </p>
          <LeadForm />
        </div>
      </Container>
      <MobileContactBar contacts={channels} phone={primaryPhone?.value ?? null} />
    </section>
  );
}
