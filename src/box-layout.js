// ============================================================
// FigGen Box Layout Engine
// LaTeX-style hbox/vbox layout: compute positions from
// semantic structure, not hardcoded pixel coordinates.
//
// Two-pass algorithm:
//   Pass 1 (measure): bottom-up, compute bounding box of each node
//   Pass 2 (place):   top-down, assign x,y from container rules
//
// Then flatten nested containers into a flat node array for rendering.
// ============================================================

import { STYLES } from './renderer.js';

// ---- Label sizing constants ----
const LABEL_GAP = 7;           // gap between content and label text
const LABEL_LINE_HEIGHT = 16;  // approximate height of one label line

function labelHeight(node, style) {
    if (!node.label) return 0;
    return LABEL_GAP + (node.label_font_size || style?.fontSize || 13) + 2;
}

function labelHeightTop(node, style) {
    if (!node.label || node.label_position !== 'top') return 0;
    return LABEL_GAP + (node.label_font_size || style?.fontSize || 13) + 2;
}

function labelHeightBottom(node, style) {
    if (!node.label) return 0;
    if (node.label_position === 'top') return 0;
    return LABEL_GAP + (node.label_font_size || style?.fontSize || 13) + 2;
}

// ---- Measure Functions ----
// Each returns { width, height } — the total bounding box including labels.

function measureTextLabel(node, style) {
    const fontSize = node.font_size || style?.fontSize || 13;
    const text = node.text || node.label || '';
    const charWidth = fontSize * 0.6;
    return {
        width: text.length * charWidth,
        height: fontSize + 4,
    };
}

function measureMatrixGrid(node, style) {
    const values = node.values || [[]];
    const rows = values.length;
    const cols = (values[0] || []).length;
    const cellW = node.cell_width || 45;
    const cellH = node.cell_height || 30;
    return {
        width: cols * cellW,
        height: rows * cellH + labelHeightBottom(node, style),
    };
}

function measureVectorBlock(node, style) {
    const values = node.values || [];
    const direction = node.direction || 'vertical';
    const cellW = node.cell_width || 50;
    const cellH = node.cell_height || 30;
    const lbTop = labelHeightTop(node, style);
    const lbBot = labelHeightBottom(node, style);

    if (direction === 'horizontal') {
        return {
            width: values.length * cellW,
            height: lbTop + cellH + lbBot,
        };
    }
    return {
        width: cellW,
        height: lbTop + values.length * cellH + lbBot,
    };
}

function measureArrow(node, parentDirection) {
    const len = node.length || 30;
    if (parentDirection === 'vbox') {
        return { width: 0, height: len };
    }
    // Default: horizontal (hbox or standalone)
    return { width: len, height: 0 };
}

function measureStackedBlock(node, style) {
    const layers = node.layers || [{}];
    const layerH = node.layer_height || 36;
    const gap = node.gap || 2;
    const h = layers.length * layerH + (layers.length - 1) * gap;
    return {
        width: node.width || 120,
        height: h + labelHeightBottom(node, style),
    };
}

function measureTensorBlock(node) {
    const depth = node.depth || 20;
    return {
        width: (node.width || 80) + depth,
        height: (node.height || 60) + depth,
    };
}

function measureWaveform(node, style) {
    const amp = node.amplitude || 12;
    return {
        width: node.width || 120,
        height: (node.height || 30) + amp * 2 + labelHeightBottom(node, style),
    };
}

function measureBracket(node) {
    if (node.direction === 'vertical') {
        return { width: 40, height: node.height || 150 };
    }
    return { width: node.width || 200, height: (node.tick_height || 8) + 20 };
}

