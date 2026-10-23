'use client';

import { useEffect } from 'react';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Route error:', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center" role="alert">
      <h1 className="text-2xl font-semibold text-foreground">Something went wrong</h1>
      <p className="mt-2 text-muted">{error.message || 'An unexpected error occurred.'}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-full bg-strain px-5 py-2 text-sm font-semibold text-[#04121f]"
      >
        Try again
      </button>
    </div>
  );
}
