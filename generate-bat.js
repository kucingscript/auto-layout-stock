const fs = require("fs");
const path = require("path");
const os = require("os");

const projectDir = __dirname;
const desktopPath = path.join(os.homedir(), "Desktop");
const batFilePath = path.join(desktopPath, "auto-layout-stock.bat");

const batContent = `@echo off
cd /d "${projectDir}"

echo === Git Pull ===
git pull

echo === NPM Start ===
npm start

pause
`;

fs.writeFileSync(batFilePath, batContent, "utf8");

console.log("✅ File .bat berhasil dibuat di:");
console.log(batFilePath);