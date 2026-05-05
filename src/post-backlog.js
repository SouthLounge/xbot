// Post top 3 unposted figures from the backlog
import { createClient } from '@supabase/supabase-js';
import { renderSceneGraph } from './renderer.js';
import { svgToPng } from './png.js';
import { postTweet } from './twitter.js';
import { generateCommentary } from './commentary.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    const { data } = await supabase
        .from('figures')
        .select('arxiv_id, paper_title, abstract, scene_graph, score_total')
        .eq('posted_to_twitter', false)
        .order('score_total', { ascending: false })
        .limit(20);

    // Group by base paper, pick best variant
    const byPaper = {};
    for (const r of data) {
        const base = r.arxiv_id.replace(/_v\d+$/, '');
        if (!byPaper[base] || r.score_total > byPaper[base].score_total) {
            byPaper[base] = r;
        }
    }

    const top3 = Object.values(byPaper)
        .sort((a, b) => b.score_total - a.score_total)
        .slice(0, 3);

    console.log(`[backlog] Posting ${top3.length} top unposted figures...`);

    for (const fig of top3) {
        try {
            console.log(`[backlog] ${fig.arxiv_id} | score: ${fig.score_total} | ${fig.paper_title.substring(0, 50)}`);

            const commentary = await generateCommentary(fig.paper_title, fig.abstract);
            console.log(`[backlog]   Take: ${commentary}`);

            const svg = renderSceneGraph(fig.scene_graph, 'dark');
            const png = svgToPng(svg, 1600);

            const baseId = fig.arxiv_id.replace(/_v\d+$/, '');
            const tweetId = await postTweet(commentary, baseId, png);

            await supabase.from('figures').update({
                posted_to_twitter: true,
                tweet_id: tweetId,
                posted_at: new Date().toISOString(),
            }).eq('arxiv_id', fig.arxiv_id);

            console.log(`[backlog]   Posted! Tweet: ${tweetId}`);
            await sleep(3000);
        } catch (err) {
            console.error(`[backlog]   FAILED: ${err.message}`);
        }
    }
    console.log('[backlog] Done!');
}

run().catch(err => {
    console.error('[backlog] Fatal:', err);
    process.exit(1);
});
