/**
 * SQL schema for the job queue table
 */
export function getCreateTableSQL(schema: string, tableName: string): string {
  const fullTableName = `"${schema}"."${tableName}"`;

  return `
    CREATE SCHEMA IF NOT EXISTS "${schema}";

    CREATE TABLE IF NOT EXISTS ${fullTableName} (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      trace_id VARCHAR(255) NOT NULL,
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

    CREATE INDEX IF NOT EXISTS idx_${tableName}_status_priority_scheduled
      ON ${fullTableName} (status, priority DESC, scheduled_for ASC)
      WHERE status = 'pending';

    CREATE INDEX IF NOT EXISTS idx_${tableName}_type
      ON ${fullTableName} (type);

    CREATE INDEX IF NOT EXISTS idx_${tableName}_worker_id
      ON ${fullTableName} (worker_id)
      WHERE worker_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_${tableName}_trace_id
      ON ${fullTableName} (trace_id);
  `;
}

/**
 * SQL to insert a new job
 */
export function getInsertJobSQL(schema: string, tableName: string): string {
  return `
    INSERT INTO "${schema}"."${tableName}"
      (type, payload, priority, max_attempts, scheduled_for, trace_id)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;
}

/**
 * SQL to claim a job atomically using FOR UPDATE SKIP LOCKED
 */
export function getClaimJobSQL(schema: string, tableName: string, hasTypes: boolean): string {
  const typeFilter = hasTypes ? 'AND type = ANY($2)' : '';

  return `
    UPDATE "${schema}"."${tableName}"
    SET
      status = 'processing',
      started_at = NOW(),
      updated_at = NOW(),
      worker_id = $1,
      attempts = attempts + 1
    WHERE id = (
      SELECT id FROM "${schema}"."${tableName}"
      WHERE status = 'pending'
        AND scheduled_for <= NOW()
        ${typeFilter}
      ORDER BY priority DESC, scheduled_for ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *
  `;
}

/**
 * SQL to complete a job
 */
export function getCompleteJobSQL(schema: string, tableName: string): string {
  return `
    UPDATE "${schema}"."${tableName}"
    SET
      status = 'completed',
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = $1
      AND status = 'processing'
    RETURNING *
  `;
}

/**
 * SQL to fail a job
 */
export function getFailJobSQL(schema: string, tableName: string): string {
  return `
    UPDATE "${schema}"."${tableName}"
    SET
      status = CASE
        WHEN attempts >= max_attempts THEN 'failed'
        ELSE 'pending'
      END,
      failed_at = CASE
        WHEN attempts >= max_attempts THEN NOW()
        ELSE failed_at
      END,
      error = $2,
      updated_at = NOW(),
      worker_id = CASE
        WHEN attempts >= max_attempts THEN worker_id
        ELSE NULL
      END,
      scheduled_for = CASE
        WHEN attempts < max_attempts THEN NOW() + (attempts * INTERVAL '30 seconds')
        ELSE scheduled_for
      END
    WHERE id = $1
      AND status = 'processing'
    RETURNING *
  `;
}
