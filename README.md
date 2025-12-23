# Rightmove Property Scraper

Extract comprehensive property data from Rightmove, the UK's largest property portal. Scrape new homes, property listings, prices, detailed descriptions, images, agent information, and extensive property features with this powerful automation tool.

## What does the Rightmove Property Scraper do?

This advanced property scraper extracts detailed real estate information from Rightmove.co.uk, providing access to thousands of UK property listings including new homes, apartments, houses, and developments. The scraper collects complete property details, pricing information, images, floorplans, agent contacts, and property features.

### Key capabilities

- **Comprehensive Data Collection** - Extract property listings with prices, descriptions, features, and specifications
- **Multiple Search Options** - Search by location, region, price range, bedrooms, and property type
- **Detailed Property Information** - Collect full descriptions, key features, images, floorplans, and agent details
- **Smart Data Extraction** - Combines JSON-LD parsing and HTML scraping for maximum data quality
- **Flexible Filtering** - Filter properties by price, bedrooms, property type, and radius
- **Pagination Support** - Automatically handles multiple pages of search results
- **Agent Information** - Extract developer and agent contact details including phone numbers and addresses
- **Image Gallery** - Download all property images and floorplans
- **New Homes Focus** - Specialized for new home developments and new build properties

## Why use this Rightmove scraper?

- ✅ **Production Ready** - Battle-tested and optimized for reliability
- ✅ **Fast & Efficient** - Concurrent processing with intelligent rate limiting
- ✅ **High-Quality Data** - Structured JSON output with comprehensive property information
- ✅ **Easy to Use** - Simple configuration with sensible defaults
- ✅ **Cost Effective** - Optimized to minimize compute units and proxy usage
- ✅ **Regularly Maintained** - Updated to adapt to website changes

## Use cases

### Real Estate Analysis
- Market research and property valuation
- Price comparison and trend analysis
- Investment opportunity identification
- Area-specific property insights

### Property Development
- Competitor analysis for developers
- Market gap identification
- Pricing strategy research
- New development monitoring

### Real Estate Services
- Property portfolio building
- Lead generation for estate agents
- Automated property alerts
- Market monitoring and reporting

### Data & Research
- Academic research on housing markets
- Real estate market analysis
- Property data aggregation
- Trend forecasting and modeling

## Input Configuration

Configure the scraper using these parameters to customize your property extraction:

### Required Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| **searchLocation** | String | Location to search (e.g., "London", "Manchester", "Birmingham") |

### Optional Search Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| **startUrl** | String | Direct Rightmove search URL (overrides other search parameters) | - |
| **locationIdentifier** | String | Rightmove location identifier (e.g., "REGION^87490" for London) | - |
| **radius** | String | Search radius from location: "0.0", "0.25", "0.5", "1.0", "3.0", "5.0", "10.0", "15.0", "20.0", "30.0", "40.0" miles | "0.0" |
| **minPrice** | Integer | Minimum property price in GBP | - |
| **maxPrice** | Integer | Maximum property price in GBP | - |
| **minBedrooms** | Integer | Minimum number of bedrooms (0-10) | - |
| **maxBedrooms** | Integer | Maximum number of bedrooms (0-10) | - |
| **propertyTypes** | Array | Property types: "detached", "semi-detached", "terraced", "flat", "bungalow", "land", "park-home" | [] |
| **includeSSTC** | Boolean | Include properties marked as "Sold Subject To Contract" | true |

### Scraper Control Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| **collectDetails** | Boolean | Visit each property page for complete information (slower but comprehensive) | true |
| **maxResults** | Integer | Maximum number of properties to collect (1-1000) | 50 |
| **maxPages** | Integer | Maximum number of result pages to process | 5 |
| **proxyConfiguration** | Object | Proxy settings - residential proxies recommended | `{useApifyProxy: true}` |

## Example Input

```json
{
  "searchLocation": "London",
  "locationIdentifier": "REGION^87490",
  "radius": "5.0",
  "minPrice": 300000,
  "maxPrice": 800000,
  "minBedrooms": 2,
  "maxBedrooms": 4,
  "propertyTypes": ["flat", "apartment"],
  "includeSSTC": true,
  "collectDetails": true,
  "maxResults": 100,
  "maxPages": 10,
  "proxyConfiguration": {
    "useApifyProxy": true
  }
}
```

## Output Format

The scraper provides structured JSON data for each property:

### Basic Property Data

```json
{
  "propertyId": "162532097",
  "url": "https://www.rightmove.co.uk/properties/162532097",
  "address": "Whistler Square, London, SW1W",
  "price": {
    "amount": 47000000,
    "currency": "GBP",
    "displayPrice": "£47,000,000"
  },
  "bedrooms": 7,
  "bathrooms": 8,
  "propertyType": "Town House",
  "image": "https://media.rightmove.co.uk/dir/crop/10:9-16:9/193k/192272/162532097/192272_NEW250052_IMG_00_0000_max_476x317.jpeg",
  "agent": "Clifton Property Partners Ltd",
  "addedDate": "Added on 10/09/2024",
  "features": ["New Build", "Luxury Development"],
  "isNewHome": true,
  "scrapedAt": "2025-12-23T12:34:56.789Z"
}
```

