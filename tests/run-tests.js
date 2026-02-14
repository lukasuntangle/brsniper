/**
 * BR Sniper - Comprehensive Test Suite
 * Tests parser functions, Zod schemas, HTML structure, CSS, and edge cases
 */

const fs = require('fs');
const path = require('path');

// Import actual functions from fetch scripts
const {
  extractTag, decodeHTMLEntities, extractFinancials, determineCategory, extractAskingPrice
} = require('../scripts/fetch-listings');

const {
  isFundingArticle, extractFundingAmount, extractFundingRound,
  extractCompanyName, determineIndustry, extractInvestors,
  generateCopyabilityAnalysis, extractTag: extractTagFunded,
  decodeHTMLEntities: decodeHTMLEntitiesFunded
} = require('../scripts/fetch-funded-startups');

// Import Zod schemas
const {
  ListingSchema, ListingsDataSchema, StartupSchema, FundedDataSchema,
  RSSItemSchema, FinancialsSchema, AnalysisSchema,
  CopyabilityAnalysisSchema, InvestorSchema, SourceSchema
} = require('../scripts/schemas');

// Test results
let passed = 0;
let failed = 0;
const failures = [];

// Test utilities
function assert(condition, message) {
  if (condition) {
    passed++;
    process.stdout.write(`  \u2713 ${message}\n`);
  } else {
    failed++;
    failures.push(message);
    process.stdout.write(`  \u2717 ${message}\n`);
  }
}

function assertEqual(actual, expected, message) {
  const isEqual = JSON.stringify(actual) === JSON.stringify(expected);
  if (isEqual) {
    passed++;
    process.stdout.write(`  \u2713 ${message}\n`);
  } else {
    failed++;
    failures.push(`${message} (expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)})`);
    process.stdout.write(`  \u2717 ${message}\n`);
    process.stdout.write(`    Expected: ${JSON.stringify(expected)}\n`);
    process.stdout.write(`    Got: ${JSON.stringify(actual)}\n`);
  }
}

function assertInRange(value, min, max, message) {
  if (value >= min && value <= max) {
    passed++;
    process.stdout.write(`  \u2713 ${message}\n`);
  } else {
    failed++;
    failures.push(`${message} (value ${value} not in range ${min}-${max})`);
    process.stdout.write(`  \u2717 ${message} (value ${value} not in range ${min}-${max})\n`);
  }
}

// ========================================
// Test: extractTag (fetch-listings.js)
// ========================================
process.stdout.write('\nTesting extractTag...\n\n');

assertEqual(
  extractTag('<title>Hello World</title>', 'title'),
  'Hello World',
  'Extracts simple tag'
);

assertEqual(
  extractTag('<title><![CDATA[Hello World]]></title>', 'title'),
  'Hello World',
  'Extracts CDATA-wrapped tag'
);

assertEqual(
  extractTag('<description>Some &amp; text</description>', 'description'),
  'Some &amp; text',
  'Extracts tag with entities (raw)'
);

assertEqual(
  extractTag('<item>no title here</item>', 'title'),
  null,
  'Returns null when tag not found'
);

assertEqual(
  extractTag('', 'title'),
  null,
  'Returns null for empty XML'
);

assertEqual(
  extractTag('<title>  spaced  </title>', 'title'),
  'spaced',
  'Trims whitespace from extracted value'
);

assertEqual(
  extractTag('<link rel="alternate">https://example.com</link>', 'link'),
  'https://example.com',
  'Handles tags with attributes'
);

// ========================================
// Test: decodeHTMLEntities (fetch-listings.js)
// ========================================
process.stdout.write('\nTesting decodeHTMLEntities...\n\n');

assertEqual(decodeHTMLEntities('&amp;'), '&', 'Decodes &amp;');
assertEqual(decodeHTMLEntities('&lt;'), '<', 'Decodes &lt;');
assertEqual(decodeHTMLEntities('&gt;'), '>', 'Decodes &gt;');
assertEqual(decodeHTMLEntities('&quot;'), '"', 'Decodes &quot;');
assertEqual(decodeHTMLEntities('&#39;'), "'", 'Decodes &#39;');
assertEqual(decodeHTMLEntities('Hello &amp; World'), 'Hello & World', 'Decodes in context');
assertEqual(decodeHTMLEntities('No entities here'), 'No entities here', 'Passes through plain text');
assertEqual(decodeHTMLEntities('<p>HTML</p>'), 'HTML', 'Strips HTML tags');
assertEqual(decodeHTMLEntities('<a href="x">link</a> text'), 'link text', 'Strips complex HTML tags');
assertEqual(decodeHTMLEntities(''), '', 'Handles empty string');
// Note: &lt; and &gt; decode to < and > which then get stripped by the HTML tag regex
assertEqual(
  decodeHTMLEntities('&amp; &quot; &#39;'),
  '& " \'',
  'Decodes amp, quot, and apos entities together'
);

// ========================================
// Test: extractFinancials (fetch-listings.js)
// ========================================
process.stdout.write('\nTesting extractFinancials...\n\n');

assertEqual(
  extractFinancials('revenue $5,000/mo', '').revenue,
  60000,
  'Extracts monthly revenue and annualizes'
);

