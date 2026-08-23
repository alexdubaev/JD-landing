import type { Metadata } from "next";

export type SocialMetadataInput = {
  title: string;
  description?: string | null;
  path: string;
  type?: "website" | "article";
  image?: {
    url: string;
    alt?: string | null;
  } | null;
  publishedTime?: string | null;
  modifiedTime?: string | null;
};

export function buildSocialMetadata({
  title,
  description,
  path,
  type = "website",
  image,
  publishedTime,
  modifiedTime,
}: SocialMetadataInput): Pick<Metadata, "openGraph" | "twitter"> {
  const resolvedDescription = description?.trim() || undefined;
  const imageData = image
    ? [
        {
          url: image.url,
          ...(image.alt?.trim() ? { alt: image.alt.trim() } : {}),
        },
      ]
    : undefined;

  return {
    openGraph: {
      title,
      description: resolvedDescription,
      url: path,
      type,
      ...(imageData ? { images: imageData } : {}),
      ...(type === "article" && publishedTime
        ? { publishedTime }
        : {}),
      ...(type === "article" && modifiedTime ? { modifiedTime } : {}),
    },
    twitter: {
      card: imageData ? "summary_large_image" : "summary",
      title,
      description: resolvedDescription,
      ...(imageData ? { images: imageData } : {}),
    },
  };
}
