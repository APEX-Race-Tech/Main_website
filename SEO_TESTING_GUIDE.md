# SEO Testing & Monitoring Guide

This guide provides step-by-step instructions for testing and monitoring your website's SEO implementation.

## ✅ Completed Steps

1. ✅ **Domain URLs Updated**: All meta tags now use `https://apexracetech.in`
2. ✅ **Sitemap Created**: `sitemap.xml` file created with all pages
3. ✅ **Robots.txt Created**: `robots.txt` file created for search engine crawlers

---

## 1. Test Structured Data (JSON-LD)

### Using Google's Rich Results Test

1. **Visit the Rich Results Test Tool**:
   - Go to: https://search.google.com/test/rich-results
   - Or use: https://validator.schema.org/

2. **Test Your Page**:
   - Enter your URL: `https://apexracetech.in/race-insight.html`
   - Click "Test URL"
   - Review the results

3. **What to Look For**:
   - ✅ SoftwareApplication schema should be detected
   - ✅ Organization information should be present
   - ✅ No errors or warnings
   - ✅ All required fields are present

4. **Alternative: Schema.org Validator**:
   - Visit: https://validator.schema.org/
   - Paste your page URL or HTML code
   - Verify the structured data is correctly formatted

### Expected Results:
- **Schema Type**: SoftwareApplication
- **Name**: Race Insight
- **Category**: Data Analysis Application
- **Operating Systems**: Windows, Linux, macOS
- **Publisher**: APEX Race Technologies

---

## 2. Submit Sitemap to Google Search Console

### Step 1: Verify Your Website

1. **Go to Google Search Console**:
   - Visit: https://search.google.com/search-console

2. **Add Property**:
   - Click "Add Property"
   - Enter: `https://apexracetech.in`
   - Choose verification method (HTML file, DNS, or HTML tag)

3. **Verify Ownership**:
   - Follow the verification steps
   - Once verified, you'll have access to Search Console

### Step 2: Submit Sitemap

1. **Navigate to Sitemaps**:
   - In Google Search Console, go to "Sitemaps" in the left sidebar
   - Or visit: https://search.google.com/search-console/sitemaps

2. **Submit Your Sitemap**:
   - Enter: `sitemap.xml`
   - Click "Submit"
   - Wait for Google to process (usually within minutes to hours)

3. **Monitor Status**:
   - Check the status regularly
   - Ensure it shows "Success" with the number of URLs discovered

### Step 3: Submit to Bing Webmaster Tools (Optional)

1. **Visit Bing Webmaster Tools**:
   - Go to: https://www.bing.com/webmasters

2. **Add Your Site**:
   - Sign in with Microsoft account
   - Add `https://apexracetech.in`
   - Verify ownership

3. **Submit Sitemap**:
   - Go to "Sitemaps" section
   - Submit: `https://apexracetech.in/sitemap.xml`

---

## 3. Monitor Performance in Google Search Console

### Key Metrics to Track:

1. **Performance Tab**:
   - **Clicks**: Number of clicks from Google search
   - **Impressions**: How many times your site appeared in search
   - **CTR (Click-Through Rate)**: Percentage of impressions that resulted in clicks
   - **Average Position**: Your average ranking position

2. **Coverage Tab**:
   - **Valid Pages**: Pages successfully indexed
   - **Excluded Pages**: Pages not indexed (with reasons)
   - **Errors**: Any indexing errors

3. **Enhancements Tab**:
   - Check for structured data issues
   - Monitor mobile usability
   - Review Core Web Vitals

### Setting Up Monitoring:

1. **Set Up Email Alerts**:
   - Go to Settings → Users and permissions
   - Add email notifications for important changes

2. **Regular Checks**:
   - **Weekly**: Review performance metrics
   - **Monthly**: Check for new indexing issues
   - **Quarterly**: Review and update sitemap

3. **Key Reports to Monitor**:
   - Top performing pages
   - Top search queries
   - Index coverage issues
   - Mobile usability issues

---

## 4. Test Social Sharing (Open Graph & Twitter Cards)

### Facebook/LinkedIn Sharing Test

1. **Facebook Sharing Debugger**:
   - Visit: https://developers.facebook.com/tools/debug/
   - Enter URL: `https://apexracetech.in/race-insight.html`
   - Click "Debug"
   - Review the preview

2. **What to Verify**:
   - ✅ Title: "Race Insight | APEX Race Technologies"
   - ✅ Description: Should show the meta description
   - ✅ Image: Should display the lap comparison UI image
   - ✅ URL: Should be correct

