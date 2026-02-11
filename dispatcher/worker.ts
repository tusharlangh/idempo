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
import { workerLogger } from "../utils/logger.ts";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const WORKERID = `worker-${randomUUID().slice(0, 8)}`;
const log = workerLogger.child({ workerId: WORKERID });

log.info({ WORKERID }, "Worker started");

let isShuttingDown = false;
process.on("SIGINT", () => {
  log.info("SHUTDOWN received, finishing current work");
  isShuttingDown = true;
});

const retry = new Retry();
const rateLimiter = new RateLimiter(10, 10);

process.on("SIGTERM", () => {
  log.info("SHUTDOWN received, finishing current work");
  isShuttingDown = true;

  setTimeout(() => {
    log.error("SHUTDOWN - Forced exit after timeout");
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
  log.info("Worker started");

  while (true) {
    if (isShuttingDown) {
      log.info("SHUTDOWN - Exiting worker loop");
      break;
    }

    try {
      const event = await claimEvent();

      if (!event) {
        await sleep(1000);
        continue;
      }

      log.info(
        { eventId: event.id, destinationUrl: event.destination_url },
        "Processing event",
      );

      await rateLimiter.acquire();

      const { result, error_details } = await retry.retry(async (attempt) => {
        log.info({ eventId: event.id, attempt }, "Delivery attempt");
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
        log.error(
          { eventId: event.id, errorDetails: error_details },
          "Event failed after retires",
        );
      } else {
        await query(
          `UPDATE event SET event_status = 'DELIVERED' WHERE id = $1`,
          [event.id],
        );

        await markIdempotencyKey("PROCESSED", idempotencyKey, 200, {
          success: true,
          action: "PROCESSED",
        });

        log.info({ eventId: event.id }, "Event delivered successfully");
      }
    } catch (error) {
      log.error({ error: error }, "Worker error");
      await sleep(1000);
    }
  }
  log.info("Shutdown worker stopped cleanly");
  await pool.end();
  process.exit(0);
}

await runContainer();
