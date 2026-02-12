import client from "prom-client";

const collectDefaultMetrics = client.collectDefaultMetrics;
const Registry = client.Registry;
const register = new Registry();
collectDefaultMetrics({ register });

export const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

export const httpRequestDurationSeconds = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const eventsReceivedTotal = new client.Counter({
  name: "events_received_total",
  help: "Total number of webhook events received",
  labelNames: ["status"],
  registers: [register],
});

export const eventsProcessedTotal = new client.Counter({
  name: "events_processed_total",
  help: "Total number of webhook events processed by workers",
  labelNames: ["status"],
  registers: [register],
});

export const eventProcessingDurationSeconds = new client.Histogram({
  name: "event_processing_duration_seconds",
  help: "Duration of event processing in seconds (including retries)",
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

export default register;
