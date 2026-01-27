/**
 * Type declarations for arclo-contracts
 *
 * This file provides type stubs for the arclo-contracts package.
 * The actual types should be provided by the arclo-contracts package
 * when installed as a peer dependency.
 */

/**
 * Job types supported by the system
 */
export type JobType = string;

/**
 * Job payload type - mapped by job type
 */
export type JobPayload<T extends JobType = JobType> = Record<string, unknown>;

/**
 * Validation result from validateJobPayload
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a job payload against the schema for the given job type
 */
export function validateJobPayload<T extends JobType>(
  type: T,
  payload: unknown
): ValidationResult;
