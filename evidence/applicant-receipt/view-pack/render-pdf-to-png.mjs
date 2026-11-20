// Render a PDF to one PNG per page + print its page count and full text.
// pdf-parse 2.x (pdfjs + @napi-rs/canvas) from apps/backend's dependencies.
// Usage: node render-pdf-to-png.mjs <file.pdf> <outPrefix>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../apps/backend/package.json');
const { PDFParse } = createRequire(backend)('pdf-parse');
const [,, file, outPrefix] = process.argv;
const parser = new PDFParse({ data: fs.readFileSync(file) });
const info = await parser.getInfo();
console.log('pages', info.total);
const text = await parser.getText();
for (const p of text.pages) console.log(`--- page ${p.num}\n${p.text}`);
const shots = await parser.getScreenshot({ scale: 1.5 });
for (const s of shots.pages) fs.writeFileSync(`${outPrefix}-p${s.pageNumber}.png`, s.data);
await parser.destroy();
