# How to Fix Whitespace Errors Breaking Your XML Sitemap in WordPress

> **Category:** Sitemaps
> **Source:** https://rankmath.com/kb/fix-whitespace-errors-in-sitemap/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Fix Whitespace Errors Breaking Your XML Sitemap in WordPress

			
			

	

Have you ever opened your XML sitemap only to see an error or a blank page? Maybe it says something like:

_“XML declaration allowed only at the start of the document”_

This issue is more common than you’d think, and often has nothing to do with your SEO plugin.

The real culprit? A tiny, invisible whitespace or line break that sneaks into your WordPress code, usually before any output begins. And that’s enough to completely break your sitemap.

In this knowledgebase article, we’ll show you exactly how to detect and fix these whitespace errors.

## 1  What Causes the Whitespace Sitemap Error in WordPress?

XML sitemaps follow strict formatting rules. The very first line of the file must begin with:

`<?xml version="1.0" encoding="UTF-8"?>`

If even a single space or hidden character appears before this line, the sitemap becomes invalid. It may appear fine in your browser, but search engines like Google will view it as broken and refuse to crawl it.

This usually happens when:

- There’s accidental whitespace in files like `functions.php`, `wp-config.php`, or `index.php`—especially before the `<?php` tag.

- A closing PHP tag (`?>`) is used and followed by a space or line break.

- A plugin or theme sends output too early, before WordPress is ready.

These small mistakes often go unnoticed—until Google rejects your sitemap.

## 2  How to Spot the Whitespace Error in Your Sitemap

You might not notice the problem until you manually check your sitemap or submit it to Google Search Console.

Instead of showing a clean list of sitemap links, the page might be blank or show an error like:

**“This page contains the following errors: error on line 2 at column 6: XML declaration allowed only at the start of the document. Below is a rendering of the page up to the first error.”**

This means something is being output before the XML declaration.

![XML declaration sitemap error](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20491'%3E%3C/svg%3E)

To confirm, right-click and [view the page source](https://rankmath.com/kb/how-to-view-page-source/). If there’s a blank line or even a space above the `<?xml...` line or a tab to the left of it—that’s the issue.

![The issue of the whitespace sitemap error](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20568'%3E%3C/svg%3E)

XML must start exactly at the first character with no space before it.

Your browser might still attempt to render the page, but search engines will reject it completely.

## 3  How to Fix the Whitespace Sitemap Error in WordPress

If your sitemap is throwing errors or being rejected by search engines because of a whitespace issue, here are the steps to fix it:

### 3.1  Remove Any Whitespace in PHP Files

Start by checking core PHP files: `wp-config.php`, your theme’s `functions.php` (especially if it’s a child theme), `index.php`, or any plugin file you’ve recently edited.

Make sure there are **no blank lines** or spaces before the opening `<?php` tag. It must be the first thing in the file, with **no indentation**.

For example:

![remove any whitespace in your php files](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201353%20740'%3E%3C/svg%3E)

Avoid using a closing `?>` at the end of these files. If it’s there, remove it or ensure that there is absolutely nothing after it, not even a single space or line break.

Even a tiny, invisible character in the wrong place can break your sitemap.

### 3.2  Troubleshoot Your Site Health

If you’ve cleaned up your files and the issue remains, the next step is to find out if a plugin or theme is leaking output too early.

Install the [Health Check & Troubleshooting plugin](https://wordpress.org/plugins/health-check/) and enable Troubleshooting Mode. This lets you deactivate plugins and switch themes just for yourself, without affecting your visitors.

Disable plugins one by one, checking your sitemap each time to ensure the issue is resolved. If the error disappears, you’ve likely found the cause. Do the same with your theme—switch to a default theme like Twenty Twenty-Five to test.

This approach helps you isolate what’s triggering the output. For full instructions, refer to our detailed guide on [how to troubleshoot WordPress issues safely](https://rankmath.com/kb/check-plugin-conflicts/).

### 3.3  Add Output Buffering

To help prevent early output from breaking your sitemap, you can enable output buffering. Add the following code to the very top of your wp-config.php file, right after `<?php`:

```
// Prevent accidental output breaking XML sitemaps
if ( ! headers_sent() ) {
    ob_start();
}
```

This tells WordPress to hold all output until everything is ready, helping catch any accidental whitespace.

![Add Output Buffering](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201348%20676'%3E%3C/svg%3E)

Make sure there’s no blank line before `<?php`, and don’t close the file with `?>` at the end. Leaving it open is best.

After saving, clear your sitemap cache. Here’s how you can flush your sitemap in Rank Math SEO.

![Flush Rank Math sitemap cache](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201440%20634'%3E%3C/svg%3E)

Then visit your sitemap URL (e.g., https://example.com/sitemap_index.xml), view the page source, and ensure nothing appears above the `<?xml...` line, not even a space or tab.

And that’s it! You should now have a clean, functional XML sitemap. If you have any doubts or need assistance with Rank Math, please don’t hesitate to [contact our support team](https://rankmath.com/support/). They’re available 24/7, 365 days a year.

			

			 

			
	
		
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

		

										
			
- [How to Submit Your Website to Search Engines](https://rankmath.com/kb/submit-website-to-search-engines/)

										
			
- [How to Configure Sitemaps in Rank Math](https://rankmath.com/kb/configure-sitemaps/)

										
			
- [What Are the SEO Benefits of Sitemaps?](https://rankmath.com/kb/sitemaps-seo-benefits/)

										
			
- [How to Submit a Sitemap to Google](https://rankmath.com/kb/submit-sitemap-to-google/)

										
			
- [Rank Math Sitemap Issues and Their Fixes](https://rankmath.com/kb/fix-sitemap-issues/)

										
			
- [Using Rank Math’s Video Sitemap Generator](https://rankmath.com/kb/video-sitemap/)