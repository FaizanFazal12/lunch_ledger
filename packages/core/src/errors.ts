export type DomainErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "CLARIFICATION_NEEDED";

/**
 * A predictable, user-safe error raised by the service layer. The API maps these
 * to friendly replies; unexpected errors are treated as 500s.
 */
export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export function isDomainError(err: unknown): err is DomainError {
  return err instanceof DomainError;
}
