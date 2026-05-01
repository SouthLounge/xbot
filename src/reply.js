// Reply mode: find popular paper tweets and reply with generated figures
import { generateFigure } from './generate.js';
import { scoreSceneGraph } from './scorer.js';
import { renderSceneGraph } from './renderer.js';
import { svgToPng } from './png.js';
import { getExistingArxivIds, insertFigure, updateTweetPosted } from './db.js';
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

// Accounts that regularly post arXiv papers
const WATCH_ACCOUNTS = [
    '_akhaliq',
    'papers_daily',
    'ai_pub_',
];

const ARXIV_PATTERN = /(?:arxiv\.org\/abs\/|arxiv\.org\/pdf\/|(\d{4}\.\d{4,5}))/g;

function extractArxivId(text) {
    const match = text.match(/(\d{4}\.\d{4,5})/);
    return match ? match[1] : null;
}

async function fetchPaperAbstract(arxivId) {
    // Try HuggingFace API first (no rate limits)
    try {
        const hfRes = await fetch(`https://huggingface.co/api/papers/${arxivId}`);
        if (hfRes.ok) {
            const hfData = await hfRes.json();
            if (hfData.summary) {
                const authors = (hfData.authors || []).filter(a => !a.hidden).map(a => a.name);
                return {
                    arxivId,
                    title: hfData.title,
                    abstract: hfData.summary,
                    authors,
                    categories: hfData.ai_keywords || [],
                    submitted: hfData.publishedAt ? hfData.publishedAt.split('T')[0] : null,
                };
            }
        }
    } catch {}

    // Fallback to arXiv API with retry
    for (let i = 0; i < 3; i++) {
        const url = `https://export.arxiv.org/api/query?id_list=${arxivId}`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'XBot/1.0 (FigGen scientific figure bot)' },
        });

        if (res.status === 429 || !res.ok) {
            await sleep((i + 1) * 5000);
            continue;
        }

        const xml = await res.text();
        if (xml.includes('Rate exceeded')) {
            await sleep((i + 1) * 5000);
            continue;
        }

        const titleMatch = xml.match(/<title>([\s\S]*?)<\/title>/g);
        let title = 'Unknown Paper';
        if (titleMatch && titleMatch.length >= 2) {
            title = titleMatch[1].replace(/<\/?title>/g, '').replace(/\s+/g, ' ').trim();
        }

        const summaryMatch = xml.match(/<summary>([\s\S]*?)<\/summary>/);
        const abstract = summaryMatch ? summaryMatch[1].replace(/\s+/g, ' ').trim() : '';

        const authors = [];
        const authorMatches = xml.matchAll(/<author>\s*<name>([^<]+)<\/name>/g);
        for (const m of authorMatches) {
            authors.push(m[1].trim());
        }

        if (!abstract) continue;
        return { arxivId, title, abstract, authors, categories: [], submitted: null };
    }

    return null;
}

async function findPaperTweets(maxResults = 10) {
    const client = getClient();
    const tweets = [];

    // Strategy 1: Search watched accounts for original paper tweets
    for (const account of WATCH_ACCOUNTS) {
        try {
            console.log(`[reply] Searching tweets from @${account}...`);

            // Search for original tweets (not RTs) that likely contain paper links
            const query = `from:${account} -is:retweet (arxiv OR paper OR http)`;
            const result = await client.v2.search(query, {
                max_results: 10,
                'tweet.fields': ['public_metrics', 'created_at', 'author_id', 'entities'],
            });

            if (result.data?.data) {
                for (const tweet of result.data.data) {
                    // Try to extract arXiv ID from text or expanded URLs
                    let arxivId = extractArxivId(tweet.text);

                    // Check expanded URLs in entities (handles t.co shortened links)
                    if (!arxivId && tweet.entities?.urls) {
                        for (const urlEntity of tweet.entities.urls) {
                            const expanded = urlEntity.expanded_url || urlEntity.unwound_url || '';
                            arxivId = extractArxivId(expanded);
                            if (arxivId) break;
                        }
                    }

                    if (!arxivId) continue;

                    const metrics = tweet.public_metrics || {};
                    const engagement = (metrics.like_count || 0) + (metrics.retweet_count || 0) * 2;

                    // Only reply to tweets with some engagement (>5 likes)
                    if (metrics.like_count < 5) continue;

                    tweets.push({
                        tweetId: tweet.id,
                        text: tweet.text,
                        arxivId,
                        account,
                        engagement,
                        likes: metrics.like_count || 0,
                        retweets: metrics.retweet_count || 0,
                        createdAt: tweet.created_at,
                    });
                }
            }

            await sleep(2000);
        } catch (err) {
            console.error(`[reply] Error searching @${account}: ${err.message}`);
        }
    }

    // Strategy 2: Also search broadly for high-engagement arxiv tweets
    try {
        console.log(`[reply] Searching for popular arxiv tweets...`);
        const query = 'arxiv.org -is:retweet';
        const result = await client.v2.search(query, {
            max_results: 10,
            'tweet.fields': ['public_metrics', 'created_at', 'author_id', 'entities'],
        });

        if (result.data?.data) {
            for (const tweet of result.data.data) {
                let arxivId = extractArxivId(tweet.text);
                if (!arxivId && tweet.entities?.urls) {
                    for (const urlEntity of tweet.entities.urls) {
                        const expanded = urlEntity.expanded_url || urlEntity.unwound_url || '';
                        arxivId = extractArxivId(expanded);
                        if (arxivId) break;
                    }
                }
                if (!arxivId) continue;

                const metrics = tweet.public_metrics || {};
                if (metrics.like_count < 10) continue; // higher bar for unknown accounts

                const engagement = (metrics.like_count || 0) + (metrics.retweet_count || 0) * 2;

                // Avoid duplicates
                if (tweets.some(t => t.tweetId === tweet.id)) continue;

                tweets.push({
                    tweetId: tweet.id,
                    text: tweet.text,
                    arxivId,
                    account: 'search',
                    engagement,
                    likes: metrics.like_count || 0,
                    retweets: metrics.retweet_count || 0,
                    createdAt: tweet.created_at,
                });
            }
        }
    } catch (err) {
        console.error(`[reply] Error in broad search: ${err.message}`);
    }

    // Sort by engagement
    tweets.sort((a, b) => b.engagement - a.engagement);

    console.log(`[reply] Found ${tweets.length} paper tweets total`);
    for (const t of tweets.slice(0, 5)) {
        console.log(`[reply]   @${t.account}: ${t.arxivId} (${t.likes} likes, ${t.retweets} RTs)`);
    }

    return tweets.slice(0, maxResults);
}

