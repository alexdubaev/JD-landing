import Link, { type LinkProps } from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

const classes = (variant: Variant, className = "") =>
  `button button--${variant} ${className}`.trim();

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={classes(variant, className)}
      type={type}
      {...props}
    />
  );
}

export function ButtonLink({
  children,
  className,
  variant = "primary",
  ...props
}: LinkProps & {
  children: ReactNode;
  className?: string;
  variant?: Variant;
}) {
  return (
    <Link className={classes(variant, className)} {...props}>
      {children}
    </Link>
  );
}
