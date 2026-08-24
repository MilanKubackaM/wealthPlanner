'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CurrencyCode } from '@wealthplanner/jurisdictions';
import type { ProjectionResult } from '@wealthplanner/engine';
import { axisScaleFor, money, moneyAxis, monthLabel, type UiLocale } from '@/lib/format';

/*
 * The canonical chart: ONE series — the cash reserve — with the floor as a reference line
 * and the trough called out by name.
 *
 * Investments are deliberately NOT plotted here. Over three decades they grow to tens of
 * millions while the reserve moves in hundreds of thousands, so on a shared axis the trough —
 * the single thing this product exists to show — flattens into the baseline. Two measures of
 * wildly different magnitude get two charts, never two y-axes.
 *
 * One series means no legend box: the title names it and the line carries a direct label. The
 * trough sits on a chip with its own text, so nothing here depends on colour alone.
 *
 * The viewBox is CHOSEN per breakpoint rather than scaled. An 880-unit box squeezed into a
 * 350px phone renders 11-unit text at about 4px — illegible. A 380-unit box at the same width
 * renders that same text at about 10px. Same code, readable at both ends.
 */

interface Layout {
  w: number;
  h: number;
  pad: { top: number; right: number; bottom: number; left: number };
  calloutW: number;
  calloutH: number;
  tickEveryYears: number;
  yTickCount: number;
  font: { axis: number; label: number; callout: number };
}

const WIDE: Layout = {
  w: 880,
  h: 320,
  pad: { top: 26, right: 96, bottom: 34, left: 8 },
  calloutW: 210,
  calloutH: 42,
  tickEveryYears: 5,
  yTickCount: 4,
  font: { axis: 11, label: 12, callout: 12 },
};

const NARROW: Layout = {
  w: 380,
  h: 300,
  /* A left gutter for the tick values: inside the plot the series line crossed them. */
  pad: { top: 20, right: 10, bottom: 46, left: 64 },
  calloutW: 186,
  calloutH: 38,
  tickEveryYears: 10,
  yTickCount: 3,
  font: { axis: 10, label: 11, callout: 11 },
};

const NARROW_BREAKPOINT = 620;

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/** Container width, so the chart picks a geometry instead of being squashed into one. */
function useNarrow(ref: React.RefObject<HTMLElement | null>): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width > 0) setNarrow(width < NARROW_BREAKPOINT);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return narrow;
}

export interface ReserveChartProps {
  result: ProjectionResult;
  currency: CurrencyCode;
  locale: UiLocale;
  months: string[];
  labels: {
    title: string;
    reserve: string;
    floorShort: string;
    trough: string;
    showTable: string;
    hideTable: string;
    tableYear: string;
    tableReserve: string;
    tableInvest: string;
    tableMortgage: string;
    tableNetWorth: string;
  };
}

