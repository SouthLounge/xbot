// ============================================================
// FigGen Server-Side SVG Renderer
// Converts JSON scene graphs to SVG strings (no DOM, no browser).
// All render functions return SVG string fragments.
// ============================================================

// ---- Style Profiles ----

const STYLES = {
    icml: {
        fontFamily: 'Georgia, "Times New Roman", serif',
        monoFont: '"Courier New", monospace',
        bg: '#ffffff',
        nodeFill: '#ffffff',
        nodeStroke: '#000000',
        nodeStrokeWidth: 1.5,
        textColor: '#000000',
        labelColor: '#555555',
        arrowColor: '#000000',
        accentColor: '#000000',
        containerStroke: '#999999',
        containerDash: '6,4',
        opFill: '#ffffff',
        opStroke: '#000000',
        fontSize: 13,
        smallFontSize: 10,
        labelFontSize: 9,
    },
    neurips: {
        fontFamily: 'Georgia, "Times New Roman", serif',
        monoFont: '"Courier New", monospace',
        bg: '#fafafa',
        nodeFill: '#f5f5f5',
        nodeStroke: '#aaaaaa',
        nodeStrokeWidth: 1,
        textColor: '#333333',
        labelColor: '#777777',
        arrowColor: '#666666',
        accentColor: '#555555',
        containerStroke: '#cccccc',
        containerDash: '5,3',
        opFill: '#f0f0f0',
        opStroke: '#999999',
        fontSize: 13,
        smallFontSize: 10,
        labelFontSize: 9,
    },
    nature: {
        fontFamily: 'Helvetica, Arial, sans-serif',
        monoFont: '"SF Mono", "Courier New", monospace',
        bg: '#ffffff',
        nodeFill: '#e8f0fe',
        nodeStroke: '#2962ff',
        nodeStrokeWidth: 1.5,
        textColor: '#1a1a2e',
        labelColor: '#5c6bc0',
        arrowColor: '#2962ff',
        accentColor: '#2962ff',
        containerStroke: '#90a4ae',
        containerDash: '6,4',
        opFill: '#e3f2fd',
        opStroke: '#2962ff',
        fontSize: 13,
        smallFontSize: 10,
        labelFontSize: 9,
    },
    dark: {
        fontFamily: '"Space Mono", monospace',
        monoFont: '"Space Mono", monospace',
        bg: '#0a0a0a',
        nodeFill: '#151515',
        nodeStroke: '#333333',
        nodeStrokeWidth: 1,
        textColor: '#e0e0e0',
        labelColor: '#666666',
        arrowColor: '#555555',
        accentColor: '#888888',
        containerStroke: '#2a2a2a',
        containerDash: '5,3',
        opFill: '#111111',
        opStroke: '#444444',
        fontSize: 13,
        smallFontSize: 10,
        labelFontSize: 9,
    },
};

// ---- XML / SVG String Helpers ----

function escapeXml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function svgEl(tag, attrs = {}, ...children) {
    const attrStr = Object.entries(attrs)
        .filter(([_, v]) => v !== null && v !== undefined)
        .map(([k, v]) => `${k}="${escapeXml(String(v))}"`)
        .join(' ');
    const inner = children.join('');
    const selfClosing =
        ['rect', 'circle', 'line', 'polyline', 'polygon', 'path'].includes(tag) && !inner;
    if (selfClosing) {
        return `<${tag}${attrStr ? ' ' + attrStr : ''}/>`;
    }
    return `<${tag}${attrStr ? ' ' + attrStr : ''}>${inner}</${tag}>`;
}

function textEl(tag, attrs, textContent) {
    const attrStr = Object.entries(attrs)
        .filter(([_, v]) => v !== null && v !== undefined)
        .map(([k, v]) => `${k}="${escapeXml(String(v))}"`)
        .join(' ');
    return `<${tag}${attrStr ? ' ' + attrStr : ''}>${escapeXml(textContent)}</${tag}>`;
}

// ---- Unique ID generator (for arrow markers) ----

let _idCounter = 0;
function uid(prefix) {
    return `${prefix}-${++_idCounter}`;
}

