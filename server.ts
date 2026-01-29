import express from "express";
import routes from "./routes/webhook.ts";
import { errorHandler } from "./middleware/errorHandler.ts";

const app = express();

app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use("/", routes);
app.use(errorHandler);

const port = Number(process.env.PORT) || 3000;

app.listen(port, "0.0.0.0", () => {
  console.log(`Webhook server listening on port ${port}`);
});

export default app;
