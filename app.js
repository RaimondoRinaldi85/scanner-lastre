"use strict";
// Scanner Lastre (offline): everything is stored on the phone; containers are sent to Google Sheets when online.
const P = window.Parse;
const $ = id => document.getElementById(id);
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { toast("Memoria del telefono piena: esporta e svuota i container vecchi"); } }
};
const FIELD_NAMES = { material: "materiale", depth: "spessore", code: "codice", color: "colore" };
const HEAD = ["#", "Container", "Materiale", "Spessore mm", "Codice", "Colore", "Codice-Colore", "Formato", "Scansionata il"];

// ---------- Data on the phone ----------
const st = {
  data: LS.get("slo.data", { containers: [], slabs: [] }),
  dels: LS.get("slo.dels", []),                 // container names to remove from the sheet
  settings: LS.get("slo.settings", { url: "", token: "", device: "" }),
  current: LS.get("slo.current", null),
  draft: null, lastAdded: null, moving: false, syncing: false
};
function save() { LS.set("slo.data", st.data); LS.set("slo.dels", st.dels); }
function newId(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function cont(id) { return st.data.containers.find(c => c.id === id); }
function touch(cid) { const c = cont(cid); if (c) c.updatedAt = Date.now(); }
function dirty(c) { return !c.syncedAt || (c.updatedAt || 0) > c.syncedAt; }
function posOf(s) { return typeof s.order === "number" ? s.order : (Date.parse(s.createdAt) || 0); }
function slabsOf(cid) { return st.data.slabs.filter(s => s.container === cid).sort((a, b) => posOf(a) - posOf(b) || a.id.localeCompare(b.id)); }
function lastInContainer() { return slabsOf(st.current).reduce((a, s) => !a || s.createdAt > a.createdAt ? s : a, null); }

let toastT;
function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2800); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function joinIt(a) { return a.length > 1 ? a.slice(0, -1).join(", ") + " e " + a[a.length - 1] : a.join(""); }
function fmtDate(iso) { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }); }

