import type { JobPayload, JobType } from 'arclo-contracts';

export { JobPayload, JobType };

/**
 * Job status in the queue
 */
export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Job record stored in the database
 */
export interface Job<T extends JobType = JobType> {
  id: string;
  type: T;
  payload: JobPayload<T>;
  status: JobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  updatedAt: Date;
  scheduledFor: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  error: string | null;
  workerId: string | null;
}

/**
 * Options for publishing a new job
 */
export interface PublishJobOptions<T extends JobType = JobType> {
  type: T;
  payload: JobPayload<T>;
  priority?: number;
  maxAttempts?: number;
  scheduledFor?: Date;
}

/**
 * Options for claiming a job
 */
export interface ClaimJobOptions {
  workerId: string;
  types?: JobType[];
}

/**
 * Result of a job claim operation
 */
export interface ClaimJobResult<T extends JobType = JobType> {
  job: Job<T> | null;
}

/**
 * Options for completing a job
 */
export interface CompleteJobOptions {
  jobId: string;
  workerId: string;
}

/**
 * Options for failing a job
 */
export interface FailJobOptions {
  jobId: string;
  workerId: string;
  error: string;
}

/**
 * Configuration for the queue client
 */
export interface QueueClientConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  schema?: string;
  tableName?: string;
}
