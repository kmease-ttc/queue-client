import { z } from 'zod';

/**
 * Status of a job in the queue
 */
export const JobStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed']);
export type JobStatus = z.infer<typeof JobStatusSchema>;

/**
 * JobEnvelope wraps every job moving through the queue.
 * The `payload` field is an arbitrary JSON object validated at the boundary.
 */
export const JobEnvelopeSchema = z.object({
  job_id: z.string().uuid(),
  trace_id: z.string().min(1),
  type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  status: JobStatusSchema,
  priority: z.number().int().default(0),
  attempts: z.number().int().nonnegative().default(0),
  max_attempts: z.number().int().positive().default(3),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  scheduled_for: z.coerce.date(),
  started_at: z.coerce.date().nullable(),
  completed_at: z.coerce.date().nullable(),
  failed_at: z.coerce.date().nullable(),
  error: z.string().nullable(),
  worker_id: z.string().nullable(),
});

export type JobEnvelope = z.infer<typeof JobEnvelopeSchema>;

/**
 * ResultEnvelope is returned when a job finishes (success or failure).
 */
export const ResultEnvelopeSchema = z.object({
  job_id: z.string().uuid(),
  trace_id: z.string().min(1),
  type: z.string().min(1),
  status: z.enum(['completed', 'failed']),
  result: z.record(z.string(), z.unknown()).optional(),
  error: z.string().nullable().optional(),
  completed_at: z.coerce.date(),
});

export type ResultEnvelope = z.infer<typeof ResultEnvelopeSchema>;

/**
 * Input for publishing a new job (subset of JobEnvelope fields).
 */
export const PublishJobInputSchema = z.object({
  type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  priority: z.number().int().default(0),
  max_attempts: z.number().int().positive().default(3),
  scheduled_for: z.coerce.date().optional(),
  trace_id: z.string().min(1).optional(),
});

export type PublishJobInput = z.infer<typeof PublishJobInputSchema>;

/**
 * Result returned from publishJob.
 */
export interface PublishResult {
  job_id: string;
  trace_id: string;
}

/**
 * Input for completing a job.
 */
export const CompleteJobInputSchema = z.object({
  job_id: z.string().uuid(),
  result: z.record(z.string(), z.unknown()).optional(),
});

export type CompleteJobInput = z.infer<typeof CompleteJobInputSchema>;

/**
 * Input for failing a job.
 */
export const FailJobInputSchema = z.object({
  job_id: z.string().uuid(),
  error: z.string().min(1),
});

export type FailJobInput = z.infer<typeof FailJobInputSchema>;
