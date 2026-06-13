# How to Add Sitelinks Searchbox Schema to All Pages

> **Category:** Schema
> **Source:** https://rankmath.com/kb/sitelinks-searchbox-schema/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Add Sitelinks Searchbox Schema to All Pages

			
			

	

**Note:** Google has officially removed the sitelinks search box feature due to its declining usage. This change will not impact your search rankings or other sitelinks, and there is no need to remove any related structured data from your website.

Sitelinks are known to increase the visibility of your website’s search result, and guess what — your website even stands a chance to feature a search box inside the SERP.

![Sitelinks Searchbox](https://rankmath.com/wp-content/uploads/2021/04/Sitelinks-Search-Box.jpg)

However, the decision to display site links and search box are solely decided by Google, but the best, we can ensure for our website to stand a chance to feature site links is by adding the Searchbox Schema Markup as per the guidelines and maintaining a good structure throughout our website.

[Google’s guidelines](https://developers.google.com/search/docs/data-types/sitelinks-searchbox) recommend adding the WebSite structured data element _only_ to a website’s homepage. Based on the recommendation Rank Math automatically adds the Sitelinks and Searchbox Schema only to the homepage of your website.

However, if you wish to implement the Sitelinks on all the pages, you can use our filter to add the Schema Markup to all the pages.

## Adding Sitelinks Searchbox Schema to All Pages

To add Sitelinks Searchbox Schema to all your pages, you can make use of the below filter. Head over to **Appearance → Theme File Editor** (for Classic Theme) or **Tools → Theme File Editor** (for Block Theme) inside your WordPress admin area.

![Navigate to Theme File Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20988%20528'%3E%3C/svg%3E)

And, then choose [**rank-math.php**](https://rankmath.com/kb/filters-hooks-api-developer/#how-to-add-code-snippets-to-rank-math-php) from the list of files shown on the right side of the screen.

```
/**
 * Filter to enable/disable SearchAction JSON-LD data
 */
add_filter( 'rank_math/json_ld/disable_search', '__return_false' );
```

Add the above code in the Code Editor and then click the **Update File** button.

![Add Sitelinks Searchbox Schema using Filter](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201036%20663'%3E%3C/svg%3E)

Now you can check for “SearchAction” in the page source or run a [Rich Results Test](https://search.google.com/test/rich-results) to check if the Schema Markup has been implemented correctly on all your pages.

![SearchAction in Rich Results tool](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201280%20570'%3E%3C/svg%3E)

## Understanding the SearchAction

Google recommends only one SearchAction for a website and an optional another, only if it supports an app search. Hence, the SearchAction should be **pointed to your homepage even if the Schema appears on all your web pages**.

And, that’s it! We hope the tutorial helped you add the Sitelinks Searchbox Schema to all pages. If you still have absolutely any questions on using Sitelinks Searchbox Schema, feel free to [reach our support team directly from here](https://rankmath.com/support/), and we’re always here to help.

			

			 

			
	
		
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

		

										
			
- [How to Convert Time Duration to ISO 8601 Format](https://rankmath.com/kb/iso-8601-format/)

										
			
- [How to Get a YouTube API Key](https://rankmath.com/kb/how-to-get-a-youtube-api-key/)

										
			
- [How to Add Merchant Return and Shipping Policy in WooCommerce?](https://rankmath.com/kb/merchant-return-and-shipping-policy/)

										
			
- [What is WebSite Schema and How Do You Implement It?](https://rankmath.com/kb/website-schema/)

										
			
- [How to Implement sameAs Schema on Your Website](https://rankmath.com/kb/sameas-schema/)

										
			
- [How to Implement Author SEO on Your Website to Boost E-E-A-T](https://rankmath.com/kb/author-seo/)