// Baut das Spiel zu einer einzigen, eigenständigen index.html (inkl. Three.js)
import { build } from 'esbuild';
import fs from 'fs';

const res = await build({ entryPoints: ['src/main.js'], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020', legalComments: 'none' });
const js = res.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const frag = fs.readFileSync('src/index.template.html', 'utf8').replace('/*__JS__*/', () => js);
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
