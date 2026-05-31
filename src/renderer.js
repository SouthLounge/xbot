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

// ---- Plot Utilities ----

const PLOT_MARGIN = { top: 10, right: 15, bottom: 30, left: 45 };
const SERIES_COLORS = ['#1a1a1a', '#2962ff', '#d32f2f', '#388e3c', '#f57c00', '#7b1fa2', '#00838f'];

function niceNumber(val) {
    if (Number.isInteger(val)) return String(val);
    if (Math.abs(val) >= 100) return val.toFixed(0);
    if (Math.abs(val) >= 10) return val.toFixed(1);
    return val.toFixed(2);
}

function renderMarker(type, cx, cy, r, color) {
    switch (type) {
        case 'circle':
            return svgEl('circle', { cx, cy, r, fill: color, stroke: 'none' });
        case 'square':
            return svgEl('rect', { x: cx - r, y: cy - r, width: r * 2, height: r * 2, fill: color, stroke: 'none' });
        case 'triangle':
            return svgEl('polygon', {
                points: `${cx},${cy - r} ${cx - r},${cy + r} ${cx + r},${cy + r}`,
                fill: color, stroke: 'none',
            });
        case 'diamond':
            return svgEl('polygon', {
                points: `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`,
                fill: color, stroke: 'none',
            });
        default:
            return '';
    }
}

// ---- Colormap Utilities ----

const VIRIDIS_STOPS = [
    [68, 1, 84], [72, 36, 117], [64, 67, 135], [52, 94, 141],
    [33, 145, 140], [53, 183, 121], [109, 205, 89], [180, 222, 44], [253, 231, 37],
];
const COOLWARM_STOPS = [
    [59, 76, 192], [98, 130, 234], [184, 199, 232], [235, 235, 235],
    [230, 185, 173], [214, 96, 77], [180, 4, 38],
];

function interpolateColormap(stops, t) {
    t = Math.max(0, Math.min(1, t));
    const n = stops.length - 1;
    const idx = t * n;
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, n);
    const frac = idx - lo;
    const r = Math.round(stops[lo][0] + (stops[hi][0] - stops[lo][0]) * frac);
    const g = Math.round(stops[lo][1] + (stops[hi][1] - stops[lo][1]) * frac);
    const b = Math.round(stops[lo][2] + (stops[hi][2] - stops[lo][2]) * frac);
    return `rgb(${r},${g},${b})`;
}

function colormapColor(value, min, max, colormap) {
    const t = max === min ? 0.5 : (value - min) / (max - min);
    const stops = colormap === 'coolwarm' ? COOLWARM_STOPS : VIRIDIS_STOPS;
    return interpolateColormap(stops, t);
}

function contrastTextColor(value, min, max, colormap) {
    const t = max === min ? 0.5 : (value - min) / (max - min);
    if (colormap === 'coolwarm') return t > 0.3 && t < 0.7 ? '#222' : '#fff';
    return t > 0.55 ? '#111' : '#fff';
}

function matrixMinMax(values) {
    let min = Infinity, max = -Infinity;
    for (const row of values) {
        for (const v of (Array.isArray(row) ? row : [row])) {
            if (v < min) min = v;
            if (v > max) max = v;
        }
    }
    return { min, max };
}

// ---- Matrix Grid Renderer ----

