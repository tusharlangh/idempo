import type { ErrorDetailsProps } from "./retry.d.ts";

export interface EventProps {
  id: string;
  event_status: string;
  payload: any;
  error_details: ErrorDetailsProps;
  failed_at: Date;
  idempotency_key: string;
  destination_url: string;
  locked_at: Date | null;
  locked_by: string | null;
  created_at: Date;
}

export interface IdempotencyKeysProps {
  id: string;
  created_at: Date;
  key: string;
  request_hash: string;
  status: IdempoKeysStatus;
  response_status: number;
  response_body: any[];
  updated_at: Date;
  locked_at: Date;
}

export type IdempoKeysStatus = "PROCESSING" | "PROCESSED" | "FAILED";

export interface DLQEventProps {
  id: string;
  original_event_id: number;
  idempotency_key: string;
  payload: any;
  error_details: ErrorDetailsProps;
  status: string;
  retry_count: number;
  failed_at: Date;
  resolved_at: Date | null;
  created_at: Date;
}

export interface DeliveryAttemptProps {
  id: string;
  event_id: string;
  attempt_number: number;
  destination_url: string;
  request_headers?: Record<string, string>;
  request_body?: any;
  status_code?: number;
  response_body?: string;
  error_message?: string;
  started_at: Date;
  completed_at?: Date;
  latency_ms?: number;
  success: boolean;
  created_at: Date;
}
