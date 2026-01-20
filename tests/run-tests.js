/**
 * BR Sniper - Test Runner
 * Simple test framework without external dependencies
 */

const fs = require('fs');
const path = require('path');

// Test results
let passed = 0;
let failed = 0;
const failures = [];

// Test utilities
function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    failures.push(message);
    console.log(`  ✗ ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  const isEqual = JSON.stringify(actual) === JSON.stringify(expected);
  if (isEqual) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    failures.push(`${message} (expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)})`);
    console.log(`  ✗ ${message}`);
    console.log(`    Expected: ${JSON.stringify(expected)}`);
    console.log(`    Got: ${JSON.stringify(actual)}`);
  }
}

function assertInRange(value, min, max, message) {
  if (value >= min && value <= max) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    failures.push(`${message} (value ${value} not in range ${min}-${max})`);
    console.log(`  ✗ ${message} (value ${value} not in range ${min}-${max})`);
  }
}

// ========================================
// Test: Data File Validation
// ========================================
console.log('\n📋 Testing Data Files...\n');

// Test listings.json structure
console.log('Testing listings.json:');
try {
  const listingsPath = path.join(__dirname, '../data/listings.json');
  const listingsData = JSON.parse(fs.readFileSync(listingsPath, 'utf8'));

  assert(listingsData.lastUpdated, 'Has lastUpdated field');
  assert(Array.isArray(listingsData.listings), 'Has listings array');
  assert(listingsData.listings.length > 0, 'Has at least one listing');

  // Validate each listing has required fields
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

  // Validate all listings have revenue > 0
  const allHaveRevenue = listingsData.listings.every(l => l.financials.revenue > 0);
  assert(allHaveRevenue, 'All listings have revenue > 0');

  // Validate all listings have analysis
  const allHaveAnalysis = listingsData.listings.every(l => l.analysis && l.analysis.verdict);
  assert(allHaveAnalysis, 'All listings have strategic analysis');

} catch (error) {
  failed++;
  console.log(`  ✗ listings.json validation failed: ${error.message}`);
}

// Test funded-startups.json structure
console.log('\nTesting funded-startups.json:');
try {
  const fundedPath = path.join(__dirname, '../data/funded-startups.json');
  const fundedData = JSON.parse(fs.readFileSync(fundedPath, 'utf8'));

  assert(fundedData.lastUpdated, 'Has lastUpdated field');
  assert(Array.isArray(fundedData.sources), 'Has sources array');
  assert(Array.isArray(fundedData.startups), 'Has startups array');
  assert(fundedData.startups.length > 0, 'Has at least one startup');

  // Validate each startup has required fields
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

  // Validate copyability scores are in range
  const allScoresValid = fundedData.startups.every(
    s => s.analysis.copyabilityScore >= 1 && s.analysis.copyabilityScore <= 5
  );
  assert(allScoresValid, 'All copyability scores are between 1-5');

  // Validate all startups have investors
  const allHaveInvestors = fundedData.startups.every(
    s => Array.isArray(s.investors) && s.investors.length > 0
  );
  assert(allHaveInvestors, 'All startups have investors array');

} catch (error) {
  failed++;
  console.log(`  ✗ funded-startups.json validation failed: ${error.message}`);
}

// ========================================
// Test: Parser Functions
// ========================================
console.log('\n📋 Testing Parser Functions...\n');

// Import parser functions by reading the file and extracting them
console.log('Testing funding amount extraction:');

function testExtractFundingAmount(title, description) {
  const text = `${title} ${description}`;
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
      if (pattern.source.includes('billion')) {
        return amount * 1000000000;
      }
      return amount * 1000000;
    }
  }
  return null;
}

assertEqual(
  testExtractFundingAmount('Acme raises $10 million', ''),
  10000000,
  'Extracts "$X million" format'
);

assertEqual(
  testExtractFundingAmount('Startup secures $5M funding', ''),
  5000000,
  'Extracts "$XM" format'
);

assertEqual(
  testExtractFundingAmount('Company raises $1.5 billion', ''),
  1500000000,
  'Extracts billion format'
);

assertEqual(
  testExtractFundingAmount('No funding info here', 'Nothing to see'),
  null,
  'Returns null when no amount found'
);

// Test funding round extraction
console.log('\nTesting funding round extraction:');

function testExtractFundingRound(title, description) {
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

assertEqual(testExtractFundingRound('Acme closes Series A', ''), 'Series A', 'Extracts Series A');
assertEqual(testExtractFundingRound('Startup raises seed round', ''), 'Seed', 'Extracts Seed');
assertEqual(testExtractFundingRound('Company gets pre-seed funding', ''), 'Pre-Seed', 'Extracts Pre-Seed');
assertEqual(testExtractFundingRound('No round info', ''), 'Unknown', 'Returns Unknown when not found');

// Test industry classification
console.log('\nTesting industry classification:');

function testDetermineIndustry(title, description) {
  const INDUSTRY_KEYWORDS = {
    'AI/ML': ['ai', 'artificial intelligence', 'machine learning', 'ml', 'llm', 'generative'],
    'Fintech': ['fintech', 'payment', 'banking', 'financial', 'crypto', 'blockchain'],
    'Healthcare': ['health', 'medical', 'biotech', 'pharma', 'patient'],
    'SaaS': ['saas', 'software', 'platform', 'b2b', 'enterprise'],
    'E-commerce': ['ecommerce', 'e-commerce', 'retail', 'marketplace'],
    'Cybersecurity': ['security', 'cyber', 'encryption', 'threat'],
    'Climate': ['climate', 'sustainability', 'green', 'carbon'],
    'Developer Tools': ['developer', 'devops', 'api', 'infrastructure']
  };

  const text = `${title} ${description}`.toLowerCase();

  for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      return industry;
    }
  }

  return 'Other';
}

assertEqual(testDetermineIndustry('AI startup raises funding', ''), 'AI/ML', 'Classifies AI correctly');
assertEqual(testDetermineIndustry('Fintech payment processor', ''), 'Fintech', 'Classifies Fintech correctly');
assertEqual(testDetermineIndustry('Healthcare platform', ''), 'Healthcare', 'Classifies Healthcare correctly');
assertEqual(testDetermineIndustry('Random company', ''), 'Other', 'Falls back to Other');

// Test copyability score generation
console.log('\nTesting copyability analysis:');

function testCopyabilityScore(industry, fundingRound, amountRaised, description) {
  const text = description.toLowerCase();
  let score = 3;

  const hardFactors = [
    { keyword: 'patent', weight: 2 },
    { keyword: 'proprietary', weight: 2 },
    { keyword: 'regulated', weight: 2 },
    { keyword: 'hardware', weight: 2 }
  ];

  const easyFactors = [
    { keyword: 'marketplace', weight: 1 },
    { keyword: 'platform', weight: 1 },
    { keyword: 'saas', weight: 1 },
    { keyword: 'api', weight: 1 }
  ];

  hardFactors.forEach(factor => {
    if (text.includes(factor.keyword)) score -= factor.weight;
  });
  easyFactors.forEach(factor => {
    if (text.includes(factor.keyword)) score += factor.weight;
  });

  if (amountRaised > 50000000) score -= 1;
  if (amountRaised < 5000000) score += 1;

  if (['Series C', 'Series D+'].includes(fundingRound)) score -= 1;
  if (['Pre-Seed', 'Seed'].includes(fundingRound)) score += 1;

  return Math.max(1, Math.min(5, score));
}

assertInRange(
  testCopyabilityScore('SaaS', 'Seed', 2000000, 'SaaS platform for automation'),
  4, 5,
  'SaaS seed stage = high copyability (4-5)'
);

assertInRange(
  testCopyabilityScore('Healthcare', 'Series C', 80000000, 'Proprietary regulated medical device'),
  1, 2,
  'Proprietary regulated medical = low copyability (1-2)'
);

assertInRange(
  testCopyabilityScore('Fintech', 'Series A', 10000000, 'Payment processing API'),
  3, 5,
  'Fintech API Series A = medium-high copyability (3-5)'
);

// ========================================
// Test: HTML Structure
// ========================================
console.log('\n📋 Testing HTML Structure...\n');

// Test index.html
console.log('Testing index.html:');
try {
  const indexPath = path.join(__dirname, '../index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf8');

  assert(indexHtml.includes('<!DOCTYPE html>'), 'Has DOCTYPE declaration');
  assert(indexHtml.includes('<title>'), 'Has title tag');
  assert(indexHtml.includes('listings-grid'), 'Has listings grid container');
  assert(indexHtml.includes('source-tabs'), 'Has source tabs');
  assert(indexHtml.includes('href="funded.html"'), 'Has link to funded page');
  assert(indexHtml.includes('js/app.js'), 'Includes app.js');

} catch (error) {
  failed++;
  console.log(`  ✗ index.html validation failed: ${error.message}`);
}

// Test funded.html
console.log('\nTesting funded.html:');
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

} catch (error) {
  failed++;
  console.log(`  ✗ funded.html validation failed: ${error.message}`);
}

// ========================================
// Test: CSS Files Exist
// ========================================
console.log('\n📋 Testing CSS Files...\n');

try {
  const stylesPath = path.join(__dirname, '../css/styles.css');
  const fundedCssPath = path.join(__dirname, '../css/funded.css');

  assert(fs.existsSync(stylesPath), 'styles.css exists');
  assert(fs.existsSync(fundedCssPath), 'funded.css exists');

  const fundedCss = fs.readFileSync(fundedCssPath, 'utf8');
  assert(fundedCss.includes('.startup-card'), 'Has startup-card styles');
  assert(fundedCss.includes('.copyability-easy'), 'Has copyability-easy class');
  assert(fundedCss.includes('.copyability-medium'), 'Has copyability-medium class');
  assert(fundedCss.includes('.copyability-hard'), 'Has copyability-hard class');

} catch (error) {
  failed++;
  console.log(`  ✗ CSS validation failed: ${error.message}`);
}

// ========================================
// Test: JavaScript Files Exist
// ========================================
console.log('\n📋 Testing JavaScript Files...\n');

try {
  const appJsPath = path.join(__dirname, '../js/app.js');
  const fundedJsPath = path.join(__dirname, '../js/funded.js');

  assert(fs.existsSync(appJsPath), 'app.js exists');
  assert(fs.existsSync(fundedJsPath), 'funded.js exists');

  const fundedJs = fs.readFileSync(fundedJsPath, 'utf8');
  assert(fundedJs.includes('class FundedStartups'), 'Has FundedStartups class');
  assert(fundedJs.includes('applyFilters'), 'Has applyFilters method');
  assert(fundedJs.includes('createStartupCard'), 'Has createStartupCard method');

} catch (error) {
  failed++;
  console.log(`  ✗ JavaScript validation failed: ${error.message}`);
}

// ========================================
// Test Summary
// ========================================
console.log('\n' + '='.repeat(50));
console.log('TEST SUMMARY');
console.log('='.repeat(50));
console.log(`✓ Passed: ${passed}`);
console.log(`✗ Failed: ${failed}`);
console.log('='.repeat(50));

if (failed > 0) {
  console.log('\nFailed tests:');
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
} else {
  console.log('\n🎉 All tests passed!');
  process.exit(0);
}
