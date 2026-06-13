# Why the Sitemap_Index.xml is Throwing a 404 Error

> **Category:** Sitemaps
> **Source:** https://rankmath.com/kb/sitemap-404-error/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Why the Sitemap_Index.xml is Throwing a 404 Error

			
			

	

Google uses the sitemap_index.xml file to keep track of all the pages on your site. If this sitemap is unavailable and returns a 404 error, then Google won’t be able to find all the pages on your site.

![sitemap_index.xml](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201000%20391'%3E%3C/svg%3E)

In this knowledgebase article, we’ll walk you through why the sitemap_index.xml throws a 404 error and how to solve this issue.

## Table of Contents

- [Why Does the Sitemap_index.xml Throw a 404 Error?](#sitemap-404-error)

- [What Causes a Sitemap_Index.xml File to Throw a 404 Error?](#cause-of-404-error)

- [How to Fix sitemap_index.xml Throws a 404 Error in Rank Math?](#fix-the-404-error)
    

        
- [Flush the Sitemap Cache](#sitemap-cache)
        
- [Fix Sitemap Issues on Nginx or Apache Server](#nginx-apache-server)
        
- [Exclude the Sitemap Files in the Caching Plugin](#exclude-sitemap-files)
        
- [Add Filter to Enable/Disable Sitemap Caching](#add-filter)
        
- [Ensure Pages Are Set to Index](#index)

## 1  Why Does the Sitemap_index.xml Throw a 404 Error?

A 404 error means that the sitemap index or individual sitemap does not exist. Google bot expects a result of 200 ok responses & fetches all your website URLs via the submitted sitemap file. Instead, it throws a 404 error when it cannot locate the sitemap_index.xml.

[Configuring sitemaps](https://rankmath.com/kb/configure-sitemaps/) in Rank Math is extremely simple. However, if you’re not able to use the sitemap functionality in Rank Math, please go through our knowledgebase article on [Rank Math sitemap issues and their fixes](https://rankmath.com/kb/fix-sitemap-issues/) that’ll help you to fix some of the common sitemap problems.

## 2  What Causes a Sitemap_Index.xml File to Throw a 404 Error?

There are a few reasons that can cause the sitemap_index.xml file to throw a 404 error:

- **Permalink Structure:** If you recently changed your permalink structure, make sure that you update your sitemap_index.xml file accordingly.

- **Rewrite Rules are Missing:** If you are using an [NGINX server](https://rankmath.com/kb/xml-sitemaps-nginx/) or Apache server, ensure you have the correct rewrite rules in place.

- **Sitemap from Caching Plugin:** If you are using a caching plugin, ensure you have excluded the sitemap_index.xml file from caching. The cache could be via a plugin or from the server.

## 3  How to Fix `sitemap_index.xml` Throws a 404 Error in Rank Math?

If you’re using Rank Math and your sitemap_index.xml file is throwing a 404 error, here are a few things you can do to fix the issue:

### 3.1  Flush the Sitemap Cache

Once you’ve added the rewrite rules, you need to flush the sitemap cache for the changes to take effect. To do that, navigate to **Rank Math SEO → Sitemap Settings** and change the **Links** **Per Sitemap** as shown below:

![Links Per Sitemap](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202406%20918'%3E%3C/svg%3E)

Next, click on **Save Changes**, at the bottom of the page. Once you’ve saved the settings, head over to your WordPress admin area and navigate to **Settings → Permalinks**, as shown below:

![Permalink Settings in WordPress](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20642%20399'%3E%3C/svg%3E)

Simply hit the **Save Changes** button once, even if you didn’t make any changes on the page.

![Save Changes ](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20761'%3E%3C/svg%3E)

Doing so will flush the permalinks setting and fix your sitemap problem.

### 3.2  Fix Sitemap Issues on Nginx or Apache Server

If your Nginx server prevents the creation of the sitemap file, then Rank Math will also inform you through a notice under **Sitemap Settings**, as shown below.

![Sitemap Issues on Nginx Server](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202358%20955'%3E%3C/svg%3E)

In that case, you need to add the rewrite rules manually.

#### 3.2.1  Add Rewrite Rules to Nginx Server

If you’re using an Nginx server, you need to add the following rewrite rules to fix this:

```
# START Nginx Rewrites for Rank Math Sitemaps
rewrite ^/sitemap_index.xml$ /index.php?sitemap=1 last;
rewrite ^/([^/]+?)-sitemap([0-9]+)?.xml$ /index.php?sitemap=$1&sitemap_n=$2 last;
rewrite ^/([a-z]+)?-sitemap\.xsl$ /index.php?xsl=$1 last;
# END Nginx Rewrites for Rank Math Sitemaps
```

**Important Note:** If you’re not sure about adding these rules, please get in touch with your server administrator or hosting support, and they will be able to help you out.

#### 3.2.2  Add Rewrite Rules to Apache Web-Server

Rank Math creates a virtual Sitemap dynamically when you enable that module. We rely on redirects enabled by your server software to accomplish that. If the Sitemap doesn’t work, you may have to add some rewrite rules in your .htaccess file.

You can learn about [How to Edit Your .htaccess File Using Rank Math](https://rankmath.com/kb/edit-htaccess/). Just copy and paste the following code at the end of your .htaccess file:

```
# START of Rank Math Sitemap Rewrite Rules
RewriteEngine On
RewriteBase /
RewriteRule ^sitemap_index.xml$ /index.php?sitemap=1 [L]
RewriteRule ^([^/]+?)-sitemap([0-9]+)?.xml$ /index.php?sitemap=$1&sitemap_n=$2 [L]
RewriteRule ^([a-z]+)?-?sitemap.xsl$ /index.php?xsl=$1 [L]
# END of Rank Math Sitemap Rewrite Rules
```

### 3.3  Exclude the Sitemap Files in the Caching Plugin

Caching plugins is probably the easiest way to speed up your WordPress site. However, you might get your sitemap cached too, which is not a good idea! A sitemap should always reflect the latest posts and URLs of your website; **caching it defeats the purpose.**

Since you don’t have to cache the sitemaps, [exclude the sitemap files generated by Rank Math plugin](https://rankmath.com/kb/exclude-sitemaps-from-caching/) from being cached in your caching plugin. The cache could be via a plugin or from the server.

And that’s it! Now open the sitemap after clearing your browser’s cache or using a private (incognito) window, and you should see your sitemap without any trouble.

### 3.4  Add Filter to Enable/Disable Sitemap Caching

Sometimes the sitemap can be affected by the server-level cache. In such a case, you can add the following code to your theme’s [rank-math.php](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file) file to make sure your sitemap is excluded from caching:

```
/**
 * Filter if XML sitemap transient cache is enabled.
 *
 * @param boolean $unsigned Enable cache or not, defaults to true
 */
add_filter( 'rank_math/sitemap/enable_caching', '__return_false');
```

Once done, you can save the changes and re-check your sitemap to see if the issue is resolved. If the problem persists, you can try the following method.

### 3.5  Ensure Pages Are Set to Index

Robots meta tag helps you to instruct Google to include or exclude a specific page from the search engine results.

However, ensure that your posts and pages are set to index in the robots meta that you want to index in the search engines. The pages set to noindex in the robots meta tag will be excluded from the sitemap generated by Rank Math and will result in a 404 error.

![set to noindex](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20842%20374'%3E%3C/svg%3E)

You can check your robots meta tag for a specific post by navigating to **Rank Math SEO → Advanced tab**in the post editing screen.

![index in advanced tab](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20602%20482'%3E%3C/svg%3E)

Once done, you can save the changes by clicking the **Update**or **Publish** button.

We hope this article has helped you fix **sitemap_index.xml** throwing a 404 error in Rank Math. If you have any doubts or questions related to this matter, please don’t hesitate to contact our support team. We are available 24×7, 365 days a year, and are happy to help you with any issues you might face.

			

			 

			
	
		
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