import { AppError } from "../middleware/errorHandler.ts";
import type { DLQEventProps } from "../types/databse.d.ts";
import type { ErrorDetailsProps } from "../types/retry.js";
import supabase from "../utils/supabase/client.ts";

export async function moveToDeadLetter(
  eventId: string,
  idempotencyKey: string,
  payload: any,
  errorDetails: ErrorDetailsProps,
) {
  const { data, error } = (await supabase
    .from("dead_letter_queue")
    .insert({
      original_event_id: eventId,
      idempotency_key: idempotencyKey,
      payload: payload,
      error_details: errorDetails,
      failed_at: new Date(),
    })
    .select()
    .single()) as { data: DLQEventProps; error: any };

  if (error) {
    throw new AppError(
      `Failed to push failed event into DLQ ${error.message}`,
      500,
      "FAILED_PUSH_TO_DLQ",
    );
  }

  return data;
}

export async function getPendingDLQEvents() {
  const { data, error } = await supabase
    .from("dead_letter_queue")
    .select("*")
    .eq("status", "PENDING")
    .order("failed_at", { ascending: true });

  if (error) {
    throw new AppError(
      "Failed to get pending DLQEventProps from DLQ",
      500,
      "FAILED_GET_DLQ",
    );
  }

  return data;
}

export async function retryDLQEvent(dlqId: string, destinationUrl: string) {
  const { data: dlqEvent, error: fetchError } = await supabase
    .from("dead_letter_queue")
    .select("*")
    .eq("id", dlqId)
    .single();

  if (fetchError || !dlqEvent) {
    throw new AppError("DLQ event not found", 404, "DLQ_NOT_FOUND");
  }

  await supabase
    .from("dead_letter_queue")
    .update({ status: "RETRYING" })
    .eq("id", dlqId);

  try {
    const res = await fetch(destinationUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dlqEvent.payload),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    await supabase
      .from("dead_letter_queue")
      .update({ status: "RESOLVED", resolved_at: new Date() })
      .eq("id", dlqId);

    return { success: true };
  } catch (error: any) {
    const newRetryCount = dlqEvent.retry_count + 1;
    const maxRetries = 3;

    await supabase
      .from("dead_letter_queue")
      .update({
        status: newRetryCount >= maxRetries ? "ABANDONED" : "PENDING",
        retry_count: newRetryCount,
      })
      .eq("id", dlqId);

    return { success: false, error: error.message };
  }
}

export async function resolveDLQEvent(dlqId: string) {
  const { data, error } = await supabase
    .from("dead_letter_queue")
    .update({ status: "RESOLVED", resolved_at: new Date() })
    .eq("id", dlqId);

  if (error) {
    throw new AppError(
      "Failed to mark resolved dlq event",
      500,
      "FAILED_RESOLVED_DLQ",
    );
  }
}

export async function abandonDLQEvent(dlqId: string) {
  const { data, error } = await supabase
    .from("dead_letter_queue")
    .update({ status: "ABANDONED" })
    .eq("id", dlqId);

  if (error) {
    throw new AppError(
      "Failed to mark resolved dlq event",
      500,
      "FAILED_RESOLVED_DLQ",
    );
  }
}
