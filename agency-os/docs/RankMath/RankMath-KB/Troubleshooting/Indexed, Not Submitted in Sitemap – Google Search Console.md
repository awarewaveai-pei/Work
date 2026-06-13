# Indexed, Not Submitted in Sitemap – Google Search Console

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/indexed-not-submitted-in-sitemap/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Indexed, Not Submitted in Sitemap – Google Search Console

			
			

	

The status **Indexed, not submitted in sitemap**, is commonly seen in your Google Search Console’s Page indexing report, and you might find some URLs being listed under them, as shown below.

![Indexed, Not submitted in Sitemap](https://rankmath.com/wp-content/uploads/2022/10/indexed-not-submitted-in-sitemap.jpg)

In this knowledgebase article, we’ll discuss why Google Search Console says **Indexed, not submitted in sitemap**.

## What is “Indexed, Not Submitted in Sitemap”?

The status **Indexed, not submitted in sitemap** indicates that Google has indexed these URLs on your website, but it has not found these URLs through the submitted XML sitemap.

In most cases, this isn’t a big problem, but it can be a useful pointer that you don’t have an XML sitemap, you’ve not yet submitted it to Google Search Console, or that important pages are missing from your XML sitemap.

If most part of the URLs on your website is under this category, then it is possible that Google is crawling and indexing the posts through the internal links on your website and not through the sitemap. As long as the posts/pages are getting crawled and indexed, there’s nothing to be worried about.

But if you wish to identify the exact reason why your URLs are listed here, it could be one of the below-listed reasons.

## Why Do You Get “Indexed, Not Submitted in Sitemap” Status?

Here are some of the reasons for the **Indexed, not submitted in sitemap** status:

### 1  Custom Canonical

If you are adding a Custom Canonical to your page, then it’s likely you will come across this status. By changing your [canonical URL](https://rankmath.com/kb/how-to-change-canonical-url/), you can get your page indexed and submitted in Sitemap.

### 2  Excluded from Sitemap

If your post/page is [excluded from the Sitemap Settings](https://rankmath.com/kb/configure-sitemaps/#exclude-terms), then it’s pretty obvious that your URL will not be included in the Sitemap.

### 3  Check if Your Sitemap is Accessible

Next, check if your sitemap is accessible [using this tool](https://httpstatus.io/). Enter your sitemap URL and check the status to identify any issues preventing your sitemap from being accessed by the Googlebot.

![Check if sitemap is accessible in httpstatus tool](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201280%20663'%3E%3C/svg%3E)

### 4  Sitemap is Being Cached

If the Sitemap is being cached, you need to exclude Sitemaps from caching. You can also go through our tutorial on[how to exclude Sitemaps from caching](https://rankmath.com/kb/exclude-sitemaps-from-caching/).

### 5  Submitted Sitemap is Incorrect

If at all you have not submitted the correct sitemap, then you need to submit `sitemap_index.xml` and need to ensure that all the inner sitemaps, like post-sitemap.xml, etc., are showing up in your Google Search Console while clicking on `sitemap_index.xml` file.

### 6  Check the Last Crawl Date in Google Search Console

It’s always a good practice to check the last crawl date on the sitemap in the Google Search Console.

![Last crawl date of Sitemap Index](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20853'%3E%3C/svg%3E)

When you click on `sitemap_index.xml` you’ll find the last crawl date by Google for individual sitemaps as well.

![Last read date of individual sitemaps](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202094%201190'%3E%3C/svg%3E)

If the last crawl is not after you’ve published the post – then Google might not have seen the updated Sitemap yet. You need to be patient and just wait for Google to crawl the sitemap.

However, if you don’t choose to wait, you can also delete the sitemap from the Google Search Console by clicking on the three dots in the top-right corner and then choosing the **Remove sitemap** option.

![Remove sitemap in Google Search Console](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202224%20620'%3E%3C/svg%3E)

Once you have removed the sitemap, you can add it once again by entering the sitemap URL and then clicking the **SUBMIT** button.

![Submit sitemap index in Google Search Console](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20589'%3E%3C/svg%3E)

And that’s it. Unlike other Google Search Console statuses, you will not find an option to validate fixes; as we mentioned earlier, this is a valid status and not an error to be worried about.

However, prevention is better than cure. A good website architecture and robot handling will mostly lead to a clean and clear Google Search Console Page indexing report. We hope that the reasons that are listed above, along with the solutions, will help you to resolve the “Indexed, not submitted in Sitemap” status. However, if you still have any questions, please feel free to contact our [support team](https://rankmath.com/support/), who are available 24×7 and will help you out as soon as possible.

			

			 

			
	
		
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