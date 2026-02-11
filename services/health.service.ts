import { query } from "../db/pool.ts";

export async function getHealthStatus() {
  const startTime = process.uptime();

  return {
    status: "ok",
    message: "webhook is working",
    uptime_seconds: startTime,
  };
}

export async function getDBStatus() {
  try {
    await query("SELECT 1");
    return { ready: true, db_connection: "connected" };
  } catch {
    return { ready: false, db_connection: "disconnected" };
  }
}
