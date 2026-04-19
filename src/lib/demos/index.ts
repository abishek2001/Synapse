import type { DemoScript } from "./types";
import { blackHoleDemo } from "./scripts/black-hole";
import { eigenvectorsDemo } from "./scripts/eigenvectors";
import { climateDemo } from "./scripts/climate";
import { dnaDemo } from "./scripts/dna";
import { heartDemo } from "./scripts/heart";
import { projectileDemo } from "./scripts/projectile";

/** Ordered registry of all hardcoded demos available from the Demo button.
 *  Order matters — the first item is what shows up at the top of the popover. */
export const DEMO_SCRIPTS: DemoScript[] = [
  heartDemo,
  projectileDemo,
  blackHoleDemo,
  eigenvectorsDemo,
  climateDemo,
  dnaDemo,
];

export type { DemoScript, DemoModule, DemoAnnotation } from "./types";
export { playDemoModule } from "./playback";
export { matchDemoByQuery } from "./match";
