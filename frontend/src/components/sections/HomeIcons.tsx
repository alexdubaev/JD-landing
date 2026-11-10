import type { SVGProps } from "react";

// Keep repeated decorative paths in one cacheable, same-origin SVG resource.
function createIcon(id: string) {
  return function HomeIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
    return (
      <svg
        className={`home-icon${className ? ` ${className}` : ""}`}
        height={24}
        viewBox="0 0 24 24"
        width={24}
        {...props}
      >
        <use href={`/images/home-icons.svg#${id}`} />
      </svg>
    );
  };
}

export const ArrowRight = createIcon("arrow-right");
export const BadgeCheck = createIcon("badge-check");
export const ClipboardCheck = createIcon("clipboard-check");
export const ClipboardList = createIcon("clipboard-list");
export const Clock3 = createIcon("clock3");
export const FileSearch = createIcon("file-search");
export const FileText = createIcon("file-text");
export const Handshake = createIcon("handshake");
export const Headset = createIcon("headset");
export const Mail = createIcon("mail");
export const MapPin = createIcon("map-pin");
export const MessageCircle = createIcon("message-circle");
export const PackageCheck = createIcon("package-check");
export const PackageSearch = createIcon("package-search");
export const Phone = createIcon("phone");
export const Search = createIcon("search");
export const Send = createIcon("send");
export const ShieldCheck = createIcon("shield-check");
export const Truck = createIcon("truck");
