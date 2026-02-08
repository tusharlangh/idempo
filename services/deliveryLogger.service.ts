import { AppError } from "../middleware/errorHandler.ts";
import supabase from "../utils/supabase/client.ts";

export interface LogDeliveryParams {
  eventId: string;
  attemptNumber: number;
  destinationUrl: string;
  requestHeaders: Record<string, string>;
  requestBody: any;
  startedAt: Date;
}

export interface LogDeliveryResult {
  statusCode?: number;
  responseBody?: string;
  errorMessage?: string;
  success: boolean;
}

export async function logDeliveryAttempt(
  params: LogDeliveryParams,
  result: LogDeliveryResult,
) {
  const completedAt = new Date();
  const latencyMs = completedAt.getTime() - params.startedAt.getTime();

  const { error } = await supabase.from("delivery_attempts").insert({
    event_id: params.eventId,
    attempt_number: params.attemptNumber,
    destination_url: params.destinationUrl,
    request_headers: params.requestHeaders,
    request_body: params.requestBody,
    status_code: result.statusCode || null,
    response_body: result.responseBody?.slice(0, 1000) || null,
    error_message: result.errorMessage || null,
    started_at: params.startedAt.toISOString(),
    completed_at: completedAt.toISOString(),
    latency_ms: latencyMs,
    success: result.success,
  });

  if (error) {
    throw new AppError(
      `Failed to log delivery attempt: ${error?.message}`,
      400,
      "FAILED_LOG_DELIVERY",
    );
  }
}

export async function getDeliveryAttempts(eventId: string) {
  const { data, error } = await supabase
    .from("delivery_attempts")
    .select("*")
    .eq("event_id", eventId)
    .order("attempt_number", { ascending: true });

  if (error) {
    console.error("Failed to get delivery attempts: ", error);
    return [];
  }

  return data;
}
