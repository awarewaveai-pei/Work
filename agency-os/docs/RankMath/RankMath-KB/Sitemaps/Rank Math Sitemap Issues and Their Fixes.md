# Rank Math Sitemap Issues and Their Fixes

> **Category:** Sitemaps
> **Source:** https://rankmath.com/kb/fix-sitemap-issues/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Rank Math Sitemap Issues and Their Fixes

			
			

	

Not able to use the Sitemap functionality of Rank Math? Is it throwing errors at you? Don’t worry, the issue is simpler than you think, and the solution is even simpler.

![How to Fix Sitemap Issues in Rank Math?](https://img.youtube.com/vi/-QZro6QysCA/maxresdefault.jpg)
__

## Table Of Contents

- [The Sitemap Shows a Blank or White Page.](#blank-page)

- [Rank Math Does Not Create a Sitemap & Throws a 404 Error](#404-error)

- [Why is there an ‘XML or text declaration not at the start of entity’ error inside Google Webmaster Tools?](#xml-text-declaration)

- [I am getting a ‘Missing XML tag’ Error](#missing-xml-tag)

- [My Sitemap Is Not Working on My Apache Web Server](#apache-error)

- [My Sitemap Is Not Working on My Nginx Web Server](#nginx-server-error)

- [Why Am I Getting “Your file appears to be an HTML page” Error in Google Webmaster Tools?](#file-appears-html-page)

- [My Sitemap URL Is Blocked by robots.txt](#sitemap-blocked-robots-txt)

- [Due to Custom Canonicals in Sitemap](#custom-canonicals)

- [Google Can’t Find My Sitemap](#google-cant-find-sitemap)

- [Unsupported File Format](#unsupported)

- [My Sitemap Loads Slowly](#sitemap-loads-slowly)

### 1  The Sitemap Shows a Blank or White Page.

The first thing you need to do is determine whether you have a blank page or a white page. It sounds all the same, but there is a difference. [Check the source code](https://rankmath.com/kb/how-to-view-page-source/) of the blank/white page.

Let’s take the example of a website- [https://rankmath.com/](https://rankmath.com/). If the sitemap shows a white page with no data on the front end, but there is data in the source code, accessing the sitemap via this URL [https://rankmath.com/?sitemap=1](https://rankmath.com/?sitemap=1), in most cases, would show all the data on the front end.

But in the URL- [https://rankmath.com/?sitemap=1](https://rankmath.com/?sitemap=1), where the sitemap still does not load, then, in that case, the source code is also blank.

![Blank Sitemap](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201119%20655'%3E%3C/svg%3E)

If the source code of the sitemap page is empty, there must be a conflict with another plugin or theme. You can use the [Health Check plugin](https://rankmath.com/kb/check-plugin-conflicts/) to determine which plugin or theme is causing this.

But if there is data in the source code, flushing the sitemaps cache and [excluding it from the caching](https://rankmath.com/kb/exclude-sitemaps-from-caching/) plugin fixes the issue.

![Changing the sitemap settings from Rank Math and permalinks.](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201440%20634'%3E%3C/svg%3E)

Another scenario is that you have a static file with the same name as your sitemap file (_sitemap_index.xml_). You should FTP into your server and remove the file.

If that does not solve it, you might need to add a custom code to your [rank-math.php](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file) file from the theme files. To add custom code, we have a dedicated knowledgebase article on [how to add a filter/ hook to your site.](https://rankmath.com/kb/wordpress-hooks-actions-filters/)

`add_filter( 'rank_math/sitemap/enable_caching', '__return_false');`

**Note:** Rank Math generates sitemaps at runtime. If a physical sitemap file is present on the website, you may observe unexpected behaviors that include either one or both of the above issues.

### 2  Rank Math Does Not Create a Sitemap & Throws a 404 Error

If Rank Math doesn’t create a sitemap file or you get a 404 error while accessing your sitemap index, you may have to flush permalinks. Don’t be scared, it is fairly easy to do.

Head over to your WordPress admin area and navigate to **Settings → Permalinks**, and hit the “Save Changes” button once, even if you didn’t make any changes on the page.

![Flush permalink settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201197%20911'%3E%3C/svg%3E)

This should fix the issue. For more information, refer to our dedicated KB article [Why the Sitemap_Index.xml is Throwing a 404 Error](https://rankmath.com/kb/sitemap-404-error/).

### 3  Why is there an ‘XML or text declaration not at the start of the entity’ Error Inside Google Webmaster Tools?

There must be some white spaces before the XML Sitemap’s source code.

![Blank Space Sitemap](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201166%20674'%3E%3C/svg%3E)

This can be added by a blank line or space in your wp-config.php file or your theme’s functions.php file. If there is no such blank space in your wp-config.php or functions.php file, check for a plugin conflict using the [Health Check plugin](https://rankmath.com/kb/check-plugin-conflicts/).

We have also created a dedicated guide on how to fix this, which [you can refer to here](https://rankmath.com/kb/fix-whitespace-errors-in-sitemap/).

Also, ensure your cache is disabled, as it is highly likely that the cache is interfering with the working of the Sitemap functionality of Rank Math.

### 4  I am getting a `Missing XML tag` error

This is most likely because:

- You have no content on your website

- You have blocked all posts/pages from appearing in your sitemap

First, one can be fixed by adding some content to your website.

The second one can be fixed by making sure you don’t block useful posts/pages/taxonomies from being included in your sitemap. You can do so by going to **Rank Math SEO → Sitemap Settings** and checking the option for each type of post/taxonomy.

### 5  My Sitemap Is Not Working on My Apache Web Server.

Rank Math creates a virtual Sitemap dynamically when you enable the Sitemap module. We rely on redirects enabled by your server software to accomplish that. If the Sitemap doesn’t work, you may have to add some rewrite rules manually.

To ensure you need to add these rewrite rules, go to _domain.com?sitemap=1_. If it loads your sitemap, you need to add the rewrite rules.

Check your .htaccess and add the following code:

```
# START of Rank Math Sitemap Rewrite Rules
RewriteEngine On
RewriteBase /
RewriteRule ^sitemap_index.xml$ /index.php?sitemap=1 [L]
RewriteRule ^([^/]+?)-sitemap([0-9]+)?.xml$ /index.php?sitemap=$1&sitemap_n=$2 [L]
RewriteRule ^([a-z]+)?-?sitemap.xsl$ /index.php?xsl=$1 [L]
# END of Rank Math Sitemap Rewrite Rules
```

### 6  My Sitemap Is Not Working on My Nginx Web Server.

Rank Math creates a virtual Sitemap dynamically when you enable that module. We rely on redirects enabled by your server software to accomplish that. If the Sitemap doesn’t work, you may have to add some rewrite rules manually.

To ensure you need to add these rewrite rules, go to _domain.com?sitemap=1_. If it loads your sitemap, you need to add the rewrite rules.

Check your Nginx config file and add the following code:

```
# START Nginx Rewrites for Rank Math Sitemaps
rewrite ^/sitemap_index.xml$ /index.php?sitemap=1 last;
rewrite ^/([^/]+?)-sitemap([0-9]+)?.xml$ /index.php?sitemap=$1&sitemap_n=$2 last;
rewrite ^/([a-z]+)?-sitemap\.xsl$ /index.php?xsl=$1 last;
# END Nginx Rewrites for Rank Math Sitemaps
```

### 7  Why Am I Getting “Your file appears to be an HTML page” Error in Google Webmaster Tools?

Make sure that you submitted the correct XML sitemap to Google. You should submit the sitemap available on your website at _https://domain.com/sitemap_index.xml_

If you are sure you submitted the correct URL, but you are still facing this error, check for a plugin conflict using the [Health Check plugin](https://rankmath.com/kb/check-plugin-conflicts/).

If you are running W3 Total Cache along with Rank Math on your website, create another [user agent group](https://premium.wpmudev.org/blog/w3-total-cache-settings/#uaGroups?utm_campaign=RankMath) and add the ‘_googlebot’_ user agent to it.

When the above solutions don’t help resolve the issue, include the following filter in your theme’s [rank-math.php](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file) file.

```
add_filter( 'rank_math/sitemap/enable_caching', '__return_false');
```

### 8  My Sitemap URL Is Blocked by robots.txt

This usually happens because of unintended rules in the robots.txt file or because of some weird plugin conflict. Make sure you don’t have any rules in your actual robots.txt file or the virtual robots.txt file added by Rank Math by going to **Rank Math SEO → General Settings → robots.txt**.

### 9  Due to Custom Canonicals in Sitemap

Rank Math, by default, includes a self-referencing canonical for all posts that are set to Index. If you add a custom canonical to a post, it wouldn’t appear in the sitemap.

Because the actual post sitemap parser extracts the URLs allocated to the post sitemap XML and removes the ones with the different canonical, resulting in a lower number than the URLs initially loaded by the main parser.

Hence, the number of URLs on your site would not match the number in the sitemap.

So if you want all your posts to be shown in the sitemap, then you should remove the custom canonical from all your posts and then allow Rank Math to generate the canonical.

### 10  Google Can’t Find My Sitemap

You may have to flush permalinks if you get a 404 error and Google can’t access your sitemap index. Don’t be scared, it is fairly easy to do. Even if you didn’t make any changes click **Save Changes** from the **Permalinks** page of your WordPress dashboard.

This should fix the issue.

### 11  Unsupported File Format

If you’re getting **Sitemap can be read, but has errors** with the **Unsupported file format** error,****then you should check the following reasons-

- Ensure the Sitemap file is using the correct header shown below:

```
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
```

- Make sure the namespace in the header must be ended with 0.9. If it’s ended with .9, you’ll likely see an error.

- Ensure you’re using the right quotation marks to enclose XML attributes in either straight single or double quotes only. Even curly quotes may result in the error.

If the error still persists, then check your sitemaps status code using the [httpstatus](https://httpstatus.io) tool.

![status code](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20441'%3E%3C/svg%3E)

If the status code is 200 for the sitemaps, then make sure to redirect all the XML sitemap variations to the final variation of the XML Sitemap.

And once you’ve done this, [clear your website cache](https://rankmath.com/blog/clear-cache-in-wordpress/) and try to submit your sitemap in the Google Search Console again. This should fix the issue.

### 12  My Sitemap Loads Slowly

If your sitemap loads slowly, it is likely because your current hosting package isn’t providing your site with enough resources to keep it running smoothly. To confirm this, navigate to **Tools → Site Health → Info** from your WordPress dashboard, as shown below.

![Navigate to Info on Site Health](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201262%20583'%3E%3C/svg%3E)

Once done, scroll down and click **Server**. Then, compare the requirements below and their values with what you have on your site.

```
PHP max input variables: 1000
PHP time limit: 120 
PHP memory limit: 512M 
Max input time: 150
```

![Server configurations](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20905%20523'%3E%3C/svg%3E)

The values on your site should be the same or higher. If your values are lower, you should contact your web host to increase them or upgrade your site to a higher hosting plan.

If you are still facing issues with the Sitemaps, [open a new ticket here](https://rankmath.com/support/) so our staff can help.

			

			 

			
	
		
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

										
			
- [Using Rank Math’s Video Sitemap Generator](https://rankmath.com/kb/video-sitemap/)