assertEqual(
  extractFinancials('$10,000/mo MRR', '').revenue,
  120000,
  'Extracts MRR format ($X/mo) and annualizes'
);

assertEqual(
  extractFinancials('revenue: $100,000', '').revenue,
  100000,
  'Extracts "revenue: $X" format'
);

assertEqual(
  extractFinancials('No financial data', 'nothing').revenue,
  undefined,
  'Returns undefined when no revenue found'
);

assertEqual(
  extractFinancials('', 'revenue: $3,500').revenue,
  42000,
  'Extracts revenue from description field'
);

assertEqual(
  extractFinancials('SaaS with $500/mo revenue', '').revenue,
  6000,
  'Handles small monthly amounts'
);

// ========================================
// Test: determineCategory (fetch-listings.js)
// ========================================
process.stdout.write('\nTesting determineCategory...\n\n');

assertEqual(determineCategory('SaaS Business', ''), 'SaaS', 'Detects SaaS from title');
assertEqual(determineCategory('', 'subscription software'), 'SaaS', 'Detects SaaS from description keywords');
assertEqual(determineCategory('Shopify Store', ''), 'E-commerce', 'Detects E-commerce from Shopify');
assertEqual(determineCategory('', 'amazon FBA business'), 'E-commerce', 'Detects E-commerce from Amazon');
assertEqual(determineCategory('Content Blog', ''), 'Content', 'Detects Content from title');
assertEqual(determineCategory('', 'affiliate marketing blog'), 'Content', 'Detects Content from affiliate keyword');
assertEqual(determineCategory('Digital Agency', ''), 'Agency', 'Detects Agency');
assertEqual(determineCategory('', 'service provider'), 'Agency', 'Detects Agency from service keyword');
assertEqual(determineCategory('Random Business', 'no keywords'), 'Other', 'Falls back to Other');
assertEqual(determineCategory('', ''), 'Other', 'Empty inputs return Other');

// ========================================
// Test: isFundingArticle (fetch-funded-startups.js)
// ========================================
process.stdout.write('\nTesting isFundingArticle...\n\n');

assert(isFundingArticle('Acme raises $10M', ''), 'Detects "raises" keyword');
assert(isFundingArticle('Series A for startup', ''), 'Detects "Series A" keyword');
assert(isFundingArticle('', 'seed round funding'), 'Detects "seed" and "funding" from description');
assert(isFundingArticle('Company secures investment', ''), 'Detects "secures" and "investment"');
assert(isFundingArticle('Led by Sequoia Capital', ''), 'Detects "led by" and "capital"');
assert(!isFundingArticle('New product launch', 'Tech review'), 'Rejects non-funding articles');
assert(!isFundingArticle('', ''), 'Rejects empty input');
assert(isFundingArticle('Startup closes $50 million round', ''), 'Detects "closes", "million", "round"');

// ========================================
// Test: extractFundingAmount (fetch-funded-startups.js)
// ========================================
process.stdout.write('\nTesting extractFundingAmount...\n\n');

assertEqual(extractFundingAmount('Acme raises $10 million', ''), 10000000, 'Extracts "$X million" format');
assertEqual(extractFundingAmount('Startup secures $5M funding', ''), 5000000, 'Extracts "$XM" format');
assertEqual(extractFundingAmount('Company raises $1.5 billion', ''), 1500000000, 'Extracts billion format');
assertEqual(extractFundingAmount('', '$25m Series A'), 25000000, 'Extracts from description');
assertEqual(extractFundingAmount('No funding info here', 'Nothing to see'), null, 'Returns null when no amount found');
assertEqual(extractFundingAmount('raises $2.5M in seed', ''), 2500000, 'Extracts decimal millions');
assertEqual(extractFundingAmount('', ''), null, 'Returns null for empty input');
assertEqual(
  extractFundingAmount('10 million dollars raised', ''),
  10000000,
  'Extracts "X million dollars" format'
);

// ========================================
// Test: extractFundingRound (fetch-funded-startups.js)
// ========================================
process.stdout.write('\nTesting extractFundingRound...\n\n');

assertEqual(extractFundingRound('Acme closes Series A', ''), 'Series A', 'Extracts Series A');
assertEqual(extractFundingRound('Series B round', ''), 'Series B', 'Extracts Series B');
assertEqual(extractFundingRound('Series C funding', ''), 'Series C', 'Extracts Series C');
assertEqual(extractFundingRound('Series D mega-round', ''), 'Series D+', 'Extracts Series D+');
assertEqual(extractFundingRound('Series E expansion', ''), 'Series D+', 'Maps Series E to Series D+');
assertEqual(extractFundingRound('Startup raises seed round', ''), 'Seed', 'Extracts Seed');
assertEqual(extractFundingRound('Company gets pre-seed funding', ''), 'Pre-Seed', 'Extracts Pre-Seed');
assertEqual(extractFundingRound('Bridge round completed', ''), 'Bridge', 'Extracts Bridge');
assertEqual(extractFundingRound('Growth equity investment', ''), 'Growth', 'Extracts Growth');
assertEqual(extractFundingRound('No round info', ''), 'Unknown', 'Returns Unknown when not found');
assertEqual(extractFundingRound('', ''), 'Unknown', 'Empty input returns Unknown');
// Pre-Seed should match before Seed
assertEqual(extractFundingRound('pre-seed round for startup', ''), 'Pre-Seed', 'Pre-Seed matched before Seed');

