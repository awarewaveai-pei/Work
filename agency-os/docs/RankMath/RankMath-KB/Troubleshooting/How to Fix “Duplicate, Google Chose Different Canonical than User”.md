# How to Fix “Duplicate, Google Chose Different Canonical than User”

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/duplicate-google-chose-different-canonical-than-user/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Fix “Duplicate, Google Chose Different Canonical than User”

			
			

	

If you’re seeing “Duplicate, Google chose different canonical than user” status in your [Google Search Console](https://search.google.com/search-console/about) account and in the Index Status report of Rank Math’s Analytics, it’s important to take action to fix the problem. When you have duplicate content on your site, Google will often choose a different canonical than the one you’ve selected. In some cases, this can lead to your content not being indexed at all.

![Duplicate, Google chose different canonical than user](https://rankmath.com/wp-content/uploads/2022/10/Duplicate-Google-Chose-Different-Canonical-than-User-search-console.jpg)

In this knowledgebase article, we’ll explain what **Duplicate, Google chose different canonical than user** means, and show you how to fix it.

![[Solved] Duplicate / Alternate Page with Proper Canonical Tag](https://img.youtube.com/vi/Q2tjqho9etg/maxresdefault.jpg)
__

## Table of Contents

- [What’s Duplicate, Google Chose Different Canonical than User Mean?](#what-does-it-mean)

- [How to Find “Duplicate, Google Chose Different Canonical than User” Error](#how-to-find)

- [How to Fix the Problem](#how-to-fix)

- [Conclusion](#conclusion)

## 1  What’s Duplicate, Google Chose Different Canonical than User Mean?

This status message means that Google has found two or more pieces of content on your site that are identical or very similar. However, when Google chose a “canonical” version of the content (the one that should be indexed), it chose a different URL than the one you selected.

This can be a problem for two reasons:

- It can cause your content not to be indexed at all. If Google can’t figure out which version of the content is the “true” one, it may decide not to index any of them.

- It can cause confusion for users who click on a link to your content only to find a different piece of content than they were expecting.

## 2  How to Find “Duplicate, Google Chose Different Canonical than User” Error

Luckily, there’s an easy fix for the “Duplicate Google chose different canonical than user” status.

Here’re some steps you can take:

The first step is to identify which pages on your site are affected by the problem. You can do this in two ways:

### 2.1  Use Google Search Console to Identify Pages

To do this, go to the **Pages** section of Google Search Console and click on the **Not indexed** tab.

!["Coverage" section of Google Search Console](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20902'%3E%3C/svg%3E)

Then, click on the “Duplicate, Google chose different canonical than user” status.

![Duplicate, Google chose different canonical than user status](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201500%20855'%3E%3C/svg%3E)

This will show you a list of all the pages on your website that are affected by this issue.

![List of affected pages](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201200%20361'%3E%3C/svg%3E)

### 2.2  Use Rank Math’s Analytics to Identify Pages With the Problem [PRO](https://rankmath.com/pricing/)

You can also use the [Index Status](https://rankmath.com/kb/url-inspection-api-integration/) report in Rank Math’s Analytics to identify the pages with the problem.

To do so, navigate to **Rank Math > Analytics** in the WordPress dashboard. Next, click on the **Index Status** tab. Under this tab, you’ll get the real data/status of your pages as well as their presence on Google.

![Index Status tab](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202488%202416'%3E%3C/svg%3E)

If you’re using the Rank Math PRO, you can also filter the posts’ index status using the drop-down menu. When you select a specific status, you’ll be able to see all posts that share the same index status.

For reference, see the screenshot below:

![index status using the drop-down menu](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202536%20754'%3E%3C/svg%3E)

Once you’ve identified the pages with the problem, the next step is to fix them.

![index status message](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202446%20570'%3E%3C/svg%3E)

## 3  How to Fix the Problem

There are a few ways you can fix the problem:

### 3.1  Choose a Different Canonical URL

One way to fix the problem is to simply choose a different canonical URL for the affected pages, if applicable. This is easy to do by using Rank Math meta box (as pictured below):

![Rank Math Advanced Meta box](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20367%20635'%3E%3C/svg%3E)

By default, Rank Math makes use of the current post/page URL as the canonical URL, so you would only need to change this setting if you wish to change it to something else. This is also known as a self-referencing canonical.

**Note:** _If you cannot find the Advanced tab, please_[_enable the advanced mode_](https://rankmath.com/kb/switch-from-easy-to-advanced-mode/)_from **WordPress Dashboard > Rank Math > Dashboard**._

![Enable Advanced mode](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20920'%3E%3C/svg%3E)

Under the Advanced tab, in the canonical URL field, simply enter the URL that you want Google to index.

The below screenshot is for reference only.

![Canonical URL](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20925%20323'%3E%3C/svg%3E)

Once you’ve done that, save your changes, and Google should re-index the page with the new canonical URL.

### 3.2  Add a 301 Redirect

Another way to fix the problem is to add a 301 redirect from the non-canonical URL to the canonical URL. This will tell Google (and other search engines) that the canonical URL is the “main” URL, and that any traffic going to the non-canonical URL should be redirected to the canonical version.

To do so, simply go to the **Rank Math > Redirections** in your WordPress admin dashboard as shown below:

![Rank Math Redirections Tab](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20638%20744'%3E%3C/svg%3E)

And then, you can go ahead and create a 301 redirect by simply entering the URL you wish to redirect as your Source URL and the location of the new resource (i.e. where you’d like to redirect the source URL to) as the Destination URL.

![Create new redirection](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20850%201076'%3E%3C/svg%3E)

Once done, click the **Add Redirection** button, and Google should re-index the page with the new canonical URL.

If you have a lot of URLs that need to be redirected, you can also add them in bulk.

[Learn more about bulk 301 redirects WordPress](https://rankmath.com/blog/bulk-301-redirects-wordpress/).

## 4  Conclusion

**Duplicate, Google chose different canonical than the user** is a common indexation problem that can be caused by a number of factors. However, it’s easy to fix with the methods mentioned above.

Once you’ve fixed the problem, Google should re-index your pages, and your traffic should return to normal levels. So be sure to take the time to identify and fix this issue on your site. If you still have absolutely any questions, please feel free to [reach our support team directly from here](https://rankmath.com/support/), and we’re always here to help.

			

			 

			
	
		
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