import { randomUUID } from 'crypto';
import { QueueAdapter } from './adapter';
import {
  JobEnvelope,
  JobEnvelopeSchema,
  ResultEnvelope,
  ResultEnvelopeSchema,
  PublishJobInput,
  PublishJobInputSchema,
  PublishResult,
  CompleteJobInput,
  CompleteJobInputSchema,
  FailJobInput,
  FailJobInputSchema,
} from './envelopes';

/**
 * Publish a job to the queue.
 *
 * Validates input with zod, generates job_id and trace_id,
 * persists via the adapter, and returns { job_id, trace_id }.
 */
export async function publishJob(
  adapter: QueueAdapter,
  input: PublishJobInput,
): Promise<PublishResult> {
  const parsed = PublishJobInputSchema.parse(input);

  const now = new Date();
  const envelope: JobEnvelope = {
    job_id: randomUUID(),
    trace_id: parsed.trace_id ?? randomUUID(),
    type: parsed.type,
    payload: parsed.payload,
    status: 'pending',
    priority: parsed.priority ?? 0,
    attempts: 0,
    max_attempts: parsed.max_attempts ?? 3,
    created_at: now,
    updated_at: now,
    scheduled_for: parsed.scheduled_for ?? now,
    started_at: null,
    completed_at: null,
    failed_at: null,
    error: null,
    worker_id: null,
  };

  const stored = await adapter.insert(envelope);
  // Validate what came back from the adapter
  const validated = JobEnvelopeSchema.parse(stored);

  return { job_id: validated.job_id, trace_id: validated.trace_id };
}

/**
 * Claim the next available job for a worker.
 *
 * @param adapter     - queue storage backend
 * @param workerName  - identifier for the claiming worker
 * @param jobTypes    - optional list of job types to filter by
 * @returns validated JobEnvelope or null
 */
export async function claimNextJob(
  adapter: QueueAdapter,
  workerName: string,
  jobTypes: string[] = [],
): Promise<JobEnvelope | null> {
  const envelope = await adapter.claim(workerName, jobTypes);
  if (!envelope) return null;
  return JobEnvelopeSchema.parse(envelope);
}

/**
 * Mark a job as completed and return a ResultEnvelope.
 *
 * @param adapter - queue storage backend
 * @param input   - { job_id, result? }
 * @returns validated ResultEnvelope or null if the job was not found / not processing
 */
export async function completeJob(
  adapter: QueueAdapter,
  input: CompleteJobInput,
): Promise<ResultEnvelope | null> {
  const parsed = CompleteJobInputSchema.parse(input);
  const updated = await adapter.complete(parsed.job_id, parsed.result);
  if (!updated) return null;

  const result: ResultEnvelope = {
    job_id: updated.job_id,
    trace_id: updated.trace_id,
    type: updated.type,
    status: 'completed',
    result: parsed.result,
    completed_at: updated.completed_at ?? new Date(),
  };
  return ResultEnvelopeSchema.parse(result);
}

/**
 * Mark a job as failed and return a ResultEnvelope.
 *
 * If the job has remaining attempts the adapter may requeue it;
 * the returned envelope reflects the final DB state.
 *
 * @param adapter - queue storage backend
 * @param input   - { job_id, error }
 * @returns validated ResultEnvelope or null if the job was not found / not processing
 */
export async function failJob(
  adapter: QueueAdapter,
  input: FailJobInput,
): Promise<ResultEnvelope | null> {
  const parsed = FailJobInputSchema.parse(input);
  const updated = await adapter.fail(parsed.job_id, parsed.error);
  if (!updated) return null;

  const result: ResultEnvelope = {
    job_id: updated.job_id,
    trace_id: updated.trace_id,
    type: updated.type,
    status: 'failed',
    error: updated.error,
    completed_at: updated.failed_at ?? updated.updated_at,
  };
  return ResultEnvelopeSchema.parse(result);
}
