import { safeLogger } from './error-handler.js';

export interface ExaSearchResult {
  id?: string;
  title: string;
  url: string;
  sourceName?: string;
  domain?: string;
  publishedDate?: string;
  author?: string;
  text?: string;
  highlights?: string[];
  score?: number;
}

/**
 * Retrieve Exa API Key securely from server-side environment variables.
 * Never exposed to frontend or client bundle.
 */
export function getExaApiKey(): string | null {
  const key = (
    process.env.EXA_API_KEY ||
    process.env.EXA_KEY ||
    ''
  ).trim();

  if (
    !key ||
    key.startsWith('MY_') ||
    key.startsWith('YOUR_') ||
    key.startsWith('ENTER_') ||
    key.length < 5
  ) {
    return null;
  }
  return key;
}

/**
 * Web Search is ALWAYS configured and ready because Aestific combines
 * Exa Neural Search (when key is present) + Direct URL Reader +
 * Google News Live RSS + DuckDuckGo HTML Search + Wikipedia Live API.
 */
export function isExaSearchConfigured(): boolean {
  return true;
}

/**
 * Strip attachment blocks from augmented message so search classifiers and query extractors
 * inspect only the user's actual prompt text.
 */
export function stripAttachmentContextFromQuery(rawMessage: string): string {
  if (!rawMessage) return '';
  return rawMessage
    .split(/\n\n\[(?:ATTACHED|PREVIOUSLY ATTACHED|Attached )/)[0]
    .trim();
}

/**
 * Extract domain hostname cleanly from a URL.
 */
export function getDomainFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

/**
 * Format a readable Source Name from a domain or existing source label.
 */
export function getReadableSourceName(url: string, fallbackSource?: string): string {
  if (fallbackSource && fallbackSource.trim().length > 1) {
    return fallbackSource.trim();
  }
  const domain = getDomainFromUrl(url).toLowerCase();
  if (!domain) return 'Web Source';

  const knownDomains: Record<string, string> = {
    'prothomalo.com': 'Prothom Alo',
    'en.prothomalo.com': 'Prothom Alo English',
    'thedailystar.net': 'The Daily Star',
    'bangla.thedailystar.net': 'The Daily Star Bangla',
    'bbc.com': 'BBC News',
    'bbc.co.uk': 'BBC News',
    'jugantor.com': 'Jugantor',
    'kalerkantho.com': 'Kaler Kantho',
    'somoynews.tv': 'Somoy News',
    'jamuna.tv': 'Jamuna TV',
    'ittefaq.com.bd': 'The Daily Ittefaq',
    'samakal.com': 'Samakal',
    'dhakapost.com': 'Dhaka Post',
    'banglatribune.com': 'Bangla Tribune',
    'bdnews24.com': 'bdnews24',
    'bangla.bdnews24.com': 'bdnews24 Bangla',
    'jagonews24.com': 'JagoNews24',
    'tbsnews.net': 'The Business Standard',
    'dhakatribune.com': 'Dhaka Tribune',
    'mzamin.com': 'Manab Zamin',
    'bonikbarta.net': 'Bonik Barta',
    'independent24.com': 'Independent TV',
    'channel24bd.tv': 'Channel 24',
    'ntvbd.com': 'NTV Online',
    'rtvonline.com': 'RTV Online',
    'dailyjanakantha.com': 'Daily Janakantha',
    'nayadiganta.com': 'Daily Naya Diganta',
    'dailynayadiganta.com': 'Daily Naya Diganta',
    'jaijaidinbd.com': 'Jaijaidin',
    'deshrupantor.com': 'Desh Rupantor',
    'kalbela.com': 'Kalbela',
    'ajkerpatrika.com': 'Ajker Patrika',
    'bhorerkagoj.com': 'Bhorer Kagoj',
    'risingbd.com': 'RisingBD',
    'sarabangla.net': 'SaraBangla',
    'reuters.com': 'Reuters',
    'aljazeera.com': 'Al Jazeera',
    'apnews.com': 'Associated Press',
    'cnn.com': 'CNN',
    'theguardian.com': 'The Guardian',
    'nytimes.com': 'The New York Times',
    'washingtonpost.com': 'The Washington Post',
    'bloomberg.com': 'Bloomberg',
    'cnbc.com': 'CNBC',
    'forbes.com': 'Forbes',
    'techcrunch.com': 'TechCrunch',
    'theverge.com': 'The Verge',
    'wired.com': 'Wired',
    'arstechnica.com': 'Ars Technica',
    'engadget.com': 'Engadget',
    'gsmarena.com': 'GSMArena',
    'espncricinfo.com': 'ESPNcricinfo',
    'cricbuzz.com': 'Cricbuzz',
    'espn.com': 'ESPN',
    'goal.com': 'Goal.com',
    'fifa.com': 'FIFA',
    'icc-cricket.com': 'ICC Cricket',
    'en.wikipedia.org': 'Wikipedia',
    'bn.wikipedia.org': 'উইকিপিডিয়া (Wikipedia)',
    'wikipedia.org': 'Wikipedia',
    'github.com': 'GitHub',
    'stackoverflow.com': 'Stack Overflow',
    'reddit.com': 'Reddit',
    'youtube.com': 'YouTube',
    'youtu.be': 'YouTube',
    'medium.com': 'Medium',
    'dev.to': 'DEV Community',
    'npmjs.com': 'npm',
    'pypi.org': 'PyPI',
    'timeanddate.com': 'Time and Date',
    'accuweather.com': 'AccuWeather',
    'weather.com': 'The Weather Channel',
    'xe.com': 'XE Currency',
    'coinmarketcap.com': 'CoinMarketCap',
    'coingecko.com': 'CoinGecko',
    'bajus.org': 'BAJUS',
  };

  if (knownDomains[domain]) {
    return knownDomains[domain];
  }

  for (const [k, v] of Object.entries(knownDomains)) {
    if (domain.endsWith('.' + k)) {
      return v;
    }
  }

  // Capitalize main domain name nicely
  const parts = domain.split('.');
  const base = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  if (base && base.length > 2) {
    return base.charAt(0).toUpperCase() + base.slice(1);
  }
  return domain;
}

/**
 * Authoritative, popular domains with their popularity & credibility tier score (0 to 100).
 * High-tier popular news, sports, and encyclopedia sources are prioritized.
 */
export const POPULAR_DOMAINS_SCORE: Record<string, number> = {
  // Top Bangladesh & Regional Media (Tier 1: 90-100)
  'prothomalo.com': 100,
  'en.prothomalo.com': 100,
  'thedailystar.net': 100,
  'bangla.thedailystar.net': 100,
  'bdnews24.com': 98,
  'bangla.bdnews24.com': 98,
  'dhakatribune.com': 96,
  'tbsnews.net': 96,
  'samakal.com': 94,
  'jugantor.com': 94,
  'ittefaq.com.bd': 94,
  'kalerkantho.com': 94,
  'somoynews.tv': 94,
  'jamuna.tv': 94,
  'banglatribune.com': 92,
  'dhakapost.com': 92,
  'jagonews24.com': 92,
  'kalbela.com': 90,
  'ajkerpatrika.com': 90,
  'bssnews.net': 95,
  'channel24bd.tv': 90,
  'ntvbd.com': 90,
  'rtvonline.com': 90,
  'deshrupantor.com': 88,
  'mzamin.com': 88,
  'bonikbarta.net': 90,

  // Top Global News & Media (Tier 1: 92-100)
  'bbc.com': 100,
  'bbc.co.uk': 100,
  'reuters.com': 100,
  'apnews.com': 100,
  'aljazeera.com': 98,
  'theguardian.com': 98,
  'cnn.com': 98,
  'nytimes.com': 98,
  'washingtonpost.com': 96,
  'bloomberg.com': 98,
  'forbes.com': 92,
  'ft.com': 96,
  'time.com': 92,
  'cnbc.com': 94,

  // Sports Authorities & Major Outlets (Tier 1: 92-100)
  'espncricinfo.com': 100,
  'cricbuzz.com': 100,
  'icc-cricket.com': 100,
  'fifa.com': 100,
  'espn.com': 98,
  'goal.com': 92,
  'skysports.com': 94,
  'premierleague.com': 98,
  'uefa.com': 98,
  'olympics.com': 98,

  // Encyclopedia & Reference (Tier 1: 98-100)
  'wikipedia.org': 100,
  'en.wikipedia.org': 100,
  'bn.wikipedia.org': 100,
  'britannica.com': 98,

  // Tech & Science (Tier 1: 90-98)
  'techcrunch.com': 96,
  'theverge.com': 96,
  'wired.com': 92,
  'gsmarena.com': 96,
  'arstechnica.com': 92,
  'nature.com': 98,
  'nasa.gov': 100,

  // Finance & Live Markets (Tier 1: 92-96)
  'coinmarketcap.com': 96,
  'coingecko.com': 96,
  'finance.yahoo.com': 94,
  'tradingview.com': 94,
  'xe.com': 94,
  'bajus.org': 96,
  'bb.org.bd': 98,
};

/**
 * Filter out spam, low-quality aggregators, and scraper traps.
 */
export function isLowQualityOrSpamDomain(domain: string): boolean {
  if (!domain) return true;
  const d = domain.toLowerCase();

  // Spam TLDs or common scraper patterns
  if (/\.(?:xyz|top|click|buzz|fit|gq|cf|tk|ml|ga|work|stream|loan|mom|monster|sbs|autos|hair|boats|quest|cfd)$/i.test(d)) {
    return true;
  }

  // Social feed login pages or non-informative traps
  if (/^(?:facebook\.com|instagram\.com|tiktok\.com|pinterest\.com|threads\.net|twitter\.com|x\.com)\b/i.test(d)) {
    return true;
  }

  // Common content scraper patterns
  if (/(?:news-aggregator|spamblog|free-article|autoblog|article-spinner|link-farm)/i.test(d)) {
    return true;
  }

  return false;
}

/**
 * Calculate popularity & authority score (0 to 100) for a search result domain.
 */
export function getSourcePopularityScore(url: string, sourceName?: string): number {
  const domain = getDomainFromUrl(url).toLowerCase();
  if (!domain) return 0;
  if (isLowQualityOrSpamDomain(domain)) return 0;

  // Direct match in popular domains list
  if (POPULAR_DOMAINS_SCORE[domain] !== undefined) {
    return POPULAR_DOMAINS_SCORE[domain];
  }

  // Subdomain match (e.g. news.bbc.co.uk -> bbc.co.uk)
  for (const [popularDomain, score] of Object.entries(POPULAR_DOMAINS_SCORE)) {
    if (domain.endsWith('.' + popularDomain)) {
      return score;
    }
  }

  // Government, educational, and international authority domains
  if (/\.(?:gov|gov\.bd|edu|edu\.bd|org\.bd|int)$/i.test(domain) || /(?:who\.int|un\.org|worldbank\.org|imf\.org)/i.test(domain)) {
    return 95;
  }

  // Reputable org / net domains
  if (/\.(?:org|net)$/i.test(domain)) {
    return 65;
  }

  // Standard generic web source
  return 50;
}

/**
 * Extract any explicit URLs or bare domains that the user wants visited/checked.
 */
export function extractUrlsFromQuery(rawQuery: string): string[] {
  const query = stripAttachmentContextFromQuery(rawQuery);
  if (!query) return [];

  const urls = new Set<string>();

  // 1. Explicit http:// or https:// or www. URLs
  const explicitRegex = /\b((?:https?:\/\/|www\.)[^\s<>"')\]،।,;]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = explicitRegex.exec(query)) !== null) {
    let rawUrl = match[1].replace(/[.,;:!?)'"\]]+$/, '');
    if (rawUrl.toLowerCase().startsWith('www.')) {
      rawUrl = 'https://' + rawUrl;
    }
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        urls.add(parsed.toString());
      }
    } catch {}
  }

  // 2. Bare domains (e.g. "prothomalo.com", "bbc.com/bengali", "github.com/facebook/react")
  const bareDomainRegex = /\b([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.(?:com|org|net|io|ai|gov|edu|co|tv|me|info|app|dev|xyz|news|bd|in|uk|us)(?:\/[^\s<>"')\]،।,;]*)?)\b/gi;
  while ((match = bareDomainRegex.exec(query)) !== null) {
    const candidate = match[1].replace(/[.,;:!?)'"\]]+$/, '');
    // Skip common file extensions that might look like domains (e.g. file.ai) unless it's a real domain
    if (/^(?:index|app|server|main|style|script|config|package|tsconfig|vite)\./i.test(candidate)) {
      continue;
    }
    const withProto = 'https://' + candidate;
    try {
      const parsed = new URL(withProto);
      const alreadyCovered = Array.from(urls).some(
        (existing) => existing.toLowerCase().includes(parsed.hostname.toLowerCase())
      );
      if (!alreadyCovered) {
        urls.add(parsed.toString());
      }
    } catch {}
  }

  return Array.from(urls).slice(0, 3);
}

/**
 * Detect if the user requested searching from or visiting a specific named source.
 */
export function extractSpecificSourceHint(rawQuery: string): {
  siteDomain?: string;
  sourceLabel?: string;
  homepageUrl?: string;
} {
  const query = stripAttachmentContextFromQuery(rawQuery).toLowerCase();
  if (!query) return {};

  const namedSources: Array<{
    pattern: RegExp;
    siteDomain: string;
    sourceLabel: string;
    homepageUrl: string;
  }> = [
    {
      pattern: /(?:prothom\s*alo|prothomalo|প্রথম\s*আলো)/i,
      siteDomain: 'prothomalo.com',
      sourceLabel: 'Prothom Alo',
      homepageUrl: 'https://www.prothomalo.com',
    },
    {
      pattern: /(?:bbc\s*bangla|bbc\s*bengali|বিবিসি\s*বাংলা)/i,
      siteDomain: 'bbc.com',
      sourceLabel: 'BBC News বাংলা',
      homepageUrl: 'https://www.bbc.com/bengali',
    },
    {
      pattern: /\b(?:bbc|বিবিসি)\b/i,
      siteDomain: 'bbc.com',
      sourceLabel: 'BBC News',
      homepageUrl: 'https://www.bbc.com/news',
    },
    {
      pattern: /(?:daily\s*star|thedailystar|ডেইলি\s*স্টার)/i,
      siteDomain: 'thedailystar.net',
      sourceLabel: 'The Daily Star',
      homepageUrl: 'https://www.thedailystar.net',
    },
    {
      pattern: /(?:jugantor|যুগান্তর)/i,
      siteDomain: 'jugantor.com',
      sourceLabel: 'Jugantor',
      homepageUrl: 'https://www.jugantor.com',
    },
    {
      pattern: /(?:kaler\s*kantho|kalerkantho|কালের\s*কণ্ঠ|কালের\s*কন্ঠ)/i,
      siteDomain: 'kalerkantho.com',
      sourceLabel: 'Kaler Kantho',
      homepageUrl: 'https://www.kalerkantho.com',
    },
    {
      pattern: /(?:somoy\s*tv|somoy\s*news|somoynews|সময়\s*টিভি|সময়\s*টিভি|সময়\s*নিউজ)/i,
      siteDomain: 'somoynews.tv',
      sourceLabel: 'Somoy News',
      homepageUrl: 'https://www.somoynews.tv',
    },
    {
      pattern: /(?:jamuna\s*tv|jamuna\s*news|যমুনা\s*টিভি|যমুনা\s*নিউজ)/i,
      siteDomain: 'jamuna.tv',
      sourceLabel: 'Jamuna TV',
      homepageUrl: 'https://www.jamuna.tv',
    },
    {
      pattern: /(?:ittefaq|ইত্তেফাক)/i,
      siteDomain: 'ittefaq.com.bd',
      sourceLabel: 'The Daily Ittefaq',
      homepageUrl: 'https://www.ittefaq.com.bd',
    },
    {
      pattern: /(?:samakal|সমকাল)/i,
      siteDomain: 'samakal.com',
      sourceLabel: 'Samakal',
      homepageUrl: 'https://samakal.com',
    },
    {
      pattern: /(?:dhaka\s*post|dhakapost|ঢাকা\s*পোস্ট)/i,
      siteDomain: 'dhakapost.com',
      sourceLabel: 'Dhaka Post',
      homepageUrl: 'https://www.dhakapost.com',
    },
    {
      pattern: /(?:bangla\s*tribune|banglatribune|বাংলা\s*ট্রিবিউন)/i,
      siteDomain: 'banglatribune.com',
      sourceLabel: 'Bangla Tribune',
      homepageUrl: 'https://www.banglatribune.com',
    },
    {
      pattern: /(?:bdnews24|বিডিনিউজ)/i,
      siteDomain: 'bdnews24.com',
      sourceLabel: 'bdnews24',
      homepageUrl: 'https://bdnews24.com',
    },
    {
      pattern: /(?:jago\s*news|jagonews24|জাগো\s*নিউজ)/i,
      siteDomain: 'jagonews24.com',
      sourceLabel: 'JagoNews24',
      homepageUrl: 'https://www.jagonews24.com',
    },
    {
      pattern: /(?:kalbela|কালবেলা)/i,
      siteDomain: 'kalbela.com',
      sourceLabel: 'Kalbela',
      homepageUrl: 'https://www.kalbela.com',
    },
    {
      pattern: /(?:ajker\s*patrika|ajkerpatrika|আজকের\s*পত্রিকা)/i,
      siteDomain: 'ajkerpatrika.com',
      sourceLabel: 'Ajker Patrika',
      homepageUrl: 'https://www.ajkerpatrika.com',
    },
    {
      pattern: /(?:business\s*standard|tbs\s*news|tbsnews)/i,
      siteDomain: 'tbsnews.net',
      sourceLabel: 'The Business Standard',
      homepageUrl: 'https://www.tbsnews.net',
    },
    {
      pattern: /(?:dhaka\s*tribune|dhakatribune|ঢাকা\s*ট্রিবিউন)/i,
      siteDomain: 'dhakatribune.com',
      sourceLabel: 'Dhaka Tribune',
      homepageUrl: 'https://www.dhakatribune.com',
    },
    {
      pattern: /(?:al\s*jazeera|aljazeera|আল\s*জাজিরা)/i,
      siteDomain: 'aljazeera.com',
      sourceLabel: 'Al Jazeera',
      homepageUrl: 'https://www.aljazeera.com',
    },
    {
      pattern: /\b(?:reuters|রয়টার্স|রয়টার্স)\b/i,
      siteDomain: 'reuters.com',
      sourceLabel: 'Reuters',
      homepageUrl: 'https://www.reuters.com',
    },
    {
      pattern: /(?:wikipedia|উইকিপিডিয়া|উইকিপিডিয়া)/i,
      siteDomain: 'wikipedia.org',
      sourceLabel: 'Wikipedia',
      homepageUrl: 'https://en.wikipedia.org',
    },
    {
      pattern: /(?:cricinfo|espncricinfo|ক্রিকইনফো)/i,
      siteDomain: 'espncricinfo.com',
      sourceLabel: 'ESPNcricinfo',
      homepageUrl: 'https://www.espncricinfo.com',
    },
    {
      pattern: /(?:cricbuzz|ক্রিকবাজ)/i,
      siteDomain: 'cricbuzz.com',
      sourceLabel: 'Cricbuzz',
      homepageUrl: 'https://www.cricbuzz.com',
    },
    {
      pattern: /(?:techcrunch|টেকক্রাঞ্চ)/i,
      siteDomain: 'techcrunch.com',
      sourceLabel: 'TechCrunch',
      homepageUrl: 'https://techcrunch.com',
    },
    {
      pattern: /(?:gsmarena|জিএসএমঅ্যারেনা)/i,
      siteDomain: 'gsmarena.com',
      sourceLabel: 'GSMArena',
      homepageUrl: 'https://www.gsmarena.com',
    },
  ];

  for (const item of namedSources) {
    if (item.pattern.test(query)) {
      return {
        siteDomain: item.siteDomain,
        sourceLabel: item.sourceLabel,
        homepageUrl: item.homepageUrl,
      };
    }
  }

  return {};
}

/**
 * Intelligent classifier to determine if a query requires live web search or URL visiting.
 * Built to match the exact situations in which ChatGPT uses web search.
 *
 * CORE DECISION RULE:
 * Before answering, determine:
 * A. Does the user explicitly request web search?
 * OR
 * B. Does the answer require current/changing/external information?
 * OR
 * C. Does the answer require a specific online source?
 * OR
 * D. Does the request depend on current real-world availability/location/pricing/schedules?
 *
 * If YES -> use Web Intelligence (return true).
 * If NO  -> do NOT use Web Intelligence (return false).
 *
 * Automatic and context-aware. Do not trigger from isolated keywords; determine the
 * complete intent of the user request.
 */
export function shouldPerformWebSearch(
  userQuery: string,
  hasAttachments: boolean = false
): boolean {
  const cleanQuery = stripAttachmentContextFromQuery(userQuery);
  if (!cleanQuery || cleanQuery.length === 0) {
    return false;
  }

  const query = cleanQuery.toLowerCase().trim();

  // If user only uploaded media and didn't type a question, don't web search
  if (hasAttachments && (query === '(uploaded attachment)' || query.length < 4)) {
    return false;
  }

  // 1. Strict Filter: Never web search for Aestific identity, founder, or system queries
  const isIdentityOrFounder =
    /\b(?:who\s+(?:created|founded|made|built)\s+(?:you|aestific)|what\s+is\s+aestific|what['’]?s\s+aestific|who\s+are\s+you|tell\s+me\s+about\s+yourself|what\s+is\s+your\s+identity|founder\s+of\s+aestific)\b/i.test(query) ||
    /(?:তোমাকে\s*কে|কে\s*তোমাকে|aestific\s*কী|aestific\s*কি|aestific\s*এর\s*প্রতিষ্ঠাতা|তুমি\s*কে|নিজের\s*সম্পর্কে)/i.test(query);
  if (isIdentityOrFounder) return false;

  // ---------------------------------------------------------------------------
  // DECISION BRANCH A & C (HIGH PRIORITY OVERRIDES):
  // 3. USER EXPLICITLY REQUESTS WEB SEARCH
  // 15. SPECIFIC ONLINE SOURCES
  // ---------------------------------------------------------------------------

  // 3. User Explicitly Requests Web Search
  // ("search the web", "search online", "look this up", "find this on the internet", "browse the web", "Google this", "find sources", "search for...")
  const isExplicitSearchRequest =
    /\b(?:search\s+(?:the\s+)?(?:web|internet|online)|search\s+online|look\s+(?:this\s+)?up\s+online|find\s+(?:this\s+)?(?:on\s+the\s+internet|online)|browse\s+(?:the\s+)?web|google\s+(?:this|it|search|koro|kore)|find\s+(?:sources|citations)|search\s+for|look\s+up\s+on\s+google|check\s+online)\b/i.test(query) ||
    /(?:ইন্টারনেটে\s*খোঁজ|অনলাইনে\s*সার্চ|নেট\s*থেকে\s*খুঁজে|নেটে\s*সার্চ|ওয়েবে\s*সার্চ|ওয়েবে\s*সার্চ|গুগল\s*করে|সার্চ\s*করে\s*বলো|সার্চ\s*দাও|সোর্স\s*খোঁজো|অনলাইনে\s*দেখো)/i.test(query) ||
    /\b(?:online\s*e\s*search|net\s*e\s*search|google\s*e\s*search|web\s*e\s*search|khuje\s*bolo|khuje\s*dao|search\s*kore\s*dekho)\b/i.test(query);
  if (isExplicitSearchRequest) {
    return true;
  }

  // 15. Specific Online Sources (URLs, direct links, named domains, GitHub repos, articles, specific web pages)
  const explicitUrls = extractUrlsFromQuery(cleanQuery);
  if (explicitUrls.length > 0) {
    return true;
  }
  const sourceHint = extractSpecificSourceHint(cleanQuery);
  if (sourceHint.siteDomain) {
    return true;
  }
  const isSpecificOnlineSourceRequest =
    /\b(?:visit|check|open|browse|read|fetch|scrape|inspect|summarize\s+(?:this\s+)?(?:link|page|url|article|site)|look\s+at\s+(?:the\s+)?(?:link|website|page)|from\s+the\s+(?:website|link|source)|github\s+repo|arxiv\s+paper|wikipedia\s+article|reddit\s+post|official\s+announcement|online\s+document)\b/i.test(query) ||
    /(?:ভিজিট|লিংক|লিংকে|ওয়েবসাইট|ওয়েবসাইট|সাইট|সাইটে|সোর্স|সূত্র|পেজ|পেইজ)\s*(?:থেকে|গিয়ে|গিয়ে|দেখে|দেখো|দেখুন|খুঁজে|পড়ে|পড়ে|চেক)?/i.test(query) ||
    /\b(?:visit\s*kore|visit\s*koro|link\s*e|link\s*ta|website\s*e|site\s*e|source\s*theke)\b/i.test(query);
  if (isSpecificOnlineSourceRequest) {
    return true;
  }

  // ---------------------------------------------------------------------------
  // HARD NEGATIVE GUARDS (DO NOT SEARCH FOR STABLE, CASUAL, CREATIVE, OR PURE LOGIC)
  // ---------------------------------------------------------------------------

  // Negative Guard 1: Normal casual conversation & greetings
  const isGreetingOrCasual =
    /^(?:hi|hello|hey|hola|assalamu\s*alaikum|salam|kemon\s*acho|good\s*morning|good\s*afternoon|good\s*evening|good\s*night|bye|goodbye|tumi\s*ke|apni\s*ke|ধন্যবাদ|thanks|thank\s*you|ok|okay|cool|nice|how\s+are\s+you(?:\s+today)?|how\s+is\s+your\s+day|how\s+is\s+it\s+going|কেমন\s*আছো|কেমন\s*আছেন)[\s!.?]*$/i.test(query) ||
    /^(?:hello|hi|hey)[\s,]+(?:how\s+are\s+you|what['’]?s\s+up|kemon\s+acho)[\s\w?.!]*$/i.test(query);
  if (isGreetingOrCasual) return false;

  // Negative Guard 2: Mathematics, pure calculations & arithmetic
  const isPureMath =
    /^[\d\s+\-*/%^().=x÷]+$/.test(query) ||
    /^(?:what\s+is|calculate|solve|evaluate)\s+[\d\s+\-*/%^().=]+$/i.test(query) ||
    /\b(?:integral|derivative|algebra|logarithm|pythagoras|matrix\s+multiplication|square\s+root)\b/i.test(query) ||
    /(?:যোগ|বিয়োগ|গুণ|ভাগ|অংক|হিসাব|সমাধান\s*করো)/i.test(query);
  if (isPureMath) return false;

  // Negative Guard 3: Creative writing, letters, emails, essays, poems, storytelling
  const isWritingOrDrafting =
    /^(?:write|compose|draft|generate|create)\s+(?:an?\s+)?(?:essay|poem|poetry|story|letter|email|cover\s+letter|speech|script|dialogue|resume|cv|blog\s+post|paragraph|article)\b/i.test(query) ||
    /(?:একটি\s*)?(?:রচনা|কবিতা|গল্প|চিঠি|দরখাস্ত|ইমেইল|ভাষণ|সংলাপ)\s*(?:লেখ|লিখ|লিখুন|বানাও|বানান)/i.test(query) ||
    /\b(?:kobita\s*likho|rocona\s*likho|golpo\s*likho|email\s*likhe\s*dao|letter\s*likho)\b/i.test(query);
  if (isWritingOrDrafting) {
    return false;
  }

  // Negative Guard 4: Summarization, translation, rewriting, grammar fixing of user-provided content
  const isUserProvidedContent =
    /^(?:summarize|translate|paraphrase|proofread|rephrase|rewrite|fix\s+grammar|correct|analyze\s+this|explain\s+this)\b/i.test(query) ||
    /(?:অনুবাদ\s*করো|সারাংশ\s*লেখ|গ্রামার\s*চেক|সংশোধন\s*করো|রিরাইট\s*করো)/i.test(query);
  if (isUserProvidedContent) {
    return false;
  }

  // Negative Guard 5: Basic programming concepts & stable algorithmic logic
  // (Exempts queries about current versions, new library features, API pricing, or SDK docs)
  const isCurrentTechOrSoftware =
    /\b(?:latest\s+version|current\s+version|new\s+version|v\d+\.\d+|release\s+notes|changelog|new\s+features\s+in|deprecated\s+in|pricing\s+of\s+.*api|api\s+pricing|current\s+sdk|current\s+api|documentation\s+for|docs\s+for|supported\s+models|gemini\s+api|openai\s+api|claude\s+api|groq\s+api|next\.?js\s+\d+|react\s+\d+|python\s+3\.\d+|tailwind\s+v?\d+)\b/i.test(query) ||
    /(?:লেটেস্ট\s*ভার্সন|নতুন\s*ভার্সন|নতুন\s*কী\s*ফিচার|এপিআই\s*প্রাইসিং|ডকুমেন্টেশন)/i.test(query);

  if (!isCurrentTechOrSoftware) {
    const isBasicCodingOrStableConcept =
      /```[\s\S]*?```/.test(cleanQuery) ||
      /\b(?:how\s+to\s+(?:write|code|implement|sort|filter|map|loop)|explain\s+(?:what\s+is\s+)?(?:recursion|binary\s+search|bubble\s+sort|quicksort|linked\s+list|stack|queue|for\s+loop|while\s+loop|function|variable|pointer|class\s+in\s+cpp|object\s+in\s+javascript))\b/i.test(query) ||
      /\b(?:syntax\s+error|typeerror|nullpointer|bug\s+in\s+my\s+code|console\.log|regex\s+for\s+(?:email|phone|url|digits))\b/i.test(query) ||
      /(?:কোড\s*(?:লেখ|লিখ|কর|দাও)|প্রোগ্রামিং|ফাংশন|অ্যালগরিদম|বাগ\s*ফিক্স|সিনট্যাক্স)/i.test(query) ||
      /\b(?:code\s*likhe\s*dao|function\s*likho|code\s*kore\s*dao|error\s*ki)\b/i.test(query);
    if (isBasicCodingOrStableConcept) return false;
  }

  // Negative Guard 6: Static general science & fundamental knowledge (photosynthesis, gravity, ancient history, definitions)
  const isStaticGeneralKnowledge =
    /^(?:what\s+is|who\s+was|who\s+discovered|who\s+invented|explain|define|how\s+does\s+(?:a\s+|an\s+)?(?:airplane|refrigerator|engine|camera|microwave|telescope)\s+work)\s+(?:what\s+is\s+)?(?:photosynthesis|gravity|dna|rna|atom|molecule|relativity|evolution|mitosis|osmosis|plate\s+tectonics|speed\s+of\s+light|solar\s+system|water\s+cycle|einstein|newton|galileo|shakespeare|plato|aristotle)\b/i.test(query) ||
    /(?:সালোকসংশ্লেষণ|মহাকর্ষ|আপেক্ষিকতা|ডিএনএ|পরমাণু|সৌরজগত|আলোর\s*গতি|আইনস্টাইন|নিউটন)\s*(?:কী|কি|বলতে\s*কী|কাকে\s*বলে)/i.test(query);
  if (isStaticGeneralKnowledge) {
    return false;
  }

  // ---------------------------------------------------------------------------
  // DECISION BRANCH B & D: CURRENT, CHANGING, LOCATION, PRICING, & TIME-SENSITIVE INFO
  // ---------------------------------------------------------------------------

  // 1. CURRENT / LATEST INFORMATION
  // (latest information, current information, today's information, recent developments, recent updates, "what is happening now", information that may have changed)
  const isCurrentOrLatestInfo =
    /\b(?:latest\s+information|current\s+information|today'?s\s+information|recent\s+developments|recent\s+updates|what\s+is\s+happening\s+now|what['’]?s\s+happening\s+now|happening\s+now|right\s+now|update\s+on|latest\s+update|current\s+update|recent\s+update|kono\s+update|notun\s+update|update\s+news|update\s+ki|update\s+dao|update\s+bolo|update\s+jante|update\s+ache|er\s+update|somporke\s+update|bepare\s+update|information\s+(?:changed|updated))\b/i.test(query) ||
    /\b(?:update|updates)\b/i.test(query) ||
    /(?:আপডেট)/i.test(query) ||
    /(?:বর্তমান\s*তথ্য|আজকের\s*তথ্য|সাম্প্রতিক\s*উন্নয়ন|সাম্প্রতিক\s*আপডেট|এখন\s*কী\s*হচ্ছে|এখন\s*কি\s*হচ্ছে|চলমান\s*পরিস্থিতি|কোনো\s*আপডেট|নতুন\s*আপডেট|সর্বশেষ\s*আপডেট|আপডেট\s*নিউজ|আপডেট\s*খবর|আপডেট\s*কী|আপডেট\s*কি|আপডেট\s*বলো|আপডেট\s*দাও|আপডেট\s*জানতে|আপডেট\s*আছে|সম্পর্কে\s*আপডেট|নিয়ে\s*আপডেট|এর\s*আপডেট)/i.test(query);
  if (isCurrentOrLatestInfo) {
    return true;
  }

  // 2. NEWS AND RECENT EVENTS
  // (current news, recent events, breaking developments, recent announcements, current public developments)
  const isNewsAndRecentEvents =
    /\b(?:current\s+news|recent\s+news|breaking\s+news|breaking\s+developments|recent\s+events|recent\s+announcements|public\s+developments|latest\s+news|today'?s\s+news|fresh\s+news|headlines?|news\s+today|news\s+about|news\s+on|news\s+update|world\s+news|bd\s+news|bangladesh\s+news)\b/i.test(query) ||
    /\b(?:ajker\s*khobor|taja\s*khobor|breaking\s*news|notun\s*khobor|shamprotik\s*khobor|shesh\s*khobor|shobsesh\s*khobor|khobor\s*ki|news\s*ki|kono\s*khobor|kono\s*news)\b/i.test(query) ||
    /(?:ব্রেকিং\s*নিউজ|আজকের\s*খবর|তাজা\s*খবর|সর্বশেষ\s*খবর|সর্বশেষ\s*সংবাদ|সাম্প্রতিক\s*ঘটনা|সাম্প্রতিক\s*ঘোষণা|নতুন\s*খবর|আজকের\s*সংবাদ|তাজা\s*সংবাদ|নতুন\s*সংবাদ|খবর\s*কী|খবর\s*কি|সংবাদ\s*কী|সংবাদ\s*কি|কোনো\s*সংবাদ|কোনো\s*খবর)/i.test(query);
  if (isNewsAndRecentEvents) {
    return true;
  }

  // 4. CURRENT PEOPLE / ORGANIZATIONS / COMPANIES
  // (public figures, companies, organizations, products, services, current roles, current announcements, current activities)
  const isCurrentPeopleOrOrganizations =
    /\b(?:current\s+(?:ceo|president|prime\s+minister|chief\s+adviser|chief\s+advisor|minister|governor|chairman|director|leader|head|coach|captain)|who\s+is\s+(?:the\s+)?(?:current\s+)?(?:ceo|president|prime\s+minister|chief\s+adviser|chief\s+advisor|minister|governor|chairman|leader|head)|current\s+role\s+of|latest\s+(?:announcement|news|product|statement)\s+from\s+(?:openai|google|microsoft|apple|meta|tesla|anthropic|nvidia|amazon|spacex)|announcement\s+by\s+[a-z]+|current\s+activities\s+of|board\s+of\s+directors\s+of)\b/i.test(query) ||
    /(?:বর্তমান\s*(?:প্রধান\s*উপদেষ্টা|প্রধানমন্ত্রী|রাষ্ট্রপতি|প্রেসিডেন্ট|উপদেষ্টা|মন্ত্রী|গভর্নর|চেয়ারম্যান|চেয়ারম্যান|সিইও|পরিচালক|অধিনায়ক|অধিনায়ক|কোচ|নেতা)|বর্তমান\s*দায়িত্বে|সাম্প্রতিক\s*কার্যক্রম)/i.test(query) ||
    /\b(?:bortoman\s*(?:prodhan\s*upodesta|pm|president|governor|ceo|captain|coach|leader))\b/i.test(query);
  if (isCurrentPeopleOrOrganizations) {
    return true;
  }

  // 5. CURRENT PRODUCTS / SERVICES
  // (current products, newly released products, product availability, current features, current specifications, current pricing, current plans, current service availability)
  const isCurrentProductsOrServices =
    /\b(?:newly\s+released|recently\s+released|is\s+.*(?:available|released|launched)|product\s+availability|current\s+features\s+of|current\s+specs\s+of|current\s+specifications|current\s+plans\s+of|service\s+availability|plans\s+and\s+pricing\s+of|when\s+was\s+.*released|release\s+date\s+of|current\s+pricing\s+of)\b/i.test(query) ||
    /(?:নতুন\s*রিলিজ|রিলিজ\s*হয়েছে\s*কিনা|রিলিজ\s*ডেট|পাওয়া\s*যাচ্ছে\s*কিনা|বর্তমান\s*ফিচার|বর্তমান\s*স্পেসিফিকেশন|বর্তমান\s*প্ল্যান|মূল্য\s*কত)/i.test(query) ||
    /\b(?:notun\s*release|kobe\s*release\s*hobe|release\s*date|available\s*kina|pawa\s*jacche\s*kina)\b/i.test(query);
  if (isCurrentProductsOrServices) {
    return true;
  }

  // 6. SHOPPING / PRODUCT RESEARCH
  // (find products, compare currently available products, research products to buy, find current prices, find current deals, find where something is available)
  const isShoppingOrProductResearch =
    /\b(?:where\s+to\s+buy|best\s+.*to\s+buy\s+(?:now|in\s+2025|in\s+2026|today)|compare\s+.*(?:and|vs|with)\s+.*(?:specs|price|features)|find\s+deals\s+on|current\s+deals|discount\s+on|best\s+budget\s+(?:phone|laptop|monitor|camera|headphone|earbuds|tablet)|where\s+can\s+i\s+(?:buy|order|purchase)|is\s+.*in\s+stock|where\s+is\s+.*available)\b/i.test(query) ||
    /(?:কোথায়\s*(?:কিনতে\s*পাব|পাওয়া\s*যাবে|কিনা\s*যায়)|বর্তমান\s*বাজারদর|কোনটা\s*কেনা\s*ভালো\s*হবে|সেরা\s*বাজেট|ডিসকাউন্ট\s*বা\s*অফার|স্টকে\s*আছে\s*কিনা)/i.test(query) ||
    /\b(?:kothay\s*pabo|kothay\s*kina\s*jabe|kothay\s*kinbo|best\s*phone\s*ekhon|dam\s*koto|offer\s*ache\s*kina)\b/i.test(query);
  if (isShoppingOrProductResearch) {
    return true;
  }

  // 7. RECOMMENDATIONS REQUIRING CURRENT ONLINE INFORMATION
  // (restaurants, hotels, travel, products, services, software/tools, current places or businesses, current availability)
  const isCurrentOnlineRecommendations =
    /\b(?:best\s+restaurants\s+in|top\s+hotels\s+in|places\s+to\s+visit\s+in\s+.*(?:this\s+year|this\s+month|now|today|season)|recommended\s+tools\s+for\s+.*(?:in\s+2025|in\s+2026|now)|best\s+(?:software|tools|apps)\s+for\s+.*(?:in\s+2025|in\s+2026|now)|currently\s+open\s+cafes|good\s+resorts\s+in|top\s+rated\s+(?:places|stays|resorts|destinations))\b/i.test(query) ||
    /(?:সেরা\s*রেস্টুরেন্ট|সেরা\s*হোটেল|কোথায়\s*থাকা\s*যায়|ঘোরার\s*জায়গা|সেরা\s*(?:সফটওয়্যার|টুলস|অ্যাপস)\s*(?:২০২৫|২০২৬|এখন))/i.test(query) ||
    /\b(?:bhalo\s*restaurant|bhalo\s*hotel|kothay\s*ghurte\s*jabo|top\s*tools\s*for|top\s*apps\s*for)\b/i.test(query);
  if (isCurrentOnlineRecommendations) {
    return true;
  }

  // 8. LOCAL / LOCATION-DEPENDENT INFORMATION
  // (nearby businesses, restaurants, stores, events, opening hours, local services, local conditions, things currently happening in a place)
  const isLocalOrLocationInfo =
    /\b(?:near\s+me|nearby|opening\s+hours|closing\s+time|is\s+.*open\s+(?:now|today)|opening\s+time|events\s+in\s+[a-z]+|traffic\s+in\s+[a-z]+|happenings\s+in\s+[a-z]+|local\s+conditions\s+in|local\s+services\s+in)\b/i.test(query) ||
    /(?:কাছে\s*কোনো|আশেপাশে|কখন\s*খোলে|কখন\s*বন্ধ\s*হয়|এখন\s*খোলা\s*আছে\s*কিনা|আজকে\s*খোলা\s*কিনা|এলাকায়\s*কী\s*হচ্ছে|এলাকার\s*অবস্থা)/i.test(query) ||
    /\b(?:kache\s*kono|khola\s*ache\s*kina|opening\s*time\s*ki|closing\s*time\s*ki|traffic\s*kemon)\b/i.test(query);
  if (isLocalOrLocationInfo) {
    return true;
  }

  // 9. CURRENT PRICES / MARKETS / FINANCIAL DATA
  // (current stock prices, cryptocurrency prices, exchange rates, current market information, current financial data, current product/service prices)
  const isCurrentFinancialData =
    /\b(?:stock\s*price|share\s*market|bitcoin\s*price|ethereum\s*price|crypto\s*price|exchange\s*rate|dollar\s*rate|usd\s+to\s+bdt|gold\s*rate|gold\s*price|silver\s*price|current\s*inflation|market\s*cap\s+of|price\s+of\s+.*today)\b/i.test(query) ||
    /(?:শেয়ার\s*বাজার|শেয়ার\s*বাজার|স্টক\s*প্রাইস|বিটকয়েনের\s*দাম|ক্রিপ্টো\s*প্রাইস|ডলার\s*রেট|ডলারের\s*দাম|সোনার\s*দাম|স্বর্ণের\s*দাম|ভরি\s*কত|মুদ্রার\s*বিনিময়\s*হার|মুদ্রাস্ফীতির\s*হার)/i.test(query) ||
    /\b(?:dollar\s*rate|sonar\s*dam|vori\s*koto|crypto\s*price|bitcoin\s*dam|share\s*bajar|dam\s*koto)\b/i.test(query);
  if (isCurrentFinancialData) {
    return true;
  }

  // 10. TRAVEL / TRANSPORT / SCHEDULES
  // (flights, trains, buses, schedules, routes, delays, cancellations, travel availability, current travel information)
  const isTravelOrSchedules =
    /\b(?:flight\s+schedule|train\s+schedule|bus\s+schedule|ferry\s+schedule|flight\s+status|flight\s+delay|train\s+delay|cancelled\s+flights?|ticket\s+availability|current\s+visa\s+requirements|travel\s+restrictions\s+to|train\s+timing|bus\s+timing|travel\s+availability)\b/i.test(query) ||
    /(?:ট্রেনের\s*সময়সূচি|ফ্লাইট\s*শিডিউল|বাসের\s*সময়সূচি|ফেরি\s*চলাচল|টিকেট\s*আছে\s*কিনা|ভিসা\s*প্রসেসিং|ফ্লাইট\s*দেরি\s*বা\s*বাতিল)/i.test(query) ||
    /\b(?:train\s*er\s*schedule|flight\s*schedule|ticket\s*ache\s*kina|train\s*cholche\s*kina|flight\s*delay)\b/i.test(query);
  if (isTravelOrSchedules) {
    return true;
  }

  // 11. CURRENT WEATHER / ENVIRONMENTAL CONDITIONS
  // (current weather, forecasts, current environmental conditions, current alerts)
  const isCurrentWeatherOrEnvironment =
    /\b(?:current\s+weather|weather\s+today|weather\s+forecast|rain\s+(?:today|tomorrow)|temperature\s+right\s+now|weather\s+in\s+[a-z]+|air\s+quality|aqi\s+in\s+[a-z]+|cyclone\s+alert|storm\s+warning|flood\s+warning|weather\s+alert|environmental\s+conditions)\b/i.test(query) ||
    /(?:আজকের\s*আবহাওয়া|আজকের\s*আবহাওয়া|বৃষ্টি\s*হবে\s*কিনা|আজকের\s*তাপমাত্রা|ঘূর্ণিঝড়ের\s*সংকেত|বন্যা\s*পরিস্থিতি|বাতাসের\s*মান|বায়ু\s*দূষণ|ঝড়ের\s*খবর)/i.test(query) ||
    /\b(?:ajker\s*weather|brishti\s*hobe\s*kina|temperature\s*koto|cyclone\s*alert|weather\s*kemon)\b/i.test(query);
  if (isCurrentWeatherOrEnvironment) {
    return true;
  }

  // 12. CURRENT SPORTS INFORMATION
  // (live scores, current matches, schedules, standings, rankings, current player/team information, recent results, current tournaments)
  const isCurrentSports =
    /\b(?:live\s*score|match\s*score|cricket\s*score|football\s*score|points\s*table|standings\s+of|team\s+rankings?|player\s+rankings?|who\s+won\s+the\s+match|match\s+result|yesterday'?s\s+match|upcoming\s+matches|world\s*cup|ipl|bpl|champions\s*league|premier\s*league|ballon\s+d'?or|man\s+of\s+the\s+match|who\s+became\s+champion|who\s+won|ke\s+jitse|ke\s+jiteche)\b/i.test(query) ||
    /(?:লাইভ\s*স্কোর|ম্যাচ\s*স্কোর|খেলার\s*স্কোর|পয়েন্ট\s*টেবিল|কে\s*জিতল|কে\s*জিতেছে|খেলার\s*সময়সূচি|ম্যাচের\s*ফলাফল|বিপিএল|আইপিএল|বিশ্বকাপ|চ্যাম্পিয়ন|ম্যান\s*অব\s*দ্য\s*ম্যাচ)/i.test(query) ||
    /\b(?:live\s*score|khela\s*kobe|match\s*er\s*score|ke\s*jitlo|ke\s*jiteche|points\s*table|match\s*result)\b/i.test(query);
  if (isCurrentSports) {
    return true;
  }

  // 13. CURRENT LAWS / RULES / POLICIES / REGULATIONS
  // (current laws, regulations, official rules, government policies, current terms/policies, recently changed rules)
  const isCurrentLawsOrPolicies =
    /\b(?:current\s+laws?|new\s+regulations?|official\s+rules?|government\s+policy|government\s+policies|new\s+gazette|latest\s+circular|tax\s+rules?\s+(?:in\s+2025|in\s+2026|today|current)|visa\s+policy|traffic\s+rules?\s+update|recently\s+changed\s+rules|passport\s+rules?)\b/i.test(query) ||
    /(?:নতুন\s*আইন|সরকারি\s*প্রজ্ঞাপন|গেজেট|নতুন\s*নিয়ম|ট্যাক্স\s*বিধি|ভিসা\s*পলিসি|পাসপোর্টের\s*নতুন\s*নিয়ম|ট্রাফিক\s*নিয়ম|সরকারি\s*নীতিমালা)/i.test(query) ||
    /\b(?:notun\s*niyam|notun\s*ain|sorkari\s*proggapon|tax\s*er\s*niyam|visa\s*policy)\b/i.test(query);
  if (isCurrentLawsOrPolicies) {
    return true;
  }

  // 14. SOFTWARE / API / TECHNICAL INFORMATION THAT MAY HAVE CHANGED
  // (current software features, current API documentation, current SDKs, current library versions, current platform capabilities, current pricing, current service documentation, recent technical changes)
  if (isCurrentTechOrSoftware) {
    return true;
  }

  // 16. FACTUAL QUESTIONS WHERE INFORMATION IS TIME-SENSITIVE OR UNCERTAIN
  // (information that could reasonably have changed, time-sensitive facts, "last kobe ki hoise", past recent event timing, election results, dynamic verification)
  const isTimeSensitiveOrUncertainFact =
    /\b(?:last\s*kobe|shesh\s*kobe|shobsesh\s*kobe|kobe\s+(?:ki\s+)?(?:hoise|hoyeche|hoyechilo|ghotse|ghoteche|ghotlo|holo|shesh|shuru|release|asbe|ashbe)|last\s+(?:time|event|incident|earthquake|cyclone|election|accident)|what\s+happened|what\s+just\s+happened|what\s+happened\s+recently|what['’]?s\s+the\s+latest\s+on|election\s+results?|who\s+won\s+the\s+election|death\s+toll\s+of|casualties\s+in|current\s+status\s+of\s+.*(?:war|conflict|crisis|treaty|talks)|current\s+situation|bortoman\s+obostha)\b/i.test(query) ||
    /(?:লাস্ট\s*কবে|শেষ\s*কবে|সর্বশেষ\s*কবে|কবে\s*(?:কী|কি)\s*(?:হয়েছে|হয়েছিল|হইছে|হইছিল|ঘটলো|ঘটল|ঘটেছে|ঘটেছিল)|কবে\s*(?:হয়েছে|হয়েছিল|হইছে|হইছিল|ঘটেছে|ঘটেছিল|ঘটলো|ঘটল|হলো|হল)|কী\s*(?:হয়েছে|হইছে|ঘটেছে|ঘটলো|হলো)|কি\s*(?:হয়েছে|হইছে|ঘটেছে|ঘটলো|হলো)|নির্বাচনের\s*ফলাফল|হতাহতের\s*সংখ্যা|যুদ্ধ\s*পরিস্থিতি|বর্তমান\s*অবস্থা)/i.test(query) ||
    /\b(?:last\s*kobe\s*earthquake|kobe\s*ki\s*hoise|election\s*result|ki\s*ghotse|ki\s*hoise)\b/i.test(query);
  if (isTimeSensitiveOrUncertainFact) {
    return true;
  }

  // Dynamic Temporal Anchor Catch-all (questions asking for facts anchored in current year/recent times)
  const hasDynamicTemporalAnchor =
    /\b(?:latest|recent|recently|currently|today|yesterday|this\s+week|this\s+month|this\s+year|right\s+now|nowadays|presently|upcoming|newest)\b/i.test(query) ||
    /\b(?:ajker|gotokal|eibochor|shamprotik|ekhon|ekhonkar|notun|shobsesh|bortoman)\b/i.test(query) ||
    /(?:আজকের|গতকাল|এই\s*বছর|সাম্প্রতিক|এখনকার|এখন|নতুন|সর্বশেষ|বর্তমান|চলতি|আসন্ন)/i.test(query) ||
    /\b(?:2025|2026)\b/.test(query);
  if (hasDynamicTemporalAnchor) {
    return true;
  }

  return false;
}

/**
 * Clean and focus the search query for search engines.
 */
export function extractExaSearchQuery(userMessage: string): string {
  const original = stripAttachmentContextFromQuery(userMessage);
  let query = original;

  // 1. Strip conversational prefixes (English, Bengali, Banglish)
  query = query.replace(/^(?:please\s+)?(?:can\s+you\s+)?(?:search\s+(?:the\s+)?(?:web|internet|online|google|exa)\s+(?:for|about|and\s+tell\s+me)?\s*)/i, '');
  query = query.replace(/^(?:search\s+for|look\s+up(?:\s+for)?|find\s+out\s+about|check\s+online\s+for|give\s+me\s+the\s+latest\s+update\s+on|tell\s+me\s+(?:about\s+)?(?:the\s+)?latest\s+update\s+on|tell\s+me\s+about)\s*/i, '');
  query = query.replace(/^(?:ইন্টারনেটে\s*খোঁজ\s*করো|অনলাইনে\s*সার্চ\s*করো|গুগলে\s*সার্চ\s*করো|সার্চ\s*করে\s*বলো|সার্চ\s*করো|খুঁজে\s*দেখো|খুঁজে\s*বলো)\s*/i, '');
  query = query.replace(/\b(?:search\s*kore\s*dekho|search\s*kore\s*bolo|khuje\s*dekho|khuje\s*bolo|visit\s*kore\s*dekho|visit\s*koro)\b/gi, '');

  // 2. Strip conversational inquiry endings & request verbs (Banglish & Bengali)
  query = query.replace(/\b(?:jante\s*chai|jante\s*cai|jante\s*caile|janan|janaw|bolo\s*to|bolo|bolun|dao|den|de|dite|ache\s*kina|pawa\s*jabe|paoa\s*jabe|bolte\s*parbe)\b/gi, '');
  query = query.replace(/(?:জানতে\s*চাইলে|জানতে\s*চাই|জানান|জানাও|বলো\s*তো|বলো|বলুন|দাও|দিন|আছে\s*কিনা|আছে\s*কি|পাওয়া\s*যাবে|বলতে\s*পারবেন|বলতে\s*পারবে)/gi, '');

  // 3. Clean trailing punctuation and question marks
  query = query.replace(/[?।!]+$/, '').trim();

  // 4. Handle "last kobe ... hoise/hoyeche" -> keep topic clean
  // e.g. "Bangladesh e last kobe earthquake hoise" -> "Bangladesh last earthquake"
  query = query.replace(/\b(?:kobe\s+(?:ki\s+)?(?:hoise|hoyeche|hoyechilo|ghotse|ghoteche|ghotlo|holo))\b/gi, '');
  query = query.replace(/(?:কবে\s*(?:কী|কি)\s*(?:হয়েছে|হয়েছিল|হইছে|হইছিল|ঘটলো|ঘটল|ঘটেছে|ঘটেছিল))/gi, '');
  query = query.replace(/(?:কবে\s*(?:হয়েছে|হয়েছিল|হইছে|হইছিল|ঘটেছে|ঘটেছিল|ঘটলো|ঘটল|হলো|হল))/gi, '');
  query = query.replace(/\b(?:hoise|hoyeche|hoyechilo|ghotse|ghoteche|ghotlo)\b/gi, '');

  // 5. Clean connecting prepositions/postpositions if they dangle
  query = query.replace(/\b(?:er\s+kono|er\s+bepare|er\s+somporke|er\s+shomporke|niye|bepare|somporke|shomporke)\b/gi, '');
  query = query.replace(/(?:এর\s*কোনো|এর\s*কোন|সম্পর্কে|নিয়ে|ব্যাপারে)/gi, '');

  // 6. Clean excess spaces
  query = query.replace(/\s+/g, ' ').trim();

  // 7. If the cleaned query is too short or empty, fall back gracefully
  if (query.length < 3) {
    return original;
  }

  return query;
}

/**
 * Decode common HTML entities into clean text.
 */
function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;|&#x27;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&ndash;|&#8211;/gi, '–')
    .replace(/&mdash;|&#8212;/gi, '—')
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return code > 0 ? String.fromCharCode(code) : '';
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = parseInt(hex, 16);
      return code > 0 ? String.fromCharCode(code) : '';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Directly visit and extract readable content, title, description, and headlines from any URL.
 */
export async function fetchUrlContent(
  targetUrl: string,
  timeoutMs: number = 6000
): Promise<ExaSearchResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept':
          'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,text/plain;q=0.7,*/*;q=0.5',
        'Accept-Language': 'bn-BD,bn;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      return null;
    }

    const finalUrl = res.url || targetUrl;
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const rawBody = await res.text();

    if (!rawBody || rawBody.trim().length === 0) {
      return null;
    }

    // Handle JSON or plain text endpoints directly
    if (contentType.includes('application/json') || contentType.includes('text/plain')) {
      return {
        title: getReadableSourceName(finalUrl) + ' — ' + finalUrl,
        url: finalUrl,
        sourceName: getReadableSourceName(finalUrl),
        domain: getDomainFromUrl(finalUrl),
        text: rawBody.slice(0, 4000),
      };
    }

    // Parse HTML content
    const titleMatch =
      rawBody.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
      rawBody.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i) ||
      rawBody.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const rawTitle = titleMatch ? decodeHtmlEntities(titleMatch[1]) : '';

    const siteNameMatch =
      rawBody.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i) ||
      rawBody.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i);
    const siteName = siteNameMatch ? decodeHtmlEntities(siteNameMatch[1]) : '';

    const descMatch =
      rawBody.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
      rawBody.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
      rawBody.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    const metaDesc = descMatch ? decodeHtmlEntities(descMatch[1]) : '';

    const pubDateMatch =
      rawBody.match(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i) ||
      rawBody.match(/<time[^>]+datetime=["']([^"']+)["']/i);
    const publishedDate = pubDateMatch ? pubDateMatch[1].trim() : undefined;

    // Extract headings (h1, h2, h3) for news homepages or article sections
    const headings: string[] = [];
    const headingRegex = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
    let hMatch: RegExpExecArray | null;
    while ((hMatch = headingRegex.exec(rawBody)) !== null && headings.length < 18) {
      const cleanH = decodeHtmlEntities(hMatch[1].replace(/<[^>]+>/g, ' '));
      if (cleanH.length >= 12 && cleanH.length <= 220 && !headings.includes(cleanH)) {
        headings.push(cleanH);
      }
    }

    // Strip non-content HTML tags to get clean article paragraphs
    const cleanedHtml = rawBody
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ');

    const paragraphs: string[] = [];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let pMatch: RegExpExecArray | null;
    while ((pMatch = pRegex.exec(cleanedHtml)) !== null && paragraphs.length < 25) {
      const cleanP = decodeHtmlEntities(pMatch[1].replace(/<[^>]+>/g, ' '));
      if (cleanP.length >= 35 && !paragraphs.includes(cleanP)) {
        paragraphs.push(cleanP);
      }
    }

    let fullText = '';
    if (metaDesc) {
      fullText += `Summary: ${metaDesc}\n`;
    }
    if (headings.length > 0) {
      fullText += `Key Headings / Headlines on Page:\n- ${headings.slice(0, 12).join('\n- ')}\n`;
    }
    if (paragraphs.length > 0) {
      fullText += `Article / Page Content:\n${paragraphs.join('\n')}`;
    } else {
      const fallbackPlain = decodeHtmlEntities(cleanedHtml.replace(/<[^>]+>/g, ' '));
      fullText += fallbackPlain.slice(0, 3000);
    }

    const sourceName = getReadableSourceName(finalUrl, siteName);
    return {
      title: rawTitle || `${sourceName} (${getDomainFromUrl(finalUrl)})`,
      url: finalUrl,
      sourceName,
      domain: getDomainFromUrl(finalUrl),
      publishedDate,
      text: fullText.trim().slice(0, 4200),
    };
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/**
 * Live Google News RSS Search — Zero API key needed, supports both Bengali and English,
 * returns real-time news articles, exact publication dates, and authoritative source names.
 */
async function searchGoogleNewsRss(
  query: string,
  siteDomain?: string,
  maxItems: number = 5
): Promise<ExaSearchResult[]> {
  const isBengaliQuery = /[\u0980-\u09FF]/.test(query);
  const effectiveQuery = siteDomain && !query.toLowerCase().includes(siteDomain.toLowerCase())
    ? `${query} site:${siteDomain}`
    : query;

  const langParams = isBengaliQuery
    ? 'hl=bn&gl=BD&ceid=BD:bn'
    : 'hl=en-US&gl=US&ceid=US:en';

  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(effectiveQuery)}&${langParams}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AestificSearch/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return [];
    const xml = await res.text();
    const results: ExaSearchResult[] = [];

    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(xml)) !== null && results.length < maxItems) {
      const itemXml = match[1];
      const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/i);
      const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/i);
      const pubDateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
      const sourceMatch = itemXml.match(/<source(?:\s+url=["']([^"']+)["'])?[^>]*>([\s\S]*?)<\/source>/i);
      const descMatch = itemXml.match(/<description>([\s\S]*?)<\/description>/i);

      const rawTitle = titleMatch ? decodeHtmlEntities(titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '')) : '';
      const rawLink = linkMatch ? linkMatch[1].trim() : '';
      const pubDate = pubDateMatch ? pubDateMatch[1].trim() : undefined;
      const sourceUrl = sourceMatch?.[1]?.trim() || '';
      const sourceName = sourceMatch?.[2] ? decodeHtmlEntities(sourceMatch[2]) : '';
      const rawDesc = descMatch
        ? decodeHtmlEntities(descMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' '))
        : '';

      if (rawTitle && rawLink) {
        // Prefer direct publisher URL or clean link; if Google News redirect, also note sourceUrl
        const displayUrl = sourceUrl && rawLink.includes('news.google.com') ? rawLink : rawLink;
        const domain = sourceUrl ? getDomainFromUrl(sourceUrl) : getDomainFromUrl(rawLink);
        const resolvedSourceName = sourceName || getReadableSourceName(sourceUrl || rawLink);

        results.push({
          title: rawTitle,
          url: displayUrl,
          sourceName: resolvedSourceName,
          domain: domain || 'news.google.com',
          publishedDate: pubDate,
          text: `${rawTitle}. ${rawDesc}${pubDate ? ` (Published: ${pubDate})` : ''}${sourceUrl ? ` [Publisher: ${resolvedSourceName} - ${sourceUrl}]` : ''}`.trim(),
        });
      }
    }

    return results;
  } catch {
    clearTimeout(timer);
    return [];
  }
}

/**
 * Live DuckDuckGo HTML Web Search — Zero API key needed, returns organic web search results
 * with resolved destination URLs, titles, and text snippets.
 */
async function searchDuckDuckGoHtml(
  query: string,
  siteDomain?: string,
  maxItems: number = 5
): Promise<ExaSearchResult[]> {
  const effectiveQuery = siteDomain && !query.toLowerCase().includes(siteDomain.toLowerCase())
    ? `site:${siteDomain} ${query}`
    : query;

  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(effectiveQuery)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5500);

  try {
    const res = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'bn-BD,bn;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return [];
    const html = await res.text();
    const results: ExaSearchResult[] = [];

    // Match result blocks in DuckDuckGo HTML
    const blockRegex = /<div[^>]+class=["'][^"']*result__body[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
    let match: RegExpExecArray | null;

    while ((match = blockRegex.exec(html)) !== null && results.length < maxItems) {
      const block = match[1];
      const titleMatch = block.match(/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
      const snippetMatch = block.match(/<a[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>/i) ||
                           block.match(/<div[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);

      if (!titleMatch) continue;

      let rawHref = decodeHtmlEntities(titleMatch[1]);
      const title = decodeHtmlEntities(titleMatch[2].replace(/<[^>]+>/g, ' '));
      const snippet = snippetMatch ? decodeHtmlEntities(snippetMatch[1].replace(/<[^>]+>/g, ' ')) : '';

      // Extract actual URL from DuckDuckGo redirect parameter (?uddg=...)
      if (rawHref.includes('uddg=')) {
        try {
          const uddgMatch = rawHref.match(/[?&]uddg=([^&]+)/);
          if (uddgMatch && uddgMatch[1]) {
            rawHref = decodeURIComponent(uddgMatch[1]);
          }
        } catch {}
      } else if (rawHref.startsWith('//')) {
        rawHref = 'https:' + rawHref;
      }

      if (!rawHref.startsWith('http') || rawHref.includes('duckduckgo.com/y.js')) {
        continue;
      }

      const sourceName = getReadableSourceName(rawHref);
      const domain = getDomainFromUrl(rawHref);

      results.push({
        title: title || sourceName,
        url: rawHref,
        sourceName,
        domain,
        text: snippet,
      });
    }

    return results;
  } catch {
    clearTimeout(timer);
    return [];
  }
}

/**
 * Live Wikipedia Search API (Supports both Bengali and English Wikipedia)
 */
async function searchWikipediaLive(query: string, maxItems: number = 2): Promise<ExaSearchResult[]> {
  const isBengali = /[\u0980-\u09FF]/.test(query);
  const wikiLang = isBengali ? 'bn' : 'en';
  const apiUrl = `https://${wikiLang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&srlimit=${maxItems}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(apiUrl, {
      headers: { 'User-Agent': 'AestificAI/1.0 (https://aestific.ai)' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return [];

    const data = (await res.json()) as any;
    const searchItems = Array.isArray(data?.query?.search) ? data.query.search : [];

    return searchItems.map((item: any) => {
      const title = String(item.title || '').trim();
      const snippet = decodeHtmlEntities(String(item.snippet || '').replace(/<[^>]+>/g, ' '));
      const pageUrl = `https://${wikiLang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`;
      return {
        title: `${title} — Wikipedia`,
        url: pageUrl,
        sourceName: isBengali ? 'উইকিপিডিয়া (Wikipedia)' : 'Wikipedia',
        domain: `${wikiLang}.wikipedia.org`,
        text: snippet,
      };
    });
  } catch {
    clearTimeout(timer);
    return [];
  }
}

/**
 * Execute Comprehensive Multi-Engine Live Web Search + Direct URL Reader.
 */
export async function searchExa(
  rawQuery: string,
  options: { numResults?: number } = {}
): Promise<ExaSearchResult[]> {
  const cleanUserPrompt = stripAttachmentContextFromQuery(rawQuery);
  const query = extractExaSearchQuery(cleanUserPrompt).slice(0, 400);
  if (!query && !cleanUserPrompt) return [];

  const numResults = Math.min(Math.max(options.numResults || 6, 1), 10);
  const explicitUrls = extractUrlsFromQuery(cleanUserPrompt);
  const sourceHint = extractSpecificSourceHint(cleanUserPrompt);

  // If user asked to visit/check a named source without a specific search topic (e.g. "prothom alo theke ajker khobor dekho"),
  // also fetch the homepage of that source directly!
  if (sourceHint.homepageUrl && explicitUrls.length === 0) {
    explicitUrls.push(sourceHint.homepageUrl);
  }

  // 1. Fetch any explicit URLs / target source homepages in parallel
  const directUrlPromises = explicitUrls.map((u) => fetchUrlContent(u, 6000));

  // 2. Exa API Search (if API key is configured)
  const exaApiPromise = (async (): Promise<ExaSearchResult[]> => {
    const apiKey = getExaApiKey();
    if (!apiKey || !query) return [];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6500);

    try {
      const searchBody: any = {
        query: sourceHint.siteDomain ? `${query} (${sourceHint.sourceLabel || sourceHint.siteDomain})` : query,
        numResults,
        type: 'auto',
        contents: {
          text: {
            maxCharacters: 1400,
          },
        },
      };
      if (sourceHint.siteDomain) {
        searchBody.includeDomains = [sourceHint.siteDomain];
      }

      const response = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(searchBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      if (!response.ok) return [];

      const data = (await response.json()) as any;
      const rawResults = Array.isArray(data?.results) ? data.results : [];

      return rawResults
        .map((item: any) => {
          const itemUrl = item.url?.trim() || '';
          return {
            id: item.id || '',
            title: item.title?.trim() || getReadableSourceName(itemUrl),
            url: itemUrl,
            sourceName: getReadableSourceName(itemUrl, item.author),
            domain: getDomainFromUrl(itemUrl),
            publishedDate: item.publishedDate,
            author: item.author,
            text:
              item.text?.trim() ||
              (Array.isArray(item.highlights) ? item.highlights.join('\n') : '') ||
              '',
            highlights: Array.isArray(item.highlights) ? item.highlights : undefined,
            score: item.score,
          };
        })
        .filter((item: ExaSearchResult) => Boolean(item.url && item.url.startsWith('http')));
    } catch {
      clearTimeout(timeoutId);
      return [];
    }
  })();

  // 3. Run DuckDuckGo Live HTML Search, Google News Live RSS, and Wikipedia in parallel
  const ddgPromise = searchDuckDuckGoHtml(query, sourceHint.siteDomain, 5);
  const gnewsPromise = searchGoogleNewsRss(query, sourceHint.siteDomain, 5);
  const wikiPromise = sourceHint.siteDomain && sourceHint.siteDomain !== 'wikipedia.org'
    ? Promise.resolve([])
    : searchWikipediaLive(query, 2);

  const [directResultsRaw, exaResults, ddgResults, gnewsResults, wikiResults] = await Promise.all([
    Promise.all(directUrlPromises),
    exaApiPromise,
    ddgPromise,
    gnewsPromise,
    wikiPromise,
  ]);

  const directResults = directResultsRaw.filter((r): r is ExaSearchResult => Boolean(r && r.url));

  // For the top 2 DuckDuckGo organic results, if their snippet is short, enrich them by fetching live page text!
  if (ddgResults.length > 0 && directResults.length === 0 && exaResults.length === 0) {
    const topToEnrich = ddgResults.slice(0, 2);
    const enrichedPages = await Promise.all(
      topToEnrich.map((item) => fetchUrlContent(item.url, 3800))
    );
    for (let i = 0; i < topToEnrich.length; i++) {
      const enriched = enrichedPages[i];
      if (enriched && enriched.text && enriched.text.length > (topToEnrich[i].text?.length || 0)) {
        topToEnrich[i].text = `${topToEnrich[i].text ? topToEnrich[i].text + '\n' : ''}${enriched.text}`.slice(0, 2800);
        if (enriched.title && enriched.title.length > 4) {
          topToEnrich[i].title = enriched.title;
        }
        if (enriched.publishedDate) {
          topToEnrich[i].publishedDate = enriched.publishedDate;
        }
      }
    }
  }

  // Gather all candidates from direct URLs, Google News RSS, Wikipedia, Exa, and DuckDuckGo
  const allCandidates = [
    ...directResults,
    ...gnewsResults,
    ...wikiResults,
    ...exaResults,
    ...ddgResults,
  ];

  // Filter out spam, low-quality aggregators, and invalid URLs
  const validCandidates = allCandidates.filter((item) => {
    if (!item || !item.url || !item.url.startsWith('http')) return false;
    const dom = item.domain || getDomainFromUrl(item.url);
    return !isLowQualityOrSpamDomain(dom);
  });

  // Sort candidates by Popularity & Authority score descending (Popular sources first!)
  // User explicitly requested direct links always stay at the very top.
  validCandidates.sort((a, b) => {
    const isDirectA = directResults.includes(a);
    const isDirectB = directResults.includes(b);
    if (isDirectA && !isDirectB) return -1;
    if (!isDirectA && isDirectB) return 1;

    const scoreA = getSourcePopularityScore(a.url, a.sourceName);
    const scoreB = getSourcePopularityScore(b.url, b.sourceName);
    return scoreB - scoreA;
  });

  // Deduplicate and ensure publisher diversity (allow max 2 articles per domain)
  const seenUrls = new Set<string>();
  const domainCounts = new Map<string, number>();
  const finalResults: ExaSearchResult[] = [];

  for (const item of validCandidates) {
    const normalizedUrl = item.url.replace(/\/+$/, '').toLowerCase();
    if (seenUrls.has(normalizedUrl)) continue;

    const dom = (item.domain || getDomainFromUrl(item.url)).toLowerCase();
    const currentDomainCount = domainCounts.get(dom) || 0;
    if (currentDomainCount >= 2 && !sourceHint.siteDomain && validCandidates.length > numResults) {
      continue;
    }

    seenUrls.add(normalizedUrl);
    domainCounts.set(dom, currentDomainCount + 1);

    finalResults.push({
      ...item,
      sourceName: item.sourceName || getReadableSourceName(item.url),
      domain: dom,
    });

    if (finalResults.length >= numResults) break;
  }

  return finalResults;
}

/**
 * Format Live Web Search & Visited Link results into grounded context for the AI engine.
 */
export function formatExaResultsForPrompt(
  userQuery: string,
  results: ExaSearchResult[]
): string {
  const cleanQuery = stripAttachmentContextFromQuery(userQuery);
  const now = new Date();
  const bdTimeStr = now.toLocaleString('en-US', {
    timeZone: 'Asia/Dhaka',
    dateStyle: 'full',
    timeStyle: 'short',
  });
  const utcTimeStr = now.toUTCString();

  if (!results || results.length === 0) {
    return `\n\n[REAL-TIME SYSTEM CLOCK]:
- Current Live Date & Time (Bangladesh Standard Time / Asia/Dhaka): ${bdTimeStr}
- Current UTC Time: ${utcTimeStr}
Always provide up-to-date answers anchored to this current real-time date.`;
  }

  let promptBlock = `\n\n[REAL-TIME SYSTEM CLOCK]:
- Current Live Date & Time (Bangladesh Standard Time / Asia/Dhaka): ${bdTimeStr}
- Current UTC Time: ${utcTimeStr}

[LIVE WEB SEARCH & VERIFIED POPULAR SOURCE RESULTS for "${cleanQuery}"]:\n`;

  results.forEach((res, idx) => {
    const srcName = res.sourceName || getReadableSourceName(res.url);
    promptBlock += `\n--- Source [${idx + 1}]: ${srcName} — "${res.title}" ---\n`;
    promptBlock += `Source Name: ${srcName}\n`;
    promptBlock += `URL: ${res.url}\n`;
    if (res.domain) promptBlock += `Domain: ${res.domain}\n`;
    if (res.publishedDate) promptBlock += `Published Date: ${res.publishedDate}\n`;
    if (res.text) {
      promptBlock += `Live Extracted Content:\n${res.text.slice(0, 1800)}\n`;
    }
  });

  promptBlock += `\n[MANDATORY INSTRUCTIONS FOR ACCURATE SOURCE CITATION & GROUNDING]:
1. REAL-TIME ACCURACY: You have just performed a live web search using popular, authoritative sources as of ${bdTimeStr}. Base your answer directly on the verified live content above.
2. CORRECT SOURCE ATTRIBUTION (CRITICAL):
   - You must cite ONLY the specific popular/verified source from the results above that actually gave you the information.
   - If Source [1] gave the match result, winner, price, or event date, cite [${results[0]?.sourceName || 'Source'}](${results[0]?.url}) right beside that factual claim.
   - Do NOT attribute facts to a source that does not contain that information.
   - Always prioritize citing established, popular, high-authority sources (e.g. Prothom Alo, The Daily Star, BBC News, Reuters, ESPNcricinfo, Wikipedia) that verified the claim.
3. INLINE CHATGPT-STYLE CITATIONS:
   - Place small markdown citation links right beside relevant sentences or statistics: [Source Name](URL).
   - Keep the citation anchor text short and clean (the name of the source, e.g. [Prothom Alo](URL) or [BBC News](URL) or [ESPNcricinfo](URL)).
4. NO GIANT URL DUMPS:
   - Do NOT append a separate "### Sources", "### 🌐 Sources", or bulleted list of URLs at the bottom of your answer.
   - Do NOT dump raw http:// or https:// links into the text. The UI already renders the citations as clean badges.
5. NEVER FABRICATE:
   - Only cite URLs provided in the live search results above.`;

  return promptBlock;
}
