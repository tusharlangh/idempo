import { error } from "node:console";
import { acquireIdempotencyKey } from "../services/idempotency.service.ts";

import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import type { AppError } from "./errorHandler.ts";

export async function idemp(req: Request, res: Response, next: NextFunction) {
  try {
    const key = req.header("Idempotency-key") as string;

    const body = req.body;
    const acquire = await acquireIdempotencyKey(key, body);

    switch (acquire.action) {
      case "PROCCEED":
        return next();

      case "RETURN_CACHED":
        return res
          .status(acquire.metadata?.response_status)
          .json(acquire.metadata?.response_body);

      case "CONFLICT":
        return res
          .status(409)
          .json({ error: "Request with this key already exists." });

      case "HASH_MISMATCH":
        return res.status(400).json({
          error: "Request with this key exists but with a different body",
        });

      default:
        return res.status(500).json({ error: "unknown idempotency error" });
    }
  } catch (error) {
    console.error(`${error}`);
    return res.status(500).json({ error: "internal server error" });
  }
}
