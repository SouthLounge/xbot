// Account warmup: follow ML accounts, like paper tweets
// Designed to run every 2 hours to build account trust
import { TwitterApi } from 'twitter-api-v2';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

let rwClient = null;
function getClient() {
    if (!rwClient) {
        const client = new TwitterApi({
            appKey: process.env.TWITTER_API_KEY,
            appSecret: process.env.TWITTER_API_SECRET,
            accessToken: process.env.TWITTER_ACCESS_TOKEN,
            accessSecret: process.env.TWITTER_ACCESS_SECRET,
        });
        rwClient = client.readWrite;
    }
    return rwClient;
}

// ML researchers and paper accounts to follow
const ACCOUNTS_TO_FOLLOW = [
    // Paper aggregators
    '_akhaliq', 'papers_daily', 'ai_pub_',
    // Labs and orgs
    'GoogleDeepMind', 'OpenAI', 'AnthropicAI', 'MetaAI', 'MistralAI',
    'GoogleAI', 'NVIDIAResearch',
    // Researchers
    'hardmaru', 'srush_nlp', 'jeffdean', 'ylecun',
    'GaryMarcus', 'DrJimFan', 'RichardSocher',
    'jackclarkSF', 'Smerity', 'NandoDF',
    'OriolVinyalsML',
    // AI community
    'DeepLearningAI', 'weights_biases', 'kaggle',
    'huggingface',
];

async function getMyId() {
    const client = getClient();
    const me = await client.v2.me();
    return me.data.id;
}

async function getMyFollowing(myId) {
    const client = getClient();
    try {
        const following = await client.v2.following(myId, { max_results: 1000 });
        return new Set((following.data?.data || []).map(u => u.username.toLowerCase()));
    } catch {
        return new Set();
    }
}

async function followAccounts(myId, count = 5) {
    const client = getClient();
    const alreadyFollowing = await getMyFollowing(myId);
    const toFollow = ACCOUNTS_TO_FOLLOW.filter(a => !alreadyFollowing.has(a.toLowerCase()));

    // Pick random accounts to follow
    const shuffled = toFollow.sort(() => Math.random() - 0.5);
    const targets = shuffled.slice(0, count);

    let followed = 0;
    for (const username of targets) {
        try {
            const user = await client.v2.userByUsername(username);
            if (!user.data) continue;

            await client.v2.follow(myId, user.data.id);
            followed++;
            console.log(`[warmup] Followed @${username}`);
            await sleep(2000);
        } catch (err) {
            console.log(`[warmup] Could not follow @${username}: ${err.message}`);
        }
    }

    return followed;
}

async function likeTweets(count = 10) {
    const client = getClient();
    const me = await client.v2.me();

    // Search for ML paper tweets to like
    const queries = [
        'arxiv.org -is:retweet',
        '#MachineLearning -is:retweet',
        '#NeurIPS OR #ICML OR #ICLR -is:retweet',
        'transformer model architecture -is:retweet',
    ];

    const query = queries[Math.floor(Math.random() * queries.length)];
    console.log(`[warmup] Searching: "${query}"`);

    let liked = 0;
    try {
        const result = await client.v2.search(query, {
            max_results: 20,
            'tweet.fields': ['public_metrics'],
        });

        if (!result.data?.data) return 0;

        // Shuffle and like up to count
        const tweets = result.data.data.sort(() => Math.random() - 0.5);

        for (const tweet of tweets) {
            if (liked >= count) break;

            try {
                await client.v2.like(me.data.id, tweet.id);
                liked++;
                console.log(`[warmup] Liked tweet ${tweet.id}: ${tweet.text.substring(0, 50)}...`);
                await sleep(1500);
            } catch (err) {
                // Skip already liked or other errors
            }
        }
    } catch (err) {
        console.log(`[warmup] Search error: ${err.message}`);
    }

    return liked;
}

async function notify(message) {
    const topic = process.env.NTFY_TOPIC;
    if (!topic) {
        console.log(`[warmup] No NTFY_TOPIC set, skipping notification`);
        return;
    }

    try {
        await fetch(`https://ntfy.sh/${topic}`, {
            method: 'POST',
            headers: { 'Title': 'XBot Warmup' },
            body: message,
        });
        console.log(`[warmup] Notification sent`);
    } catch (err) {
        console.log(`[warmup] Notification failed: ${err.message}`);
    }
}

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function run() {
    // Random delay 0-90 minutes to avoid fixed-schedule bot pattern
    const delayMin = randInt(0, 90);
    console.log(`[warmup] Waiting ${delayMin} minutes before starting...`);
    await sleep(delayMin * 60 * 1000);

    console.log(`[warmup] Starting warmup at ${new Date().toISOString()}`);

    const myId = await getMyId();
    console.log(`[warmup] Account ID: ${myId}`);

    // Randomize counts each run
    const followCount = randInt(2, 6);
    const likeCount = randInt(5, 15);

    const followed = await followAccounts(myId, followCount);

    // Random pause between follows and likes (30s - 3min)
    await sleep(randInt(30, 180) * 1000);

    const liked = await likeTweets(likeCount);

    const summary = `Warmup complete: followed ${followed} accounts, liked ${liked} tweets`;
    console.log(`[warmup] ${summary}`);

    await notify(summary);
}

run().catch(err => {
    console.error('[warmup] Fatal error:', err);
    process.exit(1);
});
