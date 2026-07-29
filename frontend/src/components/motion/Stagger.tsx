import type { AriaAttributes, ReactNode } from "react";

type StaggerProps = {
  "aria-label"?: AriaAttributes["aria-label"];
  as?: "div" | "ol" | "ul";
  children: ReactNode;
  className?: string;
};

export function Stagger({
  as = "div",
  children,
  className,
  ...accessibility
}: StaggerProps) {
  const Component = as;

  return (
    <Component
      {...accessibility}
      className={className}
      data-motion-group="stagger"
    >
      {children}
    </Component>
  );
}

export function StaggerItem({
  as = "div",
  children,
  className,
}: {
  as?: "div" | "li";
  children: ReactNode;
  className?: string;
}) {
  const Component = as;

  return (
    <Component
      className={className}
      data-motion-item="stagger"
    >
      {children}
    </Component>
  );
}
