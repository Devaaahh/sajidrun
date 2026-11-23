/* SAJID RUN — can he escape from Pranav and Ashwin?
 * A lane-runner through an imaginary college, built with three.js (r128).
 */
"use strict";
function main() {

  // ------------------------------------------------------------------ constants
  const LANES = [-2.4, 0, 2.4];
  const SEG_LEN = 40;
  const NUM_SEG = 7;
  const GATE_EVERY = 600;
  const GRAVITY = 34;
  const JUMP_V = 11.5;
  const SLIDE_TIME = 0.75;
  const STUMBLE_TIME = 4.5;
  const CHASE_FAR = 4.0;   // how far behind the catchers normally run
  const CHASE_NEAR = 1.9;  // after a stumble
  const MAGNET_TIME = 10;

  const $ = (s) => document.querySelector(s);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

  // ------------------------------------------------------------------ renderer
  const canvas = $("#game");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const SKY = 0xa9dcff;
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 45, 150);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x9fbf7a, 0.6));
  const sun = new THREE.DirectionalLight(0xfff4e0, 0.5);
  sun.position.set(6, 12, 5);
  scene.add(sun);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 1 ? 78 : 60;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  // ------------------------------------------------------------------ helpers
  const geoBox = new THREE.BoxGeometry(1, 1, 1);
  const matCache = new Map();
  function lambert(color) {
    const key = "l" + color;
    if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color }));
    return matCache.get(key);
  }
  function box(w, h, d, mat) {
    const m = new THREE.Mesh(geoBox, mat);
    m.scale.set(w, h, d);
    return m;
  }
  function canvasTex(w, h, draw) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  const texCache = new Map();
  function signTex(text, bg = "#ff7a00", fg = "#ffffff", w = 512, h = 128) {
    const key = [text, bg, fg, w, h].join("|");
    if (texCache.has(key)) return texCache.get(key);
    const t = canvasTex(w, h, (g) => {
      g.fillStyle = "#1d1442";
      roundRect(g, 0, 0, w, h, 18); g.fill();
      g.fillStyle = bg;
      roundRect(g, 6, 6, w - 12, h - 12, 14); g.fill();
      g.fillStyle = fg;
      g.textAlign = "center"; g.textBaseline = "middle";
      let size = h * 0.5;
      do { g.font = `${size}px Bungee, Impact, sans-serif`; size -= 2; }
      while (g.measureText(text).width > w - 40 && size > 10);
      g.fillText(text, w / 2, h / 2 + 3);
    });
    texCache.set(key, t);
    return t;
  }
  function signMesh(text, width, height, bg, fg) {
    const ratio = width / height;
    const tex = signTex(text, bg, fg, 512, Math.round(512 / ratio));
    return new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true })
    );
  }

  // ------------------------------------------------------------------ textures
  const trackTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#ead7b4"; g.fillRect(0, 0, w, h);
    // paving tiles
    for (let y = 0; y < h; y += 32) {
      for (let x = 0; x < w; x += 32) {
        const off = (y / 32) % 2 ? 16 : 0;
        g.fillStyle = `hsl(36, 45%, ${80 + Math.random() * 6}%)`;
        g.fillRect(x + off + 1, y + 1, 30, 30);
      }
    }
    // lane separators
    g.fillStyle = "#b68fd8";
    [w / 3, (2 * w) / 3].forEach((x) => g.fillRect(x - 3, 0, 6, h));
    g.fillStyle = "#ffffff";
    [w / 3, (2 * w) / 3].forEach((x) => { g.fillRect(x - 1, 0, 2, h * 0.45); });
    g.fillStyle = "#7a5aa6";
    g.fillRect(0, 0, 6, h); g.fillRect(w - 6, 0, 6, h);
  });
  trackTex.wrapS = trackTex.wrapT = THREE.RepeatWrapping;
  trackTex.repeat.set(1, SEG_LEN / 8);

  const grassTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#8fd16a"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `hsl(${95 + Math.random() * 30}, 50%, ${42 + Math.random() * 18}%)`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 5);
    }
    const flowers = ["#ff8fab", "#fff", "#ffd166", "#c77dff"];
    for (let i = 0; i < 40; i++) {
      g.fillStyle = pick(flowers);
      g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 3, 0, 7); g.fill();
    }
  });
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
  grassTex.repeat.set(6, 6);

  const shadowTex = canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(0,0,0,0.45)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
  function shadow(size) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size * 0.7), shadowMat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.03;
    return m;
  }

  const BUILDING_COLORS = ["#ffb4a2", "#b5e48c", "#a0c4ff", "#ffd6a5", "#cdb4db", "#9bf6ff", "#fdffb6", "#ffc8dd"];
  function buildingMat(color, floors, width) {
    const key = `b${color}${floors}${width}`;
    if (matCache.has(key)) return matCache.get(key);
    const cols = Math.max(2, Math.round(width / 2.6));
    const tex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = color; g.fillRect(0, 0, w, h);
      const fh = h / floors, cw = w / cols;
      for (let f = 0; f < floors; f++) {
        g.fillStyle = "rgba(0,0,0,0.08)";
        g.fillRect(0, f * fh, w, 3);
        for (let c = 0; c < cols; c++) {
          const x = c * cw + cw * 0.2, y = f * fh + fh * 0.22;
          const lit = Math.random() < 0.3;
          g.fillStyle = "#ffffff";
          g.fillRect(x - 2, y - 2, cw * 0.6 + 4, fh * 0.55 + 4);
          g.fillStyle = lit ? "#fff3b0" : "#5d8fd6";
          g.fillRect(x, y, cw * 0.6, fh * 0.55);
          g.fillStyle = "rgba(255,255,255,0.45)";
          g.fillRect(x, y, cw * 0.18, fh * 0.55);
        }
      }
    });
    const mats = [
      new THREE.MeshLambertMaterial({ map: tex }), new THREE.MeshLambertMaterial({ map: tex }),
      lambert(0x6c3cff), lambert(0x444444),
      new THREE.MeshLambertMaterial({ map: tex }), new THREE.MeshLambertMaterial({ map: tex }),
    ];
    matCache.set(key, mats);
    return mats;
  }

  const DEPT_NAMES = [
    "DEPT. OF DAYDREAMING", "LIBRARY OF LOST NOTES", "CANTEEN ∞", "HALL OF BUNKED CLASSES",
    "FACULTY OF IMAGINATION", "HOSTEL BLOCK Z", "EXAM CELL — RUN!", "LAB OF IMPOSSIBLE THINGS",
    "SCHOOL OF PROCRASTINATION", "CLOUD COMPUTING (REAL CLOUDS)", "ATTENDANCE OFFICE", "SAMOSA RESEARCH CENTRE",
  ];
  const SIGN_COLORS = ["#ff7a00", "#ff3d7f", "#6c3cff", "#00a896", "#e63946"];

  // ------------------------------------------------------------------ world segments
  const segments = [];
  const floaters = [];
  const treeGeo = new THREE.IcosahedronGeometry(1, 0);
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.22, 1, 6);
  const TREE_COLORS = [0xff8fab, 0xc77dff, 0x80ed99, 0x72efdd, 0xffd166, 0x9bf6ff];

  function makeSegment(index) {
    const seg = new THREE.Group();
    const track = new THREE.Mesh(new THREE.PlaneGeometry(7.4, SEG_LEN), new THREE.MeshLambertMaterial({ map: trackTex }));
    track.rotation.x = -Math.PI / 2;
    track.position.set(0, 0, -SEG_LEN / 2);
    seg.add(track);
    for (const side of [-1, 1]) {
      const grass = new THREE.Mesh(new THREE.PlaneGeometry(60, SEG_LEN), new THREE.MeshLambertMaterial({ map: grassTex }));
      grass.rotation.x = -Math.PI / 2;
      grass.position.set(side * 33.7, -0.01, -SEG_LEN / 2);
      seg.add(grass);
      const curb = box(0.5, 0.25, SEG_LEN, lambert(0xff3d7f));
      curb.position.set(side * 3.95, 0.12, -SEG_LEN / 2);
      seg.add(curb);
    }
    seg.userData.deco = new THREE.Group();
    seg.add(seg.userData.deco);
    seg.position.z = -index * SEG_LEN;
    scene.add(seg);
    decorate(seg);
    segments.push(seg);
  }

  function decorate(seg) {
    const deco = seg.userData.deco;
    for (const f of deco.children) {
      const i = floaters.indexOf(f);
      if (i >= 0) floaters.splice(i, 1);
    }
    deco.clear();
    for (const side of [-1, 1]) {
      // buildings
      let z = -rand(0, 4);
      while (z > -SEG_LEN + 6) {
        const width = pick([10, 14, 18]);
        const floors = 2 + Math.floor(Math.random() * 4);
        const height = floors * 2.8;
        const depth = 9;
        if (z - width < -SEG_LEN - 2) break;
        const b = new THREE.Mesh(geoBox, buildingMat(pick(BUILDING_COLORS), floors, width));
        b.scale.set(depth, height, width);
        b.position.set(side * (10 + depth / 2), height / 2, z - width / 2);
        deco.add(b);
        if (Math.random() < 0.7) {
          const sw = Math.min(width * 0.85, 9);
          const s = signMesh(pick(DEPT_NAMES), sw, sw / 5.5, pick(SIGN_COLORS));
          s.position.set(side * 10.05 - side * 0.02, height + sw / 11 + 0.2, z - width / 2);
          s.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
          deco.add(s);
          const pole = box(0.15, 0.4, sw * 0.8, lambert(0x1d1442));
          pole.position.set(side * 10.1, height + 0.1, z - width / 2);
          deco.add(pole);
        } else {
          // little dome tower
          const dome = new THREE.Mesh(new THREE.SphereGeometry(2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), lambert(pick(TREE_COLORS)));
          dome.position.set(side * (10 + depth / 2), height, z - width / 2);
          deco.add(dome);
        }
        z -= width + rand(1.5, 4);
      }
      // trees
      const trees = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < trees; i++) {
        const t = new THREE.Group();
        const trunk = new THREE.Mesh(trunkGeo, lambert(0x8b5a2b));
        trunk.scale.y = 1.6; trunk.position.y = 0.8;
        const top = new THREE.Mesh(treeGeo, new THREE.MeshLambertMaterial({ color: pick(TREE_COLORS), flatShading: true }));
        const s = rand(1.0, 1.6);
        top.scale.set(s, s * 1.15, s);
        top.position.y = 1.6 + s * 0.8;
        t.add(trunk, top);
        t.position.set(side * rand(5.3, 8.3), 0, -rand(2, SEG_LEN - 2));
        deco.add(t);
      }
      // lamp posts
      for (let lz = -10; lz > -SEG_LEN; lz -= 20) {
        const pole = new THREE.Mesh(trunkGeo, lambert(0x1d1442));
        pole.scale.set(0.5, 4, 0.5); pole.position.set(side * 4.5, 2, lz);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff1a8 }));
        bulb.position.set(side * 4.5, 4.15, lz);
        deco.add(pole, bulb);
      }
      // floating book
      if (Math.random() < 0.7) {
        const book = new THREE.Group();
        const cover = box(1.8, 0.35, 2.4, lambert(pick([0xe63946, 0x6c3cff, 0x00a896, 0xff7a00])));
        const pages = box(1.65, 0.28, 2.25, lambert(0xfffaf0));
        pages.position.x = 0.08;
        book.add(cover, pages);
        book.position.set(side * rand(5, 12), rand(8, 15), -rand(0, SEG_LEN));
        book.userData = { spin: rand(-0.8, 0.8), baseY: book.position.y, phase: rand(0, 6) };
        book.rotation.set(rand(-0.5, 0.5), rand(0, 6), rand(-0.4, 0.4));
        deco.add(book);
        floaters.push(book);
      }
    }
  }

  // college gate
  const gate = new THREE.Group();
  {
    const postMat = lambert(0x6c3cff);
    for (const side of [-1, 1]) {
      const p = box(0.9, 7.5, 0.9, postMat);
      p.position.set(side * 4.7, 3.75, 0);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.2, 4), lambert(0xffc531));
      cap.position.set(side * 4.7, 8.1, 0);
      cap.rotation.y = Math.PI / 4;
      gate.add(p, cap);
    }
    const beam = box(10.4, 0.6, 0.6, postMat);
    beam.position.y = 7.3;
    gate.add(beam);
    const s = signMesh("SAJID'S IMAGINARY COLLEGE", 9.2, 1.7, "#ff7a00");
    s.position.set(0, 6.2, 0.36);
    gate.add(s);
    gate.position.z = -25;
    scene.add(gate);
  }

  // sky decorations (follow the camera far away)
  const sky = new THREE.Group();
  {
    const planet = new THREE.Mesh(new THREE.SphereGeometry(9, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffb4e6, fog: false }));
    planet.position.set(-55, 45, -180);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(14, 1.2, 6, 40), new THREE.MeshBasicMaterial({ color: 0xffe08a, fog: false }));
    ring.rotation.x = 1.25; ring.position.copy(planet.position);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 12), new THREE.MeshBasicMaterial({ color: 0xb5f0ff, fog: false }));
    moon.position.set(60, 55, -170);
    sky.add(planet, ring, moon);
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0.92 });
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(rand(3, 5), 10, 8), cloudMat);
        puff.position.set(j * 4 - 6, rand(-1, 1), rand(-1, 1));
        c.add(puff);
      }
      c.position.set(rand(-120, 120), rand(28, 48), -rand(120, 200));
      sky.add(c);
    }
    scene.add(sky);
  }

  for (let i = 0; i < NUM_SEG; i++) makeSegment(i - 1);

  // ------------------------------------------------------------------ characters
  const texLoader = new THREE.TextureLoader();
  const loadTex = (url) => new Promise((res, rej) => texLoader.load(url, res, undefined, rej));

  let runner, runnerMat, runnerShadow;
  const catchers = [];

  function makeRunner(tex) {
    const aspect = tex.image.width / tex.image.height;
    const h = 2.1;
    runnerMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.15, side: THREE.DoubleSide });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(h * aspect, h), runnerMat);
    plane.position.y = h / 2;
    runner = new THREE.Group();
    runner.add(plane);
    runner.userData.plane = plane;
    runnerShadow = shadow(1.6);
    scene.add(runner, runnerShadow);
  }

  function nameTag(text, color) {
    const tex = canvasTex(256, 64, (g, w, h) => {
      g.fillStyle = color; roundRect(g, 4, 4, w - 8, h - 8, 20); g.fill();
      g.fillStyle = "#fff"; g.font = "38px Bungee, Impact, sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, w / 2, h / 2 + 2);
    });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    s.scale.set(1.3, 0.33, 1);
    s.renderOrder = 10;
    return s;
  }

  function makeCatcher(faceTex, shirt, name, tagColor) {
    const g = new THREE.Group();
    const shirtMat = lambert(shirt), pantsMat = lambert(0x2b2d42), skin = lambert(0x9c6644);
    const torso = box(0.72, 0.85, 0.42, shirtMat);
    torso.position.y = 1.18;
    g.add(torso);
    const limb = (x, y, w, h, mat) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      const m = box(w, h, w, mat);
      m.position.y = -h / 2;
      pivot.add(m);
      g.add(pivot);
      return pivot;
    };
    const legL = limb(-0.19, 0.78, 0.26, 0.78, pantsMat);
    const legR = limb(0.19, 0.78, 0.26, 0.78, pantsMat);
    const armL = limb(-0.47, 1.55, 0.2, 0.7, shirtMat);
    const armR = limb(0.47, 1.55, 0.2, 0.7, shirtMat);
    [armL, armR].forEach((a) => { const hand = box(0.2, 0.2, 0.2, skin); hand.position.y = -0.75; a.add(hand); });
    const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: faceTex }));
    head.scale.set(0.95, 0.95, 1);
    head.position.y = 2.05;
    g.add(head);
    const tag = nameTag(name, tagColor);
    tag.position.y = 2.8;
    g.add(tag);
    const sh = shadow(1.3);
    scene.add(g, sh);
    return { g, legL, legR, armL, armR, shadow: sh, phase: Math.random() * 6 };
  }

  // ------------------------------------------------------------------ obstacles & pickups
  const obstacles = [];
  const coins = [];
  const powerups = [];
  const coinGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.1, 18);
  const coinMat = new THREE.MeshLambertMaterial({ color: 0xffc531, emissive: 0x7a4f00 });
  coinGeo.rotateX(Math.PI / 2);

  const hurdleTex = canvasTex(256, 64, (g, w, h) => {
    for (let i = 0; i < 10; i++) { g.fillStyle = i % 2 ? "#e63946" : "#ffffff"; g.fillRect(i * 28 - 10, 0, 28, h); }
    g.fillStyle = "#1d1442"; g.fillRect(70, 10, 116, 44);
    g.fillStyle = "#fff"; g.font = "30px Bungee, Impact, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("EXAMS", 128, 34);
  });
  const busTex = canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = "#ffcc00"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#1d1442"; g.fillRect(0, h - 22, w, 8);
    for (let i = 0; i < 7; i++) { g.fillStyle = "#7fb7ff"; g.fillRect(20 + i * 70, 14, 56, 44); g.fillStyle = "rgba(255,255,255,.5)"; g.fillRect(20 + i * 70, 14, 14, 44); }
    g.fillStyle = "#1d1442"; g.font = "28px Bungee, Impact, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("IMAGINARY COLLEGE BUS", w / 2, 84);
  });
  const busFrontTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = "#ffcc00"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#7fb7ff"; g.fillRect(10, 10, 108, 52);
    g.fillStyle = "#fff"; g.beginPath(); g.arc(24, 92, 10, 0, 7); g.arc(104, 92, 10, 0, 7); g.fill();
    g.fillStyle = "#1d1442"; g.fillRect(40, 84, 48, 16);
  });
  const busMats = [
    new THREE.MeshLambertMaterial({ map: busTex }), new THREE.MeshLambertMaterial({ map: busTex }),
    lambert(0xf2b600), lambert(0x333333),
    new THREE.MeshLambertMaterial({ map: busFrontTex }), new THREE.MeshLambertMaterial({ map: busFrontTex }),
  ];
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14);
  wheelGeo.rotateZ(Math.PI / 2);

  function addObstacle(type, lane, z) {
    const x = LANES[lane];
    const g = new THREE.Group();
    let hb;
    if (type === "hurdle") {
      for (const s of [-1, 1]) { const p = box(0.12, 1.05, 0.12, lambert(0x1d1442)); p.position.set(s * 1.0, 0.52, 0); g.add(p); }
      const board = new THREE.Mesh(geoBox, [lambert(0xe63946), lambert(0xe63946), lambert(0xffffff), lambert(0xffffff),
        new THREE.MeshLambertMaterial({ map: hurdleTex }), new THREE.MeshLambertMaterial({ map: hurdleTex })]);
      board.scale.set(2.1, 0.5, 0.12); board.position.y = 0.8;
      g.add(board);
      hb = { w: 2.1, y0: 0, y1: 1.05, d: 0.5 };
    } else if (type === "banner") {
      for (const s of [-1, 1]) { const p = box(0.14, 2.9, 0.14, lambert(0x1d1442)); p.position.set(s * 1.12, 1.45, 0); g.add(p); }
      const b = signMesh(pick(["NO RUNNING!", "SLOW DOWN!", "WET FLOOR", "SILENCE ZONE"]), 2.3, 1.15, "#ff3d7f");
      b.position.y = 1.95;
      const back = b.clone(); back.rotation.y = Math.PI;
      g.add(b, back);
      hb = { w: 2.2, y0: 1.3, y1: 2.6, d: 0.5 };
    } else if (type === "desks") {
      const desk = box(1.9, 0.75, 1.0, lambert(0xa0522d));
      desk.position.y = 0.38;
      g.add(desk);
      const colors = [0xe63946, 0x6c3cff, 0x00a896, 0xffc531];
      for (let i = 0; i < 3; i++) {
        const bk = box(0.55, 0.12, 0.75, lambert(colors[i]));
        bk.position.set(-0.4 + i * 0.1, 0.81 + i * 0.12, 0);
        bk.rotation.y = rand(-0.3, 0.3);
        g.add(bk);
      }
      hb = { w: 1.9, y0: 0, y1: 1.05, d: 1.0 };
    } else {
      const len = 9;
      const body = new THREE.Mesh(geoBox, busMats);
      body.scale.set(2.2, 2.6, len);
      body.position.y = 1.65;
      g.add(body);
      for (const s of [-1, 1]) for (const wz of [-len / 2 + 1.6, len / 2 - 1.6]) {
        const wh = new THREE.Mesh(wheelGeo, lambert(0x222222)); wh.position.set(s * 1.05, 0.42, wz); g.add(wh);
      }
      z -= len / 2;
      hb = { w: 2.2, y0: 0, y1: 3.0, d: len };
    }
    g.position.set(x, 0, z);
    scene.add(g);
    obstacles.push({ mesh: g, type, lane, x, z, ...hb, ignore: false });
  }

  function addCoin(x, y, z) {
    const m = new THREE.Mesh(coinGeo, coinMat);
    m.position.set(x, y, z);
    scene.add(m);
    coins.push(m);
  }

  function addMagnet(x, z) {
    const g = new THREE.Group();
    const u = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.13, 8, 18, Math.PI), lambert(0xe63946));
    u.rotation.z = Math.PI;
    const tipL = box(0.27, 0.2, 0.27, lambert(0xdddddd)); tipL.position.set(-0.35, 0.05, 0);
    const tipR = tipL.clone(); tipR.position.x = 0.35;
    g.add(u, tipL, tipR);
    g.position.set(x, 1.1, z);
    scene.add(g);
    powerups.push(g);
  }

  function clearWorld() {
    for (const o of obstacles) scene.remove(o.mesh);
    for (const c of coins) scene.remove(c);
    for (const p of powerups) scene.remove(p);
    obstacles.length = coins.length = powerups.length = 0;
  }

  function spawnRow(z) {
    const diff = Math.min(1, state.dist / 2500);
    const order = [0, 1, 2].sort(() => Math.random() - 0.5);
    const nBlock = Math.random() < 0.3 + 0.4 * diff ? 2 : 1;
    const freeLane = order[2];
    for (let i = 0; i < nBlock; i++) {
      const lane = order[i];
      const r = Math.random();
      const type = r < 0.3 ? "bus" : r < 0.55 ? "hurdle" : r < 0.8 ? "banner" : "desks";
      addObstacle(type, lane, z);
      if ((type === "hurdle" || type === "desks") && Math.random() < 0.5) {
        for (let k = -3; k <= 3; k++) addCoin(LANES[lane], 1.0 + 1.1 * Math.cos((k / 3) * (Math.PI / 2)), z - k * 1.3);
      }
    }
    if (Math.random() < 0.75) {
      const n = 5 + Math.floor(Math.random() * 4);
      for (let k = 0; k < n; k++) addCoin(LANES[freeLane], 0.9, z + 4 - k * 1.6);
    } else if (Math.random() < 0.12 && state.magnetT <= 0) {
      addMagnet(LANES[freeLane], z);
    }
  }

  // ------------------------------------------------------------------ audio
  const snd = { start: $("#snd-start"), run: $("#snd-run"), caught: $("#snd-caught") };
  snd.run.volume = 0.6;
  let muted = false;
  try { muted = localStorage.getItem("sajidrun-muted") === "1"; } catch (e) { /* ignore */ }
  function applyMute() {
    Object.values(snd).forEach((a) => (a.muted = muted));
    $("#btn-mute").textContent = muted ? "🔇" : "🔊";
  }
  function playSnd(a) { a.currentTime = 0; const p = a.play(); if (p) p.catch(() => {}); }
  function stopSnd(a) { a.pause(); a.currentTime = 0; }
  // the running audio plays now and then at random, not on a loop
  const RUN_SND_FIRST = [4, 12];   // seconds after a run starts
  const RUN_SND_GAP = [10, 30];    // seconds of silence between plays
  snd.run.addEventListener("ended", () => { state.runSndT = rand(...RUN_SND_GAP); });
  applyMute();

  // ------------------------------------------------------------------ game state
  const state = {
    mode: "loading",
    z: 0, x: 0, y: 0, vy: 0,
    lane: 1, prevLane: 1,
    slideT: 0, stumbleT: 0, magnetT: 0,
    speed: 10, dist: 0, coins: 0, time: 0,
    chaseD: CHASE_NEAR, caughtT: 0,
    nextRowZ: -50, shake: 0, milestone: 500,
    camX: 0, runSndT: Infinity, runSndPlaying: false,
  };

  const hud = {
    score: $("#hud-score"), dist: $("#hud-dist"), coins: $("#hud-coins"),
    danger: $("#danger"), power: $("#power"), powerBar: $("#power .bar i"), toast: $("#toast"),
  };
  let toastTimer = 0;
  function toast(text) {
    hud.toast.textContent = text;
    hud.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => hud.toast.classList.remove("show"), 1300);
  }
  const score = () => Math.floor(state.dist) + state.coins * 5;

  function show(id) {
    ["#menu", "#pause", "#over", "#board", "#loading"].forEach((s) => $(s).classList.toggle("hidden", s !== id));
  }

  function startRun() {
    clearWorld();
    Object.assign(state, {
      mode: "run", y: 0, vy: 0, slideT: 0, stumbleT: 0, magnetT: 0,
      speed: 16, dist: 0, coins: 0, time: 0, chaseD: 1.2, caughtT: 0,
      nextRowZ: state.z - 45, shake: 0, milestone: 500,
    });
    runner.userData.plane.rotation.set(0, 0, 0);
    $("#hud").classList.remove("hidden");
    show(null);
    $("#save-form").classList.remove("hidden");
    $("#save-msg").textContent = "";
    stopSnd(snd.caught);
    stopSnd(snd.run);
    state.runSndT = rand(...RUN_SND_FIRST);
    playSnd(snd.start);
    toast("RUN, SAJID, RUN!");
  }

  function caught() {
    if (state.mode !== "run") return;
    state.mode = "caught";
    state.caughtT = 0;
    state.shake = 0.6;
    hud.danger.classList.add("hidden");
    stopSnd(snd.start);
    stopSnd(snd.run);
    playSnd(snd.caught);
    toast("CAUGHT!");
  }

  function gameOver() {
    state.mode = "over";
    $("#hud").classList.add("hidden");
    $("#over-score").textContent = score();
    $("#over-coins").textContent = state.coins;
    $("#over-dist").textContent = Math.floor(state.dist) + " m";
    try { $("#name").value = localStorage.getItem("sajidrun-name") || ""; } catch (e) { /* ignore */ }
    show("#over");
  }

  function stumble() {
    if (state.stumbleT > 0) { caught(); return; }
    state.stumbleT = STUMBLE_TIME;
    state.shake = 0.35;
    toast(pick(["CAREFUL!", "OOPS!", "THEY'RE CLOSE!"]));
  }

  function pause(on) {
    if (on && state.mode === "run") {
      state.mode = "paused";
      state.runSndPlaying = !snd.run.paused;
      snd.run.pause(); snd.start.pause();
      show("#pause");
    } else if (!on && state.mode === "paused") {
      state.mode = "run";
      show(null);
      if (state.runSndPlaying) { const p = snd.run.play(); if (p) p.catch(() => {}); }
    }
  }

  function toMenu() {
    clearWorld();
    stopSnd(snd.run); stopSnd(snd.caught); stopSnd(snd.start);
    state.mode = "menu";
    state.chaseD = 2.4;
    state.stumbleT = 0;
    state.y = 0; state.vy = 0; state.slideT = 0;
    if (runner) runner.userData.plane.rotation.set(0, 0, 0);
    $("#hud").classList.add("hidden");
    show("#menu");
  }

  // ------------------------------------------------------------------ input
  function moveLane(dir) {
    if (state.mode !== "run") return;
    const nl = Math.max(0, Math.min(2, state.lane + dir));
    if (nl === state.lane) { state.shake = 0.12; return; }
    state.prevLane = state.lane;
    state.lane = nl;
  }
  function jump() {
    if (state.mode !== "run") return;
    if (state.y <= 0.001) { state.vy = JUMP_V; state.slideT = 0; }
  }
  function slide() {
    if (state.mode !== "run") return;
    if (state.y > 0.001) state.vy = -JUMP_V * 1.4;
    state.slideT = SLIDE_TIME;
  }

  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    const k = e.key.toLowerCase();
    if (["arrowleft", "a"].includes(k)) moveLane(-1);
    else if (["arrowright", "d"].includes(k)) moveLane(1);
    else if (["arrowup", "w", " "].includes(k)) jump();
    else if (["arrowdown", "s"].includes(k)) slide();
    else if (k === "p" || k === "escape") pause(state.mode === "run");
    else if (k === "m") toggleMute();
    else if (k === "enter" && state.mode === "menu") startRun();
    else return;
    e.preventDefault();
  });

  let touchStart = null;
  window.addEventListener("touchstart", (e) => {
    const t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY, used: false };
  }, { passive: true });
  window.addEventListener("touchmove", (e) => {
    if (!touchStart || touchStart.used) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return;
    touchStart.used = true;
    if (Math.abs(dx) > Math.abs(dy)) moveLane(dx > 0 ? 1 : -1);
    else if (dy < 0) jump(); else slide();
  }, { passive: true });
  window.addEventListener("touchend", () => { touchStart = null; }, { passive: true });

  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem("sajidrun-muted", muted ? "1" : "0"); } catch (e) { /* ignore */ }
    applyMute();
  }

  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(true); });

  $("#btn-play").addEventListener("click", startRun);
  $("#btn-again").addEventListener("click", startRun);
  $("#btn-pause").addEventListener("click", () => pause(true));
  $("#btn-resume").addEventListener("click", () => pause(false));
  $("#btn-quit").addEventListener("click", toMenu);
  $("#btn-mute").addEventListener("click", toggleMute);

  // ------------------------------------------------------------------ leaderboard
  let boardReturn = "#menu";
  const onServer = location.protocol.startsWith("http");
  if (!onServer) $("#xlsx-link").classList.add("hidden");

  function localScores() {
    try { return JSON.parse(localStorage.getItem("sajidrun-scores") || "[]"); } catch (e) { return []; }
  }
  async function fetchScores() {
    if (onServer) {
      try { const r = await fetch("/api/scores"); if (r.ok) return await r.json(); } catch (e) { /* fall through */ }
    }
    return localScores();
  }
  function renderBoard(list) {
    const ol = $("#board-list");
    ol.innerHTML = "";
    if (!list.length) { ol.innerHTML = '<li class="muted">No scores yet. Be the first!</li>'; return; }
    for (const s of list.slice(0, 10)) {
      const li = document.createElement("li");
      const n = document.createElement("span"); n.className = "n"; n.textContent = s.name;
      const c = document.createElement("span"); c.className = "c"; c.textContent = `🪙${s.coins}`;
      const v = document.createElement("span"); v.className = "s"; v.textContent = s.score;
      li.append(n, c, v);
      ol.appendChild(li);
    }
  }
  async function openBoard(from) {
    boardReturn = from;
    show("#board");
    $("#board-list").innerHTML = '<li class="muted">Loading…</li>';
    renderBoard(await fetchScores());
  }
  $("#btn-board").addEventListener("click", () => openBoard("#menu"));
  $("#btn-board2").addEventListener("click", () => openBoard("#over"));
  $("#btn-board-close").addEventListener("click", () => show(boardReturn));

  $("#save-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("#name").value.trim().slice(0, 16);
    if (!name) return;
    try { localStorage.setItem("sajidrun-name", name); } catch (err) { /* ignore */ }
    const entry = { name, score: score(), coins: state.coins, distance: Math.floor(state.dist) };
    const msg = $("#save-msg");
    msg.textContent = "Saving…";
    let saved = false;
    if (onServer) {
      try {
        const r = await fetch("/api/scores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) });
        saved = r.ok;
      } catch (err) { /* fall through */ }
    }
    if (!saved) {
      const list = localScores();
      list.push(entry);
      list.sort((a, b) => b.score - a.score);
      try { localStorage.setItem("sajidrun-scores", JSON.stringify(list.slice(0, 10))); } catch (err) { /* ignore */ }
    }
    msg.textContent = saved ? "Saved to the leaderboard! 🏆" : "Saved on this device (start server.py for the shared board).";
    $("#save-form").classList.add("hidden");
  });

  // ------------------------------------------------------------------ update
  const PLAYER_HALF_W = 0.38;

  function overlaps(o, x, y, h, z) {
    return Math.abs(x - o.x) < PLAYER_HALF_W + o.w / 2 &&
      Math.abs(z - o.z) < 0.3 + o.d / 2 &&
      y < o.y1 && y + h > o.y0;
  }

  function update(dt) {
    state.time += dt;
    const running = state.mode === "run";
    const moving = running || state.mode === "menu";

    // random running audio
    if (running && snd.run.paused && snd.start.paused) {
      state.runSndT -= dt;
      if (state.runSndT <= 0) { state.runSndT = Infinity; playSnd(snd.run); }
    }

    // speed & forward motion
    if (running) state.speed = 16 + 20 * (1 - Math.exp(-state.dist / 1800));
    else if (state.mode === "menu") state.speed = 9;
    else state.speed = damp(state.speed, 0, 4, dt);
    const prevZ = state.z;
    state.z -= state.speed * dt;
    if (running) state.dist += state.speed * dt;

    // lateral
    const prevX = state.x;
    const targetX = state.mode === "menu" ? Math.sin(state.time * 0.6) * 1.2 : LANES[state.lane];
    state.x = damp(state.x, targetX, 16, dt);

    // vertical
    if (state.y > 0 || state.vy > 0) {
      state.vy -= GRAVITY * dt;
      state.y = Math.max(0, state.y + state.vy * dt);
      if (state.y === 0) state.vy = 0;
    }
    state.slideT = Math.max(0, state.slideT - dt);
    state.stumbleT = Math.max(0, state.stumbleT - dt);
    state.magnetT = Math.max(0, state.magnetT - dt);
    const h = state.slideT > 0 ? 0.85 : 1.8;

    // spawning & cleanup
    if (running) {
      while (state.nextRowZ > state.z - 130) {
        spawnRow(state.nextRowZ);
        state.nextRowZ -= 17 + state.speed * 0.22 + rand(0, 4);
      }
    }
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      if (o.z - o.d / 2 > state.z + 14) { scene.remove(o.mesh); obstacles.splice(i, 1); continue; }
      if (!running || o.ignore) continue;
      if (overlaps(o, state.x, state.y, h, state.z)) {
        const wasAlongside = Math.abs(prevZ - o.z) < 0.3 + o.d / 2;
        if (wasAlongside && Math.abs(prevX - o.x) >= Math.abs(state.x - o.x) - 0.001) {
          // clipped the side while changing lanes -> bounce back
          o.ignore = true;
          state.lane = state.prevLane;
          state.x = prevX;
          stumble();
        } else {
          caught();
        }
      }
    }

    // coins
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      c.rotation.y += dt * 4;
      if (c.position.z > state.z + 14) { scene.remove(c); coins.splice(i, 1); continue; }
      if (!running) continue;
      const dz = c.position.z - state.z;
      if (state.magnetT > 0 && dz < 2 && dz > -16) {
        c.position.x = damp(c.position.x, state.x, 10, dt);
        c.position.y = damp(c.position.y, state.y + 1, 10, dt);
        c.position.z = damp(c.position.z, state.z, 10, dt);
      }
      if (Math.abs(c.position.x - state.x) < 0.9 && Math.abs(c.position.z - state.z) < 0.9 &&
          c.position.y > state.y - 0.3 && c.position.y < state.y + h + 0.4) {
        scene.remove(c); coins.splice(i, 1);
        state.coins++;
      }
    }
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      p.rotation.y += dt * 3;
      p.position.y = 1.1 + Math.sin(state.time * 4) * 0.15;
      if (p.position.z > state.z + 14) { scene.remove(p); powerups.splice(i, 1); continue; }
      if (running && Math.abs(p.position.x - state.x) < 1 && Math.abs(p.position.z - state.z) < 1 && state.y < 1.8) {
        scene.remove(p); powerups.splice(i, 1);
        state.magnetT = MAGNET_TIME;
        toast("🧲 MAGNET!");
      }
    }

    // milestones
    if (running && state.dist >= state.milestone) {
      toast(pick([`${state.milestone} m! KEEP GOING!`, `${state.milestone} m — PRANAV IS TIRED!`, `${state.milestone} m — ASHWIN WANTS SAMOSA!`]));
      state.milestone += 500;
    }

    // recycle world
    for (const seg of segments) {
      if (seg.position.z - SEG_LEN > state.z + 15) {
        seg.position.z -= NUM_SEG * SEG_LEN;
        decorate(seg);
      }
    }
    if (gate.position.z > state.z + 15) gate.position.z -= GATE_EVERY;
    sky.position.z = state.z;
    sky.position.x = state.camX * 0.5;
    for (const f of floaters) {
      f.rotation.y += f.userData.spin * dt;
      f.position.y = f.userData.baseY + Math.sin(state.time + f.userData.phase) * 0.6;
    }

    // runner visuals
    if (runner) {
      const plane = runner.userData.plane;
      const sliding = state.slideT > 0;
      const bob = moving && state.y === 0 && !sliding ? Math.abs(Math.sin(state.time * 13)) * 0.12 : 0;
      runner.position.set(state.x, state.y + bob, state.z);
      if (state.mode === "caught" || state.mode === "over") {
        plane.rotation.z = damp(plane.rotation.z, 0.35, 5, dt);
        runner.position.y = 0;
      } else {
        plane.rotation.z = damp(plane.rotation.z, (state.x - targetX) * 0.25 + (moving ? Math.sin(state.time * 13) * 0.04 : 0), 12, dt);
      }
      plane.scale.y = damp(plane.scale.y, sliding ? 0.5 : 1, 20, dt);
      plane.position.y = 1.05 * plane.scale.y;
      runnerShadow.position.set(state.x, 0.03, state.z);
      const ss = 1 / (1 + state.y * 0.4);
      runnerShadow.scale.set(ss, ss, ss);
    }

    // catchers
    let target;
    if (state.mode === "caught" || state.mode === "over") target = 0.7;
    else if (state.mode === "menu") target = 2.6 + Math.sin(state.time * 0.8) * 0.4;
    else target = state.stumbleT > 0 ? CHASE_NEAR : CHASE_FAR;
    state.chaseD = damp(state.chaseD, target, state.mode === "caught" ? 4 : 1.2, dt);
    const offsets = [-0.75, 0.75];
    catchers.forEach((c, i) => {
      const cz = state.z + state.chaseD + (i === 0 ? 0 : 0.5);
      c.g.position.x = damp(c.g.position.x, state.x + offsets[i] * (state.mode === "caught" || state.mode === "over" ? 0.9 : 1), 5, dt);
      c.g.position.z = cz;
      const runSpd = state.speed > 1 ? 12 : 0;
      c.phase += dt * runSpd;
      const sw = Math.sin(c.phase) * (state.speed > 1 ? 0.9 : 0.1);
      c.legL.rotation.x = sw; c.legR.rotation.x = -sw;
      const reaching = state.mode === "caught" || state.mode === "over" || state.stumbleT > 0;
      if (reaching) {
        c.armL.rotation.x = damp(c.armL.rotation.x, -2.4 + Math.sin(c.phase * 1.5) * 0.2, 10, dt);
        c.armR.rotation.x = damp(c.armR.rotation.x, -2.4 - Math.sin(c.phase * 1.5) * 0.2, 10, dt);
      } else {
        c.armL.rotation.x = -sw; c.armR.rotation.x = sw;
      }
      c.g.position.y = state.speed > 1 ? Math.abs(Math.cos(c.phase)) * 0.1 : 0;
      c.shadow.position.set(c.g.position.x, 0.03, cz);
    });

    // camera
    state.camX = damp(state.camX, state.x * 0.7, 6, dt);
    state.shake = Math.max(0, state.shake - dt);
    const sk = state.shake * 0.5;
    const portrait = camera.aspect < 1;
    camera.position.set(
      state.camX + (Math.random() - 0.5) * sk,
      (portrait ? 7.4 : 6.5) + state.y * 0.35 + (Math.random() - 0.5) * sk,
      state.z + (portrait ? 10 : 9)
    );
    camera.lookAt(state.camX * 0.9, 1.1 + state.y * 0.3, state.z - 9);

    // caught sequence
    if (state.mode === "caught") {
      state.caughtT += dt;
      if (state.caughtT > 1.6) gameOver();
    }

    // HUD
    if (running) {
      hud.score.textContent = score();
      hud.dist.textContent = Math.floor(state.dist);
      hud.coins.textContent = state.coins;
      hud.danger.classList.toggle("hidden", state.stumbleT <= 0);
      hud.power.classList.toggle("hidden", state.magnetT <= 0);
      hud.powerBar.style.width = (state.magnetT / MAGNET_TIME) * 100 + "%";
    }
  }



  // ------------------------------------------------------------------ loop
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state.mode !== "loading" && state.mode !== "paused") update(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------------ boot
  async function boot() {
    if (!onServer) {
      $("#loading p").innerHTML = "Please start the game with <b>python server.py</b><br>and open http://localhost:8000";
      return;
    }
    const [runnerTex, f1, f2] = await Promise.all([
      loadTex("assets/runner.png"), loadTex("assets/pranav.png"), loadTex("assets/ashwin.png"),
    ]);
    makeRunner(runnerTex);
    catchers.push(makeCatcher(f1, 0x2a9d8f, "PRANAV", "#e63946"));
    catchers.push(makeCatcher(f2, 0xf4a261, "ASHWIN", "#6c3cff"));
    toMenu();
  }

  requestAnimationFrame(frame);
  boot().catch((err) => {
    console.error(err);
    $("#loading p").textContent = "Could not load the game assets. Run prepare_assets.py and restart server.py.";
  });
}

// Wait for the Bungee font so signs painted on canvases use it.
(document.fonts
  ? Promise.race([document.fonts.load("40px Bungee"), new Promise((r) => setTimeout(r, 2500))])
  : Promise.resolve()
).catch(() => {}).then(main);