// ========================================
// Test: extractCompanyName (fetch-funded-startups.js)
// ========================================
process.stdout.write('\nTesting extractCompanyName...\n\n');

assertEqual(extractCompanyName('Acme raises $10M'), 'Acme', 'Extracts name before "raises"');
assertEqual(extractCompanyName('TechCorp secures funding'), 'TechCorp', 'Extracts name before "secures"');
assertEqual(extractCompanyName('DataFlow closes Series A'), 'DataFlow', 'Extracts name before "closes"');
assertEqual(extractCompanyName('HealthAI gets $5M investment'), 'HealthAI', 'Extracts name before "gets"');
assert(extractCompanyName('No pattern match here').length > 0, 'Falls back to non-empty name');
assert(extractCompanyName('Random Title').length > 0, 'Always returns something');

// ========================================
// Test: determineIndustry (fetch-funded-startups.js)
// ========================================
process.stdout.write('\nTesting determineIndustry...\n\n');

assertEqual(determineIndustry('AI startup raises funding', ''), 'AI/ML', 'Classifies AI');
assertEqual(determineIndustry('', 'machine learning platform'), 'AI/ML', 'Classifies ML');
assertEqual(determineIndustry('', 'LLM infrastructure'), 'AI/ML', 'Classifies LLM');
assertEqual(determineIndustry('Fintech payment processor', ''), 'Fintech', 'Classifies Fintech');
assertEqual(determineIndustry('', 'crypto exchange'), 'Fintech', 'Classifies crypto as Fintech');
assertEqual(determineIndustry('Healthcare platform', ''), 'Healthcare', 'Classifies Healthcare');
assertEqual(determineIndustry('', 'biotech research'), 'Healthcare', 'Classifies biotech as Healthcare');
assertEqual(determineIndustry('SaaS tool', ''), 'SaaS', 'Classifies SaaS');
assertEqual(determineIndustry('', 'enterprise cloud'), 'SaaS', 'Classifies enterprise cloud as SaaS');
assertEqual(determineIndustry('E-commerce marketplace', ''), 'E-commerce', 'Classifies E-commerce');
assertEqual(determineIndustry('Cybersecurity threat detection', ''), 'Cybersecurity', 'Classifies Cybersecurity');
assertEqual(determineIndustry('Climate tech startup', ''), 'Climate', 'Classifies Climate');
assertEqual(determineIndustry('', 'developer tools'), 'Developer Tools', 'Classifies Developer Tools');
assertEqual(determineIndustry('Random company', ''), 'Other', 'Falls back to Other');
assertEqual(determineIndustry('', ''), 'Other', 'Empty input returns Other');

// ========================================
// Test: extractInvestors (fetch-funded-startups.js)
// ========================================
process.stdout.write('\nTesting extractInvestors...\n\n');

{
  const result = extractInvestors('led by Sequoia Capital, with participation');
  assert(result.length > 0, 'Extracts investors from "led by" pattern');
  assertEqual(result[0].lead, true, 'First investor is marked as lead');
  assertEqual(result[0].type, 'VC', 'Investor type is VC');
}

{
  const result = extractInvestors('backed by Andreessen Horowitz, and others.');
  assert(result.length > 0, 'Extracts investors from "backed by" pattern');
}

{
  const result = extractInvestors('No investor info here');
  assertEqual(result.length, 0, 'Returns empty array when no investors found');
}

{
  const result = extractInvestors('');
  assertEqual(result.length, 0, 'Returns empty array for empty input');
}

// ========================================
// Test: generateCopyabilityAnalysis (fetch-funded-startups.js)
// ========================================
process.stdout.write('\nTesting generateCopyabilityAnalysis...\n\n');

{
  const result = generateCopyabilityAnalysis('SaaS', 'Seed', 2000000, 'SaaS platform for workflow automation');
  assertInRange(result.copyabilityScore, 4, 5, 'SaaS seed stage = high copyability');
  assertEqual(result.verdict, 'EASY TO REPLICATE', 'High score verdict is EASY TO REPLICATE');
  assert(result.reasoning.length > 0, 'Has reasoning text');
  assert(result.alternativeApproach.length > 0, 'Has alternative approach');
}

{
  const result = generateCopyabilityAnalysis('Healthcare', 'Series C', 80000000, 'Proprietary regulated medical device with FDA approval');
  assertInRange(result.copyabilityScore, 1, 1, 'Proprietary regulated medical = minimum copyability');
  assertEqual(result.verdict, 'DIFFICULT TO COPY', 'Low score verdict is DIFFICULT TO COPY');
}

{
  const result = generateCopyabilityAnalysis('Fintech', 'Series A', 15000000, 'Payment processing API for businesses');
  assertInRange(result.copyabilityScore, 2, 4, 'Fintech API Series A = moderate copyability');
}

{
  const result = generateCopyabilityAnalysis('Other', 'Unknown', 3000000, 'Simple dashboard tool');
  assertInRange(result.copyabilityScore, 3, 5, 'Simple dashboard with low funding = moderate-high');
}

