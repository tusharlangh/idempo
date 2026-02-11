# Idempo

A webhook delivery engine built from scratch that guarantees exactly once delivery. Inspired by how Stripe and Shopify handle webhook reliability at scale, I wanted to understand the internals of what makes these systems actually work and built my own version.

## Why I Built This

Most webhook systems have a huge problem: if the network drops mid delivery, you dont know if the receiver got the event or not. Retrying might cause duplicates. Not retrying might lose events. This project solves that with idempotency keys, atomic locking, and a dead letter queue for events that just wont go through.

## Architecture

_coming soon_

## Features

**Exactly Once Delivery**
Every webhook request includes an idempotency key. If the same key comes in again, we return the cached response instead of processing it twice. If the same key comes in with a different request body, we reject it as a conflict.

**Horizontal Scaling**
Multiple workers can run simultaneously and they wont step on each other. When a worker picks up an event, it uses optimistic locking to atomically claim it. If two workers try to grab the same event, only one wins and the other moves on. If a worker crashes, the lock expires after 5 minutes and another worker picks it up.

**Retry with Backoff**
Failed deliveries are retried automatically with increasing delays between attempts. Each attempt is logged with full request/response details so you can debug exactly what went wrong.

**Dead Letter Queue**
Events that fail all retry attempts dont just disappear. They go to a dead letter queue where you can inspect them, retry them manually, or mark them as resolved through the admin API.

**Rate Limiting**
Outgoing requests use a token bucket algorithm to avoid overwhelming destination servers. The bucket refills at a configurable rate so you get burst capacity without sustained overload.

**Delivery Audit Trail**
Every single delivery attempt is logged to the database including request headers, response body, status code, latency, and any error messages. You can query the full history of any event.

**Signature Verification**
Incoming webhooks are verified using HMAC SHA256 with timing safe comparison to prevent timing attacks. If the signature doesnt match, the request is rejected before any processing happens.

**Health Checks**
Built in health and readiness endpoints for monitoring. The `/health/ready` endpoint checks overall system health and `/health/db-connection` verifies the database is reachable.

## Tech Stack

| Component    | Technology              |
| ------------ | ----------------------- |
| Runtime      | Node.js with TypeScript |
| Framework    | Express 5               |
| Database     | PostgreSQL              |
| Containers   | Docker Compose          |
| Logging      | Pino (structured JSON)  |
| Testing      | Vitest with 54 tests    |
| Load Testing | K6                      |
| Auth         | HMAC SHA256 signatures  |

## Performance

Load tested with K6 across 3 scenarios: smoke (5 VUs), ramp to 50 VUs, and spike to 100 VUs.

| Metric               | Result        |
| -------------------- | ------------- |
| Total Requests       | 30,533        |
| Throughput           | 339 req/s     |
| Avg Latency          | 5.46ms        |
| P95 Latency          | 14.40ms       |
| Failure Rate         | 0.00%         |
| Projected Events/hr  | 1,220,443     |



## Quickstart

```bash
git clone https://github.com/tusharlangh/idempo.git
cd idempo
cp .env.example .env
docker compose up
```

The system will:

1. Start PostgreSQL
2. Run migrations automatically
3. Start the API server on port 3000
4. Start 2 background workers

### Local Development

For local development without Docker:

```bash
npm install
docker compose up -d db
npm run migrate
npm start
npm run worker
```

### Configuration

Edit `.env`:

```bash
WEBHOOKSECRET=your_webhook_secret
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/idempo
PORT=3000
```

### Testing

Send a test webhook:

```bash
./test-webhook.sh
```

Or manually:

```bash
PAYLOAD='{"test": 1}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "supersecret" | awk '{print $2}')

curl -X POST http://localhost:3000/webhooks \
  -H "Content-Type: application/json" \
  -H "X-Destination-URL: https://httpbin.org/post" \
  -H "x-webhook-signature: $SIGNATURE" \
  -H "Idempotency-key: test-$(date +%s)" \
  -d "$PAYLOAD"
```

Check worker logs:

```bash
docker logs -f idempo-worker-1
```

### Scaling

Run more workers:

```bash
docker compose up -d --scale worker=5
```

