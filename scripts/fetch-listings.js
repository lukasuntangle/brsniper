/**
 * BR Sniper - Automated Listings Fetcher
 * Fetches new listings from RSS feeds and generates a digest
 */

const fs = require('fs');
const path = require('path');
const { ListingSchema, ListingsDataSchema } = require('./schemas');

const EMPIRE_FLIPPERS_API = 'https://api.empireflippers.com/api/v1/listings/list';
const EMPIRE_FLIPPERS_RATE_LIMIT_MS = 1100;

const FETCH_TIMEOUT = 30000;
const MAX_RETRIES = 3;

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
      },
      {
        url: 'https://flippa.com/search.rss?filter[property_type]=app',
        category: 'App'
      },
      {
        url: 'https://flippa.com/search.rss?filter[property_type]=website&filter[sitetype]=blog',
        category: 'Content'
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
 * Fetch with timeout and retry
 */
async function fetchWithRetry(url, options = {}, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      if (attempt === retries) throw error;
      const delay = attempt * 2000;
      process.stderr.write(`  Retry ${attempt}/${retries} for ${url} in ${delay}ms\n`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Simple RSS parser (no external dependencies)
 */
async function parseRSSFeed(url) {
  try {
    const response = await fetchWithRetry(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BRSniper/1.0; +https://github.com/brsniper)'
      }
    });

    if (!response.ok) {
      process.stderr.write(`Failed to fetch ${url}: ${response.status}\n`);
      return [];
    }

    const xml = await response.text();
    const items = [];

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
    process.stderr.write(`Error parsing RSS feed ${url}: ${error.message}\n`);
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
    .replace(/<[^>]*>/g, '');
}

/**
 * Extract financial info from listing description
 */
function extractFinancials(description, title) {
  const financials = {};

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
 * Extract asking price from description/title
 */
function extractAskingPrice(description, title) {
  const text = `${title} ${description}`;

  const patterns = [
    /asking\s*(?:price)?[:\s]*\$([0-9,]+)/i,
    /listed?\s*(?:at|for)[:\s]*\$([0-9,]+)/i,
    /\$([0-9,]+)\s*asking/i,
    /price[:\s]*\$([0-9,]+)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return parseInt(match[1].replace(/,/g, ''));
    }
  }

  return undefined;
}

/**
 * Fetch listings from Empire Flippers public API
 */
async function fetchEmpireFlippers() {
  try {
    process.stdout.write('Fetching from Empire Flippers API...\n');

    const response = await fetchWithRetry(EMPIRE_FLIPPERS_API, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BRSniper/1.0; +https://github.com/brsniper)',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      process.stderr.write(`Empire Flippers API returned ${response.status}\n`);
      return [];
    }

    const json = await response.json();
    const listings = json.listings || json.data || json || [];

    if (!Array.isArray(listings)) {
      process.stderr.write('Empire Flippers API returned unexpected format\n');
      return [];
    }

    process.stdout.write(`   Found ${listings.length} Empire Flippers listings\n`);

    return listings.map(item => {
      const title = item.title || item.niche || 'Empire Flippers Listing';
      const monetization = (item.monetization || item.monetization_type || '').toLowerCase();
      const description = item.description || item.summary || '';

      let category = 'Other';
      if (monetization.includes('saas') || monetization.includes('software')) category = 'SaaS';
      else if (monetization.includes('ecommerce') || monetization.includes('amazon') || monetization.includes('fba')) category = 'E-commerce';
      else if (monetization.includes('content') || monetization.includes('display') || monetization.includes('adsense')) category = 'Content';
      else if (monetization.includes('service') || monetization.includes('agency')) category = 'Agency';
      else category = determineCategory(title, description);

      const revenue = item.monthly_revenue
        ? item.monthly_revenue * 12
        : item.annual_revenue || item.revenue || null;

      const askingPrice = item.listing_price || item.price || item.asking_price || undefined;
      const businessAge = item.months_old
        ? (item.months_old >= 12 ? `${Math.floor(item.months_old / 12)} years` : `${item.months_old} months`)
        : item.age || undefined;
      const country = item.country || item.location || undefined;

      return {
        title,
        url: item.url || `https://empireflippers.com/listing/${item.id || item.listing_id || ''}`,
        description: (description || '').slice(0, 300) + ((description || '').length > 300 ? '...' : ''),
        category,
        revenue,
        askingPrice,
        businessAge,
        country,
        pubDate: item.created_at ? new Date(item.created_at) : new Date()
      };
    }).filter(item => item.revenue && item.revenue > 0);
  } catch (error) {
    process.stderr.write(`Error fetching Empire Flippers: ${error.message}\n`);
    return [];
  }
}

/**
 * Main function
 */
async function main() {
  process.stdout.write('BR Sniper - Starting listings fetch...\n\n');

  // Load existing listings
  const dataPath = path.join(__dirname, '../data/listings.json');
  let data;
  try {
    const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    data = ListingsDataSchema.parse(rawData);
  } catch (e) {
    process.stderr.write(`Warning: listings.json validation failed, using raw data: ${e.message}\n`);
    data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  }
  const existingUrls = new Set(data.listings.map(l => l.url));

  const newListings = [];
  const today = new Date().toISOString().split('T')[0];

  // Fetch RSS feeds
  for (const source of RSS_FEEDS) {
    process.stdout.write(`Fetching from ${source.name}...\n`);

    for (const feed of source.feeds) {
      const items = await parseRSSFeed(feed.url);
      process.stdout.write(`   Found ${items.length} items in ${feed.category} feed\n`);

      for (const item of items) {
        if (existingUrls.has(item.url)) {
          continue;
        }

        const daysSincePublished = (Date.now() - item.pubDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSincePublished > 7) {
          continue;
        }

        const financials = extractFinancials(item.description, item.title);

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

        const validated = ListingSchema.safeParse(listing);
        if (!validated.success) {
          process.stderr.write(`   Skipping invalid listing: ${validated.error.issues[0].message}\n`);
          continue;
        }
        newListings.push(validated.data);
        existingUrls.add(item.url);
      }
    }
  }

  // Fetch Empire Flippers API
  const efListings = await fetchEmpireFlippers();
  for (const item of efListings) {
    if (existingUrls.has(item.url)) {
      continue;
    }

    const daysSincePublished = (Date.now() - item.pubDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSincePublished > 30) {
      continue;
    }

    const listing = {
      id: `empire-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      source: 'empire',
      title: item.title,
      url: item.url,
      category: item.category,
      description: item.description,
      financials: { revenue: item.revenue },
      askingPrice: item.askingPrice,
      businessAge: item.businessAge,
      country: item.country,
      location: item.country || 'Global',
      highlights: [],
      analysis: {
        verdict: 'NEW - NEEDS REVIEW',
        uspCopyable: 'To be evaluated',
        reasoning: 'Auto-imported from Empire Flippers API. Manual review needed.',
        risks: ['Not yet evaluated'],
        opportunity: 'Pending analysis'
      },
      businessModel: item.category,
      onlineOnly: true,
      dateAdded: today
    };

    const validated = ListingSchema.safeParse(listing);
    if (!validated.success) {
      process.stderr.write(`   Skipping invalid EF listing: ${validated.error.issues[0].message}\n`);
      continue;
    }
    newListings.push(validated.data);
    existingUrls.add(item.url);
  }

  if (newListings.length > 0) {
    data.listings = [...newListings, ...data.listings];
    process.stdout.write(`\nAdded ${newListings.length} new listings\n`);
  } else {
    process.stdout.write('\nNo new listings with revenue data found\n');
  }

  // Always update lastUpdated so the frontend shows today's date
  data.lastUpdated = today;
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

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
  process.stdout.write('Digest created\n');

  process.stdout.write('\nDone! Check data/digest.json for manual review links.\n');
}

// Exports for testing
module.exports = { parseRSSFeed, extractTag, decodeHTMLEntities, extractFinancials, determineCategory, extractAskingPrice, fetchEmpireFlippers };

if (require.main === module) {
  main().catch(err => { process.stderr.write(err.message + '\n'); process.exit(1); });
}
