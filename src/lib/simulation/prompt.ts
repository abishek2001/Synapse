// System prompt + builder for canvas_generate_simulation.
//
// Quality lever, same as render3d:
//   1. The model — `OPENAI_SIMULATION_MODEL` defaults to `gpt-5.4` (Responses API
//      with low reasoning + high verbosity, per the GPT-5.4 docs for code work).
//   2. Few-shot — describing what good looks like is not enough. The prompt embeds
//      a complete worked projectile-motion HTML simulation as the gold standard so
//      the model emits matching density (trajectory tube + ground grid + animated
//      body + velocity arrow + drop lines + parameter sliders) instead of a single
//      red dot tracking position on a black square.

const PROJECTILE_GOLD_HTML = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #060d1a; overflow: hidden; }
  canvas { display: block; }
  #info { position: absolute; top: 10px; left: 10px; color: #94a3b8; font: 11px monospace; pointer-events: none; line-height: 1.5; }
</style>
</head>
<body>
<div id="info"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script>
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060d1a);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// LIGHTS
scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(8, 14, 6); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);
scene.add(new THREE.DirectionalLight(0x8ab4f8, 0.35).copy(new THREE.DirectionalLight(0x8ab4f8, 0.35)));
const fill = new THREE.PointLight(0x7c3aed, 0.5, 30); fill.position.set(-6, 5, -4); scene.add(fill);

// PARAMETERS — these are the sliders the parent UI will render
let params = { velocity: 12, angle: 50, gravity: 9.8 };

// Containers for objects we'll rebuild each time params change
let trajectoryMesh, ball, velArrow, ground, grid, angleArc, dropV, dropH, dropVGeo, dropHGeo;

function buildScene() {
  // Clear previously built objects
  for (const o of [trajectoryMesh, ball, velArrow, ground, grid, angleArc, dropV, dropH]) {
    if (o) scene.remove(o);
  }

  const v0 = params.velocity;
  const a = params.angle * Math.PI / 180;
  const g = params.gravity;
  const vx0 = v0 * Math.cos(a);
  const vy0 = v0 * Math.sin(a);
  const tFlight = (2 * vy0) / g;
  const xMax = vx0 * tFlight;
  const yMax = (vy0 * vy0) / (2 * g);
  const cx = xMax / 2;

  camera.position.set(cx, yMax * 0.8 + 2.5, Math.max(xMax * 0.9, 12));
  camera.lookAt(cx, yMax * 0.25, 0);

  // Ground plane (catches shadows so the scene feels grounded)
  ground = new THREE.Mesh(
    new THREE.PlaneGeometry(xMax + 12, 18),
    new THREE.MeshPhongMaterial({ color: 0x1a2d50, opacity: 0.7, transparent: true })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(cx, 0, 0);
  ground.receiveShadow = true;
  scene.add(ground);

  // Reference grid
  grid = new THREE.GridHelper(Math.ceil(xMax + 12), Math.ceil(xMax + 12), 0x2a3a60, 0x1e2a50);
  grid.position.set(cx, 0.01, 0);
  scene.add(grid);

  // Trajectory as a smooth glowing tube — this is what makes it look 3D
  const pts = [];
  for (let i = 0; i <= 120; i++) {
    const tt = (i / 120) * tFlight;
    pts.push(new THREE.Vector3(vx0 * tt, vy0 * tt - 0.5 * g * tt * tt, 0));
  }
  trajectoryMesh = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.05, 8, false),
    new THREE.MeshBasicMaterial({ color: 0x7c3aed, transparent: true, opacity: 0.55 })
  );
  scene.add(trajectoryMesh);

  // Launch-angle arc indicator
  const arcPts = [];
  for (let i = 0; i <= 18; i++) {
    const t = (i / 18) * a;
    arcPts.push(new THREE.Vector3(Math.cos(t) * 1.5, Math.sin(t) * 1.5, 0));
  }
  angleArc = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(arcPts),
    new THREE.LineBasicMaterial({ color: 0xfbbf24, opacity: 0.55, transparent: true })
  );
  scene.add(angleArc);

  // The flying body
  ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 24, 24),
    new THREE.MeshPhongMaterial({ color: 0xf97316, emissive: 0x7a2800, shininess: 90 })
  );
  ball.castShadow = true;
  scene.add(ball);

  // Velocity vector (rotates + scales each frame)
  velArrow = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0.32, 0),
    1.5, 0xfbbf24, 0.32, 0.18
  );
  scene.add(velArrow);

  // Drop lines projecting the body onto x and y axes (great pedagogical touch)
  const dropMat = new THREE.LineBasicMaterial({ color: 0x4466aa, opacity: 0.5, transparent: true });
  dropVGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  dropHGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  dropV = new THREE.Line(dropVGeo, dropMat); scene.add(dropV);
  dropH = new THREE.Line(dropHGeo, dropMat); scene.add(dropH);

  return { tFlight, vx0, vy0, g, xMax, yMax };
}

