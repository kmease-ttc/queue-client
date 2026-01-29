/**
 * Re-export envelope types as the canonical type definitions.
 */
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

export type { QueueAdapter } from './adapter';
