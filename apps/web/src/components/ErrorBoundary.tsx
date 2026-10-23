'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

/** Isolates render failures in a subtree so one broken widget cannot crash the page. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Component error:', error, info);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div
            role="alert"
            className="rounded-2xl border border-line bg-card p-6 text-sm text-muted"
          >
            This section failed to render.
          </div>
        )
      );
    }
    return this.props.children;
  }
}
