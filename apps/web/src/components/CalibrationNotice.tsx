'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'noop-cmf-calibration-notice-dismissed';

interface CalibrationNoticeProps {
  readonly show: boolean;
}

export function CalibrationNotice({ show }: CalibrationNoticeProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!show) return;
    try {
      if (window.sessionStorage.getItem(STORAGE_KEY) === '1') return;
    } catch {
      // Ignore storage access errors (e.g. private mode restrictions).
    }
    setOpen(true);
  }, [show]);

  function dismiss(): void {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // Ignore storage access errors.
    }
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="calibration-notice-title"
      aria-describedby="calibration-notice-description"
    >
      <div className="w-full max-w-md rounded-2xl border border-line bg-card p-6 shadow-lg">
        <h2 id="calibration-notice-title" className="text-lg font-semibold text-foreground">
          Calibration in progress
        </h2>
        <p id="calibration-notice-description" className="mt-2 text-sm text-muted">
          I&apos;m still calibrating your baselines. Recovery, readiness, sleep, and training insights will
          become more accurate as more days of data (including sleep) come in. For more personalized strain,
          recovery, and training load, set your resting/max heart rate and other metrics in Profile. Keep syncing
          your watch and wearing it during sleep for the best results.
        </p>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={dismiss}
            className="rounded-full bg-strain px-4 py-2 text-sm font-semibold text-[#0e0d0b] hover:opacity-90"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
