# I Can’t Edit My Website’s Robots.txt

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/cant-edit-robots-txt/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# I Can’t Edit My Website’s Robots.txt

			
			

	

You can [edit your robots.txt](https://rankmath.com/kb/how-to-edit-robots-txt-with-rank-math/) file with the help of the Rank Math SEO plugin from **Rank Math SEO → General Settings → Edit robots.txt**.

![Edit robots.txt in Rank Math](https://rankmath.com/wp-content/uploads/2023/01/edit-robots-txt-4.jpg)

But there might be cases wherein you are not able to edit your file. In this knowledgebase tutorial, we’ll look at why you may be unable to edit your website’s robots.txt file.

## Common Reasons Your Site’s Robots.txt Can’t Be Edited

Let us look at some of the common reasons:

### 1  Presence of a Physical File

One of the common reasons for this issue is that a physical robots.txt file is present in the root folder of your website. Rank Math creates a virtual robots.txt file and lets you handle it through the WordPress dashboard. If you have an actual robots.txt file in your site’s root folder, then you may not be able to edit it with Rank Math, and you’ll see a notice as shown below.

![Robots.txt file in root folder](https://rankmath.com/wp-content/uploads/2021/08/Presence-of-robots.txt-file-in-root-folder.jpg)

To fix this, you can remove this file via FTP or cPanel File Manager and then try to edit the robots.txt file via Rank Math.

### 2  Other Plugin Creates Robots.txt

If another plugin is creating the robots.txt file then you will not be able to edit it with Rank Math. You can simply find and disable the plugin that is creating the file to resolve the issue.

### 3  Permission Issue on the Web Server

If there are some permission issues on the Web Server, you need to contact the web host. They might help you to solve the problem further.

## Robots.txt File Is Not Writeable

You may notice a `robots.txt file is not writeable` error message when Rank Math is unable to make any edits to the robots.txt file of your website. This is possible when the file edits are disabled through the wp-config.php file.

![Robots.txt File Is Not Writeable](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20655'%3E%3C/svg%3E)

To enable Rank Math to edit the file, add the below filter to your site. Once done, you will be able to edit your robots.txt file even if your wp-config.php file contains a constant preventing you from editing it. You can refer to this guide on [adding filters to your site](https://rankmath.com/kb/filters-hooks-api-developer/).

```
/**
 * Allow editing the robots.txt & htaccess data.
 *
 * @param bool Can edit the robots & htacess data.
 */

add_filter( 'rank_math/can_edit_file', '__return_true' );
```

Optionally, include the `DISALLOW_FILE_EDIT` constant in your **wp-config.php file** and set it to **false**. If this constant is already added, ensure that it is set to false, as shown below.

```
define ('DISALLOW_FILE_EDIT', false);
```

In addition to the wp-config, it is also possible that a plugin like Really Simple Security installed on your website may disable the built-in editors for security reasons. In that case, you may need to update your plugin settings to enable Rank Math to edit the robots.txt file.

In the Really Simple Security plugin, go to **Settings → Hardening** and turn off **Disable the built-in file editors** option, as shown below. Once you’re done, remember to click the **Save**button below to save your changes.

![Disable the built-in file editors from Really Simple Security plugin](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20716'%3E%3C/svg%3E)

Editing the Robots.txt file is a case of “with great power comes greater responsibility”. The [power to guide the Googlebot](https://kinsta.com/blog/wordpress-robots-txt/) with a well-written robots.txt file is a tempting one. Nevertheless, the advantages of having a well-written robots.txt file are enormous, better crawl speed, no useless content for crawlers, etc. However, keep in mind that one little mistake can cause you a lot of harm.

As always, if you still have any questions, doubts, or queries, we’re here to help. Please feel free to [reach our support team](https://rankmath.com/support/), who are available 24×7 and will help you out as soon as possible.

			

			 

			
	
		
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