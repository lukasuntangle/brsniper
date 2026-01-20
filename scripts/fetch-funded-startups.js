/**
 * BR Sniper - Funded Startups Fetcher
 * Fetches recently funded startups from RSS feeds and news sources
 */

const fs = require('fs');
const path = require('path');

// RSS Feed URLs for funding news
const FUNDING_SOURCES = [
  {
    id: 'techcrunch',
    name: 'TechCrunch',
    feeds: [
      { url: 'https://techcrunch.com/category/startups/feed/', category: 'startups' },
      { url: 'https://techcrunch.com/tag/funding/feed/', category: 'funding' }
    ]
  },
  {
    id: 'sifted',
    name: 'Sifted',
    feeds: [
      { url: 'https://sifted.eu/feed/', category: 'european' }
    ]
  },
  {
    id: 'crunchbase',
    name: 'Crunchbase News',
    feeds: [
      { url: 'https://news.crunchbase.com/feed/', category: 'funding' }
    ]
  }
];

// Funding round keywords to identify funding articles
const FUNDING_KEYWORDS = [
  'raises', 'raised', 'funding', 'series a', 'series b', 'series c', 'series d',
  'seed', 'pre-seed', 'venture', 'investment', 'million', 'secures', 'closes',
  'led by', 'backed by', 'round', 'capital'
];

// Industry classification keywords
const INDUSTRY_KEYWORDS = {
  'AI/ML': ['ai', 'artificial intelligence', 'machine learning', 'ml', 'llm', 'generative', 'gpt', 'neural'],
  'Fintech': ['fintech', 'payment', 'banking', 'financial', 'crypto', 'blockchain', 'defi', 'neobank'],
  'Healthcare': ['health', 'medical', 'biotech', 'pharma', 'patient', 'clinical', 'healthcare'],
  'SaaS': ['saas', 'software', 'platform', 'b2b', 'enterprise', 'cloud'],
  'E-commerce': ['ecommerce', 'e-commerce', 'retail', 'marketplace', 'shopping', 'commerce'],
  'Cybersecurity': ['security', 'cyber', 'encryption', 'threat', 'privacy', 'authentication'],
  'Climate': ['climate', 'sustainability', 'green', 'carbon', 'renewable', 'clean energy'],
  'Developer Tools': ['developer', 'devops', 'api', 'infrastructure', 'open source', 'code']
};

/**
 * Simple RSS parser (no external dependencies)
 */
async function parseRSSFeed(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BRSniper/1.0; +https://github.com/brsniper)'
      }
    });

    if (!response.ok) {
      console.log(`Failed to fetch ${url}: ${response.status}`);
      return [];
    }

    const xml = await response.text();
    const items = [];

    // Simple regex-based XML parsing for RSS items
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const itemXml = match[1];

      const title = extractTag(itemXml, 'title');
      const link = extractTag(itemXml, 'link');
      const description = extractTag(itemXml, 'description');
      const pubDate = extractTag(itemXml, 'pubDate');

      if (title && link) {
        items.push({
          title: decodeHTMLEntities(title),
          url: link,
          description: decodeHTMLEntities(description || ''),
          pubDate: pubDate ? new Date(pubDate) : new Date()
        });
      }
    }

    return items;
  } catch (error) {
    console.error(`Error parsing RSS feed ${url}:`, error.message);
    return [];
  }
}

function extractTag(xml, tag) {
  const regex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? (match[1] || match[2] || '').trim() : null;
}

function decodeHTMLEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]*>/g, ''); // Strip HTML tags
}

/**
 * Check if article is about funding
 */
function isFundingArticle(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  return FUNDING_KEYWORDS.some(keyword => text.includes(keyword));
}

/**
 * Extract funding amount from text
 */
function extractFundingAmount(title, description) {
  const text = `${title} ${description}`;

  // Pattern: $X million, $XM, €X million, etc.
  const patterns = [
    /\$(\d+(?:\.\d+)?)\s*(?:million|m\b)/i,
    /\$(\d+(?:\.\d+)?)\s*(?:billion|b\b)/i,
    /€(\d+(?:\.\d+)?)\s*(?:million|m\b)/i,
    /(\d+(?:\.\d+)?)\s*(?:million|m)\s*(?:dollars?|usd)/i,
    /raises?\s*\$?(\d+(?:\.\d+)?)\s*(?:million|m\b)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const amount = parseFloat(match[1]);
      // Check if it's billion
      if (pattern.source.includes('billion')) {
        return amount * 1000000000;
      }
      return amount * 1000000;
    }
  }

  return null;
}

/**
 * Extract funding round/stage
 */
