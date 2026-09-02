"use client";

import { MessageCircle, Phone, Send } from "lucide-react";
import type { ReactNode } from "react";

import { trackEvent } from "@/lib/analytics";
import { telHref } from "@/lib/format/tel";
import type { ContactChannel } from "@/types/content";

const messengerTypes = new Set(["messenger", "telegram", "whatsapp"]);

const messengerChannel = (contacts: ContactChannel[]) =>
  contacts.find((channel) => messengerTypes.has(channel.type) && channel.url);

export function ContactChannelLink({ channel }: { channel: ContactChannel }) {
  const href =
    channel.url ??
    (channel.type === "phone" ? `tel:${telHref(channel.value)}` :
      channel.type === "email" ? `mailto:${channel.value}` : null);
  if (!href) return <span>{channel.value}</span>;

  const event =
    channel.type === "phone"
      ? "phone_click"
      : channel.type === "email"
        ? "email_click"
      : messengerTypes.has(channel.type)
          ? "messenger_click"
          : null;
  return (
    <a
      href={href}
      onClick={() => event && trackEvent(event, { label: channel.label })}
    >
      {channel.value}
    </a>
  );
}

export function TrackedPhoneLink({
  children,
  className,
  phone,
}: {
  children: ReactNode;
  className?: string;
  phone: string;
}) {
  return (
    <a
      className={className}
      href={`tel:${telHref(phone)}`}
      onClick={() => trackEvent("phone_click", { label: "final_cta" })}
    >
      {children}
    </a>
  );
}

export function MobileContactBar({
  contacts,
  phone,
}: {
  contacts: ContactChannel[];
  phone: string | null;
}) {
  const messenger = messengerChannel(contacts);
  const availablePhone = phone?.trim() || null;
  return (
    <nav aria-label="Быстрые действия" className="mobile-contact-bar">
      {availablePhone ? (
        <a
          href={`tel:${telHref(availablePhone)}`}
          onClick={() => trackEvent("phone_click", { label: "mobile_bar" })}
        >
          <Phone aria-hidden="true" />
          <span>Позвонить</span>
        </a>
      ) : null}
      {messenger ? (
        <a
          href={messenger.url ?? "#consultation"}
          onClick={() => trackEvent("messenger_click", { label: messenger.label })}
        >
          <MessageCircle aria-hidden="true" />
          <span>Написать</span>
        </a>
      ) : null}
      <a href="#consultation">
        <Send aria-hidden="true" />
        <span>Запрос</span>
      </a>
    </nav>
  );
}