function measureNode(node, style, parentDirection) {
    switch (node.kind) {
        case 'hbox':
            return measureHBox(node, style);
        case 'vbox':
            return measureVBox(node, style);
        case 'spacer':
            return { width: node.width || 0, height: node.height || 0 };
        case 'matrix_grid':
            return measureMatrixGrid(node, style);
        case 'vector_block':
            return measureVectorBlock(node, style);
        case 'rect':
            return { width: node.width || 120, height: node.height || 50 };
        case 'trapezoid':
            return { width: node.width || 120, height: node.height || 50 };
        case 'stacked_block':
            return measureStackedBlock(node, style);
        case 'circle_op': {
            const r = node.r || 16;
            return { width: r * 2, height: r * 2 + labelHeightBottom(node, style) };
        }
        case 'tensor_block':
            return measureTensorBlock(node);
        case 'waveform':
            return measureWaveform(node, style);
        case 'bracket':
            return measureBracket(node);
        case 'text_label':
            return measureTextLabel(node, style);
        case 'vertical_label': {
            const fs = node.font_size || 13;
            const text = node.text || node.label || '';
            return { width: fs + 4, height: text.length * fs * 0.6 };
        }
        case 'repeat_marker':
            return { width: 30, height: (node.font_size || 13) + 4 };
        case 'dots': {
            const sp = node.spacing || 8;
            if (node.direction === 'horizontal') return { width: sp * 2 + 8, height: 8 };
            return { width: 8, height: sp * 2 + 8 };
        }
        case 'arrow':
            return measureArrow(node, parentDirection);
        case 'curved_arrow':
            return measureArrow(node, parentDirection);
        case 'container':
            return { width: node.width || 200, height: node.height || 150 };
        case 'side_annotation':
            return measureTextLabel({ ...node, text: node.text }, style);
        default:
            return { width: 0, height: 0 };
    }
}

function measureHBox(node, style) {
    const children = node.children || [];
    const gap = node.gap || 0;
    const padding = node.padding || 0;

    let totalW = 0;
    let maxH = 0;

    for (let i = 0; i < children.length; i++) {
        const size = measureNode(children[i], style, 'hbox');
        totalW += size.width;
        maxH = Math.max(maxH, size.height);
    }

    totalW += Math.max(0, children.length - 1) * gap;

    return {
        width: totalW + 2 * padding,
        height: maxH + 2 * padding,
    };
}

function measureVBox(node, style) {
    const children = node.children || [];
    const gap = node.gap || 0;
    const padding = node.padding || 0;

    let maxW = 0;
    let totalH = 0;

    for (let i = 0; i < children.length; i++) {
        const size = measureNode(children[i], style, 'vbox');
        maxW = Math.max(maxW, size.width);
        totalH += size.height;
    }

    totalH += Math.max(0, children.length - 1) * gap;

    return {
        width: maxW + 2 * padding,
        height: totalH + 2 * padding,
    };
}

// ---- Place Functions ----
// Recursively assign x,y coordinates to every node.

function placeNode(node, style, x, y, parentDirection) {
    if (node.kind === 'hbox') {
        placeHBox(node, style, x, y);
        return;
    }
    if (node.kind === 'vbox') {
        placeVBox(node, style, x, y);
        return;
    }
    if (node.kind === 'spacer') return;

    // Handle arrow inside a container: auto-generate points from position
    if ((node.kind === 'arrow' || node.kind === 'curved_arrow') && node.length) {
        const len = node.length;
        const size = measureNode(node, style, parentDirection);
        if (parentDirection === 'vbox') {
            node.points = [[x + size.width / 2, y], [x + size.width / 2, y + len]];
        } else {
            // hbox or default: horizontal arrow
            // The y needs to be set by the parent based on alignment
            // We store _layoutX, _layoutY for the parent to adjust
            node.points = [[x, y], [x + len, y]];
        }
        delete node.length; // renderer uses points, not length
        return;
    }

    // Handle label offset for top labels: shift content down
    const lbTop = labelHeightTop(node, style);

    // Leaf node: assign coordinates
    if (node.kind === 'circle_op') {
        // circle_op uses center coordinates
        const r = node.r || 16;
        node.x = x + r;
        node.y = y + r + lbTop;
    } else if (node.kind === 'vertical_label') {
        const fs = node.font_size || 13;
        const text = node.text || node.label || '';
        const textH = text.length * fs * 0.6;
        node.x = x + fs / 2;
        node.y = y + textH / 2;
    } else {
        node.x = x;
        node.y = y + lbTop;
    }
}

