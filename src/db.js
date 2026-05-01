import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

export async function getExistingArxivIds(arxivIds) {
    const { data, error } = await supabase
        .from('figures')
        .select('arxiv_id')
        .in('arxiv_id', arxivIds);

    if (error) throw new Error(`Supabase query error: ${error.message}`);
    return new Set(data.map(row => row.arxiv_id));
}

export async function insertFigure(figure) {
    const { error } = await supabase
        .from('figures')
        .insert(figure);

    if (error) throw new Error(`Supabase insert error: ${error.message}`);
}

export async function updateTweetPosted(arxivId, tweetId) {
    const { error } = await supabase
        .from('figures')
        .update({
            posted_to_twitter: true,
            tweet_id: tweetId,
            posted_at: new Date().toISOString(),
        })
        .eq('arxiv_id', arxivId);

    if (error) throw new Error(`Supabase update error: ${error.message}`);
}

export async function getRecentTweetIds(days = 30) {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data, error } = await supabase
        .from('figures')
        .select('arxiv_id, tweet_id')
        .eq('posted_to_twitter', true)
        .gte('posted_at', since)
        .not('tweet_id', 'is', null);

    if (error) throw new Error(`Supabase query error: ${error.message}`);
    return data;
}

export async function updateEngagement(arxivId, metrics) {
    const { error } = await supabase
        .from('figures')
        .update({
            twitter_impressions: metrics.impression_count || 0,
            twitter_likes: metrics.like_count || 0,
            twitter_retweets: metrics.retweet_count || 0,
            twitter_replies: metrics.reply_count || 0,
            engagement_updated_at: new Date().toISOString(),
        })
        .eq('arxiv_id', arxivId);

    if (error) throw new Error(`Supabase update error: ${error.message}`);
}
