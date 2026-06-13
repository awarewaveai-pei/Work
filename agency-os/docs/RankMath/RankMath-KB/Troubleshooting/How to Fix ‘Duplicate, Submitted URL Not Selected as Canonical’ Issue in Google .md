# How to Fix ‘Duplicate, Submitted URL Not Selected as Canonical’ Issue in Google Search Console

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/duplicate-submitted-url-not-selected-as-canonical/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Fix ‘Duplicate, Submitted URL Not Selected as Canonical’ Issue in Google Search Console

			
			

	

You know how frustrating it can be if you have seen the “Duplicate, Submitted URL not selected as canonical” status in your Google Search Console and the Index Status report of Rank Math’s analytics. After all, you’ve taken the time to submit your website to Google, and now they’re telling you there’s a problem.

Fortunately, this is usually an easy issue to fix. In this knowledgebase article, we’ll explain what this status means and how you can fix it.

## Table of Contents

- [What Does the Status Mean?](#issue)

- [How to Find Pages with ‘Duplicate, Submitted URL Not Selected as Canonical’](#find)

- [How to Fix the ‘Duplicate, Submitted URL Not Selected as Canonical’ Status](#fix)

- [Conclusion](#conclusion)

## 1  What Does the Status Mean?

The “Duplicate, submitted URL not selected as canonical” status typically indicates that the URL you submitted is a duplicate of another URL on your site, and Google has chosen the other URL as the canonical (preferred) version. This usually happens when two different pages on your site have very similar or identical content.

To avoid this issue, you must ensure that only one site version is accessible. You can do this by redirecting all traffic from the non-canonical version to the canonical version. This will ensure that Google only finds and indexes one version of your site, avoiding confusion or errors.

Besides, this status is similar to [Duplicate, Google Chose Different Canonical than User](https://rankmath.com/kb/duplicate-google-chose-different-canonical-than-user/) status; the only difference is that Google has not been able to decide which URL should be canonical.

## 2  How to Find Pages with ‘Duplicate, Submitted URL Not Selected as Canonical’

Luckily, the ‘Duplicate, Submitted URL Not Selected as Canonical’ status is easy to find. You can use either the Google search console or the **Index Status** report in Rank Math’s Analytics to find this issue.

### 2.1  Use Google Search Console to Identify Pages

To do this, navigate to the **Pages**section of Google Search Console and click on the **Not indexed**tab.

![Google search console pages](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%201118'%3E%3C/svg%3E)

Then, click on the **Duplicate, submitted URL not Selected as canonical** status as shown below:

![Duplicate, submitted URL not selected as canonical](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201500%20846'%3E%3C/svg%3E)

This will show you a list of all the pages on your website that are affected by this issue.

![List of affected pages](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201000%20740'%3E%3C/svg%3E)

### 2.2  Use Rank Math’s Analytics to Identify Pages with the Problem [PRO](https://rankmath.com/pricing/)

You can also use the [Index Status](https://rankmath.com/kb/url-inspection-api-integration/) report in Rank Math’s Analytics to identify the pages with the problem.

To do so, navigate to **Rank Math SEO → Analytics** in the WordPress dashboard. Next, click on the **Index Status** tab. Under this tab, you’ll get your pages’ real data/status and their presence on Google.

![Index Status tab](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202488%202416'%3E%3C/svg%3E)

Moreover, you can filter the post’s index status using the drop-down menu. When you select a specific status, say “Duplicated, submitted URL not selected as canonical,” you’ll be able to see all posts that share the same index status.

![Filter by index status](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202498%20892'%3E%3C/svg%3E)

Once you have the list of pages that are returning this status, you can start to troubleshoot and fix the issue.

## 3  How to Fix the ‘Duplicate, Submitted URL Not Selected as Canonical’ Status

These are ways to fix the “duplicate, submitted URL not selected as canonical” status:

- Redirect all traffic from the non-canonical version of your site to the canonical version. This can be done using a 301 redirect.

- Choose a different canonical URL for the affected pages.

- Use Rank Math’s Instant Indexing to submit your URL.

Let’s take a look at each of these methods in more detail.

### 3.1  Redirecting Traffic to the Canonical URL (301 Redirection)

If you want to redirect traffic from the non-canonical version of your site to the canonical version, you’ll need to add a 301 redirection. A 301 redirect is a permanent redirect that tells Google (and other search engines) that a page has been moved permanently. This is the best method to use if you want to ensure that only one version of your site is accessible.

To implement your 301 redirects with WordPress, use the powerful Redirection Manager in Rank Math and [set up your redirections](https://rankmath.com/kb/setting-up-redirections/) easily. Ensure that your Redirections module is enabled under **WordPress Dashboard  →** **Rank Math SEO**.

![Enable Redirections module](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201843%20756'%3E%3C/svg%3E)

To add a 301 redirect in Rank Math, navigate to the **Redirections**from your Rank Math dashboard.

![Navigate to Redirections](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20642%20600'%3E%3C/svg%3E)

Then, click on **Add New Redirection**. Next, add your Source and Destination URLs and select the redirection type 301 Permanent Move as shown below:

![Add redirection](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20850%201076'%3E%3C/svg%3E)

Once done, click the **Add Redirection** button, and Google should re-index the page with the new canonical URL.

If you have a lot of URLs that need to be redirected, you can also add them in bulk.

[Learn more about bulk 301 redirects WordPress](https://rankmath.com/blog/bulk-301-redirects-wordpress/).

### 3.2  Choosing a Different Canonical URL

If you don’t want to redirect traffic from the non-canonical version of your site, you can also choose a different canonical URL for the affected pages. The easiest way to do this is by using Rank Math meta box, which you can find under the SEO tab when editing a post or page.

By default, Rank Math uses the current post/page URL as the canonical URL, so you would only need to change this setting if you wish to change it to something else. This is also known as a self-referencing canonical.

Under Advanced Settings, you will see a Canonical URL field where you can add the URL you want to be the canonical URL for that specific post or page.

**Note:** If you cannot find the Advanced tab, please[enable the Advanced Mode](https://rankmath.com/kb/switch-from-easy-to-advanced-mode/) from **WordPress Dashboard → Rank Math SEO**.

![Click the Advanced Mode](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20975%20371'%3E%3C/svg%3E)

Once you’ve added a canonical URL, save or update your post or page. Google will then re-index the page with the new canonical URL.

For further ado, see the screenshot below:

![Enter the canonical URL](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20925%20323'%3E%3C/svg%3E)

### 3.3  Use Rank Math’s Instant Indexing

To use the **Instant Indexing: Submit Page**option, ensure you’ve enabled the [Instant Indexing](https://rankmath.com/kb/how-to-use-indexnow/) module in Rank Math.

On the Posts page, hover over the post you wish to submit and click the **Instant Indexing: Submit Page** option, as shown below.

![use Instant Indexing ](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201487%20602'%3E%3C/svg%3E)

Once the post gets submitted successfully, you’ll see a notice at the top of the page, as shown below.

![Indexing notice](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201724%20702'%3E%3C/svg%3E)

## 4  Conclusion

In the end, we hope this article helped you learn how to fix the “Duplicate, submitted URL not selected as canonical” status in your Google Search Console and the Index Status report of Rank Math’s analytics. If you have any doubts or questions related to this matter, please don’t hesitate to [contact our support team](https://rankmath.com/support/). We are available 24×7, 365 days a year, and are happy to help you with any issues you might face.

			

			 

			
	
		
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