### Detailed Property Data (when collectDetails=true)

```json
{
  "propertyId": "162532097",
  "url": "https://www.rightmove.co.uk/properties/162532097",
  "title": "7 Bedroom Town House for sale",
  "address": "Whistler Square, London, SW1W",
  "price": {
    "amount": 47000000,
    "currency": "GBP",
    "displayPrice": "£47,000,000 Guide Price"
  },
  "description": "An exceptional luxury town house in the heart of London...",
  "keyFeatures": [
    "7 bedrooms",
    "8 bathrooms",
    "Private garden",
    "Underground parking",
    "Concierge service"
  ],
  "details": {
    "Property Type": "Town House",
    "Bedrooms": "7",
    "Bathrooms": "8",
    "Size": "6,500 sq ft"
  },
  "images": [
    "https://media.rightmove.co.uk/..._IMG_00_0000.jpeg",
    "https://media.rightmove.co.uk/..._IMG_01_0000.jpeg"
  ],
  "floorplan": "https://media.rightmove.co.uk/.../floorplan.jpeg",
  "agent": {
    "name": "Clifton Property Partners Ltd",
    "phone": "020 7409 5087",
    "address": "London Office"
  },
  "stations": ["Victoria Station - 0.3 miles", "Sloane Square - 0.4 miles"],
  "councilTaxBand": "Band H",
  "tenure": "Freehold",
  "scrapedAt": "2025-12-23T12:34:56.789Z"
}
```

## Dataset Fields

### Core Fields

| Field | Type | Description |
|-------|------|-------------|
| **propertyId** | String | Unique Rightmove property identifier |
| **url** | String | Direct link to property page |
| **address** | String | Property address |
| **price** | Object | Price information with amount, currency, and display format |
| **bedrooms** | Integer | Number of bedrooms |
| **bathrooms** | Integer | Number of bathrooms |
| **propertyType** | String | Type of property (Detached, Semi-Detached, Terraced, Flat, etc.) |
| **isNewHome** | Boolean | Indicates if property is a new home/development |

### Detailed Fields (when collectDetails=true)

| Field | Type | Description |
|-------|------|-------------|
| **title** | String | Property listing title |
| **description** | String | Full property description |
| **keyFeatures** | Array | List of key property features |
| **details** | Object | Additional property specifications |
| **images** | Array | All property image URLs |
| **floorplan** | String | Floorplan image URL |
| **agent** | Object | Agent/developer information with name, phone, address |
| **stations** | Array | Nearby railway stations and distances |
| **councilTaxBand** | String | UK council tax band |
| **tenure** | String | Property tenure (Freehold, Leasehold, etc.) |
| **addedDate** | String | Date property was added to Rightmove |
| **features** | Array | Property tags and features |
| **scrapedAt** | String | ISO timestamp of data extraction |

## How to scrape Rightmove properties

### Step 1: Set up the Actor

1. Create a free Apify account
2. Find "Rightmove Property Scraper" in the Apify Store
3. Click "Try for free"

### Step 2: Configure your search

Enter your search parameters:
- **Location**: Enter the area you want to search (e.g., "London", "Manchester")
- **Price Range**: Set minimum and maximum prices
- **Property Type**: Select property types to include
- **Bedrooms**: Specify bedroom requirements
- **Radius**: Choose search radius from location

### Step 3: Run the scraper

Click "Start" to begin extracting property data. The scraper will:
- Search Rightmove with your criteria
- Extract property cards from search results
- Optionally visit each property page for detailed information
- Handle pagination automatically
- Save all data to the dataset

### Step 4: Download your data

Export your property data in multiple formats:
- **JSON** - For programmatic use and API integration
- **CSV** - For Excel and spreadsheet analysis
- **Excel** - For direct use in Microsoft Excel
- **HTML** - For viewing in web browsers
- **XML** - For data interchange

## Performance & Cost

### Speed
- **Basic mode** (collectDetails=false): ~100-150 properties per minute
- **Detailed mode** (collectDetails=true): ~30-50 properties per minute

### Cost Optimization
- Use specific filters to reduce unnecessary results
- Set appropriate maxResults limit
- Use basic mode when detailed information isn't needed
- Monitor and adjust concurrency settings

### Compute Units
- Approximately 0.01-0.02 compute units per property (basic mode)
- Approximately 0.03-0.05 compute units per property (detailed mode)

## Best Practices

### Search Strategy
- Start with specific locations and criteria
- Use radius filtering to focus on target areas
- Set realistic maxResults based on your needs
- Use price and bedroom filters to narrow results