function renderMatrixGrid(node, style) {
    const x = node.x || 0;
    const y = node.y || 0;
    const values = node.values || [[]];
    const rows = values.length;
    const cols = (values[0] || []).length;
    const cw = node.cell_width || 45;
    const ch = node.cell_height || 30;
    const colormap = node.colormap || 'viridis';
    const showValues = node.show_values !== false;
    const precision = node.value_precision != null ? node.value_precision : 2;
    const fontSize = node.font_size || 10;
    const cmin = node.color_min != null ? node.color_min : matrixMinMax(values).min;
    const cmax = node.color_max != null ? node.color_max : matrixMinMax(values).max;

    const parts = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const v = values[r][c];
            const cx = x + c * cw;
            const cy = y + r * ch;
            const fill = colormapColor(v, cmin, cmax, colormap);
            const textFill = contrastTextColor(v, cmin, cmax, colormap);
            parts.push(svgEl('rect', { x: cx, y: cy, width: cw, height: ch, fill, stroke: 'rgba(0,0,0,0.15)', 'stroke-width': 0.5 }));
            if (showValues) {
                parts.push(textEl('text', {
                    x: cx + cw / 2, y: cy + ch / 2 + fontSize * 0.35,
                    'text-anchor': 'middle', 'font-family': style.monoFont,
                    'font-size': fontSize, fill: textFill,
                }, v.toFixed(precision)));
            }
        }
    }
    // Label below
    if (node.label) {
        parts.push(textEl('text', {
            x: x + (cols * cw) / 2, y: y + rows * ch + 16,
            'text-anchor': 'middle', 'font-family': style.fontFamily,
            'font-size': 12, fill: style.labelColor, 'font-weight': 'bold',
        }, node.label));
    }
    return svgEl('g', {}, ...parts);
}

// ---- Vector Block Renderer ----

function renderVectorBlock(node, style) {
    const x = node.x || 0;
    const y = node.y || 0;
    const values = node.values || [];
    const dir = node.direction || 'vertical';
    const cw = node.cell_width || 50;
    const ch = node.cell_height || 30;
    const colormap = node.colormap || 'viridis';
    const showValues = node.show_values !== false;
    const precision = node.value_precision != null ? node.value_precision : 2;
    const fontSize = node.font_size || 10;
    const cmin = node.color_min != null ? node.color_min : matrixMinMax([values]).min;
    const cmax = node.color_max != null ? node.color_max : matrixMinMax([values]).max;
    const labelPos = node.label_position || 'bottom';

    const parts = [];

    // Label on top if requested
    if (node.label && labelPos === 'top') {
        parts.push(textEl('text', {
            x: dir === 'horizontal' ? x + (values.length * cw) / 2 : x + cw / 2,
            y: y - 6,
            'text-anchor': 'middle', 'font-family': style.fontFamily,
            'font-size': 11, fill: style.labelColor, 'font-style': 'italic',
        }, node.label));
    }

    for (let i = 0; i < values.length; i++) {
        const v = values[i];
        const cx = dir === 'horizontal' ? x + i * cw : x;
        const cy = dir === 'horizontal' ? y : y + i * ch;
        const fill = colormapColor(v, cmin, cmax, colormap);
        const textFill = contrastTextColor(v, cmin, cmax, colormap);
        parts.push(svgEl('rect', { x: cx, y: cy, width: cw, height: ch, fill, stroke: 'rgba(0,0,0,0.15)', 'stroke-width': 0.5 }));
        if (showValues) {
            parts.push(textEl('text', {
                x: cx + cw / 2, y: cy + ch / 2 + fontSize * 0.35,
                'text-anchor': 'middle', 'font-family': style.monoFont,
                'font-size': fontSize, fill: textFill,
            }, v.toFixed(precision)));
        }
    }

    // Label on bottom (default)
    if (node.label && labelPos !== 'top') {
        const lx = dir === 'horizontal' ? x + (values.length * cw) / 2 : x + cw / 2;
        const ly = dir === 'horizontal' ? y + ch + 14 : y + values.length * ch + 14;
        parts.push(textEl('text', {
            x: lx, y: ly,
            'text-anchor': 'middle', 'font-family': style.fontFamily,
            'font-size': 11, fill: style.labelColor, 'font-style': 'italic',
        }, node.label));
    }
    return svgEl('g', {}, ...parts);
}

// ---- Line Plot Renderer ----