function extractFundingRound(title, description) {
  const text = `${title} ${description}`.toLowerCase();

  if (text.includes('series d') || text.includes('series e')) return 'Series D+';
  if (text.includes('series c')) return 'Series C';
  if (text.includes('series b')) return 'Series B';
  if (text.includes('series a')) return 'Series A';
  if (text.includes('pre-seed')) return 'Pre-Seed';
  if (text.includes('seed')) return 'Seed';
  if (text.includes('bridge')) return 'Bridge';
  if (text.includes('growth')) return 'Growth';

  return 'Unknown';
}

/**
 * Extract company name from funding article
 */
function extractCompanyName(title) {
  // Common patterns: "CompanyName raises $XM", "CompanyName secures funding"
  const patterns = [
    /^([A-Z][a-zA-Z0-9\s\.]+?)\s+(?:raises?|secures?|closes?|gets?|lands?|nabs?|bags?)/i,
    /^([A-Z][a-zA-Z0-9\s\.]+?),?\s+(?:a|an|the)?\s*(?:\w+\s+)*(?:startup|company)/i
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  // Fallback: try to extract first capitalized phrase
  const words = title.split(/\s+/);
  let companyName = '';
  for (const word of words) {
    if (/^[A-Z]/.test(word) && !/^(The|A|An|In|At|For|To|Of|With|By)$/.test(word)) {
      companyName += (companyName ? ' ' : '') + word;
    } else if (companyName) {
      break;
    }
  }

  return companyName || title.split(/[,\-–:]/).shift().trim();
}

/**
 * Determine industry from content
 */
function determineIndustry(title, description) {
  const text = `${title} ${description}`.toLowerCase();

  for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      return industry;
    }
  }

  return 'Other';
}

/**
 * Extract investors from text
 */
function extractInvestors(description) {
  const investors = [];

  // Common VC/investor patterns
  const patterns = [
    /led by\s+([A-Z][a-zA-Z\s&\.]+?)(?:,|\.|and|with|along)/i,
    /backed by\s+([A-Z][a-zA-Z\s&\.]+?)(?:,|\.|and|with|along)/i,
    /participation from\s+([A-Z][a-zA-Z\s&\.,]+?)(?:\.|and others)/i
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) {
      const investorStr = match[1];
      const investorNames = investorStr.split(/,|and/).map(s => s.trim()).filter(s => s.length > 2);
      investorNames.forEach((name, index) => {
        investors.push({
          name: name,
          type: 'VC',
          lead: index === 0
        });
      });
      break;
    }
  }

  return investors;
}

/**
 * Generate copyability analysis based on industry and funding
 */
