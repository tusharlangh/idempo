import { type Request, type Response } from "express";
import { verifySignature } from "../utils/signature.ts";
import dotenv from "dotenv";
import { AppError, NotFoundError } from "../middleware/errorHandler.ts";
import type { CanonicalEvent } from "../types/event.ts";
import { v4 as uuidv4 } from "uuid";
import { query } from "../db/pool.ts";
import { apiLogger } from "../utils/logger.ts";
import { eventsReceivedTotal } from "../utils/metrics.ts";

dotenv.config();

export async function WebHookProvider(req: Request, res: Response) {
  try {
    const rawBody = (req as any).rawBody as Buffer;
    const signature = req.headers["x-webhook-signature"] as string;
    const idempotencyKey = req.header("Idempotency-key") as string;
    const destinationUrl = req.header("X-Destination-URL") as string;

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

    if (!destinationUrl) {
      throw new NotFoundError("X-Destination-URL header is required.");
    }

    try {
      new URL(destinationUrl);
    } catch {
      throw new AppError(
        "X-Destination-URL must be a valid URL.",
        400,
        "INVALID_URL",
      );
    }

    const isSignatureValid = verifySignature(rawBody, signature, secretKey);

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

    const { rows } = await query(
      `INSERT INTO event (payload, event_status, idempotency_key, destination_url)
       VALUES ($1, 'RECEIVED', $2, $3)
       RETURNING *`,
      [JSON.stringify(payload), idempotencyKey, destinationUrl],
    );

    if (rows.length === 0) {
      throw new AppError(
        "Event did not persist to database",
        500,
        "PERSIST_FAILED",
      );
    }
    eventsReceivedTotal.inc({ status: "received" });

    return res.status(202).json({ success: true, error: null });
  } catch (error) {
    apiLogger.error({ error: error }, "Webhook error");

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
