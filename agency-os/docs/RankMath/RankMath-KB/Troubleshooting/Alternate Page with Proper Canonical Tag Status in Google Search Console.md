# Alternate Page with Proper Canonical Tag Status in Google Search Console

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/alternate-page-with-proper-canonical-tag/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Alternate Page with Proper Canonical Tag Status in Google Search Console

			
			

	

Do you see the “Alternate Page with Proper Canonical Tag” status in your Google Search Console? You can commonly see this message when you have multiple page versions on your website.

![Alternate page with proper canonical tag status](https://rankmath.com/wp-content/uploads/2022/10/alternate-pages.jpg)

In this knowledgebase article, we’ll explain what this message means and give you tips on how to fix this if required.

![[Solved] Duplicate / Alternate Page with Proper Canonical Tag](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201280%20720'%3E%3C/svg%3E)
__

## 1  What Does “Alternate Page with Proper Canonical Tag” Mean?

The “Alternate Page with Proper Canonical Tag” status message in Google Search Console means that there are two versions of a page on your website having the same canonical URL. Google will simply exclude the duplicate version and index the main version of the page.

**This ideally means Google recognizes these canonicalized URLs correctly, and there is nothing you need to do on your part.**

But that said, you should still take a look at them from time and time and validate if these pages are meant to be canonicalized. Else, you might lose the potential traffic from the valuable pages that could have been indexed.

## 2  What Is a Canonical Tag?

A canonical tag tells search engines which version of a webpage is the “master” or “canonical” version, and should be indexed. It helps you specify which URL version you would like to appear in search results. This is useful because, in some cases, where you may have content accessible via multiple URLs or different websites entirely, you can use canonical URLs to avoid duplicated content from negatively affecting rankings.

For example, let’s say you have two pages on your website that are very similar:

- rankmath.com/page1

- rankmath.com/page2

Both pages have similar content, but you want search engines to index only the canonical version of the page (in this case, rankmath.com/page1).

To do this, you would add a canonical tag to the HTML code of rankmath.com/page2 as well as to the HTML code of rankmath.com/page1, like this:

`<link rel="canonical" href="https://rankmath.com/page1">`

This tells search engines that `rankmath.com/page1` is the canonical version of the page and should be indexed.

To discover the canonical URL of a webpage, paste the **webpage URL** into Google Search Console, as shown below.

![Inspect URL in Google Search Console](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%201194'%3E%3C/svg%3E)

Once done, click on **Page Indexing**and scroll down to **Google-selected canonical**,****as shown below. The term, **Inspected URL** indicates the URL you pasted in the Search Console is the canonical URL.

![Google selected canonical](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%201316'%3E%3C/svg%3E)

## 3  How to Fix the “Alternate Page with Proper Canonical Tag” Status Message

### 3.1  Update the Canonical URL in Rank Math

The first step is to find the duplicate pages on your site. To do this, navigate to the **Pages** section of Google Search Console and click on the **Not indexed**tab.

![Not indexed](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20902'%3E%3C/svg%3E)

Then, click on the “Alternate page with proper canonical tag” status.

![Alternate page with proper canonical tag ](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202136%202524'%3E%3C/svg%3E)

This will show you a list of all the pages on your website that are labelled with this status.

![list of the affected pages](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202000%201087'%3E%3C/svg%3E)

Once you have a list of the affected pages in Google Search Console or the [Index Status tab of Rank Math](https://rankmath.com/kb/url-inspection-api-integration/), you need to check if they include the correct canonical URL. If not, you would need to change them using Rank Math. But note that you can only see the index status here if you’re a Rank Math PRO user.

![Index Status - Alternate page with proper canonical tag](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202452%20590'%3E%3C/svg%3E)

The best thing is that the Rank Math SEO WordPress plugin makes it easy to [change the canonical URL](https://rankmath.com/kb/how-to-change-canonical-url/) using the meta box (as pictured below).

By default, Rank Math uses the current post/page URL as the canonical URL, so you would only need to alter this setting if you wish to change it to something else. This is also known as a _self-referencing canonical_.

![Rank Math meta box](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201922%201130'%3E%3C/svg%3E)

**Note:** If you cannot find the Advanced tab, please [enable the Advanced Mode](https://rankmath.com/kb/switch-from-easy-to-advanced-mode/) from **WordPress Dashboard → Rank Math SEO**.

![enable Advanced Mode](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20934'%3E%3C/svg%3E)

In the Advanced tab in Rank Math meta box, you can change the Canonical URL field to point to the main source of your content. The Canonical URL informs the search crawlers of the main page if you have pages or posts with similar content.

The below screenshot is for reference only.

![canonical-url](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20925%20322'%3E%3C/svg%3E)

Once you’re done setting your Canonical URL – simply update the page as you normally would after making a change or click **Publish**if it is a newly created page.

On the other hand, if you don’t use WordPress, you may need to reach out to your Content Management System for information on how they handle canonical URLs.__

If you use a custom-built website, you can add the canonical tag directly to the head element of the webpage. To do so, copy the below code snippet, replace `https://rankmath.com/canonical-url` with your canonical URL, and paste it into the head tag of the page.

`<link rel="canonical" href="https://rankmath.com/canonical-url/">`

### 3.2  **Use 301 Redirects**

You should only add canonical URLs to the duplicate pages you want to keep. If you don’t want a page to appear on your site anymore, you should use a **301 redirect** instead. You can refer to this knowledgebase article on setting up [single and multiple 301 redirects in Rank Math](https://rankmath.com/blog/bulk-301-redirects-wordpress/).

We hope this article helped you learn what the “Alternate Page with Proper Canonical Tag” status message in Google Search Console means and how to fix it. If you still have absolutely any questions, please feel free to reach our [support team](https://rankmath.com/support/) directly from here, and we’re always here to help.

			

			 

			
	
		
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