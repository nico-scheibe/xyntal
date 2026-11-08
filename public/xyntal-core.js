// Xyntal-Kern: die 3D-Marke der KI (Sechseck-Kristall mit Auge, Ringe, Partikel).
// Braucht THREE (vendor/three.min.js). API: XyntalCore.mount(canvas) -> { setState, setActive, destroy }
// Zustände: "idle" | "think" | "speak". Das Auge folgt dem Zeiger, blinzelt und weitet sich beim Sprechen.
(() => {
  "use strict";
  const mount = (canvas) => {
    if (!window.THREE) return null;
    const THREE = window.THREE;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch { return null; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, 9);

    const C_ACCENT = new THREE.Color(0x7b84ff), C_ACCENT2 = new THREE.Color(0xa68bff), C_GLINT = new THREE.Color(0x8fe3ff);

    const glowTex = (() => {
      const s = 128, cv = document.createElement("canvas"); cv.width = cv.height = s;
      const g = cv.getContext("2d"), grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.25, "rgba(255,255,255,0.45)"); grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd; g.fillRect(0, 0, s, s);
      return new THREE.CanvasTexture(cv);
    })();

    const core = new THREE.Group(); scene.add(core);
    const disposables = [glowTex];
    const track = (o) => { disposables.push(o); return o; };

    const prism = (radius, depth, color, faceOpacity, edgeOpacity) => {
      const geo = track(new THREE.CylinderGeometry(radius, radius, depth, 6));
      geo.rotateX(Math.PI / 2); geo.rotateZ(Math.PI / 6);
      const g = new THREE.Group();
      g.add(new THREE.Mesh(geo, track(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: faceOpacity, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }))));
      g.add(new THREE.LineSegments(track(new THREE.EdgesGeometry(geo)), track(new THREE.LineBasicMaterial({ color, transparent: true, opacity: edgeOpacity, blending: THREE.AdditiveBlending }))));
      return g;
    };
    const outer = prism(1.55, 0.5, C_ACCENT, 0.07, 0.95), inner = prism(0.95, 0.9, C_ACCENT2, 0.05, 0.7);
    core.add(outer, inner);

    const eye = new THREE.Group(); core.add(eye);
    eye.add(new THREE.Mesh(track(new THREE.SphereGeometry(0.42, 32, 32)), track(new THREE.MeshBasicMaterial({ color: 0xcfd6ff }))));
    const halo = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glowTex, color: C_ACCENT, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })));
    halo.scale.set(3.4, 3.4, 1); eye.add(halo);
    const pupilGroup = new THREE.Group();
    pupilGroup.add(new THREE.Mesh(track(new THREE.RingGeometry(0.17, 0.26, 40)), track(new THREE.MeshBasicMaterial({ color: C_ACCENT, side: THREE.DoubleSide }))));
    pupilGroup.add(new THREE.Mesh(track(new THREE.CircleGeometry(0.15, 32)), track(new THREE.MeshBasicMaterial({ color: 0x080a1c }))));
    pupilGroup.position.z = 0.43; eye.add(pupilGroup);

    const ring = (r, tilt, color, opacity) => {
      const m = new THREE.Mesh(track(new THREE.TorusGeometry(r, 0.014, 8, 160)), track(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })));
      const g = new THREE.Group(); m.rotation.x = Math.PI / 2; g.add(m); g.rotation.set(tilt[0], tilt[1], tilt[2]); return g;
    };
    const ringA = ring(2.15, [0.5, 0, 0.2], C_ACCENT, 0.6), ringB = ring(2.55, [-0.9, 0.4, 0], C_ACCENT2, 0.45);
    core.add(ringA, ringB);

    const arc = new THREE.Mesh(track(new THREE.TorusGeometry(1.8, 0.05, 8, 64, Math.PI * 0.55)), track(new THREE.MeshBasicMaterial({ color: C_GLINT, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })));
    core.add(arc);

    const N = 260, base = new Float32Array(N * 3), pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const r = 2.2 + Math.random() * 1.3, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      base[i * 3] = r * Math.sin(ph) * Math.cos(th); base[i * 3 + 1] = r * Math.cos(ph) * 0.8; base[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      seed[i] = Math.random();
    }
    const pGeo = track(new THREE.BufferGeometry()); pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pMat = track(new THREE.PointsMaterial({ map: glowTex, color: C_GLINT, size: 0.2, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
    const swarm = new THREE.Points(pGeo, pMat); scene.add(swarm);

    let state = "idle", active = true, raf = 0, time = 0, last = 0;
    const S = { think: 0, speak: 0 }, pointer = { x: 0, y: 0, tx: 0, ty: 0 }, blink = { next: 2.2, t: -1 };

    const onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      pointer.tx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2)));
      pointer.ty = Math.max(-1, Math.min(1, -(e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2)));
    };
    window.addEventListener("pointermove", onMove);

    const resize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      if (canvas.width !== Math.round(w * renderer.getPixelRatio())) renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    };

    const frame = (now) => {
      raf = 0;
      if (!active) return;
      const dt = Math.min((now - (last || now)) / 1000, 0.05); last = now; time += dt;
      resize();
      const k = 1 - Math.pow(0.001, dt * 2);
      S.think += ((state === "think" ? 1 : 0) - S.think) * k;
      S.speak += ((state === "speak" ? 1 : 0) - S.speak) * k;
      pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 5); pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 5);

      const spin = 0.25 + S.think * 1.4 + S.speak * 0.4;
      core.rotation.y += (pointer.x * 0.5 - core.rotation.y) * Math.min(1, dt * 3);
      core.rotation.x += (-pointer.y * 0.35 - core.rotation.x) * Math.min(1, dt * 3);
      outer.rotation.z += dt * 0.12 * (1 + S.think * 4); inner.rotation.z -= dt * 0.3 * (1 + S.think * 5);
      inner.rotation.y = Math.sin(time * 0.6) * 0.5;
      ringA.rotation.y += dt * spin * 0.8; ringB.rotation.y -= dt * spin * 0.55; ringB.rotation.z += dt * spin * 0.2;
      arc.rotation.z -= dt * (2.2 + S.think * 3); arc.material.opacity = S.think * 0.95;

      const breath = 1 + Math.sin(time * (1.6 + S.think * 4)) * (0.04 + S.think * 0.05);
      const talk = S.speak * (0.5 + 0.5 * Math.sin(time * 11) * Math.sin(time * 4.3)) * 0.22;
      const scale = breath + talk;
      let lid = 1;
      blink.next -= dt;
      if (blink.next <= 0 && blink.t < 0) blink.t = 0;
      if (blink.t >= 0) {
        blink.t += dt; lid = 1 - Math.sin(Math.min(blink.t / 0.22, 1) * Math.PI) * 0.92;
        if (blink.t > 0.22) { blink.t = -1; blink.next = 2 + Math.random() * 3.5; }
      }
      eye.scale.set(scale, scale * lid, scale);
      const look = 0.2 * (1 - S.think * 0.6);
      pupilGroup.position.x += (pointer.x * look - pupilGroup.position.x) * Math.min(1, dt * 8);
      pupilGroup.position.y += (pointer.y * look - pupilGroup.position.y) * Math.min(1, dt * 8);
      const pr = 1 + S.speak * 0.35 - S.think * 0.25 + Math.sin(time * 2) * 0.03;
      pupilGroup.scale.set(pr, pr, 1);
      halo.material.opacity = 0.7 + Math.sin(time * 2.2) * 0.12 + S.speak * 0.25;
      halo.scale.setScalar(3.4 + S.think * 0.5 + talk * 4);
      halo.material.color.copy(C_ACCENT).lerp(C_GLINT, S.think * 0.7);

      const contract = 1 - S.think * (0.32 + Math.sin(time * 5) * 0.04);
      for (let i = 0; i < N; i++) {
        const bx = base[i * 3], by = base[i * 3 + 1], bz = base[i * 3 + 2], d = Math.sqrt(bx * bx + by * by + bz * bz);
        const wave = S.speak * Math.sin(d * 3 - time * 6 + seed[i] * 2) * 0.22;
        const f = contract * (1 + wave / d * 4) + Math.sin(time * 0.5 + seed[i] * 6.28) * 0.025;
        pos[i * 3] = bx * f; pos[i * 3 + 1] = by * f; pos[i * 3 + 2] = bz * f;
      }
      pGeo.attributes.position.needsUpdate = true;
      swarm.rotation.y += dt * (0.05 + S.think * 0.7);
      pMat.opacity = 0.6 + S.think * 0.25 + S.speak * 0.15;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    const start = () => { if (!raf && active) { last = 0; raf = requestAnimationFrame(frame); } };
    start();

    return {
      setState(s) { state = s; },
      // Zeichnet nur, solange der Kern sichtbar ist (Chat geschlossen oder Tab im Hintergrund = keine GPU-Last).
      setActive(a) { active = a; if (a) start(); else if (raf) { cancelAnimationFrame(raf); raf = 0; } },
      destroy() {
        active = false; if (raf) cancelAnimationFrame(raf); raf = 0;
        window.removeEventListener("pointermove", onMove);
        disposables.forEach((d) => d.dispose && d.dispose());
        renderer.dispose();
      },
    };
  };
  window.XyntalCore = { mount };
})();
