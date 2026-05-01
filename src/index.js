import { fetchDailyPapers } from './papers.js';
import { generateFigure } from './generate.js';
import { scoreSceneGraph } from './scorer.js';
import { renderSceneGraph } from './renderer.js';
import { svgToPng } from './png.js';
import { getExistingArxivIds, insertFigure, updateTweetPosted, uploadPng } from './db.js';
import { postTweet } from './twitter.js';
import { generateCommentary } from './commentary.js';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Post the top N papers by combined score (HF upvotes + figure quality)
const MAX_POSTS_PER_DAY = 3;
const VARIANTS_PER_PAPER = 2;

async function run(testLimit = null, skipPosting = false, dateOverride = null) {
    console.log(`[xbot] Fetching curated papers from HuggingFace Daily Papers...`);

    // Step 1: Fetch papers from HuggingFace Daily Papers
    const papers = await fetchDailyPapers(dateOverride);

    if (papers.length === 0) {
        console.log('[xbot] No papers found. Exiting.');
        return;
    }

    // Step 2: Deduplicate against Supabase
    const arxivIds = papers.map(p => p.arxivId);
    const existingIds = await getExistingArxivIds(arxivIds);
    let newPapers = papers.filter(p => !existingIds.has(p.arxivId));
    console.log(`[xbot] ${newPapers.length} new papers (${existingIds.size} already processed)`);

    if (newPapers.length === 0) {
        console.log('[xbot] All papers already processed. Exiting.');
        return;
    }

    // Apply test limit
    if (testLimit) {
        newPapers = newPapers.slice(0, testLimit);
        console.log(`[xbot] Test mode: processing ${newPapers.length} papers`);
    }

    // Step 3: Generate 2 variants per paper, score both, keep the best
    const results = [];
    let generated = 0;
    let failed = 0;

    for (const paper of newPapers) {
        try {
            console.log(`[xbot] Generating ${VARIANTS_PER_PAPER} variants for ${paper.arxivId}: ${paper.title.substring(0, 60)}...`);
            console.log(`[xbot]   HF upvotes: ${paper.upvotes}, conference: ${paper.hasConference}, top institution: ${paper.hasTopInstitution}`);

            let bestVariant = null;

            for (let v = 0; v < VARIANTS_PER_PAPER; v++) {
                const { sceneGraph, usage } = await generateFigure(paper);
                const scores = scoreSceneGraph(sceneGraph);

                // Render PNG for storage
                const svgString = renderSceneGraph(sceneGraph, 'dark');
                const pngBuffer = svgToPng(svgString, 1600);

                const variantId = `${paper.arxivId}_v${v}`;

                // Store EVERY variant to Supabase
                const figure = {
                    arxiv_id: variantId,
                    paper_title: paper.title,
                    authors: paper.authors,
                    categories: paper.categories,
                    arxiv_submitted: paper.submitted,
                    abstract: paper.abstract,
                    scene_graph: sceneGraph,
                    generation_model: 'claude-sonnet-4-5-20250929',
                    input_tokens: usage.inputTokens,
                    output_tokens: usage.outputTokens,
                    generation_latency_ms: usage.latencyMs,
                    score_total: scores.score_total,
                    score_composition_depth: scores.score_composition_depth,
                    score_primitive_diversity: scores.score_primitive_diversity,
                    score_node_count: scores.score_node_count,
                    score_canvas_utilization: scores.score_canvas_utilization,
                    score_label_completeness: scores.score_label_completeness,
                    score_structural_richness: scores.score_structural_richness,
                };

                await insertFigure(figure);

                // Upload PNG to storage
                try {
                    const pngUrl = await uploadPng(variantId, pngBuffer);
                    console.log(`[xbot]   v${v}: score ${scores.score_total}/100, PNG: ${pngUrl.substring(0, 60)}...`);
                } catch (err) {
                    console.log(`[xbot]   v${v}: score ${scores.score_total}/100 (PNG upload failed: ${err.message})`);
                }

                // Track the best variant
                if (!bestVariant || scores.score_total > bestVariant.scores.score_total) {
                    bestVariant = { paper, sceneGraph, scores, pngBuffer, variantId };
                }

                generated++;
                await sleep(3000); // rate limit between API calls
            }

            if (bestVariant) {
                results.push(bestVariant);
                console.log(`[xbot]   Best: ${bestVariant.variantId} (score: ${bestVariant.scores.score_total})`);
            }
        } catch (err) {
            console.error(`[xbot] Failed for ${paper.arxivId}: ${err.message}`);
            failed++;
            await sleep(1000);
        }
    }

    console.log(`[xbot] Generated: ${generated} variants for ${results.length} papers, Failed: ${failed}`);

    if (results.length === 0) {
        console.log('[xbot] No figures generated. Exiting.');
        return;
    }

    // Step 4: Rank by combined signal (HF upvotes + figure quality score)
    for (const r of results) {
        const upvoteBonus = Math.min(30, r.paper.upvotes);
        const conferenceBonus = r.paper.hasConference ? 10 : 0;
        const institutionBonus = r.paper.hasTopInstitution ? 5 : 0;
        r.combinedScore = r.scores.score_total + upvoteBonus + conferenceBonus + institutionBonus;
    }

    results.sort((a, b) => b.combinedScore - a.combinedScore);
    const topResults = results.slice(0, MAX_POSTS_PER_DAY);

    console.log(`[xbot] Top ${topResults.length} selected for posting:`);
    for (const r of topResults) {
        console.log(`[xbot]   ${r.variantId}: combined=${r.combinedScore} (fig=${r.scores.score_total}, upvotes=${r.paper.upvotes})`);
    }

    // Step 5: Post to Twitter
    if (skipPosting) {
        console.log('[xbot] Dry run — skipping Twitter posting.');
        console.log(`[xbot] Done! Generated: ${generated} variants, Posted: 0 (dry run)`);
        return;
    }

    let posted = 0;
    for (const { paper, pngBuffer, variantId } of topResults) {
        try {
            console.log(`[xbot] Posting ${variantId}...`);

            // Generate sarcastic commentary
            const commentary = await generateCommentary(paper.title, paper.abstract);
            console.log(`[xbot]   Take: ${commentary}`);

            // Post to Twitter
            const tweetId = await postTweet(commentary, paper.arxivId, pngBuffer);

            // Mark the winning variant as posted
            await updateTweetPosted(variantId, tweetId);

            posted++;
            console.log(`[xbot]   Posted! Tweet ID: ${tweetId}`);

            await sleep(3000);
        } catch (err) {
            console.error(`[xbot] Failed to post ${variantId}: ${err.message}`);
        }
    }

    console.log(`[xbot] Done! Generated: ${generated} variants, Posted: ${posted}/${topResults.length}`);
}

// CLI: node src/index.js [--test N] [--dry-run] [--date YYYY-MM-DD]
const args = process.argv.slice(2);
let testLimit = null;

const testIdx = args.indexOf('--test');
if (testIdx !== -1 && args[testIdx + 1]) {
    testLimit = parseInt(args[testIdx + 1], 10);
}

const dateIdx = args.indexOf('--date');
const dateOverride = (dateIdx !== -1 && args[dateIdx + 1]) ? args[dateIdx + 1] : null;

const dryRun = args.includes('--dry-run');
if (dryRun) {
    console.log('[xbot] Dry run mode: skipping Twitter posting');
}

run(testLimit, dryRun, dateOverride).catch(err => {
    console.error('[xbot] Fatal error:', err);
    process.exit(1);
});
