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
const btnDeleteFolder = document.getElementById("btnDeleteFolder");

const objCount = document.getElementById("objCount");
const zoomLabel = document.getElementById("zoomLabel");

const toast = document.getElementById("toast");

// Upload Modal DOM
const btnOpenUpload = document.getElementById("btnOpenUpload");
const uploadModal = document.getElementById("uploadModal");
const btnCloseUpload = document.getElementById("btnCloseUpload");
const uploadFolderInput = document.getElementById("uploadFolderInput");
const folderDropdown = document.getElementById("folderDropdown");
const fileInput = document.getElementById("fileInput");
const btnSelectFiles = document.getElementById("btnSelectFiles");
const uploadPreview = document.getElementById("uploadPreview");
const btnDoUpload = document.getElementById("btnDoUpload");

// Download Modal DOM
const downloadModal = document.getElementById("downloadModal");
const btnCloseDownloadModal = document.getElementById("btnCloseDownloadModal");
const filenameInput = document.getElementById("filenameInput");
const btnConfirmDownload = document.getElementById("btnConfirmDownload");

// SVG stage
const stage = document.getElementById("stage");
const viewport = document.getElementById("viewport");
const pageRect = document.getElementById("pageRect");
const placedGroup = document.getElementById("placed");

// ---------------------- State ----------------------
let allFiles = [];
let filteredFiles = [];
let queue = new Map();
let selectedUploadFiles = [];
let availableFolders = [];

let lastLayoutSvg = null;

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
  viewport.setAttribute(
    "transform",
    `translate(${panX} ${panY}) scale(${zoom})`,
  );
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
  availableFolders = (data.categories || []).filter(c => c !== "all");

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
  suggestions.innerHTML = "";
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
    return (
      f.name.toLowerCase().includes(q) || f.relPath.toLowerCase().includes(q)
    );
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

    let thumbUrl = f._thumbUrl;
    if (!thumbUrl) {
      try {
        const svgText = await fetchText(
          `/api/svg?path=${encodeURIComponent(f.relPath)}`,
        );
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

    // DELETE BUTTON
    const delBtn = document.createElement("button");
    delBtn.className = "card-del";
    delBtn.innerHTML = "✕";
    delBtn.title = "Hapus file dari local";
    delBtn.onclick = (e) => {
      e.stopPropagation(); // Jangan tambah ke queue
      confirmDelete(f);
    };
    card.appendChild(delBtn);

    card.addEventListener("click", () => addToQueue(f));
    frag.appendChild(card);
  }
  gallery.appendChild(frag);
}

