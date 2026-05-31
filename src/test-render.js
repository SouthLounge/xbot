// Test render script: render a scene graph JSON to SVG and PNG
// Usage: node src/test-render.js <path-to-scene-graph.json> [style]

import { renderSceneGraph } from './renderer.js';
import { applyBoxLayout } from './box-layout.js';
import { svgToPng } from './png.js';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname, basename } from 'path';

const args = process.argv.slice(2);
if (args.length < 1) {
    console.error('Usage: node src/test-render.js <scene-graph.json> [style]');
    process.exit(1);
}

const inputPath = resolve(args[0]);
const styleName = args[1] || 'icml';

console.log(`[test-render] Reading: ${inputPath}`);
console.log(`[test-render] Style: ${styleName}`);

const json = readFileSync(inputPath, 'utf-8');
let sceneGraph = JSON.parse(json);

// Apply box layout if scene graph contains hbox/vbox containers
const hasBoxLayout = (sceneGraph.nodes || []).some(
    n => n.kind === 'hbox' || n.kind === 'vbox'
);

if (hasBoxLayout) {
    console.log(`[test-render] Applying box layout...`);
    sceneGraph = applyBoxLayout(sceneGraph, styleName);
    console.log(`[test-render] Box layout resolved: ${sceneGraph.nodes.length} nodes, canvas ${sceneGraph.width}x${sceneGraph.height}`);
}

// Render SVG
const svgString = renderSceneGraph(sceneGraph, styleName);

// Write SVG
const dir = dirname(inputPath);
const base = basename(inputPath, '.json');
const svgPath = resolve(dir, `${base}-output.svg`);
const pngPath = resolve(dir, `${base}-output.png`);

writeFileSync(svgPath, svgString, 'utf-8');
console.log(`[test-render] SVG written: ${svgPath}`);

// Render PNG
const pngBuffer = svgToPng(svgString, 1600);
writeFileSync(pngPath, pngBuffer);
console.log(`[test-render] PNG written: ${pngPath}`);
console.log(`[test-render] Done!`);