3. **Scrape Again** (if needed):
   - If you made changes, click "Scrape Again" to refresh Facebook's cache

### Twitter Card Validator

1. **Twitter Card Validator**:
   - Visit: https://cards-dev.twitter.com/validator
   - Enter URL: `https://apexracetech.in/race-insight.html`
   - Click "Preview card"

2. **What to Verify**:
   - ✅ Card Type: "summary_large_image"
   - ✅ Title: "Race Insight | APEX Race Technologies"
   - ✅ Description: Should display correctly
   - ✅ Image: Large image preview should appear

### LinkedIn Post Inspector

1. **LinkedIn Post Inspector**:
   - Visit: https://www.linkedin.com/post-inspector/
   - Enter URL: `https://apexracetech.in/race-insight.html`
   - Click "Inspect"

2. **What to Verify**:
   - ✅ Open Graph tags are detected
   - ✅ Preview looks correct
   - ✅ Image displays properly

### Manual Testing

1. **Test on Social Platforms**:
   - Create a test post on Facebook
   - Create a test tweet on Twitter/X
   - Share on LinkedIn
   - Verify the preview looks correct

2. **Check Image Requirements**:
   - **Facebook/LinkedIn**: Minimum 600x315px (recommended 1200x630px)
   - **Twitter**: Minimum 300x157px (recommended 1200x675px)
   - Your current image should meet these requirements

---

## 5. Additional SEO Tools & Resources

### Free SEO Tools:

1. **Google PageSpeed Insights**:
   - https://pagespeed.web.dev/
   - Test page speed and Core Web Vitals
   - Get optimization recommendations

2. **Google Mobile-Friendly Test**:
   - https://search.google.com/test/mobile-friendly
   - Verify mobile responsiveness

3. **Bing Webmaster Tools**:
   - https://www.bing.com/webmasters
   - Submit sitemap and monitor Bing indexing

4. **Ahrefs Webmaster Tools** (Free):
   - https://ahrefs.com/webmaster-tools
   - Free SEO audit and backlink checker

5. **Ubersuggest** (Free tier):
   - https://neilpatel.com/ubersuggest/
   - Keyword research and SEO analysis

### Browser Extensions:

1. **SEO META in 1 CLICK**:
   - Chrome extension to view meta tags
   - Quick preview of Open Graph tags

2. **META SEO Inspector**:
   - Firefox extension
   - View all SEO-related meta tags

---

## 6. Maintenance Checklist

### Weekly:
- [ ] Check Google Search Console for errors
- [ ] Monitor search performance metrics
- [ ] Review top search queries

### Monthly:
- [ ] Update sitemap if new pages are added
- [ ] Check for broken links
- [ ] Review and update meta descriptions if needed
- [ ] Check social sharing previews

### Quarterly:
- [ ] Review and update structured data
- [ ] Audit page speed and Core Web Vitals
- [ ] Review keyword rankings
- [ ] Update content based on search trends

---

## 7. Troubleshooting

### Sitemap Not Being Read:
- Verify `sitemap.xml` is accessible at: `https://apexracetech.in/sitemap.xml`
- Check robots.txt includes sitemap location
- Ensure XML is valid (no syntax errors)

### Structured Data Errors:
- Use Google's Rich Results Test to identify issues
- Check JSON-LD syntax is valid
- Verify all required fields are present

### Social Sharing Not Working:
- Clear Facebook/Twitter cache using their debugger tools
- Verify image URLs are absolute (not relative)
- Check image dimensions meet platform requirements
- Ensure Open Graph tags are in the `<head>` section

### Pages Not Indexing:
- Check robots.txt isn't blocking pages
- Verify pages are linked from sitemap
- Ensure pages have unique, descriptive content
- Check for noindex meta tags

---

## Quick Links

- **Google Search Console**: https://search.google.com/search-console
- **Rich Results Test**: https://search.google.com/test/rich-results
- **Schema Validator**: https://validator.schema.org/
- **Facebook Debugger**: https://developers.facebook.com/tools/debug/
- **Twitter Card Validator**: https://cards-dev.twitter.com/validator
- **LinkedIn Inspector**: https://www.linkedin.com/post-inspector/
- **PageSpeed Insights**: https://pagespeed.web.dev/

---

## Notes

- Update the `<lastmod>` dates in `sitemap.xml` when you make significant changes to pages
- Keep your sitemap under 50,000 URLs (you're well within this limit)
- Sitemap file size should be under 50MB uncompressed
- Consider creating separate sitemaps for different content types if your site grows significantly

---

**Last Updated**: January 27, 2025
