import express from "express";
import routes from "./routes/webhook.ts";
import dlqRoutes from "./routes/admin.ts";
import healthRoutes from "./routes/health.ts";
import { errorHandler } from "./middleware/errorHandler.ts";
import { apiLogger } from "./utils/logger.ts";
import register, {
  httpRequestDurationSeconds,
  httpRequestsTotal,
} from "./utils/metrics.ts";

const app = express();

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route ? req.route.path : req.path;

    httpRequestsTotal.inc({
      method: req.method,
      route: route,
      status_code: res.statusCode,
    });

    httpRequestDurationSeconds.observe(
      {
        method: req.method,
        route: route,
        status_code: res.statusCode,
      },
      duration,
    );
  });
  next();
});

app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.get("/metrics", async (req, res) => {
  res.set("Content-type", register.contentType);
  res.end(await register.metrics());
});

app.use("/", routes);
app.use("/admin", dlqRoutes);
app.use("/health", healthRoutes);
app.use(errorHandler);

const port = Number(process.env.PORT) || 3000;

app.listen(port, "0.0.0.0", () => {
  apiLogger.info({ port }, "Server started");
});

export default app;
