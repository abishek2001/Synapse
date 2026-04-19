/**
 * Dark-mode aware colors for chart canvases.
 *
 * All chart hooks (Line/Bar/Pie/Polar/Distribution) draw to a `<canvas>` so we
 * cannot rely on CSS variables — colors are baked into `ctx.strokeStyle` /
 * `ctx.fillStyle` at paint time. This helper returns the right palette so
 * the same chart renders legibly on both light and dark canvas backgrounds.
 */
export interface ChartTheme {
  /** Light grid lines behind the plot. */
  grid: string;
  /** Slightly stronger axis / zero line. */
  axis: string;
  /** Tick / axis labels. */
  axisLabel: string;
  /** Series legend label color. */
  legendLabel: string;
  /** Color used for tooltip dots / highlight rings drawn over a series. */
  tooltipDotFill: string;
  /** Background fill used for the donut hole in pie charts. */
  pieHole: string;
  /** Stroke between pie slices. */
  pieDivider: string;
}

const LIGHT: ChartTheme = {
  grid:           "rgba(0,0,0,0.05)",
  axis:           "rgba(0,0,0,0.15)",
  axisLabel:      "rgba(0,0,0,0.3)",
  legendLabel:    "rgba(0,0,0,0.5)",
  tooltipDotFill: "white",
  pieHole:        "rgba(255,255,255,0.92)",
  pieDivider:     "rgba(255,255,255,0.6)",
};

const DARK: ChartTheme = {
  grid:           "rgba(255,255,255,0.07)",
  axis:           "rgba(255,255,255,0.22)",
  axisLabel:      "rgba(255,255,255,0.55)",
  legendLabel:    "rgba(255,255,255,0.75)",
  tooltipDotFill: "rgba(20,20,40,0.95)",
  pieHole:        "rgba(20,20,40,0.92)",
  pieDivider:     "rgba(20,20,40,0.6)",
};

export function chartTheme(dark: boolean): ChartTheme {
  return dark ? DARK : LIGHT;
}
