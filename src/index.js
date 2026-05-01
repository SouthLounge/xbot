import { fetchDailyPapers } from './papers.js';
import { generateFigure } from './generate.js';
import { scoreSceneGraph } from './scorer.js';
import { renderSceneGraph } from './renderer.js';
import { svgToPng } from './png.js';
import { getExistingArxivIds, insertFigure, updateTweetPosted } from './db.js';
import { postTweet } from './twitter.js';
import { generateCommentary } from './commentary.js';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Post the top N papers by combined score (HF upvotes + figure quality)
const MAX_POSTS_PER_DAY = 3;

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

    // Step 3: Generate figures + score + store
    const results = [];
    let generated = 0;
    let failed = 0;

    for (const paper of newPapers) {
        try {
            console.log(`[xbot] Generating figure for ${paper.arxivId}: ${paper.title.substring(0, 60)}...`);
            console.log(`[xbot]   HF upvotes: ${paper.upvotes}, conference: ${paper.hasConference}, top institution: ${paper.hasTopInstitution}`);

            const { sceneGraph, usage } = await generateFigure(paper);
            const scores = scoreSceneGraph(sceneGraph);

            // Store ALL metadata to Supabase
            const figure = {
                arxiv_id: paper.arxivId,
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
            results.push({ paper, sceneGraph, scores });
            generated++;

            console.log(`[xbot]   Figure score: ${scores.score_total}/100`);

            // Rate limit: 3s between API calls
            await sleep(3000);
        } catch (err) {
            console.error(`[xbot] Failed for ${paper.arxivId}: ${err.message}`);
            failed++;
            await sleep(1000);
        }
    }

    console.log(`[xbot] Generated: ${generated}, Failed: ${failed}`);

    if (results.length === 0) {
        console.log('[xbot] No figures generated. Exiting.');
        return;
    }

    // Step 4: Rank by combined signal (HF upvotes + figure quality score)
    // HF upvotes are the strongest quality signal — they indicate community interest
    for (const r of results) {
        const upvoteBonus = Math.min(30, r.paper.upvotes); // cap at 30 bonus points
        const conferenceBonus = r.paper.hasConference ? 10 : 0;
        const institutionBonus = r.paper.hasTopInstitution ? 5 : 0;
        r.combinedScore = r.scores.score_total + upvoteBonus + conferenceBonus + institutionBonus;
    }

    results.sort((a, b) => b.combinedScore - a.combinedScore);
    const topResults = results.slice(0, MAX_POSTS_PER_DAY);

    console.log(`[xbot] Top ${topResults.length} selected for posting:`);
    for (const r of topResults) {
        console.log(`[xbot]   ${r.paper.arxivId}: combined=${r.combinedScore} (fig=${r.scores.score_total}, upvotes=${r.paper.upvotes})`);
    }

    // Step 5: Render SVG → PNG → Post to Twitter
    if (skipPosting) {
        console.log('[xbot] Dry run — skipping Twitter posting.');
        console.log(`[xbot] Done! Generated: ${generated}, Posted: 0 (dry run)`);
        return;
    }

    let posted = 0;
    for (const { paper, sceneGraph, scores } of topResults) {
        try {
            console.log(`[xbot] Rendering and posting ${paper.arxivId}...`);

            // Generate sarcastic commentary
            const commentary = await generateCommentary(paper.title, paper.abstract);
            console.log(`[xbot]   Take: ${commentary}`);

            // Render SVG string
            const svgString = renderSceneGraph(sceneGraph, 'dark');

            // Convert to PNG
            const pngBuffer = svgToPng(svgString, 1600);

            // Post to Twitter
            const tweetId = await postTweet(commentary, paper.arxivId, pngBuffer);

            // Store tweet ID back to Supabase
            await updateTweetPosted(paper.arxivId, tweetId);

            posted++;
            console.log(`[xbot]   Posted! Tweet ID: ${tweetId}`);

            // Rate limit between posts
            await sleep(3000);
        } catch (err) {
            console.error(`[xbot] Failed to post ${paper.arxivId}: ${err.message}`);
        }
    }

    console.log(`[xbot] Done! Generated: ${generated}, Posted: ${posted}/${topResults.length}`);
}

// CLI: node src/index.js [--test N] [--dry-run]
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