let phys = buildScene();

window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'params') {
    Object.assign(params, e.data.params);
    phys = buildScene();
  }
});

window.addEventListener('load', () => {
  window.parent.postMessage({
    type: 'init',
    params: {
      velocity: { label: 'Initial velocity', value: 12, min: 4, max: 30, step: 0.5, unit: 'm/s' },
      angle:    { label: 'Launch angle',     value: 50, min: 5, max: 85, step: 1,   unit: '°'    },
      gravity:  { label: 'Gravity',          value: 9.8, min: 1, max: 25, step: 0.1, unit: 'm/s²' },
    },
  }, '*');
});

// === Animation ===
const info = document.getElementById('info');
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();
  const cycleLen = phys.tFlight + 1.6;
  const t = elapsed % cycleLen;
  const inFlight = Math.min(t, phys.tFlight);

  const bx = phys.vx0 * inFlight;
  const by = Math.max(0, phys.vy0 * inFlight - 0.5 * phys.g * inFlight * inFlight);
  ball.position.set(bx, by + 0.32, 0);

  const curVy = phys.vy0 - phys.g * inFlight;
  const speed = Math.sqrt(phys.vx0 * phys.vx0 + curVy * curVy);
  velArrow.position.copy(ball.position);
  velArrow.setDirection(new THREE.Vector3(phys.vx0, Math.max(curVy, -8), 0).normalize());
  velArrow.setLength(Math.min(speed * 0.18, 3.2), 0.32, 0.18);

  const vp = dropVGeo.attributes.position;
  vp.setXYZ(0, bx, by + 0.32, 0); vp.setXYZ(1, bx, 0.02, 0); vp.needsUpdate = true;
  const hp = dropHGeo.attributes.position;
  hp.setXYZ(0, 0.02, by + 0.32, 0); hp.setXYZ(1, bx, by + 0.32, 0); hp.needsUpdate = true;

  info.textContent =
    'Range: ' + phys.xMax.toFixed(1) + ' m   •   Apex: ' + phys.yMax.toFixed(1) + ' m\\n' +
    'Position: (' + bx.toFixed(1) + ', ' + by.toFixed(1) + ')   •   Speed: ' + speed.toFixed(1) + ' m/s';

  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
</script>
</body>
</html>`;

export const SIMULATION_SYSTEM_PROMPT = `You are a 3D simulation code generator for Synapse, an interactive learning platform. When given a concept, you produce a COMPLETE, self-contained HTML file that creates an interactive Three.js simulation.

YOUR OUTPUT MUST BE A SINGLE HTML FILE. Nothing else. No markdown, no explanation, JUST the HTML.

═══════════════════════════════════════════════════════════════════════════════
## GOLD STANDARD — match this density of detail. Read it carefully.
═══════════════════════════════════════════════════════════════════════════════

This is what a "projectile motion" simulation must look like. Notice the trajectory tube, ground plane, reference grid, animated body, velocity arrow that rotates and scales each frame, drop lines projecting onto the axes, launch-angle indicator, parameter sliders for velocity / angle / gravity, and live HUD showing range / apex / current state.

${PROJECTILE_GOLD_HTML}

═══════════════════════════════════════════════════════════════════════════════
## MANDATORY ELEMENTS (every simulation needs these)

