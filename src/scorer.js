import { getNodeBBox } from './layout.js';

function getAllNodes(sg) {
    const nodes = [...(sg.nodes || [])];
    if (sg.panels) {
        for (const panel of sg.panels) {
            nodes.push(...(panel.nodes || []));
        }
    }
    return nodes;
}

export function scoreSceneGraph(sg) {
    const allNodes = getAllNodes(sg);
    const scores = {};

    // 1. Composition depth (max 25)
    const hasPanels = sg.panels && sg.panels.length > 0;
    scores.score_composition_depth = hasPanels ? 25 : 10;

    // 2. Primitive diversity (max 20)
    const kinds = new Set(allNodes.map(n => n.kind));
    const kindCount = kinds.size;
    scores.score_primitive_diversity = kindCount >= 4 ? 20 : (kindCount >= 2 ? 10 : 0);

    // 3. Node count sweet spot (max 15)
    const nodeCount = allNodes.length;
    if (nodeCount >= 10 && nodeCount <= 20) {
        scores.score_node_count = 15;
    } else if ((nodeCount >= 5 && nodeCount < 10) || (nodeCount > 20 && nodeCount <= 30)) {
        scores.score_node_count = 8;
    } else {
        scores.score_node_count = 0;
    }

    // 4. Canvas utilization (max 15)
    const canvasArea = (sg.width || 800) * (sg.height || 500);
    let coveredArea = 0;
    for (const node of allNodes) {
        const bbox = getNodeBBox(node);
        if (bbox) coveredArea += bbox.w * bbox.h;
    }
    const fillRatio = coveredArea / canvasArea;
    scores.score_canvas_utilization = (fillRatio >= 0.15 && fillRatio <= 0.8) ? 15 : 5;

    // 5. Label completeness (max 10)
    const labelable = allNodes.filter(n =>
        ['rect', 'trapezoid', 'stacked_block', 'circle_op', 'tensor_block', 'container'].includes(n.kind)
    );
    const labeled = labelable.filter(n => n.label || n.type_label || n.symbol);
    const labelRatio = labelable.length > 0 ? labeled.length / labelable.length : 0;
    scores.score_label_completeness = labelRatio > 0.9 ? 10 : 0;

    // 6. Structural richness (max 15)
    const hasContainers = allNodes.some(n => n.kind === 'container');
    const hasCurvedArrows = allNodes.some(n => n.kind === 'curved_arrow');
    const hasRepeatMarkers = allNodes.some(n => n.kind === 'repeat_marker');
    const hasTensorBlocks = allNodes.some(n => n.kind === 'tensor_block');
    const hasVerticalLabels = allNodes.some(n => n.kind === 'vertical_label');
    const richCount = [hasContainers, hasCurvedArrows, hasRepeatMarkers, hasTensorBlocks, hasVerticalLabels]
        .filter(Boolean).length;
    scores.score_structural_richness = Math.min(15, richCount * 5);

    scores.score_total =
        scores.score_composition_depth +
        scores.score_primitive_diversity +
        scores.score_node_count +
        scores.score_canvas_utilization +
        scores.score_label_completeness +
        scores.score_structural_richness;

    return scores;
}
