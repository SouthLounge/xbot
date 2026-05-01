// One-off script: post the top unposted figure from Supabase
import { createClient } from '@supabase/supabase-js';
import { renderSceneGraph } from './renderer.js';
import { svgToPng } from './png.js';
import { postTweet } from './twitter.js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

async function postTopFigure() {
    // Get top unposted figure
    const { data, error } = await supabase
        .from('figures')
        .select('*')
        .eq('posted_to_twitter', false)
        .order('score_total', { ascending: false })
        .limit(1);

    if (error) throw error;
    if (!data || data.length === 0) {
        console.log('No unposted figures found.');
        return;
    }

    const fig = data[0];
    console.log(`Posting: ${fig.arxiv_id} — ${fig.paper_title} (score: ${fig.score_total})`);

    // Render SVG → PNG
    const svg = renderSceneGraph(fig.scene_graph, 'dark');
    const png = svgToPng(svg, 1600);
    console.log(`PNG rendered: ${png.length} bytes`);

    // Post to Twitter
    const tweetId = await postTweet(fig.paper_title, fig.arxiv_id, png);
    console.log(`Tweet posted! ID: ${tweetId}`);

    // Update Supabase
    await supabase
        .from('figures')
        .update({
            posted_to_twitter: true,
            tweet_id: tweetId,
            posted_at: new Date().toISOString(),
        })
        .eq('arxiv_id', fig.arxiv_id);

    console.log('Done!');
}

postTopFigure().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
