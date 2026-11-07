'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          background: '#0e0d0b',
          color: '#f2ede3',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          role="alert"
          style={{ maxWidth: 720, margin: '0 auto', padding: '64px 16px', textAlign: 'center' }}
        >
          <h1 style={{ fontSize: 24, fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ color: '#9c9689' }}>{error.message || 'An unexpected error occurred.'}</p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24,
              borderRadius: 999,
              background: '#e08a3c',
              color: '#0e0d0b',
              padding: '8px 20px',
              border: 'none',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
