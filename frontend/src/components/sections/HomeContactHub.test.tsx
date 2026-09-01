import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { PageSection, SiteSettings } from "@/types/content";

import { HomeContactHub } from "./HomeContactHub";

vi.mock("@/components/forms/LeadForm", () => ({ LeadForm: () => null }));

const settings: SiteSettings = {
  city: null,
  companyImageId: null,
  companyName: "DEERE-SHOP",
  defaultOgImageId: null,
  documentsUrl: null,
  phone: "8 911 921 22 14",
  email: "info@deershop.ru",
  address: "Санкт-Петербург",
  workingHours: null,
  logoId: null,
  primaryColor: null,
  accentColor: null,
  primaryCtaText: null,
  primaryCtaUrl: null,
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
  messengers: [],
  ogrn: null,
  requisitesUrl: null,
  vatInfo: null,
  yandexMetricaId: null,
  gtmId: null,
};

const section: PageSection = {
  id: "contacts",
  type: "contacts",
  title: "Контакты",
  subtitle: null,
  text: null,
  imageId: null,
  buttonText: null,
  buttonUrl: null,
  items: [],
  settings: {},
  sortOrder: 1,
};

describe("HomeContactHub", () => {
  it("falls back to the configured email when no email channel exists", () => {
    render(
      <HomeContactHub
        contacts={[]}
        contactSection={section}
        formSection={undefined}
        settings={settings}
      />,
    );

    expect(screen.getByRole("link", { name: "8 911 921 22 14" })).toHaveAttribute(
      "href",
      "tel:89119212214",
    );
    expect(screen.getByRole("link", { name: "info@cmteh.ru" })).toHaveAttribute(
      "href",
      "mailto:info@cmteh.ru",
    );
  });
});
