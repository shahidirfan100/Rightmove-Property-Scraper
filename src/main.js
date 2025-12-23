import { Actor, log } from 'apify';
import { CheerioCrawler, Dataset } from 'crawlee';
import { gotScraping } from 'got-scraping';
import { load as cheerioLoad } from 'cheerio';

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const BASE_URL = 'https://www.rightmove.co.uk';
const DEFAULT_SEARCH_URL = `${BASE_URL}/new-homes-for-sale/find.html`;

// API Endpoints for data extraction
const API_ENDPOINTS = {
    searchResults: `${BASE_URL}/api/propertySearch/findProperties`,
    propertyDetails: `${BASE_URL}/api/properties`,
    propertyDetailsLegacy: `${BASE_URL}/api/propertyDetails`,
    searchSuggest: `${BASE_URL}/api/searchSuggest`,
};

// UK Regions for location search
const UK_REGIONS = {
    london: 'REGION^87490',
    manchester: 'REGION^904',
    birmingham: 'REGION^60',
    leeds: 'REGION^1466',
    liverpool: 'REGION^1520',
    bristol: 'REGION^239',
    edinburgh: 'REGION^339',
    glasgow: 'REGION^394',
    cardiff: 'REGION^306',
    belfast: 'REGION^5882',
};

// Enhanced user agents with realistic fingerprinting
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

// Stealthy headers mimicking real browsers
const STEALTHY_HEADERS = {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
    DNT: '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
    Pragma: 'no-cache',
    'Sec-Ch-Ua': '"Chromium";v="124", "Not;A=Brand";v="8"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
};

// Timing and retry configuration
const REQUEST_DELAY_MS = 1200;
const REQUEST_JITTER = 800;
const MAX_RETRIES = 5;
const DEFAULT_PROPERTIES_PER_PAGE = 24;
const DATASET_BATCH_SIZE = 15;
const TIMEOUT_SECONDS = 60;
const MAX_BACKOFF_MS = 30000;

const PROPERTY_TYPE_PATTERNS = [
    { re: /semi[-\s]?detached/i, value: 'Semi-Detached' },
    { re: /\bdetached\b/i, value: 'Detached' },
    { re: /\bterraced\b/i, value: 'Terraced' },
    { re: /\bbungalow\b/i, value: 'Bungalow' },
    { re: /\bmaisonette\b/i, value: 'Maisonette' },
    { re: /\bapartment\b/i, value: 'Apartment' },
    { re: /\bflat\b/i, value: 'Flat' },
    { re: /\bstudio\b/i, value: 'Studio' },
    { re: /\bduplex\b/i, value: 'Duplex' },
    { re: /\bpenthouse\b/i, value: 'Penthouse' },
    { re: /\bhouse\b/i, value: 'House' },
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const getRandomUserAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

const getSessionUserAgent = (session) => {
    if (!session?.userData?.userAgent) {
        if (session) session.userData.userAgent = getRandomUserAgent();
    }
    return session?.userData?.userAgent || getRandomUserAgent();
};

const buildHeaders = (session) => ({
    ...STEALTHY_HEADERS,
    'User-Agent': getSessionUserAgent(session),
    Referer: BASE_URL,
});

const getRandomDelay = () => REQUEST_DELAY_MS + Math.random() * REQUEST_JITTER;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getBackoffMs = (attempt) => Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(attempt, 5) + Math.random() * 500);

const cleanText = (text) => {
    if (text === null || text === undefined) return null;
    const cleaned = String(text).replace(/\s+/g, ' ').trim();
    return cleaned.length > 0 ? cleaned : null;
};

const uniqueArray = (items) => {
    const result = [];
    const seen = new Set();
    for (const item of items || []) {
        if (!item) continue;
        const value = typeof item === 'string' ? cleanText(item) : item;
        if (!value) continue;
        const key = typeof value === 'string' ? value : JSON.stringify(value);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(value);
    }
    return result;
};

const ensureAbsoluteUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return `https:${url}`;
    return `${BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};

const extractPropertyId = (url) => {
    if (!url) return null;
    const match = url.match(/\/properties\/(\d+)|propertyId[=:](\d+)|#properties[=/](\d+)/i);
    return match ? (match[1] || match[2] || match[3]) : null;
};

const parsePrice = (priceText) => {
    if (!priceText) return null;
    const normalized = String(priceText).replace(/,/g, '');
    const match = normalized.match(/(\d+(?:\.\d+)?)/);
    if (!match) return null;
    let amount = parseFloat(match[1]);
    const lower = normalized.toLowerCase();
    if (/\b\d+(?:\.\d+)?\s*m\b/i.test(lower) || lower.includes('million')) {
        amount *= 1000000;
    } else if (/\b\d+(?:\.\d+)?\s*k\b/i.test(lower)) {
        amount *= 1000;
    }
    return {
        amount,
        currency: 'GBP',
        displayPrice: cleanText(priceText),
    };
};

const inferPropertyType = (text) => {
    if (!text) return null;
    for (const { re, value } of PROPERTY_TYPE_PATTERNS) {
        if (re.test(text)) return value;
    }
    return null;
};

const extractJsonLd = (html) => {
    if (!html) return [];
    const $ = cheerioLoad(html);
    const jsonLdScripts = $('script[type="application/ld+json"]');
    const data = [];

    jsonLdScripts.each((_, el) => {
        try {
            const content = $(el).html();
            if (content) {
                const parsed = JSON.parse(content);
                if (Array.isArray(parsed)) {
                    data.push(...parsed);
                } else {
                    data.push(parsed);
                }
            }
        } catch (e) {
            log.debug(`JSON-LD parse error: ${e.message}`);
        }
    });

    return data;
};

const extractBalancedJson = (text, startIndex) => {
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = startIndex; i < text.length; i += 1) {
        const ch = text[i];

        if (escape) {
            escape = false;
            continue;
        }

        if (ch === '\\') {
            if (inString) escape = true;
            continue;
        }

        if (ch === '"') {
            inString = !inString;
            continue;
        }

        if (inString) continue;

        if (ch === '{') depth += 1;
        if (ch === '}') {
            depth -= 1;
            if (depth === 0) return text.slice(startIndex, i + 1);
        }
    }

    return null;
};

const extractJsonAfterMarker = (html, marker) => {
    const index = html.indexOf(marker);
    if (index === -1) return null;
    const start = html.indexOf('{', index + marker.length);
    if (start === -1) return null;
    const jsonText = extractBalancedJson(html, start);
    if (!jsonText) return null;
    try {
        return JSON.parse(jsonText);
    } catch (error) {
        log.debug(`Embedded JSON parse error for ${marker}: ${error.message}`);
        return null;
    }
};

const extractScriptJsonById = ($, id) => {
    const script = $(`script#${id}`).first();
    if (!script.length) return null;
    const content = script.html();
    if (!content) return null;
    try {
        return JSON.parse(content);
    } catch (error) {
        log.debug(`Script JSON parse error for ${id}: ${error.message}`);
        return null;
    }
};

const extractEmbeddedJson = (html) => {
    if (!html) return [];
    const $ = cheerioLoad(html);
    const data = [];

    const nextData = extractScriptJsonById($, '__NEXT_DATA__');
    if (nextData) data.push(nextData);

    const markers = [
        'window.__PRELOADED_STATE__',
        'window.PAGE_MODEL',
        'window.__INITIAL_STATE__',
        'window.__APOLLO_STATE__',
        'window.__RM__',
    ];

    for (const marker of markers) {
        const parsed = extractJsonAfterMarker(html, marker);
        if (parsed) data.push(parsed);
    }

    return data;
};

const findNestedObject = (root, predicate, maxDepth = 6) => {
    if (!root || typeof root !== 'object') return null;
    const queue = [{ value: root, depth: 0 }];
    const seen = new WeakSet();

    while (queue.length) {
        const { value, depth } = queue.shift();
        if (!value || typeof value !== 'object') continue;
        if (seen.has(value)) continue;
        seen.add(value);

        if (predicate(value)) return value;
        if (depth >= maxDepth) continue;

        if (Array.isArray(value)) {
            for (const item of value) queue.push({ value: item, depth: depth + 1 });
        } else {
            for (const key of Object.keys(value)) {
                queue.push({ value: value[key], depth: depth + 1 });
            }
        }
    }

    return null;
};

const isLikelyPropertyPayload = (obj) => {
    if (!isPlainObject(obj)) return false;
    const hasAddress = ['displayAddress', 'address', 'propertyAddress', 'addressSummary'].some((key) => key in obj);
    const hasBeds = ['bedrooms', 'bedroomCount', 'numBedrooms'].some((key) => key in obj);
    const hasType = ['propertyType', 'propertySubType', 'propertyTypeFullDescription'].some((key) => key in obj);
    const hasPrice = ['price', 'displayPrice', 'priceAmount'].some((key) => key in obj);
    return hasAddress && (hasBeds || hasType || hasPrice);
};

const findPropertyPayload = (data) => {
    if (!data || typeof data !== 'object') return null;
    const direct = data.propertyData || data.property || data.listing || data.details || data.result;
    if (isPlainObject(direct)) return direct;
    return findNestedObject(data, isLikelyPropertyPayload);
};

const extractAgentFromPayload = (payload) => {
    if (!payload || typeof payload !== 'object') return null;
    const direct =
        payload.branch ||
        payload.agent ||
        payload.agency ||
        payload.company ||
        payload.customer ||
        payload.contact ||
        payload.branchDetails;

    const candidate =
        isPlainObject(direct)
            ? direct
            : findNestedObject(payload, (obj) =>
                  isPlainObject(obj) &&
                  ['branchName', 'companyName', 'agentName', 'brandName', 'displayName', 'telephone', 'phone'].some(
                      (key) => key in obj
                  )
              );

    if (!candidate) return null;

    const agent = {
        name: cleanText(candidate.name || candidate.displayName || candidate.branchName || candidate.companyName || candidate.brandName),
        phone: cleanText(candidate.telephone || candidate.phone || candidate.primaryPhone || candidate.contactTelephone),
        address: cleanText(candidate.address || candidate.branchAddress || candidate.displayAddress),
        website: cleanText(candidate.website || candidate.websiteUrl || candidate.url || candidate.contactUrl),
    };

    if (!agent.name && !agent.phone && !agent.address && !agent.website) return null;
    return agent;
};

