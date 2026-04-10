const fs = require("fs");
const path = require("path");
const os = require("os");

// 1. Deteksi direktori project (lokasi script ini)
const projectDir = __dirname;

// 2. Ambil path Desktop user
const desktopPath = path.join(os.homedir(), "Desktop");

// 3. Nama file .bat
const batFilePath = path.join(desktopPath, "auto-layout-stock.bat");

// 4. Isi file .bat (gunakan path dinamis)
const batContent = `@echo off
cd /d "${projectDir}"

echo === Git Pull ===
git pull

echo === NPM Start ===
npm start

pause
`;

// 5. Tulis file
fs.writeFileSync(batFilePath, batContent, "utf8");

console.log("✅ File .bat berhasil dibuat di:");
console.log(batFilePath);