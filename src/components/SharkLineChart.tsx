'use client';

import { fmtNum } from '@/lib/format';

export interface ChartPoint {
  label: string;
  value: number; // cents
  showTick?: boolean;
}

interface Props {
  points: ChartPoint[];
  avg: number;
  width?: number;
  height?: number;
}

export default function SharkLineChart({ points, avg, width = 340, height = 118 }: Props) {
  const padL = 14;
  const padR = 14;
  const padT = 18;
  const padB = 22;
  const maxVal = Math.max(100, ...points.map((p) => p.value));
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;

  const coords = points.map((p, i) => ({
    ...p,
    x: padL + i * stepX,
    y: padT + innerH - (p.value / maxVal) * innerH,
  }));

  const polyPoints = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const avgY = padT + innerH - (Math.min(avg, maxVal) / maxVal) * innerH;
  const peak = coords.reduce((best, c) => (c.value > best.value ? c : best), coords[0]);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible select-none">
      <line x1={padL} y1={padT} x2={width - padR} y2={padT} stroke="#EFEFEF" strokeWidth="1" />
      <text x={width - padR} y={padT - 4} textAnchor="end" fontSize="10" fill="#999999">
        {fmtNum(maxVal, true)}
      </text>

      <line
        x1={padL}
        y1={avgY}
        x2={width - padR}
        y2={avgY}
        stroke="#D4D4D4"
        strokeWidth="1"
        strokeDasharray="3 3"
      />

      <line
        x1={padL}
        y1={height - padB}
        x2={width - padR}
        y2={height - padB}
        stroke="#E5E5E5"
        strokeWidth="1"
      />

      {polyPoints && (
        <polyline fill="none" stroke="#888888" strokeWidth="1.3" points={polyPoints} />
      )}

      {coords.map((c, idx) => {
        const isPeak = c === peak && c.value > 0;
        return (
          <g key={`${c.label}-${idx}`}>
            <title>{`${c.label}: ¥${fmtNum(c.value, true)}`}</title>
            <circle
              cx={c.x}
              cy={c.y}
              r={isPeak ? 3.8 : 2.6}
              fill={isPeak ? '#FFDA44' : '#FFFFFF'}
              stroke={isPeak ? '#333333' : '#999999'}
              strokeWidth="1.2"
            />
          </g>
        );
      })}

      {coords.map((c, idx) =>
        c.showTick !== false ? (
          <text
            key={`t-${c.label}-${idx}`}
            x={c.x}
            y={height - 5}
            textAnchor="middle"
            fontSize="10"
            fill="#888888"
          >
            {c.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}
