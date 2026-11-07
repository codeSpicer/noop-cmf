'use client';

export interface InfoTipProps {
  readonly text: string;
  readonly label?: string;
}

/** Small inline info icon with a native tooltip. */
export function InfoTip({ text, label = 'info' }: InfoTipProps) {
  return (
    <span
      title={text}
      aria-label={label}
      className="ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-line text-[10px] text-muted"
    >
      i
    </span>
  );
}