// Edge: very high funding reduces score
{
  const result = generateCopyabilityAnalysis('SaaS', 'Growth', 200000000, 'Enterprise platform');
  assertInRange(result.copyabilityScore, 1, 3, 'Very high funding + Growth round reduces score');
}

// Score is always clamped 1-5
{
  const result = generateCopyabilityAnalysis('Healthcare', 'Series D+', 500000000, 'Patent proprietary regulated hardware biotech clinical FDA deep tech');
  assertInRange(result.copyabilityScore, 1, 5, 'Score is clamped to 1-5 range');
  assert(result.copyabilityScore >= 1, 'Score never below 1');
}

{
  const result = generateCopyabilityAnalysis('SaaS', 'Pre-Seed', 500000, 'marketplace platform saas api app automation dashboard workflow');
  assertInRange(result.copyabilityScore, 1, 5, 'Score with many easy factors clamped to max 5');
  assert(result.copyabilityScore <= 5, 'Score never above 5');
}

// ========================================
// Test: Zod Schemas — Valid Data
// ========================================
process.stdout.write('\nTesting Zod Schemas (valid data)...\n\n');

{
  const result = FinancialsSchema.safeParse({ revenue: 50000 });
  assert(result.success, 'FinancialsSchema accepts valid minimal data');
}

{
  const result = FinancialsSchema.safeParse({ revenue: 50000, ebitda: 20000, mrr: 4000, recurringRevenue: 80 });
  assert(result.success, 'FinancialsSchema accepts full data');
}

{
  const result = AnalysisSchema.safeParse({ verdict: 'GOOD BUY' });
  assert(result.success, 'AnalysisSchema accepts minimal data');
}

{
  const result = AnalysisSchema.safeParse({
    verdict: 'GOOD BUY', uspCopyable: 'Yes', reasoning: 'test', risks: ['risk1'], opportunity: 'high'
  });
  assert(result.success, 'AnalysisSchema accepts full data');
}

{
  const result = InvestorSchema.safeParse({ name: 'Sequoia', type: 'VC', lead: true });
  assert(result.success, 'InvestorSchema accepts valid data');
}

{
  const result = SourceSchema.safeParse({ id: 'flippa', name: 'Flippa' });
  assert(result.success, 'SourceSchema accepts minimal data');
}

{
  const result = CopyabilityAnalysisSchema.safeParse({
    copyabilityScore: 4, verdict: 'EASY TO REPLICATE', reasoning: 'Low moat'
  });
  assert(result.success, 'CopyabilityAnalysisSchema accepts valid data');
}

{
  const result = ListingSchema.safeParse({
    id: 'test-1', source: 'flippa', title: 'Test Listing', url: 'https://example.com',
    category: 'SaaS', description: 'A test listing', financials: { revenue: 50000 },
    analysis: { verdict: 'GOOD' }, dateAdded: '2025-01-01'
  });
  assert(result.success, 'ListingSchema accepts valid listing');
}

{
  const result = StartupSchema.safeParse({
    id: 'funded-1', companyName: 'TestCo', fundingRound: 'Series A',
    amountRaised: 5000000, source: 'techcrunch', articleUrl: 'https://techcrunch.com/article',
    investors: [{ name: 'Sequoia', type: 'VC', lead: true }],
    industry: 'SaaS', description: 'A test startup',
    whyFunded: ['Market opportunity'], usps: ['Unique platform'],
    analysis: { copyabilityScore: 3, verdict: 'MODERATE', reasoning: 'Medium moat' }
  });
  assert(result.success, 'StartupSchema accepts valid startup');
}

// ========================================
// Test: Zod Schemas — Invalid Data
// ========================================
process.stdout.write('\nTesting Zod Schemas (invalid data)...\n\n');

{
  const result = FinancialsSchema.safeParse({ revenue: -100 });
  assert(!result.success, 'FinancialsSchema rejects negative revenue');
}

{
  const result = FinancialsSchema.safeParse({ revenue: 'not a number' });
  assert(!result.success, 'FinancialsSchema rejects string revenue');
}

{
  const result = FinancialsSchema.safeParse({});
  assert(!result.success, 'FinancialsSchema rejects missing revenue');
}

{
  const result = FinancialsSchema.safeParse({ revenue: 1000, recurringRevenue: 150 });
  assert(!result.success, 'FinancialsSchema rejects recurringRevenue > 100');
}

{
  const result = AnalysisSchema.safeParse({ verdict: '' });
  assert(!result.success, 'AnalysisSchema rejects empty verdict');
}

{
  const result = AnalysisSchema.safeParse({});
  assert(!result.success, 'AnalysisSchema rejects missing verdict');
}

{
  const result = InvestorSchema.safeParse({ name: '', type: 'VC', lead: true });
  assert(!result.success, 'InvestorSchema rejects empty name');
}

{
  const result = InvestorSchema.safeParse({ name: 'Test' });
  assert(!result.success, 'InvestorSchema rejects missing required fields');
}

{
  const result = ListingSchema.safeParse({ id: 'test', source: 'x' });
  assert(!result.success, 'ListingSchema rejects incomplete data');
}

