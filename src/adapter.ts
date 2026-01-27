import { JobEnvelope } from './envelopes';

/**
 * QueueAdapter defines the storage backend contract.
 *
 * Implementations must guarantee:
 * - `insert` persists a fully-formed JobEnvelope and returns it.
 * - `claim` atomically moves one pending job to processing (or returns null).
 * - `complete` marks a processing job as completed.
 * - `fail` marks a processing job as failed, with optional requeue.
 */
export interface QueueAdapter {
  /** One-time setup (create tables, indexes, etc.). Idempotent. */
  initialize(): Promise<void>;

  /** Tear down connections / resources. */
  close(): Promise<void>;

  /** Insert a new job and return the stored envelope. */
  insert(envelope: JobEnvelope): Promise<JobEnvelope>;

  /**
   * Atomically claim the next eligible pending job.
   *
   * @param workerName  - identifier for the claiming worker
   * @param jobTypes    - optional filter; empty array means "any type"
   * @returns the claimed job envelope, or null if nothing is available
   */
  claim(workerName: string, jobTypes: string[]): Promise<JobEnvelope | null>;

  /**
   * Mark a job as completed.
   *
   * @returns the updated envelope, or null if the job was not found / not processing
   */
  complete(
    jobId: string,
    result?: Record<string, unknown>,
  ): Promise<JobEnvelope | null>;

  /**
   * Mark a job as failed.
   * If `attempts < max_attempts`, the adapter should requeue the job (status → pending).
   *
   * @returns the updated envelope, or null if the job was not found / not processing
   */
  fail(jobId: string, error: string): Promise<JobEnvelope | null>;
}
