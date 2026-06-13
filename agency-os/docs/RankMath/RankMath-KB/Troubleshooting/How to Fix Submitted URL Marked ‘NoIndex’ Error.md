# How to Fix Submitted URL Marked ‘NoIndex’ Error

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/error-submitted-url-marked-noindex/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Fix Submitted URL Marked ‘NoIndex’ Error

			
			

	

In this knowledgebase article, we’ll discuss how to fix the **Submitted URL marked ‘noindex’** error that appears in the Google Search Console.

## Table of Contents

- [What Does This Error Mean?](#error-meaning)

- [Check Whether URLs Have Been Marked as ‘Noindex’](#check-url-for-noindex)

- [Page URL Set to NoIndex Correctly](#noindex-set-correctly)

- [Page URL Set to NoIndex Incorrectly](#noindex-set-incorrectly)

- [Final Words – Validate Fix in Google Search Console](#validate-fix)

## 1  What Does This Error Mean?

![Submitted URL marked noindex error](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201048%20628'%3E%3C/svg%3E)

If you’re seeing this error in your Google Search Console Coverage section or when you inspect a URL, then it simply means that Google attempted to index the page but wasn’t able to do so.

Why? Well, for starters – the URL was considered “submitted” which means that it was listed in your sitemap, but there is also something present on the page that indicates to Googlebot it should not index the page. This could be a simple **noindex**meta tag (_which would be present in the page’s HTML_).

As a result, the page will not show in the search results, so if that’s intentional & you don’t want the page to appear in search, then this is considered a non-issue. But still, you’d need to figure out why a noindex URL is present in your current sitemap.

On the other hand, if this page should be indexed, you’re losing potential search traffic. Either way, you’d need to dig into this issue to eliminate the error, and the following steps will help you with it.

## 2  Check Whether URLs Have Been Marked as ‘Noindex’

First, open the page source of the URL that has been classified by this error. And then, check whether the page’s header includes the “noindex” robots meta tag, as shown below.

![Noindex present in page's source code](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201726%201012'%3E%3C/svg%3E)

Once you confirm the page includes a noindex meta tag, you need to identify if the page is marked with a noindex meta tag correctly or incorrectly. Based on that, you can follow the relevant steps discussed below.

## 3  Page URL Set to NoIndex Correctly

If your page URL is set to noindex correctly, but you’re still seeing this error, then it is likely Google hasn’t crawled your page/sitemap since the changes were made.

### 3.1  Check if Sitemap is Accessible

So you should be checking if Google is able to access your website’s sitemap. Head over to your website’s sitemap and check if it is accessible. You can also [make use of this tool](https://httpstatus.io/) to check if your sitemap is accessible or if it is throwing an error. If your sitemap returns a 404 error, you can refer to [our tutorial to fix this](https://rankmath.com/kb/sitemap-404-error/).

![Check if sitemap is accessible with the httpstatus tool](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201280%20663'%3E%3C/svg%3E)

If your sitemap is not accessible for any other reason, you should be able to figure it out by now, so you can sort it out accordingly.

### 3.2  Check if Sitemap is Cached

It is also possible that your sitemap is being cached, which would have affected any recent changes reflected in the sitemap. You can refer to our dedicated knowledgebase tutorial to [exclude your sitemap from caching](https://rankmath.com/kb/exclude-sitemaps-from-caching/).

### 3.3  Resubmit Your Sitemap in Google Search Console

Once you’ve fixed the issue with your sitemap, remove your sitemap from Google Search Console and then [submit it once again as described in this tutorial](https://rankmath.com/kb/submit-sitemap-to-google/).

![Submit sitemap to Google Search Console](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20990%20231'%3E%3C/svg%3E)

## 4  Page URL Set to NoIndex Incorrectly

If your page has been set with noindex incorrectly, then you should change Rank Math’s settings to add the index robots meta tag.

### 4.1  Check Rank Math Metabox

Start by opening the post/page/taxonomy term in the WordPress Editor. In the case of Gutenberg Editor, click the **Rank Math SEO icon** in the top-right corner of the page to open the Rank Math Metabox.

![Click the Rank Math SEO icon in Gutenberg](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201030%20758'%3E%3C/svg%3E)

For Classic Editor and taxonomy terms, scroll down to the bottom of the page to find the Rank Math Metabox.

![Rank Math Meta Box in Classic Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201585%201290'%3E%3C/svg%3E)

If the Rank Math Metabox is unavailable for you, then ensure that you’ve enabled **Add SEO Controls** from **Rank Math SEO →** **Titles & Meta Settings**→**Posts** (_or other relevant sections_).

In the Rank Math Metabox that appears on the screen, choose **Advanced Tab**. If the Advanced Tab is unavailable for you, then ensure you’ve [switched to the Advanced Mode](https://rankmath.com/kb/switch-from-easy-to-advanced-mode/) in Rank Math. If the Robots Meta is set with No Index, then simply select the **Index** checkbox, as shown below, and update the page.

![Set Robots Meta to index in Rank Math Metabox](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201110%20982'%3E%3C/svg%3E)

### 4.2  Check Rank Math’s Titles & Meta Settings

While the previous step lets you modify the noindex meta tag for the specific posts, you should still confirm the noindex wasn’t set as a default value in your Titles & Meta settings.

So navigate to **WordPress Dashboard → Rank Math SEO → Titles & Meta**. Then check each tab and ensure that the settings are as per your preference.

If the posts and taxonomies set as “noindex” are as per your preference, you can ignore them. Or, if you consider these pages add more value to your visitors and need to be indexed, then you can index these pages by selecting the respective “Index” Robots Meta tag as shown below.

![Index tags](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20826%20336'%3E%3C/svg%3E)

**Note**: It’s still a good choice to have certain links set to noindex, especially for “Misc. Pages”, “Authors”, “Tags” and [empty archive pages](https://rankmath.com/kb/titles-and-meta/#noindex-empty-category-and-tag-archives). Ideally, you don’t want them to be indexable because it might create duplicate or thin content issues and dilute your website’s authority.

Once you have made the changes, don’t forget to click the **Save Changes** button at the bottom of the page for the changes to reflect.

With that said, these changes will **only reflect in your upcoming posts and not the existing ones**. So, if you have existing posts set with noindex incorrectly, you can change them to Index with the Metabox as discussed in the previous step or use the bulk actions to make changes for a number of posts in one go.

### 4.3  Removing NoIndex with Bulk Actions [PRO](https://rankmath.com/pricing/)

If you have a number of posts on your website accidentally being set to noindex, then you can make use of our bulk actions feature to set them to index. Here is how to do that.

Head over to the WordPress Posts menu, and from the Rank Math filter that appears on the top-right of the screen, choose **Articles Noindexed**. And then click the **Filter** option as shown below.

![Filter by noindexed articles in Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202544%20992'%3E%3C/svg%3E)

Now all your articles set with noindex will be filtered. You can select the checkbox appearing at the top to select all your posts. In case you want to select/unselect specific posts, the checkbox appearing before the posts will help you with it.

![Select noindexed articles from the Posts screen](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20823'%3E%3C/svg%3E)

Then from the bulk actions drop-down, choose **Set to Index**. And then click **Apply**.

![Set to Index using Bulk Actions](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201414%20896'%3E%3C/svg%3E)

Now all your selected posts will be set to Index.

![Robots Meta changed success notice](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201000%20290'%3E%3C/svg%3E)

Once you’ve made the changes, you can check your page’s source code to see if the noindex meta tag has been removed.

**Note:** It is also possible to edit the Robots Meta of your posts and pages in bulk (_and also to collaborate with your team_) using the Import and Export CSV feature of Rank Math. You can refer to [its dedicated KB](https://rankmath.com/kb/editing-seo-meta-at-scale/).

### 4.4  Search Engine Visibility

In addition to the above steps, make sure that the **Search engine visibility** option is unchecked in WordPress. For that navigate to the left side of the **WordPress admin dashboard** → **Settings** → **Reading.**

![Search engine visibility test from settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201729%20564'%3E%3C/svg%3E)

If this option is checked, then even if Rank Math options are set to Index, the website as a whole will be marked as NoIndex. It may discourage search engines from indexing all web pages even if you have got good content and relevant keywords.

## 5  Final Words – Validate Fix in Google Search Console

Finally, ensure that your sitemap is updated. Then you can head over to your Google Search Console and choose the **Validate Fix** option to let the search engine know about the error being resolved. Then you can wait until Google crawls your website and removes the error notice in your search console, which might take a week or two.

![Validate fix for submitted URL marked noindex error](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20946%20263'%3E%3C/svg%3E)

And that’s it! If you still have any questions about this error & how to resolve it – you’re always more than welcome to [contact our dedicated support team](https://rankmath.com/support/), and we’re available 24/7, 365 days a year, to help you.

			

			 

			
	
		
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