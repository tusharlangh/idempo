import dotenv from "dotenv";
dotenv.config();

import supabase from "../utils/supabase/client.ts";
import { Retry } from "../utils/retry.ts";

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

      try {
        await retry.retry(async () => {
          const res = await fetch(DESTINATION_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(event.payload),
          });

          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }

          return res;
        }, 3);

        await supabase
          .from("event")
          .update({ event_status: "DELIVERED" })
          .eq("id", event.id)
          .select()
          .limit(1)
          .single();

        console.log(`Event ${event.id} delivered successfully`);
      } catch (error) {
        console.error(`Event ${event.id} failed:`, error);

        await supabase
          .from("event")
          .update({ event_status: "FAILED" })
          .eq("id", event.id)
          .select()
          .limit(1)
          .single();
      }
    } catch (error) {
      console.error("Worker error:", error);
      await sleep(1000);
    }
  }
}

await runContainer();
