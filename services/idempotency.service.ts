import { AppError } from "../middleware/errorHandler.ts";
import type { IdempotencyKeysProps } from "../types/databse.js";
import { hashRequestBody } from "../utils/hash.ts";
import supabase from "../utils/supabase/client.ts";

export async function acquireIdempotencyKey(key: string, body: any) {
  const hashedBody = hashRequestBody(body);

  const { data, error } = await supabase
    .from("idempotency_keys")
    .insert({
      key: key,
      request_hash: hashedBody,
      status: "PROCESSING",
      locked_at: new Date(),
    })
    .select()
    .single();
  console.log(error);

  if (!error) {
    return { success: true, action: "PROCEED" };
  }

  const { data: exist } = (await supabase
    .from("idempotency_keys")
    .select()
    .eq("key", key)
    .single()) as { data: IdempotencyKeysProps };

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
    console.log(lockAge);
    if (lockAge > LOCK_TIMEOUT_MS) {
      await supabase
        .from("idempotency_keys")
        .update({
          locked_at: new Date().toISOString(),
          status: "PROCESSING",
        })
        .eq("key", key);

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
  const { error } = await supabase
    .from("idempotency_keys")
    .update({
      status: status,
      response_status: responseStatus,
      response_body: responseBody,
      updated_at: new Date(),
    })
    .eq("key", key);

  if (error) {
    throw new AppError(
      "Failed to mark idempotency key as processed",
      500,
      "UPDATE_IDEM_KEY_FAILED",
    );
  }
}