// ---- Render Functions ----
// Each returns an SVG string fragment (a <g> group or element).

function renderRect(node, style) {
    const x = node.x || 0;
    const y = node.y || 0;
    const w = node.width || 120;
    const h = node.height || 50;
    const fill = node.fill || style.nodeFill;
    const stroke = node.stroke || style.nodeStroke;
    const rx = node.rx || 4;

    const parts = [];

    // Main rectangle
    parts.push(
        svgEl('rect', {
            x,
            y,
            width: w,
            height: h,
            rx,
            ry: rx,
            fill,
            stroke,
            'stroke-width': node.stroke_width || style.nodeStrokeWidth,
        })
    );

    // Type label (small text at top)
    if (node.type_label) {
        parts.push(
            textEl('text', {
                x: x + w / 2,
                y: y + 14,
                'text-anchor': 'middle',
                'font-family': style.fontFamily,
                'font-size': style.labelFontSize,
                fill: style.labelColor,
                'font-style': 'italic',
            }, node.type_label)
        );
    }

    // Main label
    if (node.label) {
        const labelY = node.type_label ? y + h / 2 + 4 : y + h / 2 + 5;
        parts.push(
            textEl('text', {
                x: x + w / 2,
                y: labelY,
                'text-anchor': 'middle',
                'font-family': style.fontFamily,
                'font-size': node.font_size || style.fontSize,
                fill: node.text_color || style.textColor,
                'font-weight': node.bold ? 'bold' : 'normal',
            }, node.label)
        );
    }

    // Sublabel
    if (node.sublabel) {
        parts.push(
            textEl('text', {
                x: x + w / 2,
                y: y + h - 10,
                'text-anchor': 'middle',
                'font-family': style.fontFamily,
                'font-size': style.smallFontSize,
                fill: style.labelColor,
            }, node.sublabel)
        );
    }

    return svgEl('g', { class: 'node-rect' }, ...parts);
}

function renderTrapezoid(node, style) {
    const x = node.x || 0;
    const y = node.y || 0;
    const w = node.width || 120;
    const h = node.height || 50;
    const fill = node.fill || style.nodeFill;
    const stroke = node.stroke || style.nodeStroke;
    const indent = node.indent || 15;
    const direction = node.direction || 'down'; // 'down' = wider bottom, 'up' = wider top

    let points;
    if (direction === 'down') {
        // Wider at the bottom
        points = `${x + indent},${y} ${x + w - indent},${y} ${x + w},${y + h} ${x},${y + h}`;
    } else {
        // Wider at the top
        points = `${x},${y} ${x + w},${y} ${x + w - indent},${y + h} ${x + indent},${y + h}`;
    }

    const parts = [];

    parts.push(
        svgEl('polygon', {
            points,
            fill,
            stroke,
            'stroke-width': node.stroke_width || style.nodeStrokeWidth,
        })
    );

    if (node.label) {
        parts.push(
            textEl('text', {
                x: x + w / 2,
                y: y + h / 2 + 5,
                'text-anchor': 'middle',
                'font-family': style.fontFamily,
                'font-size': node.font_size || style.fontSize,
                fill: node.text_color || style.textColor,
                'font-weight': node.bold ? 'bold' : 'normal',
            }, node.label)
        );
    }

    return svgEl('g', { class: 'node-trapezoid' }, ...parts);
}

