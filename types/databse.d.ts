export interface EventProps {
  id: number;
  event_status: string;
  attempt_count: number;
  payload: any;
  error_details: any;
  failed_at: Date;
  idempotency_key: string;
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
