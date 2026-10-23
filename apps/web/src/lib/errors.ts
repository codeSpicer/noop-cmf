/** Extract a readable message from an unknown thrown value, with a fallback. */
export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message.length > 0 ? err.message : fallback;
}
