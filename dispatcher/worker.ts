import dotenv from "dotenv";
dotenv.config();

import supabase from "../utils/supabase/client.ts";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("start worker");

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
        console.log("did not find anything sleeping worker");
        await sleep(1000);
        continue;
      }

      const DESTINATION_URL = "http://localhost:5000/";

      try {
        const res = await fetch(DESTINATION_URL, {
          method: "POST",
          headers: { "Content-type": "application/json" },
          body: JSON.stringify(event.payload),
        });

        let mark = "";

        if (res.ok) {
          mark = "DELIVERED";
        } else {
          mark = "FAILED";
        }

        const { data: e, error } = await supabase
          .from("event")
          .update({ event_status: mark })
          .eq("id", event.id)
          .select()
          .limit(1)
          .single();
      } catch (error) {
        console.error(error);
        const { data: e, error: err } = await supabase
          .from("event")
          .update({ event_status: "FAILED" })
          .eq("id", event.id)
          .select()
          .limit(1)
          .single();
      }

      console.log("successfully everythign worked");
    } catch (error) {
      console.error("Worker error:", error);
      await sleep(1000);
    }
  }
}

await run();
