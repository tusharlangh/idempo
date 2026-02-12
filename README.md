# Idempo

A distributed event delivery engine capable of processing 1.2M+ events per hour within <6ms latency with exactly once delivery guarantee. Idempo was a build inspired by Stripe's event delivery system.

## Why I Built This

This project was a deep dive into the most difficult aspect of software: worrying about what cannot be tested. It forced me to move beyond 'happy path' development to account for edge cases like partial failures, silent data drifts, and timing attacks. I learned that guaranteeing a result is as hard as it gets especially with distributed systems, where enforcing 'exactly-once' delivery is as difficult to implement as it is simple to describe.

## Features

**Exactly Once Delivery**  
Guarantees zero duplicate processing using idempotency keys to ensure data consistency.

**Horizontal Scaling**  
Supports concurrent workers with optimistic locking to process events in parallel without conflicts.

**Resilient Architecture**  
Implements automated exponential backoff retries and Dead Letter Queues for robust failure handling.

**Rate Limiting**  
Protects downstream services from overload using efficient token bucket algorithms.

**Delivery Audit Trail**  
Maintains a complete history of every delivery attempt including latency, status codes, and payloads.

**Security Verification**  
Validates all incoming webhooks using time-safe HMAC SHA256 signatures to prevent tampering.

**Full Observability**  
Provides real-time system monitoring and health checks via Prometheus and Grafana dashboards.

## Installation

1. Clone the repository to your computer
   `git clone https://github.com/tusharlangh/idempo.git`

2. Enter the project directory
   `cd idempo`

3. Create a .env file with the following configuration

   ```
   WEBHOOKSECRET=any_secret_you_want
   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/idempo
   ```

4. Run the services
   `docker compose up`

## Usage

**Sending an Event**
To send an event, make a POST request to the localhost server on port 3000. You must include the Idempotency Key, the Destination URL, and the connection signature in your headers. The system will verify the request and queue it for delivery.

**Viewing Metrics**
You can monitor the system performance by opening Grafana in your web browser at port 3100. Use the default admin login credentials to access the dashboards.

**Checking Health**
The system exposes health endpoints that you can call to verify uptime. Access the health/ready endpoint to check if the API is responsive.

## Tech Stack

- Runtime: Node.js with Typescript
- Databases: PostgreSQL
- Logging: Pino (JSON structure)
- Testing: Vitest
- Load testing: K6
- Observability/metrics: Grafana

## Performance

Load tested with K6 across 3 scenarios: smoke (5 VUs), ramp to 50 VUs, and spike to 100 VUs.

| Metric              | Result    |
| ------------------- | --------- |
| Total Requests      | 30,533    |
| Throughput          | 339 req/s |
| Avg Latency         | 5.46ms    |
| P95 Latency         | 14.40ms   |
| Failure Rate        | 0.00%     |
| Projected Events/hr | 1,220,443 |

## Contributing

Contributions are welcome! If you'd like to enhance this project or report issues, please submit a pull request or open an issue.
