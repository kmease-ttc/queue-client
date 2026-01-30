/**
 * QueueClient - OOP wrapper around the queue-client library
 *
 * Provides the class-based API that workers expect:
 *   const queue = new QueueClient({ connectionString });
 *   await queue.initialize();
 *   const { job } = await queue.claimJob({ workerId, types });
 *   await queue.completeJob({ jobId, workerId });
 *   await queue.failJob({ jobId, workerId, error });
 *   await queue.close();
 */

import { PostgresAdapter } from './adapters/postgres';
import type { PostgresAdapterConfig } from './adapters/postgres';
import { publishJob, claimNextJob, completeJob, failJob } from './queue';
import type { JobEnvelope, PublishJobInput, ResultEnvelope } from './envelopes';

export interface QueueClientConfig {
  connectionString: string;
  /** Postgres schema for the jobs table (default: "queue") */
  schema?: string;
  /** Name of the jobs table (default: "jobs") */
  tableName?: string;
}

export interface ClaimJobInput {
  workerId: string;
  types?: string[];
}

export interface ClaimJobResult {
  job: {
    id: string;
    trace_id: string;
    type: string;
    payload: Record<string, unknown>;
    status: string;
    priority: number;
    attempts: number;
    max_attempts: number;
    created_at: Date;
    worker_id: string | null;
  } | null;
}

export interface CompleteJobInput {
  jobId: string;
  workerId?: string;
  result?: Record<string, unknown>;
}

export interface FailJobInput {
  jobId: string;
  workerId?: string;
  error: string;
}

export interface PublishJobOptions {
  type: string;
  payload: Record<string, unknown>;
  priority?: number;
  maxAttempts?: number;
  scheduledFor?: Date;
  traceId?: string;
}

export interface PublishedJob {
  id: string;
  trace_id: string;
}

/**
 * OOP wrapper that workers instantiate to interact with the job queue.
 *
 * Internally delegates to PostgresAdapter + the pure queue functions.
 */
export class QueueClient {
  private adapter: PostgresAdapter;
  private initialized = false;

  constructor(config: QueueClientConfig) {
    this.adapter = new PostgresAdapter({
      connectionString: config.connectionString,
      schema: config.schema ?? 'queue',
      tableName: config.tableName ?? 'jobs',
    });
  }

  /**
   * Create tables/indexes if they don't exist. Idempotent.
   */
  async initialize(): Promise<this> {
    if (!this.initialized) {
      await this.adapter.initialize();
      this.initialized = true;
    }
    return this;
  }

  /**
   * Publish a new job to the queue.
   */
  async publishJob(options: PublishJobOptions): Promise<PublishedJob> {
    const input: PublishJobInput = {
      type: options.type,
      payload: options.payload,
      priority: options.priority ?? 0,
      max_attempts: options.maxAttempts ?? 3,
      scheduled_for: options.scheduledFor,
      trace_id: options.traceId,
    };

    const result = await publishJob(this.adapter, input);
    return { id: result.job_id, trace_id: result.trace_id };
  }

  /**
   * Claim the next available job matching the given types.
   * Returns { job: null } if no jobs are available.
   */
  async claimJob(input: ClaimJobInput): Promise<ClaimJobResult> {
    const envelope = await claimNextJob(
      this.adapter,
      input.workerId,
      input.types ?? [],
    );

    if (!envelope) {
      return { job: null };
    }

    return {
      job: {
        id: envelope.job_id,
        trace_id: envelope.trace_id,
        type: envelope.type,
        payload: envelope.payload,
        status: envelope.status,
        priority: envelope.priority,
        attempts: envelope.attempts,
        max_attempts: envelope.max_attempts,
        created_at: envelope.created_at,
        worker_id: envelope.worker_id,
      },
    };
  }

  /**
   * Mark a job as completed.
   */
  async completeJob(input: CompleteJobInput): Promise<ResultEnvelope | null> {
    return completeJob(this.adapter, {
      job_id: input.jobId,
      result: input.result,
    });
  }

  /**
   * Mark a job as failed. Will be retried if attempts < max_attempts.
   */
  async failJob(input: FailJobInput): Promise<ResultEnvelope | null> {
    return failJob(this.adapter, {
      job_id: input.jobId,
      error: input.error,
    });
  }

  /**
   * Close the underlying connection pool.
   */
  async close(): Promise<void> {
    await this.adapter.close();
  }
}