// ---------- Rendering ----------
function render() {
  const conts = [...st.data.containers].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  if (!cont(st.current)) st.current = conts[0] ? conts[0].id : null;
  const sel = $("containerSel");
  sel.innerHTML = "";
  if (!conts.length) { sel.add(new Option("Crea prima un container", "")); sel.disabled = true; }
  else {
    sel.disabled = false;
    for (const c of conts) sel.add(new Option(`${c.name} (${slabsOf(c.id).length})${dirty(c) ? " · da inviare" : ""}`, c.id));
    sel.value = st.current;
  }
  const cur = cont(st.current);
  $("scanBox").classList.toggle("busy", !cur);
  $("delContBtn").hidden = !cur;
  if (!cur) $("delConfirm").hidden = true;
  $("listCont").textContent = cur ? cur.name : "—";
  const items = cur ? slabsOf(cur.id) : [];
  $("count").textContent = items.length + (items.length === 1 ? " lastra" : " lastre");

  const byMat = {};
  for (const s of items) { const k = `${P.titleCase(s.material)} · ${s.depth} mm`; byMat[k] = (byMat[k] || 0) + 1; }
  $("summary").innerHTML = "";
  for (const [k, n] of Object.entries(byMat).sort()) {
    const c = document.createElement("span"); c.className = "chip";
    c.append(k + " ", Object.assign(document.createElement("b"), { textContent: "× " + n }));
    $("summary").append(c);
  }

  const list = $("list"); list.innerHTML = "";
  if (!cur) list.innerHTML = '<p class="empty">Aggiungi un container qui sopra, poi tocca Scansiona etichetta e fotografa l\'etichetta di ogni lastra.</p>';
  else if (!items.length) list.innerHTML = '<p class="empty">Nessuna lastra. Tocca Scansiona etichetta e fotografa l\'etichetta della prima lastra.</p>';
  items.forEach((s, i) => {
    const row = document.createElement("div"); row.className = "item" + (s.id === st.lastAdded ? " new" : "");
    const n = document.createElement("span"); n.className = "n"; n.textContent = i + 1;
    const main = document.createElement("div"); main.className = "main";
    const mat = document.createElement("span"); mat.className = "mat"; mat.textContent = P.titleCase(s.material || "?");
    const meta = document.createElement("span"); meta.className = "meta";
    const cc = document.createElement("span"); cc.className = "mono"; cc.textContent = P.combo(s.code, s.color);
    meta.append(s.depth + " mm · ", cc);
    main.append(mat, meta);
    const ctrl = document.createElement("div"); ctrl.className = "ctrl";
    for (const [dir, label, path] of [[-1, "Sposta su", "M6 15l6-6 6 6"], [1, "Sposta giù", "M6 9l6 6 6-6"]]) {
      const b = document.createElement("button"); b.type = "button"; b.className = "mv";
      b.setAttribute("aria-label", `${label} ${P.combo(s.code, s.color)}`);
      b.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
      b.disabled = (dir < 0 && i === 0) || (dir > 0 && i === items.length - 1);
      b.onclick = () => moveSlab(cur.id, i, dir);
      ctrl.append(b);
    }
    const x = document.createElement("button"); x.className = "x"; x.type = "button"; x.textContent = "Elimina";
    x.setAttribute("aria-label", "Elimina " + P.combo(s.code, s.color));
    x.onclick = () => {
      if (!x.classList.contains("armed")) { x.classList.add("armed"); x.textContent = "Conferma"; setTimeout(() => { x.classList.remove("armed"); x.textContent = "Elimina"; }, 3000); return; }
      st.data.slabs = st.data.slabs.filter(z => z.id !== s.id); touch(s.container); save(); render(); syncSoon(); toast("Lastra eliminata");
    };
    ctrl.append(x);
    row.append(n, main, ctrl); list.append(row);
  });

  const mats = [...new Set(st.data.slabs.map(s => s.material).filter(Boolean))].sort();
  $("materials").innerHTML = ""; for (const m of mats) $("materials").append(new Option(m));
  if (st.draft && !st.draft.saving) updateCombo();
  renderNet();
}
function flash(id) { st.lastAdded = id; setTimeout(() => { if (st.lastAdded === id) st.lastAdded = null; }, 1700); }
function moveSlab(cid, idx, dir) {
  const items = slabsOf(cid), a = items[idx], b = items[idx + dir];
  if (!a || !b) return;
  const pa = posOf(a), pb = posOf(b);
  a.order = pa === pb ? pb + dir * 0.5 : pb; b.order = pa;
  touch(cid); save(); flash(a.id); render(); syncSoon();
}
function renderNet() {
  const on = navigator.onLine !== false;
  const waiting = st.data.containers.filter(dirty).length + st.dels.length;
  const net = $("net");
  net.className = "pill" + (on ? "" : " off");
  net.textContent = (on ? "Online" : "Offline") + (waiting ? ` · ${waiting} da inviare` : "");
  const s = st.settings;
  $("setupNote").hidden = !!(s.url && s.token && s.device);
}

// ---------- Containers ----------
$("containerSel").onchange = e => { st.current = e.target.value; LS.set("slo.current", st.current); $("delConfirm").hidden = true; closeReview(); render(); };
$("newContForm").addEventListener("submit", e => {
  e.preventDefault();
  const name = $("newContName").value.trim().toUpperCase();
  if (!name) return;
  const same = st.data.containers.find(c => c.name === name);
  if (same) { st.current = same.id; toast("Container " + name + " già presente: selezionato"); }
  else {
    const c = { id: newId("c"), name, createdAt: new Date().toISOString(), updatedAt: Date.now() };
    st.data.containers.push(c); st.current = c.id; save(); toast("Container " + name + " aggiunto");
  }
  LS.set("slo.current", st.current); $("newContName").value = ""; render();
});
$("delContBtn").onclick = () => {
  const cur = cont(st.current); if (!cur) return;
  const n = slabsOf(cur.id).length;
  const what = n === 0 ? "" : n === 1 ? " e la sua lastra" : ` e le sue ${n} lastre`;
  $("delText").textContent = `Eliminare il container ${cur.name}${what}? Non si può annullare. Le righe di questo telefono verranno tolte anche dal foglio Google.`;
  $("delConfirm").hidden = false; $("delNo").focus();
};
$("delNo").onclick = () => { $("delConfirm").hidden = true; };
$("delYes").onclick = () => {
  const cur = cont(st.current); if (!cur) return;
  st.data.slabs = st.data.slabs.filter(s => s.container !== cur.id);
  st.data.containers = st.data.containers.filter(c => c.id !== cur.id);
  if (cur.syncedAt && !st.dels.includes(cur.name)) st.dels.push(cur.name);
  save(); $("delConfirm").hidden = true; closeReview(); render(); syncSoon();
  toast("Container " + cur.name + " eliminato");
};

