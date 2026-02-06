import express, { type Request, type Response } from "express";
import { getDBStatus, getHealthStatus } from "../services/health.service.ts";
import supabase from "../utils/supabase/client.ts";

const router = express.Router();

router.get("/ready", async (req: Request, res: Response) => {
  try {
    const health = await getHealthStatus();
    res.json({ success: true, data: health, error: null });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, data: null, error: "Failed to fetch DLQ" });
  }
});

router.get("/db-connection", async (req: Request, res: Response) => {
  try {
    const health = await getDBStatus();
    res.json({ success: true, data: health, error: null });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, data: null, error: "Failed to fetch DLQ" });
  }
});

export default router;
