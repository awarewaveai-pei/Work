# Why Google Hasn’t Indexed Your Post, Page, and/or Website?

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/google-index/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Why Google Hasn’t Indexed Your Post, Page, and/or Website?

			
			

	

Does it feel like you have done everything right, yet your website still isn’t showing up in search results?

If you want your site to show up in the search results, then it has to be **indexed**. However, you do not want your site to be indexed just once – you want to make sure that search engines can recrawl and continuously index the pages of your website (including new ones you publish).

Well, search engines like Google don’t always instantly update their index to reflect actual changes on websites. As a matter of fact, Google might take days or even weeks to index your site. Simply put, it is absolutely normal for a newly published post/page/website to take some time before it gets crawled or indexed by Google.

There are various factors that Google considers while indexing. Your frequency of posting and your site’s domain authority are just two of the many factors Google considers when indexing new web pages.

Google assigns a crawl budget to your website depending on these factors (especially these two), and that has a direct effect on how soon (i.e. how efficiently) your content can be indexed.

Also, we have found that barring any issues like copied/DMCA/low-quality content issues – Google usually indexes posts within a week or two. So, we request you to kindly wait, as this is something they have confirmed in an [official statement](https://support.google.com/webmasters/answer/7552505#missing-jobshttps://support.google.com/webmasters/answer/7552505#missing-jobs) on their support website.

    
## Table of Contents

    

        
- [Why Is My Website Not Showing up in Google Search?](#website-not-showing-in-google-search)
            

                
- [Double Check That Your URL Definitely Hasn’t Been Indexed](#double-check-url-indexed)
                
- [Ensure Your Post, Page & Website Do Not Have The Noindex Attribute Present](#noindex-attribute)
                
- [Check Your WordPress Global Settings](#wordpress-global-settings)
                
- [Ensure Your Robots.txt Rules Allow Your Website To Be Indexed](#robots.txt)
                
- [Check If Your Pages Are Crawled But Not Indexed](#crawled-currently-not-indexed)
        
- [Manual Indexing Request](#manual-indexing-request)
    

## Why Is My Website Not Showing Up In Google Search?

To get started, here’s a list of things to start checking to ensure there’s nothing preventing Google from indexing your entire website or a specific webpage on your site:

### 1  Double Check That Your URL Definitely Hasn’t Been Indexed

Before we dive in, it’s important to check whether or not your webpage actually isn’t indexed or just isn’t ranking for the search terms you’re checking for.

![Bing Indexing API](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201742%20636'%3E%3C/svg%3E)

There is a distinct difference, and one quick way of checking this is shown in the image above. Simply enter the URL of the page you want to check in Google search, and in this case, the URL entered is clearly indexed.

Fortunately, Rank Math has made it extremely easy to take advantage of the [Google Instant Indexing API](https://rankmath.com/blog/google-indexing-api/) as well as the [Bing Instant Indexing / URL Submission API](https://rankmath.com/blog/bing-indexing-api/) – meaning that once configured, you no longer need to worry about getting search engines to crawl & re-crawl your URLs as soon as you publish or update them.

### 2  Ensure Your Post, Page & Website DO Not Have The Noindex Attribute Present

There is a possibility that even a small-overlooked detail can leave a big impact.

**Googlebot visits a site in order to determine which pages are either index or no-index.** In other words, It informs the search engines about the pages that they can visit and the pages that they can’t visit.

You need to ensure that you haven’t set your posts, pages, or entire website to **noindex,** as this would prevent search engines from indexing your website.

![Check if page is set with index or noindex](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201434%20856'%3E%3C/svg%3E)

### 3  Check Your WordPress Global Settings

If there is noindex, then check the global settings at **WordPress Dashboard → Rank Math SEO → Titles & Meta → Posts/Pages/Products/CPTs.**

Also, ensure the **_Discourage Search engines…_** option is **not** enabled at **WordPress Dashboard → Settings → Reading**

![Ensure Search Engine Visibility option is unchecked](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202004%20628'%3E%3C/svg%3E)

A lot of web developers choose the above option to prevent Google from indexing a site during the development process (on staging websites) but forget to remove it before publishing.

### 4  Ensure Your Robots.txt Rules Allow Your Website To Be Indexed

The Disallow tag (in your website’s robots.txt file) blocks Google from crawling all the pages on your site. You can [check for the disallow tag](https://rankmath.com/tools/robots-txt/) and make sure that there is no such tag present in the robots.txt that is preventing your page from being indexed.

If there is a disallow tag, then change that using robots.txt editor in Rank Math at **WordPress Dashboard → Rank Math SEO → General Settings → Edit Robots.txt**

![Edit robots.txt](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202350%201250'%3E%3C/svg%3E)

**Related:**If you want to learn even more about Robots.txt files and how they work, [ContentKing’s extensive guide on Robots.txt files](https://www.contentkingapp.com/academy/robotstxt/?utm_source=Rank+Math#wordpress) is an excellent read.

### 5  Check If Your Pages Are Crawled But Not Indexed

Your Google Search Console account can give you more reasons why your content is not indexed. You can run a search for your URL in the URL Inspection Tool to find out the reason for your URL not being indexed, and one such reason/error that you might discover is **Crawled – currently not indexed**.

![Crawled - currently not indexed](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20964%20926'%3E%3C/svg%3E)

The error simply means that Google has crawled your URL but decided not to index it. There could be a [number of reasons](https://rankmath.com/kb/crawled-currently-not-indexed/) why the search engine has decided to do so.

Google’s John Mueller states that this could be more of a site-wide issue, not limited to the specific page, and recommends improving the structure & overall quality of your website.

https://twitter.com/JohnMu/status/1409567136322838530

To simply put, for a page to be indexed, the page (and website) needs to pass quality checks. Since Google has not disclosed anything specific they look for while indexing, you must consider evaluating your website against well-known quality factors like,

**Internal linking structure**: If you’re trying to index an important page, make sure they have internal links from relevant pages on your website. To start building internal links, you can [set your important pages as pillar content](https://rankmath.com/kb/pillar-content-internal-linking/) and let Rank Math suggest relevant internal links.

**Content duplication**: Check if the pages you’re trying to index have any duplication on your website. In case, if you find any, [add a canonical URL from these duplicate pages](https://rankmath.com/kb/how-to-change-canonical-url/), pointing to the original content that you want to index.

## Manual Indexing Request

If you’ve checked all of the above, but your website still hasn’t been indexed even weeks after trying – we recommend submitting a [manual indexing request](https://support.google.com/webmasters/answer/9012289).

However, it is important to note that [John Mueller from Google](https://www.seroundtable.com/google-manually-index-site-quality-28942.html) has stated that _if your website relies on manual index submission for normal content, this is a sign that you need to significantly improve your website. The Google Search Console can’t fix your site, you need to do that yourself_.

With that being said, in terms of the next steps that you can take – here’s a good article from the team over at Ahrefs on how to ensure that your [website gets indexed regularly](https://ahrefs.com/blog/google-index/).

That’s it! If you’re still having any trouble indexing your content, feel free to [reach our support team directly from here](https://rankmath.com/support/), and we’re always here to help.

			

			 

			
	
		
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