# How to Use Regex in Google Search Console

> **Category:** Analytics
> **Source:** https://rankmath.com/kb/regex-in-google-search-console/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Use Regex in Google Search Console

			
			

	

Have you ever felt like the data you sift through in Google Search Console just doesn’t provide enough specific information?

If so, Regular Expressions, or Regex, might be just what you need to take your data analysis to the next level.

Regex can help you isolate specific trends, user queries, and page performance metrics with unmatched precision, giving you access to even more valuable insights.

In this knowledgebase article, we’ll guide you through the basics of Regex, offer practical use cases, and share tips to ensure your filters deliver the most valuable insights possible.

## 1  What is Regex?

Regular Expressions, commonly known as Regex, is a syntax used to search and manipulate text. With Regex, you can define complex search patterns within text and match patterns beyond just exact words.

Regex uses a combination of literal characters (such as “a” or “b”) and special characters, known as **metacharacters**, to form these patterns.

For instance, the expression “_.*Apple._” signifies matching any string that contains “Apple” within it, where “.” represents any single character and “*” represents zero or more repetitions of the preceding character.

By combining these metacharacters, you can create complex filters to find specific data in your Search Console reports.

## 2  Why Use Regex in Google Search Console?

Google Search Console integrates Regex functionality into its Performance reports, allowing for more precise filtering and analysis of website data. Here are the key benefits:

- **Advanced Filtering**: Craft highly specific filters to analyze patterns or segments of data that would be impossible with basic filtering methods.

- **Extracting Specific Data**: Isolate URLs or search queries to focus on granular details instead of broad datasets.

- **Unveiling Keyword Insights**: Identify common phrases or terms users employ to find your website.

- **Refining Your Focus**: Exclude irrelevant data like internal traffic or bot activity to concentrate on the most valuable user interactions.

- **Identifying Issues or Opportunities**: Create targeted Regex filters to uncover specific issues or opportunities related to your website performance in search results.

