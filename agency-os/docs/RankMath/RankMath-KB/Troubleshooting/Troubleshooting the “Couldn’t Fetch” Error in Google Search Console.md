# Troubleshooting the “Couldn’t Fetch” Error in Google Search Console

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/couldnt-fetch-error-google-search-console/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Troubleshooting the “Couldn’t Fetch” Error in Google Search Console

			
			

	

The Couldn’t fetch error is a confusing status message you may encounter in Google Search Console.

![Couldn't fetch error in Google Search Console](https://rankmath.com/wp-content/uploads/2025/07/Couldnt-fetch-error-in-Google-Search-Console.png)

The status message may indicate Google is yet to fetch your sitemap. Alternatively, it could mean Google cannot fetch your sitemap because of an error in the sitemap. However, since you cannot tell both apart, it is a good idea to ensure it does not result from an error in your sitemap.

In this knowledgebase article, we will show you how to diagnose and fix any potential sitemap error that may have caused the Couldn’t fetch error in Google Search Console.

## Table Of Contents

- [Rename the Sitemap File](#rename-the-sitemap)

- [Fix Sitemap Issues](#fix-sitemap-issues)

- [Add the Correct Version of Your Sitemap to Google Search Console](#add-sitemap-to-Google-Search-Console)

## 1  Rename the Sitemap File

According to [John Mueller](https://www.seroundtable.com/google-fetch-process-sitemap-file-31042.html), if the sitemaps are valid and still aren’t functioning or couldn’t be read, then changing the name of the sitemap file can do the magic.

In Google Search Console, head over to **Indexing → Sitemaps**. In the **Add a new sitemap**setting, paste the below sitemap URL and click **SUBMIT**.

`https://yourdomain.com/?sitemap=1`

![Rename the sitemap file](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201846%20631'%3E%3C/svg%3E)

## 2  Fix Sitemap Issues

If the sitemap still returns a Couldn’t fetch error, follow the below steps to ensure the sitemap is set up correctly.

### 2.1  Validate Your Sitemap

The next step is to confirm your sitemap is correctly configured. To do that, enter your sitemap URL into the [Validate XML Sitemap](https://www.xml-sitemaps.com/validate-xml-sitemap.html) tool. Once done, click **VALIDATE SITEMAP**, as shown below.

![An example displaying how to validate a sitemap](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201113%20727'%3E%3C/svg%3E)

If your sitemap is correctly configured, the tool will return a No issues detected success message, as shown below.

![An example of a properly configured sitemap](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201384%20627'%3E%3C/svg%3E)

### 2.2  Ensure the Sitemap is Located in the Root Folder

If you manually created the sitemap, ensure it is installed in the root folder of your WordPress installation. That means there should only be one forward slash between your domain name and sitemap path, as shown below.

`https://yourdomainname.com/sitemap_index.xml`

### 2.3  Ensure Your Posts Are Set to Index

Your sitemap will become empty if all your posts are set to noindex. To set your posts to index, head over to **Rank Math SEO → Titles & Meta**. In the Robots Meta settings, enable the **Index**checkbox, as shown below.

![Index Titles and Meta settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201270%20544'%3E%3C/svg%3E)

Once done, scroll down and click **Save Changes**.

![Save changes](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20813%20122'%3E%3C/svg%3E)

### 2.4  Flush the Cache

If it looks like your sitemap is outdated, you need to flush the sitemap cache. To do so, simply navigate to **Rank Math SEO →** **Sitemap Settings**.

In this field, increase the value of the **Links Per Sitemap** by one and then save your settings by clicking the **Save Changes** button at the bottom of the page.

![Increase links per sitemap](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202396%201160'%3E%3C/svg%3E)

Once done, navigate to **Settings → Permalinks** and click **Save Changes**to ensure the current settings are applied.

![Flush Permalinks](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201197%20911'%3E%3C/svg%3E)

### 2.5  Exclude the Sitemap From Caching

Once done, the next step is to ensure your sitemap is not being cached. Refer to the following knowledgebase article to [ensure that your sitemaps are excluded from caching](https://rankmath.com/kb/exclude-sitemaps-from-caching/).

Once you complete these steps, you should submit your sitemap URL to Google Search Console again.

## 3  Add the Correct Version of Your Sitemap to Google Search Console

If Google Search Console still returns the Couldn’t fetch error, follow the below steps to continue troubleshooting.

### 3.1  Determine the Correct Variation of Your Site

Your site has four possible URL variations:

`http://yourdomain.com`

`http://www.yourdomain.com`

`https://www.yourdomain.com`

`https://yourdomain.com`

You should ensure you added the correct URL variation to Google Search Console.

To do that, navigate to **Settings → General**from your WordPress dashboard. The correct variation of your site will be displayed in the **Site Address (URL)**field, as shown below.

![Site Address in WordPress](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201265%20583'%3E%3C/svg%3E)

### 3.2  Add the Correct Site URL to Google Search Console

The next step is to add this variation as URL property to Google Search Console and verify it, if you haven’t already done so. You can refer to this knowledgebase article on [adding a URL property to the Search Console](https://rankmath.com/kb/google-site-verification/).

### 3.3  Add the Sitemap to Google Search Console

Once done, navigate to **Indexing → Sitemaps**in the Search Console**.**Then, paste the correct sitemap URL in the **Add a new sitemap** field and click **SUBMIT.**

**Note:**Ensure no spaces are in the sitemap URL, as it can prompt a Couldn’t fetch error.

![Add the sitemap to Google Search Console](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201839%20715'%3E%3C/svg%3E)

If the sitemap still returns a Couldn’t fetch error, add a forward slash before the sitemap URL and click **SUBMIT**.

![Add a forward slash to the sitemap URL](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201645%20330'%3E%3C/svg%3E)

If the error persists, it appears that Google is yet to fetch the sitemap. You can do nothing but wait for Google to fetch it. This may be deliberate from Google’s end, as [Google can find and fetch](https://rankmath.com/kb/zero-discovered-urls-through-sitemap/) your URLs without a sitemap.

And, that’s it! We hope the above steps have helped you resolve the issue. If you’re still facing the issue or if you have any other questions, please feel free to reach our support team directly from here, and we’re always here to help.

			

			 

			
	
		
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