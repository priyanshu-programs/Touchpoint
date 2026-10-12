// What a site does not state but its details point to. Every value from here is a
// guess and is stored and shown as one.

const regions = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });

// A two-letter country code spelled out; anything else is left as the site wrote it.
export function countryName(value: string | null) {
  if (!value || !/^[a-z]{2}$/i.test(value)) return value;
  return regions.of(value.toUpperCase()) ?? value;
}

// International calling codes that belong to one country. Shared ones (+1, +7,
// +262, +590, +599) say too little and are left out.
const CALLING_CODES: Record<string, string> = {
  20: "EG", 27: "ZA", 30: "GR", 31: "NL", 32: "BE", 33: "FR", 34: "ES", 36: "HU",
  39: "IT", 40: "RO", 41: "CH", 43: "AT", 44: "GB", 45: "DK", 46: "SE", 47: "NO",
  48: "PL", 49: "DE", 51: "PE", 52: "MX", 53: "CU", 54: "AR", 55: "BR", 56: "CL",
  57: "CO", 58: "VE", 60: "MY", 61: "AU", 62: "ID", 63: "PH", 64: "NZ", 65: "SG",
  66: "TH", 81: "JP", 82: "KR", 84: "VN", 86: "CN", 90: "TR", 91: "IN", 92: "PK",
  93: "AF", 94: "LK", 95: "MM", 98: "IR",
  211: "SS", 212: "MA", 213: "DZ", 216: "TN", 218: "LY", 220: "GM", 221: "SN",
  222: "MR", 223: "ML", 224: "GN", 225: "CI", 226: "BF", 227: "NE", 228: "TG",
  229: "BJ", 230: "MU", 231: "LR", 232: "SL", 233: "GH", 234: "NG", 235: "TD",
  236: "CF", 237: "CM", 238: "CV", 239: "ST", 240: "GQ", 241: "GA", 242: "CG",
  243: "CD", 244: "AO", 245: "GW", 248: "SC", 249: "SD", 250: "RW", 251: "ET",
  252: "SO", 253: "DJ", 254: "KE", 255: "TZ", 256: "UG", 257: "BI", 258: "MZ",
  260: "ZM", 261: "MG", 263: "ZW", 264: "NA", 265: "MW", 266: "LS", 267: "BW",
  268: "SZ", 269: "KM",
  351: "PT", 352: "LU", 353: "IE", 354: "IS", 355: "AL", 356: "MT", 357: "CY",
  358: "FI", 359: "BG", 370: "LT", 371: "LV", 372: "EE", 373: "MD", 374: "AM",
  375: "BY", 376: "AD", 377: "MC", 378: "SM", 380: "UA", 381: "RS", 382: "ME",
  383: "XK", 385: "HR", 386: "SI", 387: "BA", 389: "MK",
  420: "CZ", 421: "SK", 423: "LI",
  501: "BZ", 502: "GT", 503: "SV", 504: "HN", 505: "NI", 506: "CR", 507: "PA",
  509: "HT", 591: "BO", 592: "GY", 593: "EC", 595: "PY", 597: "SR", 598: "UY",
  670: "TL", 673: "BN", 675: "PG", 676: "TO", 677: "SB", 678: "VU", 679: "FJ",
  685: "WS",
  850: "KP", 852: "HK", 853: "MO", 855: "KH", 856: "LA", 880: "BD", 886: "TW",
  960: "MV", 961: "LB", 962: "JO", 963: "SY", 964: "IQ", 965: "KW", 966: "SA",
  967: "YE", 968: "OM", 970: "PS", 971: "AE", 972: "IL", 973: "BH", 974: "QA",
  975: "BT", 976: "MN", 977: "NP", 992: "TJ", 993: "TM", 994: "AZ", 995: "GE",
  996: "KG", 998: "UZ",
};

// Only a number written with its international code says where it rings.
export function countryFromPhone(phone: string | null | undefined) {
  if (!phone?.trim().startsWith("+")) return null;
  const digits = phone.replace(/\D/g, "");
  // No calling code starts another, so at most one length matches.
  for (const length of [1, 2, 3]) {
    const code = CALLING_CODES[digits.slice(0, length)];
    if (code) return regions.of(code) ?? null;
  }
  return null;
}

// Country domains sold to anyone as short or catchy names: no sign of where a company is.
const GENERIC_DOMAINS = new Set(
  "ac ag ai am bz cc cf co cx dj eu fm ga gd gg gl gq im io la ly me ml ms mu nu pw sc sh so st su tk to tv vc ws".split(
    " ",
  ),
);

export function countryFromDomain(host: string) {
  const label = host.toLowerCase().split(".").at(-1) ?? "";
  if (!/^[a-z]{2}$/.test(label) || GENERIC_DOMAINS.has(label)) return null;
  return regions.of(label === "uk" ? "GB" : label.toUpperCase()) ?? null;
}

