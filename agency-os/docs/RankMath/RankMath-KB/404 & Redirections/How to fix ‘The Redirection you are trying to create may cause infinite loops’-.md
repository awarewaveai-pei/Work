# How to fix ‘The Redirection you are trying to create may cause infinite loops’?

> **Category:** 404 & Redirections
> **Source:** https://rankmath.com/kb/fix-infinite-loop-error/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to fix ‘The Redirection you are trying to create may cause infinite loops’?

			
			

	

Encountering this error, “**The Redirection you are trying to create may cause infinite loops**,” can be a puzzling experience for you while using Rank Math.

This error typically occurs when attempting to set up a redirection for a specific URL, and Rank Math identifies that the intended redirection might lead to an [infinite loop](https://rankmath.com/blog/fix-redirect-loops/).

While this error can be frustrating, the good news is that it is not difficult to fix.

In this knowledgebase article, we will look closely at what causes this error message and provide a step-by-step guide on how to fix it.

## **Understanding the Infinite Loop Error**

Before delving into the solution, let’s understand why this error occurs.

An infinite loop error occurs when a redirection is configured in a way that it continuously redirects within the exact URL or from one URL to another in an unending cycle.

So, if you happen to see this error on your website, you may have set up a 301 redirection from the Rank Math SEO Redirections tab in an incorrect manner.

For instance, you may have mistakenly set up a redirection from `https://yourwebsite.com/about/` to `https://yourwebsite.com/about/`,

or

set it up from `https://yourwebsite.com/about/` to `https://yourwebsite.com/contact/`

and then back to `https://yourwebsite.com/about/`.

When such misconfigurations occur, as shown in the examples above, it can lead to an infinite loop error.

![infinite loop error](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201184%20526'%3E%3C/svg%3E)

## **Fixing the Infinite Loop Error**

To fix the infinite loop error, you must assess your existing redirect rules.

To proceed, go to **Rank Math SEO → Redirections** in your WordPress dashboard.

Examine any configurations that might be causing the loop by looking for the recent redirects you made before the error message appeared.

Then, click **Edit** beneath any of them to review your configuration.

![click Edit ](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201173%20396'%3E%3C/svg%3E)

For instance, you might observe that the URLs in the **Source URLs** and **Destination URL**fields are the same, like the one shown below.

![enter source and destination URLs](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20959%20551'%3E%3C/svg%3E)

To resolve, you must redirect the URL to the appropriate destination, which should differ from the Source URL, as shown below.

![add proper destination URL](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20950%20468'%3E%3C/svg%3E)

Once you have done this, be sure to save your changes by clicking on the **Update Redirection** button.

![click Update Redirection](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20944%20117'%3E%3C/svg%3E)

Following this correction, the infinite loop error will likely be resolved.

If none of your redirection settings follow the format illustrated in the solution above, you may have used a redirected URL in any other redirection configuration.

In this case, keep checking your redirections to identify the one with a URL you may have redirected before and correct it accordingly.

That’s it!

We hope this simple solution has resolved the error. If you have any questions, feel free to contact our [support team directly from here](https://rankmath.com/support/). We’re available 24/7 to assist you.

			

			 

			
	
		
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

										
			
- [How to Set Up Redirections](https://rankmath.com/kb/setting-up-redirections/)

										
			
- [How to Monitor 404 Errors](https://rankmath.com/kb/monitor-404-errors/)