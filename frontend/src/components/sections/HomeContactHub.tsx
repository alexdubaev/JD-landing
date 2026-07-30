import { Clock3, Mail, MapPin, MessageCircle, Phone } from "lucide-react";

import { LeadForm } from "@/components/forms/LeadForm";
import { Container } from "@/components/ui/Container";
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
  const publishedPhones = contacts.filter((item) => item.type === "phone");
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
  const channels = [...publishedPhones, ...phoneFallback, ...contacts.filter(
    (item) => item.type !== "phone",
  )];

  return (
    <section className="home-section home-contact-hub" id="consultation">
      <Container className="home-contact-hub__grid">
        <div className="home-contact-hub__details">
          {contactSection?.subtitle ? <p>{contactSection.subtitle}</p> : null}
          <h2>{contactSection?.title ?? "Свяжитесь с нами"}</h2>
          <p>
            {contactSection?.text ??
              "Пришлите артикул, модель техники или фото маркировки — уточним данные перед оформлением запроса."}
          </p>
          <address>
            {channels.map((channel) => {
              const Icon =
                channel.type === "phone"
                  ? Phone
                  : channel.type === "email"
                    ? Mail
                    : MessageCircle;
              const href =
                channel.url ??
                (channel.type === "phone"
                  ? `tel:${phoneHref(channel.value)}`
                  : channel.type === "email"
                    ? `mailto:${channel.value}`
                    : null);
              const content = (
                <>
                  <Icon aria-hidden="true" />
                  <span>
                    <small>{channel.label}</small>
                    {channel.value}
                  </span>
                </>
              );
              return href ? (
                <a href={href} key={channel.id}>{content}</a>
              ) : (
                <span key={channel.id}>{content}</span>
              );
            })}
            {settings.address ? (
              <span>
                <MapPin aria-hidden="true" />
                <span><small>Адрес</small>{settings.address}</span>
              </span>
            ) : null}
            {settings.workingHours ? (
              <span>
                <Clock3 aria-hidden="true" />
                <span><small>Часы работы</small>{settings.workingHours}</span>
              </span>
            ) : null}
          </address>
        </div>
        <div className="home-contact-hub__form">
          <p>{formSection?.subtitle ?? "Заявка на подбор"}</p>
          <h2>{formSection?.title ?? "Опишите, что нужно найти"}</h2>
          <p>
            {formSection?.text ??
              "Оставьте контакт и исходные данные. Менеджер уточнит совместимость и условия поставки."}
          </p>
          <LeadForm />
        </div>
      </Container>
    </section>
  );
}
