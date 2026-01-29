export type EventStatus = "RECEIVED" | "PROCESSING" | "DELIVERED" | "FAILED";

export interface CanonicalEvent<T = any> {
  id: string;
  type: string;
  created: number;
  source: string;
  data: {
    object: T;
  };
  metadata?: Record<string, string>;
}
