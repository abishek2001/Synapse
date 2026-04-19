import type { DemoScript } from "../types";
import { voiceGesturesModule } from "./_voice-gestures";

/** ─────────────────────────────────────────────────────────────────────────
 *  Demo 5: The Human Heart (guided)
 *  6 modules. Hits all required visuals:
 *  - 3D: anatomical Sketchfab heart (Module 1)
 *  - Graphs: Wiggers diagram with HR slider (Module 3)
 *  - Tree: visual.hierarchy of cardiovascular disease branches (Module 4)
 *  - Simulation: live animated ECG with adjustable heart rate (Module 5)
 *  - Voice + gestures product showcase (Module 6, shared)
 *  ───────────────────────────────────────────────────────────────────────── */
export const heartDemo: DemoScript = {
  id: "heart",
  title: "The Human Heart",
  description: "Anatomy, the cardiac cycle, and a live ECG you can speed up.",
  tags: ["3D", "Tree", "Graphs", "Biology"],
  userPrompt: "Teach me how the heart actually works — anatomy through ECG.",
  keywords: ["heart", "cardiac", "ecg"],
  modules: [
    // ─── Module 1: The pump ──────────────────────────────────────────────
    {
      title: "The pump: four chambers",
      writtenText:
        "The heart is two pumps stacked side by side. The right side pulls deoxygenated blood from the body and pushes it to the lungs; the left side takes oxygenated blood back from the lungs and drives it out to the rest of the body. Each side has an upper chamber that fills (atrium) and a lower chamber that pumps (ventricle), separated by one-way valves so blood only ever moves forward.",
      spokenText:
        "The heart is two pumps in one. The right side sends blood to the lungs, the left side sends it to the body. Each side has an atrium that fills and a ventricle that pumps.",
      artifacts: [
        {
          id: "ht-r3d-heart",
          type: "render3d",
          title: "Anatomical 3D heart",
          status: "rendered",
          topic: "Real anatomical 3D model of a human heart (Sketchfab)",
          embed_url:
            "https://sketchfab.com/models/54fa880728d14c11afff78be8721620a/embed?autostart=1&ui_theme=dark&ui_infos=0&ui_controls=1",
          code: "",
        },
        {
          id: "ht-vis-anat",
          type: "visual",
          title: "Blood flow path",
          status: "rendered",
          description: "One full circuit through both pumps.",
          style: "flowchart",
          svgContent: `<svg viewBox="0 0 320 130" xmlns="http://www.w3.org/2000/svg">
            <rect x="6"   y="50" width="60" height="30" rx="6" fill="#3a6db4" opacity="0.18" stroke="#3a6db4" stroke-width="1.2"/>
            <text x="36"  y="65" text-anchor="middle" font-size="8.5" fill="#3a6db4" font-weight="600" font-family="system-ui,sans-serif">Body</text>
            <text x="36"  y="76" text-anchor="middle" font-size="6.5" fill="#3a6db4" font-family="system-ui,sans-serif">deoxy</text>
            <line x1="66" y1="65" x2="80" y2="65" stroke="#3a6db4" stroke-width="1.4" opacity="0.7"/>
            <polygon points="80,62 86,65 80,68" fill="#3a6db4" opacity="0.7"/>
            <rect x="86"  y="50" width="60" height="30" rx="6" fill="#3a6db4" opacity="0.20" stroke="#3a6db4" stroke-width="1.2"/>
            <text x="116" y="65" text-anchor="middle" font-size="8.5" fill="#3a6db4" font-weight="600" font-family="system-ui,sans-serif">Right heart</text>
            <text x="116" y="76" text-anchor="middle" font-size="6.5" fill="#3a6db4" font-family="system-ui,sans-serif">RA → RV</text>
            <line x1="146" y1="65" x2="160" y2="65" stroke="#10b981" stroke-width="1.4" opacity="0.7"/>
            <polygon points="160,62 166,65 160,68" fill="#10b981" opacity="0.7"/>
            <rect x="166" y="50" width="60" height="30" rx="6" fill="#10b981" opacity="0.18" stroke="#10b981" stroke-width="1.2"/>
            <text x="196" y="65" text-anchor="middle" font-size="8.5" fill="#10b981" font-weight="600" font-family="system-ui,sans-serif">Lungs</text>
            <text x="196" y="76" text-anchor="middle" font-size="6.5" fill="#10b981" font-family="system-ui,sans-serif">gas exchange</text>
            <line x1="226" y1="65" x2="240" y2="65" stroke="#b43040" stroke-width="1.4" opacity="0.7"/>
            <polygon points="240,62 246,65 240,68" fill="#b43040" opacity="0.7"/>
            <rect x="246" y="50" width="68" height="30" rx="6" fill="#b43040" opacity="0.20" stroke="#b43040" stroke-width="1.2"/>
            <text x="280" y="65" text-anchor="middle" font-size="8.5" fill="#b43040" font-weight="600" font-family="system-ui,sans-serif">Left heart</text>
            <text x="280" y="76" text-anchor="middle" font-size="6.5" fill="#b43040" font-family="system-ui,sans-serif">LA → LV → aorta</text>
            <path d="M 280 80 Q 280 110 36 110 Q 36 95 36 80" fill="none" stroke="#b43040" stroke-width="1.2" opacity="0.55" stroke-dasharray="3 3"/>
            <text x="160" y="124" text-anchor="middle" font-size="6.5" fill="#b43040" font-family="system-ui,sans-serif" font-style="italic">oxygenated blood out to body</text>
          </svg>`,
        },
      ],
      nextPrompt: "Walk me through one full beat — what happens valve by valve?",
      annotations: [
        { kind: "sticky", content: "Aorta = highway out!\n(thickest artery in the body)", anchor: "top-right", color: "#fff7c2" },
        { kind: "text",   content: "Right side → lungs\nLeft side → body", anchor: "below", offsetY: -10 },
      ],
    },

    // ─── Module 2: The cardiac cycle ─────────────────────────────────────
    {
      title: "The cardiac cycle",
      writtenText:
        "Every beat has two phases: diastole (relaxation, when the ventricles fill) and systole (contraction, when blood is ejected). The valves open and close in a strict sequence to keep flow one-directional. The first heart sound — 'lub' — is the AV valves slamming shut at the start of systole; the second — 'dub' — is the semilunar valves snapping shut at the end.",
      spokenText:
        "Every beat has two phases. Diastole is when the ventricles fill. Systole is when they contract and eject blood. Lub-dub is just the valves slamming shut in sequence.",
      artifacts: [
        {
          id: "ht-vis-cycle",
          type: "visual",
          title: "Phases of one beat",
          status: "rendered",
          description: "What happens in 0.8 seconds at rest.",
          style: "timeline",
          svgContent: `<svg viewBox="0 0 320 140" xmlns="http://www.w3.org/2000/svg">
            <line x1="20" y1="70" x2="300" y2="70" stroke="#7c3aed" stroke-width="1.5" opacity="0.25"/>
            <circle cx="50"  cy="70" r="5" fill="#3a6db4" opacity="0.7"/>
            <rect x="16"  y="22" width="68" height="22" rx="4" fill="#3a6db4" opacity="0.12" stroke="#3a6db4" stroke-width="1"/>
            <text x="50"  y="36" text-anchor="middle" font-size="8" fill="#3a6db4" font-weight="600" font-family="system-ui,sans-serif">0 ms</text>
            <text x="50"  y="46" text-anchor="middle" font-size="6.5" fill="#3a6db4" font-family="system-ui,sans-serif">Atrial systole</text>
            <line x1="50"  y1="46" x2="50"  y2="65" stroke="#3a6db4" stroke-width="1" opacity="0.3"/>
            <circle cx="120" cy="70" r="5" fill="#b43040" opacity="0.7"/>
            <rect x="86"  y="86" width="68" height="22" rx="4" fill="#b43040" opacity="0.12" stroke="#b43040" stroke-width="1"/>
            <text x="120" y="100" text-anchor="middle" font-size="8" fill="#b43040" font-weight="600" font-family="system-ui,sans-serif">100 ms</text>
            <text x="120" y="110" text-anchor="middle" font-size="6.5" fill="#b43040" font-family="system-ui,sans-serif">"Lub" — AV close</text>
            <line x1="120" y1="75" x2="120" y2="86" stroke="#b43040" stroke-width="1" opacity="0.3"/>
            <circle cx="190" cy="70" r="5" fill="#f59e0b" opacity="0.7"/>
            <rect x="156" y="22" width="68" height="22" rx="4" fill="#f59e0b" opacity="0.12" stroke="#f59e0b" stroke-width="1"/>
            <text x="190" y="36" text-anchor="middle" font-size="8" fill="#f59e0b" font-weight="600" font-family="system-ui,sans-serif">300 ms</text>
            <text x="190" y="46" text-anchor="middle" font-size="6.5" fill="#f59e0b" font-family="system-ui,sans-serif">Ejection peaks</text>
            <line x1="190" y1="46" x2="190" y2="65" stroke="#f59e0b" stroke-width="1" opacity="0.3"/>
            <circle cx="260" cy="70" r="5" fill="#10b981" opacity="0.7"/>
            <rect x="226" y="86" width="68" height="22" rx="4" fill="#10b981" opacity="0.12" stroke="#10b981" stroke-width="1"/>
            <text x="260" y="100" text-anchor="middle" font-size="8" fill="#10b981" font-weight="600" font-family="system-ui,sans-serif">400 ms</text>
            <text x="260" y="110" text-anchor="middle" font-size="6.5" fill="#10b981" font-family="system-ui,sans-serif">"Dub" — semilunar close</text>
            <line x1="260" y1="75" x2="260" y2="86" stroke="#10b981" stroke-width="1" opacity="0.3"/>
            <text x="296" y="62" text-anchor="end" font-size="7" fill="rgba(0,0,0,0.45)" font-family="system-ui,sans-serif" font-style="italic">→ diastole (rest)</text>
          </svg>`,
        },
        {
          id: "ht-nt-co",
          type: "notation",
          title: "Cardiac output",
          status: "rendered",
          latex: "Q = HR \\times SV",
          annotation:
            "Cardiac output Q (L/min) = heart rate × stroke volume. Resting: 70 bpm × 70 mL ≈ 5 L/min. During exercise it can climb to 25+ L/min — both terms increase together.",
        },
      ],
      nextPrompt: "Show me the pressure curve and how blood pressure works.",
      annotations: [
        { kind: "sticky", content: "Lub = AV valves close\nDub = semilunars close", anchor: "bottom-right", color: "#fce7f3" },
      ],
    },

    // ─── Module 3: Pressures ─────────────────────────────────────────────
    {
      title: "Pressures across the cycle",
      writtenText:
        "Blood pressure is the force per unit area on vessel walls. Inside the left ventricle, pressure swings from near zero during filling to roughly 120 mmHg at peak ejection — which is what your blood pressure cuff measures (the systolic number). Drag the heart-rate slider to see how the rhythm compresses when you exercise.",
      spokenText:
        "Inside the left ventricle, pressure swings from near zero up to about a hundred and twenty during ejection. Drag the heart-rate slider to see the rhythm change.",
      artifacts: [
        {
          id: "ht-gr-press",
          type: "graph",
          title: "Wiggers diagram (LV pressure over time)",
          status: "rendered",
          graph_type: "line",
          series: [
            {
              fn: "(function(){var T=60/HR;var p=(x%T)/T;if(p<0.05)return 0+p/0.05*8;if(p<0.10)return 8+(p-0.05)/0.05*120;if(p<0.40)return 120-Math.pow((p-0.10)/0.30,2)*100;if(p<0.45)return 20-(p-0.40)/0.05*15;return 5+Math.sin(p*20)*1.5;})()",
              label: "LV pressure (mmHg)",
              color: "#b43040",
            },
            {
              fn: "(function(){var T=60/HR;var p=(x%T)/T;if(p<0.10)return 80;if(p<0.40)return 80+Math.sin((p-0.10)/0.30*Math.PI)*40;return 80-(p-0.40)*30;})()",
              label: "Aortic pressure (mmHg)",
              color: "#f59e0b",
              style: "dashed",
            },
          ],
          variables: [
            { name: "HR", label: "Heart rate (bpm)", min: 40, max: 180, step: 5, default: 70 },
          ],
          x_range: [0, 2],
          y_range: [0, 130],
          x_label: "t (s)",
          y_label: "Pressure (mmHg)",
        },
        {
          id: "ht-fc-bp",
          type: "flashcard",
          title: "Pressure facts",
          status: "rendered",
          cards: [
            {
              front: "What's a 'normal' blood pressure?",
              back: "120/80 mmHg. The first number is systolic (peak during ejection), the second is diastolic (lowest, while ventricles refill).",
            },
            {
              front: "Why is the left ventricle thicker than the right?",
              back: "It pumps to the entire body at high pressure (~120 mmHg). The right only pumps to the lungs at much lower pressure (~25 mmHg).",
            },
            {
              front: "What's the resting cardiac output?",
              back: "About 5 liters per minute — meaning your entire blood volume circulates roughly once a minute.",
            },
          ],
        },
      ],
      nextPrompt: "What can go wrong with the heart?",
      annotations: [
        { kind: "sticky", content: "Sys / Dia = 120 / 80\nat rest", anchor: "right", color: "#fff7c2" },
        { kind: "text",   content: "Cardiac output ≈ 5 L/min\n(your whole blood volume / minute)", anchor: "below", offsetY: -8 },
      ],
    },

    // ─── Module 4: When it goes wrong ────────────────────────────────────
    {
      title: "When the heart goes wrong",
      writtenText:
        "Most cardiovascular disease falls into a small number of categories — problems with the pipes (arteries), the pump (muscle and valves), or the wiring (electrical conduction). Here's the canonical breakdown. Many of these conditions feed into each other: an MI damages muscle, weakened muscle leads to heart failure, failure stretches the heart and triggers arrhythmias.",
      spokenText:
        "Most cardiovascular disease comes down to problems with the pipes, the pump, or the wiring. The tree below maps the major categories — and they often cascade into each other.",
      artifacts: [
        {
          id: "ht-vis-tree",
          type: "visual",
          title: "Cardiovascular disease, by system",
          status: "rendered",
          description: "Pipes, pump, wiring.",
          style: "hierarchy",
          svgContent: `<svg viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg">
            <rect x="110" y="6" width="100" height="26" rx="6" fill="#b43040" opacity="0.18" stroke="#b43040" stroke-width="1.5"/>
            <text x="160" y="23" text-anchor="middle" font-size="10" fill="#b43040" font-weight="700" font-family="system-ui,sans-serif">Heart disease</text>
            <line x1="160" y1="32" x2="60"  y2="58" stroke="#b43040" stroke-width="1" opacity="0.35"/>
            <line x1="160" y1="32" x2="160" y2="58" stroke="#b43040" stroke-width="1" opacity="0.35"/>
            <line x1="160" y1="32" x2="260" y2="58" stroke="#b43040" stroke-width="1" opacity="0.35"/>
            <rect x="22"  y="58" width="76" height="22" rx="4" fill="#f59e0b" opacity="0.14" stroke="#f59e0b" stroke-width="1"/>
            <text x="60"  y="72" text-anchor="middle" font-size="8.5" fill="#f59e0b" font-weight="600" font-family="system-ui,sans-serif">Pipes (vessels)</text>
            <rect x="122" y="58" width="76" height="22" rx="4" fill="#0ea5e9" opacity="0.14" stroke="#0ea5e9" stroke-width="1"/>
            <text x="160" y="72" text-anchor="middle" font-size="8.5" fill="#0ea5e9" font-weight="600" font-family="system-ui,sans-serif">Pump (muscle/valves)</text>
            <rect x="222" y="58" width="76" height="22" rx="4" fill="#7c3aed" opacity="0.14" stroke="#7c3aed" stroke-width="1"/>
            <text x="260" y="72" text-anchor="middle" font-size="8.5" fill="#7c3aed" font-weight="600" font-family="system-ui,sans-serif">Wiring (rhythm)</text>

            <line x1="60"  y1="80" x2="60"  y2="102" stroke="#f59e0b" stroke-width="1" opacity="0.3"/>
            <line x1="160" y1="80" x2="160" y2="102" stroke="#0ea5e9" stroke-width="1" opacity="0.3"/>
            <line x1="260" y1="80" x2="260" y2="102" stroke="#7c3aed" stroke-width="1" opacity="0.3"/>

            <rect x="22"  y="102" width="76" height="20" rx="4" fill="#f59e0b" opacity="0.07" stroke="#f59e0b" stroke-width="0.7"/>
            <text x="60"  y="115" text-anchor="middle" font-size="7.5" fill="#f59e0b" font-family="system-ui,sans-serif">Atherosclerosis</text>
            <rect x="22"  y="124" width="76" height="20" rx="4" fill="#f59e0b" opacity="0.07" stroke="#f59e0b" stroke-width="0.7"/>
            <text x="60"  y="137" text-anchor="middle" font-size="7.5" fill="#f59e0b" font-family="system-ui,sans-serif">Hypertension</text>
            <rect x="22"  y="146" width="76" height="20" rx="4" fill="#f59e0b" opacity="0.07" stroke="#f59e0b" stroke-width="0.7"/>
            <text x="60"  y="159" text-anchor="middle" font-size="7.5" fill="#f59e0b" font-family="system-ui,sans-serif">Aneurysm</text>
            <rect x="22"  y="168" width="76" height="20" rx="4" fill="#f59e0b" opacity="0.07" stroke="#f59e0b" stroke-width="0.7"/>
            <text x="60"  y="181" text-anchor="middle" font-size="7.5" fill="#f59e0b" font-family="system-ui,sans-serif">MI / heart attack</text>

            <rect x="122" y="102" width="76" height="20" rx="4" fill="#0ea5e9" opacity="0.07" stroke="#0ea5e9" stroke-width="0.7"/>
            <text x="160" y="115" text-anchor="middle" font-size="7.5" fill="#0ea5e9" font-family="system-ui,sans-serif">Heart failure</text>
            <rect x="122" y="124" width="76" height="20" rx="4" fill="#0ea5e9" opacity="0.07" stroke="#0ea5e9" stroke-width="0.7"/>
            <text x="160" y="137" text-anchor="middle" font-size="7.5" fill="#0ea5e9" font-family="system-ui,sans-serif">Cardiomyopathy</text>
            <rect x="122" y="146" width="76" height="20" rx="4" fill="#0ea5e9" opacity="0.07" stroke="#0ea5e9" stroke-width="0.7"/>
            <text x="160" y="159" text-anchor="middle" font-size="7.5" fill="#0ea5e9" font-family="system-ui,sans-serif">Valve stenosis</text>
            <rect x="122" y="168" width="76" height="20" rx="4" fill="#0ea5e9" opacity="0.07" stroke="#0ea5e9" stroke-width="0.7"/>
            <text x="160" y="181" text-anchor="middle" font-size="7.5" fill="#0ea5e9" font-family="system-ui,sans-serif">Endocarditis</text>

            <rect x="222" y="102" width="76" height="20" rx="4" fill="#7c3aed" opacity="0.07" stroke="#7c3aed" stroke-width="0.7"/>
            <text x="260" y="115" text-anchor="middle" font-size="7.5" fill="#7c3aed" font-family="system-ui,sans-serif">Atrial fibrillation</text>
            <rect x="222" y="124" width="76" height="20" rx="4" fill="#7c3aed" opacity="0.07" stroke="#7c3aed" stroke-width="0.7"/>
            <text x="260" y="137" text-anchor="middle" font-size="7.5" fill="#7c3aed" font-family="system-ui,sans-serif">SVT / VT</text>
            <rect x="222" y="146" width="76" height="20" rx="4" fill="#7c3aed" opacity="0.07" stroke="#7c3aed" stroke-width="0.7"/>
            <text x="260" y="159" text-anchor="middle" font-size="7.5" fill="#7c3aed" font-family="system-ui,sans-serif">Heart block</text>
            <rect x="222" y="168" width="76" height="20" rx="4" fill="#7c3aed" opacity="0.07" stroke="#7c3aed" stroke-width="0.7"/>
            <text x="260" y="181" text-anchor="middle" font-size="7.5" fill="#7c3aed" font-family="system-ui,sans-serif">VFib (sudden death)</text>

            <text x="160" y="208" text-anchor="middle" font-size="7" fill="rgba(0,0,0,0.45)" font-family="system-ui,sans-serif" font-style="italic">An MI damages the pump → heart failure → arrhythmias. The branches feed each other.</text>
          </svg>`,
        },
      ],
      nextPrompt: "Show me a live ECG and explain what each spike means.",
      annotations: [
        { kind: "text",   content: "MI → HF → arrhythmia\n(the cascade)", anchor: "below", offsetY: -10 },
        { kind: "sticky", content: "#1 cause of death\nworldwide", anchor: "top-right", color: "#fee2e2" },
      ],
    },

    // ─── Module 5: ECG live ──────────────────────────────────────────────
    {
      title: "Reading an ECG",
      writtenText:
        "An electrocardiogram is a recording of the heart's electrical activity from the skin. Each beat shows a tiny P-wave (atrial depolarization), a sharp QRS complex (ventricular depolarization — the big spike), and a T-wave (ventricular repolarization). Drag the heart-rate slider on the live trace below — notice how the spacing changes but the shape stays the same.",
      spokenText:
        "An ECG shows three signals per beat: P, QRS, and T. The big spike is the ventricles contracting. Try the slider to change the rate and watch the trace speed up.",
      artifacts: [
        {
          id: "ht-sim-ecg",
          type: "simulation",
          title: "Live ECG monitor",
          status: "rendered",
          topic: "Animated ECG with adjustable heart rate showing P, QRS, T",
          code: `<!DOCTYPE html><html><head><style>
*{margin:0;padding:0;box-sizing:border-box;font-family:Inter,system-ui,sans-serif}
body{background:#02040a;color:#7fff7f;display:flex;flex-direction:column;height:100vh;padding:12px;gap:10px}
canvas{background:#020a04;border-radius:8px;flex:1;border:1px solid rgba(127,255,127,0.15)}
.row{display:flex;gap:14px;align-items:center;font-size:12px;color:#7fff7f}
.row label{color:rgba(127,255,127,0.6);text-transform:uppercase;letter-spacing:0.05em;font-size:10px}
input[type=range]{accent-color:#7fff7f}
.stat{font-family:'JetBrains Mono',monospace;font-size:13px;color:#a0ffa0}
.bpm{font-size:32px;font-weight:200;color:#7fff7f;font-family:'JetBrains Mono',monospace}
</style></head><body>
<div class="row">
  <div class="bpm" id="bpm">72</div>
  <div>
    <label>BPM</label>
    <input id="hr" type="range" min="40" max="180" value="72" step="1" style="width:200px"/>
  </div>
  <div style="margin-left:auto">
    <span class="stat">RR: <span id="rr">833</span> ms</span>
    &nbsp;&nbsp;
    <span class="stat">Rhythm: <span id="rhythm">normal sinus</span></span>
  </div>
</div>
<canvas id="cv" width="640" height="280"></canvas>
<script>
const cv=document.getElementById('cv'),ctx=cv.getContext('2d');
const W=cv.width,H=cv.height,baseY=H*0.55;
let trace=new Array(W).fill(0);
let t=0;
let scrollSpeed=2.2;
function ecgWave(p){
  // p in [0,1) — one cardiac cycle
  if(p<0.10){const x=(p-0.05)/0.05;return 0.12*Math.exp(-x*x*8);}
  if(p>=0.18 && p<0.22){return -0.08;}
  if(p>=0.22 && p<0.26){return 1.0*Math.sin((p-0.22)/0.04*Math.PI);}
  if(p>=0.26 && p<0.30){return -0.20;}
  if(p>=0.42 && p<0.58){const x=(p-0.50)/0.08;return 0.30*Math.exp(-x*x*6);}
  return 0;
}
function drawGrid(){
  ctx.fillStyle='#020a04';ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='rgba(127,255,127,0.07)';ctx.lineWidth=1;
  for(let x=0;x<W;x+=20){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=0;y<H;y+=20){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
  ctx.strokeStyle='rgba(127,255,127,0.18)';
  for(let x=0;x<W;x+=100){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=0;y<H;y+=100){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
}
function loop(){
  drawGrid();
  const hr=+document.getElementById('hr').value;
  const T=60/hr;
  // Update bpm display
  document.getElementById('bpm').textContent=hr;
  document.getElementById('rr').textContent=Math.round(T*1000);
  document.getElementById('rhythm').textContent=hr<60?'bradycardia':hr>100?'tachycardia':'normal sinus';
  // Push new sample
  const p=(t%T)/T;
  const sample=ecgWave(p);
  trace.push(sample);
  for(let i=0;i<scrollSpeed;i++)trace.push(ecgWave(((t+i*0.008)%T)/T));
  while(trace.length>W)trace.shift();
  t+=0.016*scrollSpeed;
  // Draw trace with slight glow
  ctx.shadowColor='#7fff7f';ctx.shadowBlur=8;
  ctx.strokeStyle='#7fff7f';ctx.lineWidth=1.8;
  ctx.beginPath();
  for(let i=0;i<trace.length;i++){
    const y=baseY-trace[i]*120;
    if(i===0)ctx.moveTo(i,y);else ctx.lineTo(i,y);
  }
  ctx.stroke();
  ctx.shadowBlur=0;
  // Bright cursor at end
  ctx.fillStyle='#a0ffa0';
  ctx.beginPath();ctx.arc(trace.length-1,baseY-trace[trace.length-1]*120,3,0,6.28);ctx.fill();
  requestAnimationFrame(loop);
}
loop();
<\/script></body></html>`,
        },
        {
          id: "ht-nt-rate",
          type: "notation",
          title: "Reading rate from RR",
          status: "rendered",
          latex: "HR = \\frac{60}{RR_{\\text{seconds}}}",
          annotation:
            "On a real ECG, you measure the RR interval (peak-to-peak) and divide 60 by it. Quick clinical trick: count the big squares between two R-waves — at standard 25 mm/s paper speed, HR ≈ 300 / (number of big squares).",
        },
      ],
      nextPrompt: "Now show me how to control all this with my voice and hands.",
      annotations: [
        { kind: "sticky", content: "P  = atria fire\nQRS = ventricles fire\nT  = ventricles reset", anchor: "right", color: "#dcfce7" },
        { kind: "text",   content: "Big square trick:\nHR ≈ 300 / squares between R-waves", anchor: "below", offsetY: -8 },
      ],
    },

    // ─── Module 6: Voice + gestures showcase ─────────────────────────────
    voiceGesturesModule("the heart from chambers to ECG"),
  ],
};
