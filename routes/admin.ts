import express, { type Request, type Response } from "express";
import {
  abandonDLQEvent,
  getPendingDLQEvents,
  resolveDLQEvent,
  retryDLQEvent,
} from "../services/dlq.service.ts";
import { Retry } from "../utils/retry.ts";
import { AppError } from "../middleware/errorHandler.ts";
import supabase from "../utils/supabase/client.ts";

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
    const { data, error } = await supabase
      .from("event")
      .select()
      .eq("id", req.params.id)
      .single();

    if (error || !data) {
      return res
        .status(404)
        .json({ success: false, error: "Event not found." });
    }

    const { data: dlqData, error: dlqError } = await supabase
      .from("dead_letter_queue")
      .select()
      .eq("id", req.params.id)
      .single();

    return {
      success: true,
      data: {
        event: data,
        dlq: dlqData || null,
      },
    };
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch event" });
  }
});

export default router;
