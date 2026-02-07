import { type Request, type Response } from "express";
import { verifySignature } from "../utils/signature.ts";
import dotenv from "dotenv";
import { AppError, NotFoundError } from "../middleware/errorHandler.ts";
import type { CanonicalEvent } from "../types/event.ts";
import { v4 as uuidv4 } from "uuid";
import supabase from "../utils/supabase/client.ts";

dotenv.config();

export async function WebHookProvider(req: Request, res: Response) {
  try {
    const rawBody = (req as any).rawBody as Buffer;
    const signature = req.headers["x-webhook-signature"] as string;
    const idempotencyKey = req.header("Idempotency-key") as string;

    const secretKey = process.env.WEBHOOKSECRET as string;

    if (rawBody.length === 0) {
      throw new NotFoundError("Rawbody is missing.");
    }

    if (!signature) {
      throw new NotFoundError("Signature is missing.");
    }

    if (!secretKey) {
      throw new NotFoundError("Secret key is missing.");
    }

    console.log(secretKey);

    const isSignatureValid = verifySignature(
      rawBody,
      //process.env.WEBHOOKSIGNATURE as string, //temp: but has to be signature
      signature,
      secretKey,
    );

    if (!isSignatureValid) {
      throw new AppError(
        "Failed signature verifying. you are not the sender",
        403,
        "FAILED_SIGNATURE_VERIFY",
      );
    }

    const payload: CanonicalEvent = {
      id: req.body.id || uuidv4(),
      type: req.body.type || "unknown.event",
      created: req.body.created || Math.floor(Date.now() / 1000),
      source: "stripe",
      data: {
        object: req.body.data?.object || req.body,
      },
    };

    const { data, error } = await supabase
      .from("event")
      .insert({
        payload: payload,
        event_status: "RECEIVED",
        idempotency_key: idempotencyKey,
      })
      .select()
      .single();

    if (error) {
      throw new AppError(
        `Event did not make it to supabase. ${error.message}`,
        500,
        "PERSIST_FAILED",
      );
    }

    return res.status(202).json({ success: true, error: null });
  } catch (error) {
    console.error("webhook error: ", error);

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.code,
      });
    }
    return res.status(500).json({ success: false, error: "internal error" });
  }
}