- **Grouping and Categorizing Data**: Group similar queries, URLs, or other data elements based on patterns, helping identify themes, trends, or commonalities to inform content strategy or other [SEO efforts](https://rankmath.com/blog/best-seo-practices/).

## 3  How to Access and Use Regex Filters in Google Search Console

If you want to make the most out of your Google Search Console data, using regex filters can be highly beneficial.

However, keep in mind that Google Search Console only supports [RE2 Syntax](http://code.google.com/p/re2/wiki/Syntax), which differs from other regular expression syntaxes. Regular expressions are case-sensitive by default.

To start, sign in to your [Google Search Console account](https://search.google.com/search-console/about) and select the website you want to analyze.

Then, navigate to the **Performance**tab to see your website’s performance report for the past months. Click the **Add Filter**button at the top of the Performance page, as shown below.

![Google Search Console Performance tab](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20674'%3E%3C/svg%3E)

This will open a few options, including “Query” and “Page”. Choose any of these two options, as they support the Regex filter.

![Query and Page options in GSC](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201373%20932'%3E%3C/svg%3E)

Depending on the option you choose, click on the dropdown arrow to select the filter type. From the options that appear on the dropdown list, select the “Custom (regex)” option, as shown below.

![Selecting the Custom(regex) option](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201390%20761'%3E%3C/svg%3E)

When you click the “Custom (regex)” option, you will be directed to the field where you can enter your regular expression. Once done, click the **Apply**button to save your regex filter.

![Where to add your regex in GSC](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20679'%3E%3C/svg%3E)

The data in the Performance report will now be filtered based on your regex pattern.

**Note:** Google Search Console imposes a character limit 4096 for regex filters.

Now that you know how to access the regex filter on Search Console, it’s time to learn about some common [regular expression syntax](https://support.google.com/a/answer/1371415?hl=en) you can use to filter your website performance report.

## 4  Common Regex Use Cases for Search Console (with Examples)

Below are some common regex use cases for Google Search Console and their functions, along with example strings that they can match or cannot match.

### 4.1  Identify User Intent

To identify user intent, you can use regular expressions such as:

**[Informational intent](https://rankmath.com/seo-glossary/informational-query/)**

`(?i)^(who|what|where|when|why|how)`

This regular expression can help you identify areas where your content might need to be more informative or answer user questions directly, regardless of the case.

The breakdown of this regular expression is as follows:

- `(?i)`: Makes the match case insensitive.

- `^`: Matches the beginning of the string.

- `(who|what|where|when|why|how)`: Matches any of the listed question words.

Here are some examples:

- Match: “What is the capital of France?”

- Match: “How to bake a cake”

- Doesn’t match: “Tell me about the weather”

- Doesn’t match: “The best movies of 2020”

**[Transactional intent](https://rankmath.com/seo-glossary/transactional-query/)**

`.*?(buy|purchase|order).*`

This regex matches queries indicating user intention to buy or order something.

The `.*?`matches any characters before the transactional words, and the `.*`matches any characters after the transactional words.

Examples:

- Match: “Where to buy Nike shoes”

- Match: “Purchase iPhone online”

- Doesn’t match: “iPhone features”

- Doesn’t match: “Best smartphones 2023”

**[Navigational intent](https://rankmath.com/seo-glossary/navigational-query/)**

`^(brand name).*`

This regex matches queries starting with your brand name.

Examples:

- Matches: “Nike official website”

- Matches: “Apple support”

- Doesn’t match: “Best smartphones 2024”

[**Commercial** **intent**](https://rankmath.com/seo-glossary/commercial-query/)

`.*(best|top|vs|review*).*`

This regex matches queries indicating comparison or seeking reviews.

The `.*`matches any character sequence (including an empty string) before and after the commercial intent words and `(best|top|vs|review*)` matches any of the listed commercial intent words, including variations of “review” like “reviews” or “reviewing.”

Examples:

- Matches: “Best laptops 2024”

- Matches: “iPhone 13 vs Samsung S22”

- Doesn’t match: “How to fix a leaky faucet”

**Negative Sentiment Analysis**

`(don't|not|terrible|worst|waste).*`

This regex matches queries indicating users’ negative sentiments or frustrations.

Examples:

- Matches: “Worst customer service ever”

- Matches: “Don’t buy this product”

- Doesn’t match: “Best vacation spots”

### 4.2  Regex for Queries by Character Count

**Short-tail queries (less than 10 character**s)

To match queries with 1-10 characters (case-insensitive), you can use the following regular expression:

`^(?i)[\w\W\s\S]{1,10}$`

Here’s a breakdown:

- `^`: Start of the string

- `(?i)`: Case-insensitive match

- `[\w\W\s\S]{1,10}`: Matches any character (word, non-word, whitespace, or special) 1-10 times

- `$`: End of the string

Example:

- Matches: “hello”

- Matches: “search”

- Doesn’t match: “this is a long query”

**Medium-tail queries (less than 10-30 characters)**

To match queries with 10-30 characters (case-insensitive), use the following regular expression:

`^(?i)[\w\W\s\S]{10,30}$`

Example:

- Matches: “this is a medium query”

- Doesn’t match: “hello”

**Long-tail queries (more than 30 characters)**

To match queries with more than 30 characters (case-insensitive), use the following regular expression:

`^(?i)[\w\W\s\S]{30,}$`

Example:

- Matches: “this is a very long query with many words”

- Matches: “hello world search query with many characters”

- Doesn’t match: “hello”

- Doesn’t match: “search query”

### 4.3  Regex for Queries by Word Count

Regex filters allow you to classify search queries based on their word count. You can use the following regular expressions to classify search queries based on their word count.

**Short-tail Queries:** `^\b\w+\b$`

This regex matches queries with only one word.

Example:

- Matches: “shoes”

- Doesn’t match: “best shoes for running”

**Medium-tail Queries:** `^\b\w+(?:\s+\w+){1,2}\b$`

This regex matches queries with 2-3 words.

Example:

- Matches: “best running shoes”

- Matches: “top 10 smartphones”

- Doesn’t match: “how to bake a cake”

**Long-tail Queries:** `^\b\w+(?:\s+\w+){3,}\b$`

This regex matches queries with more than 3 words.

Example:

- Matches: “how to bake a cake from scratch”

- Matches: “best places to travel in 2022”

- Doesn’t match: “running shoes”

### 4.4  Show HTTP/HTTPS/Subdomains Variations

To match various URL variations for the domain “example.com”, you can use the following regular expression:

`https?\:\/\/.*example\.com\/?`

Here’s a breakdown:

- `https?`: Matches “http” or “https” (optional “s”).

- `:\/\/`: Matches the colon and forward slashes.

- `.*`: Matches any subdomain present before “example.com”.

- `example\.com`: Matches the main domain name.

- `.*`: Matches any path or query string within the URL (optional).

- `\/?`: Matches either a trailing slash or no trailing slash at the end (optional).

Example:

- Matches: “http://example.com”

- Matches: “https://example.com”

- Matches: “http://subdomain.example.com”

- Matches: “https://example.com/path”

- Doesn’t match: “http://otherdomain.com”

- Doesn’t match: “https://example.net”

### 4.5  Filtering Queries Based on Special Characters

To exclude queries starting with “#” or to match queries containing special characters, use the following regular expressions:

- **Excludes queries starting with “#”:**`^[^#]+$`

- **Matches queries containing special characters:** `.*[!@#$%^&*(),.?":{}|<>].*`

- **Matches queries without special characters:** `^[a-zA-Z0-9 ]+$`

### 4.6  Identifying Queries Related to Specific Languages or Regions

To match queries containing language codes like “en”, “fr”, “es”, or “de”, use the following regular expression:

`\b(en|fr|es|de)\b`

To match queries containing country or region names, use the following regular expression:

`\b(usa|uk|canada|australia)\b`

These queries will help you Segment data for deeper insights based on your users’ locations.

### 4.7  Ends With a Trailing Slash

You can use regex filters in Google Search Console to match pages that contain (or do not) the trailing slash at the end.

`.*\/$`

This regex matches any string of characters that ends with a forward slash.

Example:

- Matches: “example.com/products/”

- Matches: “example.com/about-us/”

- Doesn’t match: “example.com/products”

- Doesn’t match: “example.com/about-us”

### 4.8  URL Matching

You can also use regex filters in Google Search Console to match URLs with specific words or patterns.

To do this, use the following regular expressions:

**Match URLs with a specific word**

`\/category\/\w+`

This regex matches URLs that contain the word “category” followed by any word character.

Example:

- Matches: “example.com/category/products”

- Matches: “/category/books”

- Doesn’t match: “example.com/products”

**Match URLs with a specific pattern**

`\/archive\/\d{4}\/\d{2}`

This regex matches URLs that contain the word “archive” followed by a year (4 digits) and a month (2 digits).

Example:

- Matches: “example.com/archive/2022/09”

- Matches: “example.com/archive/2023/01”

- Doesn’t match: “example.com/archive/22/09”

**Match URLs with optional parameters**

`\/product\/\d+\/(edit)?`

This regex matches URLs that contain the word “product” followed by one or more digits and an optional “/edit” parameter.

Example:

- Matches: “/product/123/sale”

- Matches: “example.com/product/456/edit”

- Doesn’t match: “example.com/products”

These queries can help you analyze your website traffic by identifying the URLs in specific directories and understanding the search queries that lead users to different sections of your content.

### 4.9  Match Branded Terms

It’s common for people to make spelling mistakes when searching for brands. You can effectively evaluate brand searches using regular expressions.

For example, let’s consider possible misspellings of ‘Facebook’. Here’s a regex that can capture different variations of the term:

```
.*facbook.*|.*facebok.*|.*faceboook.*|.*facbookk.*|.*facebokk.*|.*faceboookk.*|.*fb.*|.*faacebook.*|.*faceboo.*|.*facebo.*|.*fcaebook.*|.*facebok.*|.*facebookk.*
```

- `.*`: Matches any sequence of characters (zero or more)

- `facbook.*|facebok.*|...`: Matches any of the listed variations of the brand name “Facebook”

- `.*`: Matches any sequence of characters (zero or more)

Examples:

- Matches: “facebook login”

- Matches: “facebok search”

- Matches: “faceboook page”

- Matches: “faceboookk news”

- Doesn’t match: “Instagram”

- Doesn’t match: “WhatsApp”

### 4.10  Identifying Specific Anchor Text

Another way to use regex filters in Google Search Console is to identify specific [anchor text.](https://rankmath.com/blog/jump-links/)

You can use the following regular expressions to match any anchor text that contains specific keywords:

`.*(keyword1|keyword2|keyword3)`

This regex matches any anchor text that contains the keywords “keyword1”, “keyword2”, or “keyword3”.

Example:

- Matches: “Buy keyword1 now”

- Matches: “Keyword2 for sale”

- Doesn’t match: “This is a sentence with no keywords”

`.*(buy|purchase|shop)`

This regex matches any anchor text that contains the words “buy,” “purchase,” or “shop.” Remember that it’s case-sensitive.

Example:

- Matches: “shop now for the best deals”

- Matches: “buy this product today”

- Doesn’t match: “Learn about the history of this product”

### 4.11  Spot AI-Powered Search Queries

As AI-powered SERPs like Google AI Overviews and AI mode become more common, you may start noticing queries in your Search Console that humans didn’t type. These AI-generated queries tend to be longer, more structured, and often include formal or analytical language.

Although Google doesn’t currently separate AI traffic from regular traffic, you can use Regex filters to detect patterns that are likely AI-generated.

**Match multi-question queries**

AI tools often structure queries as full questions. To catch these, use:

`\?\s*(is|are|has|have|does|do)\s+.{0,50}\s*\?`

This matches prompts like:

- “Is digital marketing still effective?”

- “Does content length affect SEO?”

**Match extremely long, detailed queries**

AI searches are usually lengthy. To detect them, use this pattern for queries with at least 32 words:

`([^" "]*\s){32,}?`

#### Match analytical or strategic language

Many AI-generated queries use advanced or formal phrasing, especially for research or business-related tasks. You can filter them using patterns like:

**Strategic and business terms:**

`strategic\s+(initiatives?|plans?|roadmap|goals?)`

Matches:

- “strategic initiatives 2026”

- “company roadmap and future plans”

**Comprehensive or research-based phrases:**

`comprehensive\s+(analysis|overview|assessment|evaluation)`

Matches:

- “comprehensive market analysis for fintech startups”

- “detailed assessment of online sales performance”

**Time-based patterns (temporal markers):**

`(last|past|recent)\s+\d+\s+(months?|years?|quarters?)`

Matches:

- “latest product launches in the past 12 months”

- “sales trends over the last 2 years”

You can also combine these patterns to spot highly detailed queries that resemble AI research prompts.

**Tip:** Sort your query report by **Impressions (ascending)** to surface low-volume, high-quality AI-style queries—often with just 1 to 10 impressions.

So, these are some regular expressions you can use to filter your Google Search Console (GSC) results.

**Note:** Be sure to replace these characters with your preferred ones to meet your specific requirements and expectations.

## 5  Tips and Best Practices for Using Regular Expressions (Regex)

While regular expressions are powerful tools, they can also be complex and difficult to master.

Here are some tips and best practices to help you use regex effectively in Google Search Console:

### 5.1  Start Simple

If you’re new to Regex, start with basic patterns and gradually progress towards more intricate ones as you gain experience. This will help you avoid confusion and frustration and make the learning process more manageable.

### 5.2  Test Thoroughly

Devising a complex Regex pattern can be tricky. Always test your expression meticulously using a [Regex tester tool](https://regex101.com/) before applying it to your Search Console data to ensure it yields the desired results. This will save you time and prevent errors down the line.

### 5.3  Negative Matching

Google Search Console’s Regex functionality extends to negative matching as well. This allows you to exclude unwanted data from your reports.

![Doesn't match regex option in GSC](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201389%20937'%3E%3C/svg%3E)

Be sure to consider negative matching when crafting your Regex patterns to ensure you are filtering out irrelevant data.

### 5.4  Document Your Regex

Once you find Regex patterns that work well for you, document them and their intended use cases for future reference and collaboration. This will save you time and effort in the long run and help you stay organized.

### 5.5  Be Mindful of Performance

Complex regex patterns can impact performance, so optimize patterns where possible. Use Regex sparingly and only when necessary to avoid slowing down the performance.

### 5.6  Utilize Resources

Numerous online resources offer tutorials and cheat sheets for mastering regex. You can use these resources to learn best practices, discover new techniques, and find solutions to common regex challenges.

Keep these resources handy to improve your regex skills and stay up-to-date with the latest trends and best practices.

That’s it! We hope you have learned how to use Regex in Google Search Console. If you still have further questions, please don’t hesitate to [reach out to our support team](https://rankmath.com/support/). They are available 24/7, 365 days a year.

			

			 

			
	
		
### Still not using Rank Math?

		
Setup takes less than 5 minutes including the import from your old SEO Plugin!

		
[Learn more about the PRO Version](https://rankmath.com/pricing/)

									[Download FREE Version](https://rankmath.com/thank-you/?download_id=seo-suite)
							
		

	

		
### Still need help?

		
			?
			
				
#### Submit Your Question

				
Please give us the details, our support team will get back to you.

			
			[Open Ticket](https://rankmath.com/support/)
		
								
			

			

     
	
		
### Related Articles

		

										
			
- [How to Create SEO Reports for Clients](https://rankmath.com/kb/create-seo-reports-for-clients/)

										
			
- [How to Check the Traffic Source of Your Website](https://rankmath.com/kb/check-the-traffic-source-ga4/)

										
			
- [How Long Does It Take for Google Analytics 4 to Show Data?](https://rankmath.com/kb/ga4-data-freshness/)

										
			
- [How to Track Affiliate Link Clicks on Your Website](https://rankmath.com/kb/track-affiliate-link-clicks/)

										
			
- [How to Track File Downloads on Your Website](https://rankmath.com/kb/track-file-downloads/)

										
			
- [How to Track Outbound Links and Monitor Click Data on Your Site](https://rankmath.com/kb/track-outbound-links/)