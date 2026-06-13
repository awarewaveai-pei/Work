# How to Prevent Rank Math from Flushing W3 Total Cache

> **Category:** Miscellaneous
> **Source:** https://rankmath.com/kb/prevent-rank-math-from-flushing-w3-total-cache/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Prevent Rank Math from Flushing W3 Total Cache

			
			

	

In this knowledgebase article, we’ll show you how to prevent Rank Math from flushing W3 Total Cache.

## Preventing Rank Math from Flushing W3 Total Cache

In Rank Math, we use the `w3tc_pgcache_flush` function to flush the cache when a post is updated or added to the site. If you don’t want Rank Math to flush the cache, then follow the steps we’ve discussed below.

### 1  Navigate to the Theme File Editor

First, navigate to **Appearance → Theme File Editor** (for a Classic Theme) inside your WordPress admin area.

![navigate to the Theme File editor](https://rankmath.com/wp-content/uploads/2022/12/Navigate-to-Theme-File-Editor-1.png)

### 2  Add Code Snippet

Please disable the Sitemap cache by adding the following filter code to your theme’s [rank-math.php](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file) file to prevent the plugin from running this function. You can further refer to our dedicated tutorial on [how to add a filter/hook to your website.](https://rankmath.com/kb/wordpress-hooks-actions-filters/)

```
add_filter( 'rank_math/sitemap/enable_caching', '__return_false');
```

Navigate to the **rank-math.php** file and add the code snippet, as shown below.

![Add caching code](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201037%20690'%3E%3C/svg%3E)

### 3  Update the File

Once you’ve added the code snippet, click on the **Update File** button to save the changes made to the file.

![Update the File](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%201276'%3E%3C/svg%3E)

If you still have questions  – you’re always more than welcome to [contact our dedicated support team](https://rankmath.com/support/). We’re available 24/7, 365 days a year…

			

			 

			
	
		
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

		

										
			
- [How to Share Credentials Using the Rank Math Vault](https://rankmath.com/kb/how-to-use-vault/)

										
			
- [How to Create an AI Traffic Report in Google Analytics 4](https://rankmath.com/kb/create-ai-traffic-report/)

										
			
- [How to Disable Rank Math Meta Box from the Right Sidebar](https://rankmath.com/kb/disable-rank-math-meta-box/)

										
			
- [Migrating The Rank Math Support from Forum to Zendesk](https://rankmath.com/kb/support-migration-to-zendesk/)

										
			
- [How to Customize RSS Feed in WordPress](https://rankmath.com/kb/customize-rss-feed/)

										
			
- [How to Add Twitter Cards to WordPress](https://rankmath.com/kb/how-to-add-twitter-cards/)