const extractAgentFromHtml = ($) => {
    if (!$) return null;
    const selectors = [
        '[data-test*="agent-name"]',
        '[data-test*="branch-name"]',
        '[data-test*="developer-name"]',
        '[class*="agent"]',
        '[class*="branch"]',
        '[class*="developer"]',
    ];

    for (const selector of selectors) {
        const text = cleanText($(selector).first().text());
        if (text && text.length < 120) {
            const phone = cleanText($(`${selector} a[href^="tel:"]`).first().text()) || cleanText($('a[href^="tel:"]').first().text());
            return { name: text, phone };
        }
    }

    return null;
};

const extractImagesFromPayload = (payload) => {
    const images = [];
    const addImage = (url) => {
        const normalized = ensureAbsoluteUrl(cleanText(url));
        if (normalized) images.push(normalized);
    };
    const addFromItem = (item) => {
        if (!item) return;
        if (typeof item === 'string') {
            addImage(item);
        } else if (isPlainObject(item)) {
            addImage(item.url || item.imageUrl || item.src || item.image);
        }
    };

    if (payload.images) {
        if (Array.isArray(payload.images)) payload.images.forEach(addFromItem);
        else addFromItem(payload.images);
    }

    if (Array.isArray(payload.propertyImages)) payload.propertyImages.forEach(addFromItem);
    if (payload.image) addFromItem(payload.image);

    return uniqueArray(images);
};

const extractFloorplansFromPayload = (payload) => {
    const floorplans = [];
    const addPlan = (url) => {
        const normalized = ensureAbsoluteUrl(cleanText(url));
        if (normalized) floorplans.push(normalized);
    };
    const addFromItem = (item) => {
        if (!item) return;
        if (typeof item === 'string') {
            addPlan(item);
        } else if (isPlainObject(item)) {
            addPlan(item.url || item.imageUrl || item.src || item.image);
        }
    };

    if (payload.floorplans) {
        if (Array.isArray(payload.floorplans)) payload.floorplans.forEach(addFromItem);
        else addFromItem(payload.floorplans);
    }

    return uniqueArray(floorplans);
};

const extractKeyFeaturesFromPayload = (payload) => {
    const features = [];
    const addFeature = (value) => {
        const text = cleanText(value);
        if (text && text.length < 200) features.push(text);
    };

    if (Array.isArray(payload.keyFeatures)) payload.keyFeatures.forEach(addFeature);
    if (Array.isArray(payload.features)) payload.features.forEach(addFeature);

    return uniqueArray(features);
};

const extractPropertyFromPayload = (payload) => {
    if (!payload || typeof payload !== 'object') return {};
    const extracted = {};

    const address = cleanText(payload.displayAddress || payload.address || payload.propertyAddress || payload.addressSummary);
    if (address) extracted.address = address;

    const propertyType = cleanText(
        payload.propertyTypeFullDescription ||
            payload.propertyType ||
            payload.propertySubType ||
            payload.propertyTypeDescription ||
            payload.propertyTypeName
    );
    if (propertyType) extracted.propertyType = propertyType;

    const bedrooms = Number(payload.bedrooms ?? payload.bedroomCount ?? payload.numBedrooms);
    if (Number.isFinite(bedrooms)) extracted.bedrooms = bedrooms;

    const bathrooms = Number(payload.bathrooms ?? payload.bathroomCount ?? payload.numBathrooms);
    if (Number.isFinite(bathrooms)) extracted.bathrooms = bathrooms;

    const description = cleanText(payload.description || payload.summary || payload.longDescription);
    if (description) extracted.description = description;

    const title = cleanText(payload.title || payload.propertyTitle || payload.displayAddress);
    if (title) extracted.title = title;

    if (isPlainObject(payload.price)) {
        extracted.price = {
            amount: Number(payload.price.amount ?? payload.price.value) || null,
            currency: payload.price.currency || payload.price.currencyCode || 'GBP',
            displayPrice: cleanText(payload.price.displayPrice || payload.price.text),
        };
    } else if (typeof payload.price === 'number') {
        extracted.price = { amount: payload.price, currency: 'GBP' };
    } else {
        const priceText = cleanText(payload.displayPrice || payload.price || payload.priceText);
        if (priceText) extracted.price = parsePrice(priceText) || { amount: null, currency: 'GBP', displayPrice: priceText };
    }

    const images = extractImagesFromPayload(payload);
    if (images.length) extracted.images = images;

    const floorplans = extractFloorplansFromPayload(payload);
    if (floorplans.length) extracted.floorplans = floorplans;

    const keyFeatures = extractKeyFeaturesFromPayload(payload);
    if (keyFeatures.length) extracted.keyFeatures = keyFeatures;

    const agentDetails = extractAgentFromPayload(payload);
    if (agentDetails) {
        extracted.agentDetails = agentDetails;
        extracted.agent = agentDetails.name || extracted.agent;
    }

    return extracted;
};

