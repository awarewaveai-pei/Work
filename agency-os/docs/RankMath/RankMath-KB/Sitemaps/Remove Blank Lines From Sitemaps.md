# Remove Blank Lines From Sitemaps

> **Category:** Sitemaps
> **Source:** https://rankmath.com/kb/remove-blank-lines-from-sitemaps/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Remove Blank Lines From Sitemaps

			
			

	

Rank Math makes it extremely easy to configure your sitemaps – learn more about how to [get started with sitemaps here](https://rankmath.com/kb/configure-sitemaps/). However, in some cases, you may encounter empty lines present in your sitemap. These empty lines are likely caused by other plugins or themes that are in use on your site.

Before moving on to the plugins, let’s see the two types of problems that you may encounter in sitemaps.

**Blank Sitemap**: A sitemap with a white screen that has got no header, no links, etc., is known as a blank sitemap. This can be due to errors in sitemap source code, caching, invalid XML code, mismatch in URL formats, etc.

**Empty Sitemap:** A sitemap that has got header but contains no links are referred to as an empty sitemap. An empty sitemap occurs when there is no matched data and due to the empty video and news sitemaps.

## 1  How to Solve Blank/ Empty Sitemap Issues Due to WPML Plugin

[WPML](https://rankmath.com/compatibility/wpml/) is a WordPress plugin that helps in translating websites into multiple languages with the aim of doing international SEO.

Empty lines or Blank lines in sitemaps are likely caused by using a multilingual plugin like WPML when translations are left halfway.

Here’s what this can look like:

![Blank Lines in SItemap](https://rankmath.com/wp-content/uploads/2021/01/blankLines-sitemaps.jpg)

You can solve this issue with the help of the following code in the theme’s [rank-math.php](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file) file, placing it at the very end:

```
add_filter('rank_math/sitemap/entry', function ($url){
    if (isset($url['loc']) && empty($url['loc'])) {
        return false;
    }    return $url;
});
```

## 2  How to Solve Blank/ Empty Sitemap Issues Due to Cache Plugins

Caching is done to speed up the performance of your website. When caching is not configured properly, you can cache your sitemaps too.

A sitemap is a file or blueprint that consists of all the posts, pages, and other web content present on your website. This file helps search engines find, crawl and index your website as a part or whole. It also tells search engines which page on your website should be given priority while crawling and indexing. So, it is very important to stay up to date, or else it would be very difficult to find or crawl your web pages.

When sitemaps are cached, the whole purpose is lost, and you may end up seeing an empty or blank file, as shown in the previous step.

We have got an [extensive tutorial to help you in excluding your sitemap from being cached](https://rankmath.com/kb/exclude-sitemaps-from-caching/).

We hope that you can now solve this issue easily. If you are still facing a problem, then please feel free to [contact our support team](https://rankmath.com/support/). We are available 24×7, 365 days a year will help you out as soon as possible.

			

			 

			
	
		
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