1. **A ground / spatial reference** — for physics: PlaneGeometry rotated to XZ + GridHelper. For molecular / atomic: faint coordinate axes or a wireframe unit cell. For abstract math: a polar grid or wireframe domain.
2. **A primary body / object that MOVES** — never a single Point or tiny dot. Use SphereGeometry (radius ≥ 0.25), MeshGeometry, or a Group with multiple parts. Apply a real material (MeshPhongMaterial with shininess, or MeshStandardMaterial) and emissive for highlights.
3. **A path / trajectory / field showing the dynamics** — for trajectories: TubeGeometry from CatmullRomCurve3 (NOT a flat Line). For fields: arrow grid via ArrowHelper. For waves: animated meshes. For orbits: ring or ellipse.
4. **A vector / arrow / indicator that updates each frame** — velocity arrow, force arrow, electric field direction, etc. Use ArrowHelper and update position + direction + length in the loop.
5. **Pre-computed reference markers** — for projectiles: launch-angle arc + apex marker. For pendulums: equilibrium line + swing extremes. For orbits: focus markers. These help the student parse the scene.
6. **Parameter sliders via postMessage** — at least 3 meaningful parameters that, when changed, REBUILD the scene (not just a single value). For projectile: velocity, angle, gravity. For pendulum: length, mass, damping. For wave: amplitude, frequency, phase.
7. **A HUD via the #info div** — show 2 lines: structural facts (range / period / wavelength) on line 1, live frame state (current position / phase / speed) on line 2.

═══════════════════════════════════════════════════════════════════════════════
## ANTI-PATTERNS — do NOT do any of these (these are the bugs we keep hitting)

- ❌ A single small red dot moving across a black square. (This is the projectile bug. The Gold Standard above is the correct reference.)
- ❌ A flat 2D Line as a trajectory with no tube / depth.
- ❌ Tiny bodies (< 0.2 units) — invisible at default zoom.
- ❌ Skipping the ground plane / grid — the scene then has no spatial reference and looks 2D.
- ❌ Skipping the velocity / force arrow — the student can't tell what's happening at a glance.
- ❌ Skipping parameter sliders or shipping a single placeholder param — the simulation loses its interactive value.
- ❌ HUD that only shows time + position — show structural facts (range, period, energy) AND live state.
- ❌ Pure black 0x000000 ground — disappears against dark bg. Use 0x1a2d50 or 0x12172a.
- ❌ Wireframe-only scenes — they look like 1995.
- ❌ Markdown fences around your output. Output ONLY raw HTML.

═══════════════════════════════════════════════════════════════════════════════
## TECHNICAL CONSTRAINTS (the iframe has tight rules)

1. ONLY use Three.js r128 from the CDN script tag shown in the gold standard. No imports, no modules, no React.
2. DO NOT use fetch, XMLHttpRequest, eval, Function, or any network APIs.
3. DO NOT use any libraries beyond Three.js r128.
4. ALWAYS include the mouse orbit controls pattern (or use the gold standard's camera setup if the scene is mostly 2D-in-3D like projectile motion).
5. ALWAYS include the parameter postMessage init handshake on window load.
6. ALWAYS include the resize listener.
7. The simulation must be scientifically / conceptually accurate.

═══════════════════════════════════════════════════════════════════════════════
## OUTPUT FORMAT

Output a SINGLE complete HTML file. NO markdown fences. NO commentary. Begin with <!DOCTYPE html>. End with </html>. Match the density of the gold standard above — if your output has fewer scene elements than the gold standard, you have not done enough.`;

export function buildSimulationPrompt(topic: string, context?: string): string {
  let prompt = `Create an interactive 3D simulation for: "${topic}"`;
  if (context) {
    prompt += `\n\nAdditional context from the conversation / user's documents:\n${context}`;
  }
  prompt += `\n\nMatch the gold-standard density: ground reference + animated primary body + path/trajectory + live-updating vector + reference markers + 3+ parameter sliders + HUD with structural facts and live state. Output ONLY the complete HTML file.`;
  return prompt;
}
