# How to Fix “Crawled – Currently Not Indexed” Error in Google Search Console

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/crawled-currently-not-indexed/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Fix “Crawled – Currently Not Indexed” Error in Google Search Console

			
			

	

Google does not index 100% of the pages you submit, and there are various reasons for a page to be excluded from being indexed. If you’ve already [verified your website with Google Search Console](https://rankmath.com/kb/google-site-verification/), you can identify these excluded pages by navigating to the **Pages → Not Indexed** section inside your Search Console.

![[Solved] Discovered / Crawled - Currently Not Indexed Issue in Google Search Console](https://img.youtube.com/vi/S5hcOZmslBw/maxresdefault.jpg)
__

This section contains various reasons for pages being excluded, and one among them is, **Crawled – currently not indexed**. In this knowledgebase article, we’ll understand what this status means and how you can increase your chances of indexing your pages.

## 1  What Does This Status Mean?

**Crawled – currently not indexed** means Google has crawled your page but has not indexed it yet. As we already know, Google does not index all the URLs we submit, and finding a certain number of URLs under this status is completely normal. And to make it clear, this isn’t an error but more of a reason why Google has excluded the page(s) from its index.

![Crawled - currently not indexed status in Google Search Console](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%201148'%3E%3C/svg%3E)

Regardless of how the Search Console reports it, we understand this status seems alarming, as it is important for a page to **get indexed** before it can **rank for keywords** & **drive organic traffic** to your website. So, let’s understand why your pages are grouped under this status.

### 1.1  Reporting Difference

When you notice a URL being marked as “Crawled – currently not indexed”, you first need to check the page with the URL Inspection Tool.

![Inspect URL in Google Search Console](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202304%20438'%3E%3C/svg%3E)

If the URL Inspection Tool marks the page indexed, it indicates a **discrepancy between the reports** in the Google Search Console.

![URL submitted and indexed in Google Search Console](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%201106'%3E%3C/svg%3E)

Google has also explained that Page indexing report data is being refreshed at a different rate (usually at a slower rate) compared to their URL Inspection tool. So it is understandable that it takes a few days for the Page indexing report to reflect the actual status of any page.

The URL Inspection tool reflects more recent data and should be considered for checking the page status. Here is what Google has got to say:

> This is because the Index Coverage report data is refreshed at a different (and slower) rate than the URL Inspection. The results shown in URL Inspection are more recent, and should be taken as authoritative when they conflict with the Index Coverage report. (2/4)

— Google Search Central (@googlesearchc) [October 11, 2021](https://twitter.com/googlesearchc/status/1447531449968644098?ref_src=twsrc%5Etfw)

> As always, thanks for the feedback 🙏, we’ll look for ways to decrease this discrepancy so our reports and tools are always aligned and fresh! (4/4)

— Google Search Central (@googlesearchc) [October 11, 2021](https://twitter.com/googlesearchc/status/1447531453202538499?ref_src=twsrc%5Etfw)

Despite the fact that there is a reporting gap in Google Search Console, webmasters have reported pages being indexed a very long ago, still being reported as Crawled – currently not indexed. If you happen to notice the same, it is likely another reporting issue from Google, and we recommend you to open a thread at [Google Search Help Community](https://support.google.com/websearch/community) for the experts to have a further look into the issue.

### 1.2  Site-Wide Quality Issue

As we said, you need to consider the URL Inspection Tool to check the actual status of the page. But, if the URL Inspection Tool also reflects the status as Crawled – currently not indexed, then it is certainly not a reporting issue.

So to dig deeper into this issue, we would recommend you to look into the type of URLs that are being excluded under this status.

If you notice most pages are of the type archives pages, feed pages, and other miscellaneous pages with really thin content, then it is understandable that the page does not provide any value to the users to be indexed in the search results. If that is the case, it is safe to say you can ignore this status.

But if you’re seeing any important pages (_having valuable/useful information_) on your website being listed here, then as Google’s John Mueller suggests, it is likely an overall site-wide quality issue that has affected your important pages from being indexed.

Further, he recommends improving the structure & overall quality of your website.

> _You can’t force pages to be indexed — it’s normal that we don’t index all pages on all websites. It’s not an issue with “that page”, it’s more site-wide. Creating a good site structure and making sure the site is of the highest quality possible is essentially the direction.— John Mueller (@JohnMu) [June 28, 2021](https://twitter.com/JohnMu/status/1409567136322838530)_

### 1.3  Appearance of WebP Images

You might also be confused when WebP images appear in the “Crawled – currently not indexed” report in Google Search Console. It’s important to remember that WebP images are image files, not HTML pages. As such, they don’t get indexed in the same way that webpages do. Google treats them differently because they lack the content and structure that defines a webpage.

If the image URL resembles a webpage link or the file extension is unclear (e.g., .php or none), it may lead to confusion in the indexing process. This can cause Google to categorize these images as “Crawled – currently not indexed.”

However, even though they aren’t indexed in this report, WebP images can still be discovered through Google Image Search. So, if you see this in your Search Console, you can safely ignore it.

## 2  How to Improve the Overall Site Quality?

Simply put, for a page to be indexed, the page (and website) must pass quality checks. Since Google has not disclosed anything specific they look for while indexing, you must consider evaluating your website against well-known quality factors like,

### 2.1  Internal Linking Structure

If you’re trying to index an important page, ensure they have internal links from relevant pages on your website. To build internal links, you can set your important pages as pillar content and let Rank Math suggest relevant internal links.

### 2.2  Duplicate Content

Check if the pages you’re trying to index are duplicated on your website. In case you find any, [add a canonical tag from these duplicate pages](https://rankmath.com/kb/how-to-change-canonical-url/), pointing to the original content that you want to index.

### 2.3  Content Audit

At any point in time, a website will have some outdated content. A content audit will help you identify such pages lacking value, and you can improve the page. In cases where it is inappropriate to add more content to the page, you may consider alternatives like,

- Removing the page altogether

- Redirecting to a more relevant page

- Adding noindex meta tag

When you add a [noindex meta tag](https://rankmath.com/kb/how-to-noindex-urls/), the content will still remain on your website for your audience, but you’re telling search engines not to consider this for indexing. As confirmed by Google’s John Mueller, [site quality is considered only for pages that are set to be indexed](https://www.seroundtable.com/google-site-quality-indexed-pages-25593.html).

You can**improve the overall site quality**by systematically removing low-quality pages from the index. Having said that, site quality isn’t something that changes overnight. It takes a while for Google to pick up the signals, reprocess and reevaluate your overall site quality.

> _Making significant quality changes across a site takes time to be picked up & reflected in search. These things often take several months to be reprocessed & reevaluated.— John Mueller (@JohnMu) [June 16, 2021](https://twitter.com/JohnMu/status/1405073625045164037)_.

But rest assured, any improvement in the site quality will be rewarded with increased visibility in search results.

## 3  How to Fix “Crawled- Currently Not Indexed” Error in Google Search Console Using Rank Math

While passing the quality checks, search engines take a few days to index your pages. To inform search engines to index your pages instantly, use Rank Math’s [Instant Indexing](https://rankmath.com/kb/how-to-use-indexnow/) feature. To use this feature, enable the**Instant Indexing**module by navigating to **WordPress Dashboard**→ **Rank Math SEO**.

![instant indexing module](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202500%201043'%3E%3C/svg%3E)

Next, on the **Posts** page, hover over the post you wish to index and select****the**Instant Indexing: Submit Page** option, as shown below.

![instant indexing option](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201487%20602'%3E%3C/svg%3E)

You can check your page’s index status within your WordPress dashboard by navigating to **Rank Math SEO →** **Analytics → Index Status**. However, if you’re a Rank Math PRO user, you can access advanced Index stats.

![Analytics index status](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202549%202139'%3E%3C/svg%3E)

And that’s it! We hope the article helped you understand why your pages are excluded from the search index with this status. But if you still have absolutely any questions, please feel free to [reach our support team directly from here](https://rankmath.com/support/), and we’re always here to help.

			

			 

			
	
		
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

		

										
			
- [How to Fix the Japanese Keyword Hack in WordPress](https://rankmath.com/kb/fix-japanese-keyword-hack/)

										
			
- [How to Disable Directory Listing in WordPress](https://rankmath.com/kb/disable-directory-listing/)

										
			
- [How Rank Math Prevents Duplicate Content Issues in a WooCommerce Store](https://rankmath.com/kb/woocommerce-duplicate-content-issues/)

										
			
- [How to Fix Indexing Issues in Google Search Console](https://rankmath.com/kb/fix-google-indexing-issues/)

										
			
- [How to Resolve Wordfence Warning for update-1.0.42.php?](https://rankmath.com/kb/fix-wordfence-warning/)

										
			
- [Why GSC Shows “No Referring Sitemaps Detected”](https://rankmath.com/kb/no-referring-sitemaps-detected/)