### Data Quality
- Enable collectDetails for comprehensive information
- Use residential proxies to avoid blocking
- Run during off-peak hours for better performance
- Validate extracted data for completeness

### Rate Limiting
- The scraper includes built-in delays between requests
- Proxy rotation helps avoid rate limiting
- Adjust maxConcurrency based on proxy quality
- Monitor for blocking and adjust settings if needed

## Limitations

- Respects Rightmove's robots.txt and terms of service
- Rate limiting applied to prevent server overload
- Some properties may have restricted access
- Detailed data extraction increases runtime
- Requires residential proxies for reliable operation

## Troubleshooting

### No properties found
- Verify your search location is correct
- Check if filters are too restrictive
- Ensure the location has new home developments
- Try a different radius setting

### Missing data fields
- Enable collectDetails for complete information
- Some properties may not have all fields
- Check if proxies are working correctly
- Verify the property page is accessible

### Slow performance
- Reduce maxResults or maxPages
- Decrease concurrency settings
- Use faster proxies
- Disable collectDetails for faster extraction

### Proxy issues
- Use residential proxies instead of datacenter
- Ensure Apify proxy is enabled
- Check proxy configuration
- Try rotating proxy regions

## Integration & API

### Apify API
Access your scraped data via Apify API:

```javascript
// Get dataset items
const client = new ApifyClient({
    token: 'YOUR_API_TOKEN'
});

const run = await client.actor('YOUR_ACTOR_ID').call(inputConfig);
const dataset = await client.dataset(run.defaultDatasetId).listItems();
```

### Webhooks
Set up webhooks to get notified when scraping completes:
- Run succeeded
- Run failed
- Run aborted

### Scheduling
Schedule regular scraping runs:
- Daily property updates
- Weekly market analysis
- Monthly trend reports
- Custom schedules

## Support & Updates

### Getting Help
- Check the [Apify documentation](https://docs.apify.com)
- Contact support through Apify Console
- Report issues on the actor page

### Updates
This actor is regularly maintained and updated to:
- Adapt to Rightmove website changes
- Improve extraction accuracy
- Add new features
- Fix reported bugs
- Enhance performance

## Legal & Compliance

### Terms of Use
- This scraper is for personal and research use
- Respect Rightmove's terms of service
- Do not use for unauthorized commercial purposes
- Comply with data protection regulations (GDPR, etc.)
- Use responsibly with appropriate rate limiting

### Data Usage
- Scraped data is for legitimate use only
- Do not republish copyrighted content
- Respect intellectual property rights
- Follow fair use guidelines
- Comply with applicable laws and regulations

## FAQ

### Can I scrape properties for sale or rent?
This actor is optimized for new homes. For resale properties or rentals, modify the startUrl or search parameters accordingly.

### How many properties can I scrape?
You can scrape up to 1000 properties per run. For larger datasets, run multiple searches or increase maxPages.

### Why use proxies?
Rightmove implements rate limiting. Residential proxies help avoid blocking and ensure reliable data extraction.

### Is this legal?
Web scraping for personal research is generally legal. However, always review and comply with Rightmove's terms of service and applicable laws.

### How often should I scrape?
It depends on your needs. Daily scraping is common for market monitoring, while weekly or monthly may suffice for trend analysis.

### Can I export to my database?
Yes! Use Apify's API to integrate with your database or use webhooks to trigger data transfer automatically.

## Related Actors

- **Zoopla Property Scraper** - Extract properties from Zoopla
- **OnTheMarket Scraper** - Scrape OnTheMarket listings
- **Property News Scraper** - Monitor property market news
- **Real Estate Price Tracker** - Track property price changes

## Keywords

rightmove scraper, property scraper uk, real estate scraper, rightmove data extraction, uk property data, new homes scraper, property listings scraper, house price scraper, rightmove api alternative, property market data, real estate automation, property research tool, uk housing data, property price analysis, rightmove crawler, real estate data extraction, property investment tool, housing market scraper

---

## Example Use Cases

### Property Investment Research
```json
{
  "searchLocation": "Manchester",
  "minPrice": 150000,
  "maxPrice": 300000,
  "minBedrooms": 2,
  "propertyTypes": ["flat"],
  "collectDetails": true,
  "maxResults": 200
}
```

### Luxury Property Market Analysis
```json
{
  "searchLocation": "London",
  "minPrice": 1000000,
  "propertyTypes": ["detached", "penthouse"],
  "collectDetails": true,
  "maxResults": 100
}
```

### New Development Monitoring
```json
{
  "locationIdentifier": "REGION^87490",
  "radius": "10.0",
  "includeSSTC": false,
  "collectDetails": true,
  "maxResults": 500,
  "maxPages": 20
}
```

---

<p align="center">
  Made with ❤️ for property professionals, investors, and researchers
</p>

<p align="center">
  <strong>Start scraping Rightmove properties today!</strong>
</p>
