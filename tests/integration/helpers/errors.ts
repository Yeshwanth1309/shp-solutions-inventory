import { pgErrorMessage } from '@/lib/pg-error';

/** Re-exported for readability in test assertions. */
export const databaseMessage = pgErrorMessage;

export async function captureError(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the operation to fail, but it succeeded.');
}