function renderStackedBlock(node, style) {
    const x = node.x || 0;
    const y = node.y || 0;
    const w = node.width || 120;
    const layers = node.layers || [{}];
    const layerH = node.layer_height || 36;
    const gap = node.gap || 2;
    const rx = node.rx || 4;

    const parts = [];
    const totalH = layers.length * layerH + (layers.length - 1) * gap;

    // Optional border rectangle encompassing all layers
    if (node.border !== false) {
        parts.push(
            svgEl('rect', {
                x: x - 2,
                y: y - 2,
                width: w + 4,
                height: totalH + 4,
                rx: rx + 2,
                ry: rx + 2,
                fill: 'none',
                stroke: node.stroke || style.nodeStroke,
                'stroke-width': node.stroke_width || style.nodeStrokeWidth,
                opacity: 0.3,
            })
        );
    }

    // Render each layer
    layers.forEach((layer, i) => {
        const ly = y + i * (layerH + gap);
        const layerFill = layer.fill || node.fill || style.nodeFill;

        parts.push(
            svgEl('rect', {
                x,
                y: ly,
                width: w,
                height: layerH,
                rx,
                ry: rx,
                fill: layerFill,
                stroke: layer.stroke || node.stroke || style.nodeStroke,
                'stroke-width': node.stroke_width || style.nodeStrokeWidth,
            })
        );

        if (layer.label) {
            parts.push(
                textEl('text', {
                    x: x + w / 2,
                    y: ly + layerH / 2 + 5,
                    'text-anchor': 'middle',
                    'font-family': style.fontFamily,
                    'font-size': layer.font_size || style.fontSize,
                    fill: layer.text_color || style.textColor,
                }, layer.label)
            );
        }
    });

    // Block label (below all layers)
    if (node.label) {
        parts.push(
            textEl('text', {
                x: x + w / 2,
                y: y + totalH + 16,
                'text-anchor': 'middle',
                'font-family': style.fontFamily,
                'font-size': style.smallFontSize,
                fill: style.labelColor,
            }, node.label)
        );
    }

    return svgEl('g', { class: 'node-stacked-block' }, ...parts);
}

function renderCircleOp(node, style) {
    const cx = node.x || 0;
    const cy = node.y || 0;
    const r = node.r || 16;
    const fill = node.fill || style.opFill;
    const stroke = node.stroke || style.opStroke;
    const symbol = node.symbol || '+';

    const parts = [];

    parts.push(
        svgEl('circle', {
            cx,
            cy,
            r,
            fill,
            stroke,
            'stroke-width': node.stroke_width || style.nodeStrokeWidth,
        })
    );

    // Symbol text inside circle
    parts.push(
        textEl('text', {
            x: cx,
            y: cy + 5,
            'text-anchor': 'middle',
            'font-family': style.monoFont,
            'font-size': node.font_size || style.fontSize + 2,
            fill: node.text_color || style.textColor,
            'font-weight': 'bold',
        }, symbol)
    );

    // Optional label below circle
    if (node.label) {
        parts.push(
            textEl('text', {
                x: cx,
                y: cy + r + 14,
                'text-anchor': 'middle',
                'font-family': style.fontFamily,
                'font-size': style.smallFontSize,
                fill: style.labelColor,
            }, node.label)
        );
    }

    return svgEl('g', { class: 'node-circle-op' }, ...parts);
}

function renderArrow(node, style) {
    const points = node.points || [];
    if (points.length < 2) return '';

    const color = node.color || style.arrowColor;
    const strokeWidth = node.stroke_width || 1.5;
    const markerId = uid('arrowhead');

    const parts = [];

    // Define arrowhead marker
    const markerPath = svgEl('path', {
        d: 'M0,0 L0,6 L7,3 z',
        fill: color,
    });
    const marker = svgEl('marker', {
        id: markerId,
        markerWidth: 7,
        markerHeight: 6,
        refX: 7,
        refY: 3,
        orient: 'auto',
        markerUnits: 'strokeWidth',
    }, markerPath);
    const defs = svgEl('defs', {}, marker);
    parts.push(defs);

    // Polyline
    const pointsStr = points.map(p => `${p[0]},${p[1]}`).join(' ');
    parts.push(
        svgEl('polyline', {
            points: pointsStr,
            fill: 'none',
            stroke: color,
            'stroke-width': strokeWidth,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            'marker-end': `url(#${markerId})`,
            'stroke-dasharray': node.dashed ? (node.dash_pattern || '5,3') : null,
        })
    );

    // Optional label at midpoint
    if (node.label) {
        const midIdx = Math.floor(points.length / 2);
        const midPt =
            points.length % 2 === 0
                ? [
                      (points[midIdx - 1][0] + points[midIdx][0]) / 2,
                      (points[midIdx - 1][1] + points[midIdx][1]) / 2,
                  ]
                : points[midIdx];

        parts.push(
            textEl('text', {
                x: midPt[0],
                y: midPt[1] - 8,
                'text-anchor': 'middle',
                'font-family': style.fontFamily,
                'font-size': style.smallFontSize,
                fill: style.labelColor,
            }, node.label)
        );
    }

    return svgEl('g', { class: 'node-arrow' }, ...parts);
}

