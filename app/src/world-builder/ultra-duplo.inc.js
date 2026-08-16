/*
 * ULTRA DUPLO fuer den BEUTELTIER World Builder.
 *
 * Diese Datei wird von vite.config.ts DIREKT in das bestehende Modul von
 * world-builder.html injiziert. Deshalb darf sie die internen Editor-Funktionen
 * (objectsRoot, createPrimitive, bauObjekt, selectObject, ...) benutzen.
 *
 * Idee: Das Messegelaende wird zuerst als Handvoll grober, gut greifbarer
 * Bauklotze zusammengesteckt. Jeder Klotz kennt seinen semantischen Inhalt.
 * Ein Doppelklick klappt den Klotz in die heute vorhandenen Bauplan-Details
 * auf. Spaeter kann derselbe Link auf eine Blender-/GLB-Datei zeigen, ohne die
 * Bedienung noch einmal zu aendern.
 */

const ULTRA_DUPLO_PREFIX = '🧱 ';
const ultraDuploGlbLinks = new Map();
let ultraDuploActive = false;

function ultraDuploHallColor(index) {
  const palette = ['#e65a4f', '#f0a43a', '#e7cf46', '#65b86d', '#4e9fc5', '#6d79cc', '#9a65c2', '#d6689f'];
  return palette[index % palette.length];
}

function ultraDuploRectangleCorners(o) {
  const w = Math.max(.01, Number(o.breite) || 1) / 2;
  const d = Math.max(.01, Number(o.tiefe) || 1) / 2;
  const a = THREE.MathUtils.degToRad(Number(o.drehung) || 0);
  const c = Math.cos(a), s = Math.sin(a);
  const out = [];
  for (const lx of [-w, w]) {
    for (const lz of [-d, d]) {
      // THREE.RotationY: x' = c*x + s*z; z' = -s*x + c*z.
      out.push({ x: o.x + c * lx + s * lz, z: o.z - s * lx + c * lz });
    }
  }
  return out;
}

function ultraDuploBoulevardSpec(plan) {
  const parts = plan.objekte.filter((o) => o.gruppe === 'Boulevard Nord');
  if (!parts.length) return null;

  // Hauptachse aus der Punktwolke: der Boulevard bleibt auch dann ein sauberer
  // Duplo-Stein, wenn seine Einzelteile unterschiedliche 90°-Drehungen tragen.
  let weight = 0, mx = 0, mz = 0;
  for (const o of parts) {
    const w = Math.max(1, (Number(o.breite) || 1) * (Number(o.tiefe) || 1));
    weight += w; mx += o.x * w; mz += o.z * w;
  }
  mx /= weight; mz /= weight;
  let xx = 0, zz = 0, xz = 0;
  for (const o of parts) {
    const w = Math.max(1, (Number(o.breite) || 1) * (Number(o.tiefe) || 1));
    const dx = o.x - mx, dz = o.z - mz;
    xx += w * dx * dx; zz += w * dz * dz; xz += w * dx * dz;
  }
  const axis = .5 * Math.atan2(2 * xz, xx - zz);
  const ux = Math.cos(axis), uz = Math.sin(axis);
  const vx = -uz, vz = ux;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  let y0 = Infinity, y1 = -Infinity;
  for (const o of parts) {
    for (const p of ultraDuploRectangleCorners(o)) {
      const u = p.x * ux + p.z * uz;
      const v = p.x * vx + p.z * vz;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u);
      v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    y0 = Math.min(y0, o.y - (Number(o.hoehe) || .3) / 2);
    y1 = Math.max(y1, o.y + (Number(o.hoehe) || .3) / 2);
  }
  const um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
  return {
    id: 'Boulevard Nord', label: 'Boulevard Nord', kind: 'boulevard',
    x: um * ux + vm * vx,
    y: (y0 + y1) / 2,
    z: um * uz + vm * vz,
    w: Math.max(1, u1 - u0), h: Math.max(1, y1 - y0), d: Math.max(1, v1 - v0),
    // Die 2D-Achse laeuft mit z=+sin; THREE RotationY hat z=-sin.
    rotationY: THREE.MathUtils.radToDeg(-axis),
    color: '#f2a43b',
    groups: ['Boulevard Nord'],
  };
}