function renderLinePlot(node, style) {
    const x = node.x || 0;
    const y = node.y || 0;
    const w = node.width || 250;
    const h = node.height || 150;
    const series = node.series || [];

    const ml = PLOT_MARGIN.left;
    const mr = PLOT_MARGIN.right;
    const mt = PLOT_MARGIN.top;
    const mb = PLOT_MARGIN.bottom;
    const pw = w - ml - mr;
    const ph = h - mt - mb;

    // Compute data ranges
    let xMin, xMax, yMin, yMax;
    if (node.x_range) {
        [xMin, xMax] = node.x_range;
    } else {
        xMin = Infinity; xMax = -Infinity;
        for (const s of series) {
            for (const [dx] of (s.data || [])) {
                xMin = Math.min(xMin, dx);
                xMax = Math.max(xMax, dx);
            }
        }
        if (!isFinite(xMin)) { xMin = 0; xMax = 1; }
    }
    if (node.y_range) {
        [yMin, yMax] = node.y_range;
    } else {
        yMin = Infinity; yMax = -Infinity;
        for (const s of series) {
            for (const [, dy] of (s.data || [])) {
                yMin = Math.min(yMin, dy);
                yMax = Math.max(yMax, dy);
            }
        }
        if (!isFinite(yMin)) { yMin = 0; yMax = 1; }
    }

    const mapX = (v) => x + ml + ((v - xMin) / (xMax - xMin || 1)) * pw;
    const mapY = (v) => y + mt + ph - ((v - yMin) / (yMax - yMin || 1)) * ph;

    const parts = [];

    // Plot area border
    parts.push(svgEl('rect', {
        x: x + ml, y: y + mt, width: pw, height: ph,
        fill: 'none', stroke: style.nodeStroke, 'stroke-width': 0.5,
    }));

    // Grid lines and tick labels
    const xTicks = node.x_ticks || 5;
    const yTicks = node.y_ticks || 5;

    for (let i = 0; i <= yTicks; i++) {
        const val = yMin + (yMax - yMin) * i / yTicks;
        const py = mapY(val);
        if (node.grid !== false) {
            parts.push(svgEl('line', {
                x1: x + ml, y1: py, x2: x + ml + pw, y2: py,
                stroke: '#ddd', 'stroke-width': 0.5, 'stroke-dasharray': '3,3',
            }));
        }
        parts.push(textEl('text', {
            x: x + ml - 5, y: py + 3,
            'text-anchor': 'end', 'font-family': style.monoFont,
            'font-size': 8, fill: style.labelColor,
        }, niceNumber(val)));
    }

    for (let i = 0; i <= xTicks; i++) {
        const val = xMin + (xMax - xMin) * i / xTicks;
        const px = mapX(val);
        if (node.grid !== false && i > 0 && i < xTicks) {
            parts.push(svgEl('line', {
                x1: px, y1: y + mt, x2: px, y2: y + mt + ph,
                stroke: '#ddd', 'stroke-width': 0.5, 'stroke-dasharray': '3,3',
            }));
        }
        parts.push(textEl('text', {
            x: px, y: y + mt + ph + 12,
            'text-anchor': 'middle', 'font-family': style.monoFont,
            'font-size': 8, fill: style.labelColor,
        }, niceNumber(val)));
    }

    // Axis labels
    if (node.x_label) {
        parts.push(textEl('text', {
            x: x + ml + pw / 2, y: y + h - 2,
            'text-anchor': 'middle', 'font-family': style.fontFamily,
            'font-size': 9, fill: style.textColor,
        }, node.x_label));
    }
    if (node.y_label) {
        parts.push(textEl('text', {
            x: 0, y: 0,
            transform: `translate(${x + 10},${y + mt + ph / 2}) rotate(-90)`,
            'text-anchor': 'middle', 'font-family': style.fontFamily,
            'font-size': 9, fill: style.textColor,
        }, node.y_label));
    }

    // Data series
    for (let si = 0; si < series.length; si++) {
        const s = series[si];
        const data = s.data || [];
        const color = s.color || SERIES_COLORS[si % SERIES_COLORS.length];
        const sw = s.stroke_width || 1.5;

        if (data.length > 1) {
            const pathPoints = data.map(([dx, dy]) => `${mapX(dx)},${mapY(dy)}`).join(' ');
            parts.push(svgEl('polyline', {
                points: pathPoints,
                fill: 'none', stroke: color, 'stroke-width': sw,
                'stroke-linecap': 'round', 'stroke-linejoin': 'round',
                'stroke-dasharray': s.dashed ? '5,3' : null,
            }));
        }

        const marker = s.marker || 'none';
        if (marker !== 'none') {
            for (const [dx, dy] of data) {
                parts.push(renderMarker(marker, mapX(dx), mapY(dy), 3, color));
            }
        }
    }

    // Legend
    if (node.legend !== false && series.some(s => s.label)) {
        const legendX = x + ml + pw - 5;
        let legendY = y + mt + 12;
        for (let si = 0; si < series.length; si++) {
            const s = series[si];
            if (!s.label) continue;
            const color = s.color || SERIES_COLORS[si % SERIES_COLORS.length];
            parts.push(svgEl('line', {
                x1: legendX - 25, y1: legendY, x2: legendX - 5, y2: legendY,
                stroke: color, 'stroke-width': 1.5,
                'stroke-dasharray': s.dashed ? '4,2' : null,
            }));
            if (s.marker && s.marker !== 'none') {
                parts.push(renderMarker(s.marker, legendX - 15, legendY, 2.5, color));
            }
            parts.push(textEl('text', {
                x: legendX - 28, y: legendY + 3,
                'text-anchor': 'end', 'font-family': style.fontFamily,
                'font-size': 7, fill: style.textColor,
            }, s.label));
            legendY += 12;
        }
    }

    // Label below
    if (node.label) {
        parts.push(textEl('text', {
            x: x + w / 2, y: y + h + 14,
            'text-anchor': 'middle', 'font-family': style.fontFamily,
            'font-size': style.smallFontSize, fill: style.labelColor, 'font-weight': 'bold',
        }, node.label));
    }

    return svgEl('g', { class: 'node-line-plot' }, ...parts);
}

