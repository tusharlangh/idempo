import dotenv from "dotenv";
dotenv.config();

import supabase from "../utils/supabase/client.ts";
import { Retry } from "../utils/retry.ts";
import { AppError } from "../middleware/errorHandler.ts";

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
      const { data: event, error } = await supabase
        .from("event")
        .update({ event_status: "PROCESSING" })
        .eq("event_status", "RECEIVED")
        .select()
        .limit(1)
        .single();

      if (error || !event) {
        console.log("No events found, sleeping for 1s");
        await sleep(1000);
        continue;
      }

      console.log(`Processing event ID: ${event.id}`);
      const DESTINATION_URL = "http://localhost:5000/";

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

      if (error_details.flag === "FAILURE") {
        await supabase
          .from("event")
          .update({
            event_status: "FAILED",
            error_details: error_details,
            failed_at: new Date().toISOString(),
          })
          .eq("id", event.id)
          .select()
          .limit(1)
          .single();

        console.error(`Event ${event.id} failed after retries:`, error_details);
      } else {
        await supabase
          .from("event")
          .update({ event_status: "DELIVERED" })
          .eq("id", event.id)
          .select()
          .limit(1)
          .single();

        console.log(`Event ${event.id} delivered successfully`);
      }
    } catch (error) {
      console.error("Worker error:", error);
      await sleep(1000);
    }
  }
}

await runContainer();