function renderContainer(node, style) {
    const x = node.x || 0;
    const y = node.y || 0;
    const w = node.width || 200;
    const h = node.height || 150;
    const rx = node.rx || 6;
    const stroke = node.stroke || style.containerStroke;

    const parts = [];

    parts.push(
        svgEl('rect', {
            x,
            y,
            width: w,
            height: h,
            rx,
            ry: rx,
            fill: node.fill || 'none',
            stroke,
            'stroke-width': node.stroke_width || 1,
            'stroke-dasharray': node.dash_pattern || style.containerDash,
            opacity: node.opacity || 0.8,
        })
    );

    if (node.label) {
        parts.push(
            textEl('text', {
                x: x + 10,
                y: y + 16,
                'font-family': style.fontFamily,
                'font-size': style.labelFontSize,
                fill: style.labelColor,
                'font-weight': 'bold',
            }, node.label)
        );
    }

    return svgEl('g', { class: 'node-container' }, ...parts);
}

function renderTextLabel(node, style) {
    const x = node.x || 0;
    const y = node.y || 0;
    const anchor = node.anchor || 'middle';
    const fontFamily = node.mono ? style.monoFont : style.fontFamily;

    return textEl('text', {
        x,
        y,
        'text-anchor': anchor,
        'font-family': fontFamily,
        'font-size': node.font_size || style.fontSize,
        fill: node.color || node.text_color || style.textColor,
        'font-weight': node.bold ? 'bold' : 'normal',
        'font-style': node.italic ? 'italic' : 'normal',
    }, node.text || node.label || '');
}

function renderDots(node, style) {
    const x = node.x || 0;
    const y = node.y || 0;
    const direction = node.direction || 'horizontal';
    const spacing = node.spacing || 8;
    const r = node.r || 2.5;
    const fill = node.color || style.labelColor;

    const parts = [];

    for (let i = -1; i <= 1; i++) {
        const cx = direction === 'horizontal' ? x + i * spacing : x;
        const cy = direction === 'vertical' ? y + i * spacing : y;
        parts.push(
            svgEl('circle', { cx, cy, r, fill })
        );
    }

    return svgEl('g', { class: 'node-dots' }, ...parts);
}

function renderTensorBlock(node, style) {
    const x = node.x || 0;
    const y = node.y || 0;
    const w = node.width || 80;
    const h = node.height || 60;
    const depth = node.depth || 20;
    const fill = node.fill || style.nodeFill;
    const stroke = node.stroke || style.nodeStroke;
    const sw = node.stroke_width || style.nodeStrokeWidth;

    const parts = [];

    // Back face (slightly offset, semi-transparent)
    parts.push(
        svgEl('rect', {
            x: x + depth,
            y: y - depth,
            width: w,
            height: h,
            fill,
            stroke,
            'stroke-width': sw,
            opacity: 0.5,
        })
    );

    // Top face (parallelogram connecting top edges of front and back)
    const topPoints = `${x},${y} ${x + depth},${y - depth} ${x + w + depth},${y - depth} ${x + w},${y}`;
    parts.push(
        svgEl('polygon', {
            points: topPoints,
            fill,
            stroke,
            'stroke-width': sw,
            opacity: 0.7,
        })
    );

    // Right face (parallelogram connecting right edges of front and back)
    const rightPoints = `${x + w},${y} ${x + w + depth},${y - depth} ${x + w + depth},${y + h - depth} ${x + w},${y + h}`;
    parts.push(
        svgEl('polygon', {
            points: rightPoints,
            fill,
            stroke,
            'stroke-width': sw,
            opacity: 0.6,
        })
    );

    // Front face (main visible rectangle)
    parts.push(
        svgEl('rect', {
            x,
            y,
            width: w,
            height: h,
            fill,
            stroke,
            'stroke-width': sw,
        })
    );

    // Label on front face
    if (node.label) {
        parts.push(
            textEl('text', {
                x: x + w / 2,
                y: y + h / 2 + 5,
                'text-anchor': 'middle',
                'font-family': style.fontFamily,
                'font-size': node.font_size || style.fontSize,
                fill: node.text_color || style.textColor,
            }, node.label)
        );
    }

    // Dimension labels
    if (node.dim_top) {
        parts.push(
            textEl('text', {
                x: x + w / 2 + depth / 2,
                y: y - depth - 5,
                'text-anchor': 'middle',
                'font-family': style.monoFont,
                'font-size': style.labelFontSize,
                fill: style.labelColor,
            }, node.dim_top)
        );
    }

    if (node.dim_right) {
        parts.push(
            textEl('text', {
                x: x + w + depth + 8,
                y: y + h / 2 - depth / 2,
                'text-anchor': 'start',
                'font-family': style.monoFont,
                'font-size': style.labelFontSize,
                fill: style.labelColor,
            }, node.dim_right)
        );
    }

    if (node.dim_bottom) {
        parts.push(
            textEl('text', {
                x: x + w / 2,
                y: y + h + 15,
                'text-anchor': 'middle',
                'font-family': style.monoFont,
                'font-size': style.labelFontSize,
                fill: style.labelColor,
            }, node.dim_bottom)
        );
    }

    return svgEl('g', { class: 'node-tensor-block' }, ...parts);
}

