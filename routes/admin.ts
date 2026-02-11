import express, { type Request, type Response } from "express";
import {
  abandonDLQEvent,
  getPendingDLQEvents,
  resolveDLQEvent,
  retryDLQEvent,
} from "../services/dlq.service.ts";
import { Retry } from "../utils/retry.ts";
import { AppError } from "../middleware/errorHandler.ts";
import { query } from "../db/pool.ts";

const router = express.Router();

const retry = new Retry();

router.get("/dlq", async (req: Request, res: Response) => {
  try {
    const events = await getPendingDLQEvents();
    res.json({ success: true, data: events, error: null });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, data: null, error: "Failed to fetch DLQ" });
  }
});

router.post("/dlq/:id/resolve", async (req: Request, res: Response) => {
  try {
    await resolveDLQEvent(req.params.id as string);
    res.json({ success: true, data: null, error: null });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      error: `Failed to resolve DLQ event for ${req.params.id}`,
    });
  }
});

router.post("/dlq/:id/abandon", async (req: Request, res: Response) => {
  try {
    await abandonDLQEvent(req.params.id as string);
    res.json({ success: true, data: null, error: null });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      error: `Failed to abandon DLQ event for ${req.params.id}`,
    });
  }
});

router.post("/dlq/:id/retry", async (req: Request, res: Response) => {
  try {
    const DESTINATION_URL = "https://httpbin.org/status/20";
    const data = await retryDLQEvent(req.params.id as string, DESTINATION_URL);

    res.json({ success: true, data: data, error: null });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      error: `Failed to retry DLQ event for ${req.params.id}`,
    });
  }
});

router.get("/events/:id", async (req: Request, res: Response) => {
  try {
    const { rows: eventRows } = await query(
      `SELECT * FROM event WHERE id = $1`,
      [req.params.id],
    );

    if (eventRows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Event not found." });
    }

    const { rows: dlqRows } = await query(
      `SELECT * FROM dead_letter_queue WHERE original_event_id = $1`,
      [req.params.id],
    );

    return res.json({
      success: true,
      data: {
        event: eventRows[0],
        dlq: dlqRows[0] || null,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch event" });
  }
});

router.get("/events", async (req: Request, res: Response) => {
  try {
    const { rows: eventRows } = await query(`SELECT * FROM event`);

    if (eventRows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Event not found." });
    }

    return res.json({
      success: true,
      data: {
        events: eventRows,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch events" });
  }
});

export default router;