export function ReserveChart({ result, currency, locale, months, labels }: ReserveChartProps) {
  const [showTable, setShowTable] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const hostRef = useRef<HTMLElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gradientId = useId().replace(/:/g, '');
  const narrow = useNarrow(hostRef);
  const L = narrow ? NARROW : WIDE;

  const geometry = useMemo(() => {
    const points = result.monthly;
    if (points.length === 0) return null;

    const floors = points.map((m) => m.floor);
    const values = points.map((m) => m.reserve);
    const rawMin = Math.min(0, ...values, ...floors);
    const rawMax = Math.max(...values, ...floors, 1);
    const span = rawMax - rawMin || 1;
    const yMin = rawMin - span * 0.08;
    const yMax = rawMax + span * 0.12;

    const innerW = L.w - L.pad.left - L.pad.right;
    const innerH = L.h - L.pad.top - L.pad.bottom;
    const x = (i: number) =>
      L.pad.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = (v: number) => L.pad.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

    const line = points
      .map((m, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(m.reserve).toFixed(2)}`)
      .join('');
    const baseY = y(Math.max(0, yMin));
    const area =
      `M${x(0).toFixed(2)},${baseY.toFixed(2)}` +
      points.map((m, i) => `L${x(i).toFixed(2)},${y(m.reserve).toFixed(2)}`).join('') +
      `L${x(points.length - 1).toFixed(2)},${baseY.toFixed(2)}Z`;
    const floorLine = floors
      .map((f, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(f).toFixed(2)}`)
      .join('');

    const ticks: Array<{ i: number; label: string }> = [];
    points.forEach((m, i) => {
      if (m.month === 0 && m.year % L.tickEveryYears === 0) ticks.push({ i, label: String(m.year) });
    });

    const yTicks: number[] = [];
    for (let s = 0; s <= L.yTickCount; s++) yTicks.push(yMin + ((yMax - yMin) * s) / L.yTickCount);

    const troughIndex = result.minReserveAt
      ? points.findIndex(
          (m) => m.year === result.minReserveAt?.year && m.month === result.minReserveAt?.month,
        )
      : -1;

    const axisScale = axisScaleFor(Math.max(Math.abs(yMin), Math.abs(yMax)));

    return {
      points,
      floors,
      x,
      y,
      line,
      area,
      floorLine,
      ticks,
      yTicks,
      yMin,
      troughIndex,
      axisScale,
    };
  }, [result, L]);

  function handleMove(event: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || !geometry) return;
    const rect = svg.getBoundingClientRect();
    const localX = ((event.clientX - rect.left) * L.w) / rect.width;
    const innerW = L.w - L.pad.left - L.pad.right;
    const t = (localX - L.pad.left) / innerW;
    setHoverIndex(clamp(Math.round(t * (geometry.points.length - 1)), 0, geometry.points.length - 1));
  }

  const summary = `${labels.title}. ${labels.trough}: ${money(result.minReserve, currency, locale)} ${monthLabel(result.minReserveAt, months)}.`;

  return (
    <figure style={{ margin: 0 }} ref={hostRef}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 6,
          flexWrap: 'wrap',
        }}
      >
        <figcaption style={{ fontWeight: 600, fontSize: 15 }}>{labels.title}</figcaption>
        <button
          type="button"
          className="btn"
          style={{ padding: '5px 10px', fontSize: 13 }}
          onClick={() => setShowTable((v) => !v)}
          aria-expanded={showTable}
        >
          {showTable ? labels.hideTable : labels.showTable}
        </button>
      </div>

      {showTable || !geometry ? (
        <div className="scroll-x">
          <table
            className="tabular"
            style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}
          >
            <thead>
              <tr>
                {[
                  labels.tableYear,
                  labels.tableReserve,
                  labels.tableInvest,
                  labels.tableMortgage,
                  labels.tableNetWorth,
                ].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    style={{
                      textAlign: 'right',
                      padding: '6px 10px',
                      borderBottom: '1px solid var(--axis)',
                      color: 'var(--ink-secondary)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.yearly.map((row) => {
                const personal = Object.values(row.personalInvestments).reduce((s, v) => s + v, 0);
                return (
                  <tr key={row.year}>
                    <td style={cell}>{row.year}</td>
                    <td
                      style={{
                        ...cell,
                        color: row.reserve < 0 ? 'var(--status-critical)' : undefined,
                      }}
                    >
                      {money(row.reserve, currency, locale)}
                    </td>
                    <td style={cell}>{money(row.jointInvestments + personal, currency, locale)}</td>
                    <td style={cell}>{money(row.mortgageBalance, currency, locale)}</td>
                    <td style={cell}>{money(row.netWorth, currency, locale)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <ChartSvg
          L={L}
          narrow={narrow}
          geometry={geometry}
          result={result}
          currency={currency}
          locale={locale}
          months={months}
          labels={labels}
          gradientId={gradientId}
          svgRef={svgRef}
          summary={summary}
          hoverIndex={hoverIndex}
          onMove={handleMove}
          onLeave={() => setHoverIndex(null)}
        />
      )}
    </figure>
  );
}

interface Geometry {
  points: ProjectionResult['monthly'];
  floors: number[];
  x: (index: number) => number;
  y: (value: number) => number;
  line: string;
  area: string;
  floorLine: string;
  ticks: Array<{ i: number; label: string }>;
  yTicks: number[];
  yMin: number;
  troughIndex: number;
  axisScale: ReturnType<typeof axisScaleFor>;
}

function ChartSvg({
  L,
  narrow,
  geometry,
  result,
  currency,
  locale,
  months,
  labels,
  gradientId,
  svgRef,
  summary,
  hoverIndex,
  onMove,
  onLeave,
}: {
  L: Layout;
  narrow: boolean;
  geometry: Geometry;
  result: ProjectionResult;
  currency: CurrencyCode;
  locale: UiLocale;
  months: string[];
  labels: ReserveChartProps['labels'];
  gradientId: string;
  svgRef: React.RefObject<SVGSVGElement | null>;
  summary: string;
  hoverIndex: number | null;
  onMove: (event: React.PointerEvent<SVGSVGElement>) => void;
  onLeave: () => void;
}) {
  const { points, floors, x, y, line, area, floorLine, ticks, yTicks, yMin, troughIndex, axisScale } =
    geometry;
  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const zeroY = y(0);
  const showZero = yMin < 0;
  const lastPoint = points[points.length - 1];
  const trough = troughIndex >= 0 ? points[troughIndex] : undefined;
  /* On a phone the tick values live in a left gutter; on desktop, a right one. */
  const ticksLeft = narrow;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${L.w} ${L.h}`}
      width="100%"
      role="img"
      aria-label={summary}
      style={{ display: 'block', touchAction: 'pan-y' }}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      <defs>
        <linearGradient id={`grad-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--series-reserve)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--series-reserve)" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {yTicks.map((v, i) => (
        <g key={i}>
          <line
            x1={L.pad.left}
            x2={L.w - L.pad.right}
            y1={y(v)}
            y2={y(v)}
            stroke="var(--grid)"
            strokeWidth="1"
          />
          <text
            x={ticksLeft ? L.pad.left - 6 : L.w - L.pad.right + 8}
            y={y(v) + 4}
            fontSize={L.font.axis}
            fill="var(--ink-muted)"
            textAnchor={ticksLeft ? 'end' : 'start'}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {moneyAxis(v, currency, locale, axisScale)}
          </text>
        </g>
      ))}

      {/* The sub-zero region gets a wash AND a marker line — never colour alone. */}
      {showZero && (
        <>
          <rect
            x={L.pad.left}
            y={zeroY}
            width={L.w - L.pad.left - L.pad.right}
            height={Math.max(0, L.h - L.pad.bottom - zeroY)}
            fill="var(--status-critical)"
            opacity="0.06"
          />
          <line
            x1={L.pad.left}
            x2={L.w - L.pad.right}
            y1={zeroY}
            y2={zeroY}
            stroke="var(--status-critical)"
            strokeWidth="1.5"
          />
        </>
      )}

      <path d={area} fill={`url(#grad-${gradientId})`} />

      {/* The floor is a reference line, directly labelled — not a second series. */}
      <path
        d={floorLine}
        fill="none"
        stroke="var(--ink-muted)"
        strokeWidth="1.5"
        strokeDasharray="5 4"
      />
      {!narrow && (
        <text
          x={L.w - L.pad.right + 8}
          y={y(floors[floors.length - 1] ?? 0) - 6}
          fontSize={L.font.axis}
          fill="var(--ink-muted)"
        >
          {labels.floorShort}
        </text>
      )}

      <path
        d={line}
        fill="none"
        stroke="var(--series-reserve)"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Direct labels, so identity never rests on hue. On a phone they move to a caption row. */}
      {narrow ? (
        <g>
          <line
            x1={2}
            x2={18}
            y1={L.h - 12}
            y2={L.h - 12}
            stroke="var(--series-reserve)"
            strokeWidth="2"
          />
          <text x={24} y={L.h - 8} fontSize={L.font.label} fill="var(--ink-secondary)">
            {labels.reserve}
          </text>
          <line
            x1={96}
            x2={112}
            y1={L.h - 12}
            y2={L.h - 12}
            stroke="var(--ink-muted)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
          <text x={118} y={L.h - 8} fontSize={L.font.label} fill="var(--ink-secondary)">
            {labels.floorShort}
          </text>
        </g>
      ) : (
        lastPoint && (
          <text
            x={L.w - L.pad.right + 8}
            y={y(lastPoint.reserve) + 4}
            fontSize={L.font.label}
            fontWeight="600"
            fill="var(--series-reserve)"
          >
            {labels.reserve}
          </text>
        )
      )}

      {ticks.map((tick) => (
        <text
          key={tick.i}
          x={x(tick.i)}
          y={L.h - L.pad.bottom + 16}
          fontSize={L.font.axis}
          fill="var(--ink-muted)"
          textAnchor="middle"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {tick.label}
        </text>
      ))}
      <line
        x1={L.pad.left}
        x2={L.w - L.pad.right}
        y1={L.h - L.pad.bottom}
        y2={L.h - L.pad.bottom}
        stroke="var(--axis)"
        strokeWidth="1"
      />

      {/* The trough callout sits on an opaque chip clamped inside the plot: the trough is by
          definition at the bottom, where free-floating text collides with the axis ticks and
          the zero line. */}
      {trough && (
        <g>
          <circle
            cx={x(troughIndex)}
            cy={y(trough.reserve)}
            r="6"
            fill={result.minReserve < 0 ? 'var(--status-critical)' : 'var(--status-warning)'}
            stroke="var(--surface)"
            strokeWidth="2"
          />
          <g
            transform={`translate(${clamp(
              x(troughIndex) + 12,
              L.pad.left,
              L.w - L.pad.right - L.calloutW - 2,
            )}, ${clamp(
              y(trough.reserve) - L.calloutH - 10,
              L.pad.top,
              L.h - L.pad.bottom - L.calloutH - 2,
            )})`}
          >
            <rect
              width={L.calloutW}
              height={L.calloutH}
              rx="7"
              fill="var(--surface)"
              stroke="var(--border-strong)"
            />
            <text x="9" y="15" fontSize={L.font.callout} fontWeight="600" fill="var(--ink)">
              {labels.trough}
            </text>
            <text
              x="9"
              y="31"
              fontSize={L.font.callout}
              fill="var(--ink-secondary)"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {money(result.minReserve, currency, locale)} ·{' '}
              {monthLabel(result.minReserveAt, months)}
            </text>
          </g>
        </g>
      )}

      {hovered && hoverIndex !== null && (
        <g pointerEvents="none">
          <line
            x1={x(hoverIndex)}
            x2={x(hoverIndex)}
            y1={L.pad.top}
            y2={L.h - L.pad.bottom}
            stroke="var(--axis)"
            strokeWidth="1"
          />
          <circle
            cx={x(hoverIndex)}
            cy={y(hovered.reserve)}
            r="4.5"
            fill="var(--series-reserve)"
            stroke="var(--surface)"
            strokeWidth="2"
          />
          <g
            transform={`translate(${clamp(x(hoverIndex) - 78, 2, L.w - L.pad.right - 158)}, ${L.pad.top - 16})`}
          >
            <rect width="156" height="38" rx="8" fill="var(--surface)" stroke="var(--border-strong)" />
            <text x="10" y="15" fontSize={L.font.axis} fill="var(--ink-muted)">
              {monthLabel({ year: hovered.year, month: hovered.month }, months)}
            </text>
            <text
              x="10"
              y="30"
              fontSize={L.font.label}
              fontWeight="600"
              fill="var(--ink)"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {money(hovered.reserve, currency, locale)}
            </text>
          </g>
        </g>
      )}
    </svg>
  );
}

const cell: React.CSSProperties = {
  textAlign: 'right',
  padding: '5px 10px',
  borderBottom: '1px solid var(--grid)',
  whiteSpace: 'nowrap',
};
