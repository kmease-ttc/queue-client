# queue-client

Postgres-backed job queue client for Hermes and workers. Provides reliable job publishing, claiming, and completion with atomic operations.

## Installation

```bash
npm install queue-client arclo-contracts
```

Note: `arclo-contracts` is a required peer dependency for job payload validation.

## Usage

```typescript
import { QueueClient } from 'queue-client';

const queue = new QueueClient({
  connectionString: 'postgresql://user:password@localhost:5432/mydb',
  // Or use individual options:
  // host: 'localhost',
  // port: 5432,
  // database: 'mydb',
  // user: 'postgres',
  // password: 'secret',
});

// Initialize the queue table
await queue.initialize();
```

### Publishing Jobs

```typescript
const job = await queue.publishJob({
  type: 'send-email',
  payload: {
    to: 'user@example.com',
    subject: 'Hello',
    body: 'World',
  },
  priority: 10,        // Higher priority jobs are processed first
  maxAttempts: 5,      // Number of retry attempts on failure
  scheduledFor: new Date(), // When to process the job
});
```

### Claiming Jobs (Workers)

```typescript
const result = await queue.claimJob({
  workerId: 'worker-1',
  types: ['send-email', 'process-image'], // Optional: filter by job types
});

if (result.job) {
  console.log('Claimed job:', result.job.id);
}
```

### Completing Jobs

```typescript
await queue.completeJob({
  jobId: job.id,
  workerId: 'worker-1',
});
```

### Failing Jobs

```typescript
await queue.failJob({
  jobId: job.id,
  workerId: 'worker-1',
  error: 'Connection timeout',
});
```

Jobs that fail are automatically requeued with exponential backoff until `maxAttempts` is reached.

## API Reference

### QueueClient

#### Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| connectionString | string | - | Postgres connection string |
| host | string | localhost | Database host |
| port | number | 5432 | Database port |
| database | string | queue | Database name |
| user | string | postgres | Database user |
| password | string | - | Database password |
| schema | string | queue | Schema for the jobs table |
| tableName | string | jobs | Name of the jobs table |

#### Methods

- `initialize()` - Create the jobs table if it doesn't exist
- `publishJob(options)` - Add a job to the queue
- `claimJob(options)` - Atomically claim a pending job
- `completeJob(options)` - Mark a job as completed
- `failJob(options)` - Mark a job as failed (with auto-retry)
- `close()` - Close the database connection pool

## Job States

- `pending` - Job is waiting to be processed
- `processing` - Job has been claimed by a worker
- `completed` - Job finished successfully
- `failed` - Job failed after exhausting all retry attempts

## License

ISC