// ---------- Photo: shrink, barcode, text recognition ----------
let workCanvas = null, rotCanvas = null, barcodeReader = null, ocrWorkerP = null, readSeq = 0, thumbUrl = null;
function abs(p) { return new URL(p, location.href).href; }
// Decode at ~1800 px wide straight away: full 12-megapixel photos fill the phone's memory after a few slabs,
// but the small print on the label needs some detail.
async function decodeSmall(blob) {
  let bmp;
  try { bmp = await createImageBitmap(blob, { resizeWidth: 1800, resizeQuality: "high" }); }
  catch { bmp = await createImageBitmap(blob); }
  const k = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
  const c = workCanvas || (workCanvas = document.createElement("canvas"));
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}
async function readBarcodes(canvas) {
  if (!("BarcodeDetector" in window)) return [];
  try {
    const found = await (barcodeReader || (barcodeReader = new BarcodeDetector())).detect(canvas);
    // EAN/UPC barcodes are product codes, never the slab serial number.
    return found.filter(f => !/^(ean_13|ean_8|upc_a|upc_e)$/.test(f.format)).map(f => P.normCode(f.rawValue)).filter(v => P.codeOk(v) && v.length !== 13);
  } catch { return []; }
}
// Turn the photo upright and bring it to `side` px on the long side (small photos are enlarged a little: it helps the reading).
// One canvas reused for every reading.
function rotated(src, angle, side) {
  const k = Math.min(1.5, side / Math.max(src.width, src.height));
  const w = Math.round(src.width * k), h = Math.round(src.height * k);
  const c = rotCanvas || (rotCanvas = document.createElement("canvas"));
  const turn = angle % 180 !== 0;
  c.width = turn ? h : w; c.height = turn ? w : h;
  const g = c.getContext("2d");
  g.translate(c.width / 2, c.height / 2); g.rotate(angle * Math.PI / 180);
  g.filter = "grayscale(1) contrast(1.4)";
  g.imageSmoothingQuality = "high";
  g.drawImage(src, -w / 2, -h / 2, w, h);
  return c;
}
// Materials already used on this phone help recognise the name even when a letter is misread.
function knownMaterials() { return [...new Set(["TAJ MAHAL SILK", "BDK ETER", ...st.data.slabs.map(s => s.material).filter(Boolean)])]; }
async function ocrPass(w, canvas, angle, psm, side) {
  await w.setParameters({ tessedit_pageseg_mode: psm });
  const c = rotated(canvas, angle, side);
  // Ask only for the plain text: the default also builds the position of every single letter, which is a lot of memory.
  const { data } = await w.recognize(c, {}, { text: true, blocks: false, hocr: false, tsv: false });
  c.width = c.height = 0;
  const p = P.parseLabel(data.text);
  p.angle = angle; p.text = data.text; p.conf = data.confidence || 0;
  return p;
}
// The reading engine only ever grows its memory: close it after each label, so the phone has room for the camera.
async function releaseOcr() {
  const wp = ocrWorkerP; ocrWorkerP = null;
  if (wp) { try { (await wp).terminate(); } catch {} }
}
function getOcr() {
  if (!ocrWorkerP) {
    ocrWorkerP = Tesseract.createWorker("eng", 1, {
      workerPath: abs("vendor/tesseract/worker.min.js"),
      corePath: abs("vendor/tesseract/core"),
      langPath: abs("vendor/tesseract/lang"),
      workerBlobURL: false, gzip: true
    }).then(async w => { await w.setParameters({ tessedit_pageseg_mode: "11" }); return w; })
      .catch(e => { ocrWorkerP = null; throw e; });
  }
  return ocrWorkerP;
}
// Labels are usually photographed sideways: a quick small reading finds the right rotation, then one full reading
// (a second one in another mode only if fields are missing). The readings vote field by field.
async function readLabel(canvas, onStep) {
  let step = 0;
  try {
    const w = await getOcr();
    let best = null;
    for (const angle of [270, 90, 0]) {
      onStep && onStep(++step);
      const p = await ocrPass(w, canvas, angle, "11", 1100);
      if (!best || P.score(p) * 20 + p.conf > P.score(best) * 20 + best.conf) best = p;
      if (P.score(p) >= 3 || p.conf >= 60) break; // upright text reads with high confidence
    }
    const passes = [];
    onStep && onStep(++step);
    passes.push(await ocrPass(w, canvas, best.angle, "11", 2000));
    if (P.score(P.merge(passes, knownMaterials())) < 6) {
      onStep && onStep(++step);
      passes.push(await ocrPass(w, canvas, best.angle, "3", 2000));
    }
    // The full-size readings decide; the small rotation check only fills what they missed.
    const merged = P.merge(passes, knownMaterials()), quick = P.merge([best], knownMaterials());
    for (const k of ["brand", "material", "depth", "color", "size", "code"]) if (!merged[k]) merged[k] = quick[k];
    if (!merged.codes.length) merged.codes = quick.codes;
    return merged;
  } finally {
    await releaseOcr();
  }
}
function setThumb(blob) {
  if (thumbUrl) URL.revokeObjectURL(thumbUrl);
  thumbUrl = blob ? URL.createObjectURL(blob) : null;
  $("thumb").hidden = !blob;
  if (thumbUrl) $("thumb").src = thumbUrl; else $("thumb").removeAttribute("src");
}

