import dotenv from "dotenv";
dotenv.config();

import supabase from "../utils/supabase/client.ts";
import { Retry } from "../utils/retry.ts";
import { AppError } from "../middleware/errorHandler.ts";
import type { EventProps } from "../types/databse.ts";
import { markIdempotencyKey } from "../services/idempotency.service.ts";
import { moveToDeadLetter } from "../services/dlq.service.ts";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const retry = new Retry();

async function runContainer() {
  await retry.retry(() => run(), 3);
}

async function run() {
  console.log("Worker started");

  while (true) {
    try {
      const { data, error } = (await supabase.rpc("clain_next_event")) as {
        data: EventProps[];
        error: any;
      };
      const event = data?.[0];

      if (error || !event) {
        console.log("No events found, sleeping for 1s");
        await sleep(1000);
        continue;
      }

      console.log(`Processing event ID: ${event.id}`);
      const DESTINATION_URL = "https://httpbin.org/status/20";

      const { result, error_details } = await retry.retry(async () => {
        const res = await fetch(DESTINATION_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(event.payload),
        });

        if (!res.ok) {
          throw new AppError(
            `HTTP ${res.status}: ${res.statusText}`,
            500,
            "FAILED_DELIVERY",
          );
        }

        return res;
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
}

await runContainer();
