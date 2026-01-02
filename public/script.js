// ---------------------- DOM ----------------------
const appRoot = document.querySelector(".app");
const leftPanel = document.getElementById("leftPanel");
const bottomPanel = document.getElementById("bottomPanel");

const btnCollapseLeft = document.getElementById("btnCollapseLeft");
const btnCollapseBottom = document.getElementById("btnCollapseBottom");

const categorySelect = document.getElementById("categorySelect");
const searchInput = document.getElementById("searchInput");
const suggestions = document.getElementById("suggestions");

const gallery = document.getElementById("gallery");
const queueList = document.getElementById("queueList");
const statusBox = document.getElementById("statusBox");

const canvasW = document.getElementById("canvasW");
const canvasH = document.getElementById("canvasH");
const spacingMm = document.getElementById("spacingMm");
const marginMm = document.getElementById("marginMm");

const btnAutoLayout = document.getElementById("btnAutoLayout");
const btnClearCanvas = document.getElementById("btnClearCanvas");
const btnDownload = document.getElementById("btnDownload");

const objCount = document.getElementById("objCount");
const zoomLabel = document.getElementById("zoomLabel");

const toast = document.getElementById("toast");

// SVG stage
const stage = document.getElementById("stage");
const viewport = document.getElementById("viewport");
const pageRect = document.getElementById("pageRect");
const placedGroup = document.getElementById("placed");

// ---------------------- State ----------------------
let allFiles = []; // from server
let filteredFiles = [];
let queue = new Map(); // id -> {file, pcs, thumbDataUrl, svgText, meta}

let lastLayoutSvg = null; // string SVG output (for download)

const SVG_NS = "http://www.w3.org/2000/svg";

// Pan/Zoom state
let zoom = 1;
let panX = 20;
let panY = 20;
let isPanning = false;
let panStart = { x: 0, y: 0 };
let panOrigin = { x: 0, y: 0 };

// ---------------------- Utils ----------------------
function showToast(msg, ms = 3500) {
  toast.hidden = false;
  toast.textContent = msg;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (toast.hidden = true), ms);
}

function escXml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function mm(n) {
  return Math.max(0, Number(n) || 0);
}

function fmt(n, d = 2) {
  if (!isFinite(n)) return "—";
  return Number(n).toFixed(d);
}

function updatePageRect() {
  const w = mm(canvasW.value);
  const h = mm(canvasH.value);
  pageRect.setAttribute("x", "0");
  pageRect.setAttribute("y", "0");
  pageRect.setAttribute("width", String(w));
  pageRect.setAttribute("height", String(h));
}

function applyViewportTransform() {
  viewport.setAttribute("transform", `translate(${panX} ${panY}) scale(${zoom})`);
  zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
}

function clearPlaced() {
  placedGroup.innerHTML = "";
  objCount.textContent = "0";
  lastLayoutSvg = null;
  btnDownload.disabled = true;
  statusBox.textContent = "";
}

