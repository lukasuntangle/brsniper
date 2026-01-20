/**
 * BR Sniper - Automated Listings Fetcher
 * Fetches new listings from RSS feeds and generates a digest
 */

const fs = require('fs');
const path = require('path');

// RSS Feed URLs for platforms that support them
const RSS_FEEDS = [
  {
    id: 'flippa',
    name: 'Flippa',
    feeds: [
      {
        url: 'https://flippa.com/search.rss?filter%5Bproperty_type%5D=website&filter%5Bsitetype%5D=saas',
        category: 'SaaS'
      },
      {
        url: 'https://flippa.com/search.rss?filter%5Bproperty_type%5D=website&filter%5Bsitetype%5D=ecommerce',
        category: 'E-commerce'
      }
    ]
  }
];

// Links for manual review (platforms without RSS/API)
const MANUAL_REVIEW_LINKS = [
  {
    name: 'Acquire.com - SaaS',
    url: 'https://acquire.com/saas-companies-for-sale/'
  },
  {
    name: 'Acquire.com - E-commerce',
    url: 'https://acquire.com/ecommerce-businesses-for-sale/'
  },
  {
    name: 'Empire Flippers - Marketplace',
    url: 'https://empireflippers.com/marketplace/'
  },
  {
    name: 'Microns.io - Listings',
    url: 'https://www.microns.io/startup-listings'
  },
  {
    name: 'Brookz.nl - E-commerce',
    url: 'https://www.brookz.nl/bedrijven-te-koop/e-commerce'
  },
  {
    name: 'Brookz.nl - SaaS',
    url: 'https://www.brookz.nl/bedrijven-te-koop/saas-bedrijven'
  },
  {
    name: 'Brookz.nl - Startups',
    url: 'https://www.brookz.nl/bedrijven-te-koop/startup'
  }
];

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
 * Extract financial info from listing description
 */
function extractFinancials(description, title) {
  const financials = {};

  // Try to extract revenue/price patterns
  const revenuePatterns = [
    /\$([0-9,]+)\s*(?:\/\s*mo|monthly|MRR)/i,
    /([0-9,]+)\s*(?:USD|EUR|€|\$)\s*(?:revenue|annual)/i,
    /revenue[:\s]*\$?([0-9,]+)/i
  ];

  for (const pattern of revenuePatterns) {
    const match = description.match(pattern) || title.match(pattern);
    if (match) {
      const amount = parseInt(match[1].replace(/,/g, ''));
      if (amount > 0) {
        // Assume monthly if small, annual if large
        financials.revenue = amount < 50000 ? amount * 12 : amount;
        break;
      }
    }
  }

  return financials;
}

/**
 * Determine category from title/description
 */
function determineCategory(title, description) {
  const text = `${title} ${description}`.toLowerCase();

  if (text.includes('saas') || text.includes('software') || text.includes('subscription')) {
    return 'SaaS';
  }
  if (text.includes('ecommerce') || text.includes('e-commerce') || text.includes('shopify') || text.includes('amazon')) {
    return 'E-commerce';
  }
  if (text.includes('content') || text.includes('blog') || text.includes('affiliate')) {
    return 'Content';
  }
  if (text.includes('agency') || text.includes('service')) {
    return 'Agency';
  }

  return 'Other';
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 BR Sniper - Starting listings fetch...\n');

  // Load existing listings
  const dataPath = path.join(__dirname, '../data/listings.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const existingUrls = new Set(data.listings.map(l => l.url));

  const newListings = [];
  const today = new Date().toISOString().split('T')[0];

  // Fetch RSS feeds
  for (const source of RSS_FEEDS) {
    console.log(`📡 Fetching from ${source.name}...`);

    for (const feed of source.feeds) {
      const items = await parseRSSFeed(feed.url);
      console.log(`   Found ${items.length} items in ${feed.category} feed`);

      for (const item of items) {
        // Skip if already exists
        if (existingUrls.has(item.url)) {
          continue;
        }

        // Only include recent listings (last 7 days)
        const daysSincePublished = (Date.now() - item.pubDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSincePublished > 7) {
          continue;
        }

        const financials = extractFinancials(item.description, item.title);

        // Only add if we can extract some revenue info
        if (!financials.revenue) {
          continue;
        }

        const category = feed.category || determineCategory(item.title, item.description);

        const listing = {
          id: `${source.id}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          source: source.id,
          title: item.title,
          url: item.url,
          category: category,
          description: item.description.slice(0, 300) + (item.description.length > 300 ? '...' : ''),
          financials: financials,
          location: 'Global',
          highlights: [],
          analysis: {
            verdict: 'NEW - NEEDS REVIEW',
            uspCopyable: 'To be evaluated',
            reasoning: 'Auto-imported from RSS feed. Manual review needed to assess opportunity.',
            risks: ['Not yet evaluated'],
            opportunity: 'Pending analysis'
          },
          businessModel: category,
          onlineOnly: true,
          dateAdded: today
        };

        newListings.push(listing);
        existingUrls.add(item.url);
      }
    }
  }

  // Add new listings to data
  if (newListings.length > 0) {
    data.listings = [...newListings, ...data.listings];
    data.lastUpdated = today;

    // Write updated listings
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    console.log(`\n✅ Added ${newListings.length} new listings`);
  } else {
    console.log('\n📭 No new listings with revenue data found');
  }

  // Create digest
  const digest = {
    date: today,
    newListings: newListings.map(l => ({
      title: l.title,
      source: l.source,
      revenue: l.financials.revenue ? `$${(l.financials.revenue / 1000).toFixed(0)}K` : null,
      url: l.url
    })),
    manualReviewLinks: MANUAL_REVIEW_LINKS
  };

  const digestPath = path.join(__dirname, '../data/digest.json');
  fs.writeFileSync(digestPath, JSON.stringify(digest, null, 2));
  console.log('📋 Digest created');

  console.log('\n🎯 Done! Check data/digest.json for manual review links.');
}

main().catch(console.error);
