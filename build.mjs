// Baut das Spiel zu einer einzigen, eigenständigen index.html (inkl. Three.js)
import { build } from 'esbuild';
import fs from 'fs';

import path from 'path';
// ez-tree bringt große Texturen mit; das Spiel nutzt eigene, kleinere (assets/tex) – die Originale werden durch einen Platzhalter ersetzt
const ezAssets = { name: 'ez-assets', setup(b) { b.onResolve({ filter: /\.(jpg|png)$/ }, (a) => (a.importer.includes('ez-tree') ? { path: path.resolve('assets/tex/blank.png') } : null)); } };
const res = await build({ entryPoints: ['src/main.js'], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020', legalComments: 'none', plugins: [ezAssets], loader: { '.webp': 'dataurl', '.png': 'dataurl' }, alias: { '@dgreenheck/ez-tree': './node_modules/@dgreenheck/ez-tree/src/lib/index.js' } });
const js = res.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
// Pferdemodell direkt einbetten, damit eine einzige Datei genügt (auch per Doppelklick und als Artifact)
const glb = fs.existsSync('assets/horse.glb') ? `<script>window.HORSE_GLB="${fs.readFileSync('assets/horse.glb').toString('base64')}";</script>\n` : '';
const frag = fs.readFileSync('src/index.template.html', 'utf8').replace('<script>/*__JS__*/</script>', () => `${glb}<script>${js}</script>`);
const page = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<style>body{margin:0}[hidden]{display:none!important}</style>
</head>
<body>
${frag}
</body>
</html>
`;
fs.writeFileSync('index.html', page);
if (process.argv[2]) fs.writeFileSync(process.argv[2], frag);
console.log('index.html', (page.length / 1024).toFixed(0) + ' kB');
