import { Pool, PoolClient, PoolConfig } from 'pg';
import { validateJobPayload } from 'arclo-contracts';
import {
  Job,
  JobStatus,
  JobType,
  PublishJobOptions,
  ClaimJobOptions,
  ClaimJobResult,
  CompleteJobOptions,
  FailJobOptions,
  QueueClientConfig,
} from './types';
import {
  getCreateTableSQL,
  getInsertJobSQL,
  getClaimJobSQL,
  getCompleteJobSQL,
  getFailJobSQL,
} from './schema';

const DEFAULT_SCHEMA = 'queue';
const DEFAULT_TABLE_NAME = 'jobs';

/**
 * Convert database row to Job object
 */
function rowToJob<T extends JobType>(row: Record<string, unknown>): Job<T> {
  return {
    id: row.id as string,
    type: row.type as T,
    payload: row.payload as Job<T>['payload'],
    status: row.status as JobStatus,
    priority: row.priority as number,
    attempts: row.attempts as number,
    maxAttempts: row.max_attempts as number,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
    scheduledFor: row.scheduled_for as Date,
    startedAt: row.started_at as Date | null,
    completedAt: row.completed_at as Date | null,
    failedAt: row.failed_at as Date | null,
    error: row.error as string | null,
    workerId: row.worker_id as string | null,
  };
}

/**
 * QueueClient provides a Postgres-backed job queue for Hermes and workers
 */
export class QueueClient {
  private pool: Pool;
  private schema: string;
  private tableName: string;
  private initialized: boolean = false;

  constructor(config: QueueClientConfig = {}) {
    const poolConfig: PoolConfig = {};

    if (config.connectionString) {
      poolConfig.connectionString = config.connectionString;
    } else {
      poolConfig.host = config.host ?? 'localhost';
      poolConfig.port = config.port ?? 5432;
      poolConfig.database = config.database ?? 'queue';
      poolConfig.user = config.user ?? 'postgres';
      poolConfig.password = config.password;
    }

    this.pool = new Pool(poolConfig);
    this.schema = config.schema ?? DEFAULT_SCHEMA;
    this.tableName = config.tableName ?? DEFAULT_TABLE_NAME;
  }

  /**
   * Initialize the queue table if it doesn't exist
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const sql = getCreateTableSQL(this.schema, this.tableName);
    await this.pool.query(sql);
    this.initialized = true;
  }

  /**
   * Close the database connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Get a client from the pool for transaction support
   */
  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  /**
   * Publish a new job to the queue
   *
   * @param options - Job options including type, payload, priority, etc.
   * @returns The created job
   * @throws Error if payload validation fails
   */
  async publishJob<T extends JobType>(options: PublishJobOptions<T>): Promise<Job<T>> {
    const { type, payload, priority = 0, maxAttempts = 3, scheduledFor = new Date() } = options;

    // Validate payload against arclo-contracts schema
    const validationResult = validateJobPayload(type, payload);
    if (!validationResult.valid) {
      throw new Error(`Invalid job payload: ${validationResult.errors.join(', ')}`);
    }

    const sql = getInsertJobSQL(this.schema, this.tableName);
    const result = await this.pool.query(sql, [
      type,
      JSON.stringify(payload),
      priority,
      maxAttempts,
      scheduledFor,
    ]);

    return rowToJob<T>(result.rows[0]);
  }

  /**
   * Claim a pending job for processing
   *
   * Uses FOR UPDATE SKIP LOCKED for atomic job claiming without blocking
   *
   * @param options - Claim options including workerId and optional job types
   * @returns The claimed job or null if no jobs available
   */
  async claimJob<T extends JobType = JobType>(options: ClaimJobOptions): Promise<ClaimJobResult<T>> {
    const { workerId, types } = options;

    const hasTypes = types !== undefined && types.length > 0;
    const sql = getClaimJobSQL(this.schema, this.tableName, hasTypes);

    const params: (string | string[])[] = [workerId];
    if (hasTypes) {
      params.push(types);
    }

    const result = await this.pool.query(sql, params);

    if (result.rows.length === 0) {
      return { job: null };
    }

    return { job: rowToJob<T>(result.rows[0]) };
  }

  /**
   * Mark a job as completed
   *
   * @param options - Options including jobId and workerId
   * @returns The completed job or null if job not found or not owned by worker
   */
  async completeJob(options: CompleteJobOptions): Promise<Job | null> {
    const { jobId, workerId } = options;

    const sql = getCompleteJobSQL(this.schema, this.tableName);
    const result = await this.pool.query(sql, [jobId, workerId]);

    if (result.rows.length === 0) {
      return null;
    }

    return rowToJob(result.rows[0]);
  }

  /**
   * Mark a job as failed
   *
   * If the job has not exceeded maxAttempts, it will be requeued with exponential backoff.
   * Otherwise, it will be permanently marked as failed.
   *
   * @param options - Options including jobId, workerId, and error message
   * @returns The updated job or null if job not found or not owned by worker
   */
  async failJob(options: FailJobOptions): Promise<Job | null> {
    const { jobId, workerId, error } = options;

    const sql = getFailJobSQL(this.schema, this.tableName);
    const result = await this.pool.query(sql, [jobId, workerId, error]);

    if (result.rows.length === 0) {
      return null;
    }

    return rowToJob(result.rows[0]);
  }
}
