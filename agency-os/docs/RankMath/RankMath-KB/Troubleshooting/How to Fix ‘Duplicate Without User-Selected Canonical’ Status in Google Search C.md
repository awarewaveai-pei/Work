# How to Fix ‘Duplicate Without User-Selected Canonical’ Status in Google Search Console

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/duplicate-without-user-selected-canonical/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Fix ‘Duplicate Without User-Selected Canonical’ Status in Google Search Console

			
			

	

If you see the ‘Duplicate without user-selected canonical’ status in your Google Search Console account and in the Index Status report of Rank Math’s Analytics, it means that Google has found identical or very similar content on your website but has not been able to determine which page is the original/canonical version.

![Duplicate without user-selected canonical status](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201800%20651'%3E%3C/svg%3E)

This can happen for a number of reasons, but the most common is usually due to structural issues on your website (e.g. duplicate content in your sitemap or multiple pages with the same title tag).

![[Solved] Duplicate / Alternate Page with Proper Canonical Tag](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201280%20720'%3E%3C/svg%3E)
__

In this knowledgebase article, we’ll explain what causes this status and how to fix it by identifying the correct canonical version of your website.

## 1  What Causes this Status?

There are a few different scenarios that can cause the ‘Duplicate without user-selected canonical’ status:

- If your website has multiple pages with the same title tags or other structural issues that cause duplicate content to be indexed by Google, this status may occur.

- Another common cause of this status is if you’re using a dynamic or responsive website template that automatically generates links with the same URL (e.g. ?page=1, ?page=2, and more).

- If you have recently changed the structure of your website (e.g. changed your domain name or switched to a new content management system), this can also cause this status to occur while Google re-indexes your site.

## 2  How to Fix ‘Duplicate Without User-Selected Canonical’ Status

The first step in fixing the ‘duplicate without user-selected canonical’ status is identifying the pages affected by this status message.

To do this, head over to the **Pages** section of Google Search Console and click on the **Not indexed** tab.

![not indexed pages](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20902'%3E%3C/svg%3E)

Then, click on the “Duplicate without user-selected canonical” status, as shown below.

![Click on the error](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201500%20970'%3E%3C/svg%3E)

Next, you’ll see a list of all the pages on your website that are affected by this issue.

![list of affected pages](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201800%201352'%3E%3C/svg%3E)

Once you have a list of the affected pages in Google Search Console or in the [Index Status tab of Rank Math](https://rankmath.com/kb/url-inspection-api-integration/), it’s time to use the information to identify the canonical version of each page.

![Message status from Index Status tab](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202000%20511'%3E%3C/svg%3E)

There are two different methods you can use to fix the ‘Duplicate without user-selected canonical’ status:

- Method 1: 301 Redirects

- Method 2: Using Canonical URL

### 2.1  301 Redirects

**Important Note:** _You can only use this method if you want permanent redirects from one URL to another. However, if you still want the duplicate page to access with noindex tag, skip this method and go on to the next method._

301 redirects are permanent redirects from one URL to another. Any traffic currently going to the old URL will be automatically redirected to the new canonical version so that any ranking signals, such as links or page authority, will be passed on to the new version.

The best thing is that Rank Math can handle this for you. Simply go to the **Rank Math SEO → Redirections** in your WordPress admin dashboard as shown below:

![Rank Math Redirections Tab](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20638%20744'%3E%3C/svg%3E)

And then, you can go ahead and create a 301 redirect by simply entering the URL you wish to redirect as your Source URL and the location of the new resource (i.e. where you’d like to redirect the source URL to) as the Destination URL.

![Redirections Panel](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20850%201076'%3E%3C/svg%3E)

Once done, simply click on the **Add Redirection** button.

If you have a lot of URLs that need to be redirected, you can also add them in bulk.

[Learn more about bulk 301 redirects WordPress](https://rankmath.com/blog/bulk-301-redirects-wordpress/).

You can use the 301 redirect method if you permanently move a web page from one location to another. However, use canonical URLs if you still want both versions of the page to be accessible (just not in search results), and it simply wouldn’t be possible to use redirects to make that happen.

### 2.2  Using Canonical URL

A canonical URL is an HTML element that helps you avoid duplicate content issues by identifying exactly which version of a page should be considered the canonical or original version.

The good news is that Rank Math SEO WordPress plugin makes it easy to[change the canonical URL](https://rankmath.com/kb/how-to-change-canonical-url/) using the meta box (as pictured below).

![Advanced Tab](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20594%201030'%3E%3C/svg%3E)

By default, Rank Math uses the current post/page URL as the canonical URL, so you would only need to alter this setting if you wish to change it to something else. This is also known as a self-referencing canonical.

**Note:** If you cannot find the Advanced tab, please [enable Advanced Mode](https://rankmath.com/kb/switch-from-easy-to-advanced-mode/) at **WordPress Dashboard → Rank Math SEO**.

![Advanced Mode](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20920'%3E%3C/svg%3E)

Under the Advanced tab, you can change the Canonical URL field to point to the main source of your content. The Canonical URL informs the search crawlers of the main page if you have pages or posts with similar content.

The below screenshot is for reference only.

![Add Conanonical URL](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20592%20206'%3E%3C/svg%3E)

Once you’re done setting your Canonical URL, update the page as you normally would after making a change or click **Publish**if this is a newly created page.

Long story short, to fix Duplicate without user-selected canonical’, you can create a 301 redirect or use a canonical URL with the help of Rank Math.

And with that, we come to the end of our article on how to fix the ‘Duplicate without user-selected canonical’ status in Google Search Console and in the Index Status report of Rank Math’s Analytics.

If you still have absolutely any questions, please feel free to [reach our support team directly from here](https://rankmath.com/support/), and we’re always here to help.

			

			 

			
	
		
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