function renderWaveform(node, style) {
    const x = node.x || 0;
    const y = node.y || 0;
    const w = node.width || 120;
    const h = node.height || 30;
    const amplitude = node.amplitude || 12;
    const frequency = node.frequency || 3;
    const stroke = node.stroke || style.accentColor;

    const parts = [];
    const steps = 100;
    let pathD = '';

    for (let i = 0; i <= steps; i++) {
        const px = x + (w * i) / steps;
        const py = y + h / 2 + amplitude * Math.sin((2 * Math.PI * frequency * i) / steps);
        pathD += i === 0 ? `M${px},${py}` : ` L${px},${py}`;
    }

    parts.push(
        svgEl('path', {
            d: pathD,
            fill: 'none',
            stroke,
            'stroke-width': node.stroke_width || 1.5,
            'stroke-linecap': 'round',
        })
    );

    if (node.label) {
        parts.push(
            textEl('text', {
                x: x + w / 2,
                y: y + h + amplitude + 14,
                'text-anchor': 'middle',
                'font-family': style.fontFamily,
                'font-size': style.smallFontSize,
                fill: style.labelColor,
            }, node.label)
        );
    }

    return svgEl('g', { class: 'node-waveform' }, ...parts);
}

function renderBracket(node, style) {
    const x = node.x || 0;
    const y = node.y || 0;
    const direction = node.direction || 'horizontal';
    const stroke = node.stroke || style.accentColor;
    const sw = node.stroke_width || 1.5;

    const parts = [];

    if (direction === 'horizontal') {
        const w = node.width || 200;
        const tickH = node.tick_height || 8;

        // Left tick
        parts.push(
            svgEl('line', {
                x1: x,
                y1: y - tickH,
                x2: x,
                y2: y,
                stroke,
                'stroke-width': sw,
            })
        );

        // Right tick
        parts.push(
            svgEl('line', {
                x1: x + w,
                y1: y - tickH,
                x2: x + w,
                y2: y,
                stroke,
                'stroke-width': sw,
            })
        );

        // Left half-line
        parts.push(
            svgEl('line', {
                x1: x,
                y1: y,
                x2: x + w / 2 - 4,
                y2: y,
                stroke,
                'stroke-width': sw,
            })
        );

        // Right half-line
        parts.push(
            svgEl('line', {
                x1: x + w / 2 + 4,
                y1: y,
                x2: x + w,
                y2: y,
                stroke,
                'stroke-width': sw,
            })
        );

        // Left arrowhead (pointing toward center)
        const arrowSize = 4;
        parts.push(
            svgEl('polyline', {
                points: `${x + w / 2 - 4 - arrowSize},${y - arrowSize} ${x + w / 2 - 4},${y} ${x + w / 2 - 4 - arrowSize},${y + arrowSize}`,
                fill: 'none',
                stroke,
                'stroke-width': sw,
            })
        );

        // Right arrowhead (pointing toward center)
        parts.push(
            svgEl('polyline', {
                points: `${x + w / 2 + 4 + arrowSize},${y - arrowSize} ${x + w / 2 + 4},${y} ${x + w / 2 + 4 + arrowSize},${y + arrowSize}`,
                fill: 'none',
                stroke,
                'stroke-width': sw,
            })
        );

        // Label below
        if (node.label) {
            parts.push(
                textEl('text', {
                    x: x + w / 2,
                    y: y + 16,
                    'text-anchor': 'middle',
                    'font-family': style.fontFamily,
                    'font-size': style.smallFontSize,
                    fill: style.labelColor,
                }, node.label)
            );
        }
    } else {
        // Vertical curly brace
        const h = node.height || 150;
        const midY = y + h / 2;
        const bulge = node.bulge || 10;

        // Bezier curly brace path
        const d = [
            `M${x},${y}`,
            `C${x - bulge},${y} ${x - bulge},${midY - 5} ${x - bulge},${midY}`,
            `C${x - bulge},${midY + 5} ${x - bulge},${y + h} ${x},${y + h}`,
        ].join(' ');

        parts.push(
            svgEl('path', {
                d,
                fill: 'none',
                stroke,
                'stroke-width': sw,
                'stroke-linecap': 'round',
            })
        );

        // Label to the left of the brace
        if (node.label) {
            parts.push(
                textEl('text', {
                    x: x - bulge - 8,
                    y: midY + 4,
                    'text-anchor': 'end',
                    'font-family': style.fontFamily,
                    'font-size': style.smallFontSize,
                    fill: style.labelColor,
                }, node.label)
            );
        }
    }

    return svgEl('g', { class: 'node-bracket' }, ...parts);
}