function ultraDuploSpecs() {
  if (!bauplan?.objekte?.length) return [];
  const floors = bauplan.objekte.filter((o) => o.gruppe === 'Hallenplatten' && / Boden$/.test(o.name));
  const specs = floors.map((floor, index) => {
    const label = floor.name.replace(/ Boden$/, '');
    const ceiling = bauplan.objekte.find((o) => o.gruppe === 'Hallenplatten' && o.name === `${label} Decke`);
    const floorBottom = floor.y - (Number(floor.hoehe) || .3) / 2;
    const ceilingTop = ceiling
      ? ceiling.y + (Number(ceiling.hoehe) || .3) / 2
      : floorBottom + 8;
    const groups = [];
    if (bauplan.gruppen.includes(`Marken ${label}`)) groups.push(`Marken ${label}`);
    return {
      id: label, label, kind: 'hall',
      x: floor.x, y: (floorBottom + ceilingTop) / 2, z: floor.z,
      w: Number(floor.breite) || 20,
      h: Math.max(1, ceilingTop - floorBottom),
      d: Number(floor.tiefe) || 20,
      rotationY: Number(floor.drehung) || 0,
      color: ultraDuploHallColor(index),
      groups,
      shellNames: [floor.name, ceiling?.name].filter(Boolean),
    };
  });
  const boulevard = ultraDuploBoulevardSpec(bauplan);
  if (boulevard) specs.push(boulevard);
  return specs;
}

function ultraDuploFind(id) {
  return objectsRoot.children.find((o) =>
    o.userData?.duploId === id || o.userData?.duploDetailOf === id) || null;
}

function ultraDuploDecorateProxy(mesh) {
  mesh.userData.ultraDuplo = true;
  mesh.userData.opacity = .78;
  if (mesh.material) {
    mesh.material.transparent = true;
    mesh.material.opacity = .78;
    mesh.material.roughness = .48;
    mesh.material.metalness = .02;
  }
  // Schwarze Kanten machen die riesigen Kloetze auch von oben sofort lesbar.
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({ color: 0x151820, transparent: true, opacity: .9 }),
  );
  edges.raycast = () => null;
  mesh.add(edges);
}

function ultraDuploCreateProxy(spec, transform = null) {
  const wasLocked = historyLock;
  historyLock = true;
  try {
    const mesh = createPrimitive('block', {
      name: `${ULTRA_DUPLO_PREFIX}${spec.label}`,
      w: spec.w, h: spec.h, d: spec.d,
      x: spec.x, y: spec.y, z: spec.z,
      rotationY: spec.rotationY,
      color: spec.color,
    });
    mesh.userData.duploId = spec.id;
    mesh.userData.duploSpec = spec;
    mesh.userData.detailLink = ultraDuploGlbLinks.has(spec.id)
      ? { kind: 'glb', src: ultraDuploGlbLinks.get(spec.id) }
      : { kind: 'bauplan', groups: spec.groups, shellNames: spec.shellNames || [] };
    ultraDuploDecorateProxy(mesh);
    if (transform) {
      mesh.position.copy(transform.position);
      mesh.rotation.y = transform.rotationY;
      mesh.scale.set(spec.w * transform.scale.x, spec.h * transform.scale.y, spec.d * transform.scale.z);
      mesh.updateMatrixWorld(true);
    }
    return mesh;
  } finally {
    historyLock = wasLocked;
  }
}

function ultraDuploBuildAll() {
  const specs = ultraDuploSpecs();
  if (!specs.length) {
    setStatus('Ultra Duplo: Im Bauplan wurden keine Hallen gefunden.', 'bad');
    return;
  }
  pushHistory();
  clearAll(false);
  const wasLocked = historyLock;
  historyLock = true;
  try {
    for (const spec of specs) ultraDuploCreateProxy(spec);
  } finally {
    historyLock = wasLocked;
  }
  ultraDuploActive = true;
  referenceMap.visible = true;
  ui.mapVisible.checked = true;
  updateReferenceMap();
  refreshSolidComponents(); renderObjectList(); selectObject(null); focusAll(); setMode('translate');
  setStatus(`ULTRA DUPLO: ${specs.length} grobe Messe-Bausteine stehen. Klick = wählen, ziehen = verschieben, Doppelklick = Details aufklappen.`, 'good');
  ultraDuploRefreshUi();
}

