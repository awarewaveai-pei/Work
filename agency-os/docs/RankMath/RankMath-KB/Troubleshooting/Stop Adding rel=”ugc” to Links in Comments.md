# Stop Adding rel=”ugc” to Links in Comments

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/stop-adding-relugc-to-links-in-comments/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Stop Adding rel=”ugc” to Links in Comments

			
			

	

Rank Math automatically adds the UGC attribute to the links in comments. But if you prefer to stop Rank Math from adding this attribute to links, then in this knowledgebase article, we’ll show you how to do that.

Let’s begin by understanding what the UGC attribute is.

## What is the UGC attribute?

The UGC (user-generated content) attribute allows search engines to understand that certain hyperlinks are not editorially endorsed. The UGC tag also informs Google that the link is included within user-generated content, such as a user comment or a forum post, and clarifies that the link is not an advertisement.

This is how a UGC (‘user-generated content’) attribute looks like:

`<a href="http://www.example.com/" rel="ugc">Example UGC text</a>`

UGC links work similarly to [nofollow links](https://rankmath.com/kb/should-you-nofollow-external-links/). They also inform Google not to follow or vote for that particular link.

## Effect of UGC attribute on SEO

Both the UGC attribute and nofollow attribute do not pass any authority and will not affect SEO ranking.

The UGC attribute allows webmasters to prove that they don’t control or endorse specific hyperlinks on their site, particularly from user-generated content such as comments and forum posts.

## How to Stop Adding rel=”ugc” to Links in Comments?

As per [Google’s announcement](https://webmasters.googleblog.com/2019/09/evolving-nofollow-new-ways-to-identify.html) on Sept 10, 2019, we added the UGC attribute since the links in the comments are user-generated. [WordPress 5.3](https://make.wordpress.org/core/2019/10/03/wp-5-3-introduces-new-functions-to-add-ugc-attribute-to-links-and-implements-it-to-comments/) has introduced new functions to add UGC attribute to links and implements them in comments, and hence there’s no need to worry about this attribute anymore.

If you still want to remove the attribute, then please add the following filter code to your theme:

```
add_filter( ‘rank_math/frontend/add_ugc_attribute’, ‘__return_false’ );
```

And, that’s it! If you still have any questions about how to stop adding rel=’ugc’ to the links in the comments – you’re always more than welcome to [contact our dedicated support team](https://rankmath.com/support/), and we’re available 24/7, 365 days a year…

			

			 

			
	
		
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