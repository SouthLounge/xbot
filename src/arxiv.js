const CATEGORIES = ['cs.LG', 'cs.CV', 'cs.CL', 'cs.AI'];
const ARXIV_API = 'https://export.arxiv.org/api/query';
const MAX_RESULTS = 200;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function parseAtomEntry(entry) {
    const id = entry.match(/<id>([^<]+)<\/id>/)?.[1] || '';
    const arxivId = id.match(/(\d{4}\.\d{4,5})/)?.[1];
    if (!arxivId) return null;

    const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]
        ?.replace(/\s+/g, ' ').trim() || '';

    const abstract = entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]
        ?.replace(/\s+/g, ' ').trim() || '';

    const authors = [];
    const authorMatches = entry.matchAll(/<author>\s*<name>([^<]+)<\/name>/g);
    for (const m of authorMatches) {
        authors.push(m[1].trim());
    }

    const categories = [];
    const catMatches = entry.matchAll(/<category[^>]*term="([^"]+)"/g);
    for (const m of catMatches) {
        categories.push(m[1]);
    }

    const published = entry.match(/<published>([^<]+)<\/published>/)?.[1] || '';
    const submitted = published ? published.split('T')[0] : null;

    return { arxivId, title, abstract, authors, categories, submitted };
}

async function fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'XBot/1.0 (FigGen scientific figure bot)' },
        });

        if (res.status === 429 || !res.ok) {
            const wait = (i + 1) * 5000;
            console.log(`[arxiv] Rate limited (${res.status}), retrying in ${wait / 1000}s...`);
            await sleep(wait);
            continue;
        }

        const xml = await res.text();
        if (xml.includes('Rate exceeded')) {
            const wait = (i + 1) * 5000;
            console.log(`[arxiv] Rate exceeded in body, retrying in ${wait / 1000}s...`);
            await sleep(wait);
            continue;
        }

        return xml;
    }
    throw new Error('arXiv API: max retries exceeded');
}

export async function fetchNewPapers(maxResults = MAX_RESULTS) {
    const catQuery = CATEGORIES.map(c => `cat:${c}`).join('+OR+');
    const url = `${ARXIV_API}?search_query=${catQuery}&sortBy=submittedDate&sortOrder=descending&max_results=${maxResults}&start=0`;

    const xml = await fetchWithRetry(url);

    // Split into entries
    const entries = xml.split('<entry>').slice(1); // first split is header
    const papers = [];

    for (const entry of entries) {
        const paper = parseAtomEntry(entry);
        if (paper && paper.title && paper.abstract) {
            papers.push(paper);
        }
    }

    return papers;
}
