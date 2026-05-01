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

export async function postTweet(paperTitle, arxivId, pngBuffer) {
    const client = getClient();

    // Upload media (uses v1.1 media upload endpoint)
    const mediaId = await client.v1.uploadMedia(pngBuffer, {
        mimeType: 'image/png',
    });

    // Build tweet text
    const arxivUrl = `arxiv.org/abs/${arxivId}`;
    const hashtags = '#MachineLearning #AI #DeepLearning';
    const overhead = arxivUrl.length + hashtags.length + 6; // newlines + spaces
    const maxTitleLen = 280 - overhead;
    const title = paperTitle.length > maxTitleLen
        ? paperTitle.substring(0, maxTitleLen - 1) + '…'
        : paperTitle;

    const tweetText = `${title}\n\n${arxivUrl}\n${hashtags}`;

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