{
  const result = ListingSchema.safeParse({
    id: 'test', source: 'flippa', title: 'Test', url: 'not-a-url',
    category: 'SaaS', description: 'x', financials: { revenue: 1000 },
    analysis: { verdict: 'ok' }, dateAdded: '2025-01-01'
  });
  assert(!result.success, 'ListingSchema rejects invalid URL');
}

{
  const result = StartupSchema.safeParse({
    id: 'test', companyName: 'X', fundingRound: 'Seed',
    amountRaised: 100, source: 'tc', articleUrl: 'https://x.com',
    investors: [{ name: 'A', type: 'VC', lead: true }],
    industry: 'SaaS', description: 'x', whyFunded: ['y'], usps: ['z'],
    analysis: { copyabilityScore: 3, verdict: 'ok', reasoning: 'r' }
  });
  assert(!result.success, 'StartupSchema rejects amountRaised < 250000');
}

{
  const result = StartupSchema.safeParse({
    id: 'test', companyName: 'X', fundingRound: 'Seed',
    amountRaised: 5000000, source: 'tc', articleUrl: 'https://x.com',
    investors: [],
    industry: 'SaaS', description: 'x', whyFunded: ['y'], usps: ['z'],
    analysis: { copyabilityScore: 3, verdict: 'ok', reasoning: 'r' }
  });
  assert(!result.success, 'StartupSchema rejects empty investors array');
}

{
  const result = CopyabilityAnalysisSchema.safeParse({
    copyabilityScore: 0, verdict: 'test', reasoning: 'test'
  });
  assert(!result.success, 'CopyabilityAnalysisSchema rejects score < 1');
}

{
  const result = CopyabilityAnalysisSchema.safeParse({
    copyabilityScore: 6, verdict: 'test', reasoning: 'test'
  });
  assert(!result.success, 'CopyabilityAnalysisSchema rejects score > 5');
}

// ========================================
// Test: Data File Validation with Zod
// ========================================
process.stdout.write('\nTesting Data File Validation...\n\n');

process.stdout.write('Testing listings.json:\n');
try {
  const listingsPath = path.join(__dirname, '../data/listings.json');
  const listingsData = JSON.parse(fs.readFileSync(listingsPath, 'utf8'));

  assert(listingsData.lastUpdated, 'Has lastUpdated field');
  assert(Array.isArray(listingsData.listings), 'Has listings array');
  assert(listingsData.listings.length > 0, 'Has at least one listing');

  let allListingsValid = true;
  for (const listing of listingsData.listings) {
    if (!listing.id || !listing.title || !listing.url || !listing.source) {
      allListingsValid = false;
      break;
    }
    if (!listing.financials || typeof listing.financials.revenue !== 'number') {
      allListingsValid = false;
      break;
    }
  }
  assert(allListingsValid, 'All listings have required fields (id, title, url, source, revenue)');

  const allHaveRevenue = listingsData.listings.every(l => l.financials.revenue > 0);
  assert(allHaveRevenue, 'All listings have revenue > 0');

  const allHaveAnalysis = listingsData.listings.every(l => l.analysis && l.analysis.verdict);
  assert(allHaveAnalysis, 'All listings have strategic analysis');
} catch (error) {
  failed++;
  process.stdout.write(`  \u2717 listings.json validation failed: ${error.message}\n`);
}

process.stdout.write('\nTesting funded-startups.json:\n');
try {
  const fundedPath = path.join(__dirname, '../data/funded-startups.json');
  const fundedData = JSON.parse(fs.readFileSync(fundedPath, 'utf8'));

  assert(fundedData.lastUpdated, 'Has lastUpdated field');
  assert(Array.isArray(fundedData.sources), 'Has sources array');
  assert(Array.isArray(fundedData.startups), 'Has startups array');
  assert(fundedData.startups.length > 0, 'Has at least one startup');

  let allStartupsValid = true;
  for (const startup of fundedData.startups) {
    if (!startup.id || !startup.companyName || !startup.fundingRound) {
      allStartupsValid = false;
      break;
    }
    if (typeof startup.amountRaised !== 'number' || startup.amountRaised < 250000) {
      allStartupsValid = false;
      break;
    }
    if (!startup.analysis || typeof startup.analysis.copyabilityScore !== 'number') {
      allStartupsValid = false;
      break;
    }
  }
  assert(allStartupsValid, 'All startups have required fields and amount >= $250K');

  const allScoresValid = fundedData.startups.every(
    s => s.analysis.copyabilityScore >= 1 && s.analysis.copyabilityScore <= 5
  );
  assert(allScoresValid, 'All copyability scores are between 1-5');

  const allHaveInvestors = fundedData.startups.every(
    s => Array.isArray(s.investors) && s.investors.length > 0
  );
  assert(allHaveInvestors, 'All startups have investors array');
} catch (error) {
  failed++;
  process.stdout.write(`  \u2717 funded-startups.json validation failed: ${error.message}\n`);
}

// ========================================
// Test: HTML Structure
// ========================================
process.stdout.write('\nTesting HTML Structure...\n\n');

