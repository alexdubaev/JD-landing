import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PageSection, SiteSettings } from "@/types/content";

import { HomeHero } from "./HomeHero";

const heroSection: PageSection = {
  id: "hero",
  type: "hero",
  title: null,
  subtitle: null,
  text: null,
  imageId: "hero-photo",
  buttonText: null,
  buttonUrl: null,
  items: [],
  settings: {},
  sortOrder: 0,
};

describe("HomeHero", () => {
  it("renders the local WebP hero illustration as decorative media", () => {
    const { container } = render(
      <HomeHero
        contacts={[]}
        h1="John Deere parts"
        section={heroSection}
        settings={{ phone: null } as SiteSettings}
      />,
    );

    const image = container.querySelector(".commerce-hero__image");
    expect(image).toHaveAttribute("alt", "");
    expect(decodeURIComponent(image?.getAttribute("src") ?? "")).toContain(
      "/images/home/deere-shop-hero-v2.webp",
    );
  });

  it("keeps four benefit cards when CMS provides an incomplete set", () => {
    const benefitsSection: PageSection = {
      ...heroSection,
      id: "advantages",
      type: "advantages",
      items: [
        { icon: "shield", title: "Quality", text: "Checked." },
        { icon: "package", title: "Stock", text: "Available." },
        { icon: "truck", title: "Delivery", text: "Fast." },
      ],
    };
    const { container } = render(
      <HomeHero
        benefitsSection={benefitsSection}
        contacts={[]}
        h1="John Deere parts"
        section={heroSection}
        settings={{ phone: null } as SiteSettings}
      />,
    );

    expect(container.querySelectorAll(".commerce-hero__benefit")).toHaveLength(4);
  });
});