// ---------- Review card ----------
function setStatus(html, cls) { const el = $("status"); el.className = "status " + (cls || ""); el.innerHTML = html; }
function openReview(token) {
  st.draft = { token };
  $("review").hidden = false;
  setThumb(null);
  $("formMsg").hidden = true;
  for (const id of ["material", "depth", "code", "color"]) { $(id).value = ""; $("f-" + id).classList.remove("flag", "inherited"); $(id + "Hint").textContent = ""; }
  $("b8").checked = LS.get("slo.b8." + st.current, true);
  $("dupWarn").hidden = true;
  updateCombo();
  $("review").scrollIntoView({ behavior: "smooth", block: "start" });
}
function closeReview() {
  readSeq++;
  st.draft = null; $("review").hidden = true; setThumb(null);
  $("camInput").value = ""; $("galInput").value = "";
}
$("cancelBtn").onclick = closeReview;
$("manualBtn").onclick = () => {
  if (!cont(st.current)) { toast("Crea prima un container"); return; }
  openReview(++readSeq);
  const filled = fillFromLast();
  setStatus(filled.length ? "Scrivi il codice: gli altri valori sono presi dall'ultima lastra del container." : "Inserisci i valori dell'etichetta.");
  (filled.length ? $("code") : $("material")).focus();
};
$("camInput").onchange = e => handlePhoto(e.target.files[0]);
$("galInput").onchange = e => handlePhoto(e.target.files[0]);

async function handlePhoto(file) {
  if (!file || !cont(st.current)) return;
  const token = ++readSeq;
  openReview(token);
  $("camInput").value = ""; $("galInput").value = "";
  setStatus('<span class="spin"></span>Leggo il codice a barre…');
  let canvas;
  try { canvas = await decodeSmall(file); } catch { setStatus("Foto non leggibile. Scattala di nuovo.", "err"); return; }
  file = null;
  const bars = await readBarcodes(canvas);
  const thumb = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.85));
  if (token !== readSeq) return;
  st.draft.photo = thumb; st.draft.bars = bars; setThumb(thumb);
  const c = cont(st.current), last = lastInContainer();

  // Fast path: in this container the barcode was already checked to be the serial number, and there is a previous slab.
  if (bars.length && c.barcodeIsCode && last) {
    $("code").value = bars[0];
    const filled = fillFromLast();
    setStatus(`Codice dal codice a barre${filled.length ? ", " + joinIt(filled.map(f => FIELD_NAMES[f])) + " dall'ultima lastra" : ""}. Controlla e salva. <button type="button" class="linkbtn" id="ocrBtn">Leggi tutta l'etichetta</button>`, "ok");
    $("ocrBtn").onclick = () => runOcr(token, bars);
    canvas.width = canvas.height = 0;
    finishFill();
    return;
  }
  await runOcr(token, bars, canvas);
}

