import type { DemoScript } from "../types";

/** ─────────────────────────────────────────────────────────────────────────
 *  Demo 6: Projectile Motion (guided)
 *  5 modules. Hits all required visuals:
 *  - 3D: animated launch with vector decomposition (Module 1)
 *  - Graphs: parametric trajectory + range vs angle with v0 slider (Module 2 & 3)
 *  - Tree: visual.hierarchy of real-world applications (Module 4)
 *  - Simulation: live launcher with adjustable angle/speed (Module 5)
 *  ───────────────────────────────────────────────────────────────────────── */
export const projectileDemo: DemoScript = {
  id: "projectile",
  title: "Projectile Motion",
  description: "From decomposed vectors to a live cannon you can aim.",
  tags: ["3D", "Tree", "Graphs", "Physics"],
  userPrompt: "Walk me through projectile motion from first principles.",
  keywords: ["projectile", "projectile motion", "trajectory"],
  modules: [
    // ─── Module 1: Decompose the launch ──────────────────────────────────
    {
      title: "Decompose the launch",
      writtenText:
        "The whole trick of projectile motion is realizing that horizontal and vertical motion are independent. Decompose the initial velocity into v_x = v₀ cos θ and v_y = v₀ sin θ. Horizontally, nothing pulls on the projectile (ignoring air), so it moves at constant speed. Vertically, gravity pulls down with constant acceleration g. Two simple 1D problems instead of one messy 2D one.",
      spokenText:
        "The key idea: horizontal and vertical motion are independent. Decompose v zero into v_x and v_y, and you've turned a hard 2D problem into two easy 1D ones.",
      artifacts: [
        {
          id: "pj-r3d-launch",
          type: "render3d",
          title: "Launch with velocity components",
          status: "rendered",
          topic: "Projectile launching from origin with decomposed velocity arrows",
          camera_distance: 14,
          bg_color: "#040814",
          code: `
camera.position.set(6, 5, 14);
controls.target.set(4, 2, 0);

// Ground plane
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 12),
  new THREE.MeshPhongMaterial({ color: 0x1a3a5a, transparent: true, opacity: 0.55 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0;
scene.add(ground);

// Grid on the ground
const grid = new THREE.GridHelper(20, 20, 0x4477aa, 0x223044);
scene.add(grid);

// Launch params
const v0 = 10, ang = Math.PI / 4, g = 9.8;
const vx0 = v0 * Math.cos(ang);
const vy0 = v0 * Math.sin(ang);
const flightT = 2 * vy0 / g;
const range = vx0 * flightT;

// Trajectory line — sampled parabola
const trajPts = [];
for (let i = 0; i <= 80; i++) {
  const tt = (i / 80) * flightT;
  trajPts.push(new THREE.Vector3(vx0 * tt, Math.max(0, vy0 * tt - 0.5 * g * tt * tt), 0));
}
const trajLine = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints(trajPts),
  new THREE.LineDashedMaterial({ color: 0xfbbf24, dashSize: 0.3, gapSize: 0.2 })
);
trajLine.computeLineDistances();
scene.add(trajLine);

// Projectile sphere (gets repositioned each frame)
const projMat = new THREE.MeshPhongMaterial({ color: 0xff6699, emissive: 0x441122, shininess: 80 });
const projectile = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 24), projMat);
scene.add(projectile);

// Trail
const trailGeo = new THREE.BufferGeometry();
const trailMax = 80;
const trailPos = new Float32Array(trailMax * 3);
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
const trailLine = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xff99cc, transparent: true, opacity: 0.7 }));
scene.add(trailLine);
let trailIdx = 0;

// Persistent vector arrows at the origin showing v0, v_x, v_y
const arrV0 = new THREE.ArrowHelper(
  new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0),
  new THREE.Vector3(0, 0.05, 0),
  v0 * 0.25,
  0xfbbf24, 0.30, 0.20
);
const arrVx = new THREE.ArrowHelper(
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 0.05, 0),
  vx0 * 0.25,
  0x10b981, 0.25, 0.18
);
const arrVy = new THREE.ArrowHelper(
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0.05, 0),
  vy0 * 0.25,
  0xec4899, 0.25, 0.18
);
scene.add(arrV0); scene.add(arrVx); scene.add(arrVy);

// Range marker on ground
const rangeMarker = new THREE.Mesh(
  new THREE.RingGeometry(0.25, 0.45, 24),
  new THREE.MeshBasicMaterial({ color: 0xff99cc, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
);
rangeMarker.rotation.x = -Math.PI / 2;
rangeMarker.position.set(range, 0.02, 0);
scene.add(rangeMarker);

function update(t) {
  // Loop the launch animation every (flightT + 0.6) seconds
  const cycle = flightT + 0.6;
  const tt = Math.min(t % cycle, flightT);
  const px = vx0 * tt;
  const py = Math.max(0, vy0 * tt - 0.5 * g * tt * tt);
  projectile.position.set(px, py + 0.2, 0);
  // Append to trail
  trailPos[trailIdx*3]   = px;
  trailPos[trailIdx*3+1] = py + 0.2;
  trailPos[trailIdx*3+2] = 0;
  trailIdx = (trailIdx + 1) % trailMax;
  trailGeo.attributes.position.needsUpdate = true;
  trailGeo.setDrawRange(0, trailMax);
}`,
        },
        {
          id: "pj-vis-decomp",
          type: "visual",
          title: "v₀ split into components",
          status: "rendered",
          description: "Yellow = launch, green = horizontal, pink = vertical.",
          style: "diagram",
          svgContent: `<svg viewBox="0 0 280 160" xmlns="http://www.w3.org/2000/svg">
            <line x1="20" y1="130" x2="270" y2="130" stroke="rgba(0,0,0,0.4)" stroke-width="1.2"/>
            <line x1="20" y1="130" x2="20"  y2="20"  stroke="rgba(0,0,0,0.4)" stroke-width="1.2"/>
            <text x="265" y="125" text-anchor="end" font-size="9" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">x →</text>
            <text x="14"  y="22" text-anchor="end" font-size="9" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">y</text>
            <line x1="20" y1="130" x2="170" y2="40" stroke="#fbbf24" stroke-width="2.5"/>
            <polygon points="167,42 175,38 172,46" fill="#fbbf24"/>
            <text x="92" y="78" font-size="10" fill="#fbbf24" font-weight="700" font-family="system-ui,sans-serif">v₀</text>
            <line x1="20" y1="130" x2="170" y2="130" stroke="#10b981" stroke-width="2.2" stroke-dasharray="4 3"/>
            <polygon points="167,127 175,130 167,133" fill="#10b981"/>
            <text x="80" y="146" font-size="10" fill="#10b981" font-weight="700" font-family="system-ui,sans-serif">v_x = v₀ cos θ</text>
            <line x1="170" y1="130" x2="170" y2="40" stroke="#ec4899" stroke-width="2.2" stroke-dasharray="4 3"/>
            <polygon points="167,43 170,35 173,43" fill="#ec4899"/>
            <text x="178" y="88" font-size="10" fill="#ec4899" font-weight="700" font-family="system-ui,sans-serif">v_y = v₀ sin θ</text>
            <path d="M 50 130 A 30 30 0 0 0 41 110" fill="none" stroke="rgba(0,0,0,0.5)" stroke-width="1.2"/>
            <text x="55" y="120" font-size="10" fill="rgba(0,0,0,0.6)" font-weight="600" font-family="system-ui,sans-serif">θ</text>
            <text x="180" y="20" font-size="8.5" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif" font-style="italic">two independent 1D problems</text>
          </svg>`,
        },
      ],
      nextPrompt: "Give me the equations for x(t) and y(t).",
      annotations: [
        { kind: "sticky", content: "vₓ = v₀ cos θ\nvᵧ = v₀ sin θ", anchor: "top-right", color: "#fff7c2" },
        { kind: "text",   content: "Horizontal & vertical\nare INDEPENDENT", anchor: "below", offsetY: -10 },
      ],
    },

    // ─── Module 2: The kinematic equations ───────────────────────────────
    {
      title: "Kinematic equations",
      writtenText:
        "Now apply the standard kinematics to each axis separately. Horizontal: x grows linearly with time, since there's no force. Vertical: y is a parabola, climbing then falling under gravity. Eliminate t between them and you get the trajectory equation y(x) — a perfect parabola.",
      spokenText:
        "Apply standard kinematics to each axis separately. Horizontal is linear, vertical is a parabola. Eliminate time and you get y as a function of x — a parabola.",
      artifacts: [
        {
          id: "pj-nt-x",
          type: "notation",
          title: "Horizontal — constant velocity",
          status: "rendered",
          latex: "x(t) = v_0 \\cos\\theta \\cdot t",
          annotation:
            "No horizontal force (ignoring air), so x grows linearly with time. v_x stays constant for the whole flight.",
        },
        {
          id: "pj-nt-y",
          type: "notation",
          title: "Vertical — constant acceleration",
          status: "rendered",
          latex: "y(t) = v_0 \\sin\\theta \\cdot t - \\tfrac{1}{2} g t^2",
          annotation:
            "Gravity pulls down with g ≈ 9.8 m/s². Vertical velocity decreases, hits zero at the peak, then becomes negative (falling).",
        },
        {
          id: "pj-nt-traj",
          type: "notation",
          title: "Trajectory (eliminate t)",
          status: "rendered",
          latex: "y(x) = x \\tan\\theta - \\frac{g x^2}{2 v_0^2 \\cos^2\\theta}",
          annotation:
            "Solve x = v_x t for t, substitute into y(t). The result is a downward parabola — every projectile path in vacuum is a parabola.",
        },
        {
          id: "pj-gr-traj",
          type: "graph",
          title: "Trajectory under different launch angles",
          status: "rendered",
          graph_type: "parametric",
          series: [
            {
              label: "30°",
              color: "#0ea5e9",
              fn_x: "v0 * Math.cos(Math.PI/6) * t",
              fn:   "Math.max(0, v0 * Math.sin(Math.PI/6) * t - 4.9 * t * t)",
            },
            {
              label: "45°",
              color: "#fbbf24",
              fn_x: "v0 * Math.cos(Math.PI/4) * t",
              fn:   "Math.max(0, v0 * Math.sin(Math.PI/4) * t - 4.9 * t * t)",
            },
            {
              label: "60°",
              color: "#ec4899",
              fn_x: "v0 * Math.cos(Math.PI/3) * t",
              fn:   "Math.max(0, v0 * Math.sin(Math.PI/3) * t - 4.9 * t * t)",
            },
            {
              label: "75°",
              color: "#7c3aed",
              fn_x: "v0 * Math.cos(75 * Math.PI / 180) * t",
              fn:   "Math.max(0, v0 * Math.sin(75 * Math.PI / 180) * t - 4.9 * t * t)",
            },
          ],
          variables: [
            { name: "v0", label: "Initial speed v₀ (m/s)", min: 5, max: 30, step: 1, default: 15 },
          ],
          x_range: [0, 4],
          x_label: "x (m)",
          y_label: "y (m)",
        },
      ],
      nextPrompt: "How do I find the range, max height, and time of flight?",
      annotations: [
        { kind: "sticky", content: "x(t) = v₀ cos θ · t\ny(t) = v₀ sin θ · t − ½ g t²", anchor: "right", color: "#dbeafe" },
        { kind: "text",   content: "Eliminate t →\ny(x) is a parabola", anchor: "below", offsetY: -10 },
      ],
    },

    // ─── Module 3: Range, peak, time-of-flight ───────────────────────────
    {
      title: "Range, peak, time of flight",
      writtenText:
        "The three numbers students always need: how far does it land, how high does it get, and how long is it in the air? All three follow from the equations above. The big surprise is the range formula — it depends on sin(2θ), which is symmetric around 45°. So 30° and 60° give the same range; 45° is optimal (on flat ground).",
      spokenText:
        "Range depends on sine of two theta. Symmetric around forty-five degrees, which is why forty-five is the optimal angle on flat ground. Thirty and sixty get you the same distance.",
      artifacts: [
        {
          id: "pj-nt-range",
          type: "notation",
          title: "Range formula",
          status: "rendered",
          latex: "R = \\frac{v_0^2 \\sin(2\\theta)}{g}",
          annotation:
            "Maximum at θ = 45° because sin(2θ) peaks at 90°. Doubling v₀ quadruples R — speed matters more than angle once you're close to optimal.",
        },
        {
          id: "pj-gr-range",
          type: "graph",
          title: "Range vs launch angle",
          status: "rendered",
          graph_type: "line",
          series: [
            {
              fn: "Math.max(0, (v0*v0/9.8) * Math.sin(2 * x * Math.PI / 180))",
              label: "Range R(θ) (m)",
              color: "#fbbf24",
            },
          ],
          variables: [
            { name: "v0", label: "Initial speed v₀ (m/s)", min: 5, max: 40, step: 1, default: 20 },
          ],
          x_range: [0, 90],
          x_label: "Launch angle θ (°)",
          y_label: "Range (m)",
        },
        {
          id: "pj-vis-cmp",
          type: "visual",
          title: "Vacuum vs reality (with drag)",
          status: "rendered",
          description: "Air resistance kills both height and range — and shifts the optimal angle below 45°.",
          style: "comparison",
          svgContent: `<svg viewBox="0 0 230 150" xmlns="http://www.w3.org/2000/svg">
            <rect x="8"   y="8"  width="102" height="24" rx="5" fill="#10b981" opacity="0.16" stroke="#10b981" stroke-width="1.2"/>
            <text x="59"  y="23" text-anchor="middle" font-size="9" fill="#10b981" font-weight="600" font-family="system-ui,sans-serif">In vacuum</text>
            <rect x="120" y="8"  width="102" height="24" rx="5" fill="#f97316" opacity="0.16" stroke="#f97316" stroke-width="1.2"/>
            <text x="171" y="23" text-anchor="middle" font-size="9" fill="#f97316" font-weight="600" font-family="system-ui,sans-serif">With air drag</text>
            <line x1="0" y1="36" x2="230" y2="36" stroke="rgba(0,0,0,0.06)" stroke-width="1"/>
            <rect x="8"   y="40" width="102" height="20" rx="3" fill="#10b981" opacity="0.05"/>
            <rect x="120" y="40" width="102" height="20" rx="3" fill="#f97316" opacity="0.04"/>
            <text x="14"  y="53" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Path: parabola</text>
            <text x="126" y="53" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Path: skewed (steeper down)</text>
            <rect x="8"   y="64" width="102" height="20" rx="3" fill="#10b981" opacity="0.03"/>
            <rect x="120" y="64" width="102" height="20" rx="3" fill="#f97316" opacity="0.04"/>
            <text x="14"  y="77" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Optimal: θ = 45°</text>
            <text x="126" y="77" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Optimal: ~30-40°</text>
            <rect x="8"   y="88" width="102" height="20" rx="3" fill="#10b981" opacity="0.05"/>
            <rect x="120" y="88" width="102" height="20" rx="3" fill="#f97316" opacity="0.04"/>
            <text x="14"  y="101" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Symmetric ascent/descent</text>
            <text x="126" y="101" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Asymmetric (terminal v)</text>
            <rect x="8"   y="112" width="102" height="20" rx="3" fill="#10b981" opacity="0.03"/>
            <rect x="120" y="112" width="102" height="20" rx="3" fill="#f97316" opacity="0.04"/>
            <text x="14"  y="125" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Range ∝ v₀²</text>
            <text x="126" y="125" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Range grows slower than v₀²</text>
          </svg>`,
        },
      ],
      nextPrompt: "Where does this come up in the real world?",
      annotations: [
        { kind: "sticky", content: "R = v₀² sin(2θ) / g\nMAX at θ = 45°", anchor: "top-right", color: "#fff7c2" },
        { kind: "text",   content: "30° and 60° give the same R\n(symmetry around 45°)", anchor: "below", offsetY: -10 },
      ],
    },

    // ─── Module 4: Where this shows up ───────────────────────────────────
    {
      title: "Where projectile motion shows up",
      writtenText:
        "Once you know the model, you start seeing it everywhere. Sports — basketball arc, football kicks, golf drives. Ballistics — artillery, rifles, archery. Engineering — water fountains, fire-hose trajectories. And in space we generalize the same idea: orbits are 'projectiles' that go fast enough to keep missing the ground.",
      spokenText:
        "Projectile motion shows up everywhere — sports, ballistics, engineering, and even orbital mechanics. The same parabola governs them all, just with different scales.",
      artifacts: [
        {
          id: "pj-vis-tree",
          type: "visual",
          title: "Applications of projectile motion",
          status: "rendered",
          description: "Same physics, four very different scales.",
          style: "hierarchy",
          svgContent: `<svg viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg">
            <rect x="100" y="6" width="120" height="26" rx="6" fill="#fbbf24" opacity="0.22" stroke="#fbbf24" stroke-width="1.5"/>
            <text x="160" y="23" text-anchor="middle" font-size="10" fill="#a16207" font-weight="700" font-family="system-ui,sans-serif">Projectile motion</text>
            <line x1="160" y1="32" x2="40"  y2="58" stroke="#fbbf24" stroke-width="1" opacity="0.4"/>
            <line x1="160" y1="32" x2="120" y2="58" stroke="#fbbf24" stroke-width="1" opacity="0.4"/>
            <line x1="160" y1="32" x2="200" y2="58" stroke="#fbbf24" stroke-width="1" opacity="0.4"/>
            <line x1="160" y1="32" x2="280" y2="58" stroke="#fbbf24" stroke-width="1" opacity="0.4"/>

            <rect x="6"   y="58" width="68" height="22" rx="4" fill="#0ea5e9" opacity="0.14" stroke="#0ea5e9" stroke-width="1"/>
            <text x="40"  y="72" text-anchor="middle" font-size="8.5" fill="#0ea5e9" font-weight="600" font-family="system-ui,sans-serif">Sports</text>
            <rect x="86"  y="58" width="68" height="22" rx="4" fill="#10b981" opacity="0.14" stroke="#10b981" stroke-width="1"/>
            <text x="120" y="72" text-anchor="middle" font-size="8.5" fill="#10b981" font-weight="600" font-family="system-ui,sans-serif">Ballistics</text>
            <rect x="166" y="58" width="68" height="22" rx="4" fill="#7c3aed" opacity="0.14" stroke="#7c3aed" stroke-width="1"/>
            <text x="200" y="72" text-anchor="middle" font-size="8.5" fill="#7c3aed" font-weight="600" font-family="system-ui,sans-serif">Engineering</text>
            <rect x="246" y="58" width="68" height="22" rx="4" fill="#ec4899" opacity="0.14" stroke="#ec4899" stroke-width="1"/>
            <text x="280" y="72" text-anchor="middle" font-size="8.5" fill="#ec4899" font-weight="600" font-family="system-ui,sans-serif">Space</text>

            <line x1="40"  y1="80" x2="40"  y2="102" stroke="#0ea5e9" stroke-width="1" opacity="0.3"/>
            <line x1="120" y1="80" x2="120" y2="102" stroke="#10b981" stroke-width="1" opacity="0.3"/>
            <line x1="200" y1="80" x2="200" y2="102" stroke="#7c3aed" stroke-width="1" opacity="0.3"/>
            <line x1="280" y1="80" x2="280" y2="102" stroke="#ec4899" stroke-width="1" opacity="0.3"/>

            <rect x="6"   y="102" width="68" height="20" rx="4" fill="#0ea5e9" opacity="0.07" stroke="#0ea5e9" stroke-width="0.7"/>
            <text x="40"  y="115" text-anchor="middle" font-size="7.5" fill="#0ea5e9" font-family="system-ui,sans-serif">Basketball arc</text>
            <rect x="6"   y="124" width="68" height="20" rx="4" fill="#0ea5e9" opacity="0.07" stroke="#0ea5e9" stroke-width="0.7"/>
            <text x="40"  y="137" text-anchor="middle" font-size="7.5" fill="#0ea5e9" font-family="system-ui,sans-serif">Football punts</text>
            <rect x="6"   y="146" width="68" height="20" rx="4" fill="#0ea5e9" opacity="0.07" stroke="#0ea5e9" stroke-width="0.7"/>
            <text x="40"  y="159" text-anchor="middle" font-size="7.5" fill="#0ea5e9" font-family="system-ui,sans-serif">Golf drives</text>
            <rect x="6"   y="168" width="68" height="20" rx="4" fill="#0ea5e9" opacity="0.07" stroke="#0ea5e9" stroke-width="0.7"/>
            <text x="40"  y="181" text-anchor="middle" font-size="7.5" fill="#0ea5e9" font-family="system-ui,sans-serif">Long jump</text>

            <rect x="86"  y="102" width="68" height="20" rx="4" fill="#10b981" opacity="0.07" stroke="#10b981" stroke-width="0.7"/>
            <text x="120" y="115" text-anchor="middle" font-size="7.5" fill="#10b981" font-family="system-ui,sans-serif">Artillery aim</text>
            <rect x="86"  y="124" width="68" height="20" rx="4" fill="#10b981" opacity="0.07" stroke="#10b981" stroke-width="0.7"/>
            <text x="120" y="137" text-anchor="middle" font-size="7.5" fill="#10b981" font-family="system-ui,sans-serif">Rifle ballistics</text>
            <rect x="86"  y="146" width="68" height="20" rx="4" fill="#10b981" opacity="0.07" stroke="#10b981" stroke-width="0.7"/>
            <text x="120" y="159" text-anchor="middle" font-size="7.5" fill="#10b981" font-family="system-ui,sans-serif">Archery</text>
            <rect x="86"  y="168" width="68" height="20" rx="4" fill="#10b981" opacity="0.07" stroke="#10b981" stroke-width="0.7"/>
            <text x="120" y="181" text-anchor="middle" font-size="7.5" fill="#10b981" font-family="system-ui,sans-serif">Trebuchets</text>

            <rect x="166" y="102" width="68" height="20" rx="4" fill="#7c3aed" opacity="0.07" stroke="#7c3aed" stroke-width="0.7"/>
            <text x="200" y="115" text-anchor="middle" font-size="7.5" fill="#7c3aed" font-family="system-ui,sans-serif">Fountains</text>
            <rect x="166" y="124" width="68" height="20" rx="4" fill="#7c3aed" opacity="0.07" stroke="#7c3aed" stroke-width="0.7"/>
            <text x="200" y="137" text-anchor="middle" font-size="7.5" fill="#7c3aed" font-family="system-ui,sans-serif">Fire-hose reach</text>
            <rect x="166" y="146" width="68" height="20" rx="4" fill="#7c3aed" opacity="0.07" stroke="#7c3aed" stroke-width="0.7"/>
            <text x="200" y="159" text-anchor="middle" font-size="7.5" fill="#7c3aed" font-family="system-ui,sans-serif">Crane payloads</text>
            <rect x="166" y="168" width="68" height="20" rx="4" fill="#7c3aed" opacity="0.07" stroke="#7c3aed" stroke-width="0.7"/>
            <text x="200" y="181" text-anchor="middle" font-size="7.5" fill="#7c3aed" font-family="system-ui,sans-serif">Conveyor drops</text>

            <rect x="246" y="102" width="68" height="20" rx="4" fill="#ec4899" opacity="0.07" stroke="#ec4899" stroke-width="0.7"/>
            <text x="280" y="115" text-anchor="middle" font-size="7.5" fill="#ec4899" font-family="system-ui,sans-serif">Orbits = falling</text>
            <rect x="246" y="124" width="68" height="20" rx="4" fill="#ec4899" opacity="0.07" stroke="#ec4899" stroke-width="0.7"/>
            <text x="280" y="137" text-anchor="middle" font-size="7.5" fill="#ec4899" font-family="system-ui,sans-serif">Launch windows</text>
            <rect x="246" y="146" width="68" height="20" rx="4" fill="#ec4899" opacity="0.07" stroke="#ec4899" stroke-width="0.7"/>
            <text x="280" y="159" text-anchor="middle" font-size="7.5" fill="#ec4899" font-family="system-ui,sans-serif">Re-entry paths</text>
            <rect x="246" y="168" width="68" height="20" rx="4" fill="#ec4899" opacity="0.07" stroke="#ec4899" stroke-width="0.7"/>
            <text x="280" y="181" text-anchor="middle" font-size="7.5" fill="#ec4899" font-family="system-ui,sans-serif">Lunar landings</text>

            <text x="160" y="208" text-anchor="middle" font-size="7" fill="rgba(0,0,0,0.45)" font-family="system-ui,sans-serif" font-style="italic">Newton's insight: an orbit is just a projectile that keeps missing the Earth.</text>
          </svg>`,
        },
      ],
      nextPrompt: "Let me play with a live launcher.",
      annotations: [
        { kind: "sticky", content: "Orbit = projectile that\nkeeps missing the ground\n— Newton", anchor: "right", color: "#e9d5ff" },
      ],
    },

    // ─── Module 5: Live launcher ─────────────────────────────────────────
    {
      title: "Live launcher",
      writtenText:
        "Try it yourself. Aim the cannon by dragging the angle slider, set the muzzle velocity, and fire. Watch the parabola unfold and check the predicted vs measured range. Then sweep the angle to confirm 45° really is optimal — or try toggling the air-drag switch to see how that breaks the symmetry.",
      spokenText:
        "Try it yourself. Aim the cannon, set the speed, and fire. Sweep the angle and watch how the range changes. Forty-five degrees gives you the maximum.",
      artifacts: [
        {
          id: "pj-sim-cannon",
          type: "simulation",
          title: "Aim & fire",
          status: "rendered",
          topic: "Interactive cannon with adjustable angle and speed; shows live trajectory and range",
          code: `<!DOCTYPE html><html><head><style>
*{margin:0;padding:0;box-sizing:border-box;font-family:Inter,system-ui,sans-serif}
body{background:#0a0b14;color:#fff;display:flex;flex-direction:column;height:100vh;padding:12px;gap:8px}
canvas{background:#040814;border-radius:8px;flex:1}
.row{display:flex;gap:14px;align-items:center;font-size:12px;color:#9aa0c4;flex-wrap:wrap}
.row label{color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.05em;font-size:10px;margin-right:4px}
input[type=range]{accent-color:#fbbf24}
.stat{font-family:'JetBrains Mono',monospace;color:#fbbf24}
button{background:#fbbf24;color:#000;border:0;border-radius:6px;padding:6px 14px;cursor:pointer;font-size:12px;font-weight:700}
button:active{transform:scale(0.97)}
.toggle{cursor:pointer;user-select:none;padding:4px 10px;border-radius:6px;background:#15172a;border:1px solid #2a2f4d;color:#9aa0c4;font-size:11px}
.toggle.on{background:#7c3aed;color:#fff;border-color:#7c3aed}
</style></head><body>
<div class="row">
  <div><label>Angle</label><input id="ang" type="range" min="5" max="85" value="45" step="1" style="width:140px"/> <span class="stat" id="angV">45°</span></div>
  <div><label>Speed</label><input id="spd" type="range" min="5" max="40" value="20" step="1" style="width:140px"/> <span class="stat" id="spdV">20 m/s</span></div>
  <div class="toggle" id="dragT">Air drag: OFF</div>
  <button id="fire">▶ Fire</button>
  <div style="margin-left:auto"><span class="stat">Predicted: <span id="pred">…</span> m</span></div>
</div>
<canvas id="cv" width="640" height="320"></canvas>
<div class="row">
  <span class="stat">Last shot: <span id="last">—</span></span>
  <span class="stat">Peak height: <span id="peak">—</span></span>
  <span class="stat">Time of flight: <span id="tof">—</span></span>
</div>
<script>
const cv=document.getElementById('cv'),ctx=cv.getContext('2d');
const W=cv.width,H=cv.height;
const groundY=H-30, originX=60, scale=8;
let active=null;
let drag=false;
let trails=[];

function predicted(){
  const a=+document.getElementById('ang').value*Math.PI/180;
  const v=+document.getElementById('spd').value;
  const R=v*v*Math.sin(2*a)/9.8;
  document.getElementById('pred').textContent=R.toFixed(1);
}
function fire(){
  const a=+document.getElementById('ang').value*Math.PI/180;
  const v=+document.getElementById('spd').value;
  active={t:0,vx0:v*Math.cos(a),vy0:v*Math.sin(a),trail:[],color:'hsl('+(Math.random()*360)+',80%,65%)',drag:drag,vx:v*Math.cos(a),vy:v*Math.sin(a),x:0,y:0,peak:0};
  trails.push(active);
  if(trails.length>5)trails.shift();
}
function step(p,dt){
  if(p.drag){
    const k=0.05;
    const sp=Math.hypot(p.vx,p.vy);
    p.vx-=k*p.vx*sp*dt;
    p.vy-=(9.8+k*p.vy*sp)*dt;
  } else {
    p.vy-=9.8*dt;
  }
  p.x+=p.vx*dt;
  p.y+=p.vy*dt;
  p.peak=Math.max(p.peak,p.y);
  p.trail.push([p.x,p.y]);
  p.t+=dt;
}
function draw(){
  ctx.fillStyle='#040814';ctx.fillRect(0,0,W,H);
  // Grid
  ctx.strokeStyle='rgba(124,58,237,0.06)';
  for(let x=0;x<W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,groundY);ctx.stroke();}
  for(let y=0;y<groundY;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
  // Ground
  ctx.fillStyle='#1a3a5a';ctx.fillRect(0,groundY,W,H-groundY);
  // Cannon
  const a=+document.getElementById('ang').value*Math.PI/180;
  ctx.save();
  ctx.translate(originX,groundY);
  ctx.rotate(-a);
  ctx.fillStyle='#666';ctx.fillRect(0,-6,46,12);
  ctx.fillStyle='#888';ctx.fillRect(40,-7,8,14);
  ctx.restore();
  // Cannon base
  ctx.fillStyle='#444';ctx.beginPath();ctx.arc(originX,groundY,12,0,6.28);ctx.fill();
  // Trails
  for(const tr of trails){
    ctx.strokeStyle=tr.color;ctx.lineWidth=1.6;
    ctx.beginPath();
    for(let i=0;i<tr.trail.length;i++){
      const sx=originX+tr.trail[i][0]*scale;
      const sy=groundY-tr.trail[i][1]*scale;
      if(i===0)ctx.moveTo(sx,sy);else ctx.lineTo(sx,sy);
    }
    ctx.stroke();
    if(active===tr && tr.y>=0){
      const sx=originX+tr.x*scale,sy=groundY-tr.y*scale;
      ctx.fillStyle=tr.color;ctx.beginPath();ctx.arc(sx,sy,4,0,6.28);ctx.fill();
    }
  }
  // Predicted range marker
  predicted();
  const R=+document.getElementById('pred').textContent;
  if(!isNaN(R)){
    const mx=originX+R*scale;
    ctx.strokeStyle='rgba(251,191,36,0.5)';ctx.lineWidth=1;ctx.setLineDash([4,3]);
    ctx.beginPath();ctx.moveTo(mx,groundY-12);ctx.lineTo(mx,groundY+12);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle='rgba(251,191,36,0.85)';ctx.font='10px JetBrains Mono,monospace';ctx.fillText(R.toFixed(0)+'m',mx-10,groundY+24);
  }
}
let last=performance.now();
function loop(now){
  const dt=Math.min(0.04,(now-last)/1000);
  last=now;
  if(active){
    step(active,dt*0.7);
    if(active.y<=0 && active.t>0.05){
      document.getElementById('last').textContent=active.x.toFixed(1)+' m';
      document.getElementById('peak').textContent=active.peak.toFixed(1)+' m';
      document.getElementById('tof').textContent=active.t.toFixed(2)+' s';
      active=null;
    }
  }
  draw();
  requestAnimationFrame(loop);
}
document.getElementById('ang').addEventListener('input',()=>{document.getElementById('angV').textContent=document.getElementById('ang').value+'°';predicted();});
document.getElementById('spd').addEventListener('input',()=>{document.getElementById('spdV').textContent=document.getElementById('spd').value+' m/s';predicted();});
document.getElementById('fire').addEventListener('click',fire);
document.getElementById('dragT').addEventListener('click',()=>{
  drag=!drag;
  const t=document.getElementById('dragT');
  t.textContent='Air drag: '+(drag?'ON':'OFF');
  t.classList.toggle('on',drag);
});
predicted();
requestAnimationFrame(loop);
<\/script></body></html>`,
        },
      ],
      annotations: [
        { kind: "sticky", content: "Sweep the angle —\n45° wins on flat ground!", anchor: "right", color: "#fff7c2" },
        { kind: "text",   content: "Toggle air drag\n→ symmetry breaks", anchor: "below", offsetY: -10 },
      ],
    },
  ],
};