process.stdout.write('Testing index.html:\n');
try {
  const indexPath = path.join(__dirname, '../index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf8');

  assert(indexHtml.includes('<!DOCTYPE html>'), 'Has DOCTYPE declaration');
  assert(indexHtml.includes('<title>'), 'Has title tag');
  assert(indexHtml.includes('listings-grid'), 'Has listings grid container');
  assert(indexHtml.includes('source-tabs'), 'Has source tabs');
  assert(indexHtml.includes('href="funded.html"'), 'Has link to funded page');
  assert(indexHtml.includes('js/app.js'), 'Includes app.js');
  // SEO meta tags
  assert(indexHtml.includes('meta name="description"'), 'Has meta description');
  assert(indexHtml.includes('og:title'), 'Has OpenGraph title');
  assert(indexHtml.includes('twitter:card'), 'Has Twitter card');
  assert(indexHtml.includes('rel="canonical"'), 'Has canonical link');
} catch (error) {
  failed++;
  process.stdout.write(`  \u2717 index.html validation failed: ${error.message}\n`);
}

process.stdout.write('\nTesting funded.html:\n');
try {
  const fundedPath = path.join(__dirname, '../funded.html');
  const fundedHtml = fs.readFileSync(fundedPath, 'utf8');

  assert(fundedHtml.includes('<!DOCTYPE html>'), 'Has DOCTYPE declaration');
  assert(fundedHtml.includes('Funded Startups'), 'Has Funded Startups title');
  assert(fundedHtml.includes('startups-grid'), 'Has startups grid container');
  assert(fundedHtml.includes('copyability-filter'), 'Has copyability filter');
  assert(fundedHtml.includes('href="index.html"'), 'Has link to main page');
  assert(fundedHtml.includes('js/funded.js'), 'Includes funded.js');
  assert(fundedHtml.includes('css/funded.css'), 'Includes funded.css');
  // SEO meta tags
  assert(fundedHtml.includes('meta name="description"'), 'Has meta description');
  assert(fundedHtml.includes('og:title'), 'Has OpenGraph title');
  assert(fundedHtml.includes('twitter:card'), 'Has Twitter card');
} catch (error) {
  failed++;
  process.stdout.write(`  \u2717 funded.html validation failed: ${error.message}\n`);
}

// ========================================
// Test: CSS Files
// ========================================
process.stdout.write('\nTesting CSS Files...\n\n');

try {
  const stylesPath = path.join(__dirname, '../css/styles.css');
  const fundedCssPath = path.join(__dirname, '../css/funded.css');

  assert(fs.existsSync(stylesPath), 'styles.css exists');
  assert(fs.existsSync(fundedCssPath), 'funded.css exists');

  const stylesCss = fs.readFileSync(stylesPath, 'utf8');
  assert(stylesCss.includes('.pagination'), 'Has pagination styles');
  assert(stylesCss.includes('.page-btn'), 'Has page button styles');
  assert(stylesCss.includes('.error-state'), 'Has error state styles');

  const fundedCss = fs.readFileSync(fundedCssPath, 'utf8');
  assert(fundedCss.includes('.startup-card'), 'Has startup-card styles');
  assert(fundedCss.includes('.copyability-easy'), 'Has copyability-easy class');
  assert(fundedCss.includes('.copyability-medium'), 'Has copyability-medium class');
  assert(fundedCss.includes('.copyability-hard'), 'Has copyability-hard class');
} catch (error) {
  failed++;
  process.stdout.write(`  \u2717 CSS validation failed: ${error.message}\n`);
}

// ========================================
// Test: JavaScript Files Structure
// ========================================
process.stdout.write('\nTesting JavaScript Files...\n\n');

try {
  const appJsPath = path.join(__dirname, '../js/app.js');
  const fundedJsPath = path.join(__dirname, '../js/funded.js');

  assert(fs.existsSync(appJsPath), 'app.js exists');
  assert(fs.existsSync(fundedJsPath), 'funded.js exists');

  const appJs = fs.readFileSync(appJsPath, 'utf8');
  assert(appJs.includes('class BRSniper'), 'Has BRSniper class');
  assert(appJs.includes('escapeHtml'), 'Has escapeHtml function');
  assert(appJs.includes('isValidUrl'), 'Has isValidUrl function');
  assert(appJs.includes('applyFilters'), 'Has applyFilters method');
  assert(appJs.includes('renderPagination'), 'Has renderPagination method');
  assert(!appJs.includes('console.log'), 'No console.log in app.js');

  const fundedJs = fs.readFileSync(fundedJsPath, 'utf8');
  assert(fundedJs.includes('class FundedStartups'), 'Has FundedStartups class');
  assert(fundedJs.includes('escapeHtml'), 'Has escapeHtml function');
  assert(fundedJs.includes('isValidUrl'), 'Has isValidUrl function');
  assert(fundedJs.includes('applyFilters'), 'Has applyFilters method');
  assert(fundedJs.includes('createStartupCard'), 'Has createStartupCard method');
  assert(fundedJs.includes('renderPagination'), 'Has renderPagination method');
  assert(!fundedJs.includes('console.log'), 'No console.log in funded.js');
} catch (error) {
  failed++;
  process.stdout.write(`  \u2717 JavaScript validation failed: ${error.message}\n`);
}

