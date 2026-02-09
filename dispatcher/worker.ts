import dotenv from "dotenv";
dotenv.config();

import supabase from "../utils/supabase/client.ts";
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
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      const { data: availableEvents, error: findError } = await supabase
        .from("event")
        .select("*")
        .or(
          `event_status.eq.RECEIVED,and(event_status.eq.PROCESSING,locked_at.lt.${fiveMinutesAgo})`,
        )
        .order("created_at", { ascending: true })
        .limit(1);

      if (findError || !availableEvents || availableEvents.length === 0) {
        console.log("No events found, sleeping for 1s");
        await sleep(1000);
        continue;
      }

      const candidateEvent = availableEvents[0];

      const { data: claimedEvents, error: claimError } = await supabase
        .from("event")
        .update({
          event_status: "PROCESSING",
          locked_at: new Date().toISOString(),
          locked_by: WORKERID,
        })
        .eq("id", candidateEvent.id)
        .eq("event_status", candidateEvent.event_status)
        .select();

      if (claimError || !claimedEvents || claimedEvents.length === 0) {
        console.log("Event was claimed by another worker, retrying...");
        continue;
      }

      const event = claimedEvents[0] as EventProps;

      console.log(`Processing event ID: ${event.id} to ${event.destination_url}`);

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
              responseBody: responseBody || `Status: ${res.status} ${res.statusText}`,
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

        await supabase
          .from("event")
          .update({
            event_status: "FAILED",
            error_details: error_details,
            failed_at: new Date(),
            locked_at: null,
            locked_by: null,
          })
          .eq("id", event.id);

        await markIdempotencyKey("FAILED", idempotencyKey, 400, {
          success: false,
          action: "FAILED",
        });

        console.error(`Event ${event.id} failed after retries:`, error_details);
      } else {
        await supabase
          .from("event")
          .update({ event_status: "DELIVERED" })
          .eq("id", event.id);

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
  process.exit(0);
}

await runContainer();