async function runOcr(token, bars, canvas) {
  if (token !== readSeq || !st.draft) return;
  if (!canvas) canvas = await decodeSmall(st.draft.photo);
  setStatus('<span class="spin"></span>Leggo l\'etichetta sul telefono… (può servire qualche secondo)');
  let p = null;
  try { p = await readLabel(canvas, n => { if (token === readSeq) setStatus(`<span class="spin"></span>Leggo l'etichetta sul telefono… (passaggio ${n})`); }); }
  catch (e) { console.error(e); }
  canvas.width = canvas.height = 0;
  if (token !== readSeq || !st.draft) return;
  const c = cont(st.current);

  for (const id of ["material", "depth", "code", "color"]) { $("f-" + id).classList.remove("flag", "inherited"); $(id + "Hint").textContent = ""; }
  if (p) {
    st.draft.brand = p.brand;
    if (p.material) $("material").value = p.material;
    if (p.depth) $("depth").value = p.depth;
    if (p.color) $("color").value = P.normColor(p.color, false);
    st.draft.size = p.size || "";
    st.draft.read = true;
  }
  // Code: the barcode is read reliably by the phone; digits read from the text often have one wrong digit.
  const textCode = p ? p.code : "";
  const want = p && p.brand === "NEOLITH" ? 12 : p && p.brand === "DEKTON" ? 10 : 0;
  const barCode = bars.find(b => p && p.codes.includes(b)) || bars.find(b => b.length === want) || bars[0] || "";
  if (barCode) {
    $("code").value = barCode;
    $("codeHint").textContent = textCode === barCode ? "Dal codice a barre, uguale al testo" : "Dal codice a barre";
  } else if (textCode) {
    $("code").value = textCode;
    $("codeHint").textContent = "Letto dal testo: controlla ogni cifra";
    $("f-code").classList.add("flag");
  }

  const filled = fillFromLast();
  const problems = validate();
  if (!p) setStatus("Lettura dell'etichetta non riuscita. Rifai la foto più da vicino o scrivi i valori.", "err");
  else if (filled.length) setStatus(`Letta in parte: ${joinIt(filled.map(f => FIELD_NAMES[f]))} dall'ultima lastra del container. Controlla e salva.`, "warn");
  else if (problems.length) setStatus("Letta, ma controlla i campi evidenziati.", "warn");
  else if (!barCode) setStatus("Letta. Codice a barre non trovato: controlla bene il codice prima di salvare.", "warn");
  else setStatus("Letta. Controlla e salva.", "ok");
  finishFill();
}
function finishFill() { updateColorHint(); updateCombo(); }