function renderCurvedArrow(node, style) {
    const points = node.points || [];
    if (points.length < 2) return '';

    const color = node.color || style.arrowColor;
    const strokeWidth = node.stroke_width || 1.5;
    const markerId = uid('curved-arrowhead');

    const parts = [];

    // Define arrowhead marker
    const markerPath = svgEl('path', {
        d: 'M0,0 L0,6 L7,3 z',
        fill: color,
    });
    const marker = svgEl('marker', {
        id: markerId,
        markerWidth: 7,
        markerHeight: 6,
        refX: 7,
        refY: 3,
        orient: 'auto',
        markerUnits: 'strokeWidth',
    }, markerPath);
    const defs = svgEl('defs', {}, marker);
    parts.push(defs);

    // Build bezier path
    let d;
    if (points.length === 2) {
        // Auto cubic bezier: compute control points
        const [p0, p1] = points;
        const dx = p1[0] - p0[0];
        const dy = p1[1] - p0[1];
        const cx1 = p0[0] + dx * 0.3;
        const cy1 = p0[1] - Math.abs(dy) * 0.3 - 20;
        const cx2 = p1[0] - dx * 0.3;
        const cy2 = p1[1] - Math.abs(dy) * 0.3 - 20;
        d = `M${p0[0]},${p0[1]} C${cx1},${cy1} ${cx2},${cy2} ${p1[0]},${p1[1]}`;
    } else if (points.length === 3) {
        // Quadratic bezier
        const [p0, p1, p2] = points;
        d = `M${p0[0]},${p0[1]} Q${p1[0]},${p1[1]} ${p2[0]},${p2[1]}`;
    } else if (points.length >= 4) {
        // Cubic bezier
        const [p0, p1, p2, p3] = points;
        d = `M${p0[0]},${p0[1]} C${p1[0]},${p1[1]} ${p2[0]},${p2[1]} ${p3[0]},${p3[1]}`;
    }

    parts.push(
        svgEl('path', {
            d,
            fill: 'none',
            stroke: color,
            'stroke-width': strokeWidth,
            'stroke-linecap': 'round',
            'marker-end': `url(#${markerId})`,
            'stroke-dasharray': node.dashed ? (node.dash_pattern || '5,3') : null,
        })
    );

    // Optional label near the midpoint of the first and last point
    if (node.label) {
        const first = points[0];
        const last = points[points.length - 1];
        const midX = (first[0] + last[0]) / 2;
        const midY = (first[1] + last[1]) / 2 - 12;

        parts.push(
            textEl('text', {
                x: midX,
                y: midY,
                'text-anchor': 'middle',
                'font-family': style.fontFamily,
                'font-size': style.smallFontSize,
                fill: style.labelColor,
            }, node.label)
        );
    }

    return svgEl('g', { class: 'node-curved-arrow' }, ...parts);
}

