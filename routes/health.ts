import express, { type Request, type Response } from "express";
import { getDBStatus, getHealthStatus } from "../services/health.service.ts";

const router = express.Router();

router.get("/ready", async (req: Request, res: Response) => {
  try {
    const health = await getHealthStatus();
    res.json({ success: true, data: health, error: null });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, data: null, error: "Health check failed" });
  }
});

router.get("/db-connection", async (req: Request, res: Response) => {
  try {
    const health = await getDBStatus();
    res.json({ success: true, data: health, error: null });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, data: null, error: "DB check failed" });
  }
});

export default router;
