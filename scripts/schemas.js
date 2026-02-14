const { z } = require('zod/v4');

// Listing schemas
const FinancialsSchema = z.object({
  revenue: z.number().positive(),
  ebitda: z.number().optional(),
  mrr: z.number().optional(),
  recurringRevenue: z.number().min(0).max(100).optional(),
});

const AnalysisSchema = z.object({
  verdict: z.string().min(1),
  uspCopyable: z.string().optional(),
  reasoning: z.string().optional(),
  risks: z.array(z.string()).optional(),
  opportunity: z.string().optional(),
});

const ListingSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  category: z.string().min(1),
  description: z.string(),
  financials: FinancialsSchema,
  analysis: AnalysisSchema,
  dateAdded: z.string(),
  askingPrice: z.number().optional(),
  businessAge: z.string().optional(),
  country: z.string().optional(),
  location: z.string().optional(),
  highlights: z.array(z.string()).optional(),
  employees: z.number().optional().nullable(),
  businessModel: z.string().optional(),
  onlineOnly: z.boolean().optional(),
});

const SourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: z.string().url().optional(),
  description: z.string().optional(),
  country: z.string().optional(),
  flag: z.string().optional(),
});

const ListingsDataSchema = z.object({
  lastUpdated: z.string(),
  sources: z.array(SourceSchema),
  listings: z.array(ListingSchema),
  marketInsights: z.object({
    ebitdaMultiples: z.record(z.string(), z.any()),
    trends: z.array(z.string()),
  }).optional(),
});

// Funded startup schemas
const InvestorSchema = z.object({
  name: z.string().min(1),
  type: z.string(),
  lead: z.boolean(),
});

const CopyabilityAnalysisSchema = z.object({
  copyabilityScore: z.number().min(1).max(5),
  verdict: z.string().min(1),
  reasoning: z.string(),
  alternativeApproach: z.string().optional(),
});

const StartupSchema = z.object({
  id: z.string().min(1),
  companyName: z.string().min(1),
  fundingRound: z.string().min(1),
  amountRaised: z.number().min(250000),
  currency: z.string().optional(),
  announcedDate: z.string().optional(),
  source: z.string().min(1),
  articleUrl: z.string().url(),
  companyUrl: z.string().url().optional(),
  investors: z.array(InvestorSchema).min(1),
  industry: z.string().min(1),
  headquarters: z.string().optional(),
  location: z.string().optional(),
  companyType: z.string().optional(),
  description: z.string(),
  whyFunded: z.array(z.string()),
  usps: z.array(z.string()),
  analysis: CopyabilityAnalysisSchema,
  dateAdded: z.string().optional(),
  datePublished: z.string().optional(),
});

const FundedDataSchema = z.object({
  lastUpdated: z.string(),
  sources: z.array(SourceSchema),
  stages: z.array(z.string()).optional(),
  startups: z.array(StartupSchema),
});

const RSSItemSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  description: z.string(),
  pubDate: z.date(),
});

module.exports = {
  ListingSchema,
  ListingsDataSchema,
  StartupSchema,
  FundedDataSchema,
  RSSItemSchema,
  FinancialsSchema,
  AnalysisSchema,
  CopyabilityAnalysisSchema,
  InvestorSchema,
  SourceSchema,
};
