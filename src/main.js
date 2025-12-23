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

// Property types for new homes
const PROPERTY_TYPES = {
    detached: 'Detached',
    'semi-detached': 'Semi-Detached',
    terraced: 'Terraced',
    flat: 'Flat',
    bungalow: 'Bungalow',
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

// Advanced timing and retry configurations
const REQUEST_DELAY_MS = 2000;
const REQUEST_JITTER = 1000;
const MAX_RETRIES = 5;
const DEFAULT_PROPERTIES_PER_PAGE = 24;
const DATASET_BATCH_SIZE = 15;
const TIMEOUT_SECONDS = 60;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const getRandomUserAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

const getRandomDelay = () => REQUEST_DELAY_MS + Math.random() * REQUEST_JITTER;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const cleanText = (text) => {
    if (!text) return null;
    const cleaned = text.replace(/\s+/g, ' ').trim();
    return cleaned.length > 0 ? cleaned : null;
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
    
    const cleaned = priceText.replace(/[£,\s]/g, '');
    const match = cleaned.match(/(\d+(?:\.\d+)?)/);
    
    if (!match) return null;
    
    let price = parseFloat(match[1]);
    
    if (priceText.toLowerCase().includes('million')) {
        price = price * 1000000;
    } else if (priceText.toLowerCase().includes('k') && price < 1000) {
        price = price * 1000;
    }
    
    return {
        amount: price,
        currency: 'GBP',
        displayPrice: cleanText(priceText),
    };
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
    
    params.append('radius', input.radius || '0.0');
    
    if (input.minPrice) params.append('minPrice', input.minPrice);
    if (input.maxPrice) params.append('maxPrice', input.maxPrice);
    
    params.append('channel', 'NEW_HOME');
    
    return `${DEFAULT_SEARCH_URL}?${params.toString()}`;
};

// ============================================================================
// ADVANCED DATA EXTRACTION FUNCTIONS
// ============================================================================

const extractPropertyCard = ($, card) => {
    try {
        // Find property link with multiple selectors
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
        
        // Extract price flexibly
        let priceText = null;
        let price = null;
        
        const priceSelectors = ['[class*="price"]', '[class*="Price"]', '[data-test*="price"]'];
        for (const selector of priceSelectors) {
            const priceEl = $(card).find(selector).first();
            if (priceEl.length > 0) {
                priceText = cleanText(priceEl.text());
                if (priceText && priceText.includes('£')) {
                    price = parsePrice(priceText);
                    break;
                }
            }
        }
        
        // Extract address
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
        
        // Extract bedrooms/bathrooms
        const cardText = $(card).text();
        let bedrooms = null;
        let bathrooms = null;
        const bedroomsMatch = cardText.match(/(\d+)\s*(?:bed|bedroom)/i);
        const bathroomsMatch = cardText.match(/(\d+)\s*(?:bath|bathroom)/i);
        
        if (bedroomsMatch) bedrooms = parseInt(bedroomsMatch[1]);
        if (bathroomsMatch) bathrooms = parseInt(bathroomsMatch[1]);
        
        // Extract image
        let image = null;
        const imgSelectors = ['img', '[class*="image"]'];
        for (const selector of imgSelectors) {
            const imgEl = $(card).find(selector).first();
            if (imgEl.length > 0) {
                image = imgEl.attr('src') || imgEl.attr('data-src');
                if (image) break;
            }
        }
        
        // Extract agent
        let agent = null;
        const agentSelectors = ['[class*="agent"]', '[class*="developer"]'];
        for (const selector of agentSelectors) {
            const elem = $(card).find(selector).first();
            if (elem.length > 0) {
                agent = cleanText(elem.text());
                if (agent && agent.length > 2) break;
            }
        }
        
        // Extract features
        const features = [];
        $(card).find('[class*="feature"], [class*="tag"], [class*="badge"]').each((_, el) => {
            const feature = cleanText($(el).text());
            if (feature && feature.length > 1 && feature.length < 100) {
                features.push(feature);
            }
        });
        
        const property = {
            propertyId,
            url: propertyUrl,
            address: address || 'N/A',
            price: price || { amount: 0, currency: 'GBP', displayPrice: priceText || 'TBA' },
            bedrooms,
            bathrooms,
            propertyType: null,
            image: image ? ensureAbsoluteUrl(image) : null,
            agent,
            features,
            isNewHome: true,
        };
        
        log.debug(`Extracted: ${propertyId} - ${address}`);
        return property;
        
    } catch (error) {
        log.warning(`Card extraction error: ${error.message}`);
        return null;
    }
};

const extractPropertyDetails = ($, html, basicInfo = {}) => {
    try {
        const jsonLdData = extractJsonLd(html);
        let propertyData = { ...basicInfo };
        
        // Find property JSON-LD
        const propertyJsonLd = jsonLdData.find(d => {
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
                    amount: offer?.price,
                    currency: offer?.priceCurrency,
                };
            }
        }
        
        // Fallback HTML extraction
        const title = propertyData.title || cleanText($('h1').first().text());
        const description = propertyData.description || cleanText($('[class*="description"]').text());
        
        // Key features
        const keyFeatures = [];
        $('[class*="key-feature"] li, [class*="bullet"] li').each((_, el) => {
            const feature = cleanText($(el).text());
            if (feature && feature.length > 2) keyFeatures.push(feature);
        });
        
        // Property details
        const details = {};
        $('[class*="property-detail"] dt').each((_, dt) => {
            const key = cleanText($(dt).text());
            const value = cleanText($(dt).next().text());
            if (key && value) details[key] = value;
        });
        
        // Gallery images
        if (!propertyData.images) {
            propertyData.images = [];
            $('[class*="gallery"] img, [data-test*="image"] img').each((_, el) => {
                const src = $(el).attr('src') || $(el).attr('data-src');
                if (src && !propertyData.images.includes(src)) {
                    propertyData.images.push(ensureAbsoluteUrl(src));
                }
            });
        }
        
        // Floorplans
        const floorplans = [];
        $('[class*="floorplan"] img').each((_, el) => {
            const src = $(el).attr('src') || $(el).attr('data-src');
            if (src) floorplans.push(ensureAbsoluteUrl(src));
        });
        
        return {
            ...propertyData,
            title: title || propertyData.title,
            description: description || propertyData.description,
            keyFeatures: keyFeatures.length > 0 ? keyFeatures : null,
            details: Object.keys(details).length > 0 ? details : null,
            floorplans: floorplans.length > 0 ? floorplans : null,
            images: propertyData.images && propertyData.images.length > 0 ? propertyData.images : null,
            extractionMethod: propertyJsonLd ? 'json-ld' : 'html-parse',
        };
        
    } catch (error) {
        log.warning(`Detail extraction error: ${error.message}`);
        return { ...basicInfo, extractionMethod: 'failed' };
    }
};