const mergePropertyData = (base, extra) => {
    if (!extra) return base;
    const merged = { ...base };
    const setIfMissing = (key, value) => {
        if (value === null || value === undefined) return;
        if (merged[key] === null || merged[key] === undefined || merged[key] === '' || (Array.isArray(merged[key]) && merged[key].length === 0)) {
            merged[key] = value;
        }
    };

    setIfMissing('address', extra.address);
    setIfMissing('title', extra.title);
    setIfMissing('description', extra.description);
    setIfMissing('propertyType', extra.propertyType);
    setIfMissing('bedrooms', extra.bedrooms);
    setIfMissing('bathrooms', extra.bathrooms);
    setIfMissing('agent', extra.agent);
    setIfMissing('agentDetails', extra.agentDetails);

    if (extra.price && (!merged.price || (!merged.price.amount && !merged.price.displayPrice))) {
        merged.price = extra.price;
    }

    if (extra.images) {
        merged.images = uniqueArray([...(merged.images || []), ...extra.images]);
    }

    if (extra.floorplans) {
        merged.floorplans = uniqueArray([...(merged.floorplans || []), ...extra.floorplans]);
    }

    if (extra.keyFeatures) {
        merged.keyFeatures = uniqueArray([...(merged.keyFeatures || []), ...extra.keyFeatures]);
    }

    if (extra.details) {
        merged.details = { ...(extra.details || {}), ...(merged.details || {}) };
    }

    return merged;
};

const normalizeProperty = (property) => {
    const normalized = { ...property };

    normalized.address = cleanText(normalized.address);
    normalized.title = cleanText(normalized.title) || normalized.address;
    normalized.description = cleanText(normalized.description);
    normalized.propertyType = cleanText(normalized.propertyType);

    if (!normalized.propertyType) {
        const text = `${normalized.title || ''} ${normalized.description || ''} ${normalized.address || ''}`;
        normalized.propertyType = inferPropertyType(text);
    }

    if (normalized.agentDetails && typeof normalized.agentDetails === 'object') {
        const cleanedAgentDetails = {};
        for (const [key, value] of Object.entries(normalized.agentDetails)) {
            const cleanedValue = cleanText(value);
            if (cleanedValue) cleanedAgentDetails[key] = cleanedValue;
        }
        normalized.agentDetails = Object.keys(cleanedAgentDetails).length ? cleanedAgentDetails : null;
    }

    normalized.agent = cleanText(normalized.agent) || (normalized.agentDetails ? normalized.agentDetails.name : null);

    if (normalized.images) normalized.images = uniqueArray(normalized.images.map(ensureAbsoluteUrl));
    if (normalized.floorplans) normalized.floorplans = uniqueArray(normalized.floorplans.map(ensureAbsoluteUrl));
    if (normalized.keyFeatures) normalized.keyFeatures = uniqueArray(normalized.keyFeatures);
    if (normalized.features) normalized.features = uniqueArray(normalized.features);

    if (normalized.details && typeof normalized.details === 'object') {
        const cleanedDetails = {};
        for (const [key, value] of Object.entries(normalized.details)) {
            const cleanedKey = cleanText(key);
            const cleanedValue = cleanText(value);
            if (cleanedKey && cleanedValue) cleanedDetails[cleanedKey] = cleanedValue;
        }
        normalized.details = Object.keys(cleanedDetails).length ? cleanedDetails : null;
    }

    if (normalized.price && typeof normalized.price === 'object') {
        const displayPrice = cleanText(normalized.price.displayPrice);
        const amount = Number(normalized.price.amount);
        normalized.price = {
            amount: Number.isFinite(amount) ? amount : null,
            currency: normalized.price.currency || 'GBP',
            displayPrice: displayPrice || null,
        };
    }

    return normalized;
};

const buildSearchUrl = (input) => {
    if (input.startUrl) {
        return input.startUrl;
    }

    const params = new URLSearchParams();

    if (input.locationIdentifier) {
        params.append('locationIdentifier', input.locationIdentifier);
        params.append('useLocationIdentifier', 'true');
    } else if (input.searchLocation) {
        params.append('searchLocation', input.searchLocation);
        params.append('useLocationIdentifier', 'false');
    } else {
        params.append('locationIdentifier', UK_REGIONS.london);
        params.append('useLocationIdentifier', 'true');
    }

    params.append('radius', String(input.radius || '0.0'));

    if (input.minPrice) params.append('minPrice', input.minPrice);
    if (input.maxPrice) params.append('maxPrice', input.maxPrice);

    params.append('channel', 'NEW_HOME');

    return `${DEFAULT_SEARCH_URL}?${params.toString()}`;
};

