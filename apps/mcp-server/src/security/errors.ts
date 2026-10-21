export class SafeError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(code);
  }
}
export function safeCode(error: unknown): string {
  return error instanceof SafeError ? error.code : 'INTERNAL_ERROR';
}
