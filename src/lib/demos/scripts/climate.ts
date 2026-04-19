import type { DemoScript } from "../types";

/** ─────────────────────────────────────────────────────────────────────────
 *  Demo 3: Climate Cascade
 *  5 modules. Hits all required visuals:
 *  - 3D: Earth + atmospheric layers (Module 1)
 *  - Graphs: forecast CO2 + comparative bar (Module 2 & 4)
 *  - Tree: visual.hierarchy of cascade impacts (Module 3)
 *  - Diagram: carbon cycle (Module 5)
 *  ───────────────────────────────────────────────────────────────────────── */
export const climateDemo: DemoScript = {
  id: "climate",
  title: "Climate Cascade",
  description: "How a degree of warming ripples through Earth's systems.",
  tags: ["3D", "Tree", "Graphs", "Earth"],
  userPrompt: "Walk me through how climate change cascades through Earth's systems.",
  modules: [
    // ─── Module 1: Greenhouse effect ─────────────────────────────────────
    {
      title: "The greenhouse effect",
      writtenText:
        "Sunlight hits Earth's surface and warms it. The warm surface re-emits energy as infrared radiation, which is partly absorbed by greenhouse gases — CO₂, methane, water vapor — and re-radiated back. More gas means more re-radiation, which means a warmer surface to balance the energy budget.",
      spokenText:
        "Greenhouse gases absorb infrared radiation that the warm Earth tries to emit back to space, trapping heat. More gas, warmer surface.",
      artifacts: [
        {
          id: "cl-r3d-earth",
          type: "render3d",
          title: "Earth + atmospheric layers",
          status: "rendered",
          topic: "Earth with concentric atmospheric shells representing greenhouse gases",
          camera_distance: 5,
          bg_color: "#04060f",
          code: `
camera.position.set(2.5, 1.5, 4.5);
controls.target.set(0, 0, 0);

// Earth — blue/green sphere
const earth = new THREE.Mesh(
  new THREE.SphereGeometry(1.0, 48, 48),
  new THREE.MeshPhongMaterial({ color: 0x2a6fb8, emissive: 0x0a1a30, shininess: 30 })
);
scene.add(earth);

// Continents — bumpy noise approximation via random patches
const landMat = new THREE.MeshPhongMaterial({ color: 0x3da26b, transparent: true, opacity: 0.9 });
for (let i = 0; i < 18; i++) {
  const patch = new THREE.Mesh(new THREE.SphereGeometry(0.18 + Math.random() * 0.12, 12, 12), landMat);
  const phi = Math.random() * Math.PI * 2;
  const theta = Math.acos(2 * Math.random() - 1);
  const r = 1.005;
  patch.position.set(
    r * Math.sin(theta) * Math.cos(phi),
    r * Math.cos(theta),
    r * Math.sin(theta) * Math.sin(phi)
  );
  patch.scale.z = 0.05;
  patch.lookAt(new THREE.Vector3(0,0,0));
  earth.add(patch);
}

// Atmospheric shells — three concentric translucent spheres for different gases
const layers = [
  { r: 1.10, color: 0x88ccff, op: 0.20, label: 'Water vapor' },
  { r: 1.18, color: 0xffaa66, op: 0.18, label: 'CO₂' },
  { r: 1.26, color: 0xff66aa, op: 0.14, label: 'Methane' },
];
for (const l of layers) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(l.r, 48, 48),
    new THREE.MeshPhongMaterial({ color: l.color, transparent: true, opacity: l.op, side: THREE.BackSide })
  );
  scene.add(m);
}

// Sunlight rays (yellow arrows pointing in)
const sunDir = new THREE.Vector3(-1, 0.6, 0.4).normalize();
for (let i = 0; i < 6; i++) {
  const offset = new THREE.Vector3((Math.random()-0.5)*1.6, (Math.random()-0.5)*1.6, (Math.random()-0.5)*1.6);
  const start = sunDir.clone().multiplyScalar(3.2).add(offset);
  const arr = new THREE.ArrowHelper(sunDir.clone().negate(), start, 1.6, 0xfde047, 0.16, 0.10);
  scene.add(arr);
}

// Outgoing IR (red arrows from Earth surface, some bouncing back)
const irArrows = [];
for (let i = 0; i < 8; i++) {
  const dir = new THREE.Vector3(
    (Math.random()-0.5)*2,
    Math.random()*1.4,
    (Math.random()-0.5)*2
  ).normalize();
  const arr = new THREE.ArrowHelper(dir, dir.clone().multiplyScalar(1.02), 0.8, 0xff7755, 0.10, 0.06);
  scene.add(arr);
  irArrows.push({ arr, dir });
}

function update(t) {
  earth.rotation.y = t * 0.15;
  for (const { arr } of irArrows) {
    arr.setLength(0.6 + Math.sin(t * 1.5) * 0.2, 0.10, 0.06);
  }
}`,
        },
        {
          id: "cl-nt-sb",
          type: "notation",
          title: "Stefan-Boltzmann law",
          status: "rendered",
          latex: "P = \\sigma T^4",
          annotation:
            "Power radiated per unit area. Doubling T means 16× the radiation — the planet equilibrates fast, but greenhouse gases shift where that equilibrium lands.",
        },
      ],
    },

    // ─── Module 2: The data ──────────────────────────────────────────────
    {
      title: "The data",
      writtenText:
        "We have a startlingly long CO₂ record from ice cores — eight hundred thousand years of atmospheric history locked into Antarctic ice. The natural cycle stayed in the 180–300 ppm band. We're now at 420 ppm and rising fast — the dashed line shows where business-as-usual emissions take us by 2100.",
      spokenText:
        "Ice cores show CO₂ stayed between one-eighty and three hundred parts per million for eight hundred thousand years. We blew past that and are heading for over six hundred by twenty-one-hundred.",
      artifacts: [
        {
          id: "cl-gr-co2",
          type: "graph",
          title: "Atmospheric CO₂ — past + projection",
          status: "rendered",
          graph_type: "forecast",
          series: [
            {
              fn: "x < 1900 ? 280 + 5 * Math.sin(x / 40) : 280 + Math.pow((x - 1900) / 20, 2.1) * 0.9",
              label: "CO₂ (ppm)",
              color: "#7c3aed",
            },
          ],
          x_range: [1500, 2100],
          x_label: "Year",
          y_label: "CO₂ (ppm)",
        },
        {
          id: "cl-gr-temp",
          type: "graph",
          title: "Global temperature anomaly",
          status: "rendered",
          graph_type: "area",
          series: [
            {
              fn: "x < 1950 ? -0.1 + 0.05 * Math.sin(x / 12) : -0.1 + Math.pow((x - 1950) / 35, 1.8) * 0.7",
              label: "ΔT (°C)",
              color: "#f97316",
            },
          ],
          x_range: [1880, 2024],
          x_label: "Year",
          y_label: "ΔT vs 1850 (°C)",
        },
      ],
    },

    // ─── Module 3: The cascade ───────────────────────────────────────────
    {
      title: "The cascade",
      writtenText:
        "A single number — the global temperature anomaly — fans out into hundreds of downstream effects. Here's the canonical map: warming branches into the cryosphere, oceans, weather, biosphere, and human systems, each splitting again into specific impacts. Many of these have feedback loops back to the trunk.",
      spokenText:
        "One global temperature change cascades into the cryosphere, oceans, weather, biosphere, and human systems — each with its own downstream impacts and feedback loops.",
      artifacts: [
        {
          id: "cl-vis-tree",
          type: "visual",
          title: "Cascade of climate impacts",
          status: "rendered",
          description: "+1.5 °C and where it goes.",
          style: "hierarchy",
          svgContent: `<svg viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg">
            <rect x="110" y="6" width="100" height="26" rx="6" fill="#f97316" opacity="0.18" stroke="#f97316" stroke-width="1.5"/>
            <text x="160" y="23" text-anchor="middle" font-size="10" fill="#f97316" font-weight="700" font-family="system-ui,sans-serif">+1.5 °C warming</text>
            <line x1="160" y1="32" x2="40"  y2="58" stroke="#f97316" stroke-width="1" opacity="0.35"/>
            <line x1="160" y1="32" x2="100" y2="58" stroke="#f97316" stroke-width="1" opacity="0.35"/>
            <line x1="160" y1="32" x2="160" y2="58" stroke="#f97316" stroke-width="1" opacity="0.35"/>
            <line x1="160" y1="32" x2="220" y2="58" stroke="#f97316" stroke-width="1" opacity="0.35"/>
            <line x1="160" y1="32" x2="280" y2="58" stroke="#f97316" stroke-width="1" opacity="0.35"/>
            <rect x="6"   y="58" width="68" height="22" rx="4" fill="#0ea5e9" opacity="0.13" stroke="#0ea5e9" stroke-width="1"/>
            <text x="40"  y="72" text-anchor="middle" font-size="8" fill="#0ea5e9" font-weight="600" font-family="system-ui,sans-serif">Cryosphere</text>
            <rect x="66"  y="58" width="68" height="22" rx="4" fill="#10b981" opacity="0.13" stroke="#10b981" stroke-width="1"/>
            <text x="100" y="72" text-anchor="middle" font-size="8" fill="#10b981" font-weight="600" font-family="system-ui,sans-serif">Oceans</text>
            <rect x="126" y="58" width="68" height="22" rx="4" fill="#7c3aed" opacity="0.13" stroke="#7c3aed" stroke-width="1"/>
            <text x="160" y="72" text-anchor="middle" font-size="8" fill="#7c3aed" font-weight="600" font-family="system-ui,sans-serif">Weather</text>
            <rect x="186" y="58" width="68" height="22" rx="4" fill="#f59e0b" opacity="0.13" stroke="#f59e0b" stroke-width="1"/>
            <text x="220" y="72" text-anchor="middle" font-size="8" fill="#f59e0b" font-weight="600" font-family="system-ui,sans-serif">Biosphere</text>
            <rect x="246" y="58" width="68" height="22" rx="4" fill="#ec4899" opacity="0.13" stroke="#ec4899" stroke-width="1"/>
            <text x="280" y="72" text-anchor="middle" font-size="8" fill="#ec4899" font-weight="600" font-family="system-ui,sans-serif">Human</text>

            <line x1="40"  y1="80" x2="40"  y2="102" stroke="#0ea5e9" stroke-width="1" opacity="0.3"/>
            <line x1="100" y1="80" x2="100" y2="102" stroke="#10b981" stroke-width="1" opacity="0.3"/>
            <line x1="160" y1="80" x2="160" y2="102" stroke="#7c3aed" stroke-width="1" opacity="0.3"/>
            <line x1="220" y1="80" x2="220" y2="102" stroke="#f59e0b" stroke-width="1" opacity="0.3"/>
            <line x1="280" y1="80" x2="280" y2="102" stroke="#ec4899" stroke-width="1" opacity="0.3"/>

            <rect x="6"   y="102" width="68" height="20" rx="4" fill="#0ea5e9" opacity="0.07" stroke="#0ea5e9" stroke-width="0.7"/>
            <text x="40"  y="115" text-anchor="middle" font-size="7" fill="#0ea5e9" font-family="system-ui,sans-serif">Arctic ice loss</text>
            <rect x="6"   y="124" width="68" height="20" rx="4" fill="#0ea5e9" opacity="0.07" stroke="#0ea5e9" stroke-width="0.7"/>
            <text x="40"  y="137" text-anchor="middle" font-size="7" fill="#0ea5e9" font-family="system-ui,sans-serif">Greenland melt</text>
            <rect x="6"   y="146" width="68" height="20" rx="4" fill="#0ea5e9" opacity="0.07" stroke="#0ea5e9" stroke-width="0.7"/>
            <text x="40"  y="159" text-anchor="middle" font-size="7" fill="#0ea5e9" font-family="system-ui,sans-serif">Permafrost CH₄</text>

            <rect x="66"  y="102" width="68" height="20" rx="4" fill="#10b981" opacity="0.07" stroke="#10b981" stroke-width="0.7"/>
            <text x="100" y="115" text-anchor="middle" font-size="7" fill="#10b981" font-family="system-ui,sans-serif">Sea level rise</text>
            <rect x="66"  y="124" width="68" height="20" rx="4" fill="#10b981" opacity="0.07" stroke="#10b981" stroke-width="0.7"/>
            <text x="100" y="137" text-anchor="middle" font-size="7" fill="#10b981" font-family="system-ui,sans-serif">Acidification</text>
            <rect x="66"  y="146" width="68" height="20" rx="4" fill="#10b981" opacity="0.07" stroke="#10b981" stroke-width="0.7"/>
            <text x="100" y="159" text-anchor="middle" font-size="7" fill="#10b981" font-family="system-ui,sans-serif">Coral bleaching</text>

            <rect x="126" y="102" width="68" height="20" rx="4" fill="#7c3aed" opacity="0.07" stroke="#7c3aed" stroke-width="0.7"/>
            <text x="160" y="115" text-anchor="middle" font-size="7" fill="#7c3aed" font-family="system-ui,sans-serif">Stronger storms</text>
            <rect x="126" y="124" width="68" height="20" rx="4" fill="#7c3aed" opacity="0.07" stroke="#7c3aed" stroke-width="0.7"/>
            <text x="160" y="137" text-anchor="middle" font-size="7" fill="#7c3aed" font-family="system-ui,sans-serif">Heatwaves</text>
            <rect x="126" y="146" width="68" height="20" rx="4" fill="#7c3aed" opacity="0.07" stroke="#7c3aed" stroke-width="0.7"/>
            <text x="160" y="159" text-anchor="middle" font-size="7" fill="#7c3aed" font-family="system-ui,sans-serif">Drought + flood</text>

            <rect x="186" y="102" width="68" height="20" rx="4" fill="#f59e0b" opacity="0.07" stroke="#f59e0b" stroke-width="0.7"/>
            <text x="220" y="115" text-anchor="middle" font-size="7" fill="#f59e0b" font-family="system-ui,sans-serif">Habitat shifts</text>
            <rect x="186" y="124" width="68" height="20" rx="4" fill="#f59e0b" opacity="0.07" stroke="#f59e0b" stroke-width="0.7"/>
            <text x="220" y="137" text-anchor="middle" font-size="7" fill="#f59e0b" font-family="system-ui,sans-serif">Species loss</text>
            <rect x="186" y="146" width="68" height="20" rx="4" fill="#f59e0b" opacity="0.07" stroke="#f59e0b" stroke-width="0.7"/>
            <text x="220" y="159" text-anchor="middle" font-size="7" fill="#f59e0b" font-family="system-ui,sans-serif">Forest dieback</text>

            <rect x="246" y="102" width="68" height="20" rx="4" fill="#ec4899" opacity="0.07" stroke="#ec4899" stroke-width="0.7"/>
            <text x="280" y="115" text-anchor="middle" font-size="7" fill="#ec4899" font-family="system-ui,sans-serif">Crop failures</text>
            <rect x="246" y="124" width="68" height="20" rx="4" fill="#ec4899" opacity="0.07" stroke="#ec4899" stroke-width="0.7"/>
            <text x="280" y="137" text-anchor="middle" font-size="7" fill="#ec4899" font-family="system-ui,sans-serif">Migration</text>
            <rect x="246" y="146" width="68" height="20" rx="4" fill="#ec4899" opacity="0.07" stroke="#ec4899" stroke-width="0.7"/>
            <text x="280" y="159" text-anchor="middle" font-size="7" fill="#ec4899" font-family="system-ui,sans-serif">Health impacts</text>

            <text x="160" y="195" text-anchor="middle" font-size="7" fill="rgba(0,0,0,0.45)" font-family="system-ui,sans-serif" font-style="italic">Many leaves feed back to the trunk via positive feedback loops</text>
          </svg>`,
        },
      ],
    },

    // ─── Module 4: What works ────────────────────────────────────────────
    {
      title: "What works: the mitigation menu",
      writtenText:
        "Some interventions actually move the needle on emissions. Here's a side-by-side of renewables vs fossil fuels along the dimensions that matter most for scaling — cost, emissions intensity, land use, jobs created per dollar, and how fast they can grow.",
      spokenText:
        "Renewables now beat fossil fuels on cost, emissions, and jobs per dollar. The bar chart below shows the size of the opportunity by sector.",
      artifacts: [
        {
          id: "cl-vis-cmp",
          type: "visual",
          title: "Renewables vs Fossils",
          status: "rendered",
          description: "Five dimensions that matter for scaling.",
          style: "comparison",
          svgContent: `<svg viewBox="0 0 230 180" xmlns="http://www.w3.org/2000/svg">
            <rect x="8"   y="8"  width="102" height="24" rx="5" fill="#10b981" opacity="0.16" stroke="#10b981" stroke-width="1.2"/>
            <text x="59"  y="23" text-anchor="middle" font-size="9" fill="#10b981" font-weight="600" font-family="system-ui,sans-serif">Renewables</text>
            <rect x="120" y="8"  width="102" height="24" rx="5" fill="#7c3aed" opacity="0.10" stroke="#7c3aed" stroke-width="1.2"/>
            <text x="171" y="23" text-anchor="middle" font-size="9" fill="#7c3aed" font-weight="600" font-family="system-ui,sans-serif">Fossil fuels</text>
            <line x1="0" y1="36" x2="230" y2="36" stroke="rgba(0,0,0,0.06)" stroke-width="1"/>
            <rect x="8"   y="40" width="102" height="20" rx="3" fill="#10b981" opacity="0.05"/>
            <rect x="120" y="40" width="102" height="20" rx="3" fill="#7c3aed" opacity="0.04"/>
            <text x="14"  y="53" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Cost: $30/MWh</text>
            <text x="126" y="53" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Cost: $60-130/MWh</text>
            <rect x="8"   y="64" width="102" height="20" rx="3" fill="#10b981" opacity="0.03"/>
            <rect x="120" y="64" width="102" height="20" rx="3" fill="#7c3aed" opacity="0.04"/>
            <text x="14"  y="77" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">CO₂: 10 g/kWh</text>
            <text x="126" y="77" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">CO₂: 800 g/kWh</text>
            <rect x="8"   y="88" width="102" height="20" rx="3" fill="#10b981" opacity="0.05"/>
            <rect x="120" y="88" width="102" height="20" rx="3" fill="#7c3aed" opacity="0.04"/>
            <text x="14"  y="101" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Land: high (solar/wind)</text>
            <text x="126" y="101" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Land: low + extraction</text>
            <rect x="8"   y="112" width="102" height="20" rx="3" fill="#10b981" opacity="0.03"/>
            <rect x="120" y="112" width="102" height="20" rx="3" fill="#7c3aed" opacity="0.04"/>
            <text x="14"  y="125" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Jobs/$: 7.5 / $M</text>
            <text x="126" y="125" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Jobs/$: 2.7 / $M</text>
            <rect x="8"   y="136" width="102" height="20" rx="3" fill="#10b981" opacity="0.05"/>
            <rect x="120" y="136" width="102" height="20" rx="3" fill="#7c3aed" opacity="0.04"/>
            <text x="14"  y="149" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Growth: 20%/yr</text>
            <text x="126" y="149" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Growth: 1-2%/yr</text>
            <rect x="8"   y="160" width="102" height="16" rx="3" fill="#10b981" opacity="0.03"/>
            <rect x="120" y="160" width="102" height="16" rx="3" fill="#7c3aed" opacity="0.04"/>
            <text x="14"  y="171" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Storage: needs batteries</text>
            <text x="126" y="171" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Storage: built-in fuel</text>
          </svg>`,
        },
        {
          id: "cl-gr-bar",
          type: "graph",
          title: "Reduction potential by sector (Gt CO₂/yr by 2030)",
          status: "rendered",
          graph_type: "bar",
          series: [
            {
              label: "Mitigation potential",
              color: "#10b981",
              data: [
                { x: 1, y: 6.3 },
                { x: 2, y: 5.1 },
                { x: 3, y: 4.4 },
                { x: 4, y: 2.9 },
                { x: 5, y: 2.2 },
                { x: 6, y: 1.7 },
              ],
            },
          ],
          x_range: [0.5, 6.5],
          x_label: "1=Solar 2=Wind 3=Forests 4=Efficiency 5=EVs 6=Diet",
          y_label: "Gt CO₂/yr",
        },
      ],
    },

    // ─── Module 5: The carbon cycle ──────────────────────────────────────
    {
      title: "The carbon cycle",
      writtenText:
        "Carbon doesn't disappear — it cycles between four big reservoirs: the atmosphere, the oceans, the biosphere, and fossil reserves. Burning fossil fuel takes carbon out of the slow geologic loop and dumps it into the fast loop, faster than the natural sinks can absorb it. That imbalance is the entire problem.",
      spokenText:
        "Burning fossil fuel moves carbon from the slow geologic cycle into the fast atmospheric cycle, faster than the natural sinks can absorb it. That imbalance is climate change in one sentence.",
      artifacts: [
        {
          id: "cl-dia-cycle",
          type: "diagram",
          title: "The carbon cycle",
          status: "rendered",
          direction: "LR",
          nodes: [
            { id: "atm", label: "Atmosphere", description: "~870 Gt C", color: "blue" },
            { id: "ocean", label: "Oceans", description: "~38,000 Gt C", color: "blue" },
            { id: "bio", label: "Biosphere", description: "~2,000 Gt C", color: "green" },
            { id: "soil", label: "Soils", description: "~1,500 Gt C", color: "orange" },
            { id: "fossil", label: "Fossil reserves", description: "~4,000 Gt C", color: "gray" },
            { id: "human", label: "Human emissions", description: "+10 Gt C/yr", color: "red" },
          ],
          edges: [
            { from: "atm", to: "ocean", label: "dissolves" },
            { from: "ocean", to: "atm", label: "outgases" },
            { from: "atm", to: "bio", label: "photosynthesis" },
            { from: "bio", to: "atm", label: "respiration" },
            { from: "bio", to: "soil", label: "decay" },
            { from: "soil", to: "atm", label: "respiration" },
            { from: "fossil", to: "human", label: "extracted" },
            { from: "human", to: "atm", label: "burned" },
          ],
        },
      ],
    },
  ],
};
