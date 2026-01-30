// Envelopes & schemas
export {
  JobStatus,
  JobEnvelope,
  ResultEnvelope,
  PublishJobInput,
  PublishResult,
  CompleteJobInput,
  FailJobInput,
  JobStatusSchema,
  JobEnvelopeSchema,
  ResultEnvelopeSchema,
  PublishJobInputSchema,
  CompleteJobInputSchema,
  FailJobInputSchema,
} from './envelopes';

// Adapter interface
export type { QueueAdapter } from './adapter';

// Adapters
export { MemoryAdapter } from './adapters/memory';
export { PostgresAdapter } from './adapters/postgres';
export type { PostgresAdapterConfig } from './adapters/postgres';

// Queue functions
export { publishJob, claimNextJob, completeJob, failJob } from './queue';

// OOP client (used by workers)
export { QueueClient } from './QueueClient';
export type {
  QueueClientConfig,
  ClaimJobInput,
  ClaimJobResult,
  PublishJobOptions,
  PublishedJob,
} from './QueueClient';

// SQL helpers (for manual migrations)
export { getCreateTableSQL } from './schema';
