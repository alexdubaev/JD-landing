export type DirectusId = string;

export type PublicationStatus = "draft" | "published" | "archived";

export type DirectusEnvelope<T> = {
  data: T;
};

export type DirectusResponse<T> = DirectusEnvelope<T> & {
  meta?: {
    filter_count?: number;
    total_count?: number;
  };
};

export type DirectusListEnvelope<T> = DirectusResponse<T[]>;
