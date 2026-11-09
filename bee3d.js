/* The bee robot as a real 3D model, drawn in the flat style of the logo: two-tone shading,
   thick brown outlines, the face on a screen. It is built from code, there is no model file.
   The page tells it every frame where it is going; the model turns, leans and flaps by itself. */
import * as THREE from './vendor/three.module.min.js';

const hex = h => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255];
const C = {
  yellow: hex(0xffcc00), orange: hex(0xf59520), glint: hex(0xfff08a),
  brown: hex(0x66241c), brownDark: hex(0x4d1a14),
  grey: hex(0xaeb7cd), greyDark: hex(0x8790ab), white: hex(0xe6ebf5),
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a + (b - a) * t;

/* How far one unit of the model is: the head is two units wide. The canvas shows VIEW units. */
export const VIEW = 4.6;

const VERT = `
uniform float uGrow;
varying vec3 vN; varying vec3 vP; varying vec3 vV;
void main(){
  vec3 p = position + normal * uGrow;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalMatrix * normal; vP = position; vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform vec3 uBase, uShade, uHi, uBand, uBandShade, uL;
uniform float uCut, uHiCut, uStripes;
varying vec3 vN; varying vec3 vP; varying vec3 vV;
void main(){
  vec3 n = normalize(vN);
  float ndl = dot(n, uL);
  float w = fwidth(ndl) + 0.002;
  float lit = smoothstep(uCut - w, uCut + w, ndl);
  vec3 base = uBase, shade = uShade;
  if (uStripes > 0.5) {
    // brown and yellow bands along the tail, bent into a V like on the logo
    float d = -vP.y + 0.24 * abs(vP.x);
    float e = fwidth(d) + 0.002;
    float band = smoothstep(0.98 - e, 0.98 + e, d) - smoothstep(1.2 - e, 1.2 + e, d) + smoothstep(1.44 - e, 1.44 + e, d);
    base = mix(base, uBand, band); shade = mix(shade, uBandShade, band);
  }
  vec3 c = mix(shade, base, lit);
  float sp = dot(n, normalize(uL + normalize(vV)));
  float sw = fwidth(sp) + 0.001;
  c = mix(c, uHi, smoothstep(uHiCut - sw, uHiCut + sw, sp));
  gl_FragColor = vec4(c, 1.0);
}`;
const LIGHT = new THREE.Vector3(0.5, 0.55, 0.67).normalize();

function toon(o) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: {
      uGrow: {value: 0}, uL: {value: LIGHT},
      uBase: {value: new THREE.Vector3(...o.base)}, uShade: {value: new THREE.Vector3(...o.shade)},
      uHi: {value: new THREE.Vector3(...(o.hi || o.base))}, uHiCut: {value: o.hi ? (o.hiCut || 0.965) : 2},
      uBand: {value: new THREE.Vector3(...(o.band || o.base))}, uBandShade: {value: new THREE.Vector3(...(o.bandShade || o.shade))},
      uCut: {value: o.cut === undefined ? -0.12 : o.cut}, uStripes: {value: o.band ? 1 : 0},
    },
  });
}
const INK = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: {uGrow: {value: 0.07}, uInk: {value: new THREE.Vector3(...C.brown)}},
  vertexShader: `uniform float uGrow; void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * uGrow, 1.0); }`,
  fragmentShader: `uniform vec3 uInk; void main(){ gl_FragColor = vec4(uInk, 1.0); }`,
});
/* A solid part with its outline: the same shape once more, a little bigger, drawn inside out. */
function solid(geo, mat, ink = 0.07) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, mat));
  if (ink) {
    const m = INK.clone(); m.uniforms.uGrow.value = ink;
    g.add(new THREE.Mesh(geo, m));
  }
  return g;
}

