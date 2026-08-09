export const MAX_SPREADSHEET_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

export type AttachmentKind = "spreadsheet" | "photo";

const allowed = {
  spreadsheet: {
    extensions: ["xls", "xlsx", "csv"],
    mimeTypes: [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
    ],
    maximum: MAX_SPREADSHEET_BYTES,
    label: "Файл списка",
  },
  photo: {
    extensions: ["jpg", "jpeg", "png", "webp"],
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maximum: MAX_PHOTO_BYTES,
    label: "Фотография",
  },
} as const;

export function validateLeadAttachment(
  kind: AttachmentKind,
  file: File | null,
): string | null {
  if (!file || !file.name) return null;
  const rule = allowed[kind];
  const extension = file.name.split(".").pop()?.toLocaleLowerCase("ru");
  if (!extension || !rule.extensions.includes(extension as never)) {
    return `${rule.label}: неподдерживаемый формат файла.`;
  }
  if (!file.type || !rule.mimeTypes.includes(file.type as never)) {
    return `${rule.label}: неподдерживаемый тип файла.`;
  }
  if (file.size > rule.maximum) {
    return `${rule.label}: файл слишком большой.`;
  }
  return null;
}
