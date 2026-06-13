# How to Fix 429 Error with IndexNow API

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/how-to-fix-429-error-with-indexnow-api/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Fix 429 Error with IndexNow API

			
			

	

When you publish a post, you want [search engines to find and index it](https://rankmath.com/blog/index-your-site-on-google/) immediately. Rank Math makes this possible by submitting your URLs to multiple search engines, including Bing and Yandex, using the [IndexNow API](https://rankmath.com/kb/how-to-use-indexnow/).

However, when you view the status of your submitted URLs by navigating to **Rank Math SEO →** **Instant Indexing →** **History** from your WordPress dashboard, you may discover you have one or more 429 response codes, as shown below.

![429 response code example](https://rankmath.com/wp-content/uploads/2023/03/429-response-code-2.jpg)

In this knowledgebase article we’ll show you how to easily troubleshoot and fix 429 too many requests error with IndexNow API.

But before we begin, we’ve shortlisted all the response codes you might come across in the IndexNow API.

## 1  Response Code in IndexNow API

Below are the response codes you may come across:

| HTTP Code | Response Code | Description |
|---|---|---|
| 200 | OK | The URL was successfully submitted to the IndexNow API. |
| 202 | Accepted | The IndexNow API received your URL. However, it still needs to validate the API key to confirm the URL belongs to your site. |
| 400 | Bad Request | The URL was not properly formatted. |
| 403 | Forbidden | The IndexNow API did not find your API key and cannot confirm the URL belongs to your site. |
| 422 | Unprocessable Entity | The URL belongs to another site and cannot be processed. |
| 429 | Too Many Requests | The IndexNow API received many URLs from your IP address and will not process them. |

## 2  What is a 429 Response Code?

The HTTP 429 response code means “Too Many Requests.” The response code indicates your IP address has sent too many requests to IndexNow API within a short period.

IndexNow API has a quota of [10,000 URLs per HTTP POST](https://www.indexnow.org/faq) request. When you exceed the quota of requests, the site slows down the request and you can retry later.

Also, if you have other websites on the same server or are on shared hosting, there is a chance that other websites may be using up the quota. In such a case, the API will respond back with a 429 response code.

## 3  How to Fix the 429 Response Code

In order to fix the 429 response code, you should stop submitting your URLs to IndexNow API for a while. You should also disable the automatic submission feature that sends your URLs to IndexNow API every time you create, update, or delete a post.

### 3.1  Deselect Auto-Submission

To stop submitting your URLs automatically, navigate to **Rank Math SEO → Instant Indexing → Settings**from your WordPress dashboard.

Next, in the **Auto-Submit Post Types**setting, click the **Select / Deselect All** button until the Posts, Media, and Pages options are unchecked, as shown below.

![Deselect auto-submission in the Instant Indexing Settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202374%20960'%3E%3C/svg%3E)

### 3.2  Change Your API Key

Once done, click **Change Key.**Then, scroll down the page and click on the **Save Changes** button, as shown below.

![Change your API key and Save](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201676%20972'%3E%3C/svg%3E)

Once done, [clear your website cache](https://rankmath.com/blog/clear-cache-in-wordpress/). Then, wait for a few hours before submitting another URL again.

If the issue persists, another site on your server is likely submitting lots of URLs to IndexNow API and using up the quota assigned to your shared IP address. This is common with websites on a shared hosting server. In this case, you may wait it out or contact your host.

We hope you’re able to fix the 429 response code with IndexNow API. If you have questions, you’re always more than welcome to [contact our dedicated support team](https://rankmath.com/support/). We’re available 24/7, 365 days a year…

			

			 

			
	
		
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