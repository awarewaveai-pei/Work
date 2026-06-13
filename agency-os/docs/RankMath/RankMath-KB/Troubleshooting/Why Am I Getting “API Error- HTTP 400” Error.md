# Why Am I Getting “API Error: HTTP 400” Error

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/api-http-400-error/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Why Am I Getting “API Error: HTTP 400” Error

			
			

	

While running Rank Math’s SEO analyzer on your website, if you’re seeing an **API Error: HTTP 400**, as shown below, then it simply means that the server is unable to process your API request for some reason.

In this knowledgebase article, we’ll discuss more about “**API Error: HTTP 400**“, why you’re seeing this error, and how you can fix it.

![API Error: HTTP 400 error](https://rankmath.com/wp-content/uploads/2023/01/seo-anlayzer-localhost-error.jpg)

## HTTP 400 Error

The HyperText Transfer Protocol (HTTP) 400 Bad Request response status implies that the server cannot or will not process the request due to something that is perceived to be a client error.

For example: _malformed request syntax, invalid request message framing, or deceptive request routing_.

This is more in general, but if you’re seeing this in Rank Math, then it could be one of the below-listed reasons, and let’s look at how to fix them as well.

- [Website Under Maintenance](#website-under-maintenance)

- [Check Website Status](#website-status)

- [API Timeout](#api-timeout)

- [API Requests Blocked by Firewall](#blocked-by-firewall)

- [Locally Hosted Website](#locally-hosted-website)

### 1  Website Under Maintenance

When your website is under maintenance, your website cannot be accessed. And in this case, you will see this error. So try again once you [switch your website back to normal mode](https://rankmath.com/kb/briefly-unavailable-for-scheduled-maintenance/).

![Maintenance mode](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201039%20367'%3E%3C/svg%3E)

### 2  Check Website Status

If your website isn’t throwing a 200 status code, then you can check the [status of your website here](https://httpstatus.io/). Enter the URL of your website and then click **Check Status**.

![Check website status with httpstatus tool](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201280%20771'%3E%3C/svg%3E)

If your website returns an error when it is crawled, it will be shown here, and you can fix it accordingly.

![Error message thrown in httpstatus](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201280%20441'%3E%3C/svg%3E)

### 3  API Timeout

If your website takes more than 30 seconds to load, then you will see this error as a result of a timeout.

### 4  API Requests Blocked by Firewall

The server security or firewall is blocking our API requests, and hence you’re seeing this error.

If this is the case, then you need to whitelist the below IP addresses and the user-agent `RankMathApi/2.0.7; https://rankmath.com`.

```
46.30.212.200
46.30.212.201
46.30.212.202
46.30.212.203
```

You can do this in the firewall or ask your web hosting provider to help you further.

### 5  Locally Hosted Website

The SEO Analyzer module of Rank Math will run only on a live site that returns a 200 OK status when crawled from an external site. If your site is hosted locally, the SEO Analyzer module will not work and will return you with an API error.

![API Error: The Site-Wide Analysis is unavailable on localhost.](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202406%20868'%3E%3C/svg%3E)

And, that’s it! We hope the article was helpful in understanding what causes this API error. If you are still facing problems or have any queries, please feel free to [reach our support team directly from here](https://rankmath.com/support/), and we’d be happy to help you at any given time.

			

			 

			
	
		
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