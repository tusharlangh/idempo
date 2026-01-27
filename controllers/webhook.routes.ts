import { type Request, type Response } from "express";
import { verifySignature } from "../utils/signature.ts";
import dotenv from "dotenv";

dotenv.config();

export function WebHookProvider(req: Request, res: Response) {
  try {
    const rawBody = (req as any).rawBody as Buffer;
    console.log("rawBody:", rawBody);
    const signature = req.headers["x-webhook-signature"] as string;

    if (!signature) {
      return res
        .status(400)
        .json({ success: false, error: "missing signature" });
    }

    const isSignatureValid = verifySignature(
      rawBody,
      process.env.WEBHOOKSIGNATURE as string,
      process.env.WEBHOOKSECRET as string,
    );

    if (!isSignatureValid) {
      return res.status(401).json({
        sucess: false,
        error: "failed signature verfiying. you are not the sender",
      });
    }

    console.log("verified event:", rawBody.toString());

    return res.status(200).json({ success: true, error: null });
  } catch (error) {
    console.error("webhook error: ", error);
    return res.status(500).json({ success: false, error: "internal error" });
  }
}
