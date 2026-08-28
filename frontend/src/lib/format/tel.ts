/**
 * href value for tel: links — keep the leading plus and digits only, so
 * "+7 (495) 123-45-67" becomes "+74951234567".
 */
export const telHref = (phone: string) => phone.replace(/[^\d+]/gu, "");