// Fields not read are the same within a container: copy them from the most recently saved slab.
function fillFromLast() {
  const last = lastInContainer(), filled = [];
  if (!last) return filled;
  for (const id of ["material", "depth", "color"]) {
    if ($(id).value || !last[id]) continue;
    $(id).value = last[id];
    if (id === "color" && /B/.test(last[id])) $("b8").checked = false;
    $("f-" + id).classList.add("inherited");
    $(id + "Hint").textContent = "Come l'ultima lastra del container";
    filled.push(id);
  }
  return filled;
}
function b8On() { return $("b8").checked; }
function updateColorHint() {
  if ($("f-color").classList.contains("inherited")) return;
  const raw = P.normColor($("color").value, false), out = P.normColor(raw, b8On());
  const dekton = st.draft && st.draft.brand === "DEKTON";
  $("colorHint").textContent = raw && raw !== out ? `Verrà salvato come ${out}` + (dekton ? ". Sulle etichette Dekton la B di solito è vera: togli la spunta." : "") : "";
}
$("b8").addEventListener("change", () => {
  if (st.current) LS.set("slo.b8." + st.current, b8On());
  $("f-color").classList.remove("inherited", "flag");
  updateColorHint(); updateCombo();
});
function validate() {
  const p = [];
  const flag = (id, bad) => { if (bad) { $("f-" + id).classList.add("flag"); p.push(id); } };
  flag("material", !P.normMaterial($("material").value));
  const d = P.normDepth($("depth").value); flag("depth", !d || +d < 3 || +d > 40);
  flag("code", !P.codeOk(P.normCode($("code").value)));
  flag("color", !P.normColor($("color").value, b8On()));
  return p;
}
function problemText(id) {
  if (id === "code") { const n = P.normCode($("code").value).length; return !n ? "codice (vuoto)" : n < 6 ? `codice (solo ${n} cifre)` : `codice (${n} cifre, troppe)`; }
  if (id === "depth") return "spessore (tra 3 e 40 mm)";
  return FIELD_NAMES[id] + " (vuoto)";
}
function updateCombo() {
  const code = P.normCode($("code").value), color = P.normColor($("color").value, b8On());
  $("combo").textContent = P.combo(code, color) || "—";
  const dupHere = slabsOf(st.current).find(s => s.code === code && s.color === color);
  const dupElse = !dupHere && st.data.slabs.find(s => s.code === code && s.color === color);
  const w = $("dupWarn");
  if (code && (dupHere || dupElse)) {
    const cn = dupElse ? (cont(dupElse.container) || {}).name : null;
    w.textContent = dupHere ? "Questa lastra è già in questo container. Salva solo se è davvero una seconda lastra." : `Questa lastra è già presente ${cn ? "nel container " + cn : "in un altro container"}.`;
    w.hidden = false;
  } else w.hidden = true;
}
for (const id of ["material", "depth", "code", "color"]) $(id).addEventListener("input", () => {
  $("f-" + id).classList.remove("flag", "inherited");
  $("formMsg").hidden = true;
  if (id === "color") updateColorHint(); else if (id !== "code") $(id + "Hint").textContent = "";
  updateCombo();
});
function formMsg(text) { const m = $("formMsg"); m.textContent = text || ""; m.hidden = !text; if (text) toast(text); }
$("slabForm").addEventListener("submit", e => {
  e.preventDefault();
  for (const id of ["material", "depth", "code", "color"]) $("f-" + id).classList.remove("flag");
  const bad = validate();
  if (bad.length) {
    formMsg("Non salvata. Correggi: " + bad.map(problemText).join(", ") + ".");
    $(bad[0]).scrollIntoView({ behavior: "smooth", block: "center" }); $(bad[0]).focus({ preventScroll: true });
    return;
  }
  const slab = {
    id: newId("s"),
    container: st.current,
    material: P.normMaterial($("material").value),
    depth: P.normDepth($("depth").value),
    code: P.normCode($("code").value),
    color: P.normColor($("color").value, b8On()),
    size: st.draft?.size || "",
    createdAt: new Date().toISOString(),
    order: Date.now(),
    source: st.draft?.read ? "scan" : "manual"
  };
  st.draft.saving = true;
  // You confirmed a code equal to the photo's barcode: in this container the barcode is the serial number,
  // so the next slabs can be read from the barcode alone.
  const c = cont(st.current);
  if (c && !c.barcodeIsCode && (st.draft.bars || []).includes(slab.code)) c.barcodeIsCode = true;
  st.data.slabs.push(slab); touch(st.current); save();
  flash(slab.id); toast("Salvata " + P.combo(slab.code, slab.color));
  closeReview(); render(); syncSoon();
});