function placeHBox(node, style, x, y) {
    const children = node.children || [];
    const gap = node.gap || 0;
    const padding = node.padding || 0;
    const align = node.align || 'top';

    // Measure all children to find max height
    const sizes = children.map(c => measureNode(c, style, 'hbox'));
    const maxH = Math.max(...sizes.map(s => s.height), 0);

    let cursorX = x + padding;

    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const size = sizes[i];

        let childY;
        switch (align) {
            case 'middle':
                childY = y + padding + (maxH - size.height) / 2;
                break;
            case 'bottom':
                childY = y + padding + maxH - size.height;
                break;
            default: // top
                childY = y + padding;
        }

        placeNode(child, style, cursorX, childY, 'hbox');

        // Fix arrow y-position for hbox (center vertically in available space)
        if ((child.kind === 'arrow' || child.kind === 'curved_arrow') && child.points) {
            const arrowY = y + padding + maxH / 2;
            child.points = child.points.map(pt => [pt[0], arrowY]);
        }

        cursorX += size.width + gap;
    }
}

function placeVBox(node, style, x, y) {
    const children = node.children || [];
    const gap = node.gap || 0;
    const padding = node.padding || 0;
    const align = node.align || 'left';

    // Measure all children to find max width
    const sizes = children.map(c => measureNode(c, style, 'vbox'));
    const maxW = Math.max(...sizes.map(s => s.width), 0);

    let cursorY = y + padding;

    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const size = sizes[i];

        let childX;
        switch (align) {
            case 'center':
                childX = x + padding + (maxW - size.width) / 2;
                break;
            case 'right':
                childX = x + padding + maxW - size.width;
                break;
            default: // left
                childX = x + padding;
        }

        placeNode(child, style, childX, cursorY, 'vbox');

        // Fix arrow x-position for vbox (center horizontally in available space)
        if ((child.kind === 'arrow' || child.kind === 'curved_arrow') && child.points) {
            const arrowX = x + padding + maxW / 2;
            child.points = child.points.map(pt => [arrowX, pt[1]]);
        }

        cursorY += size.height + gap;
    }
}

// ---- Flatten ----
// Convert nested hbox/vbox tree into flat array of renderable nodes.

function flattenNode(node) {
    if (node.kind === 'hbox' || node.kind === 'vbox') {
        const children = node.children || [];
        return children.flatMap(child => flattenNode(child));
    }
    if (node.kind === 'spacer') return [];
    return [node];
}

// ---- Entry Point ----

export function applyBoxLayout(sceneGraph, styleName) {
    const style = STYLES[styleName || 'icml'];
    const sg = JSON.parse(JSON.stringify(sceneGraph)); // deep clone

    const newNodes = [];
    const margin = 50;
    let cursorY = sg.title ? 50 : 20; // reserve space for title

    for (const node of (sg.nodes || [])) {
        if (node.kind === 'hbox' || node.kind === 'vbox') {
            const startX = node.x != null ? node.x : margin;
            const startY = node.y != null ? node.y : cursorY;
            const size = measureNode(node, style);
            placeNode(node, style, startX, startY);
            newNodes.push(...flattenNode(node));
            cursorY = startY + size.height + 20;
        } else {
            // Absolute-positioned node — pass through unchanged
            newNodes.push(node);
        }
    }

    sg.nodes = newNodes;

    // Process panels too
    if (sg.panels) {
        for (const panel of sg.panels) {
            const panelNodes = [];
            const panelMargin = 15;
            let panelCursorY = panelMargin;

            for (const node of (panel.nodes || [])) {
                if (node.kind === 'hbox' || node.kind === 'vbox') {
                    const startX = node.x != null ? node.x : panelMargin;
                    const startY = node.y != null ? node.y : panelCursorY;
                    const size = measureNode(node, style);
                    placeNode(node, style, startX, startY);
                    panelNodes.push(...flattenNode(node));
                    panelCursorY = startY + size.height + 15;
                } else {
                    panelNodes.push(node);
                }
            }

            panel.nodes = panelNodes;
        }
    }

    // Auto-size canvas to fit content
    let maxX = 0, maxY = 0;
    for (const node of sg.nodes) {
        if (node.kind === 'arrow' || node.kind === 'curved_arrow') {
            for (const pt of (node.points || [])) {
                maxX = Math.max(maxX, pt[0]);
                maxY = Math.max(maxY, pt[1]);
            }
        } else {
            const size = measureNode(node, style);
            const nx = node.x || 0;
            const ny = node.y || 0;
            maxX = Math.max(maxX, nx + size.width);
            maxY = Math.max(maxY, ny + size.height);
        }
    }

    sg.width = Math.max(sg.width || 0, Math.ceil(maxX + margin));
    sg.height = Math.max(sg.height || 0, Math.ceil(maxY + margin));

    return sg;
}
