const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const multer = require("multer");
const PORT = 3000;

const ROOT_DIR = __dirname;
const SVGS_DIR = path.join(ROOT_DIR, "svgs");

// Multer storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const folderName = req.body.folderName || "";
    const targetDir = path.join(SVGS_DIR, folderName);
    
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    cb(null, targetDir);
  },
  filename: function (req, file, cb) {
    // Keep original filename
    cb(null, file.originalname);
  }
});

const upload = multer({ storage: storage });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(ROOT_DIR, "public")));
app.use("/svgs", express.static(SVGS_DIR)); // untuk akses file svg (dibatasi oleh folder svgs)

// ---------- Helpers ----------
function safeJoinUnderSvgs(rel) {
  // rel contoh: "treasure/file.svg" atau "file.svg"
  const clean = (rel || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const abs = path.resolve(SVGS_DIR, clean);
  if (!abs.startsWith(SVGS_DIR)) throw new Error("Invalid path");
  return abs;
}

function listSubfolders(dirAbs) {
  if (!fs.existsSync(dirAbs)) return [];
  return fs
    .readdirSync(dirAbs, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b));
}

function listSvgsRecursive(baseAbs, relBase = "") {
  const out = [];
  const items = fs.readdirSync(baseAbs, { withFileTypes: true });

  for (const it of items) {
    const abs = path.join(baseAbs, it.name);
    const rel = (relBase ? relBase + "/" : "") + it.name;

    if (it.isDirectory()) {
      out.push(...listSvgsRecursive(abs, rel));
    } else if (it.isFile() && it.name.toLowerCase().endsWith(".svg")) {
      out.push(rel.replace(/\\/g, "/"));
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function parseLengthToMm(lenStr) {
  // dukung: mm, cm, in, px, pt. kalau kosong -> null
  if (!lenStr) return null;
  const s = String(lenStr).trim();
  const m = s.match(/^([0-9.+-eE]+)\s*(mm|cm|in|px|pt)?$/);
  if (!m) return null;
  const val = parseFloat(m[1]);
  const unit = (m[2] || "px").toLowerCase();

  if (!isFinite(val)) return null;

  // asumsi SVG px = 96 DPI => 1px = 25.4/96 mm
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

function extractSvgMeta(svgText) {
  // Ambil width/height/viewBox
  // Ini ringan (regex) karena kita cuma butuh angka.
  const wMatch = svgText.match(/\bwidth\s*=\s*["']([^"']+)["']/i);
  const hMatch = svgText.match(/\bheight\s*=\s*["']([^"']+)["']/i);
  const vbMatch = svgText.match(/\bviewBox\s*=\s*["']([^"']+)["']/i);

  const widthAttr = wMatch ? wMatch[1] : null;
  const heightAttr = hMatch ? hMatch[1] : null;

  let vb = null;
  if (vbMatch) {
    const parts = vbMatch[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => isFinite(n))) {
      vb = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
    }
  }

  // Tentukan size mm + skala mm per unit viewBox.
  // Strategi:
  // - kalau ada width/height + viewBox: mm_per_unit = width_mm / vb.w
  // - kalau tidak ada width/height, tapi ada viewBox: anggap unit viewBox = px
  // - fallback: null
  const widthMm = parseLengthToMm(widthAttr);
  const heightMm = parseLengthToMm(heightAttr);

  let mmPerUnit = null;
  let wMm = null;
  let hMm = null;

  if (vb && widthMm && heightMm) {
    mmPerUnit = widthMm / vb.w; // asumsikan proporsional
    wMm = widthMm;
    hMm = heightMm;
  } else if (vb && widthMm && !heightMm) {
    mmPerUnit = widthMm / vb.w;
    wMm = widthMm;
    hMm = vb.h * mmPerUnit;
  } else if (vb && !widthMm && heightMm) {
    mmPerUnit = heightMm / vb.h;
    hMm = heightMm;
    wMm = vb.w * mmPerUnit;
  } else if (vb) {
    // anggap viewBox unit = px @96dpi
    const PX_TO_MM = 25.4 / 96;
    mmPerUnit = PX_TO_MM;
    wMm = vb.w * mmPerUnit;
    hMm = vb.h * mmPerUnit;
  } else if (widthMm && heightMm) {
    // tidak ada viewBox, tapi ada width/height
    // anggap user units = px; mmPerUnit tidak bisa pasti
    // tapi untuk packing, kita bisa pakai ukuran mm langsung
    mmPerUnit = null;
    wMm = widthMm;
    hMm = heightMm;
  }

  return {
    widthAttr,
    heightAttr,
    viewBox: vb,
    wMm,
    hMm,
    mmPerUnit
  };
}

// ---------- API ----------
app.get("/api/categories", (req, res) => {
  try {
    const subs = listSubfolders(SVGS_DIR);
    // "all" = semua svg (rekursif)
    res.json({ categories: ["all", ...subs] });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get("/api/list", (req, res) => {
  try {
    const cat = (req.query.cat || "all").toString();
    let filesRel = [];

    if (cat === "all") {
      filesRel = listSvgsRecursive(SVGS_DIR, "");
    } else {
      const catAbs = safeJoinUnderSvgs(cat);
      if (!fs.existsSync(catAbs) || !fs.statSync(catAbs).isDirectory()) {
        return res.json({ files: [] });
      }
      // hanya svg di folder itu (rekursif di dalamnya)
      filesRel = listSvgsRecursive(catAbs, cat);
    }

    const files = filesRel.map((relPath) => {
      const abs = safeJoinUnderSvgs(relPath);
      let meta = {};
      try {
        const txt = fs.readFileSync(abs, "utf8");
        meta = extractSvgMeta(txt);
      } catch {
        meta = { wMm: null, hMm: null, mmPerUnit: null, viewBox: null };
      }
      return {
        id: relPath,                 // unik
        name: path.basename(relPath),
        relPath,
        category: relPath.split("/")[0] || "root",
        wMm: meta.wMm,
        hMm: meta.hMm,
        mmPerUnit: meta.mmPerUnit,
        viewBox: meta.viewBox
      };
    });

    res.json({ files });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get("/api/svg", (req, res) => {
  try {
    const rel = (req.query.path || "").toString();
    const abs = safeJoinUnderSvgs(rel);
    if (!fs.existsSync(abs)) return res.status(404).send("Not found");
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.send(fs.readFileSync(abs, "utf8"));
  } catch (e) {
    res.status(400).send(String(e));
  }
});

app.post("/api/upload", upload.array("files"), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }
    res.json({ 
      message: "Files uploaded successfully", 
      count: req.files.length,
      folder: req.body.folderName 
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.delete("/api/delete", (req, res) => {
  try {
    const rel = (req.query.path || "").toString();
    if (!rel) return res.status(400).json({ error: "Path required" });
    
    const abs = safeJoinUnderSvgs(rel);
    if (!fs.existsSync(abs)) return res.status(404).json({ error: "Not found" });
    
    const stats = fs.statSync(abs);
    if (stats.isDirectory()) {
      // Hapus folder beserta isinya
      fs.rmSync(abs, { recursive: true, force: true });
    } else {
      // Hapus file tunggal
      fs.unlinkSync(abs);
    }

    res.json({ message: "Deleted successfully", path: rel });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`SVG Layout App running: http://localhost:${PORT}`);
  console.log(`SVG root folder: ${SVGS_DIR}`);
});
