import type { SVGProps } from "react";

// Keep repeated decorative paths in one cacheable, same-origin SVG resource.
function createIcon(id: string, iconClass: string) {
  return function HomeIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
    return (
      <svg
        className={`${iconClass} home-icon${className ? ` ${className}` : ""}`}
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

export const ArrowRight = createIcon("arrow-right", "lucide lucide-arrow-right");
export const BadgeCheck = createIcon("badge-check", "lucide lucide-badge-check");
export const ClipboardCheck = createIcon("clipboard-check", "lucide lucide-clipboard-check");
export const ClipboardList = createIcon("clipboard-list", "lucide lucide-clipboard-list");
export const Clock3 = createIcon("clock3", "lucide lucide-clock3 lucide-clock-3");
export const FileSearch = createIcon("file-search", "lucide lucide-file-search");
export const FileText = createIcon("file-text", "lucide lucide-file-text");
export const Handshake = createIcon("handshake", "lucide lucide-handshake");
export const Headset = createIcon("headset", "lucide lucide-headset");
export const Mail = createIcon("mail", "lucide lucide-mail");
export const MapPin = createIcon("map-pin", "lucide lucide-map-pin");
export const MessageCircle = createIcon("message-circle", "lucide lucide-message-circle");
export const PackageCheck = createIcon("package-check", "lucide lucide-package-check");
export const PackageSearch = createIcon("package-search", "lucide lucide-package-search");
export const Phone = createIcon("phone", "lucide lucide-phone");
export const Search = createIcon("search", "lucide lucide-search");
export const Send = createIcon("send", "lucide lucide-send");
export const ShieldCheck = createIcon("shield-check", "lucide lucide-shield-check");
export const Truck = createIcon("truck", "lucide lucide-truck");
