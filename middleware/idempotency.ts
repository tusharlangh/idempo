import { acquireIdempotencyKey } from "../services/idempotency.service.ts";
import { type NextFunction, type Request, type Response } from "express";

export async function idempo(req: Request, res: Response, next: NextFunction) {
  try {
    const key: string | undefined = req.header("Idempotency-key");

    if (!key) {
      return next();
    }

    const body: Record<string, any> = req.body;
    const acquire = await acquireIdempotencyKey(key, body);

    switch (acquire.action) {
      case "PROCEED":
        return next();

      case "RETURN_CACHED":
        return res
          .status(acquire.metadata?.response_status ?? 200)
          .json(acquire.metadata?.response_body);

      case "CONFLICT":
        return res
          .status(409)
          .json({ error: "Request with this key already exists." });

      case "HASHED_MISMATCH":
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