function ultraDuploLinkedObjects(spec) {
  if (!bauplan?.objekte) return [];
  if (spec.kind === 'boulevard') return bauplan.objekte.filter((o) => o.gruppe === 'Boulevard Nord');
  const shell = new Set(spec.shellNames || []);
  const groups = new Set(spec.groups || []);
  return bauplan.objekte.filter((o) =>
    (o.gruppe === 'Hallenplatten' && shell.has(o.name)) || groups.has(o.gruppe));
}

async function ultraDuploExpand(spec, proxy) {
  const glbSrc = ultraDuploGlbLinks.get(spec.id);
  let assembly = null;

  if (glbSrc) {
    try {
      const gltf = await gltfLoader.loadAsync(glbSrc);
      assembly = gltf.scene;
      markEditorObject(assembly, 'assembly', `🔎 ${spec.label} · GLB`);
      // Fremde GLBs werden auf den Duplo-Klotz eingepasst; spaetere Blender-
      // Exporte koennen dadurch ohne Spezialfall an denselben Slot gehaengt werden.
      assembly.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(assembly), size = new THREE.Vector3(), centre = new THREE.Vector3();
      box.getSize(size); box.getCenter(centre);
      assembly.position.sub(centre);
      const fit = Math.min(spec.w / Math.max(size.x, .001), spec.h / Math.max(size.y, .001), spec.d / Math.max(size.z, .001));
      assembly.scale.setScalar(fit);
    } catch (err) {
      setStatus(`${spec.label}: verknuepfte GLB konnte nicht geladen werden: ${err.message}`, 'bad');
      return null;
    }
  } else {
    const linked = ultraDuploLinkedObjects(spec);
    if (!linked.length) {
      setStatus(`${spec.label}: Noch keine Detailquelle verknuepft. Der Duplo-Klotz bleibt stehen.`, 'bad');
      return null;
    }
    assembly = new THREE.Group();
    const anchor = new THREE.Vector3(spec.x, spec.y, spec.z);
    for (const o of linked) {
      try {
        const child = bauObjekt(o);
        child.userData.editorObject = false;
        child.position.sub(anchor);
        assembly.add(child);
      } catch (err) {
        console.warn('Ultra-Duplo-Detail uebersprungen:', o?.name, err);
      }
    }
    markEditorObject(assembly, 'assembly', `🔎 ${spec.label} · Details`);
  }

  const proxySize = dimensions(proxy);
  const relativeScale = new THREE.Vector3(
    proxySize.x / Math.max(spec.w, .001),
    proxySize.y / Math.max(spec.h, .001),
    proxySize.z / Math.max(spec.d, .001),
  );
  const deltaRotation = proxy.rotation.y - THREE.MathUtils.degToRad(spec.rotationY || 0);
  assembly.position.copy(proxy.position);
  assembly.rotation.y += deltaRotation;
  if (!glbSrc) assembly.scale.multiply(relativeScale);
  assembly.userData.duploDetailOf = spec.id;
  assembly.userData.duploSpec = spec;
  assembly.userData.detailLink = glbSrc
    ? { kind: 'glb', src: glbSrc }
    : { kind: 'bauplan', groups: spec.groups, shellNames: spec.shellNames || [] };
  assembly.userData.duploRelativeScale = relativeScale.toArray();

  pushHistory();
  selectObject(null);
  objectsRoot.remove(proxy); disposeObject(proxy);
  objectsRoot.add(assembly); assembly.updateMatrixWorld(true);
  refreshSolidComponents(); renderObjectList(); selectObject(assembly); focusObject(assembly);
  setStatus(`${spec.label}: Duplo-Klotz aufgeklappt. 🔎 zeigt jetzt die verknuepften Details; „Zum Block“ klappt wieder zu.`, 'good');
  ultraDuploRefreshUi();
  return assembly;
}

