/**
 * Seven-day sparkline: minimal SVG polyline for trend preview cards.
 */
interface SparklineProps {
  readonly values: readonly number[];
  readonly width?: number;
  readonly height?: number;
  readonly color: string;
  readonly label: string;
  readonly testId?: string | undefined;
}

/** Map values into SVG points (exported for unit tests). */
export function sparklinePoints(
  values: readonly number[],
  width = 140,
  height = 36,
): ReadonlyArray<{ x: number; y: number }> {
  if (values.length === 0) {
    return [];
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values.map((value, index) => ({
    x: values.length === 1 ? width / 2 : (index / (values.length - 1)) * width,
    y: height - 3 - ((value - min) / span) * (height - 6),
  }));
}

export function Sparkline({
  values,
  width = 140,
  height = 36,
  color,
  label,
  testId,
}: SparklineProps) {
  const points = sparklinePoints(values, width, height);
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${String(point.x)},${String(point.y)}`)
    .join(' ');
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      role="img"
      aria-label={label}
      data-testid={testId}
    >
      {path ? (
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
      ) : null}
    </svg>
  );
}
