import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

export async function getExistingArxivIds(arxivIds) {
    // Check for both plain IDs (legacy) and variant IDs (_v0, _v1)
    const allIds = arxivIds.flatMap(id => [id, `${id}_v0`, `${id}_v1`]);
    const { data, error } = await supabase
        .from('figures')
        .select('arxiv_id')
        .in('arxiv_id', allIds);

    if (error) throw new Error(`Supabase query error: ${error.message}`);

    // Map variant IDs back to base IDs
    const baseIds = new Set();
    for (const row of data) {
        const base = row.arxiv_id.replace(/_v\d+$/, '');
        baseIds.add(base);
    }
    return baseIds;
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

export async function uploadPng(arxivId, pngBuffer) {
    const path = `${arxivId}.png`;
    const { error } = await supabase.storage
        .from('figures')
        .upload(path, pngBuffer, {
            contentType: 'image/png',
            upsert: true,
        });

    if (error) throw new Error(`Storage upload error: ${error.message}`);

    const { data } = supabase.storage.from('figures').getPublicUrl(path);
    const publicUrl = data.publicUrl;

    // Store URL in the figures table
    await supabase
        .from('figures')
        .update({ png_url: publicUrl })
        .eq('arxiv_id', arxivId);

    return publicUrl;
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