function generateCopyabilityAnalysis(industry, fundingRound, amountRaised, description) {
  const text = description.toLowerCase();

  // Factors that make something hard to copy
  const hardFactors = [
    { keyword: 'patent', weight: 2 },
    { keyword: 'proprietary', weight: 2 },
    { keyword: 'breakthrough', weight: 1 },
    { keyword: 'first-of-its-kind', weight: 2 },
    { keyword: 'phd', weight: 1 },
    { keyword: 'regulated', weight: 2 },
    { keyword: 'hardware', weight: 2 },
    { keyword: 'deep tech', weight: 2 },
    { keyword: 'biotech', weight: 2 },
    { keyword: 'clinical', weight: 2 },
    { keyword: 'fda', weight: 2 }
  ];

  // Factors that make something easier to copy
  const easyFactors = [
    { keyword: 'marketplace', weight: 1 },
    { keyword: 'platform', weight: 1 },
    { keyword: 'saas', weight: 1 },
    { keyword: 'api', weight: 1 },
    { keyword: 'app', weight: 1 },
    { keyword: 'automation', weight: 1 },
    { keyword: 'dashboard', weight: 1 },
    { keyword: 'workflow', weight: 1 }
  ];

  let score = 3; // Start at medium

  // Adjust based on keywords
  hardFactors.forEach(factor => {
    if (text.includes(factor.keyword)) score -= factor.weight;
  });
  easyFactors.forEach(factor => {
    if (text.includes(factor.keyword)) score += factor.weight;
  });

  // Adjust based on funding amount (more funding = probably harder moat)
  if (amountRaised > 50000000) score -= 1;
  if (amountRaised > 100000000) score -= 1;
  if (amountRaised < 5000000) score += 1;

  // Adjust based on round
  if (['Series C', 'Series D+', 'Growth'].includes(fundingRound)) score -= 1;
  if (['Pre-Seed', 'Seed'].includes(fundingRound)) score += 1;

  // Clamp score between 1-5
  score = Math.max(1, Math.min(5, score));

  // Generate verdict
  let verdict, reasoning, alternativeApproach;

  if (score >= 4) {
    verdict = 'EASY TO REPLICATE';
    reasoning = `This appears to be a software/platform play without significant technical moats. The core concept can be replicated with modern tools and frameworks.`;
    alternativeApproach = `Build a focused niche version targeting an underserved segment. Start with manual processes, then automate.`;
  } else if (score >= 3) {
    verdict = 'MODERATE CHALLENGE';
    reasoning = `While the core idea is approachable, building a competitive product requires specific domain expertise or technical capabilities.`;
    alternativeApproach = `Consider building a simpler version focused on a specific vertical or geography. Differentiate through customer service or specialized features.`;
  } else {
    verdict = 'DIFFICULT TO COPY';
    reasoning = `This startup likely has significant moats: proprietary technology, regulatory requirements, or deep expertise that makes replication challenging.`;
    alternativeApproach = `Look for adjacent opportunities or simpler problems in the same space. Consider partnership or acquisition paths instead.`;
  }

  return {
    copyabilityScore: score,
    verdict: verdict,
    reasoning: reasoning,
    alternativeApproach: alternativeApproach
  };
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 BR Sniper - Starting funded startups fetch...\n');

  // Load existing data
  const dataPath = path.join(__dirname, '../data/funded-startups.json');
  let data;

  try {
    data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  } catch (e) {
    data = {
      lastUpdated: new Date().toISOString().split('T')[0],
      sources: FUNDING_SOURCES.map(s => ({ id: s.id, name: s.name })),
      startups: []
    };
  }

  const existingUrls = new Set(data.startups.map(s => s.articleUrl));
  const newStartups = [];
  const today = new Date().toISOString().split('T')[0];
  // Lookback to Jan 1, 2025
  const lookbackDate = new Date('2025-01-01').getTime();

  // Fetch from all sources
  for (const source of FUNDING_SOURCES) {
    console.log(`📡 Fetching from ${source.name}...`);

    for (const feed of source.feeds) {
      const items = await parseRSSFeed(feed.url);
      console.log(`   Found ${items.length} articles in ${feed.category} feed`);

      for (const item of items) {
        // Skip if already exists
        if (existingUrls.has(item.url)) {
          continue;
        }

        // Skip if not a funding article
        if (!isFundingArticle(item.title, item.description)) {
          continue;
        }

        // Skip if older than lookback date (Jan 1, 2025)
        if (item.pubDate.getTime() < lookbackDate) {
          continue;
        }

        // Extract funding details
        const amount = extractFundingAmount(item.title, item.description);

        // Skip if can't extract amount or below minimum
        if (!amount || amount < 250000) {
          continue;
        }

        const companyName = extractCompanyName(item.title);
        const fundingRound = extractFundingRound(item.title, item.description);
        const industry = determineIndustry(item.title, item.description);
        const investors = extractInvestors(item.description);
        const analysis = generateCopyabilityAnalysis(industry, fundingRound, amount, item.description);

        const startup = {
          id: `funded-${source.id}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          companyName: companyName,
          fundingRound: fundingRound,
          amountRaised: amount,
          currency: 'USD',
          announcedDate: item.pubDate.toISOString().split('T')[0],
          source: source.id,
          articleUrl: item.url,
          investors: investors.length > 0 ? investors : [{ name: 'Undisclosed', type: 'Unknown', lead: false }],
          industry: industry,
          headquarters: 'Unknown',
          description: item.description.slice(0, 400) + (item.description.length > 400 ? '...' : ''),
          whyFunded: [
            `Growing ${industry} market opportunity`,
            `Raised ${fundingRound} round successfully`
          ],
          usps: [
            `${industry} focused solution`,
            `Recent funding validates market fit`
          ],
          analysis: analysis,
          dateAdded: today
        };

        newStartups.push(startup);
        existingUrls.add(item.url);
      }
    }
  }

  // Add new startups to data
  if (newStartups.length > 0) {
    data.startups = [...newStartups, ...data.startups];
    data.lastUpdated = today;

    // Write updated data
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    console.log(`\n✅ Added ${newStartups.length} new funded startups`);
  } else {
    console.log('\n📭 No new funded startups matching criteria found');
  }

  // Create digest for funded startups
  const digest = {
    date: today,
    newStartups: newStartups.map(s => ({
      company: s.companyName,
      amount: `$${(s.amountRaised / 1000000).toFixed(1)}M`,
      round: s.fundingRound,
      industry: s.industry,
      copyability: s.analysis.copyabilityScore
    }))
  };

  const digestPath = path.join(__dirname, '../data/funded-digest.json');
  fs.writeFileSync(digestPath, JSON.stringify(digest, null, 2));
  console.log('📋 Funding digest created');

  console.log('\n🎯 Done!');
}

main().catch(console.error);