// ---------- Export ----------
function rowsOf(cid) {
  const c = cont(cid);
  return slabsOf(cid).map((s, i) => [i + 1, c ? c.name : "", P.titleCase(s.material), Number(s.depth) || s.depth, s.code, s.color, P.combo(s.code, s.color), s.size || "", fmtDate(s.createdAt)]);
}
$("csvBtn").onclick = () => {
  const c = cont(st.current); if (!c) return;
  const esc = v => { v = String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  // Semicolons + BOM for Italian Excel; codes as ="..." so Excel keeps every digit and leading zeros.
  const csv = "﻿sep=;\r\n" + [HEAD, ...rowsOf(c.id).map(r => r.map((v, i) => (i === 4 || i === 5 || i === 6) ? '="' + v + '"' : v))].map(r => r.map(esc).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = c.name.replace(/[^\w-]+/g, "_") + ".csv";
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};
$("copyBtn").onclick = () => {
  const c = cont(st.current); if (!c) return;
  const text = [HEAD, ...rowsOf(c.id)].map(r => r.join("\t")).join("\n");
  navigator.clipboard.writeText(text).then(() => toast("Tabella copiata. Incollala in Excel o Google Sheets."), () => toast("Copia non riuscita"));
};

// ---------- Google Sheets (through the script in the sheet) ----------
function syncStatus(text, cls) { const el = $("syncStatus"); el.className = "status " + (cls || ""); el.textContent = text || ""; }
async function post(body) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 25000);
  try {
    // text/plain keeps this a simple request that the Google script accepts from any site.
    const r = await fetch(st.settings.url, { method: "POST", body: JSON.stringify({ ...body, token: st.settings.token, device: st.settings.device }), signal: ctl.signal });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "rifiutato dal foglio");
    return j;
  } catch (e) {
    throw new Error(e.name === "AbortError" ? "il foglio non risponde" : e.message === "Failed to fetch" ? "nessuna connessione" : e.message);
  } finally { clearTimeout(t); }
}
let syncTimer = null;
function syncSoon() { clearTimeout(syncTimer); syncTimer = setTimeout(() => syncAll(false), 2500); }
async function syncAll(manual) {
  const s = st.settings;
  if (!(s.url && s.token && s.device)) {
    if (manual) { $("settingsBox").open = true; $("settingsBox").scrollIntoView({ behavior: "smooth" }); syncStatus("Prima completa le Impostazioni del foglio Google.", "warn"); }
    return;
  }
  if (navigator.onLine === false) { if (manual) syncStatus("Senza connessione: tutto è salvato sul telefono e verrà inviato da solo appena torna.", "warn"); renderNet(); return; }
  const todo = st.data.containers.filter(dirty);
  if (!todo.length && !st.dels.length) { if (manual) syncStatus("Tutto già inviato al foglio Google.", "ok"); return; }
  if (st.syncing) return;
  st.syncing = true; $("syncBtn").disabled = true;
  syncStatus("Invio al foglio Google…");
  let sent = 0;
  try {
    for (const name of [...st.dels]) {
      await post({ action: "delete", name });
      st.dels = st.dels.filter(n => n !== name); save();
    }
    for (const c of todo) {
      const stamp = Date.now();
      await post({ action: "put", name: c.name, rows: rowsOf(c.id).map(r => r.slice(1)) });
      c.syncedAt = stamp; save(); sent++;
    }
    syncStatus(sent ? `Inviati ${sent === 1 ? "1 container" : sent + " container"} al foglio Google alle ${new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}.` : "Foglio Google aggiornato.", "ok");
  } catch (e) {
    syncStatus(`Invio non riuscito: ${e.message}. Resta tutto salvato sul telefono; riprovo da solo.`, "warn");
  } finally { st.syncing = false; $("syncBtn").disabled = false; render(); }
}
$("syncBtn").onclick = () => syncAll(true);
window.addEventListener("online", () => { renderNet(); syncAll(false); });
window.addEventListener("offline", renderNet);
setInterval(() => { if (navigator.onLine !== false) syncAll(false); }, 60000);

// ---------- Settings ----------
function fillSettings() { const s = st.settings; $("setDevice").value = s.device || ""; $("setUrl").value = s.url || ""; $("setToken").value = s.token || ""; }
function setMsg(text, cls) { const el = $("setStatus"); el.className = "status " + (cls || ""); el.textContent = text || ""; }
function readSettings() { return { device: $("setDevice").value.trim(), url: $("setUrl").value.trim(), token: $("setToken").value.trim() }; }
$("settingsForm").addEventListener("submit", e => {
  e.preventDefault();
  const s = readSettings();
  if (!s.device || !s.url || !s.token) { setMsg("Compila tutti e tre i campi.", "err"); return; }
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(s.url)) { setMsg("L'indirizzo deve iniziare con https://script.google.com/", "err"); return; }
  st.settings = s; LS.set("slo.settings", s);
  // A new phone name means every container must be written again under that name.
  for (const c of st.data.containers) c.syncedAt = 0;
  save(); setMsg("Impostazioni salvate.", "ok"); renderNet(); syncSoon();
});
$("testBtn").onclick = async () => {
  const s = readSettings();
  if (!s.url || !s.token) { setMsg("Scrivi indirizzo e codice segreto.", "err"); return; }
  const keep = st.settings; st.settings = { ...keep, ...s, device: s.device || "prova" };
  setMsg("Provo il collegamento…");
  try { await post({ action: "ping" }); setMsg("Collegamento riuscito: il foglio risponde.", "ok"); }
  catch (e) { setMsg("Collegamento non riuscito: " + e.message + ".", "err"); }
  finally { st.settings = keep; }
};

// ---------- Install and offline ----------
let installEvt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; $("installBox").hidden = false; });
$("installBtn").onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; $("installBox").hidden = true; };
window.addEventListener("appinstalled", () => { $("installBox").hidden = true; toast("App installata"); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(e => console.warn("service worker", e));
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

fillSettings();
render();
syncAll(false);
