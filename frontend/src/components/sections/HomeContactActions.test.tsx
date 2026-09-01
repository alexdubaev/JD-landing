import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ContactChannelLink, MobileContactBar, TrackedPhoneLink } from "./HomeContactActions";
import type { ContactChannel } from "@/types/content";

const contacts: ContactChannel[] = [
  {
    id: "telegram",
    type: "messenger",
    label: "Telegram",
    value: "@deere_shop",
    url: "https://t.me/deere_shop",
    icon: null,
  },
];

describe("MobileContactBar", () => {
  afterEach(() => {
    delete window.dataLayer;
    window.localStorage.clear();
  });

  it("renders only factual contact actions and tracks messenger use", () => {
    window.localStorage.setItem("deere-shop:cookie-consent", "accepted");
    window.dataLayer = [];
    render(<MobileContactBar contacts={contacts} phone={null} />);

    expect(screen.queryByRole("link", { name: "Позвонить" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Написать" })).toHaveAttribute(
      "href",
      "https://t.me/deere_shop",
    );
    expect(screen.getByRole("link", { name: "Запрос" })).toHaveAttribute(
      "href",
      "#consultation",
    );

    const messageLink = screen.getByRole("link", { name: "Написать" });
    messageLink.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(messageLink);
    expect(window.dataLayer).toContainEqual({
      event: "messenger_click",
      label: "Telegram",
    });
  });

  it("renders an email contact as a mailto link", () => {
    window.localStorage.setItem("deere-shop:cookie-consent", "accepted");
    window.dataLayer = [];
    render(
      <>
        <ContactChannelLink channel={{ id: "email", type: "email", label: "Email", value: "info@example.test", url: null, icon: null }} />
        <MobileContactBar
          contacts={[{ id: "whatsapp", type: "whatsapp", label: "WhatsApp", value: "+7 900 000-00-00", url: "https://wa.me/79000000000", icon: null }]}
          phone={null}
        />
      </>,
    );

    const email = screen.getByRole("link", { name: "info@example.test" });
    expect(email).toHaveAttribute("href", "mailto:info@example.test");
    email.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(email);
    expect(window.dataLayer).toContainEqual({ event: "email_click", label: "Email" });
    expect(screen.getByRole("link", { name: "Написать" })).toHaveAttribute("href", "https://wa.me/79000000000");
  });

  it("tracks the final CTA phone action", () => {
    window.localStorage.setItem("deere-shop:cookie-consent", "accepted");
    window.dataLayer = [];
    render(<TrackedPhoneLink className="button" phone="+7 900 000-00-00">Позвонить</TrackedPhoneLink>);
    const call = screen.getByRole("link", { name: "Позвонить" });
    call.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(call);
    expect(window.dataLayer).toContainEqual({ event: "phone_click", label: "final_cta" });
  });
});