async function confirmDelete(file) {
  if (!confirm(`Hapus file "${file.name}" secara permanen dari server?`)) return;

  try {
    const res = await fetch(`/api/delete?path=${encodeURIComponent(file.relPath)}`, {
      method: "DELETE"
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Gagal menghapus file");

    showToast(`✅ File terhapus: ${file.name}`);
    
    // Refresh gallery
    await loadFiles(categorySelect.value);
  } catch (err) {
    showToast(`❌ Error: ${err.message}`);
  }
}

// ---------------------- Queue ----------------------
async function addToQueue(file) {
  const id = file.id;
  if (queue.has(id)) {
    const it = queue.get(id);
    it.pcs += 1;
    queue.set(id, it);
    renderQueue();
    showToast(`+1 pcs: ${file.name}`);
    return;
  }

  let svgText = file._svgText;
  if (!svgText)
    svgText = await fetchText(
      `/api/svg?path=${encodeURIComponent(file.relPath)}`,
    );
  const thumbUrl = file._thumbUrl || encodeSvgToDataUrl(svgText);

  queue.set(id, { file, pcs: 1, thumbUrl, svgText });
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
    input.addEventListener("input", () => {
      const v = Math.max(0, parseInt(input.value || "0", 10));
      item.pcs = isFinite(v) ? v : 0;
    });
    input.addEventListener("blur", () => {
      if (item.pcs <= 0) {
        queue.delete(file.id);
        renderQueue();
      }
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

function extractMetaFromSvgText(svgText) {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const root = doc.documentElement;

  let vbX = 0,
    vbY = 0,
    vbW = null,
    vbH = null;
  const vb = root.getAttribute("viewBox");

  if (vb) {
    const parts = vb
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (parts.length === 4 && parts.every(isFinite)) {
      [vbX, vbY, vbW, vbH] = parts;
    }
  }

  const wMm = parseLengthToMmClient(root.getAttribute("width"));
  const hMm = parseLengthToMmClient(root.getAttribute("height"));

  return {
    vbX,
    vbY,
    vbW,
    vbH,
    wMm: wMm || (vbW ? vbW * (25.4 / 96) : null),
    hMm: hMm || (vbH ? vbH * (25.4 / 96) : null),
  };
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
    case "mm":
      return val;
    case "cm":
      return val * 10;
    case "in":
      return val * 25.4;
    case "pt":
      return (val * 25.4) / 72;
    case "px":
    default:
      return val * PX_TO_MM;
  }
}

function isolateSvg(svgText, prefix, xMm, yMm, origWMm, origHMm, isRotated = false) {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const root = doc.documentElement;

  if (!root || root.tagName.toLowerCase() !== "svg") return "";

  root.querySelectorAll("metadata, title, desc").forEach((el) => el.remove());

  root.querySelectorAll("*").forEach((el) => {
    const attrs = Array.from(el.attributes);
    for (const attr of attrs) {
      if (
        attr.name.startsWith("inkscape:") ||
        attr.name.startsWith("sodipodi:") ||
        attr.name.startsWith("data-")
      ) {
        el.removeAttribute(attr.name);
      }
    }
  });

  root.querySelectorAll("image, use").forEach((el) => {
    const href = el.getAttribute("href");
    if (href) {
      el.setAttribute("xlink:href", href);
      el.removeAttribute("href");
    }
  });

  root.querySelectorAll("[id]").forEach((el) => {
    const oldId = el.getAttribute("id");
    if (oldId) el.setAttribute("id", `${prefix}_${oldId}`);
  });

  root.querySelectorAll("[class]").forEach((el) => {
    const oldClass = el.getAttribute("class");
    if (oldClass) {
      const newClass = oldClass
        .trim()
        .split(/\s+/)
        .map((c) => `${prefix}_${c}`)
        .join(" ");
      el.setAttribute("class", newClass);
    }
  });

  root.querySelectorAll("style").forEach((style) => {
    if (style.textContent) {
      style.textContent = style.textContent
        .replace(/\.([a-zA-Z0-9_-]+)/g, `.${prefix}_$1`)
        .replace(/#([a-zA-Z0-9_-]+)/g, `#${prefix}_$1`);
    }
  });

  let innerContent = root.innerHTML;

  innerContent = innerContent.replace(
    /url\(\s*['"]?#([^)'"]+)['"]?\s*\)/gi,
    `url(#${prefix}_$1)`,
  );
  innerContent = innerContent.replace(
    /(xlink:href|href)\s*=\s*["']#([^"']+)["']/gi,
    `$1="#${prefix}_$2"`,
  );

  let vbX = 0,
    vbY = 0,
    vbW = origWMm,
    vbH = origHMm;

  const vb = root.getAttribute("viewBox");

  if (vb) {
    const parts = vb
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (parts.length === 4 && parts.every(isFinite)) {
      [vbX, vbY, vbW, vbH] = parts;
    }
  } else {
    const wAttr = parseFloat(root.getAttribute("width"));
    const hAttr = parseFloat(root.getAttribute("height"));
    if (!isNaN(wAttr) && !isNaN(hAttr)) {
      vbW = wAttr;
      vbH = hAttr;
    }
  }

  if (isRotated) {
    // Memutar 90 derajat searah jarum jam dengan center top-left koordinat yang baru
    // Kita translate ke X yang baru lalu tambah tinggi aslinya, baru rotate 90.
    return `<g transform="translate(${xMm + origHMm}, ${yMm}) rotate(90)">
  <svg x="0" y="0" width="${origWMm}" height="${origHMm}" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" overflow="visible">
${innerContent}
  </svg>
</g>`;
  } else {
    return `<svg x="${xMm}" y="${yMm}" width="${origWMm}" height="${origHMm}" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" overflow="visible">\n${innerContent}\n</svg>`;
  }
}

function buildInstancesFromQueue() {
  const instances = [];
  for (const item of queue.values()) {
    const pcs = Math.max(0, parseInt(item.pcs || 0, 10));
    if (pcs <= 0) continue;

    const file = item.file;
    if (!file.wMm || !file.hMm) {
      const meta = extractMetaFromSvgText(item.svgText);
      item.file.wMm = meta.wMm;
      item.file.hMm = meta.hMm;
    }

    for (let i = 0; i < pcs; i++) {
      instances.push({
        key: `${file.id}::${i + 1}`,
        file,
        svgText: item.svgText,
      });
    }
  }
  instances.sort((a, b) => (b.file.hMm || 0) - (a.file.hMm || 0));
  return instances;
}

function packShelf(instances, pageW, pageH, spacing, margin) {
  const placements = [];
  const overflow = [];

  // Urutkan algoritma First-Fit Decreasing (menggunakan area/dimensi maksimal terbesar ke terkecil)
  const items = instances.map(inst => {
    return {
      inst,
      w: mm(inst.file.wMm),
      h: mm(inst.file.hMm),
      maxSide: Math.max(mm(inst.file.wMm), mm(inst.file.hMm))
    };
  }).filter(item => {
    if (item.w <= 0 || item.h <= 0) {
      overflow.push({ inst: item.inst, reason: "invalid_size" });
      return false;
    }
    const fitNormal = item.w <= pageW - margin * 2 && item.h <= pageH - margin * 2;
    const fitRotated = item.h <= pageW - margin * 2 && item.w <= pageH - margin * 2;
    if (!fitNormal && !fitRotated) {
      overflow.push({ inst: item.inst, reason: "bigger_than_canvas" });
      return false;
    }
    return true;
  });

  items.sort((a, b) => b.maxSide - a.maxSide);

  let unplaced = [...items];
  let currentY = margin;

  while (unplaced.length > 0) {
    let currentX = margin;
    let rowH = 0;
    let placedInRow = [];

    let progress = true;
    while (progress) {
      progress = false;

      // Iterasi seluruh aset yang belum ditempatkan untuk mencari yang muat di sisa baris ini
      for (let i = 0; i < unplaced.length; i++) {
        const item = unplaced[i];
        const needSpacing = currentX > margin;
        const actualSpacing = needSpacing ? spacing : 0;
        const availW = (pageW - margin) - (currentX + actualSpacing);

        // Coba orientasi Normal
        if (item.w <= availW) {
          const potentialRowH = Math.max(rowH, item.h);
          if (currentY + potentialRowH <= (pageH - margin)) {
            placements.push({ 
              inst: item.inst, x: currentX + actualSpacing, y: currentY, 
              w: item.w, h: item.h, 
              originalW: item.w, originalH: item.h, 
              isRotated: false 
            });
            placedInRow.push(item);
            currentX += actualSpacing + item.w;
            rowH = potentialRowH;
            unplaced.splice(i, 1);
            progress = true;
            break;
          }
        }

        // Coba orientasi Rotated 90 Derajat (w dan h ditukar)
        const rotW = item.h;
        const rotH = item.w;
        if (rotW <= availW) {
          const potentialRowH = Math.max(rowH, rotH);
          if (currentY + potentialRowH <= (pageH - margin)) {
            placements.push({ 
              inst: item.inst, x: currentX + actualSpacing, y: currentY, 
              w: rotW, h: rotH, 
              originalW: item.w, originalH: item.h, 
              isRotated: true 
            });
            placedInRow.push(item);
            currentX += actualSpacing + rotW;
            rowH = potentialRowH;
            unplaced.splice(i, 1);
            progress = true;
            break;
          }
        }
      }
    }

    // Jika tak satu pun muat di baris kosong, berarti page full
    if (placedInRow.length === 0) {
      break;
    }

    currentY += rowH + spacing;
  }

  // Sisa file yang tidak muat
  unplaced.forEach(item => {
    overflow.push({ inst: item.inst, reason: "canvas_full" });
  });

  return { placements, overflow };
}

// ---------------------- Render Layout & Export ----------------------
function renderLayoutToPreview(placements, pageW, pageH) {
  clearPlaced();
  updatePageRect();

  const frag = document.createDocumentFragment();
  let count = 0;

  for (const p of placements) {
    const file = p.inst.file;
    const svgText = p.inst.svgText;
    const prefix = `i${count}_${Math.random().toString(36).slice(2, 8)}`;

    // Panggil isolateSvg dengan parameter orientasi asli dan isRotated
    const isolatedGroupString = isolateSvg(svgText, prefix, p.x, p.y, p.originalW, p.originalH, p.isRotated);

    // Konversi string kembali menjadi DOM yang aman untuk preview
    const tempSvg = document.createElementNS(SVG_NS, "svg");
    tempSvg.innerHTML = isolatedGroupString;
    const gNode = tempSvg.firstElementChild; // Ini bisa jadi <g> jika dirotasi, atau <svg> jika tidak

    if (gNode) {
      gNode.setAttribute("data-name", file.name);
      frag.appendChild(gNode);
    }
    count++;
  }

  placedGroup.appendChild(frag);
  objCount.textContent = String(placements.length);
}

function buildExportSvgString(placements, pageW, pageH) {
  let body = "";
  let count = 0;

  for (const p of placements) {
    const prefix = `e${count}_${Math.random().toString(36).slice(2, 8)}`;
    body += `\n  ${isolateSvg(p.inst.svgText, prefix, p.x, p.y, p.originalW, p.originalH, p.isRotated)}`;
    count++;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${pageW}mm" height="${pageH}mm"
     viewBox="0 0 ${pageW} ${pageH}">
  ${body}
</svg>`;
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

function notifyOverflow(overflow) {
  if (overflow.length === 0) {
    statusBox.textContent = `✅ Layout selesai. Semua item masuk canvas.`;
    showToast("✅ Layout selesai. Semua item masuk canvas.");
    return;
  }
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
  const spacing = mm(spacingMm.value);
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

  const { placements, overflow } = packShelf(
    instances,
    pageW,
    pageH,
    spacing,
    margin,
  );
  renderLayoutToPreview(placements, pageW, pageH);

  lastLayoutSvg = buildExportSvgString(placements, pageW, pageH);
  btnDownload.disabled = placements.length === 0;
  notifyOverflow(overflow);
}

// ---------------------- Pan/Zoom ----------------------
stage.addEventListener(
  "wheel",
  (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const delta = -Math.sign(e.deltaY) * 0.08;
    const newZoom = Math.min(8, Math.max(0.1, zoom * (1 + delta)));

    const pt = stage.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = stage.getScreenCTM();
    if (!ctm) return;
    const svgP = pt.matrixTransform(ctm.inverse());

    const k = newZoom / zoom;
    panX = svgP.x - (svgP.x - panX) * k;
    panY = svgP.y - (svgP.y - panY) * k;

    zoom = newZoom;
    applyViewportTransform();
  },
  { passive: false },
);

stage.addEventListener("mousedown", (e) => {
  isPanning = true;
  panStart = { x: e.clientX, y: e.clientY };
  panOrigin = { x: panX, y: panY };
  stage.style.cursor = "grabbing";
});

window.addEventListener("mousemove", (e) => {
  if (!isPanning) return;
  const dx = e.clientX - panStart.x;
  const dy = e.clientY - panStart.y;
  const d = { x: dx / zoom, y: dy / zoom };
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
  btnCollapseLeft.textContent = appRoot.classList.contains("left-collapsed")
    ? "⟩⟩"
    : "⟨⟨";
});

btnCollapseBottom.addEventListener("click", () => {
  appRoot.classList.toggle("bottom-collapsed");
  btnCollapseBottom.textContent = appRoot.classList.contains("bottom-collapsed")
    ? "⟰"
    : "⟱";
});

categorySelect.addEventListener("change", async () => {
  searchInput.value = "";
  // Check if "all" or valid folder
  btnDeleteFolder.hidden = (categorySelect.value === "all");
  await loadFiles(categorySelect.value);
});

btnDeleteFolder.addEventListener("click", async () => {
  const folder = categorySelect.value;
  if (!folder || folder === "all") return;

  if (!confirm(`⚠️ PERINGATAN: Hapus seluruh folder "${folder}" beserta ISINYA?\nTindakan ini tidak bisa dibatalkan.`)) return;

  try {
    const res = await fetch(`/api/delete?path=${encodeURIComponent(folder)}`, {
      method: "DELETE"
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal menghapus folder");

    showToast(`✅ Folder "${folder}" telah dihapus.`);
    
    // Refresh UI
    await loadCategories();
    categorySelect.value = "all";
    btnDeleteFolder.hidden = true;
    await loadFiles("all");
  } catch (err) {
    showToast(`❌ Error: ${err.message}`);
  }
});

searchInput.addEventListener("input", () => applyFilter());
btnAutoLayout.addEventListener("click", () => doAutoLayout());

btnClearCanvas.addEventListener("click", () => {
  clearPlaced();
  queue.clear();
  renderQueue();
});

btnDownload.addEventListener("click", () => {
  if (!lastLayoutSvg) return;
  const w = mm(canvasW.value);
  const h = mm(canvasH.value);
  const totalObj = objCount.textContent;
  const dateStr = new Date()
    .toISOString()
    .slice(0, 19)
    .replace(/[:-]/g, "")
    .replace("T", "_");
  
  // Set default filename
  const defaultName = `Layout_${w}x${h}mm_${totalObj}pcs_${dateStr}`;
  filenameInput.value = defaultName;
  
  // Show modal
  downloadModal.hidden = false;
  filenameInput.focus();
  filenameInput.select();
});

btnConfirmDownload.addEventListener("click", () => {
  let fname = (filenameInput.value || "").trim();
  if (!fname) return showToast("Nama file tidak boleh kosong");
  
  if (!fname.toLowerCase().endsWith(".svg")) {
    fname += ".svg";
  }
  
  downloadTextFile(fname, lastLayoutSvg);
  downloadModal.hidden = true;
  showToast(`✅ File tersimpan: ${fname}`);
});

btnCloseDownloadModal.addEventListener("click", () => {
  downloadModal.hidden = true;
});

// Close when clicking backdrop for download modal
downloadModal.addEventListener("click", (e) => {
  if (e.target === downloadModal) {
    downloadModal.hidden = true;
  }
});

// Handle Enter key in filename input
filenameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    btnConfirmDownload.click();
  }
});

// ---------------------- Upload Logic ----------------------
btnOpenUpload.addEventListener("click", () => {
  uploadModal.hidden = false;
  selectedUploadFiles = [];
  uploadFolderInput.value = "";
  renderUploadPreview();
});

btnCloseUpload.addEventListener("click", () => {
  uploadModal.hidden = true;
});

// Custom Dropdown Logic
function renderFolderDropdown(filter = "") {
  const q = filter.toLowerCase();
  const matches = availableFolders.filter(f => f.toLowerCase().includes(q));
  
  if (matches.length === 0) {
    folderDropdown.hidden = true;
    return;
  }

  folderDropdown.innerHTML = "";
  matches.forEach(name => {
    const item = document.createElement("div");
    item.className = "dropdown-item";
    item.textContent = name;
    item.onclick = () => {
      uploadFolderInput.value = name;
      folderDropdown.hidden = true;
    };
    folderDropdown.appendChild(item);
  });
  folderDropdown.hidden = false;
}

uploadFolderInput.addEventListener("input", () => {
  renderFolderDropdown(uploadFolderInput.value);
});

uploadFolderInput.addEventListener("focus", () => {
  renderFolderDropdown(uploadFolderInput.value);
});

// Close dropdown when clicking outside
document.addEventListener("click", (e) => {
  if (e.target !== uploadFolderInput && !folderDropdown.contains(e.target)) {
    folderDropdown.hidden = true;
  }
});

// Close when clicking backdrop
uploadModal.addEventListener("click", (e) => {
  if (e.target === uploadModal) {
    uploadModal.hidden = true;
  }
});

btnSelectFiles.addEventListener("click", () => {
  fileInput.click();
});

fileInput.addEventListener("change", (e) => {
  const files = Array.from(e.target.files);
  for (const f of files) {
    if (!selectedUploadFiles.find(sf => sf.name === f.name)) {
      selectedUploadFiles.push(f);
    }
  }
  fileInput.value = ""; // reset so same file can be picked again if removed
  renderUploadPreview();
});

function renderUploadPreview() {
  uploadPreview.innerHTML = "";
  selectedUploadFiles.forEach((file, index) => {
    const item = document.createElement("div");
    item.className = "up-item";
    
    const img = document.createElement("img");
    const reader = new FileReader();
    reader.onload = (e) => img.src = e.target.result;
    reader.readAsDataURL(file);
    item.appendChild(img);

    const btn = document.createElement("button");
    btn.className = "up-remove";
    btn.textContent = "✕";
    btn.onclick = () => {
      selectedUploadFiles.splice(index, 1);
      renderUploadPreview();
    };
    item.appendChild(btn);
    uploadPreview.appendChild(item);
  });
  btnDoUpload.disabled = selectedUploadFiles.length === 0;
}

btnDoUpload.addEventListener("click", async () => {
  const folder = (uploadFolderInput.value || "").trim();
  if (!folder) {
    showToast("Tolong pilih atau ketik nama folder tujuan.");
    return;
  }

  const formData = new FormData();
  formData.append("folderName", folder);
  selectedUploadFiles.forEach(f => {
    formData.append("files", f);
  });

  try {
    btnDoUpload.disabled = true;
    btnDoUpload.textContent = "Uploading...";
    
    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData
    });
    const data = await res.json();
    
    if (!res.ok) throw new Error(data.error || "Upload failed");

    showToast(`✅ Berhasil upload ${data.count} file ke ${data.folder}`);
    uploadModal.hidden = true;
    
    // Refresh
    await loadCategories();
    categorySelect.value = data.folder || "all";
    await loadFiles(categorySelect.value);
    
  } catch (err) {
    showToast(`❌ Error: ${err.message}`);
  } finally {
    btnDoUpload.disabled = false;
    btnDoUpload.textContent = "Mulai Upload";
  }
});

[canvasW, canvasH].forEach((inp) => {
  inp.addEventListener("change", () => updatePageRect());
});

// ---------------------- init ----------------------
(async function init() {
  updatePageRect();
  applyViewportTransform();
  try {
    await loadCategories();
    btnDeleteFolder.hidden = (categorySelect.value === "all");
    await loadFiles("all");
    renderQueue();
    showToast("Ready. Pilih SVG dari panel bawah lalu masuk queue.");
  } catch (e) {
    console.error(e);
    showToast("Gagal load data. Cek server.js berjalan dan folder svgs ada.");
  }
})();