// ========================================
// Test: Fetch Scripts Structure
// ========================================
process.stdout.write('\nTesting Fetch Scripts...\n\n');

try {
  const fetchListingsPath = path.join(__dirname, '../scripts/fetch-listings.js');
  const fetchFundedPath = path.join(__dirname, '../scripts/fetch-funded-startups.js');

  const fetchListings = fs.readFileSync(fetchListingsPath, 'utf8');
  assert(fetchListings.includes('fetchWithRetry'), 'fetch-listings.js has fetchWithRetry');
  assert(fetchListings.includes('AbortController'), 'fetch-listings.js uses AbortController');
  assert(fetchListings.includes('require(\'./schemas\')'), 'fetch-listings.js imports schemas');
  assert(fetchListings.includes('module.exports'), 'fetch-listings.js exports functions');
  assert(!fetchListings.includes('console.log'), 'No console.log in fetch-listings.js');
  assert(fetchListings.includes('require.main === module'), 'fetch-listings.js guards main() call');

  const fetchFunded = fs.readFileSync(fetchFundedPath, 'utf8');
  assert(fetchFunded.includes('fetchWithRetry'), 'fetch-funded-startups.js has fetchWithRetry');
  assert(fetchFunded.includes('AbortController'), 'fetch-funded-startups.js uses AbortController');
  assert(fetchFunded.includes('require(\'./schemas\')'), 'fetch-funded-startups.js imports schemas');
  assert(fetchFunded.includes('LOOKBACK_DAYS'), 'fetch-funded-startups.js uses dynamic lookback');
  assert(fetchFunded.includes('module.exports'), 'fetch-funded-startups.js exports functions');
  assert(!fetchFunded.includes('console.log'), 'No console.log in fetch-funded-startups.js');
  assert(fetchFunded.includes('require.main === module'), 'fetch-funded-startups.js guards main() call');
} catch (error) {
  failed++;
  process.stdout.write(`  \u2717 Fetch scripts validation failed: ${error.message}\n`);
}

// ========================================
// Test: Schemas Module
// ========================================
process.stdout.write('\nTesting Schemas Module...\n\n');

try {
  const schemasPath = path.join(__dirname, '../scripts/schemas.js');
  assert(fs.existsSync(schemasPath), 'schemas.js exists');

  const schemas = fs.readFileSync(schemasPath, 'utf8');
  assert(schemas.includes('zod/v4'), 'Uses Zod v4');
  assert(schemas.includes('ListingSchema'), 'Exports ListingSchema');
  assert(schemas.includes('ListingsDataSchema'), 'Exports ListingsDataSchema');
  assert(schemas.includes('StartupSchema'), 'Exports StartupSchema');
  assert(schemas.includes('FundedDataSchema'), 'Exports FundedDataSchema');
  assert(schemas.includes('InvestorSchema'), 'Exports InvestorSchema');
} catch (error) {
  failed++;
  process.stdout.write(`  \u2717 Schemas module validation failed: ${error.message}\n`);
}

// ========================================
// Test: Edge Cases
// ========================================
process.stdout.write('\nTesting Edge Cases...\n\n');

// extractTag with nested tags
assertEqual(
  extractTag('<title><![CDATA[Test & <em>bold</em>]]></title>', 'title'),
  'Test & <em>bold</em>',
  'extractTag handles CDATA with nested HTML'
);

// decodeHTMLEntities with multiple entities (< > decoded then stripped as HTML)
assertEqual(
  decodeHTMLEntities('A &amp; B &amp; C'),
  'A & B & C',
  'Decodes multiple amp entities in one string'
);

// extractFinancials with no match
{
  const result = extractFinancials('Just a regular title', 'No money here');
  assertEqual(Object.keys(result).length, 0, 'extractFinancials returns empty object for no match');
}

// determineCategory case insensitivity
assertEqual(
  determineCategory('SAAS BUSINESS', ''),
  'SaaS',
  'determineCategory is case insensitive'
);

// extractFundingRound priority: Series D before checking seed
assertEqual(
  extractFundingRound('Company seeds Series D round', ''),
  'Series D+',
  'Series D matched before seed even when both present'
);

// generateCopyabilityAnalysis verdict strings
{
  const easy = generateCopyabilityAnalysis('SaaS', 'Pre-Seed', 1000000, 'marketplace platform saas api app');
  assert(
    ['EASY TO REPLICATE', 'MODERATE CHALLENGE', 'DIFFICULT TO COPY'].includes(easy.verdict),
    'Verdict is one of the three expected strings'
  );
}

// ========================================
// Test: extractAskingPrice (fetch-listings.js)
// ========================================
process.stdout.write('\nTesting extractAskingPrice...\n\n');

assertEqual(
  extractAskingPrice('asking price: $500,000', ''),
  500000,
  'Extracts "asking price: $X" format'
);

assertEqual(
  extractAskingPrice('listed for $100,000', ''),
  100000,
  'Extracts "listed for $X" format'
);

assertEqual(
  extractAskingPrice('$250,000 asking', ''),
  250000,
  'Extracts "$X asking" format'
);

assertEqual(
  extractAskingPrice('No price here', 'nothing'),
  undefined,
  'Returns undefined when no asking price found'
);

