import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HomeCompanyTrust } from "./HomeCompanyTrust";
import type { PageSection, SiteSettings } from "@/types/content";

const companySection: PageSection = {
  id: "company", type: "company_trust", title: "DEERE-SHOP — специализированное направление компании СМ ТЕХНО",
  subtitle: "О компании", text: null, imageId: null, buttonText: null,
  buttonUrl: null, items: [], settings: {}, sortOrder: 1,
};

const emptySettings: SiteSettings = {
  address: null,
  accentColor: null,
  city: null,
  companyImageId: null,
  companyName: "DEERE-SHOP",
  defaultOgImageId: null,
  documentsUrl: null,
  email: null,
  footerText: null,
  footerDisclaimer: null,
  seoTitle: null,
  seoDescription: null,
  ogTitle: null,
  ogDescription: null,
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
  yandexMetricaId: null,
  gtmId: null,
};

describe("HomeCompanyTrust", () => {
  it("does not render a trust block without factual company data", () => {
    const { container } = render(<HomeCompanyTrust section={companySection} settings={emptySettings} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("does not use a city or image alone to make an unsupported company claim", () => {
    const { container } = render(
      <HomeCompanyTrust section={companySection} settings={{ ...emptySettings, city: "Санкт-Петербург", companyImageId: "company-image" }} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders only available factual company details and document links", () => {
    window.dataLayer = [];
    render(
      <HomeCompanyTrust
        section={companySection}
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
    expect(screen.queryByText("info@example.test")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Написать нам" })).toHaveAttribute(
      "href",
      "/parts-request",
    );
    expect(screen.getByText("Пн–Пт 09:00–18:00")).toBeInTheDocument();
    const phone = screen.getByRole("link", { name: "+7 900 000-00-00" });
    phone.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(phone);
    expect(window.dataLayer).toContainEqual({ event: "phone_click", label: "Телефон" });
  });
});
