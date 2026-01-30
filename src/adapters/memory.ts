import { QueueAdapter } from '../adapter';
import { JobEnvelope } from '../envelopes';

/**
 * In-memory queue adapter for local development and testing.
 *
 * Jobs are stored in a simple Map keyed by job_id.
 * Claim uses a linear scan ordered by priority (desc), scheduled_for (asc).
 * NOT suitable for production — no persistence, no concurrency control.
 */
export class MemoryAdapter implements QueueAdapter {
  private jobs: Map<string, JobEnvelope> = new Map();

  async initialize(): Promise<void> {
    // nothing to do
  }

  async close(): Promise<void> {
    this.jobs.clear();
  }

  async insert(envelope: JobEnvelope): Promise<JobEnvelope> {
    this.jobs.set(envelope.job_id, envelope);
    return envelope;
  }

  async claim(
    workerName: string,
    jobTypes: string[],
  ): Promise<JobEnvelope | null> {
    const now = new Date();
    const candidates: JobEnvelope[] = [];

    for (const job of this.jobs.values()) {
      if (job.status !== 'pending') continue;
      if (job.scheduled_for > now) continue;
      if (jobTypes.length > 0 && !jobTypes.includes(job.type)) continue;
      candidates.push(job);
    }

    if (candidates.length === 0) return null;

    // Sort: highest priority first, then earliest scheduled_for
    candidates.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.scheduled_for.getTime() - b.scheduled_for.getTime();
    });

    const target = candidates[0];
    const claimed: JobEnvelope = {
      ...target,
      status: 'processing',
      worker_id: workerName,
      started_at: now,
      attempts: target.attempts + 1,
      updated_at: now,
    };
    this.jobs.set(claimed.job_id, claimed);
    return claimed;
  }

  async complete(
    jobId: string,
    result?: Record<string, unknown>,
  ): Promise<JobEnvelope | null> {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'processing') return null;

    const now = new Date();
    const updated: JobEnvelope = {
      ...job,
      status: 'completed',
      result: result ?? null,
      completed_at: now,
      updated_at: now,
    };
    this.jobs.set(jobId, updated);
    return updated;
  }

  async fail(jobId: string, error: string): Promise<JobEnvelope | null> {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'processing') return null;

    const now = new Date();

    if (job.attempts >= job.max_attempts) {
      // Permanently failed
      const updated: JobEnvelope = {
        ...job,
        status: 'failed',
        failed_at: now,
        error,
        updated_at: now,
      };
      this.jobs.set(jobId, updated);
      return updated;
    }

    // Requeue with backoff
    const backoffMs = job.attempts * 30_000;
    const updated: JobEnvelope = {
      ...job,
      status: 'pending',
      error,
      worker_id: null,
      scheduled_for: new Date(now.getTime() + backoffMs),
      updated_at: now,
    };
    this.jobs.set(jobId, updated);
    return updated;
  }
}
