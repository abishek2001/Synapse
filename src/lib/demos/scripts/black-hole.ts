import type { DemoScript } from "../types";

/** ─────────────────────────────────────────────────────────────────────────
 *  Demo 1: Black Holes
 *  5 modules. Hits all required visuals:
 *  - 3D: event horizon + accretion disk (Module 2), tidal stretching (Module 3)
 *  - Graphs: escape velocity with M slider, tidal force log (Module 2 & 3)
 *  - Tree: visual.hierarchy of black hole types (Module 4)
 *  ───────────────────────────────────────────────────────────────────────── */
export const blackHoleDemo: DemoScript = {
  id: "black-hole",
  title: "Black Holes",
  description: "Event horizons, spaghettification, the family of black holes.",
  tags: ["3D", "Tree", "Graphs", "Physics"],
  userPrompt: "How does a black hole actually work?",
  keywords: ["black hole", "blackhole"],
  modules: [
    // ─── Module 1: What is a black hole? ─────────────────────────────────
    {
      title: "What is a black hole?",
      writtenText:
        "A black hole is a region of spacetime where gravity is so intense that nothing — not even light — can escape once it crosses a boundary called the event horizon. It forms when massive stars collapse under their own weight, packing matter so densely that the escape velocity exceeds the speed of light.",
      spokenText:
        "A black hole is a region of spacetime where gravity is so strong that not even light can escape. Let's break down the key concepts.",
      artifacts: [
        {
          id: "bh-fc-1",
          type: "flashcard",
          title: "Core ideas",
          status: "rendered",
          cards: [
            {
              front: "What is a black hole?",
              back: "A region where spacetime curves so steeply that the escape velocity exceeds the speed of light. Inside, all paths lead to the singularity.",
            },
            {
              front: "What's the event horizon?",
              back: "The point of no return — a one-way membrane around the singularity. Cross it and you can never send a signal back out.",
            },
            {
              front: "Why can't light escape?",
              back: "Spacetime itself is falling inward faster than light can travel outward. There's no path out, no matter how fast you move.",
            },
          ],
        },
        {
          id: "bh-vis-cm",
          type: "visual",
          title: "Anatomy of a black hole",
          status: "rendered",
          description: "The four key regions you should know.",
          style: "concept_map",
          svgContent: `<svg viewBox="0 0 240 170" xmlns="http://www.w3.org/2000/svg">
            <circle cx="120" cy="85" r="14" fill="#000" stroke="#7c3aed" stroke-width="1.6"/>
            <text x="120" y="89" text-anchor="middle" font-size="7" fill="#fff" font-family="system-ui,sans-serif">Singularity</text>
            <ellipse cx="120" cy="85" rx="34" ry="18" fill="none" stroke="#7c3aed" stroke-width="1" opacity="0.55"/>
            <ellipse cx="120" cy="85" rx="58" ry="9" fill="none" stroke="#f59e0b" stroke-width="1.4" opacity="0.7"/>
            <ellipse cx="120" cy="85" rx="80" ry="12" fill="none" stroke="#f97316" stroke-width="0.8" opacity="0.45" stroke-dasharray="2 2"/>
            <line x1="170" y1="40" x2="146" y2="74" stroke="rgba(0,0,0,0.35)" stroke-width="0.8"/>
            <text x="172" y="36" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Event horizon</text>
            <line x1="40" y1="50" x2="86" y2="76" stroke="rgba(0,0,0,0.35)" stroke-width="0.8"/>
            <text x="6" y="46" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Photon sphere</text>
            <line x1="200" y1="130" x2="172" y2="92" stroke="rgba(0,0,0,0.35)" stroke-width="0.8"/>
            <text x="148" y="142" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Accretion disk</text>
          </svg>`,
        },
      ],
      nextPrompt: "Explain the math — what's the Schwarzschild radius?",
      annotations: [
        { kind: "sticky", content: "Event horizon =\npoint of no return", anchor: "top-right", color: "#fee2e2" },
        { kind: "text",   content: "Light can't escape\nonce inside r_s", anchor: "below", offsetY: -10 },
      ],
    },

    // ─── Module 2: Schwarzschild geometry ─────────────────────────────────
    {
      title: "Schwarzschild geometry",
      writtenText:
        "For a non-rotating black hole, the size of the event horizon is given by the Schwarzschild radius. Below this distance, the escape velocity formally exceeds the speed of light. Drag the mass slider to see how the horizon scales — it's exactly linear in M.",
      spokenText:
        "The Schwarzschild radius defines the event horizon. It scales linearly with mass — double the mass, double the horizon.",
      artifacts: [
        {
          id: "bh-nt-rs",
          type: "notation",
          title: "Schwarzschild radius",
          status: "rendered",
          latex: "r_s = \\frac{2GM}{c^2}",
          annotation:
            "G is the gravitational constant, M the black hole mass, c the speed of light. For one solar mass, r_s ≈ 3 km.",
        },
        {
          id: "bh-r3d-bh",
          type: "render3d",
          title: "Event horizon + accretion disk",
          status: "rendered",
          topic: "Schwarzschild black hole with luminous accretion disk",
          camera_distance: 9,
          bg_color: "#04050d",
          code: `
camera.position.set(0, 2.4, 9);
controls.target.set(0, 0, 0);

// Event horizon — true black sphere
const horizon = new THREE.Mesh(
  new THREE.SphereGeometry(1.0, 48, 48),
  new THREE.MeshBasicMaterial({ color: 0x000000 })
);
scene.add(horizon);

// Photon ring — thin glowing torus just outside the horizon
const photonRing = new THREE.Mesh(
  new THREE.TorusGeometry(1.5, 0.02, 16, 100),
  new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95 })
);
photonRing.rotation.x = Math.PI / 2;
scene.add(photonRing);

// Accretion disk — multi-ring with color gradient (hot inner → cool outer)
const diskRings = [];
for (let i = 0; i < 24; i++) {
  const r = 1.7 + i * 0.15;
  const hue = 0.08 + (i / 24) * 0.06; // orange → red shift
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setHSL(hue, 0.9, 0.55 - i * 0.012),
    transparent: true, opacity: 0.85 - i * 0.025, side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.12, 96), mat);
  ring.rotation.x = -Math.PI / 2 + 0.15; // slight tilt for drama
  scene.add(ring);
  diskRings.push(ring);
}

// Faint outer halo
const halo = new THREE.Mesh(
  new THREE.RingGeometry(5.6, 7.0, 96),
  new THREE.MeshBasicMaterial({ color: 0x4422aa, transparent: true, opacity: 0.18, side: THREE.DoubleSide })
);
halo.rotation.x = -Math.PI / 2 + 0.15;
scene.add(halo);

// Star field background
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(800 * 3);
for (let i = 0; i < 800; i++) {
  const r = 60 + Math.random() * 200;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  starPos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
  starPos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
  starPos[i*3+2] = r * Math.cos(phi);
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.4, transparent: true, opacity: 0.6 })));

function update(t) {
  // Slowly rotate the disk to suggest infall
  for (let i = 0; i < diskRings.length; i++) {
    diskRings[i].rotation.z = t * (0.25 + i * 0.012);
  }
  halo.rotation.z = t * 0.05;
}`,
        },
        {
          id: "bh-gr-vesc",
          type: "graph",
          title: "Escape velocity vs distance",
          status: "rendered",
          graph_type: "line",
          series: [
            {
              fn: "Math.min(3e8, Math.sqrt((2 * 6.674e-11 * (M * 1.989e30)) / (r * 1000)))",
              label: "v_escape (m/s)",
              color: "#7c3aed",
            },
          ],
          variables: [
            {
              name: "M",
              label: "Mass (M☉)",
              min: 1,
              max: 50,
              step: 1,
              default: 10,
            },
          ],
          x_range: [1, 200],
          x_label: "r (km from center)",
          y_label: "v_escape (m/s)",
        },
      ],
      nextPrompt: "What happens to me if I fall in?",
      annotations: [
        { kind: "sticky", content: "rₛ = 2GM/c²\n(Schwarzschild radius)", anchor: "right", color: "#fff7c2" },
        { kind: "text",   content: "Earth → 9 mm\nSun → 3 km\nM87* → 38 billion km", anchor: "below", offsetY: -10 },
      ],
    },

    // ─── Module 3: Spaghettification ──────────────────────────────────────
    {
      title: "Spaghettification",
      writtenText:
        "Tidal forces — the difference in gravitational pull between your head and your feet — scale as 1 over r-cubed. Far from a black hole, this is negligible. As you approach the horizon, it grows astronomically, stretching anything that ventures too close into a long thin string. Around stellar-mass black holes, you'd be torn apart well before reaching the horizon.",
      spokenText:
        "Tidal forces scale as one over r-cubed, growing astronomically near the horizon and stretching matter into a thin string. Astronomers call this spaghettification.",
      artifacts: [
        {
          id: "bh-gr-tidal",
          type: "graph",
          title: "Tidal force vs distance (log scale)",
          status: "rendered",
          graph_type: "line",
          series: [
            {
              fn: "1e9 / (x*x*x)",
              label: "Tidal force ∝ 1/r³",
              color: "#f97316",
            },
          ],
          x_range: [1, 50],
          x_label: "r (arbitrary units from horizon)",
          y_label: "Force (relative)",
        },
        {
          id: "bh-vis-flow",
          type: "visual",
          title: "What happens to a falling object",
          status: "rendered",
          description: "Stages of approach near the horizon.",
          style: "flowchart",
          svgContent: `<svg viewBox="0 0 280 130" xmlns="http://www.w3.org/2000/svg">
            <rect x="10" y="50" width="56" height="30" rx="6" fill="#0ea5e9" opacity="0.12" stroke="#0ea5e9" stroke-width="1.2"/>
            <text x="38" y="65" text-anchor="middle" font-size="8" fill="#0ea5e9" font-family="system-ui,sans-serif">Far away</text>
            <text x="38" y="76" text-anchor="middle" font-size="6.5" fill="#0ea5e9" font-family="system-ui,sans-serif" opacity="0.7">tides negligible</text>
            <line x1="66" y1="65" x2="80" y2="65" stroke="#7c3aed" stroke-width="1.2" opacity="0.6"/>
            <polygon points="80,62 86,65 80,68" fill="#7c3aed" opacity="0.6"/>
            <rect x="86" y="50" width="56" height="30" rx="6" fill="#7c3aed" opacity="0.12" stroke="#7c3aed" stroke-width="1.2"/>
            <text x="114" y="65" text-anchor="middle" font-size="8" fill="#7c3aed" font-family="system-ui,sans-serif">Approaching</text>
            <text x="114" y="76" text-anchor="middle" font-size="6.5" fill="#7c3aed" font-family="system-ui,sans-serif" opacity="0.7">stretching begins</text>
            <line x1="142" y1="65" x2="156" y2="65" stroke="#f59e0b" stroke-width="1.2" opacity="0.6"/>
            <polygon points="156,62 162,65 156,68" fill="#f59e0b" opacity="0.6"/>
            <rect x="162" y="50" width="56" height="30" rx="6" fill="#f59e0b" opacity="0.15" stroke="#f59e0b" stroke-width="1.2"/>
            <text x="190" y="65" text-anchor="middle" font-size="8" fill="#f59e0b" font-family="system-ui,sans-serif">Spaghettified</text>
            <text x="190" y="76" text-anchor="middle" font-size="6.5" fill="#f59e0b" font-family="system-ui,sans-serif" opacity="0.7">torn apart</text>
            <line x1="218" y1="65" x2="232" y2="65" stroke="#ef4444" stroke-width="1.2" opacity="0.6"/>
            <polygon points="232,62 238,65 232,68" fill="#ef4444" opacity="0.6"/>
            <rect x="238" y="50" width="36" height="30" rx="6" fill="#ef4444" opacity="0.18" stroke="#ef4444" stroke-width="1.2"/>
            <text x="256" y="68" text-anchor="middle" font-size="8" fill="#ef4444" font-family="system-ui,sans-serif">Crossed</text>
          </svg>`,
        },
      ],
      nextPrompt: "Are all black holes the same?",
      annotations: [
        { kind: "sticky", content: "Tidal force ∝ 1/r³\n(grows fast near horizon)", anchor: "top-right", color: "#fce7f3" },
        { kind: "text",   content: "Bigger BH → gentler stretch\n(supermassives let you in alive!)", anchor: "below", offsetY: -10 },
      ],
    },

    // ─── Module 4: The family of black holes ─────────────────────────────
    {
      title: "The family of black holes",
      writtenText:
        "Astronomers classify black holes into four broad types by mass — from stellar-mass remnants of dead stars all the way up to the supermassive monsters at the heart of every large galaxy. Their formation, location, and observable signatures are all different.",
      spokenText:
        "Black holes come in four mass classes — stellar, intermediate, supermassive, and the still-theoretical primordial. Each forms differently and lives in a different part of the universe.",
      artifacts: [
        {
          id: "bh-vis-tree",
          type: "visual",
          title: "Family tree of black holes",
          status: "rendered",
          description: "Mass-based classification with example objects.",
          style: "hierarchy",
          svgContent: `<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">
            <rect x="120" y="6" width="80" height="26" rx="6" fill="#7c3aed" opacity="0.18" stroke="#7c3aed" stroke-width="1.5"/>
            <text x="160" y="23" text-anchor="middle" font-size="10" fill="#7c3aed" font-weight="700" font-family="system-ui,sans-serif">Black Holes</text>
            <line x1="160" y1="32" x2="40"  y2="58" stroke="#7c3aed" stroke-width="1" opacity="0.35"/>
            <line x1="160" y1="32" x2="120" y2="58" stroke="#7c3aed" stroke-width="1" opacity="0.35"/>
            <line x1="160" y1="32" x2="200" y2="58" stroke="#7c3aed" stroke-width="1" opacity="0.35"/>
            <line x1="160" y1="32" x2="280" y2="58" stroke="#7c3aed" stroke-width="1" opacity="0.35"/>
            <rect x="6"   y="58" width="68" height="26" rx="5" fill="#0ea5e9" opacity="0.13" stroke="#0ea5e9" stroke-width="1"/>
            <text x="40"  y="71" text-anchor="middle" font-size="8.5" fill="#0ea5e9" font-weight="600" font-family="system-ui,sans-serif">Stellar</text>
            <text x="40"  y="80" text-anchor="middle" font-size="6.5" fill="#0ea5e9" font-family="system-ui,sans-serif">~10 M☉</text>
            <rect x="86"  y="58" width="68" height="26" rx="5" fill="#10b981" opacity="0.13" stroke="#10b981" stroke-width="1"/>
            <text x="120" y="71" text-anchor="middle" font-size="8.5" fill="#10b981" font-weight="600" font-family="system-ui,sans-serif">Intermediate</text>
            <text x="120" y="80" text-anchor="middle" font-size="6.5" fill="#10b981" font-family="system-ui,sans-serif">10²–10⁵ M☉</text>
            <rect x="166" y="58" width="68" height="26" rx="5" fill="#f59e0b" opacity="0.14" stroke="#f59e0b" stroke-width="1"/>
            <text x="200" y="71" text-anchor="middle" font-size="8.5" fill="#f59e0b" font-weight="600" font-family="system-ui,sans-serif">Supermassive</text>
            <text x="200" y="80" text-anchor="middle" font-size="6.5" fill="#f59e0b" font-family="system-ui,sans-serif">10⁶–10¹⁰ M☉</text>
            <rect x="246" y="58" width="68" height="26" rx="5" fill="#ec4899" opacity="0.13" stroke="#ec4899" stroke-width="1"/>
            <text x="280" y="71" text-anchor="middle" font-size="8.5" fill="#ec4899" font-weight="600" font-family="system-ui,sans-serif">Primordial</text>
            <text x="280" y="80" text-anchor="middle" font-size="6.5" fill="#ec4899" font-family="system-ui,sans-serif">theorized</text>

            <line x1="40"  y1="84" x2="40"  y2="106" stroke="#0ea5e9" stroke-width="1" opacity="0.3"/>
            <line x1="120" y1="84" x2="120" y2="106" stroke="#10b981" stroke-width="1" opacity="0.3"/>
            <line x1="200" y1="84" x2="200" y2="106" stroke="#f59e0b" stroke-width="1" opacity="0.3"/>
            <line x1="280" y1="84" x2="280" y2="106" stroke="#ec4899" stroke-width="1" opacity="0.3"/>

            <rect x="8"   y="106" width="64" height="20" rx="4" fill="#0ea5e9" opacity="0.08" stroke="#0ea5e9" stroke-width="0.7"/>
            <text x="40"  y="119" text-anchor="middle" font-size="7" fill="#0ea5e9" font-family="system-ui,sans-serif">Cygnus X-1</text>
            <rect x="88"  y="106" width="64" height="20" rx="4" fill="#10b981" opacity="0.08" stroke="#10b981" stroke-width="0.7"/>
            <text x="120" y="119" text-anchor="middle" font-size="7" fill="#10b981" font-family="system-ui,sans-serif">M82 X-1</text>
            <rect x="168" y="106" width="64" height="20" rx="4" fill="#f59e0b" opacity="0.08" stroke="#f59e0b" stroke-width="0.7"/>
            <text x="200" y="119" text-anchor="middle" font-size="7" fill="#f59e0b" font-family="system-ui,sans-serif">Sgr A* / M87*</text>
            <rect x="248" y="106" width="64" height="20" rx="4" fill="#ec4899" opacity="0.08" stroke="#ec4899" stroke-width="0.7"/>
            <text x="280" y="119" text-anchor="middle" font-size="7" fill="#ec4899" font-family="system-ui,sans-serif">Dark matter?</text>

            <text x="8"   y="146" font-size="6.5" fill="rgba(0,0,0,0.45)" font-family="system-ui,sans-serif">Forms from</text>
            <text x="8"   y="156" font-size="6.5" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">collapsing star</text>
            <text x="88"  y="146" font-size="6.5" fill="rgba(0,0,0,0.45)" font-family="system-ui,sans-serif">Dense star</text>
            <text x="88"  y="156" font-size="6.5" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">cluster mergers</text>
            <text x="168" y="146" font-size="6.5" fill="rgba(0,0,0,0.45)" font-family="system-ui,sans-serif">Galactic core</text>
            <text x="168" y="156" font-size="6.5" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">accretion + mergers</text>
            <text x="248" y="146" font-size="6.5" fill="rgba(0,0,0,0.45)" font-family="system-ui,sans-serif">Density spikes</text>
            <text x="248" y="156" font-size="6.5" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">in the early universe</text>
          </svg>`,
        },
        {
          id: "bh-vis-cmp",
          type: "visual",
          title: "Stellar vs Supermassive",
          status: "rendered",
          description: "How extreme the size difference really is.",
          style: "comparison",
          svgContent: `<svg viewBox="0 0 230 160" xmlns="http://www.w3.org/2000/svg">
            <rect x="8"   y="8"  width="102" height="24" rx="5" fill="#0ea5e9" opacity="0.15" stroke="#0ea5e9" stroke-width="1.2"/>
            <text x="59"  y="23" text-anchor="middle" font-size="9" fill="#0ea5e9" font-weight="600" font-family="system-ui,sans-serif">Stellar (10 M☉)</text>
            <rect x="120" y="8"  width="102" height="24" rx="5" fill="#f59e0b" opacity="0.15" stroke="#f59e0b" stroke-width="1.2"/>
            <text x="171" y="23" text-anchor="middle" font-size="9" fill="#f59e0b" font-weight="600" font-family="system-ui,sans-serif">Supermassive (4M M☉)</text>
            <line x1="0" y1="36" x2="230" y2="36" stroke="rgba(0,0,0,0.06)" stroke-width="1"/>
            <rect x="8"   y="40" width="102" height="20" rx="3" fill="#0ea5e9" opacity="0.05"/>
            <rect x="120" y="40" width="102" height="20" rx="3" fill="#f59e0b" opacity="0.05"/>
            <text x="14"  y="53" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Horizon: 30 km</text>
            <text x="126" y="53" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Horizon: 12M km</text>
            <rect x="8"   y="64" width="102" height="20" rx="3" fill="#0ea5e9" opacity="0.03"/>
            <rect x="120" y="64" width="102" height="20" rx="3" fill="#f59e0b" opacity="0.03"/>
            <text x="14"  y="77" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Tides: lethal far out</text>
            <text x="126" y="77" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Tides: gentle at horizon</text>
            <rect x="8"   y="88" width="102" height="20" rx="3" fill="#0ea5e9" opacity="0.05"/>
            <rect x="120" y="88" width="102" height="20" rx="3" fill="#f59e0b" opacity="0.05"/>
            <text x="14"  y="101" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Lifetime: 10⁶⁷ yr</text>
            <text x="126" y="101" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Lifetime: 10⁹⁰ yr</text>
            <rect x="8"   y="112" width="102" height="20" rx="3" fill="#0ea5e9" opacity="0.03"/>
            <rect x="120" y="112" width="102" height="20" rx="3" fill="#f59e0b" opacity="0.03"/>
            <text x="14"  y="125" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Found: stellar binaries</text>
            <text x="126" y="125" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Found: galactic centers</text>
            <rect x="8"   y="136" width="102" height="20" rx="3" fill="#0ea5e9" opacity="0.05"/>
            <rect x="120" y="136" width="102" height="20" rx="3" fill="#f59e0b" opacity="0.05"/>
            <text x="14"  y="149" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Detection: X-rays + LIGO</text>
            <text x="126" y="149" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Detection: EHT, star orbits</text>
          </svg>`,
        },
      ],
      nextPrompt: "How do we even know they exist if light can't escape?",
      annotations: [
        { kind: "sticky", content: "Stellar  ~ 5–100 M☉\nIntermediate ~ 10³–10⁵\nSupermassive ~ 10⁶–10¹⁰", anchor: "right", color: "#dbeafe" },
      ],
    },

    // ─── Module 5: How we detect them ────────────────────────────────────
    {
      title: "How we detect them",
      writtenText:
        "We can't see black holes directly, but we can see their effects. The first hint came from theory in 1916. Then X-ray binaries gave us indirect detections. Gravitational waves opened a new window in 2015. And in 2019 the Event Horizon Telescope produced the first actual photograph — of M87* — followed by Sagittarius A* in 2022.",
      spokenText:
        "Black hole detection has gone from theoretical prediction in nineteen sixteen to actual photographs in twenty nineteen. Each new technique reveals a different side of the same object.",
      artifacts: [
        {
          id: "bh-vis-tl",
          type: "visual",
          title: "100 years of black hole detection",
          status: "rendered",
          description: "From Einstein's equations to the first image.",
          style: "timeline",
          svgContent: `<svg viewBox="0 0 320 140" xmlns="http://www.w3.org/2000/svg">
            <line x1="20" y1="70" x2="300" y2="70" stroke="#7c3aed" stroke-width="1.5" opacity="0.25"/>
            <circle cx="40"  cy="70" r="5" fill="#7c3aed" opacity="0.7"/>
            <rect x="6"   y="22" width="68" height="22" rx="4" fill="#7c3aed" opacity="0.12" stroke="#7c3aed" stroke-width="1"/>
            <text x="40"  y="36" text-anchor="middle" font-size="8" fill="#7c3aed" font-weight="600" font-family="system-ui,sans-serif">1916</text>
            <text x="40"  y="46" text-anchor="middle" font-size="6.5" fill="#7c3aed" font-family="system-ui,sans-serif">Schwarzschild</text>
            <line x1="40"  y1="46" x2="40"  y2="65" stroke="#7c3aed" stroke-width="1" opacity="0.3"/>
            <circle cx="110" cy="70" r="5" fill="#0ea5e9" opacity="0.7"/>
            <rect x="76"  y="86" width="68" height="22" rx="4" fill="#0ea5e9" opacity="0.12" stroke="#0ea5e9" stroke-width="1"/>
            <text x="110" y="100" text-anchor="middle" font-size="8" fill="#0ea5e9" font-weight="600" font-family="system-ui,sans-serif">1971</text>
            <text x="110" y="110" text-anchor="middle" font-size="6.5" fill="#0ea5e9" font-family="system-ui,sans-serif">Cygnus X-1</text>
            <line x1="110" y1="75" x2="110" y2="86" stroke="#0ea5e9" stroke-width="1" opacity="0.3"/>
            <circle cx="180" cy="70" r="5" fill="#10b981" opacity="0.7"/>
            <rect x="146" y="22" width="68" height="22" rx="4" fill="#10b981" opacity="0.12" stroke="#10b981" stroke-width="1"/>
            <text x="180" y="36" text-anchor="middle" font-size="8" fill="#10b981" font-weight="600" font-family="system-ui,sans-serif">2015</text>
            <text x="180" y="46" text-anchor="middle" font-size="6.5" fill="#10b981" font-family="system-ui,sans-serif">LIGO merger</text>
            <line x1="180" y1="46" x2="180" y2="65" stroke="#10b981" stroke-width="1" opacity="0.3"/>
            <circle cx="250" cy="70" r="5" fill="#f59e0b" opacity="0.7"/>
            <rect x="216" y="86" width="68" height="22" rx="4" fill="#f59e0b" opacity="0.12" stroke="#f59e0b" stroke-width="1"/>
            <text x="250" y="100" text-anchor="middle" font-size="8" fill="#f59e0b" font-weight="600" font-family="system-ui,sans-serif">2019</text>
            <text x="250" y="110" text-anchor="middle" font-size="6.5" fill="#f59e0b" font-family="system-ui,sans-serif">EHT image M87*</text>
            <line x1="250" y1="75" x2="250" y2="86" stroke="#f59e0b" stroke-width="1" opacity="0.3"/>
            <circle cx="300" cy="70" r="5" fill="#ec4899" opacity="0.7"/>
            <text x="298" y="58" text-anchor="end" font-size="8" fill="#ec4899" font-weight="600" font-family="system-ui,sans-serif">2022</text>
            <text x="298" y="48" text-anchor="end" font-size="6.5" fill="#ec4899" font-family="system-ui,sans-serif">Sgr A*</text>
          </svg>`,
        },
        {
          id: "bh-gr-mass",
          type: "graph",
          title: "M-σ relation: BH mass vs galaxy",
          status: "rendered",
          graph_type: "trend",
          series: [
            {
              label: "Galaxies",
              color: "#7c3aed",
              data: [
                { x: 50,  y: 0.2 },  { x: 70,  y: 0.5 },  { x: 90,  y: 1.1 },
                { x: 110, y: 2.0 },  { x: 130, y: 3.4 },  { x: 150, y: 5.2 },
                { x: 170, y: 7.8 },  { x: 190, y: 11.0 }, { x: 210, y: 16.0 },
                { x: 230, y: 22.0 }, { x: 250, y: 31.0 }, { x: 270, y: 41.0 },
                { x: 290, y: 55.0 }, { x: 310, y: 72.0 }, { x: 330, y: 95.0 },
              ],
            },
          ],
          x_range: [40, 340],
          x_label: "Stellar velocity dispersion σ (km/s)",
          y_label: "BH mass (×10⁸ M☉)",
        },
      ],
      annotations: [
        { kind: "sticky", content: "EHT (2019) — first photo\nLIGO (2015) — first merger heard", anchor: "right", color: "#e9d5ff" },
        { kind: "text",   content: "M–σ relation:\nbigger galaxy ⇒ bigger central BH", anchor: "below", offsetY: -10 },
      ],
    },
  ],
};
