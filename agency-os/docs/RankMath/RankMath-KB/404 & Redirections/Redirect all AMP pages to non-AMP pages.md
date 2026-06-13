# Redirect all AMP pages to non-AMP pages

> **Category:** 404 & Redirections
> **Source:** https://rankmath.com/kb/redirect-all-amp-pages-to-non-amp-pages/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Redirect all AMP pages to non-AMP pages

			
			

	

[AMP pages](https://rankmath.com/kb/using-amp-with-rankmath/) are usually paired to the non-amp pages by adding a suffix `/amp/` or by adding a query parameter `?amp` at the end of the URL.

If you’ve configured your website to use the query parameter `?amp` for AMP pages and disabled the AMP plugin on your website, then no redirection is required. When a visitor lands on these pages, the query parameter will be ignored, and the browser will load the canonical non-amp page for your visitor. In this case, no 404 error will be captured, and you need not worry about duplicate content issues since the page points out the canonical URL.

But if you’ve used the suffix `/amp/` for accessing AMP pages, then as soon as you disable the AMP plugin, your visitors landing on these pages will be greeted with a 404 error. To ensure that you’re not losing out on any search traffic due to broken AMP pages, you’ll need to redirect users from AMP pages to regular mobile webpages.

## How to Redirect All AMP Pages to Non-AMP Pages in Rank Math

In this knowledgebase article, we’re going to walk you through how to redirect all AMP pages to non-AMP pages. This can be handled easily in Rank Math by [setting up redirections](https://rankmath.com/kb/setting-up-redirections/) in the Redirection Manager.

### 1  Navigate to Redirections

Before you begin, make sure you’ve [installed **Rank Math**](https://rankmath.com/kb/how-to-setup/) and activated the Redirection module from **WordPress Dashboard →** **Rank Math SEO**. Once you’ve activated the Redirection Module, navigate to **Redirections** from your Rank Math’s dashboard as shown below:

![Navigate to redirections in Rank Math](https://rankmath.com/wp-content/uploads/2023/01/redirections-menu-2.jpg)

### 2  Add a New Redirection

Click on **Add New** to add a new redirection as shown below:

![Add new redirection in Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201105%20187'%3E%3C/svg%3E)

### 3  Create a Regex Redirection

To redirect all AMP URLs back to the regular URLs, add your source and destination URLs and select the matching option as **Regex** from the drop-down list.

```
Regex Source URL: (.*)/amp
Destination URL: /$1
```

Here is how the redirect would look like inside Rank Math:

![Add regex redirect](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20851%201078'%3E%3C/svg%3E)

Make sure you activate the redirect. Click on **Add Redirection** to add the regex redirect. And that’s it! This will redirect URLs, for example: `http://yoursite.com/yourpage/amp/` to `http://yoursite.com/yourpage/`

Disabling AMP is a quick fix on WordPress, and it’s even easier when done with Rank Math. However, if you’re not running a CMS on your website, you may want to look into the [official Google documentation for disabling AMP](https://developers.google.com/search/docs/guides/remove-amp) and do it correctly so that you can safeguard both your search traffic as well as the SEO authority of your website.

If you still have any questions about how to redirect all AMP to non-AMP pages– you’re always more than welcome to [contact our dedicated support team](https://rankmath.com/support/). They are available 24/7, 365 days a year…

			

			 

			
	
		
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

		

										
			
- [How to Track and Fix 404 Errors from ChatGPT](https://rankmath.com/kb/fix-404-errors-from-chatgpt/)

										
			
- [How to Trace Your Website’s URL Redirects](https://rankmath.com/kb/trace-url-redirects/)

										
			
- [How to Set 410 Status Code in Bulk for WordPress](https://rankmath.com/kb/set-410-status-in-bulk/)

										
			
- [301 vs 302 Redirect: Which One Should You Use?](https://rankmath.com/kb/301-vs-302-redirect/)

										
			
- [How to fix ‘The Redirection you are trying to create may cause infinite loops’?](https://rankmath.com/kb/fix-infinite-loop-error/)

										
			
- [How to Set Up Redirections](https://rankmath.com/kb/setting-up-redirections/)