const MAX_TEXT = 5000;

// Lower-case words, plurals folded, between single spaces and padded, so a keyword
// or phrase is found whole with a plain substring search: nothing here can be made
// slow by what a page says.
function wording(text: string) {
  const words = text
    .slice(0, MAX_TEXT)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word));
  return ` ${words.join(" ")} `;
}

// For each industry: the words that name the trade outright, then the words that
// only hint at it and turn up in other trades' pages too.
const INDUSTRIES = (
  [
    ["Accounting", "chartered accountant|accounting firm|bookkeeping|cpa", "accountant|accounting|audit|auditor|taxation|tax|gst|payroll"],
    ["Legal", "law firm|law office|lawyer|attorney|solicitor|barrister", "advocate|legal|litigation"],
    ["Software", "software company|software development|saas|app development|web development|devops", "software|developer|cloud|api|it service|open source"],
    ["Marketing & Advertising", "digital marketing|marketing agency|advertising agency|ad agency|seo|public relation", "marketing|advertising|social media|campaign|branding"],
    ["Design", "design studio|graphic design|web design|ux design|brand identity", "ux|illustration|designer|branding"],
    ["Consulting", "consulting|consultancy|management consulting", "consultant|advisory|strategy"],
    ["Financial Services", "wealth management|asset management|mutual fund|fintech|banking|stock broker|financial planning", "investment|bank|loan|lending"],
    ["Insurance", "insurance|reinsurance", "insurer|underwriting|policyholder"],
    ["Healthcare", "hospital|clinic|healthcare|dentist|dental|physiotherapy", "medical|doctor|patient|diagnostic"],
    ["Pharmaceuticals", "pharmaceutical|pharma|biotech|biotechnology", "drug discovery|formulation"],
    ["Education", "school|university|college|e learning|tutoring", "education|course|academy|student|coaching"],
    ["Real Estate", "real estate|realty|realtor", "property|apartment|housing|broker"],
    ["Construction", "construction|civil engineering", "contractor|builder|infrastructure|building material"],
    ["Architecture & Interiors", "interior design|architecture firm|architectural design", "architecture|architect|interior|landscape design"],
    ["Manufacturing", "manufacturing|manufacturer", "factory|industrial|machinery|fabrication|oem|supplier"],
    ["Retail", "retail|e commerce|ecommerce|online store|supermarket", "store|shop|shopping"],
    ["Fashion & Apparel", "fashion|apparel|clothing|garment|couture|footwear|jewellery|jewelry", "boutique|textile"],
    ["Beauty & Cosmetics", "cosmetic|skincare|skin care|makeup|beauty salon|perfume", "beauty|salon|fragrance|lipstick"],
    ["Food & Beverage", "restaurant|cafe|catering|bakery|brewery", "food|beverage|cuisine|coffee"],
    ["Hospitality & Travel", "hotel|resort|tourism|travel agency|hospitality", "travel|tour|holiday"],
    ["Logistics", "logistics|freight|courier|warehousing|supply chain", "shipping|transport|cargo"],
    ["Media & Entertainment", "production house|publishing|newspaper|journalism|broadcast", "media|film|entertainment|music|podcast"],
    ["Recruitment", "recruitment|staffing|headhunting|executive search|talent acquisition", "recruiter|placement"],
    ["Nonprofit", "nonprofit|non profit|ngo|charity|charitable trust", "donate|donation|volunteer"],
    ["Agriculture", "agriculture|farming", "farm|agri|crop|dairy"],
    ["Energy", "solar|renewable|power plant|wind power", "energy|oil|gas|electricity"],
    ["Automotive", "automotive|automobile|car dealership|auto part", "vehicle|dealership|car service"],
    ["Telecommunications", "telecom|telecommunication|broadband|internet provider|mobile network", "fibre|fiber"],
    ["Events", "event management|wedding planner|event planner|wedding planning", "exhibition|conference"],
  ] as const
).map(([name, trade, hints]) => ({
  name,
  trade: trade.split("|").map(wording),
  hints: hints.split("|").map(wording),
}));

// A word that names the trade is enough by itself; hints count for half as much,
// so one of them alone is a passing mention.
const TRADE_WORD = 2;
const ENOUGH = 2;

// The industry the text points to most, when one is clearly ahead; null otherwise.
export function guessIndustry(text: string) {
  const said = wording(text);
  const count = (keywords: string[]) =>
    keywords.filter((keyword) => said.includes(keyword)).length;
  let best: { name: string; score: number } | null = null;
  let tied = false;
  for (const { name, trade, hints } of INDUSTRIES) {
    const score = count(trade) * TRADE_WORD + count(hints);
    if (best && score === best.score) tied = true;
    if (!best || score > best.score) {
      best = { name, score };
      tied = false;
    }
  }
  return best && best.score >= ENOUGH && !tied ? best.name : null;
}
