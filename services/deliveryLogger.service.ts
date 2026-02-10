import { AppError } from "../middleware/errorHandler.ts";
import { query } from "../db/pool.ts";

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

  const { rowCount } = await query(
    `INSERT INTO delivery_attempts
       (event_id, attempt_number, destination_url, request_headers, request_body,
        status_code, response_body, error_message, started_at, completed_at, latency_ms, success)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      params.eventId,
      params.attemptNumber,
      params.destinationUrl,
      JSON.stringify(params.requestHeaders),
      JSON.stringify(params.requestBody),
      result.statusCode || null,
      result.responseBody?.slice(0, 1000) || null,
      result.errorMessage || null,
      params.startedAt.toISOString(),
      completedAt.toISOString(),
      latencyMs,
      result.success,
    ],
  );

  if (rowCount === 0) {
    throw new AppError(
      "Failed to log delivery attempt",
      400,
      "FAILED_LOG_DELIVERY",
    );
  }
}

export async function getDeliveryAttempts(eventId: string) {
  try {
    const { rows } = await query(
      `SELECT * FROM delivery_attempts WHERE event_id = $1 ORDER BY attempt_number ASC`,
      [eventId],
    );
    return rows;
  } catch (error) {
    console.error("Failed to get delivery attempts: ", error);
    return [];
  }
}
