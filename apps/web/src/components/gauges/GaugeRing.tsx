/**
 * SVG circular gauge ring: Whoop-style strain / recovery / sleep dial.
 */
interface GaugeRingProps {
  readonly value: number;
  readonly max: number;
  readonly size?: number;
  readonly stroke?: number;
  readonly color: string;
  readonly label: string;
  readonly testId?: string | undefined;
}

function polar(cx: number, cy: number, radius: number, angleDeg: number): { x: number; y: number } {
  const angle = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}

function arcPath(cx: number, cy: number, radius: number, fraction: number): string {
  const clamped = Math.min(1, Math.max(0, fraction));
  if (clamped <= 0) {
    return '';
  }
  if (clamped >= 1) {
    return `M ${String(cx - radius)} ${String(cy)} A ${String(radius)} ${String(radius)} 0 1 1 ${String(cx + radius)} ${String(cy)} A ${String(radius)} ${String(radius)} 0 1 1 ${String(cx - radius)} ${String(cy)}`;
  }
  const start = polar(cx, cy, radius, 0);
  const end = polar(cx, cy, radius, clamped * 360);
  const large = clamped > 0.5 ? 1 : 0;
  return `M ${String(start.x)} ${String(start.y)} A ${String(radius)} ${String(radius)} 0 ${String(large)} 1 ${String(end.x)} ${String(end.y)}`;
}

/** Compute the arc path for a value/max pair (exported for unit tests). */
export function gaugeArcPath(value: number, max: number, size = 120, stroke = 12): string {
  const radius = size / 2 - stroke;
  const fraction = max <= 0 ? 0 : Math.min(1, Math.max(0, value / max));
  return arcPath(size / 2, size / 2, radius, fraction);
}

export function GaugeRing({
  value,
  max,
  size = 120,
  stroke = 12,
  color,
  label,
  testId,
}: GaugeRingProps) {
  const radius = size / 2 - stroke;
  const center = size / 2;
  const track = `M ${String(center - radius)} ${String(center)} A ${String(radius)} ${String(radius)} 0 1 1 ${String(center + radius)} ${String(center)} A ${String(radius)} ${String(radius)} 0 1 1 ${String(center - radius)} ${String(center)}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${String(size)} ${String(size)}`}
      role="img"
      aria-label={`${label}: ${String(value)} of ${String(max)}`}
      data-testid={testId}
    >
      <path d={track} fill="none" stroke="#1d2530" strokeWidth={stroke} strokeLinecap="round" />
      <path
        d={gaugeArcPath(value, max, size, stroke)}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        data-testid={testId ? `${testId}-arc` : undefined}
      />
      <text
        x={center}
        y={center - 2}
        textAnchor="middle"
        fill="#e8edf3"
        fontSize="22"
        fontWeight="700"
      >
        {value}
      </text>
      <text x={center} y={center + 16} textAnchor="middle" fill="#8b98a9" fontSize="11">
        {label}
      </text>
    </svg>
  );
}