// Try multiple strategies to find the next page URL, including new UI arrow span selector
const findNextPageUrl = ($, requestUrl, currentPage) => {
    const selectors = [
        'a[rel="next"]',
        'a[aria-label*="Next"]',
        'button[aria-label*="Next"]',
        'button[data-test*="next"]',
        'button[data-testid*="next"]',
        'button[data-page]',
        'button[data-page-number]',
        'span.dsrm_button__icon.dsrm_button__icon--right',
    ];

    for (const selector of selectors) {
        const el = $(selector).first();
        if (!el.length) continue;

        const anchor = el.is('a') ? el : el.closest('a');
        const button = el.is('button') ? el : el.closest('button');

        const href = anchor?.attr('href') || el.attr('href');
        const dataUrl = el.attr('data-url') || button?.attr('data-url');
        const dataPage = el.attr('data-page') || el.attr('data-page-number') || button?.attr('data-page') || button?.attr('data-page-number');

        if (href) return ensureAbsoluteUrl(href);
        if (dataUrl) return ensureAbsoluteUrl(dataUrl);

        if (dataPage) {
            const pageNum = parseInt(dataPage, 10);
            const urlObj = new URL(requestUrl);
            if (Number.isFinite(pageNum)) {
                urlObj.searchParams.set('page', pageNum);
                urlObj.searchParams.set('index', Math.max(0, (pageNum - 1) * DEFAULT_PROPERTIES_PER_PAGE));
            }
            return urlObj.toString();
        }
    }

    // Fallback: increment known index or page params, otherwise compute from currentPage
    const urlObj = new URL(requestUrl);
    const currentIndex = parseInt(urlObj.searchParams.get('index'), 10);
    const currentPageParam = parseInt(urlObj.searchParams.get('page'), 10);

    const nextIndex = Number.isFinite(currentIndex)
        ? currentIndex + DEFAULT_PROPERTIES_PER_PAGE
        : Number.isFinite(currentPageParam)
            ? currentPageParam * DEFAULT_PROPERTIES_PER_PAGE
            : Math.max(0, (currentPage || 1) * DEFAULT_PROPERTIES_PER_PAGE);

    urlObj.searchParams.set('index', nextIndex);
    const nextPage = Number.isFinite(currentPageParam) ? currentPageParam + 1 : (currentPage || 1) + 1;
    urlObj.searchParams.set('page', nextPage);

    return urlObj.toString();
};

// ============================================================================
// DATA EXTRACTION FUNCTIONS
// ============================================================================

const extractPropertyCard = ($, card) => {
    try {
        let propertyLink = $(card).find('a[href*="/properties/"]').first();
        if (!propertyLink.length) {
            propertyLink = $(card).find('a[href*="propertyId"]').first();
        }

        const propertyUrl = ensureAbsoluteUrl(propertyLink.attr('href'));
        const propertyId = extractPropertyId(propertyUrl);

        if (!propertyId || !propertyUrl) {
            log.debug('Could not extract property ID from card');
            return null;
        }

        let priceText = null;
        let price = null;
        const priceSelectors = ['[class*="price"]', '[class*="Price"]', '[data-test*="price"]'];
        for (const selector of priceSelectors) {
            const priceEl = $(card).find(selector).first();
            if (priceEl.length > 0) {
                priceText = cleanText(priceEl.text());
                price = priceText ? parsePrice(priceText) : null;
                break;
            }
        }

        if (!price && priceText) {
            price = { amount: null, currency: 'GBP', displayPrice: priceText };
        }

        let address = null;
        const addressSelectors = ['[class*="address"]', '[class*="title"]', '[data-test*="address"]', 'h2', 'h3'];
        for (const selector of addressSelectors) {
            const elem = $(card).find(selector).first();
            if (elem.length > 0) {
                const text = cleanText(elem.text());
                if (text && text.length > 5) {
                    address = text;
                    break;
                }
            }
        }

        if (!address) {
            address = cleanText($(card).text().substring(0, 100));
        }

        const cardText = $(card).text();
        let bedrooms = null;
        let bathrooms = null;
        const bedroomsMatch = cardText.match(/(\d+)\s*(?:bed|bedroom)/i);
        const bathroomsMatch = cardText.match(/(\d+)\s*(?:bath|bathroom)/i);

        if (bedroomsMatch) bedrooms = parseInt(bedroomsMatch[1], 10);
        if (bathroomsMatch) bathrooms = parseInt(bathroomsMatch[1], 10);

        let image = null;
        const imgSelectors = ['img', '[class*="image"]'];
        for (const selector of imgSelectors) {
            const imgEl = $(card).find(selector).first();
            if (imgEl.length > 0) {
                image = imgEl.attr('src') || imgEl.attr('data-src') || imgEl.attr('data-lazy');
                if (image) break;
            }
        }

        let agent = null;
        const agentSelectors = ['[data-test*="agent"]', '[data-test*="developer"]', '[class*="agent"]', '[class*="developer"]'];
        for (const selector of agentSelectors) {
            const elem = $(card).find(selector).first();
            if (elem.length > 0) {
                agent = cleanText(elem.text());
                if (agent && agent.length > 2) break;
            }
        }

        const features = [];
        $(card).find('[class*="feature"], [class*="tag"], [class*="badge"]').each((_, el) => {
            const feature = cleanText($(el).text());
            if (feature && feature.length > 1 && feature.length < 100) {
                features.push(feature);
            }
        });

        const propertyType = inferPropertyType(`${address || ''} ${cardText || ''}`) || null;

        return {
            propertyId,
            url: propertyUrl,
            address: address || null,
            price,
            bedrooms,
            bathrooms,
            propertyType,
            image: image ? ensureAbsoluteUrl(image) : null,
            agent,
            features,
            isNewHome: true,
        };
    } catch (error) {
        log.warning(`Card extraction error: ${error.message}`);
        return null;
    }
};