function encodeSvgToDataUrl(svgText) {
  // aman untuk img src
  const encoded = encodeURIComponent(svgText)
    .replace(/'/g, "%27")
    .replace(/"/g, "%22");
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

// ---------------------- API loading ----------------------
async function loadCategories() {
  const data = await fetchJSON("/api/categories");
  categorySelect.innerHTML = "";
  for (const c of data.categories) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    categorySelect.appendChild(opt);
  }
}

async function loadFiles(cat = "all") {
  const data = await fetchJSON(`/api/list?cat=${encodeURIComponent(cat)}`);
  allFiles = data.files || [];
  rebuildSuggestions(allFiles);
  applyFilter();
}

function rebuildSuggestions(files) {
  // datalist suggestions (buat pencarian cepat saat file banyak)
  suggestions.innerHTML = "";
  // batas biar ringan (kalau file ribuan)
  const MAX = 4000;
  for (const f of files.slice(0, MAX)) {
    const opt = document.createElement("option");
    opt.value = f.name;
    suggestions.appendChild(opt);
  }
}

// ---------------------- Search/filter/gallery ----------------------
function applyFilter() {
  const q = (searchInput.value || "").trim().toLowerCase();
  filteredFiles = allFiles.filter((f) => {
    if (!q) return true;
    // match: nama file atau path
    return f.name.toLowerCase().includes(q) || f.relPath.toLowerCase().includes(q);
  });
  renderGallery(filteredFiles);
}

async function renderGallery(files) {
  gallery.innerHTML = "";

  const frag = document.createDocumentFragment();
  for (const f of files) {
    const card = document.createElement("div");
    card.className = "card";
    card.title = `Klik untuk tambah ke Queue\n${f.relPath}`;

    const imgWrap = document.createElement("div");
    imgWrap.className = "img";

    const img = document.createElement("img");
    img.alt = f.name;

    // thumbnail: ambil svg text lalu jadikan data url (cache per file)
    let thumbUrl = f._thumbUrl;
    if (!thumbUrl) {
      try {
        const svgText = await fetchText(`/api/svg?path=${encodeURIComponent(f.relPath)}`);
        thumbUrl = encodeSvgToDataUrl(svgText);
        f._thumbUrl = thumbUrl;
        f._svgText = svgText;
      } catch {
        thumbUrl = "";
      }
    }
    if (thumbUrl) img.src = thumbUrl;

    imgWrap.appendChild(img);

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = f.name;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${fmt(f.wMm, 1)}×${fmt(f.hMm, 1)} mm`;

    card.appendChild(imgWrap);
    card.appendChild(name);
    card.appendChild(meta);

    card.addEventListener("click", () => addToQueue(f));

    frag.appendChild(card);
  }
  gallery.appendChild(frag);
}

// ---------------------- Queue ----------------------
async function addToQueue(file) {
  const id = file.id;
  if (queue.has(id)) {
    // kalau sudah ada, tambahin pcs 1
    const it = queue.get(id);
    it.pcs += 1;
    queue.set(id, it);
    renderQueue();
    showToast(`+1 pcs: ${file.name}`);
    return;
  }

  let svgText = file._svgText;
  if (!svgText) svgText = await fetchText(`/api/svg?path=${encodeURIComponent(file.relPath)}`);
  const thumbUrl = file._thumbUrl || encodeSvgToDataUrl(svgText);

  queue.set(id, {
    file,
    pcs: 1,
    thumbUrl,
    svgText
  });

  renderQueue();
  showToast(`Ditambahkan ke queue: ${file.name}`);
}

function renderQueue() {
  queueList.innerHTML = "";

  const items = Array.from(queue.values());

  if (items.length === 0) {
    queueList.innerHTML = `<div class="status">Queue kosong. Pilih SVG dari Library (panel bawah).</div>`;
    return;
  }

  for (const item of items) {
    const { file } = item;

    const row = document.createElement("div");
    row.className = "queue-item";

    const thumb = document.createElement("div");
    thumb.className = "thumb";
    const img = document.createElement("img");
    img.src = item.thumbUrl;
    img.alt = file.name;
    thumb.appendChild(img);

    const info = document.createElement("div");
    const n = document.createElement("div");
    n.className = "q-name";
    n.textContent = file.name;
    const s = document.createElement("div");
    s.className = "q-sub";
    s.textContent = `${fmt(file.wMm, 1)}×${fmt(file.hMm, 1)} mm • ${file.relPath}`;
    info.appendChild(n);
    info.appendChild(s);

    const pcs = document.createElement("div");
    pcs.className = "q-pcs";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.step = "1";
    input.value = String(item.pcs);
    input.addEventListener("change", () => {
      const v = Math.max(0, parseInt(input.value || "0", 10));
      item.pcs = isFinite(v) ? v : 0;
      if (item.pcs <= 0) queue.delete(file.id);
      renderQueue();
    });
    pcs.appendChild(input);

    const del = document.createElement("button");
    del.className = "q-del";
    del.textContent = "✕";
    del.title = "Hapus dari queue";
    del.addEventListener("click", () => {
      queue.delete(file.id);
      renderQueue();
    });

    row.appendChild(thumb);
    row.appendChild(info);
    row.appendChild(pcs);
    row.appendChild(del);

    queueList.appendChild(row);
  }
}

// ---------------------- SVG parsing & id prefixing ----------------------
function getInnerSvgContent(svgText) {
  // Buang wrapper <svg ...> ... </svg>, ambil inner markup.
  // (Tetap biarkan <defs> di dalam, nanti kita prefix id)
  const m = svgText.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/i);
  if (m) return m[1];
  return svgText; // fallback
}

function extractMetaFromSvgText(svgText) {
  // minimal meta untuk scale & unit mapping.
  // Supaya presisi, kita pakai DOMParser.
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = doc.documentElement;

  const vb = svg.getAttribute("viewBox");
  let vbW = null, vbH = null;
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => isFinite(n))) {
      vbW = parts[2];
      vbH = parts[3];
    }
  }

  const wAttr = svg.getAttribute("width");
  const hAttr = svg.getAttribute("height");

  const wMm = parseLengthToMmClient(wAttr);
  const hMm = parseLengthToMmClient(hAttr);

  // return mmPerUnit + wMm/hMm
  let mmPerUnit = null;
  let outWMm = null;
  let outHMm = null;

  if (vbW && vbH && wMm && hMm) {
    mmPerUnit = wMm / vbW;
    outWMm = wMm;
    outHMm = hMm;
  } else if (vbW && vbH && wMm && !hMm) {
    mmPerUnit = wMm / vbW;
    outWMm = wMm;
    outHMm = vbH * mmPerUnit;
  } else if (vbW && vbH && !wMm && hMm) {
    mmPerUnit = hMm / vbH;
    outHMm = hMm;
    outWMm = vbW * mmPerUnit;
  } else if (vbW && vbH) {
    // assume px @96dpi
    const PX_TO_MM = 25.4 / 96;
    mmPerUnit = PX_TO_MM;
    outWMm = vbW * mmPerUnit;
    outHMm = vbH * mmPerUnit;
  } else if (wMm && hMm) {
    mmPerUnit = null;
    outWMm = wMm;
    outHMm = hMm;
  }

  return { vbW, vbH, mmPerUnit, wMm: outWMm, hMm: outHMm };
}

function parseLengthToMmClient(lenStr) {
  if (!lenStr) return null;
  const s = String(lenStr).trim();
  const m = s.match(/^([0-9.+-eE]+)\s*(mm|cm|in|px|pt)?$/);
  if (!m) return null;
  const val = parseFloat(m[1]);
  const unit = (m[2] || "px").toLowerCase();
  if (!isFinite(val)) return null;

  const PX_TO_MM = 25.4 / 96;
  switch (unit) {
    case "mm": return val;
    case "cm": return val * 10;
    case "in": return val * 25.4;
    case "pt": return (val * 25.4) / 72;
    case "px":
    default: return val * PX_TO_MM;
  }
}

function prefixSvgIds(innerMarkup, prefix) {
  // prefix id="x" and url(#x) and href="#x"
  // Ini sederhana tapi efektif untuk mayoritas SVG produksi.
  // (Kalau ada kasus super kompleks, nanti kita upgrade ke parser-based rewrite.)
  let out = innerMarkup;

  // id="..."
  out = out.replace(/\bid\s*=\s*["']([^"']+)["']/gi, (m, id) => {
    return `id="${prefix}_${id}"`;
  });

  // url(#...)
  out = out.replace(/url\(\s*#([^)]+)\s*\)/gi, (m, id) => {
    return `url(#${prefix}_${id})`;
  });

  // href="#..."
  out = out.replace(/\b(xlink:href|href)\s*=\s*["']#([^"']+)["']/gi, (m, attr, id) => {
    return `${attr}="#${prefix}_${id}"`;
  });

  // CSS selectors #id (basic)
  out = out.replace(/(#)([A-Za-z_][\w:.-]*)/g, (m, hash, id) => {
    // cegah false-positive yang bukan id (tapi ini cukup aman untuk kebanyakan inline style)
    return `${hash}${prefix}_${id}`;
  });

  return out;
}

// ---------------------- Packing (simple shelf packing) ----------------------
function buildInstancesFromQueue() {
  const instances = [];
  for (const item of queue.values()) {
    const pcs = Math.max(0, parseInt(item.pcs || 0, 10));
    if (pcs <= 0) continue;

    const file = item.file;
    const w = file.wMm ?? null;
    const h = file.hMm ?? null;

    if (!w || !h) {
      // kalau ukuran tidak terbaca, coba parse dari svgText
      const meta = extractMetaFromSvgText(item.svgText);
      item.file.wMm = meta.wMm;
      item.file.hMm = meta.hMm;
      item.file.mmPerUnit = meta.mmPerUnit;
    }

    for (let i = 0; i < pcs; i++) {
      instances.push({
        key: `${file.id}::${i + 1}`,
        file,
        svgText: item.svgText
      });
    }
  }
  // sort by height desc (lebih rapih untuk shelf)
  instances.sort((a, b) => (b.file.hMm || 0) - (a.file.hMm || 0));
  return instances;
}

function packShelf(instances, pageW, pageH, spacing, margin) {
  const placements = [];
  const overflow = [];

  let x = margin;
  let y = margin;
  let rowH = 0;

  for (const inst of instances) {
    const w = mm(inst.file.wMm);
    const h = mm(inst.file.hMm);

    if (w <= 0 || h <= 0) {
      overflow.push({ inst, reason: "invalid_size" });
      continue;
    }

    // if doesn't fit on new row at all, overflow
    if (w > (pageW - margin * 2) || h > (pageH - margin * 2)) {
      overflow.push({ inst, reason: "bigger_than_canvas" });
      continue;
    }

    // new row if needed
    if (x + w > pageW - margin) {
      x = margin;
      y = y + rowH + spacing;
      rowH = 0;
    }

    // full
    if (y + h > pageH - margin) {
      overflow.push({ inst, reason: "canvas_full" });
      continue;
    }

    placements.push({
      inst,
      x,
      y,
      w,
      h
    });

    x = x + w + spacing;
    rowH = Math.max(rowH, h);
  }

  return { placements, overflow };
}

// ---------------------- Render layout into preview + build output SVG string ----------------------
function renderLayoutToPreview(placements, pageW, pageH) {
  clearPlaced();
  updatePageRect();

  const frag = document.createDocumentFragment();

  let count = 0;

  for (const p of placements) {
    const file = p.inst.file;
    const svgText = p.inst.svgText;

    // scale: map original SVG user units to mm-based canvas
    // best effort:
    let mmPerUnit = file.mmPerUnit;
    if (!mmPerUnit) {
      // parse from svgText
      const meta = extractMetaFromSvgText(svgText);
      mmPerUnit = meta.mmPerUnit || (25.4 / 96);
    }

    const inner = getInnerSvgContent(svgText);
    const prefix = `i${count}_${Math.random().toString(16).slice(2, 8)}`;
    const safeInner = prefixSvgIds(inner, prefix);

    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("transform", `translate(${p.x} ${p.y}) scale(${mmPerUnit})`);
    g.setAttribute("data-name", file.name);

    // inject inner markup
    g.innerHTML = safeInner;

    frag.appendChild(g);
    count++;
  }

  placedGroup.appendChild(frag);
  objCount.textContent = String(placements.length);
}

function buildExportSvgString(placements, pageW, pageH) {
  // Outer SVG in mm units (1 unit = 1mm)
  // Inline children for Corel.
  let body = "";
  let count = 0;

  for (const p of placements) {
    const file = p.inst.file;
    const svgText = p.inst.svgText;

    let mmPerUnit = file.mmPerUnit;
    if (!mmPerUnit) {
      const meta = extractMetaFromSvgText(svgText);
      mmPerUnit = meta.mmPerUnit || (25.4 / 96);
    }

    const inner = getInnerSvgContent(svgText);
    const prefix = `exp${count}_${Math.random().toString(16).slice(2, 8)}`;
    const safeInner = prefixSvgIds(inner, prefix);

    body += `\n  <g transform="translate(${p.x} ${p.y}) scale(${mmPerUnit})" data-name="${escXml(file.name)}">${safeInner}</g>\n`;
    count++;
  }

  const out =
`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${pageW}mm" height="${pageH}mm"
     viewBox="0 0 ${pageW} ${pageH}">
  <!-- Generated by SVG Layout App (inline SVG content, no <use>, no symbols) -->
${body}
</svg>`;

  return out;
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------------------- Layout Action ----------------------
function notifyOverflow(overflow) {
  if (overflow.length === 0) {
    statusBox.textContent = `✅ Layout selesai. Semua item masuk canvas.`;
    showToast("✅ Layout selesai. Semua item masuk canvas.");
    return;
  }

  // hitung per file name
  const map = new Map();
  for (const o of overflow) {
    const name = o.inst.file.name;
    map.set(name, (map.get(name) || 0) + 1);
  }

  let msg = `⚠️ Canvas penuh / ada item tidak masuk.\n\nTidak masuk:\n`;
  for (const [name, cnt] of map.entries()) {
    msg += `- ${name}  x${cnt}\n`;
  }

  statusBox.textContent = msg;
  showToast(msg, 6500);
}

function doAutoLayout() {
  const pageW = mm(canvasW.value);
  const pageH = mm(canvasH.value);
  const spacing = mm(spacingMm.value); // 3mm default
  const margin = mm(marginMm.value);

  if (pageW <= 0 || pageH <= 0) {
    showToast("Ukuran canvas tidak valid.");
    return;
  }

  const instances = buildInstancesFromQueue();
  if (instances.length === 0) {
    showToast("Queue kosong. Pilih SVG dulu.");
    return;
  }

  const { placements, overflow } = packShelf(instances, pageW, pageH, spacing, margin);

  renderLayoutToPreview(placements, pageW, pageH);

  lastLayoutSvg = buildExportSvgString(placements, pageW, pageH);
  btnDownload.disabled = placements.length === 0;

  notifyOverflow(overflow);
}

// ---------------------- Pan/Zoom (Ctrl+Wheel, Drag pan, dblclick reset) ----------------------
function screenToSvgDelta(dx, dy) {
  // pan delta in screen pixels -> apply directly (we pan in svg user units after scaling?).
  // since viewport transform is translate+scale, we can just translate by dx/zoom, dy/zoom
  return { x: dx / zoom, y: dy / zoom };
}

stage.addEventListener("wheel", (e) => {
  // Ctrl+Wheel = zoom; Wheel normal jangan ganggu sidebar
  if (!e.ctrlKey) return;

  e.preventDefault();

  const delta = -Math.sign(e.deltaY) * 0.08; // step
  const newZoom = Math.min(8, Math.max(0.1, zoom * (1 + delta)));

  // zoom towards mouse position
  const pt = stage.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const ctm = stage.getScreenCTM();
  if (!ctm) return;
  const svgP = pt.matrixTransform(ctm.inverse());

  // transform: translate(pan) scale(zoom)
  // keep point stable:
  const k = newZoom / zoom;
  panX = svgP.x - (svgP.x - panX) * k;
  panY = svgP.y - (svgP.y - panY) * k;

  zoom = newZoom;
  applyViewportTransform();
}, { passive: false });

stage.addEventListener("mousedown", (e) => {
  // drag pan
  isPanning = true;
  panStart = { x: e.clientX, y: e.clientY };
  panOrigin = { x: panX, y: panY };
  stage.style.cursor = "grabbing";
});

window.addEventListener("mousemove", (e) => {
  if (!isPanning) return;
  const dx = e.clientX - panStart.x;
  const dy = e.clientY - panStart.y;
  const d = screenToSvgDelta(dx, dy);
  panX = panOrigin.x + d.x;
  panY = panOrigin.y + d.y;
  applyViewportTransform();
});

window.addEventListener("mouseup", () => {
  isPanning = false;
  stage.style.cursor = "default";
});

stage.addEventListener("dblclick", () => {
  zoom = 1;
  panX = 20;
  panY = 20;
  applyViewportTransform();
});

// ---------------------- UI events ----------------------
btnCollapseLeft.addEventListener("click", () => {
  appRoot.classList.toggle("left-collapsed");
  btnCollapseLeft.textContent = appRoot.classList.contains("left-collapsed") ? "⟩⟩" : "⟨⟨";
});

btnCollapseBottom.addEventListener("click", () => {
  appRoot.classList.toggle("bottom-collapsed");
  btnCollapseBottom.textContent = appRoot.classList.contains("bottom-collapsed") ? "⟰" : "⟱";
});

categorySelect.addEventListener("change", async () => {
  searchInput.value = "";
  await loadFiles(categorySelect.value);
});

searchInput.addEventListener("input", () => applyFilter());

btnAutoLayout.addEventListener("click", () => doAutoLayout());
btnClearCanvas.addEventListener("click", () => clearPlaced());

btnDownload.addEventListener("click", () => {
  if (!lastLayoutSvg) return;
  const w = mm(canvasW.value);
  const h = mm(canvasH.value);
  const fname = `layout_${w}x${h}mm.svg`;
  downloadTextFile(fname, lastLayoutSvg);
});

// update page rect on size change
[canvasW, canvasH].forEach((inp) => {
  inp.addEventListener("change", () => updatePageRect());
});

// ---------------------- init ----------------------
(async function init() {
  updatePageRect();
  applyViewportTransform();

  try {
    await loadCategories();
    await loadFiles("all");
    renderQueue();
    showToast("Ready. Pilih SVG dari panel bawah lalu masuk queue.");
  } catch (e) {
    console.error(e);
    showToast("Gagal load data. Cek server.js berjalan dan folder svgs ada.");
  }
})();
