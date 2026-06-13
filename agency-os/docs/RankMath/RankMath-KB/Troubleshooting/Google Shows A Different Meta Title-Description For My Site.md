# Google Shows A Different Meta Title/Description For My Site

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/different-meta-title-and-description/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Google Shows A Different Meta Title/Description For My Site

			
			

	

[Rank Math](https://rankmath.com/wordpress/plugin/seo-suite/) makes it easier than ever to write the perfect meta title and descriptions for your blog posts, pages, and other custom post types. But as you might’ve already noticed & is becoming more common, Google (as well as other search engines) often choose not to simply use the meta description you’ve set.

![Why Does Google Show a Different Title/Meta Description in the SERPs? Rank Math SEO](https://img.youtube.com/vi/J3vC2FBVhUw/maxresdefault.jpg)
__

In this article, we’ll cover why this might be the case & how to check.

## Table of Contents

- [Check What You Have Set Using Rank Math](#check-rankmath)

- [Ensure Your Schema Settings Are Valid](#schema-settings)

- [Check the Title/Description Set in the Page’s Source Code](#title-description-in-source-code)

- [The Latest Version of Your Page Hasn’t Been Indexed](#page-not-indexed)

- [Why Google Might Choose Not to Use Your Meta Description](#meta-description-rewrites)

- [Why Google Might Choose Not to Use Your Title](#page-title-rewrites)

## 1  Check What You Have Set Using Rank Math

To begin with, it’s important to check if you’ve already changed the SEO Meta Title & Description with the help of the [Rank Math WordPress SEO plugin](https://rankmath.com/wordpress/plugin/seo-suite/). Here’s how to do so if you’re using the Classic Editor:

![Editing Meta Title and Description using Classic Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20808%20690'%3E%3C/svg%3E)

And, this is how you add a title and description in **Gutenberg**:

![Editing Meta Title and Description in Gutenberg](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%201487'%3E%3C/svg%3E)

## 2  Ensure Your Schema Settings Are Valid

Next, make sure that the settings shown below (in Rank Math’s Schema tab) for the post or page you’re referring to are as follows:

![schema-settings-meta-description-title](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202402%201526'%3E%3C/svg%3E)

That is, the **Headline** in the Schema Builder itself must show **%seo_title%** and the **Description** should show **%seo_description%**. This will ensure that your SEO title and SEO Description that you have set up via Rank Math are also used for this page’s structured data.

## 3  Check the Title/Description Set in the Page’s Source Code

Then proceed to check if your title/description has been set up properly in the page source. This can be done by right-clicking on your page and clicking **View page source** in the menu that appears.

![Check the Title and Meta description set in the page's source code](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201596%20976'%3E%3C/svg%3E)

As an alternative – instead of viewing your page source using the method described above, you can also use this [online tool](https://www.heymeta.com/).

## 4  The Latest Version of Your Page Hasn’t Been Indexed

Once you’ve confirmed that the meta description is correctly set in your page’s source code, the next step is to ensure it’s reflected in Google’s search results. The best way to verify this is by using the URL Inspection Tool in Google Search Console.

To begin, log in to [Google Search Console](https://search.google.com/search-console/) and go to the **URL inspection** section. Enter your page’s URL and hit **Enter**. You’ll see a detailed report showing how Google views your page

![Inspect URL on GSC](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20430'%3E%3C/svg%3E)

In the report, expand the **Page Indexing** section using the dropdown arrow. Here, you’ll find the **Last Crawl**date, as highlighted below.

![View Google's last crawl date on GSC](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20838'%3E%3C/svg%3E)

If the date is before your changes, it means Google hasn’t updated its index yet. To fix this quickly, click the **REQUEST INDEXING**option to ask Google to re-crawl and update your page.

Now that you’ve verified everything, it’s still possible that Google may choose to display a different meta title or description for your search keyword. Unfortunately, this is beyond your control, as Google sometimes overrides custom meta information to show content that it considers more relevant to the [search intent](https://rankmath.com/seo-glossary/search-intent/).

Next, we’ll discuss why Google might make this change and how it determines which meta information to display.

## 5  Why Google Might Choose Not to Use Your Meta Description

Since the description acts as a preview for the user on how best the page is relevant to the search query, Google might change the description for different search queries.

At the end of the day, as you’ll come to realize, this is the case in the industry – search engines choose what they display. Given that this process takes place automatically, behind the scenes at Google – there is little that we (or you) can do to ensure that Google does, in fact, use the meta description you’ve written.

That being said, here are some of the most common reasons Google might not use the meta description you’ve provided:

- The meta description is not relevant or useful or lacks quality (ie, just a collection of keywords).

- The exact same meta description is provided across a large number of pages.

- The meta description doesn’t match what the user is searching for, but other content on the page does.

In the past, Google has also made various suggestions with regard to how to [avoid meta description rewrites](https://www.searchenginejournal.com/google-offers-suggestions-for-avoiding-meta-description-rewrites/359884/#close)…

## 6  Why Google Might Choose Not to Use Your Title

The title of a search result (_also known as_the _title link_) is a critical element, as users get to know how relevant the search result is for the query and get to decide whether to click the result or not.

Google uses a number of signals to determine the title that will be shown to users, while the Title tag being the most preferred. But for some pages, Google’s algorithms would [generate alternative titles](https://developers.google.com/search/blog/2012/01/better-page-titles-in-search-results) to help users recognize relevant pages.

Let’s take a look at an example where Google is dynamically changing the title depending on the search terms used by searchers.

Here, the keyword used is “mythemeshop keyword research”. As you’d expect, Google correctly shows MyThemeShop’s keyword research guide as the first result.

![Keyword Research example](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201406%20564'%3E%3C/svg%3E)

Now, if we repeat this search with the terms “mythemeshop keyword research guide,” – you’ll notice that the title of the exact same page shown by Google has changed this time:

![Keyword Research guide example](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201442%20572'%3E%3C/svg%3E)

Google tries to adjust the title according to the search intent, but other causes could [trigger the search engine to rewrite titles](https://developers.google.com/search/docs/advanced/appearance/good-titles-snippets#why-the-search-result-title-might-differ-from-the-pages-title-tag), such as:

- The page does not specify a descriptive title or title tag

- The website has several pages sharing the same title or only with minor variations

- The title is being stuffed with keywords, making it less useful for searchers

- The page might include a title that is unnecessarily long and hard to read

- The search crawlers are blocked from crawling the page [using robots.txt](https://rankmath.com/kb/how-to-edit-robots-txt-with-rank-math/); hence, Google would use the anchor text linking to the page to determine titles

If your pages fall into any of the above cases, fixing them could help reduce the chances of page title rewrites. But at the end of the day, it is at the complete discretion of Google to display the title you’ve provided.

And Google believes, at times, alternative text provided on your page might be more relevant & useful, and they might prefer to use it instead of the provided title. Having said that, Google has also [provided the sources](https://developers.google.com/search/docs/advanced/appearance/title-link#how-title-links-in-google-search-are-created) they would use for generating alternative titles:

- Content in `<title>` elements

- Main visual title or headline shown on a page

- Heading elements, such as `<h1>` elements

- Content in og:title meta tags

- Other content that’s large and prominent through the use of style treatments

- Other text contained on the page

- Anchor text on the page

- Text within links that point to the page

- [`WebSite` structured data](https://rankmath.com/kb/website-schema/)

If you feel the alternative title provided isn’t a better fit over your title, you can always let Google know through their [Search Help Community](https://support.google.com/webmasters/community).

That’s it! We hope the article helped you understand why Google might not be showing your title or meta description. If you still have any questions, please feel free to [reach our support team directly from here.](https://rankmath.com/support/) We’re always here to help.

			

			 

			
	
		
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