// ========================================
// Test: New Schema Fields (askingPrice, businessAge, country)
// ========================================
process.stdout.write('\nTesting New Schema Fields...\n\n');

{
  const result = ListingSchema.safeParse({
    id: 'test-new', source: 'empire', title: 'Test', url: 'https://example.com',
    category: 'SaaS', description: 'Test', financials: { revenue: 50000 },
    analysis: { verdict: 'GOOD' }, dateAdded: '2025-01-01',
    askingPrice: 100000, businessAge: '3 years', country: 'USA'
  });
  assert(result.success, 'ListingSchema accepts askingPrice, businessAge, country');
}

{
  const result = ListingSchema.safeParse({
    id: 'test-no-new', source: 'flippa', title: 'Test', url: 'https://example.com',
    category: 'SaaS', description: 'Test', financials: { revenue: 50000 },
    analysis: { verdict: 'GOOD' }, dateAdded: '2025-01-01'
  });
  assert(result.success, 'ListingSchema still works without new optional fields');
}

// ========================================
// Test: New Source Entries in Data Files
// ========================================
process.stdout.write('\nTesting New Source Entries...\n\n');

try {
  const fundedPath = path.join(__dirname, '../data/funded-startups.json');
  const fundedData = JSON.parse(fs.readFileSync(fundedPath, 'utf8'));

  const hasHackerNews = fundedData.sources.some(s => s.id === 'hackernews');
  assert(hasHackerNews, 'funded-startups.json has HackerNews source');

  const hasProductHunt = fundedData.sources.some(s => s.id === 'producthunt');
  assert(hasProductHunt, 'funded-startups.json has Product Hunt source');
} catch (error) {
  failed++;
  process.stdout.write(`  \u2717 Source entries test failed: ${error.message}\n`);
}

// ========================================
// Test: New Filter HTML Elements
// ========================================
process.stdout.write('\nTesting New Filter HTML Elements...\n\n');

try {
  const indexPath = path.join(__dirname, '../index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf8');

  assert(indexHtml.includes('asking-price-filter'), 'index.html has asking price filter');
  assert(indexHtml.includes('location-filter'), 'index.html has location filter');
  assert(indexHtml.includes('business-age-filter'), 'index.html has business age filter');
} catch (error) {
  failed++;
  process.stdout.write(`  \u2717 Filter HTML test failed: ${error.message}\n`);
}

try {
  const fundedPath = path.join(__dirname, '../funded.html');
  const fundedHtml = fs.readFileSync(fundedPath, 'utf8');

  assert(fundedHtml.includes('location-filter'), 'funded.html has location filter');
} catch (error) {
  failed++;
  process.stdout.write(`  \u2717 Funded filter HTML test failed: ${error.message}\n`);
}

// ========================================
// Test: Empire Flippers and Flippa Feed Config
// ========================================
process.stdout.write('\nTesting Feed Configuration...\n\n');

try {
  const fetchListingsPath = path.join(__dirname, '../scripts/fetch-listings.js');
  const fetchListings = fs.readFileSync(fetchListingsPath, 'utf8');

  assert(fetchListings.includes('empireflippers.com'), 'fetch-listings.js has Empire Flippers API URL');
  assert(fetchListings.includes('fetchEmpireFlippers'), 'fetch-listings.js has fetchEmpireFlippers function');
  assert(fetchListings.includes('property_type]=app'), 'fetch-listings.js has Flippa apps feed');
  assert(fetchListings.includes('sitetype]=blog'), 'fetch-listings.js has Flippa blog feed');
} catch (error) {
  failed++;
  process.stdout.write(`  \u2717 Feed config test failed: ${error.message}\n`);
}

try {
  const fetchFundedPath = path.join(__dirname, '../scripts/fetch-funded-startups.js');
  const fetchFunded = fs.readFileSync(fetchFundedPath, 'utf8');

  assert(fetchFunded.includes('hnrss.org'), 'fetch-funded-startups.js has HackerNews RSS URL');
  assert(fetchFunded.includes('producthunt.com/feed'), 'fetch-funded-startups.js has Product Hunt feed');
  assert(fetchFunded.includes("id: 'hackernews'"), 'fetch-funded-startups.js has hackernews source');
  assert(fetchFunded.includes("id: 'producthunt'"), 'fetch-funded-startups.js has producthunt source');
} catch (error) {
  failed++;
  process.stdout.write(`  \u2717 Funded feed config test failed: ${error.message}\n`);
}

// ========================================
// Test Summary
// ========================================
process.stdout.write('\n' + '='.repeat(50) + '\n');
process.stdout.write('TEST SUMMARY\n');
process.stdout.write('='.repeat(50) + '\n');
process.stdout.write(`Passed: ${passed}\n`);
process.stdout.write(`Failed: ${failed}\n`);
process.stdout.write(`Total:  ${passed + failed}\n`);
process.stdout.write('='.repeat(50) + '\n');

if (failed > 0) {
  process.stdout.write('\nFailed tests:\n');
  failures.forEach(f => process.stdout.write(`  - ${f}\n`));
  process.exit(1);
} else {
  process.stdout.write('\nAll tests passed!\n');
  process.exit(0);
}
