# Discovered – Currently Not Indexed in Google Search Console

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/discovered-currently-not-indexed/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Discovered – Currently Not Indexed in Google Search Console

			
			

	

If you’re a website owner, you probably want your site to show up in Google search results. After all, what’s the point of having a website if no one can find it?

Unfortunately, sometimes things can go wrong, and your site might not appear in Google search results even though you’ve done everything right. One potential reason is that your website pages have been marked as “Discovered – currently not indexed” in Google Search Console.

![Discovered - currently not indexed - Google Search Console status](https://rankmath.com/wp-content/uploads/2022/04/Discovered-currently-not-indexed-Google-Search-Console-status.png)

Don’t worry, though! In this knowledgebase article, we’ll explain what this message means and give you some tips on how to fix it.

![[Solved] Discovered / Crawled - Currently Not Indexed Issue in Google Search Console](https://img.youtube.com/vi/S5hcOZmslBw/maxresdefault.jpg)
__

    
## Table Of Contents

    

        
- [What Does “Discovered – Currently Not Indexed” Mean?](#error)
        
- [How to Fix Discovered-Currently Not Indexed Status?](#how-to)
            

                
- [Ensure Your Robots.txt Rules Allow Your Website to Be Indexed](#robots-txt-rules)

- [Checking the Quality of Your Content](#content-quality)
                
- [Poor Internal Link Structure](#internal-link-structure)
                
- [Content Duplication Issues](#content-duplication)
                
- [Your Website Is New](#new-website)
                
- [Check If Your Website Is Blocked By Google](#website-blocked-by-google)
                 
- [Crawl Budget Issues](#website-blocked-by-google)
      
    

## 1  What Does “Discovered – Currently Not Indexed” Mean?

The message “discovered – currently not indexed” in Google Search Console or the Index Status tab of Rank Math means that Google has found your website but hasn’t added it to its search index.

![Discovered currently not indexed - index status](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202488%20898'%3E%3C/svg%3E)

This isn’t necessarily a bad thing. It can just mean that Google needs some time to process your website and add it to the search index.

If you’re seeing this message, you first should check how many pages of your website are affected. There’s probably no need to worry if it’s just a few pages. Google will likely index those pages soon.

However, if a large number of pages are affected, it could signify a problem with your website. In that case, you’ll need to take some action to fix the issue.

Here’s what John Mueller from Google says about this status:

> Discovered – currently not indexed: The page was found by Google, but not crawled yet. Typically, Google tried to crawl the URL but the site was overloaded; therefore Google had to reschedule the crawl. This is why the last crawl date is empty on the report.

In Google Search Central SEO Office Hours – https://youtu.be/kvYb2bdtT7A

## 2  How to Fix Discovered-Currently Not Indexed Status?

If your website is showing up as “discovered – currently not indexed” in Google Search Console, there are a few things you can do to try to fix the problem:

### 2.1  Ensure Your Robots.txt Rules Allow Your Website to Be Indexed

Another potential problem is your robots.txt file. This file tells Google which pages on your website it should and shouldn’t crawl. If you’ve accidentally blocked Google from crawling your website, that could explain why your site isn’t being indexed.

The Disallow tag (in your website’s robots.txt file) blocks Google from crawling all the pages on your site. You can [check for the disallow tag](https://rankmath.com/tools/robots-txt/) and ensure no such tag in the robots.txt prevents your page from being indexed.

If there is a disallow tag, then change that using the robots.txt editor in Rank Math at **WordPress Dashboard → Rank Math SEO → General Settings → Edit robots.txt**.

![Edit robots.txt in Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202350%201250'%3E%3C/svg%3E)

**Related:** Learn more about [Robots.txt files and how they work](https://rankmath.com/kb/how-to-edit-robots-txt-with-rank-math/).

### 2.2  Checking the Quality of Your Content

While Google discovers many web pages, it doesn’t add all of them to its search index. It prioritizes valuable and informative content for users.

Since Google hasn’t crawled the pages marked “Discovered—Currently Not Indexed” yet, it can’t definitively judge their quality. However, based on similar content, it has crawled, so it might prioritize other pages first.

Here are some content characteristics that could lead to Google delaying the indexing process:

- **Low Content Value:** Pages with minimal unique content or that don’t offer a clear benefit to users might be deprioritized.

- **Automatically Generated Content:** Content created entirely by machines, like spun content or some AI-generated content, often lacks the depth and originality Google seeks. While these tools are developing, human involvement remains crucial for crafting content that truly engages users.

- **Poor translation:** Machine translations can result in grammatically incorrect or imperfect content, which can be less helpful for searchers.

If any of these issues apply to your content, consider the following steps:

- Merge thin content with other related content to create more comprehensive and valuable pages.

- Improve the [overall quality of your content](https://rankmath.com/blog/how-to-write-a-blog-post/).

- Use [the `noindex` tag for content](https://rankmath.com/kb/how-to-noindex-urls/) that is not intended for organic search, allowing search engines to focus on more important pages.

### 2.3  Poor Internal Link Structure

If your website has a poor internal link structure, that could be why Google isn’t indexing your site. Internal links are links from one page on your website to another page on your website.

A good internal link structure is important because it helps Google understand the relationship between different pages on your website. It also helps Google crawl your website more efficiently.

Rank Math checks your post/page in real time and notifies you if your post/page does not have any internal links. The following types of links qualify for this test:

- Links to other posts/pages on your website

- Links to other subdomains on your main domain

- Links to the main domain from a sub-domain

To build internal links, you can [set your important pages as pillar content](https://rankmath.com/kb/pillar-content-internal-linking/) and let Rank Math suggest relevant internal links.

![Pillar content](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201848%20398'%3E%3C/svg%3E)

### 2.4  Content Duplication Issues

Another potential reason for your website not being indexed is content duplication. To resolve this issue, you need to check if the pages you’re trying to index have any duplication on your website. If you find any, [add a canonical URL from these duplicate pages](https://rankmath.com/kb/how-to-change-canonical-url/), pointing to the original content you want to index.

![Canonical URL](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20592%20206'%3E%3C/svg%3E)

### 2.5  Your Website Is New

If your website is brand new, it’s not unusual for some pages to be marked as “discovered – currently not indexed.” It can take Google a little while to find and index all the pages on your site.

If your website is fairly new (less than a few months old), the best thing you can do is be patient. Google will eventually index all the pages on your site.

Even without customizing your website with any webmaster tools, Rank Math’s [Instant Indexing](https://rankmath.com/kb/how-to-use-indexnow/)enables you to submit your URLs to IndexNow-enabled search engines and helps index your website and its content.

**Rank Math PRO** users can submit URLs directly through Instant Indexing for the below statuses.

![Filter by status reasons](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202506%20860'%3E%3C/svg%3E)

### 2.6  Check If Your Website Is Blocked By Google

If you’ve been penalized by Google, that could explain why your website isn’t being indexed. The best way to check if your website has been penalized is to search for your website on Google. If you don’t see your website anywhere in the search results, your website will likely be penalized. If your website is penalized, you’ll need to fix the problem that caused the penalty before Google indexes your site.

### 2.7  Crawl Budget Issues

Crawl budget is another possible cause of the Discovered- Currently Not Indexed message. We all know that Google has limited resources to crawl all pages around the web, and it prioritizes spending the resources on the most important pages of your site.

However, if Google crawls all the URLs from your site, including low-quality pages, you risk your valuable pages not being crawled enough. Crawl budget issues mostly affected larger sites, and due to some technical glitches and mistakes, they also affected small sites.

Let’s take a look at how the crawl budget issues occur and how to fix the crawl budget issue.

#### 2.7.1  Orphan Pages

A good internal linking structure enhances the crawlability of your website, and no internal links for a page make it an [orphan page](https://rankmath.com/blog/orphan-pages/) to Google. An orphan page that provides valuable information should be crawled and indexed, and you can do it by adding internal links.

#### 2.7.2  Internal No-follow Links

Keep an eye on your internal links attribute. The no-follow link will allow indexing of the page but the no-follow internal link to Google presents that your page is not important at all.

And that’s it! We hope the article helped you fix the error and if you still have absolutely any questions, please feel free to reach our [support team directly from here](https://rankmath.com/support/); we’re always here to help.

			

			 

			
	
		
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