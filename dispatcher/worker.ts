import dotenv from "dotenv";
dotenv.config();

import pool, { query, transaction } from "../db/pool.ts";
import { Retry } from "../utils/retry.ts";
import { AppError } from "../middleware/errorHandler.ts";
import type { EventProps } from "../types/databse.ts";
import { markIdempotencyKey } from "../services/idempotency.service.ts";
import { moveToDeadLetter } from "../services/dlq.service.ts";
import { RateLimiter } from "../utils/rateLimiter.ts";
import { randomUUID } from "crypto";
import { logDeliveryAttempt } from "../services/deliveryLogger.service.ts";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const WORKERID = `worker-${randomUUID().slice(0, 8)}`;
console.log(`WORKER - Starting with ID: ${WORKERID}`);

let isShuttingDown = false;
process.on("SIGINT", () => {
  console.log("\nSHUTDOWN received, finishing current work");
  isShuttingDown = true;
});

const retry = new Retry();
const rateLimiter = new RateLimiter(10, 10);

process.on("SIGTERM", () => {
  console.log("\nSHUTDOWN received, finishing current work");
  isShuttingDown = true;

  setTimeout(() => {
    console.error("SHUTDOWN - Forced exit after timeout");
    process.exit(1);
  }, 30000);
});

async function claimEvent(): Promise<EventProps | null> {
  return transaction(async (client) => {
    const { rows } = await client.query<EventProps>(
      `UPDATE event
       SET event_status = 'PROCESSING', locked_at = NOW(), locked_by = $1
       WHERE id = (
         SELECT id FROM event
         WHERE event_status = 'RECEIVED'
            OR (event_status = 'PROCESSING' AND locked_at < NOW() - INTERVAL '5 minutes')
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [WORKERID],
    );

    return rows[0] || null;
  });
}

async function runContainer() {
  await retry.retry((_attempt) => run(), 3);
}

async function run() {
  console.log("Worker started");

  while (true) {
    if (isShuttingDown) {
      console.log("SHUTDOWN - Exiting worker loop");
      break;
    }

    try {
      const event = await claimEvent();

      if (!event) {
        await sleep(1000);
        continue;
      }

      console.log(
        `Processing event ID: ${event.id} to ${event.destination_url}`,
      );

      await rateLimiter.acquire();

      const { result, error_details } = await retry.retry(async (attempt) => {
        console.log(`Attempt ${attempt} for event ${event.id}`);
        const startedAt = new Date();
        const requestHeaders = { "Content-Type": "application/json" };

        try {
          const res = await fetch(event.destination_url, {
            method: "POST",
            headers: requestHeaders,
            body: JSON.stringify(event.payload),
          });

          const responseBody = await res.text();

          await logDeliveryAttempt(
            {
              eventId: event.id,
              attemptNumber: attempt,
              destinationUrl: event.destination_url,
              requestHeaders,
              requestBody: event.payload,
              startedAt,
            },
            {
              statusCode: res.status,
              responseBody:
                responseBody || `Status: ${res.status} ${res.statusText}`,
              success: res.ok,
            },
          );

          if (!res.ok) {
            throw new AppError(
              `HTTP ${res.status}: ${res.statusText}`,
              500,
              "FAILED_DELIVERY",
            );
          }

          return res;
        } catch (error: any) {
          if (error.code !== "FAILED_DELIVERY") {
            await logDeliveryAttempt(
              {
                eventId: event.id,
                attemptNumber: attempt,
                destinationUrl: event.destination_url,
                requestHeaders,
                requestBody: event.payload,
                startedAt,
              },
              {
                errorMessage: error.message || String(error),
                success: false,
              },
            );
          }
          throw error;
        }
      }, 3);

      const idempotencyKey = event.idempotency_key;

      if (error_details.flag === "FAILURE") {
        await moveToDeadLetter(
          event.id,
          idempotencyKey,
          event.payload,
          error_details,
        );

        await query(
          `UPDATE event SET event_status = 'FAILED', error_details = $1, failed_at = NOW() WHERE id = $2`,
          [JSON.stringify(error_details), event.id],
        );

        await markIdempotencyKey("FAILED", idempotencyKey, 400, {
          success: false,
          action: "FAILED",
        });

        console.error(`Event ${event.id} failed after retries:`, error_details);
      } else {
        await query(
          `UPDATE event SET event_status = 'DELIVERED' WHERE id = $1`,
          [event.id],
        );

        await markIdempotencyKey("PROCESSED", idempotencyKey, 200, {
          success: true,
          action: "PROCESSED",
        });

        console.log(`Event ${event.id} delivered successfully`);
      }
    } catch (error) {
      console.error("Worker error:", error);
      await sleep(1000);
    }
  }

  console.log("SHUTDOWN - Worker stopped cleanly");
  await pool.end();
  process.exit(0);
}

await runContainer();