const extractDetailsFromHtml = ($) => {
    const details = {};

    const addDetail = (key, value) => {
        const cleanKey = cleanText(key);
        const cleanValue = cleanText(value);
        if (cleanKey && cleanValue) details[cleanKey] = cleanValue;
    };

    $('dl').each((_, dl) => {
        const $dl = $(dl);
        $dl.find('dt').each((__, dt) => {
            const key = $(dt).text();
            const value = $(dt).next('dd').text();
            addDetail(key, value);
        });
    });

    $('[class*="property-detail"] dt, [data-test*="property-detail"] dt').each((_, dt) => {
        const key = $(dt).text();
        const value = $(dt).next().text();
        addDetail(key, value);
    });

    return details;
};

const getDetailValue = (details, keywords) => {
    if (!details) return null;
    for (const [key, value] of Object.entries(details)) {
        const normalizedKey = key.toLowerCase();
        if (keywords.some((keyword) => normalizedKey.includes(keyword))) {
            return value;
        }
    }
    return null;
};

const extractPropertyDetails = ($, html, basicInfo = {}) => {
    try {
        let propertyData = { ...basicInfo };
        let extractionMethod = 'html-parse';

        const jsonLdData = extractJsonLd(html);
        const propertyJsonLd = jsonLdData.find((d) => {
            const type = d['@type'];
            return type === 'Product' || type === 'RealEstateListing' || type === 'Apartment' || type === 'House';
        });

        if (propertyJsonLd) {
            if (propertyJsonLd.name) propertyData.title = propertyJsonLd.name;
            if (propertyJsonLd.description) propertyData.description = propertyJsonLd.description;
            if (propertyJsonLd.image) {
                propertyData.images = Array.isArray(propertyJsonLd.image) ? propertyJsonLd.image : [propertyJsonLd.image];
            }
            if (propertyJsonLd.offers) {
                const offer = Array.isArray(propertyJsonLd.offers) ? propertyJsonLd.offers[0] : propertyJsonLd.offers;
                propertyData.price = {
                    amount: offer?.price || null,
                    currency: offer?.priceCurrency || 'GBP',
                    displayPrice: offer?.price || null,
                };
            }
            if (!propertyData.propertyType && propertyJsonLd['@type']) {
                propertyData.propertyType = cleanText(propertyJsonLd['@type']);
            }
            extractionMethod = 'json-ld';
        }

        const embeddedData = extractEmbeddedJson(html);
        let usedEmbedded = false;
        for (const embedded of embeddedData) {
            const payload = findPropertyPayload(embedded);
            if (!payload) continue;
            const extracted = extractPropertyFromPayload(payload);
            if (Object.keys(extracted).length) {
                propertyData = mergePropertyData(propertyData, extracted);
                usedEmbedded = true;
            }
        }
        if (usedEmbedded) {
            extractionMethod = extractionMethod === 'json-ld' ? 'json-ld+embedded' : 'embedded-json';
        }

        const title = propertyData.title || cleanText($('h1').first().text());
        const description = propertyData.description || cleanText($('[class*="description"], [data-test*="description"]').first().text());

        const keyFeatures = [];
        $('[class*="key-feature"] li, [class*="bullet"] li, [data-test*="key-features"] li').each((_, el) => {
            const feature = cleanText($(el).text());
            if (feature && feature.length > 2) keyFeatures.push(feature);
        });

        const details = extractDetailsFromHtml($);

        if (!propertyData.images) {
            propertyData.images = [];
            $('[class*="gallery"] img, [data-test*="image"] img').each((_, el) => {
                const src = $(el).attr('src') || $(el).attr('data-src');
                if (src && !propertyData.images.includes(src)) {
                    propertyData.images.push(ensureAbsoluteUrl(src));
                }
            });
        }

        const floorplans = [];
        $('[class*="floorplan"] img').each((_, el) => {
            const src = $(el).attr('src') || $(el).attr('data-src');
            if (src) floorplans.push(ensureAbsoluteUrl(src));
        });

        const agentDetails = extractAgentFromHtml($);
        if (agentDetails && !propertyData.agentDetails) {
            propertyData.agentDetails = agentDetails;
            if (!propertyData.agent) propertyData.agent = agentDetails.name;
        }

        const propertyTypeFromDetails = getDetailValue(details, ['property type', 'property type:']);
        if (!propertyData.propertyType && propertyTypeFromDetails) {
            propertyData.propertyType = propertyTypeFromDetails;
        }

        if (!propertyData.propertyType) {
            const text = `${title || ''} ${description || ''} ${propertyData.address || ''}`;
            propertyData.propertyType = inferPropertyType(text);
        }

        return {
            ...propertyData,
            title: title || propertyData.title,
            description: description || propertyData.description,
            keyFeatures: keyFeatures.length > 0 ? keyFeatures : propertyData.keyFeatures || null,
            details: Object.keys(details).length > 0 ? details : propertyData.details || null,
            floorplans: floorplans.length > 0 ? floorplans : propertyData.floorplans || null,
            images: propertyData.images && propertyData.images.length > 0 ? propertyData.images : null,
            extractionMethod,
        };
    } catch (error) {
        log.warning(`Detail extraction error: ${error.message}`);
        return { ...basicInfo, extractionMethod: 'failed' };
    }
};

