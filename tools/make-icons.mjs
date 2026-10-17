// Renders the app icons with a headless browser: node tools/make-icons.mjs
import { chromium } from 'playwright'; // npm i -D playwright (dev only)
import { writeFileSync } from 'node:fs';

const draw = (size, maskable) => `
const c = document.createElement('canvas'); c.width = c.height = ${size};
const g = c.getContext('2d'); const s = ${size};
const grd = g.createLinearGradient(0, 0, 0, s);
grd.addColorStop(0, '#2a1640'); grd.addColorStop(0.45, '#b3452a'); grd.addColorStop(0.75, '#f0903a'); grd.addColorStop(1, '#ffd27a');
g.fillStyle = grd; g.fillRect(0, 0, s, s);
// sun
g.fillStyle = 'rgba(255,230,160,0.95)'; g.beginPath(); g.arc(s*0.5, s*0.66, s*0.2, 0, Math.PI*2); g.fill();
// mesas
g.fillStyle = '#3a160e';
g.beginPath(); g.moveTo(0, s*0.78); g.lineTo(s*0.08, s*0.78); g.lineTo(s*0.12, s*0.66); g.lineTo(s*0.3, s*0.66); g.lineTo(s*0.34, s*0.78); g.lineTo(s*0.62, s*0.8); g.lineTo(s*0.66, s*0.7); g.lineTo(s*0.8, s*0.7); g.lineTo(s*0.83, s*0.8); g.lineTo(s, s*0.8); g.lineTo(s, s); g.lineTo(0, s); g.fill();
// horseshoe
const pad = ${maskable ? 0.2 : 0.1};
g.save(); g.translate(s*0.5, s*(0.4)); const r = s*(0.26 - pad*0.4);
g.lineWidth = r*0.42; g.strokeStyle = '#e8eaf0'; g.lineCap = 'round';
g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = s*0.03;
g.beginPath(); g.arc(0, 0, r, Math.PI*0.72, Math.PI*2.28, false); g.stroke();
g.shadowBlur = 0; g.fillStyle = '#2fa39b';
for (let i = 0; i < 7; i++) { const a = Math.PI*0.8 + i*(Math.PI*1.4/6); g.beginPath(); g.arc(Math.cos(a)*r, Math.sin(a)*r, r*0.07, 0, Math.PI*2); g.fill(); }
g.restore();
c.toDataURL('image/png');`;

const b = await chromium.launch();
const pg = await b.newPage();
for (const [name, size, mask] of [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['maskable-512.png', 512, true], ['apple-touch-icon.png', 180, false]]) {
  const url = await pg.evaluate(draw(size, mask));
  writeFileSync(new URL(`../icons/${name}`, import.meta.url), Buffer.from(url.split(',')[1], 'base64'));
}
await b.close();
console.log('icons written');
