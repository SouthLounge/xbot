import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = join(__dirname, '..', 'fonts');

// Load font files once at startup
let fontBuffers = [];
try {
    const fontFiles = ['SpaceMono-Regular.ttf', 'SpaceMono-Bold.ttf'];
    for (const file of fontFiles) {
        try {
            fontBuffers.push(readFileSync(join(FONTS_DIR, file)));
        } catch {
            // Font file not found — resvg will use fallback
        }
    }
} catch {
    // fonts directory not found
}

export function svgToPng(svgString, width = 1600) {
    const opts = {
        fitTo: { mode: 'width', value: width },
        font: {
            fontFiles: fontBuffers.length > 0
                ? fontBuffers.map((_, i) => join(FONTS_DIR,
                    i === 0 ? 'SpaceMono-Regular.ttf' : 'SpaceMono-Bold.ttf'))
                : [],
            loadSystemFonts: true,
            defaultFontFamily: 'Space Mono',
        },
        logLevel: 'off',
    };

    const resvg = new Resvg(svgString, opts);
    const pngData = resvg.render();
    return pngData.asPng();
}
