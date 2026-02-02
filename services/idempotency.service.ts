import { AppError } from "../middleware/errorHandler.ts";
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
      locked_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (!error) {
    return { sucess: true, action: "PROCEED" };
  }

  const { data: exist } = await supabase
    .from("idempotency_keys")
    .select()
    .eq("key", key)
    .single();

  if (!exist) {
    throw new AppError(
      "Matching idempotency key missing although it should exist",
      500,
      "MISSING_IDEM_KEY",
    );
  }

  if (exist.response_hash !== hashedBody) {
    return { success: false, action: "HASHED_MISMATCH" };
  }

  if (exist.status === "COMPLETED") {
    return {
      success: false,
      action: "RETURN_CACHED",
      metadata: {
        response_status: exist.response_status,
        response_body: exist.resposne_body,
      },
    };
  }

  return { success: false, action: "CONFLICT" };
}
