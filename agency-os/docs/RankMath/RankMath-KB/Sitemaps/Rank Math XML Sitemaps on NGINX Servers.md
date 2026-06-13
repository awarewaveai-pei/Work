# Rank Math XML Sitemaps on NGINX Servers

> **Category:** Sitemaps
> **Source:** https://rankmath.com/kb/xml-sitemaps-nginx/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Rank Math XML Sitemaps on NGINX Servers

			
			

	

Rank Math creates a virtual sitemap dynamically that relies on using redirects on the server-level. In certain situations where your sitemap appears not to be working as intended, you’ll need to add some rewrite rules manually.

To ensure that you need to add these rewrite rules, go to _domain.com?sitemap=1_.

![Check Sitemap generation in Rank Math](https://rankmath.com/wp-content/uploads/2021/10/Check-Sitemap-generation-in-Rank-Math.png)

If your sitemap loads, then it means Rank Math is able to successfully generate the sitemap of your website but, it is **unable to rewrite** the sitemap to `sitemap_index.xml` page.

## Fix Sitemap Issues on Nginx Server

If your Nginx server is preventing the creation of the sitemap file, then Rank Math would also let you know through a notice under Sitemap Settings. In that case, you need to manually add the rewrite rules.

![Rank Math Sitemap notice on Nginx server](https://rankmath.com/wp-content/uploads/2021/10/Rank-Math-Sitemap-notice-on-Nginx-server.jpg)

### 1  Add Rewrite Rules to Nginx Server

So head over to your Nginx config file and add the following rewrite rules to fix this:

```
# START Nginx Rewrites for Rank Math Sitemaps
rewrite ^/sitemap_index.xml$ /index.php?sitemap=1 last;
rewrite ^/([^/]+?)-sitemap([0-9]+)?.xml$ /index.php?sitemap=$1&sitemap_n=$2 last;
rewrite ^/([a-z]+)?-sitemap\.xsl$ /index.php?xsl=$1 last;
# END Nginx Rewrites for Rank Math Sitemaps
```

### 2  Flush Sitemap Settings

Once you’ve added the above rewrite rules, you’ll need to flush your sitemap settings. To do so, head over to **Rank Math SEO → Sitemap Settings** in your WordPress admin area and make any minor changes to the **Links Per Sitemap** count. Then click the **Save Changes** button.

![flush sitemap settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202406%20918'%3E%3C/svg%3E)

## 3  Flush Permalinks

Next, navigate to **WordPress Dashboard → Settings → Permalinks**. You don’t need to make any changes here. Just click the **Save Changes** button.

![Flush Permalinks seittings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201197%20911'%3E%3C/svg%3E)

### 4  Exclude Sitemap from Caching

Once you’ve flushed your Sitemap Settings, ensure that you’ve excluded your sitemap from caching. If you haven’t already done so, you can refer to this [dedicated knowledgebase article](https://rankmath.com/kb/exclude-sitemaps-from-caching/) to help you with it.

### 5  Disable Transient Caching

If the above solutions don’t work, then add the below filter to your theme’s [rank-math.php](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file) file to disable the transient caching of your sitemap.

```
/**
 * Filter if XML sitemap transient cache is enabled.
 *
 * @param boolean $unsigned Enable cache or not, defaults to true
 */
add_filter( 'rank_math/sitemap/enable_caching', '__return_false');
```

And, that’s it! We hope that this article has helped you resolve any potential issues with using Rank Math’s XML Sitemap on servers running Nginx. However, if you are still facing problems or have any queries please feel free to contact our [support team](https://rankmath.com/support/) and we’d be happy to help you at any given time.

			

			 

			
	
		
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

		

										
			
- [How to Fix Whitespace Errors Breaking Your XML Sitemap in WordPress](https://rankmath.com/kb/fix-whitespace-errors-in-sitemap/)

										
			
- [How to Submit Your Website to Search Engines](https://rankmath.com/kb/submit-website-to-search-engines/)

										
			
- [How to Configure Sitemaps in Rank Math](https://rankmath.com/kb/configure-sitemaps/)

										
			
- [What Are the SEO Benefits of Sitemaps?](https://rankmath.com/kb/sitemaps-seo-benefits/)

										
			
- [How to Submit a Sitemap to Google](https://rankmath.com/kb/submit-sitemap-to-google/)

										
			
- [Rank Math Sitemap Issues and Their Fixes](https://rankmath.com/kb/fix-sitemap-issues/)