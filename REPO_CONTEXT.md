# queue-client - ARQLO Job Queue Infrastructure

## Role
**Shared Utility (Queue)** - Postgres-backed job queue for reliable worker coordination

## Intended Responsibilities
- Provide atomic job publishing, claiming, and completion
- Implement FOR UPDATE SKIP LOCKED for concurrent worker safety
- Support job prioritization and scheduling
- Automatic retry with exponential backoff (30-second intervals)
- Job state management (pending → processing → completed/failed)
- Worker assignment and tracking
- Integration with arclo-contracts for payload validation

## Integration Points

### Database
- **Creates Schema**: Yes (creates `queue` schema and `queue.jobs` table)
- **Tables**: `queue.jobs`
- **Connection**: Configurable via options or DATABASE_URL

### Queue
- **Is the Queue**: Yes (this is the queue implementation)

### KBase
- **Integration**: None (queue and KBase are separate concerns)

### HTTP
- **Exposes REST API**: No (library only)

## Service Name
N/A (library, not a service)

## Always-On Runtime
**No** - This is a library package, not a running service

## Key Files
- **Client Implementation**: `src/client.ts` (196 lines)
- **Schema Definitions**: `src/schema.ts`
- **Type Definitions**: `src/types.ts`
- **Documentation**: `README.md`

## queue.jobs Schema
```sql
CREATE TABLE queue.jobs (
  id UUID PRIMARY KEY,
  type VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error TEXT,
  worker_id VARCHAR(255)
);
```

## Indexes
- `idx_queue_jobs_status_priority_scheduled` - Optimizes job claiming query
- `idx_queue_jobs_type` - Filter by job type
- `idx_queue_jobs_worker_id` - Worker tracking

## Core Methods
- `initialize()` - Create queue schema and table
- `publishJob(options)` - Add job to queue with validation
- `claimJob(options)` - Atomically claim next pending job (FOR UPDATE SKIP LOCKED)
- `completeJob(options)` - Mark job as completed
- `failJob(options)` - Mark job as failed (auto-requeue with backoff if attempts remain)
- `close()` - Close database connection pool

## Job States
- `pending` - Waiting to be processed
- `processing` - Claimed by a worker
- `completed` - Successfully finished
- `failed` - Exhausted all retry attempts

## Dependencies
- **Other Repos**: arclo-contracts (peer dependency for validation)
- **External**: postgres (pg), zod

## Published Package
- **Name**: `queue-client`
- **Usage**: `npm install queue-client arclo-contracts`

## Environment Variables
- `DATABASE_URL` - Postgres connection string (alternative to explicit config)

## Maturity Level
**Level 3**: Production-ready, atomic operations, comprehensive retry logic

## Known Gaps
- **C1**: NOT ADOPTED by Hermes or most workers (critical gap)
- **M2**: No stuck-job recovery mechanism (jobs in "processing" state with dead workers)
- **M2**: No heartbeat mechanism to detect stalled jobs
- Missing dead-letter queue for permanently failed jobs
- No built-in job dependency support (DAG)
