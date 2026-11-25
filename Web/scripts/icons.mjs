// Generate all branded assets from the existing Lucide icon library.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FolderOpen } from "lucide-react";
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const assets = path.join(root, "assets");
const favicon = path.join(root, "Web", "src", "app", "favicon.ico");
await mkdir(assets, { recursive: true });
// Keep the Lucide path intact. Color definitions add depth without an opaque
// tile or black/white outline that disappears against desktop backgrounds.
const icon = renderToStaticMarkup(React.createElement(FolderOpen, {
  size: 512, color: "#2875bf", strokeWidth: 1.25, fill: "url(#folder-layers)",
}));
const definitions = '<defs><linearGradient id="folder-layers" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="#ffd26a"/><stop offset="0.36" stop-color="#f4b544"/><stop offset="0.365" stop-color="#8be0ec"/><stop offset="0.63" stop-color="#4abce8"/><stop offset="1" stop-color="#397de0"/></linearGradient></defs>';
const artwork = icon.replace(/(<svg[^>]*>)/, "$1" + definitions);
const source = await sharp(Buffer.from(artwork)).png().toBuffer();
await writeFile(path.join(assets, "file-desk.png"), source);

// Render each target resolution from the original vector for crisp small icons.
// ICO stores multiple PNG frames. Windows selects the frame matching taskbar,
// tray or Explorer scale instead of resizing one small bitmap for every context.
const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const frames = await Promise.all(sizes.map(size => sharp(Buffer.from(artwork)).resize(size, size).png().toBuffer()));
const directory = Buffer.alloc(6 + sizes.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
frames.forEach((frame, index) => {
  const entry = 6 + index * 16;
  directory[entry] = sizes[index] === 256 ? 0 : sizes[index];
  directory[entry + 1] = sizes[index] === 256 ? 0 : sizes[index];
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(frame.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});
const ico = Buffer.concat([directory, ...frames]);
await writeFile(path.join(assets, "file-desk.ico"), ico);
await writeFile(favicon, ico);
console.log("Updated Windows, tray and web icons.");
