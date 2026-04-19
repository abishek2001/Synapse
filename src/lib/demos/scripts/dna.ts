import type { DemoScript } from "../types";

/** ─────────────────────────────────────────────────────────────────────────
 *  Demo 4: DNA & Evolution
 *  5 modules. Hits all required visuals:
 *  - 3D: double helix (Module 1)
 *  - Graphs: density of fitness effects + line of mutation rates (Module 4)
 *  - Tree: visual.hierarchy = tree of life (Module 3)
 *  - Simulation: evolving population (Module 4)
 *  ───────────────────────────────────────────────────────────────────────── */
export const dnaDemo: DemoScript = {
  id: "dna",
  title: "DNA & Evolution",
  description: "From the double helix to the tree of life and live selection.",
  tags: ["3D", "Tree", "Biology"],
  userPrompt: "How does DNA actually code for life?",
  keywords: ["dna", "evolution", "genome", "double helix"],
  modules: [
    // ─── Module 1: The double helix ──────────────────────────────────────
    {
      title: "The double helix",
      writtenText:
        "DNA is a polymer of four nucleotides — A, T, G, C — strung along a sugar-phosphate backbone. Two strands wind around each other in a right-handed double helix, held together by hydrogen bonds: A pairs with T, G pairs with C. The pairing is what makes DNA copyable: each strand is the template for the other.",
      spokenText:
        "DNA is two strands of four nucleotides — A, T, G, C — paired across a double helix. A pairs with T, G pairs with C. That pairing is what makes DNA copyable.",
      artifacts: [
        {
          id: "dna-r3d-helix",
          type: "render3d",
          title: "DNA double helix",
          status: "rendered",
          topic: "Animated DNA double helix with base pairs colored by nucleotide",
          camera_distance: 9,
          bg_color: "#04060f",
          code: `
camera.position.set(2, 0.5, 9);
controls.target.set(0, 0, 0);

const TURNS = 4;
const PAIRS_PER_TURN = 10;
const PAIRS = TURNS * PAIRS_PER_TURN;
const HELIX_RADIUS = 1.2;
const RISE = 0.34; // height per pair
const TWIST = (2 * Math.PI) / PAIRS_PER_TURN;

const NUCLEOTIDE_COLORS = {
  A: 0x7c3aed, T: 0xfbbf24,
  G: 0x10b981, C: 0xec4899,
};
const PAIR = { A: 'T', T: 'A', G: 'C', C: 'G' };
const BASES = ['A','T','G','C'];

// Backbones — two helical tubes
function helixCurve(phase) {
  const pts = [];
  for (let i = 0; i < PAIRS; i++) {
    const t = i * TWIST + phase;
    const y = (i - PAIRS / 2) * RISE;
    pts.push(new THREE.Vector3(Math.cos(t) * HELIX_RADIUS, y, Math.sin(t) * HELIX_RADIUS));
  }
  return new THREE.CatmullRomCurve3(pts);
}
const backboneMat = new THREE.MeshPhongMaterial({ color: 0x88aacc, shininess: 80 });
scene.add(new THREE.Mesh(new THREE.TubeGeometry(helixCurve(0), 200, 0.10, 12, false), backboneMat));
scene.add(new THREE.Mesh(new THREE.TubeGeometry(helixCurve(Math.PI), 200, 0.10, 12, false), backboneMat));

// Base pairs — colored cylinders connecting the strands
const baseGroup = new THREE.Group();
for (let i = 0; i < PAIRS; i++) {
  const t = i * TWIST;
  const y = (i - PAIRS / 2) * RISE;
  const a = new THREE.Vector3(Math.cos(t) * HELIX_RADIUS, y, Math.sin(t) * HELIX_RADIUS);
  const b = new THREE.Vector3(Math.cos(t + Math.PI) * HELIX_RADIUS, y, Math.sin(t + Math.PI) * HELIX_RADIUS);
  const base = BASES[i % 4];
  const partner = PAIR[base];
  const mid = a.clone().lerp(b, 0.5);
  const dir = b.clone().sub(a);
  const len = dir.length();

  // Two half-cylinders so each base is its own color
  const halfA = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, len / 2, 12),
    new THREE.MeshPhongMaterial({ color: NUCLEOTIDE_COLORS[base], shininess: 60 })
  );
  const halfB = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, len / 2, 12),
    new THREE.MeshPhongMaterial({ color: NUCLEOTIDE_COLORS[partner], shininess: 60 })
  );
  // Position + orient
  const midA = a.clone().lerp(mid, 0.5);
  const midB = b.clone().lerp(mid, 0.5);
  halfA.position.copy(midA);
  halfB.position.copy(midB);
  halfA.lookAt(mid); halfB.lookAt(mid);
  halfA.rotateX(Math.PI / 2); halfB.rotateX(Math.PI / 2);
  baseGroup.add(halfA); baseGroup.add(halfB);
}
scene.add(baseGroup);

// Soft rotating spotlight to make the helix shimmer
const spot = new THREE.PointLight(0x9966ff, 1.4, 20);
spot.position.set(4, 4, 4);
scene.add(spot);

function update(t) {
  // Rotate the whole helix slowly so all sides come into view
  baseGroup.rotation.y = t * 0.35;
  spot.position.set(Math.cos(t * 0.5) * 5, 3, Math.sin(t * 0.5) * 5);
}`,
        },
        {
          id: "dna-fc-basics",
          type: "flashcard",
          title: "Quick recall",
          status: "rendered",
          cards: [
            {
              front: "What are the four bases?",
              back: "Adenine (A), Thymine (T), Guanine (G), Cytosine (C). In RNA, T is replaced by Uracil (U).",
            },
            {
              front: "Which bases pair up?",
              back: "A pairs with T (2 hydrogen bonds), G pairs with C (3 hydrogen bonds — slightly stronger).",
            },
            {
              front: "Why are the strands antiparallel?",
              back: "The two backbones run in opposite directions (5' to 3' vs 3' to 5'), required for the geometry of base pairing and replication.",
            },
          ],
        },
      ],
      nextPrompt: "How does DNA actually code for proteins?",
      annotations: [
        { kind: "sticky", content: "A — T   (2 bonds)\nG — C   (3 bonds)\nbase pairing rules", anchor: "top-right", color: "#fff7c2" },
        { kind: "text",   content: "Each strand is a perfect template\nfor copying the other", anchor: "below", offsetY: -10 },
      ],
    },

    // ─── Module 2: From code to protein ──────────────────────────────────
    {
      title: "From code to protein",
      writtenText:
        "DNA's job is to specify proteins. The flow is: DNA is transcribed to mRNA, mRNA travels to the ribosome, and the ribosome reads it three letters (a codon) at a time, adding the corresponding amino acid to a growing chain. There are 64 codons and 20 amino acids — so multiple codons can code for the same amino acid, which is why the code is called degenerate.",
      spokenText:
        "DNA is transcribed into mRNA, which travels to the ribosome. The ribosome reads it three letters at a time and builds a protein, one amino acid per codon.",
      artifacts: [
        {
          id: "dna-vis-flow",
          type: "visual",
          title: "Central dogma",
          status: "rendered",
          description: "Information flow from DNA to protein.",
          style: "flowchart",
          svgContent: `<svg viewBox="0 0 320 130" xmlns="http://www.w3.org/2000/svg">
            <rect x="14"  y="50" width="56" height="30" rx="6" fill="#7c3aed" opacity="0.15" stroke="#7c3aed" stroke-width="1.2"/>
            <text x="42"  y="65" text-anchor="middle" font-size="9" fill="#7c3aed" font-weight="600" font-family="system-ui,sans-serif">DNA</text>
            <text x="42"  y="76" text-anchor="middle" font-size="6.5" fill="#7c3aed" font-family="system-ui,sans-serif">in nucleus</text>
            <line x1="70" y1="65" x2="92" y2="65" stroke="#0ea5e9" stroke-width="1.2" opacity="0.7"/>
            <polygon points="92,62 98,65 92,68" fill="#0ea5e9" opacity="0.7"/>
            <text x="80" y="58" text-anchor="middle" font-size="6.5" fill="#0ea5e9" font-family="system-ui,sans-serif">transcription</text>
            <rect x="98"  y="50" width="56" height="30" rx="6" fill="#0ea5e9" opacity="0.15" stroke="#0ea5e9" stroke-width="1.2"/>
            <text x="126" y="65" text-anchor="middle" font-size="9" fill="#0ea5e9" font-weight="600" font-family="system-ui,sans-serif">mRNA</text>
            <text x="126" y="76" text-anchor="middle" font-size="6.5" fill="#0ea5e9" font-family="system-ui,sans-serif">to cytoplasm</text>
            <line x1="154" y1="65" x2="176" y2="65" stroke="#10b981" stroke-width="1.2" opacity="0.7"/>
            <polygon points="176,62 182,65 176,68" fill="#10b981" opacity="0.7"/>
            <text x="164" y="58" text-anchor="middle" font-size="6.5" fill="#10b981" font-family="system-ui,sans-serif">translation</text>
            <rect x="182" y="50" width="56" height="30" rx="6" fill="#10b981" opacity="0.15" stroke="#10b981" stroke-width="1.2"/>
            <text x="210" y="65" text-anchor="middle" font-size="9" fill="#10b981" font-weight="600" font-family="system-ui,sans-serif">Ribosome</text>
            <text x="210" y="76" text-anchor="middle" font-size="6.5" fill="#10b981" font-family="system-ui,sans-serif">reads codons</text>
            <line x1="238" y1="65" x2="260" y2="65" stroke="#f59e0b" stroke-width="1.2" opacity="0.7"/>
            <polygon points="260,62 266,65 260,68" fill="#f59e0b" opacity="0.7"/>
            <rect x="266" y="50" width="50" height="30" rx="6" fill="#f59e0b" opacity="0.15" stroke="#f59e0b" stroke-width="1.2"/>
            <text x="291" y="68" text-anchor="middle" font-size="9" fill="#f59e0b" font-weight="600" font-family="system-ui,sans-serif">Protein</text>
          </svg>`,
        },
        {
          id: "dna-nt-codons",
          type: "notation",
          title: "Codon math",
          status: "rendered",
          latex: "4^3 = 64 \\text{ codons} \\rightarrow 20 \\text{ amino acids}",
          annotation:
            "Each codon is 3 bases. 4 letters give 64 combinations, mapping onto 20 amino acids plus 3 stop codons. The redundancy buffers against single-base mutations.",
        },
      ],
      nextPrompt: "How do we know all life shares one ancestor?",
      annotations: [
        { kind: "sticky", content: "DNA → RNA → Protein\n(central dogma)", anchor: "right", color: "#dbeafe" },
        { kind: "text",   content: "3 bases = 1 amino acid\n(64 codons, 20 aa)\n→ redundant code", anchor: "below", offsetY: -10 },
      ],
    },

    // ─── Module 3: Tree of life ──────────────────────────────────────────
    {
      title: "The tree of life",
      writtenText:
        "All known life shares a common ancestor and a common code. We classify it into three domains: Bacteria, Archaea, and Eukarya — the third of which contains everything visible to the naked eye, including us. Below the domain level, the tree branches into kingdoms, phyla, classes, and on down to individual species.",
      spokenText:
        "Every living thing branches off the same tree, divided into three domains: Bacteria, Archaea, and Eukarya. Eukarya is where we live, alongside plants, fungi, and every visible organism.",
      artifacts: [
        {
          id: "dna-vis-tree",
          type: "visual",
          title: "Three domains of life",
          status: "rendered",
          description: "From the universal common ancestor to us.",
          style: "hierarchy",
          svgContent: `<svg viewBox="0 0 340 230" xmlns="http://www.w3.org/2000/svg">
            <rect x="120" y="6" width="100" height="26" rx="6" fill="#7c3aed" opacity="0.18" stroke="#7c3aed" stroke-width="1.5"/>
            <text x="170" y="23" text-anchor="middle" font-size="10" fill="#7c3aed" font-weight="700" font-family="system-ui,sans-serif">LUCA</text>
            <text x="170" y="32" text-anchor="middle" font-size="6" fill="#7c3aed" font-family="system-ui,sans-serif">last universal common ancestor</text>

            <line x1="170" y1="38" x2="50"  y2="60" stroke="#7c3aed" stroke-width="1" opacity="0.35"/>
            <line x1="170" y1="38" x2="170" y2="60" stroke="#7c3aed" stroke-width="1" opacity="0.35"/>
            <line x1="170" y1="38" x2="290" y2="60" stroke="#7c3aed" stroke-width="1" opacity="0.35"/>

            <rect x="16"  y="60" width="68" height="22" rx="4" fill="#0ea5e9" opacity="0.13" stroke="#0ea5e9" stroke-width="1"/>
            <text x="50"  y="74" text-anchor="middle" font-size="8.5" fill="#0ea5e9" font-weight="600" font-family="system-ui,sans-serif">Bacteria</text>
            <rect x="136" y="60" width="68" height="22" rx="4" fill="#10b981" opacity="0.13" stroke="#10b981" stroke-width="1"/>
            <text x="170" y="74" text-anchor="middle" font-size="8.5" fill="#10b981" font-weight="600" font-family="system-ui,sans-serif">Archaea</text>
            <rect x="256" y="60" width="68" height="22" rx="4" fill="#f59e0b" opacity="0.13" stroke="#f59e0b" stroke-width="1"/>
            <text x="290" y="74" text-anchor="middle" font-size="8.5" fill="#f59e0b" font-weight="600" font-family="system-ui,sans-serif">Eukarya</text>

            <line x1="290" y1="82" x2="220" y2="106" stroke="#f59e0b" stroke-width="1" opacity="0.3"/>
            <line x1="290" y1="82" x2="290" y2="106" stroke="#f59e0b" stroke-width="1" opacity="0.3"/>
            <line x1="290" y1="82" x2="320" y2="106" stroke="#f59e0b" stroke-width="1" opacity="0.3"/>
            <line x1="290" y1="82" x2="160" y2="106" stroke="#f59e0b" stroke-width="1" opacity="0.3"/>

            <rect x="128" y="106" width="64" height="20" rx="4" fill="#ec4899" opacity="0.10" stroke="#ec4899" stroke-width="0.8"/>
            <text x="160" y="119" text-anchor="middle" font-size="7.5" fill="#ec4899" font-weight="600" font-family="system-ui,sans-serif">Protists</text>
            <rect x="194" y="106" width="60" height="20" rx="4" fill="#10b981" opacity="0.10" stroke="#10b981" stroke-width="0.8"/>
            <text x="224" y="119" text-anchor="middle" font-size="7.5" fill="#10b981" font-weight="600" font-family="system-ui,sans-serif">Plantae</text>
            <rect x="258" y="106" width="60" height="20" rx="4" fill="#f59e0b" opacity="0.10" stroke="#f59e0b" stroke-width="0.8"/>
            <text x="288" y="119" text-anchor="middle" font-size="7.5" fill="#f59e0b" font-weight="600" font-family="system-ui,sans-serif">Fungi</text>

            <line x1="288" y1="126" x2="288" y2="148" stroke="#f59e0b" stroke-width="1" opacity="0.3"/>
            <rect x="248" y="148" width="80" height="20" rx="4" fill="#7c3aed" opacity="0.13" stroke="#7c3aed" stroke-width="1"/>
            <text x="288" y="161" text-anchor="middle" font-size="8" fill="#7c3aed" font-weight="600" font-family="system-ui,sans-serif">Animalia</text>

            <line x1="288" y1="168" x2="288" y2="184" stroke="#7c3aed" stroke-width="1" opacity="0.3"/>
            <rect x="248" y="184" width="80" height="18" rx="4" fill="#7c3aed" opacity="0.10" stroke="#7c3aed" stroke-width="0.7"/>
            <text x="288" y="196" text-anchor="middle" font-size="7.5" fill="#7c3aed" font-family="system-ui,sans-serif">Vertebrata</text>

            <line x1="288" y1="202" x2="288" y2="218" stroke="#7c3aed" stroke-width="1" opacity="0.3"/>
            <text x="288" y="225" text-anchor="middle" font-size="9" fill="#7c3aed" font-weight="700" font-family="system-ui,sans-serif">Mammalia → Primates → Us</text>
          </svg>`,
        },
      ],
      nextPrompt: "How does selection actually drive evolution?",
      annotations: [
        { kind: "sticky", content: "Same code in every cell\nfrom bacteria to whales\n→ shared ancestry", anchor: "top-right", color: "#dcfce7" },
      ],
    },

    // ─── Module 4: Mutation & selection ──────────────────────────────────
    {
      title: "Mutation & selection",
      writtenText:
        "Replication is high-fidelity but not perfect. Most mutations are neutral, a few are deleterious, and a tiny fraction are beneficial — that asymmetric distribution is the raw material for natural selection. Below is a live evolving population: each dot is an organism with a fitness, and you can watch the mean drift upward over generations.",
      spokenText:
        "Most mutations are neutral, some are harmful, and a few are beneficial. Watch the live population below — the mean fitness drifts upward over generations as natural selection acts on the variation.",
      artifacts: [
        {
          id: "dna-gr-dfe",
          type: "graph",
          title: "Distribution of fitness effects",
          status: "rendered",
          graph_type: "density",
          series: [
            {
              label: "Mutation effects",
              color: "#7c3aed",
              data: [
                -0.85,-0.7,-0.6,-0.55,-0.5,-0.5,-0.45,-0.4,-0.4,-0.35,-0.3,-0.3,-0.25,-0.2,-0.2,-0.15,-0.15,-0.1,-0.1,-0.08,
                -0.06,-0.05,-0.04,-0.04,-0.03,-0.02,-0.02,-0.01,-0.01,-0.005,
                0,0,0,0,0,0,0,0,0,0,0,0.001,0.001,0.002,0.002,0.003,0.005,0.005,0.008,0.01,
                0.01,0.012,0.015,0.018,0.02,0.025,0.03,0.04,0.05,0.06,0.08,0.10,0.12,
              ].map((v, i) => ({ x: i, y: v })),
            },
          ],
          x_range: [-1, 0.4],
          x_label: "Fitness effect",
          y_label: "Probability density",
        },
        {
          id: "dna-sim-evo",
          type: "simulation",
          title: "Live natural selection",
          status: "rendered",
          topic: "Evolving population: variation, selection, inheritance",
          code: `<!DOCTYPE html><html><head><style>
*{margin:0;padding:0;box-sizing:border-box;font-family:Inter,system-ui,sans-serif}
body{background:#0a0b14;color:#fff;display:flex;flex-direction:column;height:100vh;padding:12px;gap:8px}
canvas{background:#06070f;border-radius:8px;flex:1}
.row{display:flex;gap:14px;align-items:center;font-size:12px;color:#9aa0c4}
button{background:#7c3aed;color:#fff;border:0;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:12px}
.stat{font-family:'JetBrains Mono',monospace;color:#fbbf24}
</style></head><body>
<canvas id="cv" width="420" height="280"></canvas>
<div class="row">
  <button id="reset">Reset</button>
  <span>Generation: <span id="gen" class="stat">0</span></span>
  <span>Mean fitness: <span id="mean" class="stat">0.50</span></span>
  <span>Best: <span id="best" class="stat">0.50</span></span>
</div>
<script>
const cv=document.getElementById('cv'),ctx=cv.getContext('2d');
const W=cv.width,H=cv.height;
const N=80;
let pop=[];
let gen=0;
function init(){
  pop=[];
  gen=0;
  for(let i=0;i<N;i++){
    pop.push({x:Math.random()*W,y:Math.random()*H,fit:Math.random()*0.5+0.25});
  }
}
init();
function step(){
  // Sort by fitness, keep top half, breed to fill, mutate
  pop.sort((a,b)=>b.fit-a.fit);
  const survivors=pop.slice(0,N/2);
  const offspring=[];
  for(let i=0;i<N/2;i++){
    const parent=survivors[Math.floor(Math.random()*survivors.length)];
    const mutation=(Math.random()-0.45)*0.08; // skewed slightly positive
    offspring.push({
      x:Math.random()*W,y:Math.random()*H,
      fit:Math.max(0,Math.min(1,parent.fit+mutation))
    });
  }
  pop=survivors.concat(offspring);
  gen++;
}
function draw(){
  ctx.fillStyle='rgba(6,7,15,0.35)';ctx.fillRect(0,0,W,H);
  let sum=0,best=0;
  for(const p of pop){
    p.x+=(Math.random()-0.5)*1.4;
    p.y+=(Math.random()-0.5)*1.4;
    if(p.x<0)p.x=W;if(p.x>W)p.x=0;
    if(p.y<0)p.y=H;if(p.y>H)p.y=0;
    const r=2+p.fit*5;
    const g=Math.floor(50+p.fit*180);
    ctx.beginPath();ctx.arc(p.x,p.y,r,0,6.28);
    ctx.fillStyle='rgba(124,'+g+',237,'+ (0.4 + p.fit*0.5) +')';ctx.fill();
    sum+=p.fit;best=Math.max(best,p.fit);
  }
  document.getElementById('gen').textContent=gen;
  document.getElementById('mean').textContent=(sum/pop.length).toFixed(3);
  document.getElementById('best').textContent=best.toFixed(3);
}
let frame=0;
function loop(){
  draw();
  frame++;
  if(frame%30===0)step();
  requestAnimationFrame(loop);
}
document.getElementById('reset').addEventListener('click',init);
loop();
<\/script></body></html>`,
        },
      ],
      nextPrompt: "How big is the human genome?",
      annotations: [
        { kind: "sticky", content: "Most mutations: neutral\nFew: harmful (left tail)\nRarer still: beneficial", anchor: "right", color: "#fff7c2" },
        { kind: "text",   content: "Selection = differential\nreproduction over time", anchor: "below", offsetY: -10 },
      ],
    },

    // ─── Module 5: Genome scale ──────────────────────────────────────────
    {
      title: "Genome scale",
      writtenText:
        "How big is a genome? Bacteria have a few million bases, the human genome is about 3 billion, and some plants and amphibians dwarf us by an order of magnitude. Genome size and gene count don't track each other — most of our genome is regulatory or non-coding DNA, not protein-coding genes.",
      spokenText:
        "Genome size doesn't predict complexity. We have three billion bases but so do many simpler organisms. Most of the genome is regulatory, not protein-coding.",
      artifacts: [
        {
          id: "dna-gr-genome",
          type: "graph",
          title: "Genome size by organism",
          status: "rendered",
          graph_type: "bar",
          series: [
            {
              label: "Genome size (Mb)",
              color: "#10b981",
              data: [
                { x: 1, y: 4.6 },
                { x: 2, y: 12 },
                { x: 3, y: 100 },
                { x: 4, y: 1300 },
                { x: 5, y: 3000 },
                { x: 6, y: 130000 },
              ],
            },
          ],
          x_range: [0.5, 6.5],
          x_label: "1=E.coli 2=Yeast 3=C.elegans 4=Fruit fly 5=Human 6=Lungfish",
          y_label: "Genome size (Mb, log feel)",
        },
        {
          id: "dna-vis-cmp",
          type: "visual",
          title: "Coding vs non-coding",
          status: "rendered",
          description: "How much of the genome actually encodes proteins.",
          style: "comparison",
          svgContent: `<svg viewBox="0 0 230 140" xmlns="http://www.w3.org/2000/svg">
            <rect x="8"   y="8"  width="102" height="24" rx="5" fill="#7c3aed" opacity="0.16" stroke="#7c3aed" stroke-width="1.2"/>
            <text x="59"  y="23" text-anchor="middle" font-size="9" fill="#7c3aed" font-weight="600" font-family="system-ui,sans-serif">Bacteria</text>
            <rect x="120" y="8"  width="102" height="24" rx="5" fill="#10b981" opacity="0.16" stroke="#10b981" stroke-width="1.2"/>
            <text x="171" y="23" text-anchor="middle" font-size="9" fill="#10b981" font-weight="600" font-family="system-ui,sans-serif">Human</text>
            <line x1="0" y1="36" x2="230" y2="36" stroke="rgba(0,0,0,0.06)" stroke-width="1"/>
            <rect x="8"   y="40" width="102" height="20" rx="3" fill="#7c3aed" opacity="0.05"/>
            <rect x="120" y="40" width="102" height="20" rx="3" fill="#10b981" opacity="0.05"/>
            <text x="14"  y="53" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Genome: 4 Mb</text>
            <text x="126" y="53" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Genome: 3,000 Mb</text>
            <rect x="8"   y="64" width="102" height="20" rx="3" fill="#7c3aed" opacity="0.03"/>
            <rect x="120" y="64" width="102" height="20" rx="3" fill="#10b981" opacity="0.03"/>
            <text x="14"  y="77" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Coding: 88%</text>
            <text x="126" y="77" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Coding: ~1.5%</text>
            <rect x="8"   y="88" width="102" height="20" rx="3" fill="#7c3aed" opacity="0.05"/>
            <rect x="120" y="88" width="102" height="20" rx="3" fill="#10b981" opacity="0.05"/>
            <text x="14"  y="101" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Genes: ~4,000</text>
            <text x="126" y="101" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Genes: ~20,000</text>
            <rect x="8"   y="112" width="102" height="20" rx="3" fill="#7c3aed" opacity="0.03"/>
            <rect x="120" y="112" width="102" height="20" rx="3" fill="#10b981" opacity="0.03"/>
            <text x="14"  y="125" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Introns: rare</text>
            <text x="126" y="125" font-size="8" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Introns: most genes</text>
          </svg>`,
        },
      ],
      annotations: [
        { kind: "sticky", content: "3 BILLION base pairs\n~ 2 m of DNA per cell\n→ packed into 6 µm nucleus", anchor: "right", color: "#fff7c2" },
        { kind: "text",   content: "Only ~1.5% codes for proteins\n→ rest is regulatory + junk", anchor: "below", offsetY: -10 },
      ],
    },
  ],
};
