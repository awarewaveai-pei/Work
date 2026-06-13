# How to Fix “Incorrect HTTP Header Content-Type” Error in Sitemaps

> **Category:** Sitemaps
> **Source:** https://rankmath.com/kb/incorrect-http-header-content-type-sitemap-error/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Fix “Incorrect HTTP Header Content-Type” Error in Sitemaps

			
			

	

You might encounter the error **‘Incorrect HTTP header content-type’** while validating your sitemap with [external tools](https://www.xml-sitemaps.com/validate-xml-sitemap.html), like the one shown below. In this knowledgebase article, we’ll show you how to fix this error.

![Incorrect HTTP header content-type error with Sitemap validation](https://rankmath.com/wp-content/uploads/2021/09/Incorrect-http-header-content-type-error-in-sitemap.jpg)

This error appears when the server expects an XML sitemap during validation. But instead, it has received a response of a different content type, which could be an HTML, 404 error, or perhaps the server itself blocked from accessing the sitemap.

## Fix Incorrect HTTP Header Content Type Sitemap Error

To get rid of this error, you can follow the steps we’ve discussed below.

### 1  Flush Permalinks

To begin with, we would flush the permalinks. To do so, navigate to **WordPress Dashboard → Settings → Permalinks**. You don’t need to make any changes to the permalink settings here. Just click the **Save Changes** button, and your Permalinks will be flushed.

![Flush Permalinks Settings](https://rankmath.com/wp-content/uploads/2021/09/Flush-Permalinks-Settings.jpg)

### 2  Flush Sitemap Settings

Next, we will flush the sitemap settings in Rank Math. To do so, head over to **Rank Math SEO → Sitemap Settings** inside your WordPress admin area.

![Change Links Per Sitemap](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202406%20918'%3E%3C/svg%3E)

Simply change the value in the **Links Per Sitemap; say** if it is 200, just change it to 201 or anything else. You don’t need to worry, as you can always change this setting as per your preference. If the Links Per Sitemap option is unavailable for you, then make sure you’ve switched to the [Advanced Mode](https://rankmath.com/kb/advanced-mode/) in Rank Math.

Then click the **Save Changes** button at the bottom of the page.

![Save changes to sitemap settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201660%20410'%3E%3C/svg%3E)

### 3  Exclude Sitemap from Caching

Although caching is an effective way to speed up the performance of your website, if not configured, you would also end up caching your sitemap. A sitemap is an index of all the posts, pages, and custom posts present on your website and should stay up to date for search engines to crawl. When sitemaps are cached, it loses their purpose and sometimes may result in an error, as we’re seeing.

While there are various plugins available to cache your website, we have got an [extensive tutorial that will help you exclude your sitemap from being cached](https://rankmath.com/kb/exclude-sitemaps-from-caching/).

### 4  Check Restrictions from Web Host

If you’re able to access the sitemap, but any external sitemap validator or search engine crawler is returned with the error, then it is likely, the sitemap access to these crawlers and bots is restricted by a security plugin installed on your website or by your web host.

When the security plugin installed on your website seems to be causing trouble, simply exclude the sitemap from your firewall and then run through the test once again.

In case of security measures from your web hosting, please reach out to your web host for further assistance.

### 5  **Add Filter to Theme’s rank-math.php File**

If the above solutions don’t work, you can include a filter in your theme’s `rank-math.php` file.

**Note:**To save you from any loss while making changes to your PHP file, we recommend you add a filter to your child theme’s PHP file instead of your parent theme.

To add a filter to your rank-math.php file, navigate to **WordPress Dashboard → Tools → Theme File Editor** (Block Editor) or **WordPress Dashboard → Appearance → Theme File Editor** (Classic Editor).

![Navigate to Theme File Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20650%20360'%3E%3C/svg%3E)

Choose the **rank-math.php** file from the right sidebar and add the following filter.

```
add_filter(  'rank_math/sitemap/enable_caching', '__return_false');
```

Once you’ve added the filter, click on the **Update** button to save your changes.

![Add filter](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201037%20690'%3E%3C/svg%3E)

When the changes are updated, [clear your website cache](https://rankmath.com/blog/clear-cache-in-wordpress/) then check the sitemap.

And that’s it! Once you’ve made the changes, the error should be resolved. You can confirm the same by testing your sitemap with any XML Sitemap validator. If you’re still facing this error or need help configuring sitemaps, please feel free to [reach our support team directly from here](https://rankmath.com/support/), and we’re always here to help.

			

			 

			
	
		
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