function ultraDuploCollapse(detail) {
  const spec = detail?.userData?.duploSpec;
  if (!spec) return null;
  const relativeScale = new THREE.Vector3(...(detail.userData.duploRelativeScale || [1, 1, 1]));
  const transform = {
    position: detail.position.clone(),
    rotationY: THREE.MathUtils.degToRad(spec.rotationY || 0) + detail.rotation.y,
    scale: relativeScale,
  };
  pushHistory();
  selectObject(null);
  objectsRoot.remove(detail); disposeObject(detail);
  const proxy = ultraDuploCreateProxy(spec, transform);
  refreshSolidComponents(); renderObjectList(); selectObject(proxy); focusObject(proxy);
  setStatus(`${spec.label}: wieder zum groben Duplo-Klotz zusammengeklappt.`, 'good');
  ultraDuploRefreshUi();
  return proxy;
}

async function ultraDuploToggleSelectedDetail() {
  if (selected?.userData?.ultraDuplo) return ultraDuploExpand(selected.userData.duploSpec, selected);
  if (selected?.userData?.duploDetailOf) return ultraDuploCollapse(selected);
  setStatus('Ultra Duplo: Erst einen Hallen-/Boulevard-Klotz auswählen.', 'bad');
  return null;
}

function ultraDuploAddOrSelect(id) {
  const existing = ultraDuploFind(id);
  if (existing) {
    selectObject(existing); focusObject(existing); ultraDuploRefreshUi(); return existing;
  }
  const spec = ultraDuploSpecs().find((s) => s.id === id);
  if (!spec) return null;
  pushHistory();
  const proxy = ultraDuploCreateProxy(spec);
  ultraDuploActive = true;
  refreshSolidComponents(); renderObjectList(); selectObject(proxy); focusObject(proxy);
  setStatus(`${spec.label} als grober Duplo-Baustein eingesetzt.`, 'good');
  ultraDuploRefreshUi();
  return proxy;
}

function ultraDuploSetSnap(m) {
  snapEnabled = true;
  ui.snapToggle.classList.add('active');
  ui.snapToggle.textContent = 'Raster an';
  ui.translateSnap.value = String(m);
  updateSnap();
  document.querySelectorAll('[data-ultra-snap]').forEach((b) => b.classList.toggle('active', Number(b.dataset.ultraSnap) === m));
  setStatus(`Ultra Duplo Raster: ${m} m. Hallen lassen sich jetzt grob wie Baukloetze zusammenschieben.`, 'good');
}

function ultraDuploRefreshPalette() {
  const palette = document.getElementById('ultraDuploPalette');
  if (!palette) return;
  palette.innerHTML = '';
  for (const spec of ultraDuploSpecs()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.duploId = spec.id;
    button.textContent = spec.kind === 'boulevard' ? '🛣 Boulevard' : spec.label.replace('Halle ', 'H ');
    button.title = `${spec.label}: einsetzen oder vorhandenen Klotz anspringen`;
    if (ultraDuploFind(spec.id)) button.classList.add('present');
    button.onclick = () => ultraDuploAddOrSelect(spec.id);
    palette.appendChild(button);
  }
}

function ultraDuploRefreshUi() {
  ultraDuploRefreshPalette();
  const details = document.getElementById('ultraDuploDetails');
  const state = document.getElementById('ultraDuploState');
  if (details) {
    details.disabled = !(selected?.userData?.ultraDuplo || selected?.userData?.duploDetailOf);
    details.textContent = selected?.userData?.duploDetailOf ? '🧱 Zum Block' : '🔎 Details';
  }
  if (state) {
    const proxies = objectsRoot.children.filter((o) => o.userData?.ultraDuplo).length;
    const detailsN = objectsRoot.children.filter((o) => o.userData?.duploDetailOf).length;
    state.textContent = `${proxies} Klotz${proxies === 1 ? '' : 'e'} · ${detailsN} aufgeklappt`;
  }
}

