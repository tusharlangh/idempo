import supabase from "../utils/supabase/client.ts";

export async function getHealthStatus() {
  const startTime = process.uptime();

  return {
    status: "ok",
    message: "webhook is working",
    uptime_seconds: startTime,
  };
}

export async function getDBStatus() {
  const { error } = await supabase.from("event").select("id").limit(1);

  return {
    ready: !error,
    db_connection: error ? "disconnected" : "connected",
  };
}