async function replyToTweet(tweetId, pngBuffer) {
    const client = getClient();

    // Upload media
    const mediaId = await client.v1.uploadMedia(pngBuffer, {
        mimeType: 'image/png',
    });

    // Reply using v2.tweet with reply parameter
    const reply = await client.v2.tweet('Architecture overview of this paper', {
        reply: { in_reply_to_tweet_id: tweetId },
        media: { media_ids: [mediaId] },
    });

    return reply.data.id;
}

async function run(testLimit = null, skipPosting = false) {
    console.log('[reply] Finding popular paper tweets to reply to...');

    // Step 1: Find paper tweets from watched accounts
    const paperTweets = await findPaperTweets(20);

    if (paperTweets.length === 0) {
        console.log('[reply] No paper tweets found. Exiting.');
        return;
    }

    // Step 2: Filter out papers we've already processed
    const arxivIds = paperTweets.map(t => t.arxivId);
    const existingIds = await getExistingArxivIds(arxivIds);
    const newTweets = paperTweets.filter(t => !existingIds.has(t.arxivId));

    console.log(`[reply] ${newTweets.length} new papers (${existingIds.size} already processed)`);

    if (newTweets.length === 0) {
        console.log('[reply] All papers already processed. Exiting.');
        return;
    }

    // Step 3: Pick top tweets by engagement, apply limit
    const limit = testLimit || 3;
    const targets = newTweets.slice(0, limit);

    let replied = 0;
    for (const tweet of targets) {
        try {
            console.log(`[reply] Processing ${tweet.arxivId} from @${tweet.account} (${tweet.likes} likes, ${tweet.retweets} RTs)`);

            // Fetch paper abstract from arXiv
            const paper = await fetchPaperAbstract(tweet.arxivId);
            if (!paper) {
                console.log(`[reply]   Could not fetch abstract. Skipping.`);
                continue;
            }
            await sleep(3000); // arXiv rate limit

            // Generate figure
            const { sceneGraph, usage } = await generateFigure(paper);
            const scores = scoreSceneGraph(sceneGraph);

            console.log(`[reply]   Figure score: ${scores.score_total}/100`);

            // Skip low-quality figures — don't reply with junk
            if (scores.score_total < 60) {
                console.log(`[reply]   Score too low, skipping reply.`);
                continue;
            }

            // Store to Supabase
            await insertFigure({
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
            });

            if (skipPosting) {
                console.log(`[reply]   Dry run — skipping reply.`);
                continue;
            }

            // Render and reply
            const svgString = renderSceneGraph(sceneGraph, 'dark');
            const pngBuffer = svgToPng(svgString, 1600);
            const replyId = await replyToTweet(tweet.tweetId, pngBuffer);

            await updateTweetPosted(paper.arxivId, replyId);
            replied++;
            console.log(`[reply]   Replied! Tweet ID: ${replyId}`);

            await sleep(5000); // be respectful between replies
        } catch (err) {
            console.error(`[reply] Error processing ${tweet.arxivId}: ${err.message}`);
        }
    }

    console.log(`[reply] Done! Replied to ${replied} tweets.`);
}

// CLI: node src/reply.js [--test N] [--dry-run]
const args = process.argv.slice(2);
let testLimit = null;

const testIdx = args.indexOf('--test');
if (testIdx !== -1 && args[testIdx + 1]) {
    testLimit = parseInt(args[testIdx + 1], 10);
}

const dryRun = args.includes('--dry-run');
if (dryRun) {
    console.log('[reply] Dry run mode');
}

run(testLimit, dryRun).catch(err => {
    console.error('[reply] Fatal error:', err);
    process.exit(1);
});
