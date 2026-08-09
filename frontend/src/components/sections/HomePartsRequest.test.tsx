import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PageSection } from "@/types/content";

import { HomePartsRequest } from "./HomePartsRequest";

const section: PageSection = {
  id: "parts-request",
  type: "parts_request",
  title: "Check parts list",
  subtitle: "Request details",
  text: "Paste articles or upload a file.",
  imageId: null,
  buttonText: null,
  buttonUrl: null,
  items: ["Price for every item"],
  settings: {},
  sortOrder: 0,
};

describe("HomePartsRequest", () => {
  it("keeps the intro and outcomes without a duplicate heading in compact mode", () => {
    render(<HomePartsRequest compact section={section} />);

    expect(
      screen.queryByRole("heading", { level: 2, name: section.title! }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(section.text!)).toBeInTheDocument();
    expect(screen.getByText("Price for every item")).toBeInTheDocument();
  });
});
