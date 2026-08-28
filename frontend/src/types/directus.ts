export type DirectusEnvelope<T> = {
  data: T;
};

export type DirectusResponse<T> = DirectusEnvelope<T> & {
  meta?: {
    filter_count?: number;
    total_count?: number;
  };
};
