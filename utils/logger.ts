import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });
export const apiLogger = logger.child({ service: "api" });
export const workerLogger = logger.child({ service: "worker" });
export const dbLogger = logger.child({ service: "db" });
export const retryLogger = logger.child({ service: "retry" });
export const errorMiddlewareLogger = logger.child({
  service: "error-middleware",
});

export default logger;
