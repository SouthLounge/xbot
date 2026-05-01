import { TwitterApi } from 'twitter-api-v2';

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

export async function postTweet(commentary, arxivId, pngBuffer) {
    const client = getClient();

    // Upload media (uses v1.1 media upload endpoint)
    const mediaId = await client.v1.uploadMedia(pngBuffer, {
        mimeType: 'image/png',
    });

    // Build tweet: sarcastic take + arxiv link
    const arxivUrl = `arxiv.org/abs/${arxivId}`;
    const maxCommentLen = 280 - arxivUrl.length - 2; // 2 for \n\n
    const comment = commentary.length > maxCommentLen
        ? commentary.substring(0, maxCommentLen - 1) + '…'
        : commentary;

    const tweetText = `${comment}\n\n${arxivUrl}`;

    // Post tweet with media (v2 endpoint)
    const tweet = await client.v2.tweet(tweetText, {
        media: { media_ids: [mediaId] },
    });

    return tweet.data.id;
}

export async function getTweetMetrics(tweetId) {
    const client = getClient();
    const tweet = await client.v2.singleTweet(tweetId, {
        'tweet.fields': ['public_metrics'],
    });

    return tweet.data.public_metrics || {};
}
