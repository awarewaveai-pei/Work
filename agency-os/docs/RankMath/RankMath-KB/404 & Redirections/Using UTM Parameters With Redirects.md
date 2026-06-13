# Using UTM Parameters With Redirects

> **Category:** 404 & Redirections
> **Source:** https://rankmath.com/kb/utm-parameters-with-redirects/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Using UTM Parameters With Redirects

			
			

	

In some cases, you may want to use [UTM parameters](https://en.wikipedia.org/wiki/UTM_parameters) on your website, and redirections involving a UTM parameter may not happen as you expected. In this knowledgebase article, we will discuss using UTM parameters and fix any redirection issues, if it occurs.

## What are UTM Parameters?

UTM (**U**rchin **T**racking **M**odule) code is usually added to the end of a URL as query strings. So when someone clicks the link with UTM code and lands on your website, you can configure Google Analytics or other analytics tools to understand the data passed on with the UTM code. They’re commonly used for tracking the performance of marketing campaigns (in terms of traffic, sales, conversions, etc.).

There are only 5 UTM parameters, and let’s look at them:

- `utm_source` – It can help identify the site where the traffic has resulted from

- `utm_medium` – It can help you with identifying the marketing medium

- `utm_campaign` – It shares the name of the specific marketing campaign

- `utm_term` – Used to identify the search terms

- `utm_content` – Helps to identify the specific element or ad that the visitor has clicked before landing on your page

And when these UTM parameters are included in a URL, it would look like this:

```
https:/example.com?utm_source=newsletter&utm_medium=email&utm_campaign=sale&utm_term=running%2Bshoes&utm_content=textlink
```

## Redirection Default Behaviour With UTM Parameters

By default, Rank Math passes all the query strings (including the UTM parameters) to the redirected URL. So, for instance, if we [set up a redirect](https://rankmath.com/kb/setting-up-redirections/) with Rank Math as below,

![Redirection example](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20845%201072'%3E%3C/svg%3E)

A visitor landing on the page `https://www.example.com/old-url/?utm_source=newsletter&utm_campaign=sale` would be redirected to `https://www.example.com/new-url/?utm_source=newsletter&utm_campaign=sale`

Thus you can notice all the UTM parameters of the source URL are being passed on to the destination URL after redirection. But, if you feel passing on these UTM parameters to your redirected URL may mislead your analytics data, you can use the below filter to disable appending them to your redirected URLs.

```
/**
 * Disable appending the query string in the redirection URL.
 *
 * @param bool 	$value 		Enable or disable appending the query string.
 * @param array $matched	Matched redirection.
 */
add_filter( 'rank_math/redirection/add_query_string', function($value, $matched) {
	return false;
}, 10, 2 );
```

**Note:** This filter will disable appending all the query strings to your redirected URLs and not just the UTM parameters.

When you use the above filter along with the redirection from the previous example, a visitor landing on the page `https://www.example.com/old-url/?utm_source=newsletter&utm_campaign=sale` would be redirected to `https://www.example.com/new-url/` without passing on any of the query strings.

## Solving Redirection Issues With UTM Parameters

If you’re facing any issues with the redirection when UTM parameters are involved, then change the redirect source URL match from **exact** to **contains.** This will ensure that your redirections continue to function as intended, regardless of whether a UTM parameter is added.

![Using contains matching type for redirections with UTM parameters](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201572%20360'%3E%3C/svg%3E)

Once you’ve done this, check the redirect, and it should function as usual.

And, that’s it! We hope the article was helpful in configuring redirections involving UTM parameters. If you still face any issues with redirects, [feel free to reach our support team](https://rankmath.com/support/), as we’re always here to help.

			

			 

			
	
		
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