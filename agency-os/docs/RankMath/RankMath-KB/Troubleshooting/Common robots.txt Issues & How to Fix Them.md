# Common robots.txt Issues & How to Fix Them

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/fix-common-robots-txt-issues/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Common robots.txt Issues & How to Fix Them

			
			

	

Your robots.txt file is the first stop for search engine crawlers visiting your site. When the file has an issue, it may cause serious technical SEO problems that will hurt your rankings or worse. So, it is always a great idea to fix any robots.txt issue immediately.

Please note that Rank Math creates a virtual robots.txt file and lets you handle it through the WordPress dashboard. And this means you do not require a physical robots.txt file in your website’s root folder.

In this knowledgebase article, we will show you some common robots.txt issues while using Rank Math and how you can fix them.

## Table Of Contents

- [The robots.txt File is Not Writable](#robots-txt-file-is-not-writeable)

- [The robots.txt URL Returns a 404 Error or a Blank Page](#robots-txt-returns-blank-page-or-404-error)

- [The Edit robots.txt Setting is Missing](#edit-robots-txt-is-missing)

- [robots.txt is Blocking Google From Crawling My Site](#robots-txt-is-blocking-googlebot)

- [Robots.txt Error in PageSpeed Insights](#robots-txt-is-not-valid-in-pagespeed-insights)

## 1  The robots.txt File is Not Writable

In the Edit robots.txt settings, you may encounter a **robots.txt file is not writable** error message, as shown below.

![robots.txt file is not writable error](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201584%20813'%3E%3C/svg%3E)

This error is displayed when Rank Math cannot modify your robots.txt file. To solve this, add the below code to your site. It will allow Rank Math to edit your robots.txt file. You can refer to this guide to add[filters to your site](https://rankmath.com/kb/wordpress-hooks-actions-filters/).

```
/**
 * Allow editing the robots.txt & htaccess data.
 *
 * @param bool Can edit the robots & htacess data.
 */

add_filter( 'rank_math/can_edit_file', '__return_true' );
```

Optionally, navigate to your wp-config.php file and search for the below code.

**Note:**You will locate the wp-config file in the root folder of your WordPress installation. You can access your root folder with an FTP application or directly in cPanel. If you are unable to access your wp-config.php file, you should contact your host for support.

```
define (‘DISALLOW_FILE_EDIT’, true);
```

If the code exists, you should replace it with the below code. If it does not exist, add the below code to the wp-config.php file.

```
define ('DISALLOW_FILE_EDIT', false);
```

## 2  The robots.txt URL Returns a 404 Error or a Blank Page

Rank Math automatically generates a robots.txt file at `https://yourdomain.com/robots.txt`.

When the URL returns a blank page or a 404 error, it may indicate the presence of a second robots.txt file in your site’s root directory. This other file conflicts with Rank Math’s robots.txt file, causing the robots.txt URL to return an error.

To confirm if your site contains another robots.txt file, log into your WordPress root directory using cPanel or an FTP application. If you use cPanel, head over to **FILES → File Manager**, as shown below.

![Navigate to File Manager in cPanel](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201426%20702'%3E%3C/svg%3E)

You will be presented with the root directory of your WordPress site. The next step is to check whether it contains a file named `robots.txt`.

If a robots.txt file is present, select it and click **Delete**, as shown below.

![Delete robots.txt in your WordPress root directory](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201569%20864'%3E%3C/svg%3E)

Once done, [clear your website and server-level cache](https://rankmath.com/blog/clear-cache-in-wordpress/) and test your robots.txt URL again.

If your root directory does not contain a robots.txt file, then you may be experiencing redirection issues. To solve this, add the applicable rewrite rule to the .htaccess file on your site. You can refer to this guide on [how to edit your .htaccess file](https://rankmath.com/kb/edit-htaccess/).

If your site runs on an Nginx server, add the below rewrite rule.

```
# START Nginx Rewrites for Rank Math Robots.txt File
rewrite ^/robots.txt$ /?robots=1 last;
rewrite ^/([^/]+?)-robots([0-9]+)?.txt$ /?robots=$1&robots_n=$2 last;
# END Nginx Rewrites for Rank Math Robots.txt File
```

If your site runs on an Apache server, add the below rewrite rule.

```
# START of Rank Math Robots.txt Rewrite Rules
RewriteEngine On
RewriteBase /
RewriteRule ^robots.txt$ /index.php?robots=1 [L]
# END of Rank Math Robots.txt Rewrite Rules
```

## 3  The Edit robots.txt Setting is Missing

The option to edit your robots.txt file is located at **Rank Math SEO → General Settings → Edit robots.txt**, as shown below.

![Navigate to Edit robots.txt to edit your robots.txt file](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201861%20816'%3E%3C/svg%3E)

If the Edit robots.txt option is not displayed, then you are using Rank Math in Easy Mode. To change this, navigate to **WordPress Dashboard** → **Rank Math SEO** and enable **Advanced Mode**, as shown below.

![Switch to Advanced Mode](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201858%20745'%3E%3C/svg%3E)

The Edit robots.txt option will now be displayed.

## 4  robots.txt is Blocking Google From Crawling My Site

If you think your robots.txt file is blocking Google from crawling your site, navigate to our [Robots Testing Tool](https://rankmath.com/tools/robots-txt/). Type in your URL, choose the *****option as the User Agent from the dropdown list, and click the **TEST**button.

![Robots.txt tester tool](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20645'%3E%3C/svg%3E)

Your robots.txt file will be displayed, as shown below.

![Example of a robots.txt file](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20661'%3E%3C/svg%3E)

The next step is to check whether the file contains the below rule.

**Note:**The below rule blocks the crawler specified in the **User-Agent** field above it from crawling your site. If the User-Agent is set to `Googlebot`, your robots.txt file will stop Google from crawling your site. If the User-Agent is set to `*`, it will stop every bot, including Google, from crawling your site. ****

```
Disallow: /
```

If the above rule exists, then you need to edit your robots.txt file to remove it. You can refer to this guide on [editing robots.txt with Rank Math](https://rankmath.com/kb/how-to-edit-robots-txt-with-rank-math/). If you are unable to edit your robots.txt file, you can refer to this [guide to troubleshoot the issue](https://rankmath.com/kb/cant-edit-robots-txt/).

You can also use the Robots Testing Tool to check if Google is blocked from crawling a specific URL on your site. To do that, enter the URL in the provided field and then choose ‘Googlebot’ as the User Agent from the dropdown list. Once you’ve done that, click on the **TEST**button.

![Testing if Googlebot was blocked from robots.txt file](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20647'%3E%3C/svg%3E)

So, if Google is blocked from crawling the URL, you will see it on the rule and may want to update it properly.

![Test a URL in the Robots Testing Tool](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20556'%3E%3C/svg%3E)

## 5  Robots.txt Error in PageSpeed Insights

If you inspect a URL in PageSpeed Insights, it may return a **robots.txt is not valid – Lighthouse was unable to download a robots.txt file**error message, as shown below.

![Lighthouse was unable to download robots.txt file](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201717%20240'%3E%3C/svg%3E)

This can happen when you use a content delivery network (CDN) like Cloudflare. Rank Math does not create a physical robots.txt file on your site. Instead, the file is created and displayed when a user visits your robots.txt URL. So you can safely ignore this error if your robots.txt file is available at `https://yourdomain.com/robots.txt`.

Optionally, you can add the below rule to your robots.txt file and test it again in PageSpeed Insights.

```
Disallow: /cdn-cgi/
```

And these are the fixes to the common robots.txt issues you may encounter on your site. We hope you are able to solve your robots.txt issue. If you have questions, you’re always more than welcome to [contact our dedicated support team](https://rankmath.com/support/). We’re available 24/7, 365 days a year…

			

			 

			
	
		
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