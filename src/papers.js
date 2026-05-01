// Fetch curated papers from HuggingFace Daily Papers API
// These are already quality-filtered (~20-30 papers/day, top ML papers)

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const CONFERENCE_KEYWORDS = [
    'NeurIPS', 'NIPS', 'ICML', 'ICLR', 'CVPR', 'ICCV', 'ECCV',
    'ACL', 'EMNLP', 'NAACL', 'AAAI', 'IJCAI', 'KDD', 'SIGIR',
    'ICASSP', 'INTERSPEECH', 'UAI', 'AISTATS', 'COLT', 'CoRL',
    'accepted', 'oral', 'spotlight', 'best paper',
];

const TOP_INSTITUTIONS = [
    'Google', 'DeepMind', 'OpenAI', 'Meta', 'Microsoft', 'Apple',
    'NVIDIA', 'Anthropic', 'Mistral', 'Cohere', 'xAI',
    'MIT', 'Stanford', 'Berkeley', 'CMU', 'Princeton', 'Harvard',
    'Oxford', 'Cambridge', 'ETH', 'Tsinghua', 'Peking',
    'FAIR', 'Google Brain', 'Google Research',
];

function hasConferenceMention(text) {
    const lower = text.toLowerCase();
    return CONFERENCE_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
}

function hasTopInstitution(authors, orgName) {
    const allText = [
        orgName || '',
        ...authors.map(a => a.name || ''),
    ].join(' ').toLowerCase();
    return TOP_INSTITUTIONS.some(inst => allText.includes(inst.toLowerCase()));
}

export async function fetchDailyPapers(dateStr = null) {
    if (!dateStr) {
        const today = new Date();
        dateStr = today.toISOString().split('T')[0];
    }

    const url = `https://huggingface.co/api/daily_papers?date=${dateStr}&limit=50`;

    const res = await fetch(url, {
        headers: { 'User-Agent': 'XBot/1.0 (FigGen scientific figure bot)' },
    });

    if (!res.ok) {
        throw new Error(`HuggingFace API error: ${res.status}`);
    }

    const entries = await res.json();

    const papers = entries.map(entry => {
        const p = entry.paper;
        const authors = (p.authors || [])
            .filter(a => !a.hidden)
            .map(a => a.name);
        const orgName = p.organization?.fullname || '';

        return {
            arxivId: p.id,
            title: p.title,
            abstract: p.summary,
            authors,
            categories: p.ai_keywords || [],
            submitted: p.publishedAt ? p.publishedAt.split('T')[0] : null,
            // Quality signals from HuggingFace
            upvotes: p.upvotes || 0,
            githubStars: p.githubStars || 0,
            githubRepo: p.githubRepo || null,
            orgName,
            // Derived quality flags
            hasConference: hasConferenceMention(p.summary || p.title || ''),
            hasTopInstitution: hasTopInstitution(p.authors || [], orgName),
        };
    });

    // Sort by upvotes (HuggingFace community signal)
    papers.sort((a, b) => b.upvotes - a.upvotes);

    console.log(`[papers] ${papers.length} papers from HuggingFace Daily (${dateStr})`);
    console.log(`[papers] ${papers.filter(p => p.hasConference).length} mention conferences`);
    console.log(`[papers] ${papers.filter(p => p.hasTopInstitution).length} from top institutions`);

    return papers;
}