function renderSideAnnotation(node, style) {
    const x = node.x || 0;
    const y = node.y || 0;
    const targetX = node.target_x || x;
    const targetY = node.target_y || y;
    const text = node.text || '';
    const fontSize = node.font_size || 11;
    const color = node.color || style.labelColor;

    const parts = [];

    // Dashed leader line from text position to target
    parts.push(
        svgEl('line', {
            x1: x,
            y1: y,
            x2: targetX,
            y2: targetY,
            stroke: color,
            'stroke-width': 0.8,
            'stroke-dasharray': '3,3',
            opacity: 0.6,
        })
    );

    // Dot at target point
    parts.push(
        svgEl('circle', {
            cx: targetX,
            cy: targetY,
            r: 2.5,
            fill: color,
            opacity: 0.6,
        })
    );

    // Text at annotation position
    parts.push(
        textEl('text', {
            x,
            y: y - 4,
            'text-anchor': node.anchor || 'start',
            'font-family': style.fontFamily,
            'font-size': fontSize,
            fill: color,
            'font-style': 'italic',
        }, text)
    );

    return svgEl('g', { class: 'node-side-annotation' }, ...parts);
}

function renderVerticalLabel(node, style) {
    const x = node.x || 0;
    const y = node.y || 0;
    const text = node.text || node.label || '';

    return textEl('text', {
        x: 0,
        y: 0,
        transform: `translate(${x},${y}) rotate(-90)`,
        'text-anchor': node.anchor || 'middle',
        'font-family': node.mono ? style.monoFont : style.fontFamily,
        'font-size': node.font_size || style.fontSize,
        fill: node.color || node.text_color || style.textColor,
        'font-weight': node.bold ? 'bold' : 'normal',
        'font-style': node.italic ? 'italic' : 'normal',
    }, text);
}

function renderRepeatMarker(node, style) {
    const x = node.x || 0;
    const y = node.y || 0;
    const n = node.count || node.n || 2;

    return textEl('text', {
        x,
        y,
        'text-anchor': 'middle',
        'font-family': style.fontFamily,
        'font-size': node.font_size || style.fontSize,
        fill: node.color || style.accentColor,
        'font-weight': 'bold',
    }, `\u00d7${n}`);
}

// ---- Render Dispatch Table ----

const RENDERERS = {
    rect: renderRect,
    trapezoid: renderTrapezoid,
    stacked_block: renderStackedBlock,
    circle_op: renderCircleOp,
    arrow: renderArrow,
    container: renderContainer,
    text_label: renderTextLabel,
    dots: renderDots,
    tensor_block: renderTensorBlock,
    waveform: renderWaveform,
    bracket: renderBracket,
    curved_arrow: renderCurvedArrow,
    side_annotation: renderSideAnnotation,
    vertical_label: renderVerticalLabel,
    repeat_marker: renderRepeatMarker,
};

// ---- Composite Rendering ----

function renderNodesIntoGroup(nodes, style, renderers) {
    if (!nodes || nodes.length === 0) return '';

    // Separate node types for z-ordering: containers first, then content, then arrows
    const containers = nodes.filter(n => n.kind === 'container');
    const arrows = nodes.filter(n => n.kind === 'arrow' || n.kind === 'curved_arrow');
    const rest = nodes.filter(
        n => n.kind !== 'container' && n.kind !== 'arrow' && n.kind !== 'curved_arrow'
    );

    const parts = [];

    // Render in z-order
    for (const node of containers) {
        const fn = renderers[node.kind];
        if (fn) parts.push(fn(node, style));
    }
    for (const node of rest) {
        const fn = renderers[node.kind];
        if (fn) parts.push(fn(node, style));
    }
    for (const node of arrows) {
        const fn = renderers[node.kind];
        if (fn) parts.push(fn(node, style));
    }

    return parts.join('');
}