function ultraDuploInstallUi() {
  if (document.getElementById('ultraDuploAll')) return;
  const style = document.createElement('style');
  style.textContent = `
    #ultraDuploPalette{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin:6px 0}
    #ultraDuploPalette button{min-height:34px;padding:5px 4px;font-size:10px;border-color:#495a72}
    #ultraDuploPalette button.present{border-color:#f4a638;box-shadow:inset 0 0 0 1px #f4a63855}
    .ultra-duplo-snap{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin:6px 0}
    .ultra-duplo-snap button{min-height:32px;padding:4px;font-size:10px}
    #ultraDuploState{font-size:10px;color:var(--muted);margin-top:4px}
  `;
  document.head.appendChild(style);

  const mapHeading = [...ui.left.querySelectorAll('h2')].find((h) => h.textContent.trim() === 'Kartenfolie');
  const html = `
    <section id="ultraDuploSection">
      <h2>Ultra Duplo</h2>
      <div class="row"><button id="ultraDuploAll" class="ok">🧱 Gelände als Duplo</button><button id="ultraDuploDetails" disabled>🔎 Details</button></div>
      <div id="ultraDuploPalette"></div>
      <div class="ultra-duplo-snap">
        <button data-ultra-snap="1">1 m</button><button data-ultra-snap="5" class="active">5 m</button><button data-ultra-snap="10">10 m</button><button data-ultra-snap="25">25 m</button>
      </div>
      <div id="ultraDuploState">0 Klötze · 0 aufgeklappt</div>
      <p class="hint">Ein Klick setzt/springt zu Halle oder Boulevard. Ziehen = zusammenstecken. <strong>Doppelklick</strong> auf einen Klotz klappt die verknüpften Bauplan-Details auf. Derselbe Slot kann später direkt auf eine Blender-GLB zeigen.</p>
    </section>`;
  mapHeading?.insertAdjacentHTML('beforebegin', html);

  document.getElementById('ultraDuploAll').onclick = ultraDuploBuildAll;
  document.getElementById('ultraDuploDetails').onclick = ultraDuploToggleSelectedDetail;
  document.querySelectorAll('[data-ultra-snap]').forEach((button) => {
    button.onclick = () => ultraDuploSetSnap(Number(button.dataset.ultraSnap));
  });
  ultraDuploRefreshUi();
}

// Die bestehende Auswahl bleibt die Wahrheit; Ultra Duplo beobachtet nur,
// welches semantische Teil gerade aktiv ist.
const ultraDuploSelectionObserver = new MutationObserver(ultraDuploRefreshUi);
ultraDuploSelectionObserver.observe(ui.selectionTag, { childList: true, characterData: true, subtree: true });
renderer.domElement.addEventListener('dblclick', () => {
  if (selected?.userData?.ultraDuplo || selected?.userData?.duploDetailOf) ultraDuploToggleSelectedDetail();
});

ultraDuploInstallUi();
const ultraDuploBaseState = window.__BEUTELTIER_EDITOR__.state;
window.__BEUTELTIER_EDITOR__.state = () => ({
  ...ultraDuploBaseState(),
  ultraDuploActive,
  ultraDuploPieces: objectsRoot.children.filter((o) => o.userData?.ultraDuplo || o.userData?.duploDetailOf).length,
  ultraDuploExpanded: objectsRoot.children.filter((o) => o.userData?.duploDetailOf).length,
});
window.__BEUTELTIER_EDITOR__.ultraDuplo = {
  buildAll: ultraDuploBuildAll,
  specs: () => ultraDuploSpecs().map((s) => ({ ...s })),
  select: ultraDuploAddOrSelect,
  toggleSelectedDetail: ultraDuploToggleSelectedDetail,
  setSnap: ultraDuploSetSnap,
  linkGlb: (id, src) => {
    if (!id || !src) return false;
    ultraDuploGlbLinks.set(id, src);
    const object = ultraDuploFind(id);
    if (object) object.userData.detailLink = { kind: 'glb', src };
    ultraDuploRefreshUi();
    return true;
  },
};
