/**
 * SVG line chart with a shaded ±stdDev band and a mean line.
 */
import { useMemo } from 'react';

export interface BaselineBandChartProps {
  readonly values: readonly number[];
  readonly mean: number;
  readonly stdDev: number;
  readonly label?: string;
  readonly testId?: string;
  readonly width?: number;
  readonly height?: number;
}

export function baselineBandPoints(
  values: readonly number[],
  width = 240,
  height = 80,
): { x: number; y: number }[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map((value, index) => ({
    x: values.length === 1 ? width / 2 : (index / (values.length - 1)) * width,
    y: height - ((value - min) / range) * height,
  }));
}

export function BaselineBandChart({
  values,
  mean,
  stdDev,
  label = 'Baseline band',
  testId,
  width = 240,
  height = 80,
}: BaselineBandChartProps) {
  const points = useMemo(() => baselineBandPoints(values, width, height), [values, width, height]);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${String(p.x)} ${String(p.y)}`).join(' ');
  const allMin = Math.min(...values, mean - stdDev);
  const allMax = Math.max(...values, mean + stdDev);
  const denom = allMax - allMin || 1;
  const bandTop = height - ((mean + stdDev - allMin) / denom) * height;
  const bandBottom = height - ((mean - stdDev - allMin) / denom) * height;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      role="img"
      aria-label={label}
      data-testid={testId}
    >
      <rect x={0} y={bandTop} width={width} height={Math.max(0, bandBottom - bandTop)} fill="#0096ff22" />
      {path && <path d={path} fill="none" stroke="#0096FF" strokeWidth={2} />}
    </svg>
  );
}