# How to Remove Date Snippets from Search Results

> **Category:** Schema
> **Source:** https://rankmath.com/kb/remove-dates-from-search/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Remove Date Snippets from Search Results

			
			

	

Google and other search engines may feature dates for your site in search engine results pages – especially if it is time-sensitive content, including news articles and pages where it really makes sense. The date featured in the SERP could either be the published date or the last updated date of the page and it would look something like this:

![Date snippets in search results](https://rankmath.com/wp-content/uploads/2021/04/Rank-Math-SERP-w.png)

Depending on how recent (or _fresh_) your content is as well as a whole range of other factors including search intent – the presence of dates in SERPs can either increase or decrease the CTR to your site.

## Table of Contents

- [How Google Picks the Date?](#how-google-find-date)

- [Why Google Displays the Wrong Date](#why-google-displays-wrong-date)

- [Can an SEO Plugin Add/Remove Dates from SERPs?](#can-seo-plugin-remove-dates)

- [Removing Dates from SERPs](#removing-dates-from-serps)

- [How Long Does It Take for Search Engine to Update the SERPs?](#time-for-update-on-serps)

## 1  How Google Picks the Date?

According to this [Google Search Central](https://developers.google.com/search/blog/2019/03/help-google-search-know-best-date-for) article, Google uses two methods to determine the dates your article was published or updated.

- The first is the visible date in the content.

- The other is the date in your structured data.

Google actually requires you to specify and ensure those dates are included in your content.

![How Google picks date on a page](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20787%20251'%3E%3C/svg%3E)

However, adding a visible date and using structured data are only recommendations, and Google hasn’t given a definitive, single answer for how they pick a date. As we mentioned in this [knowledgebase article](https://rankmath.com/kb/changing-publish-date-and-time-wordpress/), Google can find the dates you published and modified an article even if you don’t use structured data or include them in the article.

## 2  Why Google May Display the Wrong Date

We have received many tickets on our support forum from our users, who complained about search engines mixing their dates up and displaying the published date instead of the last modified date in search results.

While the published date could go years back, the article may have been recently modified. When search engines display the published date, they can give the visitors the impression that the article is outdated and will cause the publisher to lose traffic.

According to Google’s [John Mueller](https://twitter.com/JohnMu/status/1381707317742350340), Google gathers the dates in your content and then displays the one it thinks is most accurate. If it cannot determine which of the dates is correct, then it will guess.

You can resolve this issue by removing the published date from your content and structured data. That way, only your last modified and updated dates will be available to Google.

## 3  Can an SEO Plugin Add/Remove Dates From SERPs?

As you might be aware by now, Google picks and shows the dates that they see in the content itself. And this is something an SEO plugin cannot control. Therefore it is not possible for Rank Math (or any other SEO plugin) to add or remove dates from search engine results pages for your website.

## 4  Removing Dates From SERPs

As mentioned, search engines do not allow you to remove your dates from search results.

However, you can work around this by removing your dates from the places search engines look for them. If search engines cannot find your dates, they cannot display them in search results.

### 4.1  Remove Dates in the Content

The first step is to remove the dates in the content. These dates may be added by:

- You

- WordPress

- Your WordPress theme

- A time and date plugin

- A comment plugin

#### 4.1.1  How to Remove the Date You Added to Your Content

The process of removing the date you added to your content is straightforward. You only need to edit the affected posts/pages and delete the date.

You should also delete every date within the content, even if it is unrelated to the date the article was published, updated, or modified.

#### 4.1.2  How to Remove the Date Added by WordPress

Depending on your settings, WordPress can add a date to your posts and URLs. You can refer to this guide on [removing the date from WordPress posts and URLs](https://rankmath.com/blog/remove-the-date-from-wordpress-post/).

#### 4.1.3  How to Remove the Dates Added by Your WordPress Theme or Date Plugin

Some WordPress themes and plugins can add a date to your content.

You can resolve this by checking if the theme or plugin settings contain an option to remove the dates. If the option is unavailable, you should contact the theme or plugin developer for support.

#### 4.1.4  How to Remove the Dates Added by Your Comment Plugin

Google can pick a date from your comments and display it as your published date.

You can prevent this by editing or deleting comments that contain a date. You will also disable your comment boxes from showing the date they were published.

You can check the plugin settings for the option to remove the comment published dates from being displayed. If you are unable to find the option, you should contact your comment plugin developer for support.

### 4.2  Remove Dates in the Structured Data

The `datePublished` and `dateModified` properties in your structured data contain the date your article was published and last modified. Search engines will access these properties to detect the dates to display on your post.

If Rank Math is installed, you can use the below filter to remove the date properties from your structured data. You can refer to this knowledgebase article on [adding filters to your website](https://rankmath.com/kb/wordpress-hooks-actions-filters/).

**Note:** Google requires you to display a date in your structured data if you use the JobPosting Schema Type or publish a news article for Google News

```
add_filter( "rank_math/snippet/rich_snippet_article_entity", function( $entity ) {
  unset( $entity['dateModified'] );
  unset( $entity['datePublished'] );
  return $entity;
});
```

### 4.3  Remove Dates in the Open Graph Metadata

The `article:published_time`, `article:modified_time`, and `og:updated_time`****properties in your Open Graph metadata contain the dates your article was published, last modified, and last updated.

While the Open Graph metadata is intended for social media and instant messaging apps, search engines can access and use it to find the date to display on your article. If you have Rank Math installed, use the below filter to remove the date properties from the Open Graph metadata.

```
add_filter( 'rank_math/opengraph/facebook/og_updated_time', '__return_false');
add_filter( 'rank_math/opengraph/facebook/article_published_time', '__return_false');
add_filter( 'rank_math/opengraph/facebook/article_modified_time', '__return_false');
```

### 4.4  Remove Dates in the Sitemap

Search engines use your sitemap to discover the URLs on your website. The sitemap contains a `<lastmod>`****tag, which displays the date and time the content was last modified.

**Note:** Search engines use the lastmod date to identify pages that have been updated and need to be crawled. Removing the date may delay search engines crawling your recently modified pages.

If you have Rank Math installed, you can use the below filter to remove the lastmod date from your sitemap index.

```
/**
 * Filter to remove lastmod from sitemap index
 */
add_filter( 'rank_math/sitemap/index/entry', function( $index, $type ) {
    if ( isset( $index['lastmod'] ) ) {
		unset( $index['lastmod'] );
	}
	return $index;
}, 10, 2 );
```

### 4.5  Remove Dates in the RSS Feed

[Google uses](https://developers.google.com/search/blog/2009/10/using-rssatom-feeds-to-discover-new) your RSS feed to detect new content uploaded to your site. The RSS feed contains a `<pubDate>`****and `<lastBuildDate>`****which Google can use to find the dates to display in your content. You can add the below rule to your robots.txt file to block search engines from crawling your RSS feed.

```
User-Agent: *
Disallow: /feed/
```

## 5  How Long Does It Take for Search Engines to Update the SERPs?

Google usually takes a week or two to update the SERPs, but if it takes longer, then it’s usual and nothing to be worried about. It takes a while for search engines to completely crawl your website, depending upon your website’s size, crawl budget, and any underlying SEO issues affecting the crawlers to reach your pages. Hence, if you’ve made the changes to exclude dates from SERPs, we request you to wait patiently for the changes to reflect.

That’s all on removing date snippets in search results. As mentioned, search engines can find or guess your dates from several sources. So removing it using the above methods is no assurance that they will not discover your dates using some other means.

And that’s it! If you have absolutely any questions about removing dates from SERPs – feel free to reach out to our support team; we’re always more than happy to help.

			

			 

			
	
		
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

		

										
			
- [How to Convert Time Duration to ISO 8601 Format](https://rankmath.com/kb/iso-8601-format/)

										
			
- [How to Get a YouTube API Key](https://rankmath.com/kb/how-to-get-a-youtube-api-key/)

										
			
- [How to Add Merchant Return and Shipping Policy in WooCommerce?](https://rankmath.com/kb/merchant-return-and-shipping-policy/)

										
			
- [What is WebSite Schema and How Do You Implement It?](https://rankmath.com/kb/website-schema/)

										
			
- [How to Implement sameAs Schema on Your Website](https://rankmath.com/kb/sameas-schema/)

										
			
- [How to Implement Author SEO on Your Website to Boost E-E-A-T](https://rankmath.com/kb/author-seo/)