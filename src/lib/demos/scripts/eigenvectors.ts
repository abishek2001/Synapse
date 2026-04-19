import type { DemoScript } from "../types";

/** ─────────────────────────────────────────────────────────────────────────
 *  Demo 2: Eigenvectors & Eigenvalues
 *  4 modules. Hits all required visuals:
 *  - 3D: cube transformed by a 3x3 matrix (Module 1)
 *  - Graphs: parametric circle-to-ellipse mapping, line of eigenvalues (Module 2 & 4)
 *  - Tree: visual.hierarchy of eigendecomposition applications (Module 3)
 *  ───────────────────────────────────────────────────────────────────────── */
export const eigenvectorsDemo: DemoScript = {
  id: "eigenvectors",
  title: "Eigenvectors & Eigenvalues",
  description: "Geometric intuition, applications, and a live 2x2 explorer.",
  tags: ["3D", "Tree", "Math"],
  userPrompt: "Teach me eigenvectors and eigenvalues like I'm rusty.",
  modules: [
    // ─── Module 1: Vectors as transformations ────────────────────────────
    {
      title: "Vectors as transformations",
      writtenText:
        "A matrix A is a function on space — it stretches, rotates, and shears every vector. Most vectors point in a new direction after the transformation. But a special set — the eigenvectors — keep their direction. They only get scaled, by a factor called the eigenvalue.",
      spokenText:
        "A matrix is a function on space. Eigenvectors are the special directions that don't get rotated — they only get scaled by their eigenvalue.",
      artifacts: [
        {
          id: "ev-nt-eq",
          type: "notation",
          title: "The defining equation",
          status: "rendered",
          latex: "A\\mathbf{v} = \\lambda\\mathbf{v}",
          annotation:
            "v is an eigenvector of A; λ is its eigenvalue. Read it as: 'A acting on v just stretches v by λ — same direction, new length.'",
        },
        {
          id: "ev-r3d-cube",
          type: "render3d",
          title: "Matrix transforming a cube",
          status: "rendered",
          topic: "3x3 matrix shearing a unit cube; eigenvectors highlighted",
          camera_distance: 6,
          bg_color: "#06070f",
          code: `
camera.position.set(3, 2.5, 5.5);
controls.target.set(0, 0, 0);

// Axes
const axes = new THREE.AxesHelper(2);
scene.add(axes);

// Original cube — wireframe ghost
const orig = new THREE.Mesh(
  new THREE.BoxGeometry(1.4, 1.4, 1.4),
  new THREE.MeshBasicMaterial({ color: 0x4444aa, wireframe: true, transparent: true, opacity: 0.45 })
);
scene.add(orig);

// Transformed cube — shiny solid that morphs every cycle
const transGeo = new THREE.BoxGeometry(1.4, 1.4, 1.4);
const transMesh = new THREE.Mesh(
  transGeo,
  new THREE.MeshPhongMaterial({ color: 0x7c3aed, transparent: true, opacity: 0.65, shininess: 80 })
);
scene.add(transMesh);

// Highlighted eigenvector arrows (3 axes-aligned eigenvectors for a diag matrix)
const eigColors = [0xfbbf24, 0x10b981, 0xec4899];
const eigArrows = [];
for (let i = 0; i < 3; i++) {
  const dir = new THREE.Vector3(i===0?1:0, i===1?1:0, i===2?1:0);
  const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(0,0,0), 1.8, eigColors[i], 0.18, 0.10);
  scene.add(arrow);
  eigArrows.push(arrow);
}

// Grid plane
const grid = new THREE.GridHelper(8, 16, 0x2a3a60, 0x1e2a50);
grid.position.y = -1.3;
scene.add(grid);

function update(t) {
  // Smoothly cycle the matrix — shear factor on x, scale on y, rotation on z
  const s = Math.sin(t * 0.6) * 0.4 + 1.0; // 0.6 → 1.4 scale on y
  const sh = Math.sin(t * 0.4) * 0.5;       // shear x by amount
  const rz = Math.sin(t * 0.3) * 0.3;       // small rotation

  transMesh.scale.set(1.0, s, 1.0);
  transMesh.rotation.set(0, 0, rz);
  transMesh.position.x = sh * 0.4;

  // Pulse the eigenvector arrows so they're easy to spot
  for (let i = 0; i < eigArrows.length; i++) {
    const pulse = 1.6 + Math.sin(t * 1.2 + i) * 0.25;
    eigArrows[i].setLength(pulse, 0.18, 0.10);
  }
}`,
        },
      ],
    },

    // ─── Module 2: Finding them ──────────────────────────────────────────
    {
      title: "Finding eigenvalues",
      writtenText:
        "To find the eigenvalues, you solve the characteristic equation: the determinant of A minus λ times the identity equals zero. The roots of this polynomial are the eigenvalues. Geometrically, this looks for directions where the matrix's transformation collapses to a scaling.",
      spokenText:
        "Eigenvalues come from the characteristic polynomial — the determinant of A minus lambda I equals zero. Each root is one eigenvalue.",
      artifacts: [
        {
          id: "ev-nt-char",
          type: "notation",
          title: "Characteristic polynomial",
          status: "rendered",
          latex: "\\det(A - \\lambda I) = 0",
          annotation:
            "For an n×n matrix this is a degree-n polynomial. Its n roots (counted with multiplicity) are the eigenvalues.",
        },
        {
          id: "ev-gr-param",
          type: "graph",
          title: "Unit circle under a 2x2 matrix",
          status: "rendered",
          graph_type: "parametric",
          series: [
            {
              label: "Original circle",
              color: "#7c3aed",
              fn_x: "Math.cos(t)",
              fn: "Math.sin(t)",
              style: "dashed",
            },
            {
              label: "Transformed (ellipse)",
              color: "#f59e0b",
              fn_x: "a * Math.cos(t) + b * Math.sin(t)",
              fn: "c * Math.cos(t) + d * Math.sin(t)",
            },
          ],
          variables: [
            { name: "a", label: "A[1,1]", min: -2, max: 3, step: 0.1, default: 2 },
            { name: "b", label: "A[1,2]", min: -2, max: 2, step: 0.1, default: 0.6 },
            { name: "c", label: "A[2,1]", min: -2, max: 2, step: 0.1, default: 0.4 },
            { name: "d", label: "A[2,2]", min: -2, max: 3, step: 0.1, default: 1.5 },
          ],
          x_range: [0, 6.283],
          x_label: "x",
          y_label: "y",
        },
        {
          id: "ev-fc-tricks",
          type: "flashcard",
          title: "Quick recall",
          status: "rendered",
          cards: [
            {
              front: "Sum of eigenvalues equals…",
              back: "the trace of A (sum of diagonal entries).",
            },
            {
              front: "Product of eigenvalues equals…",
              back: "the determinant of A.",
            },
            {
              front: "Symmetric matrix eigenvectors are…",
              back: "orthogonal to each other (and the eigenvalues are real).",
            },
          ],
        },
      ],
    },

    // ─── Module 3: Where this shows up ───────────────────────────────────
    {
      title: "Where eigendecomposition shows up",
      writtenText:
        "Eigendecomposition isn't just an algebra exercise — it's the engine behind a huge fraction of applied math and machine learning. Once you can decompose a transformation into independent stretching axes, problems collapse from coupled and messy to diagonal and trivial.",
      spokenText:
        "Eigendecomposition powers PCA, search ranking, quantum mechanics, and structural engineering. Once you find the eigen-axes, hard problems become diagonal and easy.",
      artifacts: [
        {
          id: "ev-vis-tree",
          type: "visual",
          title: "Applications, by field",
          status: "rendered",
          description: "Where the same trick keeps showing up.",
          style: "hierarchy",
          svgContent: `<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">
            <rect x="110" y="6" width="100" height="26" rx="6" fill="#7c3aed" opacity="0.18" stroke="#7c3aed" stroke-width="1.5"/>
            <text x="160" y="23" text-anchor="middle" font-size="10" fill="#7c3aed" font-weight="700" font-family="system-ui,sans-serif">Eigendecomposition</text>
            <line x1="160" y1="32" x2="40"  y2="58" stroke="#7c3aed" stroke-width="1" opacity="0.35"/>
            <line x1="160" y1="32" x2="100" y2="58" stroke="#7c3aed" stroke-width="1" opacity="0.35"/>
            <line x1="160" y1="32" x2="160" y2="58" stroke="#7c3aed" stroke-width="1" opacity="0.35"/>
            <line x1="160" y1="32" x2="220" y2="58" stroke="#7c3aed" stroke-width="1" opacity="0.35"/>
            <line x1="160" y1="32" x2="280" y2="58" stroke="#7c3aed" stroke-width="1" opacity="0.35"/>
            <rect x="6"   y="58" width="68" height="22" rx="4" fill="#0ea5e9" opacity="0.13" stroke="#0ea5e9" stroke-width="1"/>
            <text x="40"  y="72" text-anchor="middle" font-size="8" fill="#0ea5e9" font-weight="600" font-family="system-ui,sans-serif">PCA / SVD</text>
            <rect x="66"  y="58" width="68" height="22" rx="4" fill="#10b981" opacity="0.13" stroke="#10b981" stroke-width="1"/>
            <text x="100" y="72" text-anchor="middle" font-size="8" fill="#10b981" font-weight="600" font-family="system-ui,sans-serif">Spectral</text>
            <rect x="126" y="58" width="68" height="22" rx="4" fill="#f59e0b" opacity="0.14" stroke="#f59e0b" stroke-width="1"/>
            <text x="160" y="72" text-anchor="middle" font-size="8" fill="#f59e0b" font-weight="600" font-family="system-ui,sans-serif">PageRank</text>
            <rect x="186" y="58" width="68" height="22" rx="4" fill="#ec4899" opacity="0.13" stroke="#ec4899" stroke-width="1"/>
            <text x="220" y="72" text-anchor="middle" font-size="8" fill="#ec4899" font-weight="600" font-family="system-ui,sans-serif">Quantum</text>
            <rect x="246" y="58" width="68" height="22" rx="4" fill="#7c3aed" opacity="0.13" stroke="#7c3aed" stroke-width="1"/>
            <text x="280" y="72" text-anchor="middle" font-size="8" fill="#7c3aed" font-weight="600" font-family="system-ui,sans-serif">Vibrations</text>

            <line x1="40"  y1="80" x2="40"  y2="102" stroke="#0ea5e9" stroke-width="1" opacity="0.3"/>
            <line x1="100" y1="80" x2="100" y2="102" stroke="#10b981" stroke-width="1" opacity="0.3"/>
            <line x1="160" y1="80" x2="160" y2="102" stroke="#f59e0b" stroke-width="1" opacity="0.3"/>
            <line x1="220" y1="80" x2="220" y2="102" stroke="#ec4899" stroke-width="1" opacity="0.3"/>
            <line x1="280" y1="80" x2="280" y2="102" stroke="#7c3aed" stroke-width="1" opacity="0.3"/>

            <rect x="6"   y="102" width="68" height="20" rx="4" fill="#0ea5e9" opacity="0.07" stroke="#0ea5e9" stroke-width="0.7"/>
            <text x="40"  y="115" text-anchor="middle" font-size="7" fill="#0ea5e9" font-family="system-ui,sans-serif">Image compression</text>
            <rect x="6"   y="124" width="68" height="20" rx="4" fill="#0ea5e9" opacity="0.07" stroke="#0ea5e9" stroke-width="0.7"/>
            <text x="40"  y="137" text-anchor="middle" font-size="7" fill="#0ea5e9" font-family="system-ui,sans-serif">Face recognition</text>

            <rect x="66"  y="102" width="68" height="20" rx="4" fill="#10b981" opacity="0.07" stroke="#10b981" stroke-width="0.7"/>
            <text x="100" y="115" text-anchor="middle" font-size="7" fill="#10b981" font-family="system-ui,sans-serif">Graph clustering</text>
            <rect x="66"  y="124" width="68" height="20" rx="4" fill="#10b981" opacity="0.07" stroke="#10b981" stroke-width="0.7"/>
            <text x="100" y="137" text-anchor="middle" font-size="7" fill="#10b981" font-family="system-ui,sans-serif">Community detection</text>

            <rect x="126" y="102" width="68" height="20" rx="4" fill="#f59e0b" opacity="0.07" stroke="#f59e0b" stroke-width="0.7"/>
            <text x="160" y="115" text-anchor="middle" font-size="7" fill="#f59e0b" font-family="system-ui,sans-serif">Search ranking</text>
            <rect x="126" y="124" width="68" height="20" rx="4" fill="#f59e0b" opacity="0.07" stroke="#f59e0b" stroke-width="0.7"/>
            <text x="160" y="137" text-anchor="middle" font-size="7" fill="#f59e0b" font-family="system-ui,sans-serif">Recommender systems</text>

            <rect x="186" y="102" width="68" height="20" rx="4" fill="#ec4899" opacity="0.07" stroke="#ec4899" stroke-width="0.7"/>
            <text x="220" y="115" text-anchor="middle" font-size="7" fill="#ec4899" font-family="system-ui,sans-serif">Energy levels</text>
            <rect x="186" y="124" width="68" height="20" rx="4" fill="#ec4899" opacity="0.07" stroke="#ec4899" stroke-width="0.7"/>
            <text x="220" y="137" text-anchor="middle" font-size="7" fill="#ec4899" font-family="system-ui,sans-serif">Observable operators</text>

            <rect x="246" y="102" width="68" height="20" rx="4" fill="#7c3aed" opacity="0.07" stroke="#7c3aed" stroke-width="0.7"/>
            <text x="280" y="115" text-anchor="middle" font-size="7" fill="#7c3aed" font-family="system-ui,sans-serif">Bridge resonance</text>
            <rect x="246" y="124" width="68" height="20" rx="4" fill="#7c3aed" opacity="0.07" stroke="#7c3aed" stroke-width="0.7"/>
            <text x="280" y="137" text-anchor="middle" font-size="7" fill="#7c3aed" font-family="system-ui,sans-serif">Molecule modes</text>
          </svg>`,
        },
      ],
    },

    // ─── Module 4: Live explorer ────────────────────────────────────────
    {
      title: "Live 2x2 eigenvector explorer",
      writtenText:
        "Below is a live explorer. Drag the matrix entries to change A, and watch the eigenvectors and eigenvalues update in real time. Look for the moments when the two eigenvectors align — that's when A becomes deficient and only has one independent eigen-direction.",
      spokenText:
        "Try dragging the matrix entries. When the two eigenvectors align, the matrix is defective — it has only one independent eigen-direction.",
      artifacts: [
        {
          id: "ev-sim-2x2",
          type: "simulation",
          title: "Interactive 2x2 matrix",
          status: "rendered",
          topic: "Live eigenvector visualization for a draggable 2x2 matrix",
          code: `<!DOCTYPE html><html><head><style>
*{margin:0;padding:0;box-sizing:border-box;font-family:Inter,system-ui,sans-serif}
body{background:#0a0b14;color:#fff;display:flex;flex-direction:column;height:100vh;padding:14px;gap:10px}
.row{display:flex;gap:14px;align-items:center}
canvas{background:#06070f;border-radius:8px;flex:1}
.matrix{display:grid;grid-template-columns:repeat(2,72px);gap:6px}
.matrix input{background:#15172a;border:1px solid #2a2f4d;color:#fff;border-radius:6px;padding:6px 8px;font-size:13px;text-align:center;width:100%}
.label{font-size:11px;color:#9aa0c4;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px}
.eig{font-size:12px;color:#fbbf24;font-family:'JetBrains Mono',monospace}
.legend{font-size:11px;color:#9aa0c4;display:flex;gap:14px}
.legend span{display:inline-flex;align-items:center;gap:6px}
.dot{width:10px;height:10px;border-radius:50%;display:inline-block}
</style></head><body>
<div class="row">
  <div>
    <div class="label">Matrix A</div>
    <div class="matrix">
      <input id="a" type="number" step="0.1" value="2"/>
      <input id="b" type="number" step="0.1" value="1"/>
      <input id="c" type="number" step="0.1" value="0"/>
      <input id="d" type="number" step="0.1" value="3"/>
    </div>
  </div>
  <div style="flex:1">
    <div class="label">Eigenvalues</div>
    <div id="vals" class="eig">…</div>
    <div class="label" style="margin-top:8px">Eigenvectors</div>
    <div id="vecs" class="eig">…</div>
  </div>
</div>
<canvas id="cv" width="400" height="320"></canvas>
<div class="legend">
  <span><span class="dot" style="background:#7c3aed"></span>Unit circle</span>
  <span><span class="dot" style="background:#f59e0b"></span>Transformed</span>
  <span><span class="dot" style="background:#fbbf24"></span>Eigenvector 1</span>
  <span><span class="dot" style="background:#10b981"></span>Eigenvector 2</span>
</div>
<script>
const cv=document.getElementById('cv'),ctx=cv.getContext('2d');
const W=cv.width,H=cv.height,cx=W/2,cy=H/2,scale=42;
function eig(a,b,c,d){
  const tr=a+d,det=a*d-b*c,disc=tr*tr-4*det;
  if(disc<0)return null;
  const s=Math.sqrt(disc);
  const l1=(tr+s)/2,l2=(tr-s)/2;
  function vec(l){
    if(Math.abs(b)>1e-9)return[b,l-a];
    if(Math.abs(c)>1e-9)return[l-d,c];
    return[1,0];
  }
  function norm(v){const n=Math.hypot(v[0],v[1])||1;return[v[0]/n,v[1]/n]}
  return{l1,l2,v1:norm(vec(l1)),v2:norm(vec(l2))};
}
function draw(){
  const a=+document.getElementById('a').value;
  const b=+document.getElementById('b').value;
  const c=+document.getElementById('c').value;
  const d=+document.getElementById('d').value;
  ctx.fillStyle='#06070f';ctx.fillRect(0,0,W,H);
  // Grid
  ctx.strokeStyle='rgba(124,58,237,0.08)';ctx.lineWidth=1;
  for(let i=-6;i<=6;i++){
    ctx.beginPath();ctx.moveTo(cx+i*scale,0);ctx.lineTo(cx+i*scale,H);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,cy+i*scale);ctx.lineTo(W,cy+i*scale);ctx.stroke();
  }
  // Axes
  ctx.strokeStyle='rgba(255,255,255,0.25)';ctx.beginPath();ctx.moveTo(0,cy);ctx.lineTo(W,cy);ctx.moveTo(cx,0);ctx.lineTo(cx,H);ctx.stroke();
  // Original circle
  ctx.strokeStyle='#7c3aed';ctx.lineWidth=1.4;ctx.setLineDash([4,3]);
  ctx.beginPath();ctx.arc(cx,cy,scale,0,6.283);ctx.stroke();ctx.setLineDash([]);
  // Transformed (ellipse via parametric)
  ctx.strokeStyle='#f59e0b';ctx.lineWidth=2;
  ctx.beginPath();
  for(let t=0;t<=6.283;t+=0.04){
    const x=Math.cos(t),y=Math.sin(t);
    const px=a*x+b*y,py=c*x+d*y;
    const sx=cx+px*scale,sy=cy-py*scale;
    if(t===0)ctx.moveTo(sx,sy);else ctx.lineTo(sx,sy);
  }
  ctx.closePath();ctx.stroke();
  // Eigenvectors
  const e=eig(a,b,c,d);
  const vt=document.getElementById('vals'),vv=document.getElementById('vecs');
  if(!e){vt.textContent='complex (rotation present)';vv.textContent='no real eigenvectors';return}
  function arrow(v,l,col){
    const ex=cx+v[0]*l*scale,ey=cy-v[1]*l*scale;
    ctx.strokeStyle=col;ctx.fillStyle=col;ctx.lineWidth=2.5;
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(ex,ey);ctx.stroke();
    ctx.beginPath();ctx.arc(ex,ey,4,0,6.283);ctx.fill();
  }
  arrow(e.v1,Math.abs(e.l1)||1,'#fbbf24');
  arrow(e.v2,Math.abs(e.l2)||1,'#10b981');
  vt.innerHTML='\u03BB\u2081 = '+e.l1.toFixed(3)+' &nbsp;&nbsp; \u03BB\u2082 = '+e.l2.toFixed(3);
  vv.innerHTML='v\u2081 = ['+e.v1[0].toFixed(2)+', '+e.v1[1].toFixed(2)+']<br>v\u2082 = ['+e.v2[0].toFixed(2)+', '+e.v2[1].toFixed(2)+']';
}
['a','b','c','d'].forEach(id=>document.getElementById(id).addEventListener('input',draw));
draw();
<\/script></body></html>`,
        },
      ],
    },
  ],
};