// ============================================================================
// MAIN ACTOR CODE
// ============================================================================

await Actor.init();

try {
    const input = await Actor.getInput() || {};
    
    const {
        searchLocation = 'London',
        locationIdentifier = UK_REGIONS.london,
        radius = '0.0',
        minPrice = null,
        maxPrice = null,
        collectDetails = true,
        maxResults = 100,
        maxPages = 5,
        startUrl = null,
    } = input;
    
    // Build search URL
    const searchUrl = buildSearchUrl({
        startUrl,
        searchLocation,
        locationIdentifier,
        radius,
        minPrice,
        maxPrice,
    });
    
    log.info(`✓ Starting Rightmove Property Scraper`);
    log.info(`  Search URL: ${searchUrl}`);
    log.info(`  Config: ${maxResults} results, ${maxPages} pages, Details: ${collectDetails}`);
    
    let propertiesScraped = 0;
    const propertyUrls = new Set();
    const propertyDataBatch = [];
    let currentPage = 1;
    
    // Configure proxy
    const proxyConfig = input.proxyConfiguration ? 
        await Actor.createProxyConfiguration(input.proxyConfiguration) : 
        await Actor.createProxyConfiguration();
    
    // Create crawler with enhanced settings
    const crawler = new CheerioCrawler({
        proxyConfiguration: proxyConfig,
        requestHandlerTimeoutSecs: TIMEOUT_SECONDS,
        maxRequestRetries: MAX_RETRIES,
        maxConcurrency: 3,
        useSessionPool: true,
        
        async requestHandler({ request, $, body, response }) {
            const { url, userData } = request;
            
            try {
                request.headers = { ...request.headers, ...STEALTHY_HEADERS };
                
                log.info(`[${response?.statusCode || 'OK'}] ${url.substring(0, 80)}...`);
                
                if (userData?.isPropertyDetail) {
                    const propertyDetails = extractPropertyDetails($, body, userData.basicInfo);
                    
                    const property = {
                        ...userData.basicInfo,
                        ...propertyDetails,
                        scrapedAt: new Date().toISOString(),
                    };
                    
                    propertyDataBatch.push(property);
                    propertiesScraped++;
                    
                    log.info(`  Property ${propertiesScraped}/${maxResults}: ${property.address}`);
                    
                    if (propertyDataBatch.length >= DATASET_BATCH_SIZE) {
                        await Dataset.pushData([...propertyDataBatch]);
                        propertyDataBatch.length = 0;
                    }
                    
                    return;
                }
                
                // Search results - extract cards with multiple selector strategies
                let propertyCards = $('[class*="property-card"], [data-test="property-card"]').toArray();
                
                if (propertyCards.length === 0) {
                    propertyCards = $('a[href*="/properties/"]').closest('article, section, li, div[class*="card"]').toArray();
                }
                
                log.info(`  Found ${propertyCards.length} property containers`);
                
                const properties = [];
                propertyCards.forEach((card) => {
                    if (propertiesScraped >= maxResults) return;
                    
                    const property = extractPropertyCard($, card);
                    if (property && !propertyUrls.has(property.url)) {
                        propertyUrls.add(property.url);
                        properties.push(property);
                    }
                });
                
                log.info(`  Extracted ${properties.length} properties`);
                
                // Queue or save
                if (collectDetails) {
                    for (const property of properties) {
                        if (propertiesScraped >= maxResults) break;
                        
                        await crawler.addRequests([{
                            url: property.url,
                            userData: {
                                isPropertyDetail: true,
                                basicInfo: property,
                            },
                            headers: { ...STEALTHY_HEADERS, 'User-Agent': getRandomUserAgent() },
                        }]);
                        
                        propertiesScraped++;
                    }
                } else {
                    for (const property of properties) {
                        if (propertiesScraped >= maxResults) break;
                        
                        propertyDataBatch.push({
                            ...property,
                            scrapedAt: new Date().toISOString(),
                            extractionMethod: 'basic-card',
                        });
                        
                        propertiesScraped++;
                    }
                    
                    if (propertyDataBatch.length >= DATASET_BATCH_SIZE) {
                        await Dataset.pushData([...propertyDataBatch]);
                        propertyDataBatch.length = 0;
                    }
                }
                
                // Pagination
                if (propertiesScraped < maxResults && currentPage < maxPages) {
                    let nextUrl = null;
                    
                    const nextButton = $('[class*="next"], [data-test*="next"]').attr('href');
                    if (nextButton) {
                        nextUrl = ensureAbsoluteUrl(nextButton);
                    } else {
                        const urlObj = new URL(url);
                        const index = parseInt(urlObj.searchParams.get('index')) || 0;
                        urlObj.searchParams.set('index', index + DEFAULT_PROPERTIES_PER_PAGE);
                        nextUrl = urlObj.toString();
                    }
                    
                    if (nextUrl) {
                        currentPage++;
                        log.info(`  Queuing page ${currentPage}`);
                        
                        await crawler.addRequests([{
                            url: nextUrl,
                            userData: { isPropertyDetail: false, pageNumber: currentPage },
                            headers: { ...STEALTHY_HEADERS, 'User-Agent': getRandomUserAgent() },
                        }]);
                    }
                }
                
                await sleep(getRandomDelay());
                
            } catch (error) {
                log.error(`Handler error: ${error.message}`);
                throw error;
            }
        },
        
        errorHandler: async ({ request }) => {
            log.warning(`Failed: ${request.url} (retries: ${request.retryCount}/${MAX_RETRIES})`);
        },
    });
    
    // Initial request
    await crawler.addRequests([{
        url: searchUrl,
        userData: { isPropertyDetail: false, pageNumber: 1 },
        headers: { ...STEALTHY_HEADERS, 'User-Agent': getRandomUserAgent() },
    }]);
    
    log.info('Starting crawler...');
    await crawler.run();
    
    // Final batch
    if (propertyDataBatch.length > 0) {
        await Dataset.pushData(propertyDataBatch);
    }
    
    log.info(`✓ Completed!`);
    log.info(`  Properties: ${propertiesScraped}, Unique: ${propertyUrls.size}, Pages: ${currentPage}`);
    
    await Actor.setValue('OUTPUT', {
        status: 'success',
        propertiesScraped,
        uniqueProperties: propertyUrls.size,
        pagesProcessed: currentPage,
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
