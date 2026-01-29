import express, { type Request, type Response } from "express";
import { WebHookProvider } from "../controllers/webhook.routes.ts";
const router = express.Router();

router.get("/", (req: Request, res: Response): void => {
  res.status(200).json({
    status: "ok",
    message: "webhook is working",
    time: new Date().toISOString(),
  });
});

router.post("/webhooks", WebHookProvider);

export default router;