const extractChannelFromUrl = (url) => {
    try {
        const parsed = new URL(url);
        const channel = parsed.searchParams.get('channel');
        if (channel) return channel;

        const hash = parsed.hash?.startsWith('#/?') ? parsed.hash.slice(3) : parsed.hash?.startsWith('#') ? parsed.hash.slice(1) : '';
        if (hash) {
            const hashParams = new URLSearchParams(hash);
            return hashParams.get('channel');
        }
        return null;
    } catch {
        return null;
    }
};

const fetchPropertyApi = async ({ propertyId, channel, session }) => {
    if (!propertyId) return null;
    const headers = buildHeaders(session);
    const cookieJar = session?.cookieJar;
    const requests = [
        {
            url: `${API_ENDPOINTS.propertyDetails}/${propertyId}`,
            searchParams: channel ? { channel } : undefined,
        },
        {
            url: API_ENDPOINTS.propertyDetailsLegacy,
            searchParams: {
                propertyId,
                channel,
            },
        },
    ];

    for (const req of requests) {
        try {
            const response = await gotScraping({
                ...req,
                headers,
                cookieJar,
                responseType: 'json',
                throwHttpErrors: false,
                timeout: { request: TIMEOUT_SECONDS * 1000 },
            });

            if (response.statusCode >= 200 && response.statusCode < 300 && response.body) {
                return response.body;
            }
        } catch (error) {
            log.debug(`Property API fetch error: ${error.message}`);
        }
    }

    return null;
};

const isBlockedResponse = (response, body) => {
    const status = response?.statusCode;
    if ([401, 403, 429, 503].includes(status)) return true;
    if (!body) return false;
    const text = body.toString().toLowerCase();
    return (
        text.includes('access denied') ||
        text.includes('captcha') ||
        text.includes('robot') ||
        text.includes('incapsula')
    );
};

// ============================================================================
// MAIN ACTOR CODE
// ============================================================================

await Actor.init();

