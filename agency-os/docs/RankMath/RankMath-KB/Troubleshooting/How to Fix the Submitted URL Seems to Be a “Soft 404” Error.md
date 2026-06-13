# How to Fix the Submitted URL Seems to Be a “Soft 404” Error

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/fix-submitted-url-seems-to-be-a-soft-404-error/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Fix the Submitted URL Seems to Be a “Soft 404” Error

			
			

	

If you see the error submitted URL seems to be a **soft 404** in your Google Search Console and the Index Status report of Rank Math’s Analytics, it means that Google has crawled your website and found that the page doesn’t exist. This can happen for a number of reasons, but the most common is that the page has been deleted or moved.

![Soft 404 error, Status: Excluder](https://rankmath.com/wp-content/uploads/2022/10/Soft-404-error.jpg)

In this knowledge base article, we’ll explain what this message means and how to fix this error so that it doesn’t appear anymore.

![How to Fix Soft 404 Errors to Improve Site Health](https://img.youtube.com/vi/VlpXG5_RxRs/maxresdefault.jpg)
__

    
## Table of Contents

    

        
- [404 vs. Soft 404 Errors: What’s the Difference](#404-vs-soft-404)
        
- [What Causes Soft 404 Errors?](#what-causes-soft-404)
        
- [How Can I Find Soft 404 Errors](#find-soft-404)
            

                
- [Check Your Web Server Settings](#check-web-server-settings)
                
- [Use a 301 Redirect](#301-redirect)
                
- [Set Empty Archive to Noindex](#empty-archives)
                
- [Thin and Duplicate Content](#thin-duplicate-content)
        
- [Conclusion](#conclusion)
    

## 1  404 vs. Soft 404 Errors: What’s the Difference

The 404 Not Found error is an HTTP status code, meaning the page you were trying to reach on a website couldn’t be found on their server. 404 errors are often caused by broken or dead links, which means that the link you clicked on is no longer valid.

On the other hand, a **Soft 404** error is a page that returns a 200 OK HTTP status code (meaning the page is found), but the page’s content is either blank or it doesn’t match what the user was expecting.

In other words, a 404 Not Found error means that the page you were trying to find doesn’t exist, while a soft 404 error means the page that doesn’t exist is still appearing to exist.

## 2  What Causes Soft 404 Errors?

There are a few different ways that “soft 404” errors can happen:

- The web server is misconfigured and is returning the wrong status code for pages that don’t exist.

- The page exists, but it’s been moved to a new location, and the old URL isn’t redirecting to the new one.

- The page exists, but it’s been temporarily taken down, and the server is returning a **200 OK**status code instead of a 404 Not Found.

## 3  How Can I Find Soft 404 Errors

The best way to find the “soft 404” error is to use Google Search Console or the Index Status report in Rank Math’s Analytics.

In the Google Search Console, go to the **Pages**section of Google Search Console and click on the **Not indexed**tab.

![not indexed tab](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20902'%3E%3C/svg%3E)

Then, click on the “Soft 404” error status.

![Click on the "Soft 404" error from he Excluded Status](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201000%20681'%3E%3C/svg%3E)

This will show you a list of all the pages on your website that are returning **soft 404** errors.

![list of all the pages affected by Soft 404 Error](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201000%20342'%3E%3C/svg%3E)

In Rank Math analytics, go to the[Index Status](https://rankmath.com/kb/url-inspection-api-integration/) under **Rank Math SEO → Analytics → Index Status** tab. Under this tab, you’ll get the real data/status of your pages as well as their presence on Google. But you can only have an advanced view of this if you are a Rank Math PRO user.

![index tab ](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202488%202416'%3E%3C/svg%3E)

Moreover, you can also filter the post’s index status using the drop-down menu. When you select a specific status, say **soft 404**, you’ll be able to see all posts that share the same index status.

![Index status drop-down](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202498%20892'%3E%3C/svg%3E)

Once you’ve identified the **soft 404** error, you can take steps to fix it.

## 4  How to Fix Submitted URL Seems to Be a Soft 404 Error

Pages with soft 404 errors are unlikely to display in search results because they are filtered out during indexing. And these soft 404 errors can limit your crawl budget, which search engines could otherwise use to crawl real pages.

So here are a few ways to fix a submitted URL that seems to be a **soft 404** error:

### 4.1  Check Your Web Server Settings

First, check your web server settings to ensure that the server is configured to return a 404 error for missing pages. If your server is not configured correctly, it may be returning a 200 status code instead of a 404, which will cause Google to index the page even though it doesn’t exist.

Contact your web hosting provider to fix this and ask them to check your server settings.

### 4.2  Use a 301 Redirect

When you change the URL of a page on your website, setting up a 301 redirect is important so that visitors to the old URL are automatically taken to the new one. This is especially important if your old URL is popular and gets a lot of traffic; otherwise, all that traffic will be lost.

301 redirects are also a good way to deal with broken links. If you find that there are many broken links pointing to a certain page on your site, you can set up a 301 redirect so that visitors are automatically taken to another page instead. This is a much better solution than just letting the 404 error show up, as it will give visitors a better experience and maybe even help them find what they’re looking for.

**_Note:_**_You can only use this method if you want permanent redirects from one URL to another. However, if you still want the duplicate page to access with a noindex tag, skip this method and go on to the next method._

To create a manual redirection with Rank Math, simply go to **WordPress Dashboard →** **Rank Math SEO → Redirections**, as shown below:

![Redirections](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20642%20600'%3E%3C/svg%3E)

And then, you can go ahead and create a 301 redirect by simply entering the URL you wish to redirect as your Source URL and the location of the new resource (i.e., where you’d like to redirect the source URL to) as the Destination URL.

![Create new redirection](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20850%201076'%3E%3C/svg%3E)

Once done, simply click on the **Add Redirection** button.

If you have a lot of URLs that need to be redirected, you can also add them in bulk.

You can learn more about [How to set up Bulk 301 Redirects in WordPress](https://rankmath.com/blog/bulk-301-redirects-wordpress/).

### 4.3  Set Empty Archive to Noindex

Sometimes, you may want to include pages that don’t have any content in your sitemap. However, if these pages are empty, Google will treat them as soft 404s.

You should, therefore, mark them as noindex from **WP Dashboard → Rank Math SEO → Titles & Meta → Global Meta → Noindex Empty Category and Tag Archives**and save your changes.

Enabling this option counters this problem, as all the archive pages of empty categories and tag pages will be no-indexed. We recommend that you enable this option.

![Noindex empty category and tag archives](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201492%20304'%3E%3C/svg%3E)

Once done, [clear the cache](https://rankmath.com/blog/clear-cache-in-wordpress/) and wait for Google to crawl your sitemap again.

### 4.4  Thin and Duplicate Content

If your pages have very little content, Google may treat them as soft 404s. This is because thin content is usually not useful to visitors and is often the result of spammy or low-quality pages.

To fix this, you need to add more content to your pages. Ensure each page has at least a few hundred words of unique, well-written content. You should also avoid duplicating content from other pages on your site, as this can lead to soft 404 errors.

If you have a lot of pages with thin or duplicate content, you may want to consider no-indexing them. This will tell Google not to index these pages, which will help to improve your site’s overall quality.

You can learn more about [How to Remove Thin Content-Articles](https://rankmath.com/kb/remove-thin-content-articles/).

## 5  Conclusion

As you can see, there are a few different ways to fix a **soft 404** error on your website. The best thing is that Rank Math makes it easy to fix these errors with its powerful features.

We hope this article helped you learn how to fix the Submitted URL seems to be a **soft 404** error in Google Search Console and the Index Status report of Rank Math’s Analytics. If you have any doubts or any questions related to this matter, please don’t hesitate to reach out to our [support team](https://rankmath.com/support/). We are available 24×7, 365 days a year, and are happy to help you with any issues that you might face.

			

			 

			
	
		
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