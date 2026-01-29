# queue-client

Typed job queue client with zod-validated envelopes. Ships two adapters — **in-memory** (dev/test) and **Postgres** (prod) — behind a common `QueueAdapter` interface.

## Installation

```bash
npm install queue-client
```

`zod` is a runtime dependency (installed automatically).
`pg` is an **optional** peer dependency — only needed if you use the Postgres adapter.

```bash
npm install pg        # only for PostgresAdapter
```

## Environment Variables (Postgres adapter)

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | Postgres connection string (preferred) |
| `PGHOST` | `localhost` | Database host |
| `PGPORT` | `5432` | Database port |
| `PGDATABASE` | `queue` | Database name |
| `PGUSER` | `postgres` | Database user |
| `PGPASSWORD` | — | Database password |

## Quick Start

### Publish a job

```typescript
import { MemoryAdapter, publishJob } from 'queue-client';

const adapter = new MemoryAdapter();
await adapter.initialize();

const { job_id, trace_id } = await publishJob(adapter, {
  type: 'send-email',
  payload: { to: 'user@example.com', subject: 'Hello' },
  priority: 10,
});

console.log('Published:', job_id, trace_id);
```

### Claim and process a job (worker)

```typescript
import { MemoryAdapter, claimNextJob, completeJob, failJob } from 'queue-client';

const adapter = new MemoryAdapter();
await adapter.initialize();

const job = await claimNextJob(adapter, 'worker-1', ['send-email']);
if (job) {
  try {
    // ... do work using job.payload ...
    await completeJob(adapter, { job_id: job.job_id, result: { sent: true } });
  } catch (err) {
    await failJob(adapter, { job_id: job.job_id, error: String(err) });
  }
}
```

### Using the Postgres adapter

```typescript
import { PostgresAdapter, publishJob, claimNextJob } from 'queue-client';

const adapter = new PostgresAdapter({
  connectionString: process.env.DATABASE_URL,
  // or: host, port, database, user, password
  schema: 'queue',    // default
  tableName: 'jobs',  // default
});

await adapter.initialize(); // creates schema + table if needed

const { job_id } = await publishJob(adapter, {
  type: 'process-image',
  payload: { url: 'https://example.com/img.png' },
});

// In a worker process:
const job = await claimNextJob(adapter, 'image-worker-1', ['process-image']);

// When done:
await adapter.close();
```

## API

### Envelopes

All jobs are wrapped in a **JobEnvelope** validated by zod at every boundary:

```typescript
interface JobEnvelope {
  job_id: string;      // UUID
  trace_id: string;    // correlation ID (auto-generated if omitted)
  type: string;        // job type identifier
  payload: Record<string, unknown>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  priority: number;
  attempts: number;
  max_attempts: number;
  created_at: Date;
  updated_at: Date;
  scheduled_for: Date;
  started_at: Date | null;
  completed_at: Date | null;
  failed_at: Date | null;
  error: string | null;
  worker_id: string | null;
}
```

Completed/failed jobs return a **ResultEnvelope**:

```typescript
interface ResultEnvelope {
  job_id: string;
  trace_id: string;
  type: string;
  status: 'completed' | 'failed';
  result?: Record<string, unknown>;
  error?: string | null;
  completed_at: Date;
}
```

### Functions

| Function | Signature | Returns |
|----------|-----------|---------|
| `publishJob` | `(adapter, { type, payload, priority?, max_attempts?, scheduled_for?, trace_id? })` | `{ job_id, trace_id }` |
| `claimNextJob` | `(adapter, workerName, jobTypes?)` | `JobEnvelope \| null` |
| `completeJob` | `(adapter, { job_id, result? })` | `ResultEnvelope \| null` |
| `failJob` | `(adapter, { job_id, error })` | `ResultEnvelope \| null` |

### Adapters

| Adapter | Use case | Constructor |
|---------|----------|-------------|
| `MemoryAdapter` | Dev / tests | `new MemoryAdapter()` |
| `PostgresAdapter` | Production | `new PostgresAdapter(config?)` |

Both implement the `QueueAdapter` interface:

```typescript
interface QueueAdapter {
  initialize(): Promise<void>;
  close(): Promise<void>;
  insert(envelope: JobEnvelope): Promise<JobEnvelope>;
  claim(workerName: string, jobTypes: string[]): Promise<JobEnvelope | null>;
  complete(jobId: string, result?: Record<string, unknown>): Promise<JobEnvelope | null>;
  fail(jobId: string, error: string): Promise<JobEnvelope | null>;
}
```

## Job Lifecycle

```
pending  ──claim──▶  processing  ──complete──▶  completed
                         │
                         └──fail──▶  failed  (if attempts >= max_attempts)
                         │
                         └──fail──▶  pending  (requeued with backoff)
```

Failed jobs are automatically requeued with exponential backoff (`attempts * 30s`) until `max_attempts` is reached.

## License

ISC