## API Reference

### Send a Webhook

```bash
POST /webhooks
```

**Required Headers:**

| Header                | Description                                |
| --------------------- | ------------------------------------------ |
| `X-Webhook-Signature` | HMAC SHA256 signature of the request body  |
| `Idempotency-Key`     | Unique key to prevent duplicate processing |
| `X-Destination-URL`   | Where the event should be delivered to     |

**Example:**

```bash
curl -X POST http://localhost:3000/webhooks \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: your_computed_signature" \
  -H "Idempotency-Key: evt_abc123" \
  -H "X-Destination-URL: https://your-app.com/webhook" \
  -d '{"type": "user.created", "data": {"id": "usr_123", "email": "test@example.com"}}'
```

**Response:** `202 Accepted`

### Admin API

```bash
GET    /admin/dlq              # List all pending dead letter events
POST   /admin/dlq/:id/retry    # Retry a dead letter event
POST   /admin/dlq/:id/resolve  # Mark as resolved
POST   /admin/dlq/:id/abandon  # Abandon the event
GET    /admin/events/:id       # Get event details with DLQ status
```

### Health Checks

```bash
GET /health/ready              # System readiness check
GET /health/db-connection      # Database connectivity check
```

## How Exactly Once Works

1. Client sends event with `Idempotency-Key: abc123`
2. We hash the request body and try to insert the key into the database
3. If the key is new, we proceed with processing
4. If the key already exists and the body hash matches, we return the cached response
5. If the key exists but the body hash is different, we reject it (same key, different payload = mistake)
6. If the key is stuck in PROCESSING for more than 60 seconds, we assume the previous attempt crashed and reprocess

## How Worker Scaling Works

The workers dont need any coordination service like Redis or Zookeeper. Each worker independently polls the database for available events using PostgreSQL's `FOR UPDATE SKIP LOCKED`:

```sql
UPDATE event
SET event_status = 'PROCESSING', locked_at = NOW(), locked_by = $1
WHERE id = (
  SELECT id FROM event
  WHERE event_status = 'RECEIVED'
     OR (event_status = 'PROCESSING' AND locked_at < NOW() - INTERVAL '5 minutes')
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
RETURNING *
```

`SKIP LOCKED` means if another worker already locked a row, this worker skips it instantly instead of waiting. This gives you lock-free horizontal scaling with zero contention. Workers never block each other and never process the same event twice.

## Testing

```bash
npm test
```

54 tests across 9 test files covering:

| Test Suite             | Tests | Coverage                                                       |
| ---------------------- | ----- | -------------------------------------------------------------- |
| Retry logic            | 6     | Success, failure, backoff timing, attempt param                |
| Rate limiter           | 5     | Token depletion, refill, burst traffic                         |
| Signature verification | 7     | Valid, invalid, tampered, edge cases                           |
| Hash function          | 3     | Determinism, uniqueness, nested objects                        |
| Idempotency middleware | 7     | All action paths and error handling                            |
| Idempotency service    | 10    | Every branch: proceed, cached, conflict, mismatch, lock expiry |
| Delivery logger        | 9     | Logging, latency calc, truncation, null handling               |
| DLQ service            | 2     | Move to DLQ, fetch pending                                     |
| Webhook endpoint       | 5     | Header validation, signature, destination URL                  |

## Hardest Part

The hardest thing about this project was getting the concurrency right. When you have multiple workers polling the same database for events, theres a real chance two of them grab the same event at the exact same time. My first attempt used a simple SELECT then UPDATE which had a race condition I didnt notice until I ran two workers simultaneously and saw duplicate deliveries.

The fix was switching to `FOR UPDATE SKIP LOCKED` which atomically claims an event in a single query. Workers never block each other and never process the same event twice. It sounds simple in retrospect but figuring out why events were being delivered twice and landing on the right PostgreSQL primitive took me a while.

The idempotency key system was also tricky because you have to handle so many edge cases. What if the key exists but with a different body? What if the previous request crashed mid processing and the key is stuck in PROCESSING forever? I ended up implementing a lock timeout so stale keys get reclaimed after 60 seconds which handles the crash recovery case.

## License

ISC