// ---- Bar Chart Renderer ----

function renderBarChart(node, style) {
    const x = node.x || 0;
    const y = node.y || 0;
    const w = node.width || 200;
    const h = node.height || 150;
    const categories = node.categories || [];
    const series = node.series || [];

    const ml = PLOT_MARGIN.left;
    const mr = PLOT_MARGIN.right;
    const mt = PLOT_MARGIN.top;
    const mb = PLOT_MARGIN.bottom;
    const pw = w - ml - mr;
    const ph = h - mt - mb;

    // Y range
    let yMin = 0, yMax;
    if (node.y_range) {
        [yMin, yMax] = node.y_range;
    } else {
        yMax = 0;
        for (const s of series) {
            for (const v of (s.values || [])) {
                yMax = Math.max(yMax, v);
            }
        }
        yMax = yMax * 1.1 || 1;
    }

    const mapY = (v) => y + mt + ph - ((v - yMin) / (yMax - yMin || 1)) * ph;

    const parts = [];

    // Grid lines and y-tick labels
    const yTicks = node.y_ticks || 5;
    for (let i = 0; i <= yTicks; i++) {
        const val = yMin + (yMax - yMin) * i / yTicks;
        const py = mapY(val);
        if (node.grid !== false) {
            parts.push(svgEl('line', {
                x1: x + ml, y1: py, x2: x + ml + pw, y2: py,
                stroke: '#ddd', 'stroke-width': 0.5, 'stroke-dasharray': '3,3',
            }));
        }
        parts.push(textEl('text', {
            x: x + ml - 5, y: py + 3,
            'text-anchor': 'end', 'font-family': style.monoFont,
            'font-size': 8, fill: style.labelColor,
        }, niceNumber(val)));
    }

    // Axes
    parts.push(svgEl('line', {
        x1: x + ml, y1: y + mt, x2: x + ml, y2: y + mt + ph,
        stroke: style.nodeStroke, 'stroke-width': 0.5,
    }));
    parts.push(svgEl('line', {
        x1: x + ml, y1: y + mt + ph, x2: x + ml + pw, y2: y + mt + ph,
        stroke: style.nodeStroke, 'stroke-width': 0.5,
    }));

    // Bars
    const nCats = categories.length || 1;
    const nSeries = series.length || 1;
    const catWidth = pw / nCats;
    const groupPad = catWidth * 0.15;
    const groupWidth = catWidth - 2 * groupPad;
    const barWidth = nSeries > 1 ? groupWidth / nSeries : groupWidth * 0.6;

    for (let ci = 0; ci < nCats; ci++) {
        const catCx = x + ml + ci * catWidth + catWidth / 2;
        parts.push(textEl('text', {
            x: catCx, y: y + mt + ph + 12,
            'text-anchor': 'middle', 'font-family': style.fontFamily,
            'font-size': 8, fill: style.labelColor,
        }, categories[ci] || ''));

        for (let si = 0; si < series.length; si++) {
            const s = series[si];
            const val = (s.values || [])[ci] || 0;
            const color = s.color || SERIES_COLORS[si % SERIES_COLORS.length];

            const barX = x + ml + ci * catWidth + groupPad +
                (nSeries > 1 ? si * (groupWidth / nSeries) : (groupWidth - barWidth) / 2);
            const barTop = mapY(val);
            const barBot = mapY(yMin);
            const barH = barBot - barTop;

            parts.push(svgEl('rect', {
                x: barX, y: barTop, width: barWidth, height: Math.max(0, barH),
                fill: color, stroke: style.nodeStroke, 'stroke-width': 0.5, rx: 1,
            }));

            if (node.show_values) {
                parts.push(textEl('text', {
                    x: barX + barWidth / 2, y: barTop - 3,
                    'text-anchor': 'middle', 'font-family': style.monoFont,
                    'font-size': 7, fill: style.textColor,
                }, niceNumber(val)));
            }
        }
    }

    // Y-axis label
    if (node.y_label) {
        parts.push(textEl('text', {
            x: 0, y: 0,
            transform: `translate(${x + 10},${y + mt + ph / 2}) rotate(-90)`,
            'text-anchor': 'middle', 'font-family': style.fontFamily,
            'font-size': 9, fill: style.textColor,
        }, node.y_label));
    }

    // Label below
    if (node.label) {
        parts.push(textEl('text', {
            x: x + w / 2, y: y + h + 14,
            'text-anchor': 'middle', 'font-family': style.fontFamily,
            'font-size': style.smallFontSize, fill: style.labelColor, 'font-weight': 'bold',
        }, node.label));
    }

    // Legend (for multiple series)
    if (node.legend !== false && nSeries > 1 && series.some(s => s.label)) {
        const legendX = x + ml + pw - 5;
        let legendY = y + mt + 12;
        for (let si = 0; si < series.length; si++) {
            const s = series[si];
            if (!s.label) continue;
            const color = s.color || SERIES_COLORS[si % SERIES_COLORS.length];
            parts.push(svgEl('rect', {
                x: legendX - 20, y: legendY - 4, width: 12, height: 8,
                fill: color, stroke: 'none',
            }));
            parts.push(textEl('text', {
                x: legendX - 23, y: legendY + 3,
                'text-anchor': 'end', 'font-family': style.fontFamily,
                'font-size': 7, fill: style.textColor,
            }, s.label));
            legendY += 12;
        }
    }

    return svgEl('g', { class: 'node-bar-chart' }, ...parts);
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
    matrix_grid: renderMatrixGrid,
    vector_block: renderVectorBlock,
    line_plot: renderLinePlot,
    bar_chart: renderBarChart,
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