try {
    const input = (await Actor.getInput()) || {};

    const {
        searchLocation = 'London',
        locationIdentifier = UK_REGIONS.london,
        radius = '0.0',
        minPrice = null,
        maxPrice = null,
        collectDetails = true,
        maxResults: rawMaxResults = 50,
        maxPages: rawMaxPages = 5,
        startUrl = null,
    } = input;

    const maxResults = Math.min(Math.max(Number(rawMaxResults) || 50, 1), 1000);
    const maxPages = Math.min(Math.max(Number(rawMaxPages) || 5, 1), 50);

    const searchUrl = buildSearchUrl({
        startUrl,
        searchLocation,
        locationIdentifier,
        radius,
        minPrice,
        maxPrice,
    });

    log.info('Starting Rightmove Property Scraper');
    log.info(`  Search URL: ${searchUrl}`);
    log.info(`  Config: ${maxResults} results, ${maxPages} pages, Details: ${collectDetails}`);

    let propertiesQueued = 0;
    let propertiesStored = 0;
    let pagesProcessed = 0;

    const propertyUrls = new Set();
    const propertyDataBatch = [];

    const proxyConfig = input.proxyConfiguration
        ? await Actor.createProxyConfiguration(input.proxyConfiguration)
        : await Actor.createProxyConfiguration();

    const crawler = new CheerioCrawler({
        proxyConfiguration: proxyConfig,
        requestHandlerTimeoutSecs: TIMEOUT_SECONDS,
        maxRequestRetries: MAX_RETRIES,
        maxConcurrency: 4,
        minConcurrency: 1,
        useSessionPool: true,
        persistCookiesPerSession: true,
        preNavigationHooks: [
            async ({ session, request }, gotOptions) => {
                // Rotate UA per request to reduce fingerprinting
                gotOptions.headers = { ...buildHeaders(session), ...gotOptions.headers, 'User-Agent': getRandomUserAgent() };
                gotOptions.timeout = { request: TIMEOUT_SECONDS * 1000 };
                gotOptions.retry = { limit: 0 };

                // Stagger start for first-page fetches
                if ((request.userData?.label || '') === 'LIST' && request.userData.pageNumber === 1 && request.retryCount === 0) {
                    await sleep(500 + Math.random() * 800);
                }
            },
        ],

        async requestHandler({ request, $, body, response, session }) {
            const { url, userData } = request;
            const bodyText = typeof body === 'string' ? body : body?.toString();

            if (isBlockedResponse(response, bodyText)) {
                session?.retire();
                const backoff = getBackoffMs(request.retryCount + 1);
                log.warning(
                    `Blocked response for ${url} (status: ${response?.statusCode || 'n/a'}). Retrying in ${backoff}ms with new session + UA.`
                );
                await sleep(backoff);
                throw new Error('Blocked response');
            }

            log.info(`[${response?.statusCode || 'OK'}] ${url.substring(0, 80)}...`);

            if (userData?.label === 'DETAIL') {
                const propertyId = userData.basicInfo?.propertyId || extractPropertyId(url);
                const baseInfo = { ...userData.basicInfo, propertyId, url };

                let property = extractPropertyDetails($, bodyText || '', baseInfo);

                const needsApi =
                    !property.propertyType ||
                    !property.agent ||
                    !property.details ||
                    !property.images ||
                    !property.description;

                if (needsApi && propertyId) {
                    const channel = extractChannelFromUrl(url) || 'NEW_HOME';
                    const apiData = await fetchPropertyApi({ propertyId, channel, session });
                    if (apiData) {
                        const payload = findPropertyPayload(apiData) || apiData;
                        const extracted = extractPropertyFromPayload(payload);
                        property = mergePropertyData(property, extracted);
                    }
                }

                property.scrapedAt = new Date().toISOString();
                const normalized = normalizeProperty(property);

                propertyDataBatch.push(normalized);
                propertiesStored += 1;

                const label = normalized.address || normalized.title || propertyId || 'Property';
                log.info(`  Property ${propertiesStored}/${maxResults}: ${label}`);

                if (propertyDataBatch.length >= DATASET_BATCH_SIZE) {
                    await Dataset.pushData([...propertyDataBatch]);
                    propertyDataBatch.length = 0;
                }

                await sleep(getRandomDelay());
                return;
            }

            pagesProcessed = Math.max(pagesProcessed, userData?.pageNumber || 1);

            let propertyCards = $('[class*="property-card"], [data-test="property-card"]').toArray();
            if (propertyCards.length === 0) {
                propertyCards = $('a[href*="/properties/"]').closest('article, section, li, div[class*="card"]').toArray();
            }

            log.info(`  Found ${propertyCards.length} property containers`);

            const remaining = collectDetails ? maxResults - propertiesQueued : maxResults - propertiesStored;
            if (remaining <= 0) return;

            const properties = [];
            for (const card of propertyCards) {
                if (properties.length >= remaining) break;
                const property = extractPropertyCard($, card);
                if (!property || !property.url || propertyUrls.has(property.url)) continue;
                propertyUrls.add(property.url);
                properties.push(property);
            }

            log.info(`  Extracted ${properties.length} properties`);

            if (collectDetails) {
                for (const property of properties) {
                    if (propertiesQueued >= maxResults) break;
                    await crawler.addRequests([
                        {
                            url: property.url,
                            userData: {
                                label: 'DETAIL',
                                basicInfo: property,
                            },
                        },
                    ]);
                    propertiesQueued += 1;
                }
            } else {
                for (const property of properties) {
                    if (propertiesStored >= maxResults) break;
                    propertyDataBatch.push(
                        normalizeProperty({
                            ...property,
                            scrapedAt: new Date().toISOString(),
                            extractionMethod: 'basic-card',
                        })
                    );
                    propertiesStored += 1;
                }

                if (propertyDataBatch.length >= DATASET_BATCH_SIZE) {
                    await Dataset.pushData([...propertyDataBatch]);
                    propertyDataBatch.length = 0;
                }
            }

            if ((collectDetails ? propertiesQueued : propertiesStored) < maxResults && pagesProcessed < maxPages) {
                const nextPageNumber = (userData?.pageNumber || pagesProcessed || 1) + 1;
                const nextUrl = findNextPageUrl($, url, userData?.pageNumber || pagesProcessed || 1);

                if (nextUrl) {
                    log.info(`  Queuing page ${nextPageNumber}`);
                    await crawler.addRequests([
                        {
                            url: nextUrl,
                            userData: { label: 'LIST', pageNumber: nextPageNumber },
                        },
                    ]);
                } else {
                    log.info('  No next page link found; stopping pagination.');
                }
            }

            await sleep(getRandomDelay());
        },

        errorHandler: async ({ request, error }) => {
            const backoff = getBackoffMs(request.retryCount);
            log.warning(`Retrying ${request.url} after error: ${error.message}. Backoff ${backoff}ms.`);
            await sleep(backoff);
        },

        failedRequestHandler: async ({ request, error }) => {
            log.error(`Failed after retries: ${request.url} (${error?.message || 'unknown error'})`);
        },
    });

    await crawler.addRequests([
        {
            url: searchUrl,
            userData: { label: 'LIST', pageNumber: 1 },
        },
    ]);

    log.info('Starting crawler...');
    await crawler.run();

    if (propertyDataBatch.length > 0) {
        await Dataset.pushData(propertyDataBatch);
    }

    log.info('Completed!');
    log.info(`  Properties: ${propertiesStored}, Unique: ${propertyUrls.size}, Pages: ${pagesProcessed || 1}`);

    await Actor.setValue('OUTPUT', {
        status: 'success',
        propertiesStored,
        uniqueProperties: propertyUrls.size,
        pagesProcessed: pagesProcessed || 1,
        completedAt: new Date().toISOString(),
    });
} catch (error) {
    log.error(`Error: ${error.message}`, error);

    await Actor.setValue('OUTPUT', {
        status: 'error',
        error: error.message,
        failedAt: new Date().toISOString(),
    });

    throw error;
} finally {
    await Actor.exit();
}