/* A rounded box: |x/rx|^k + |y/ry|^k + |z/rz|^k = 1. k = 2 is a ball, higher is boxier. */
const HEAD = {rx: 1.0, ry: 0.95, rz: 0.86, k: 2.9};
function squircle({rx, ry, rz, k}, ws = 64, hs = 48) {
  const geo = new THREE.SphereGeometry(1, ws, hs);
  const p = geo.attributes.position, n = geo.attributes.normal, e = 2 / k;
  const pw = (v, q) => Math.sign(v) * Math.pow(Math.abs(v), q);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setXYZ(i, rx * pw(x, e), ry * pw(y, e), rz * pw(z, e));
    v.set(pw(x, 2 - e) / rx, pw(y, 2 - e) / ry, pw(z, 2 - e) / rz).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return geo;
}
/* The screen: a patch that follows the front of the head, with the face drawn on it. */
function screenPatch({rx, ry, rz, k}, x0, x1, y0, y1, lift = 0.012) {
  const nx = 28, ny = 18, pos = [], uv = [], idx = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const u = i / nx, v = j / ny, x = mix(x0, x1, u), y = mix(y0, y1, v);
    const ax = Math.abs(x / rx), ay = Math.abs(y / ry);
    const z = rz * Math.pow(Math.max(1e-4, 1 - Math.pow(ax, k) - Math.pow(ay, k)), 1 / k);
    const n = new THREE.Vector3(Math.sign(x) * Math.pow(ax, k - 1) / rx, Math.sign(y) * Math.pow(ay, k - 1) / ry, Math.pow(z / rz, k - 1) / rz).normalize();
    pos.push(x + n.x * lift, y + n.y * lift, z + n.z * lift); uv.push(u, v);
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    idx.push(a, b, d, a, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

function canvasTex(w, h) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 8; tex.premultiplyAlpha = true;
  return {cv, g: cv.getContext('2d'), tex};
}
const css = c => `rgb(${c.map(v => Math.round(v * 255)).join(',')})`;

/* The face on the screen: two blue eyes that look around and blink, red when there is an alarm, Z Z when asleep. */
function drawFace(f, s) {
  const {g, cv} = f, W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  g.fillStyle = css(C.brown);
  g.beginPath(); g.roundRect(3, 3, W - 6, H - 6, H * 0.3); g.fill();
  const ew = W * 0.16, eh = H * 0.56, cy = H * 0.47 + s.ly * H * 0.07;
  for (const side of [-1, 1]) {
    const cx = W * 0.5 + side * W * 0.165 + s.lx * W * 0.045;
    if (s.sleep) {
      const zw = ew * 1.15, zh = eh * 0.42;
      g.save(); g.translate(cx, cy + H * 0.02); g.rotate(-0.1);
      g.strokeStyle = '#58b6f5'; g.lineWidth = H * 0.065; g.lineJoin = 'miter'; g.lineCap = 'butt';
      g.beginPath(); g.moveTo(-zw / 2, -zh / 2); g.lineTo(zw / 2, -zh / 2); g.lineTo(-zw / 2, zh / 2); g.lineTo(zw / 2, zh / 2); g.stroke();
      g.restore();
      continue;
    }
    const h = eh * s.open;
    g.fillStyle = s.alarm ? (s.flash ? '#b3261e' : '#ff5b4d') : '#66c4ff';
    g.beginPath(); g.roundRect(cx - ew / 2, cy - h / 2, ew, h, Math.min(ew / 2, h / 2)); g.fill();
    if (s.open > 0.5) {
      // the cheek that pushes the eye up into a smile
      g.fillStyle = css(C.brown);
      g.beginPath(); g.ellipse(cx - ew * 0.06, cy + h / 2 + ew * 0.16, ew * 0.56, ew * 0.5, 0, 0, 6.3); g.fill();
    }
  }
  f.tex.needsUpdate = true;
}

function drawWing(f, small) {
  const {g, cv} = f, W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  const lw = H * 0.075;
  // a drop: narrow where it joins the body, round at the tip
  const path = () => { g.beginPath(); g.moveTo(lw, H * 0.56); g.bezierCurveTo(W * 0.18, -H * 0.12, W * 0.98, -H * 0.1, W - lw, H * 0.45); g.bezierCurveTo(W * 1.0, H * 0.95, W * 0.5, H * 1.08, lw, H * 0.56); g.closePath(); };
  path(); g.fillStyle = '#a8dcf6'; g.fill();
  g.save(); path(); g.clip();
  g.fillStyle = '#5ab2ec';
  g.beginPath(); g.ellipse(W * 0.5, H * 0.6, W * 0.3, H * 0.27, -0.12, 0, 6.3); g.fill();
  g.strokeStyle = css(C.brown); g.lineWidth = lw * 0.8; g.lineCap = 'round';
  g.beginPath(); g.moveTo(lw, H * 0.56); g.quadraticCurveTo(W * 0.5, H * (small ? 0.42 : 0.3), W * 0.93, H * 0.5); g.stroke();
  if (!small) { g.beginPath(); g.moveTo(W * 0.62, H * 0.42); g.quadraticCurveTo(W * 0.7, H * 0.72, W * 0.6, H * 0.97); g.stroke(); }
  g.restore();
  path(); g.strokeStyle = css(C.brown); g.lineWidth = lw; g.lineJoin = 'round'; g.stroke();
  f.tex.needsUpdate = true;
}

/* A value that follows its goal like a weight on a spring. */
class Spring {
  constructor(v, k, d) { this.v = v; this.goal = v; this.s = 0; this.k = k; this.d = d; }
  step(dt) { this.s += ((this.goal - this.v) * this.k - this.s * this.d) * dt; this.v += this.s * dt; return this.v; }
  snap() { this.v = this.goal; this.s = 0; }
}

export function createBee(canvas) {
  const renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'low-power'});
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // colours are written as they are in the logo
  renderer.setClearColor(0, 0);
  const scene = new THREE.Scene();
  const fov = 26, dist = VIEW / 2 / Math.tan(fov * Math.PI / 360);
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.5, 50);
  camera.position.z = dist;

  const yellow = toon({base: C.yellow, shade: C.orange, hi: C.glint});
  const tailMat = toon({base: C.yellow, shade: C.orange, band: C.brown, bandShade: C.brownDark});
  const grey = toon({base: C.grey, shade: C.greyDark, hi: C.white, hiCut: 0.975});
  const ink = new THREE.MeshBasicMaterial({color: new THREE.Color().setRGB(...C.brown, THREE.LinearSRGBColorSpace)});

  const root = new THREE.Group(); scene.add(root);          // size, squash, place in depth
  const turn = new THREE.Group(); root.add(turn);           // where the bee faces
  turn.rotation.order = 'YXZ'; turn.position.y = 0.28;

  // head with the screen, the ear pieces and the antennae
  const head = new THREE.Group(); turn.add(head);
  head.add(solid(squircle(HEAD), yellow));
  const face = canvasTex(512, 320);
  const screen = new THREE.Mesh(screenPatch(HEAD, -0.88, 0.88, -0.62, 0.42),
    new THREE.MeshBasicMaterial({map: face.tex, transparent: true, premultipliedAlpha: true, depthWrite: false}));
  head.add(screen);
  for (const side of [-1, 1]) {
    const ear = solid(squircle({rx: 0.13, ry: 0.36, rz: 0.27, k: 2.6}, 24, 16), grey, 0.06);
    ear.position.set(side * 0.99, -0.04, -0.02); head.add(ear);
  }
  const antennae = [-1, 1].map(side => {
    const a = new THREE.Group(); a.position.set(side * 0.36, 0.84, 0.06);
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.72, 10), ink); stalk.position.y = 0.34; a.add(stalk);
    const ball = solid(new THREE.SphereGeometry(0.19, 24, 16), yellow, 0.06); ball.position.y = 0.76; a.add(ball);
    head.add(a);
    return {g: a, side, x: new Spring(0, 120, 9), z: new Spring(0, 120, 9)};
  });

  // tail: hangs under the head when the bee hovers, trails behind it in flight
  const tail = new THREE.Group(); turn.add(tail);
  const prof = new THREE.SplineCurve([[0.02, 1.74], [0.2, 1.68], [0.44, 1.5], [0.67, 1.22], [0.82, 0.92], [0.86, 0.62], [0.78, 0.3], [0.55, 0.05]].map(p => new THREE.Vector2(p[0], -p[1]))).getPoints(40);
  const tailGeo = new THREE.LatheGeometry(prof, 56); tailGeo.scale(1, 1, 0.9);
  tail.add(solid(tailGeo, tailMat));
  const sting = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.36, 16), ink); sting.rotation.x = Math.PI; sting.position.y = -1.86; tail.add(sting);

  // wings: two on each side, joined behind the head
  const wingTex = [canvasTex(256, 160), canvasTex(256, 160)];
  drawWing(wingTex[0], false); drawWing(wingTex[1], true);
  const wingMat = wingTex.map(t => new THREE.MeshBasicMaterial({map: t.tex, transparent: true, premultipliedAlpha: true, side: THREE.DoubleSide, depthWrite: false, alphaTest: 0.01}));
  const wings = [-1, 1].map(side => {
    const mirror = new THREE.Group(); mirror.scale.x = side; mirror.position.set(side * 0.5, 0.12, -0.5); turn.add(mirror);
    const g = new THREE.Group(); g.rotation.order = 'YZX'; mirror.add(g);
    const up = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1).translate(0.89, 0, 0), wingMat[0]); up.rotation.z = 0.2; g.add(up);
    const low = new THREE.Mesh(new THREE.PlaneGeometry(1.46, 0.86).translate(0.72, 0, 0), wingMat[1]); low.rotation.z = -0.82; low.position.set(0.02, -0.12, -0.03); g.add(low);
    return {g, up, low, side};
  });

  // speed lines that trail behind the bee in flight
  const lines = new THREE.Group(); scene.add(lines);
  const lineMat = new THREE.MeshBasicMaterial({color: ink.color, transparent: true, opacity: 0});
  [[0.75, 0.62, 0.5], [0.2, 0.9, 0.36], [-0.5, 0.7, 0.44], [-0.95, 0.4, 0.3]].forEach(([y, len, off]) => {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, len, 4, 8).rotateZ(Math.PI / 2), lineMat);
    m.position.set(-1.5 - off - len / 2, y, 0); lines.add(m);
  });

  const S = {
    fly: new Spring(0, 60, 13), sleep: new Spring(0, 30, 10),
    yaw: new Spring(0, 55, 10.5), pitch: new Spring(0, 70, 12), roll: new Spring(0, 70, 11),
    squash: new Spring(0, 260, 13), depth: new Spring(0, 30, 10), lx: new Spring(0, 90, 16), ly: new Spring(0, 90, 16),
  };
  let faceKey = '', wasFly = false, flap = 0, first = true, lineDir = 1;

  function size(cssPx, dpr) {
    renderer.setPixelRatio(dpr); renderer.setSize(cssPx, cssPx, false);
  }

  /* s: {now, dt, scale, pose: 'front'|'fly'|'sleep', dir: -1|1, vx, vy (in bee widths per second),
        lookX, lookY (-1..1), alarm, still} */
  function frame(s) {
    const dt = Math.min(0.05, s.dt), t = s.now / 1000, still = s.still;
    const flying = s.pose === 'fly', asleep = s.pose === 'sleep';
    S.fly.goal = flying ? 1 : 0; S.sleep.goal = asleep ? 1 : 0;
    S.lx.goal = flying || asleep ? 0 : s.lookX; S.ly.goal = flying || asleep ? 0 : s.lookY;
    // In flight the bee turns its side to you and points where it is going; hovering, it faces you and follows the pointer.
    S.yaw.goal = flying ? s.dir * 1.08 : S.lx.v * 0.42;
    S.pitch.goal = flying ? clamp(s.vy * 0.5, -0.5, 0.55) : asleep ? 0.2 : S.ly.v * 0.26;
    S.roll.goal = asleep ? 0.13 : 0;
    S.depth.goal = flying ? 1 : 0;
    if (wasFly && !flying) S.squash.s -= 5;       // a little bounce on landing
    if (!wasFly && flying) S.squash.s += 3.5;     // and a stretch on take-off
    wasFly = flying;
    for (const k in S) { if (still || first) S[k].snap(); else S[k].step(dt); }
    first = false;
    const fly = clamp(S.fly.v, 0, 1.1), sleep = clamp(S.sleep.v, 0, 1), wake = 1 - sleep;

    const breathe = still ? 0 : Math.sin(t * 1.8) * 0.018 * sleep;
    const sq = S.squash.v;
    root.scale.set(s.scale * (1 - sq * 0.5), s.scale * (1 + sq + breathe), s.scale * (1 - sq * 0.5));
    root.position.z = S.depth.v * 1.5 * s.scale;   // it swoops towards you on the way
    const sway = still ? 0 : Math.sin(t * 0.9) * 0.06 * wake * (1 - fly);
    turn.rotation.set(S.pitch.v + (still ? 0 : Math.sin(t * 2.3) * 0.03 * fly), S.yaw.v + sway, S.roll.v - S.yaw.s * 0.05 * fly);
    tail.rotation.x = fly * 1.36 + (still ? 0 : Math.sin(t * 2.3 + 1) * 0.05 * fly) - S.pitch.s * 0.02;
    head.rotation.z = sleep * 0.05;

    // wings: a buzz around the body when hovering, raised and beating in flight, folded down in sleep
    flap += dt * (still ? 0 : mix(52, 74, fly)) * wake;
    const beat = Math.sin(flap);
    for (const w of wings) {
      const raise = mix(0, 0.9, fly) - 0.3 * sleep + beat * mix(0.07, 0.34, fly) * wake + (still ? 0 : Math.sin(t * 1.8) * 0.03 * sleep);
      const sweep = mix(0.12, 0.62, fly) + 0.2 * sleep + beat * mix(0.3, 0.1, fly) * wake;
      w.g.rotation.set(beat * 0.25 * fly, sweep, raise);
      w.low.rotation.z = -0.82 + 0.5 * fly;
    }
    // antennae lag behind every move and nod along
    for (const a of antennae) {
      a.x.goal = -S.pitch.s * 0.05 + fly * 0.35 + sleep * 0.3; a.z.goal = S.yaw.s * 0.06;
      if (still) { a.x.snap(); a.z.snap(); } else { a.x.step(dt); a.z.step(dt); }
      const idle = still ? 0 : Math.sin(t * (a.side > 0 ? 2.2 : 2.5) + a.side) * 0.07 * wake + (s.alarm ? Math.sin(t * 18 + a.side) * 0.08 : 0);
      a.g.rotation.set(a.x.v, 0, -a.side * (0.2 + 0.28 * sleep) + a.z.v + idle);
    }

    const blink = !still && !asleep && (t % 4.2) > 4.05;
    const st = {sleep: sleep > 0.55, alarm: !!s.alarm && !flying, flash: !still && Math.floor(t * 4) % 2 === 1, open: blink ? 0.1 : 1,
      lx: Math.round(S.lx.v * 6) / 6, ly: Math.round(S.ly.v * 6) / 6};
    const key = [st.sleep, st.alarm, st.alarm && st.flash, st.open, st.lx, st.ly].join();
    if (key !== faceKey) { faceKey = key; drawFace(face, st); }

    const sp = Math.hypot(s.vx, s.vy);
    lineMat.opacity = still ? 0 : clamp((sp - 0.5) * 1.2, 0, 1) * clamp(fly, 0, 1);
    if (lineMat.opacity > 0.01) {
      if (Math.abs(S.yaw.v) > 0.3) lineDir = Math.sign(S.yaw.v);
      lines.visible = true; lines.scale.set(s.scale * lineDir, s.scale, s.scale);
      lines.position.z = root.position.z; lines.rotation.z = Math.atan2(-s.vy, Math.abs(s.vx) + 0.5) * lineDir * 0.6;
    } else lines.visible = false;

    renderer.render(scene, camera);
  }
  return {size, frame, renderer};
}
