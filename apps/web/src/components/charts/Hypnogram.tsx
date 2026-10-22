/**
 * Stepped horizontal hypnogram: one row per sleep segment, x = time.
 */
import type { SleepStage } from '@noop-cmf/types';

interface HypnogramProps {
  readonly segments: ReadonlyArray<{
    readonly start: number;
    readonly end: number;
    readonly stage: SleepStage;
  }>;
  readonly width?: number;
  readonly rowHeight?: number;
  readonly testId?: string | undefined;
}

const STAGE_ORDER: Record<SleepStage, number> = { awake: 0, rem: 1, light: 2, deep: 3 };
const STAGE_COLORS: Record<SleepStage, string> = {
  awake: '#8b98a9',
  rem: '#7b61ff',
  light: '#0096ff',
  deep: '#1c2f6e',
};

/** Map segments into positioned SVG rects (exported for unit tests). */
export function hypnogramRects(
  segments: HypnogramProps['segments'],
  width = 560,
  rowHeight = 22,
): ReadonlyArray<{ x: number; width: number; y: number; height: number; stage: SleepStage }> {
  if (segments.length === 0) {
    return [];
  }
  const min = Math.min(...segments.map((segment) => segment.start));
  const max = Math.max(...segments.map((segment) => segment.end));
  const span = max - min || 1;
  return segments.map((segment) => ({
    x: ((segment.start - min) / span) * width,
    width: Math.max(1, ((segment.end - segment.start) / span) * width),
    y: STAGE_ORDER[segment.stage] * rowHeight,
    height: rowHeight - 3,
    stage: segment.stage,
  }));
}

export function Hypnogram({ segments, width = 560, rowHeight = 22, testId }: HypnogramProps) {
  const rects = hypnogramRects(segments, width, rowHeight);
  const height = rowHeight * 4;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      role="img"
      aria-label={`Hypnogram with ${String(segments.length)} segments`}
      data-testid={testId}
    >
      {rects.map((rect, index) => (
        <rect
          key={index}
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          rx={3}
          fill={STAGE_COLORS[rect.stage]}
          data-stage={rect.stage}
        />
      ))}
    </svg>
  );
}
