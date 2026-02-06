import express, { type Request, type Response } from "express";
import { WebHookProvider } from "../controllers/webhook.routes.ts";
import { idempo } from "../middleware/idempotency.ts";

const router = express.Router();

router.post("/webhooks", idempo, WebHookProvider);

export default router;
