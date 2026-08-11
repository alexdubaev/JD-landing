"use client";

import { MessageCircle, Phone, Send } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { trackEvent } from "@/lib/analytics";
import { safeUrl } from "@/lib/security/urls";
import type { ContactChannel } from "@/types/content";

const phoneHref = (phone: string) => phone.replace(/[^\d+]/gu, "");

const messengerTypes = new Set(["messenger", "telegram", "whatsapp"]);

const messengerChannel = (contacts: ContactChannel[]) =>
  contacts.find((channel) => messengerTypes.has(channel.type) && channel.url);

export function ContactChannelLink({ channel }: { channel: ContactChannel }) {
  if (channel.type === "email") {
    return (
      <Link
        href="/parts-request"
        onClick={() => trackEvent("lead_form_open", { label: channel.label })}
      >
        Написать нам
      </Link>
    );
  }

  const href =
    safeUrl(channel.url) ??
    (channel.type === "phone"
      ? `tel:${phoneHref(channel.value)}`
      : null);
  if (!href) return <span>{channel.value}</span>;

  const event =
    channel.type === "phone"
      ? "phone_click"
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
      href={`tel:${phoneHref(phone)}`}
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
  return (
    <nav aria-label="Быстрые действия" className="mobile-contact-bar">
      {phone ? (
        <a
          href={`tel:${phoneHref(phone)}`}
          onClick={() => trackEvent("phone_click", { label: "mobile_bar" })}
        >
          <Phone aria-hidden="true" />
          <span>Позвонить</span>
        </a>
      ) : null}
      {messenger ? (
        <a
          href={safeUrl(messenger.url, "#consultation") ?? "#consultation"}
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
