# How to Fix Problems While Connecting Account Using Rank Math

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/problems-while-connecting-account/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Fix Problems While Connecting Account Using Rank Math

			
			

	

Do you have problems while connecting account using Rank Math?

Or have you ever encountered the warning “Seems like your site URL has changed since you connected to Rank Math”? We apologize for any inconvenience that might have caused you due to this notice.

![Seems like your site URL has changed since you connected to Rank Math error](https://rankmath.com/wp-content/uploads/2022/11/url-site-error.jpg)

In this knowledgebase article, we’ll show how to fix the ‘Site URL has changed’ issue.

## Fix ‘Site URL Has Changed’ Warning

First, ensure that you’re using the [latest version of Rank Math](https://rankmath.com/changelog/).

Next, check that the **WordPress URL** and **Site URL** are the same. To do so, navigate to **WordPress Dashboard → Settings → General** and check that both URLs are the same.

![Check the site URL ](https://rankmath.com/wp-content/uploads/2022/11/check-site-url.jpg)

​​​​​​​You might receive this notice if both URLs do not match, as both should match for a proper connection.

After that, please try [disconnecting](https://rankmath.com/kb/no-connected-websites-found/#num-1-disconnect-your-website) and [reconnecting](https://rankmath.com/kb/no-connected-websites-found/#num-2-connect-your-website) your Rank Math account again to see if this resolves your issue.

**Note:**If the warning still shows up, please disconnect your Rank Math account and [clear your browser, website, and site-level cache](https://rankmath.com/blog/clear-cache-in-wordpress/) before reconnecting.

However, if the issue persists, add the following filter on your website and reconnect to your account. You can refer to our dedicated guide to [add the filter to your site](https://rankmath.com/kb/wordpress-hooks-actions-filters/).

```
/**
 * Filter whether we need to check for URL mismatch or not.
 */
add_filter( 'rank_math/registration/do_url_check', '__return_false' );
```

And that’s it! ​​​​​​​The plugin should now be able to stay connected without any issues.

If you still have questions regarding this warning or face any problems while connecting to your site– you’re always more than welcome to [contact our dedicated support team](https://rankmath.com/support/). We’re available 24/7, 365 days a year…

			

			 

			
	
		
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