// ---- Word-wrap helper for caption ----

function wordWrapCaption(caption, maxCharsPerLine) {
    if (!caption) return [];
    const words = caption.split(/\s+/);
    const lines = [];
    let currentLine = '';

    for (const word of words) {
        if (currentLine.length + word.length + 1 > maxCharsPerLine && currentLine.length > 0) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = currentLine ? currentLine + ' ' + word : word;
        }
    }
    if (currentLine) lines.push(currentLine);

    return lines;
}

// ---- Main Entry Point ----

export function renderSceneGraph(sceneGraph, styleName) {
    // Reset ID counter for deterministic output per render
    _idCounter = 0;

    const style = STYLES[styleName] || STYLES.icml;
    const sg = sceneGraph;

    const width = sg.width || 800;
    const height = sg.height || 500;

    const parts = [];

    // SVG open tag
    parts.push(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    );

    // Background rectangle
    parts.push(
        svgEl('rect', {
            x: 0,
            y: 0,
            width,
            height,
            fill: style.bg,
        })
    );

    // Title
    if (sg.title) {
        parts.push(
            textEl('text', {
                x: width / 2,
                y: 30,
                'text-anchor': 'middle',
                'font-family': style.fontFamily,
                'font-size': style.fontSize + 3,
                fill: style.textColor,
                'font-weight': 'bold',
            }, sg.title)
        );
    }

    // Panels or flat layout
    if (sg.panels && sg.panels.length > 0) {
        for (const panel of sg.panels) {
            const ox = panel.x || 0;
            const oy = panel.y || 0;
            const pw = panel.width || width;
            const ph = panel.height || height;

            const panelParts = [];

            // Optional panel background
            if (panel.bg || panel.background) {
                panelParts.push(
                    svgEl('rect', {
                        x: 0,
                        y: 0,
                        width: pw,
                        height: ph,
                        fill: panel.bg || panel.background,
                        rx: 4,
                        ry: 4,
                    })
                );
            }

            // Panel label
            if (panel.label) {
                panelParts.push(
                    textEl('text', {
                        x: pw / 2,
                        y: 20,
                        'text-anchor': 'middle',
                        'font-family': style.fontFamily,
                        'font-size': style.fontSize,
                        fill: style.textColor,
                        'font-weight': 'bold',
                    }, panel.label)
                );
            }

            // Panel nodes
            panelParts.push(renderNodesIntoGroup(panel.nodes || [], style, RENDERERS));

            parts.push(
                svgEl('g', { transform: `translate(${ox},${oy})` }, ...panelParts)
            );
        }
    } else {
        // Flat layout: render all nodes directly
        parts.push(renderNodesIntoGroup(sg.nodes || [], style, RENDERERS));
    }

    // Caption (word-wrapped)
    if (sg.caption) {
        const charWidth = 5.7; // approximate for 11px font
        const maxCaptionWidth = width - 80;
        const maxCharsPerLine = Math.max(40, Math.floor(maxCaptionWidth / charWidth));
        const lines = wordWrapCaption(sg.caption, maxCharsPerLine);

        const captionY = height - 10 - (lines.length - 1) * 15;

        const tspans = lines.map((line, i) =>
            textEl('tspan', {
                x: width / 2,
                dy: i === 0 ? '0' : '15',
            }, line)
        ).join('');

        const captionAttrs = {
            x: width / 2,
            y: captionY,
            'text-anchor': 'middle',
            'font-family': style.fontFamily,
            'font-size': 11,
            fill: style.labelColor,
        };

        const attrStr = Object.entries(captionAttrs)
            .filter(([_, v]) => v !== null && v !== undefined)
            .map(([k, v]) => `${k}="${escapeXml(String(v))}"`)
            .join(' ');

        parts.push(`<text ${attrStr}>${tspans}</text>`);
    }

    // SVG close tag
    parts.push('</svg>');

    return parts.join('\n');
}

export { STYLES };
