import type { DemoScript } from "./types";
import { blackHoleDemo } from "./scripts/black-hole";
import { eigenvectorsDemo } from "./scripts/eigenvectors";
import { climateDemo } from "./scripts/climate";
import { dnaDemo } from "./scripts/dna";

/** Ordered registry of all hardcoded demos available from the Demo button. */
export const DEMO_SCRIPTS: DemoScript[] = [
  blackHoleDemo,
  eigenvectorsDemo,
  climateDemo,
  dnaDemo,
];

export type { DemoScript, DemoModule } from "./types";
export { playDemo } from "./playback";
