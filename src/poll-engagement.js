// Poll Twitter engagement metrics for posted tweets and update Supabase
import { getRecentTweetIds, updateEngagement } from './db.js';
import { getTweetMetrics } from './twitter.js';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    console.log('[poll] Fetching recent posted tweets from Supabase...');

    const tweets = await getRecentTweetIds(30); // last 30 days
    console.log(`[poll] Found ${tweets.length} tweets to poll`);

    if (tweets.length === 0) {
        console.log('[poll] No tweets to poll. Exiting.');
        return;
    }

    let updated = 0;
    let failed = 0;

    for (const { arxiv_id, tweet_id } of tweets) {
        try {
            const metrics = await getTweetMetrics(tweet_id);
            await updateEngagement(arxiv_id, metrics);
            updated++;

            const imp = metrics.impression_count || 0;
            const likes = metrics.like_count || 0;
            const rts = metrics.retweet_count || 0;
            console.log(`[poll] ${arxiv_id}: ${imp} impressions, ${likes} likes, ${rts} RTs`);

            await sleep(1500); // rate limit
        } catch (err) {
            console.error(`[poll] Failed for ${arxiv_id}: ${err.message}`);
            failed++;
        }
    }

    console.log(`[poll] Done! Updated: ${updated}, Failed: ${failed}`);
}

run().catch(err => {
    console.error('[poll] Fatal error:', err);
    process.exit(1);
});
