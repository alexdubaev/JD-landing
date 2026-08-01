import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HomeCompanyTrust } from "./HomeCompanyTrust";
import type { SiteSettings } from "@/types/content";

const emptySettings: SiteSettings = {
  address: null,
  accentColor: null,
  city: null,
  companyImageId: null,
  companyName: "DEERE-SHOP",
  documentsUrl: null,
  email: null,
  footerText: null,
  inn: null,
  kpp: null,
  legalAddress: null,
  legalName: null,
  logoId: null,
  messengers: [],
  ogrn: null,
  phone: null,
  primaryColor: null,
  primaryCtaText: null,
  primaryCtaUrl: null,
  requisitesUrl: null,
  vatInfo: null,
  workingHours: null,
};

describe("HomeCompanyTrust", () => {
  it("does not render a trust block without factual company data", () => {
    const { container } = render(<HomeCompanyTrust settings={emptySettings} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("does not use a city or image alone to make an unsupported company claim", () => {
    const { container } = render(
      <HomeCompanyTrust settings={{ ...emptySettings, city: "Санкт-Петербург", companyImageId: "company-image" }} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders only available factual company details and document links", () => {
    window.dataLayer = [];
    render(
      <HomeCompanyTrust
        settings={{
          ...emptySettings,
          city: "Санкт-Петербург",
          documentsUrl: "/documents",
          inn: "7812345678",
          legalName: "ООО «СМ ТЕХНО»",
          phone: "+7 900 000-00-00",
          requisitesUrl: "/requisites",
          vatInfo: "Работаем с НДС",
          email: "info@example.test",
          workingHours: "Пн–Пт 09:00–18:00",
        }}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "DEERE-SHOP — специализированное направление компании СМ ТЕХНО",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("ООО «СМ ТЕХНО»")).toBeInTheDocument();
    expect(screen.getByText("ИНН 7812345678")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Реквизиты" })).toHaveAttribute(
      "href",
      "/requisites",
    );
    expect(screen.getByRole("link", { name: "Документы" })).toHaveAttribute(
      "href",
      "/documents",
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("+7 900 000-00-00")).toBeInTheDocument();
    expect(screen.getByText("info@example.test")).toBeInTheDocument();
    expect(screen.getByText("Пн–Пт 09:00–18:00")).toBeInTheDocument();
    const phone = screen.getByRole("link", { name: "+7 900 000-00-00" });
    phone.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(phone);
    expect(window.dataLayer).toContainEqual({ event: "phone_click", label: "Телефон" });
  });
});
