import { AppError } from "../middleware/errorHandler.ts";
import type { DLQEventProps } from "../types/databse.d.ts";
import type { ErrorDetailsProps } from "../types/retry.js";
import { query } from "../db/pool.ts";

export async function moveToDeadLetter(
  eventId: string,
  idempotencyKey: string,
  payload: any,
  errorDetails: ErrorDetailsProps,
) {
  const { rows } = await query<DLQEventProps>(
    `INSERT INTO dead_letter_queue (original_event_id, idempotency_key, payload, error_details, failed_at)
     VALUES ($1, $2, $3, $4, NOW())
     RETURNING *`,
    [eventId, idempotencyKey, JSON.stringify(payload), JSON.stringify(errorDetails)],
  );

  if (rows.length === 0) {
    throw new AppError(
      "Failed to push failed event into DLQ",
      500,
      "FAILED_PUSH_TO_DLQ",
    );
  }

  return rows[0];
}

export async function getPendingDLQEvents() {
  const { rows } = await query(
    `SELECT * FROM dead_letter_queue WHERE status = 'PENDING' ORDER BY failed_at ASC`,
  );
  return rows;
}

export async function retryDLQEvent(dlqId: string, destinationUrl: string) {
  const { rows } = await query(
    `SELECT * FROM dead_letter_queue WHERE id = $1`,
    [dlqId],
  );

  const dlqEvent = rows[0];

  if (!dlqEvent) {
    throw new AppError("DLQ event not found", 404, "DLQ_NOT_FOUND");
  }

  await query(
    `UPDATE dead_letter_queue SET status = 'RETRYING' WHERE id = $1`,
    [dlqId],
  );

  try {
    const res = await fetch(destinationUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dlqEvent.payload),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    await query(
      `UPDATE dead_letter_queue SET status = 'RESOLVED', resolved_at = NOW() WHERE id = $1`,
      [dlqId],
    );

    return { success: true };
  } catch (error: any) {
    const newRetryCount = dlqEvent.retry_count + 1;
    const maxRetries = 3;

    await query(
      `UPDATE dead_letter_queue SET status = $1, retry_count = $2 WHERE id = $3`,
      [newRetryCount >= maxRetries ? "ABANDONED" : "PENDING", newRetryCount, dlqId],
    );

    return { success: false, error: error.message };
  }
}

export async function resolveDLQEvent(dlqId: string) {
  const { rowCount } = await query(
    `UPDATE dead_letter_queue SET status = 'RESOLVED', resolved_at = NOW() WHERE id = $1`,
    [dlqId],
  );

  if (rowCount === 0) {
    throw new AppError(
      "Failed to mark resolved dlq event",
      500,
      "FAILED_RESOLVED_DLQ",
    );
  }
}

export async function abandonDLQEvent(dlqId: string) {
  const { rowCount } = await query(
    `UPDATE dead_letter_queue SET status = 'ABANDONED' WHERE id = $1`,
    [dlqId],
  );

  if (rowCount === 0) {
    throw new AppError(
      "Failed to abandon dlq event",
      500,
      "FAILED_RESOLVED_DLQ",
    );
  }
}
