import { AppError } from "../middleware/errorHandler.ts";
import type { IdempotencyKeysProps } from "../types/databse.js";
import { hashRequestBody } from "../utils/hash.ts";
import { query } from "../db/pool.ts";

export async function acquireIdempotencyKey(key: string, body: any) {
  const hashedBody = hashRequestBody(body);

  try {
    await query(
      `INSERT INTO idempotency_keys (key, request_hash, status, locked_at)
       VALUES ($1, $2, 'PROCESSING', NOW())`,
      [key, hashedBody],
    );
    return { success: true, action: "PROCEED" };
  } catch (e: any) {
    if (e.code !== "23505") throw e;
  }

  const { rows } = await query<IdempotencyKeysProps>(
    `SELECT * FROM idempotency_keys WHERE key = $1`,
    [key],
  );

  const exist = rows[0];

  if (!exist) {
    throw new AppError(
      "Matching idempotency key missing although it should exist",
      500,
      "MISSING_IDEM_KEY",
    );
  }

  if (exist.request_hash !== hashedBody) {
    return { success: false, action: "HASHED_MISMATCH" };
  }

  const LOCK_TIMEOUT_MS = 1 * 60 * 1000;

  if (exist.status === "PROCESSING") {
    const lockAge = Date.now() - new Date(exist.locked_at).getTime();
    if (lockAge > LOCK_TIMEOUT_MS) {
      await query(
        `UPDATE idempotency_keys SET locked_at = NOW(), status = 'PROCESSING' WHERE key = $1`,
        [key],
      );
      return { success: true, action: "PROCEED" };
    }
  }

  if (exist.status === "PROCESSED") {
    return {
      success: false,
      action: "RETURN_CACHED",
      metadata: {
        response_status: exist.response_status,
        response_body: exist.response_body,
      },
    };
  }

  if (exist.status === "FAILED") {
    return {
      success: false,
      action: "FAILED",
      metadata: {
        response_status: exist.response_status,
        response_body: exist.response_body,
      },
    };
  }

  return { success: false, action: "CONFLICT" };
}

export async function markIdempotencyKey(
  status: "PROCESSED" | "FAILED",
  key: string,
  responseStatus: number,
  responseBody: { action: string; success: boolean },
) {
  const { rowCount } = await query(
    `UPDATE idempotency_keys
     SET status = $1, response_status = $2, response_body = $3, updated_at = NOW()
     WHERE key = $4`,
    [status, responseStatus, JSON.stringify(responseBody), key],
  );

  if (rowCount === 0) {
    throw new AppError(
      "Failed to mark idempotency key as processed",
      500,
      "UPDATE_IDEM_KEY_FAILED",
    );
  }
}
