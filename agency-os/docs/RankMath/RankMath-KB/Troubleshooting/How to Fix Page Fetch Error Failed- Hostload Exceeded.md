# How to Fix Page Fetch Error Failed: Hostload Exceeded

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/how-to-fix-failed-hostload-exceeded-error/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Fix Page Fetch Error Failed: Hostload Exceeded

			
			

	

If you encountered a Failed: Hostload exceeded error while inspecting your URL in Google Search Console, it means Google has reduced or cannot increase the rate it crawls your site.

Both situations are likely the result of your server’s inability to execute Google’s crawl requests. Sometimes, Google may have reduced the rate it sends those requests because it has reached your estimated server capacity.

In this knowledgebase article, we will show you how to detect and fix the Failed: Hostload exceeded error and signal to Google that your server can handle more requests.

## 1  How Google Estimates Your Server Capacity

The process of crawling uses up a site’s resources. When a site lacks enough resources to support a crawl, it will become overloaded and slow down or crash. To prevent this, Google estimates your server capacity and keeps its crawl requests below that capacity.

It is important to note that your estimated server capacity is not based on your actual server capacity. Google cannot determine your actual server capacity. Instead, it estimates it based on several metrics. Depending on these metrics, Google can decide to increase or reduce the rate it crawls your site.

## 2  Fixing the Page Fetch Error Failed: Hostload Exceeded Error

To fix the Page fetch Failed: Hostload exceeded error, you have to improve the metrics Google uses to estimate your server capacity. When you do this, you have signaled to Google that your server can take on some extra load.

### 2.1  Fix Your Server Errors

To identify errors in your server, navigate to the Search Console. In the left sidebar, scroll down and click **Settings**. Once done, head over to the Crawl stats option and click **OPEN REPORT**, as shown below.

![Click OPEN REPORT in the Settings menu](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202767%201102'%3E%3C/svg%3E)

In the Crawl stats report page, click the expander arrow connected to the **Host status**option, as shown below.

![Click Host status](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202056%201192'%3E%3C/svg%3E)

Then, click the expander arrow connected to the **Server connectivity**option, as shown below.

![Click Server connectivity](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201982%201166'%3E%3C/svg%3E)

You will be presented with an overview of how your server responded to Google’s crawl requests over the last 90 days. The crests represent the server errors Google encountered on your site.

![Example of Failed crawl requests](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201875%20706'%3E%3C/svg%3E)

If you have a lot of failed requests, you should contact your host for support.

**Note:**Server errors can last for a short time. While you may not encounter any server error during a live test, Google may have experienced it when it visited your site. If the Crawl stats report indicates abnormal amounts of server errors, you should contact your host for a solution, even if a live test suggests otherwise.

### 2.2  Reduce Your Page Load

You can [reduce your page load](https://rankmath.com/blog/wordpress-speed-optimization/) with a performance plugin. If you have one installed, you should check the settings to ensure the minify and caching settings are enabled.

If you don’t have one installed, you can install [WP Rocket](https://wp-rocket.me/) or W3 Total Cache. You can [refer to this guide](https://docs.wp-rocket.me/article/59-getting-started) on installing and setting it up on your WordPress site.

### 2.3  Improve Your Page Speed

A fast site indicates a healthy server. If your website’s speed is slow, then assess your web host and consider switching/upgrading to a better server. We would recommend using a fast hosting service like [One.com](https://www.one.com/en/wordpress-hosting) or [Dogado](https://www.dogado.de/website/wordpress-hosting) to prevent site speed issues.

To confirm your current page speed, navigate to [PageSpeed Insights](https://pagespeed.web.dev/) and paste your URL into the textbox. Once done, click **Analyze**, as shown below.

![Analyze the URL](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20475'%3E%3C/svg%3E)

You will be presented with data about your page speed. You can click on **Expand view**to receive more insights into your page speed.

![Click Expand View to receive more insights for your page load speed.](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%201125'%3E%3C/svg%3E)

You can scroll down to the **OPPORTUNITIES**section and look for suggestions to improve your page speed.

![Scroll down to the Opportunities section](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201914%20596'%3E%3C/svg%3E)

The Page fetch Failed: Hostload exceeded error should disappear after following the above steps. If the situation persists, your current hosting package needs to be improved. You should upgrade to a higher hosting package or change your host.

And that’s it! We hope you’re able to solve the Failed: Hostload exceeded error in your Google Search Console. If you have questions, you’re always more than welcome to [contact our dedicated support team](https://rankmath.com/support/). We’re available 24/7, 365 days a year…

			

			 

			
	
		
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