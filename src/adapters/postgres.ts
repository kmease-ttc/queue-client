import { Pool, PoolConfig } from 'pg';
import { QueueAdapter } from '../adapter';
import { JobEnvelope } from '../envelopes';
import {
  getCreateTableSQL,
  getInsertJobSQL,
  getClaimJobSQL,
  getCompleteJobSQL,
  getFailJobSQL,
} from '../schema';

export interface PostgresAdapterConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  /** Postgres schema for the jobs table (default: "queue") */
  schema?: string;
  /** Name of the jobs table (default: "jobs") */
  tableName?: string;
}

/**
 * Convert a Postgres row into a JobEnvelope.
 */
function rowToEnvelope(row: Record<string, unknown>): JobEnvelope {
  return {
    job_id: row.id as string,
    trace_id: row.trace_id as string,
    type: row.type as string,
    payload: row.payload as Record<string, unknown>,
    status: row.status as JobEnvelope['status'],
    priority: row.priority as number,
    attempts: row.attempts as number,
    max_attempts: row.max_attempts as number,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
    scheduled_for: row.scheduled_for as Date,
    started_at: (row.started_at as Date) ?? null,
    completed_at: (row.completed_at as Date) ?? null,
    failed_at: (row.failed_at as Date) ?? null,
    error: (row.error as string) ?? null,
    worker_id: (row.worker_id as string) ?? null,
  };
}

/**
 * Postgres-backed queue adapter.
 *
 * Uses `FOR UPDATE SKIP LOCKED` for non-blocking atomic claim.
 */
export class PostgresAdapter implements QueueAdapter {
  private pool: Pool;
  private schema: string;
  private tableName: string;
  private initialized = false;

  constructor(config: PostgresAdapterConfig = {}) {
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
    this.schema = config.schema ?? 'queue';
    this.tableName = config.tableName ?? 'jobs';
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const sql = getCreateTableSQL(this.schema, this.tableName);
    await this.pool.query(sql);
    this.initialized = true;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async insert(envelope: JobEnvelope): Promise<JobEnvelope> {
    const sql = getInsertJobSQL(this.schema, this.tableName);
    const result = await this.pool.query(sql, [
      envelope.type,
      JSON.stringify(envelope.payload),
      envelope.priority,
      envelope.max_attempts,
      envelope.scheduled_for,
      envelope.trace_id,
    ]);
    return rowToEnvelope(result.rows[0]);
  }

  async claim(
    workerName: string,
    jobTypes: string[],
  ): Promise<JobEnvelope | null> {
    const hasTypes = jobTypes.length > 0;
    const sql = getClaimJobSQL(this.schema, this.tableName, hasTypes);

    const params: (string | string[])[] = [workerName];
    if (hasTypes) params.push(jobTypes);

    const result = await this.pool.query(sql, params);
    if (result.rows.length === 0) return null;
    return rowToEnvelope(result.rows[0]);
  }

  async complete(
    jobId: string,
    _result?: Record<string, unknown>,
  ): Promise<JobEnvelope | null> {
    const sql = getCompleteJobSQL(this.schema, this.tableName);
    const result = await this.pool.query(sql, [jobId]);
    if (result.rows.length === 0) return null;
    return rowToEnvelope(result.rows[0]);
  }

  async fail(jobId: string, error: string): Promise<JobEnvelope | null> {
    const sql = getFailJobSQL(this.schema, this.tableName);
    const result = await this.pool.query(sql, [jobId, error]);
    if (result.rows.length === 0) return null;
    return rowToEnvelope(result.rows[0]);
  }
}
