# Working With the News Sitemap in Rank Math

> **Category:** Sitemaps
> **Source:** https://rankmath.com/kb/news-sitemap/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Working With the News Sitemap in Rank Math

			
			

	

**Important Note:** Only the posts/pages published in the last 2 days are included in the News Sitemap as per [Google’s News Sitemap Guidelines](https://support.google.com/news/publisher-center/answer/9606710?hl=en&ref_topic=9606468).

Ever since the mandatory [requirements of applying for Google News](https://support.google.com/news/publisher-center/answer/9607025?hl=en#:~:text=Eligibility%20in%20news,with%20Google%20News%20content%20policies.) were lifted and all websites were equally considered for the search results, there has been an explosion of new websites that want to appear in the search for news. It is a lucrative opportunity for sure. Especially since Google Discover, Google News, and push towards rich and time-sensitive content is becoming more common.

As you probably know, websites that want to appear in Google News have to fulfil some guidelines set by Google. One of those guidelines is having a compliant news sitemap. The good news is that with Rank Math, you can create fully compliant news sitemaps and configure additional data for your post, which is essential to appear in Google News properties.

![How To Create A Google News Sitemap For Your Website](https://img.youtube.com/vi/x1lkNQFm1SM/maxresdefault.jpg)
__

**Note:** This feature is available only in Rank Math PRO. If you haven’t already subscribed, you can choose a PRO plan of your choice [from here](https://rankmath.com/pricing/).

In this post, we will show you all the settings and how to configure them.

## Table of Contents

- [Guidelines for Appearing in Google News and Google News Sitemap](#google-news-sitemap-guidelines)

- [Enabling the Module](#enabling-module)

- [Configuring News Sitemap](#configuring-news-sitemap)

- [Configuring News Sitemap on a Post](#news-sitemap-post)

- [Important Things to Know When Using the News Sitemap](#important-about-news-sitemap)

- [Conclusion](#conclusion)

## 1   Guidelines for Appearing in Google News and Google News Sitemap

Since every website can now qualify to be in Google News, your website has to follow the guidelines set by Google to be considered. Here is the [link to the guidelines](https://support.google.com/news/publisher-center/answer/6204050?hl=en&ref_topic=9603441), and there are other helpful articles on similar topics there as well. The guidelines are nothing extraordinary, just the basics about what type of content is acceptable in Google News properties.

Also, there are specific guidelines on how the **news sitemap** needs to be structured, impacting your posts. Hence, it is important to clarify and understand them. Here are _some_ of the things to keep in mind.

First, the posts that you publish are placed in the sitemap for **just 2 days, then they are removed**. Yes, that is a Google guideline. However, Google may keep the post in their index for up to 30 days.

Second, the sitemap needs to be updated with new posts as soon as it is published. Rank Math takes care of that. But there is no forced indexing. That means Google will crawl the news sitemap as often as it indexes your website.

Third, the sitemap can only include 1,000 URLs. For more URLs, the sitemap needs to be divided into multiple sitemaps. Again, Rank Math will take care of it.

Fourth, your RSS/Atom feed helps Google to discover fresh news content within your website. To help Google discover your news article, you can customize your RSS feed with Rank Math easily.

Fifth, make use of NewsArticle and [Author schema](https://rankmath.com/kb/author-schema-entity/) to help Google understand your site’s topic easily. Rank Math will automatically detect and generate these schemas.

Sixth, Google uses schema’s image tags to decide the image for your article and again Rank Math will automatically detect the image on your content and generate the schema.

There are a few other, less important rules to follow, but they are not something you should be concerned with. If you would like to learn about them, though, here is the [link to the complete article](https://support.google.com/news/publisher-center/answer/9606710?hl=en) that lists the guidelines.

## 2  Enabling the Module

The first step in utilizing the News Sitemap option is to enable the module inside Rank Math. To do so, navigate to **Rank Math SEO → Dashboard → News Sitemap** from the WordPress menu. Once you see the News Sitemap option, enable it.

![Enable The News Sitemap Module](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202160%20730'%3E%3C/svg%3E)

**Note:** You can enable the “News Sitemap” module only if the “Sitemap” module has been enabled before.

When we try to turn on the **News Sitemap** module from Rank Math’s Dashboard, it’ll show us a signal that the **Sitemap** is not activated yet.

![Message shown by the News Sitemap module to activate Sitemap.](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20628%20700'%3E%3C/svg%3E)

Once you enable both the **Sitemap**and **News Sitemap**modules, you can go ahead with the configuration.

![Enabled News Sitemap as Sitemap module is activated.](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20638%201340'%3E%3C/svg%3E)

## 3   Configuring News Sitemap

Once you enable it, you’ll be able to access the news sitemap global options inside Rank Math. You’ll find them under **Rank Math SEO → Sitemap Settings → News Sitemap**.

![News Sitemap settings in Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202016%202273'%3E%3C/svg%3E)

**Important Note:** We change the Schema to `NewsArticle` for all posts/pages, you have marked as “News” even if they are set to `Article` or `BlogPosting` in the `Titles & Meta` Settings. Enabling all posts types in News Sitemap can create an issue on websites that use a different Schema than `NewsArticle`.

As it is with Rank Math options, usually, the settings you configure from inside Rank Math settings are **global options**. You set them once, and then the settings are inherited for each post type that you set it on.

For the news sitemap specifically, you’ll need to configure the following.

### 3.1  Sitemap URL

This option is not editable and is only present for informational purposes. It is the URL of your **news sitemap**. Google recommends having a specific news sitemap, and it has to follow the [news sitemap guidelines](https://support.google.com/news/publisher-center/answer/9606710?hl=en). With Rank Math, you don’t have to worry about following the guidelines, as Rank Math takes care of that while you focus on publishing content. There is nothing to configure in this option.

![News Sitemap URL](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201538%20231'%3E%3C/svg%3E)

### 3.2  Google News Publication Name

Here you need to enter the name of your publication as it appears in Google News. For example, if we named our publication “Rank Math,” we would enter that here. Please note that you have to match the name that appears in Google News, _exactly._

![Google News Publication Name](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201521%20315'%3E%3C/svg%3E)

### 3.3  News Post Type

This option lets you select the post types that the news sitemap should be enabled on. Click the ones that you want to use the sitemap on, and save your settings.

![News Post type](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201514%20660'%3E%3C/svg%3E)

### 3.4  Exclude Post Terms

You can also exclude posts from being included in the news sitemap based on their post terms. Simply search for the term and select it from the drop-down.

**Note:**This option will appear when you select the **Posts**News Post Type. Only categories and tags assigned to a post will be included in the dropdown.

![Exclude Post Terms](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20257'%3E%3C/svg%3E)

### 3.5  Save Your Changes

Once you’ve configured the settings as per your needs, don’t forget to save your changes by clicking the **Save Changes** button on the bottom right of the page. If you navigate away from the page without saving it, your changes will be lost.

![Saving All Global News Sitemap Settings In Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202084%20458'%3E%3C/svg%3E)

Once you do save your changes, you should see a success notification on top of the screen, confirming that the settings were saved.

![Global Settings Update Confirmation Message](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202072%20220'%3E%3C/svg%3E)

## 4  Configuring News Sitemap on a Post

Now that we’ve covered the global options, let us see what settings we have access to from inside the post itself. Remember, the settings will only be visible on the post types that you enable from the global settings, so check them accordingly.

Let us open a post and check out the settings available.

As expected, you’ll find the settings for the news sitemap along with other Rank Math settings. Inside the Rank Math Meta Box, head over to the [Advanced tab](https://rankmath.com/kb/advanced-tab/), and here you will find the **Googlebot-News Index** option.

### 4.1   Googlebot-News Index

This option lets you choose if you want the Google News bot to index and distribute your content in Google News. Ideally, you’d want all your content to get the maximum distribution possible, but there might be cases where you want to take matters into your own hands and don’t want the big G’s help. In those cases, this option will prove helpful.

![Googlebot-News Index](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20902%201367'%3E%3C/svg%3E)

The options are simple to understand. Use **Index** if you want Google NewsBot to index and distribute your content, and choose **No-index** if you don’t.

Please note that this setting is only applicable to Google NewsBot and not Googlebot. Choosing Index or Noindex here will have no effect on the indexing and distribution of your content in Google SERPs.

### 4.2   Save Your Post Settings

When you make any changes to Rank Math’s settings, including the news sitemap settings, it is recommended that you save your post by updating it or saving your post as a draft if you don’t want to publish it. This will ensure that all the changes that you make are not lost.

## 5   Important Things to Know When Using the News Sitemap

As easy as it is to configure the news sitemap with Rank Math, it is important to keep a few things in mind. This is especially important to remember, as Google News has constantly evolving rules, and it is better to be compliant.

### 5.1  Removal of Site Name from Titles

According to [Google’s Publisher guidelines](https://support.google.com/news/publisher-center/answer/9606710?hl=en), the title tag of the news articles in the news sitemap should not have author name, publication name, or publication date.

![removal of site name from titles](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20248'%3E%3C/svg%3E)

But if you aren’t setting any custom SEO titles manually for your posts/pages, then Rank Math automatically creates one with the default pattern involving post/page title and with your site name. As a result, the news sitemaps were using site name/publisher name in the title tags. Hence users had to configure custom SEO titles for each post manually or [configure global Titles & Meta settings](https://rankmath.com/kb/titles-and-meta/) for all their posts/pages.

To stay fully compliant with Google’s Publisher guidelines, irrespective of whether you use `%sitename%` variable in the SEO title or not, Rank Math now automatically removes `%sitename%` variable from the SEO titles in the News Sitemap if it finds any.

### 5.2  Genres and Stock Ticker

The second point is regarding the **Genre and the Stock Ticker** options. Technically, Google removed them from their Google News specification a long time ago, and hence we’ve removed them from our News Sitemap module.

Also, it is now possible to appropriately label or tag your content from the Google Publisher center. That is why the presence of these options inside the settings can become redundant, and we’ve removed them.

![To set Content Label or genre in Google Publisher Center](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20909%20689'%3E%3C/svg%3E)

Here is a link to a [related help document](https://support.google.com/news/publisher-center/answer/9606542) if you want to read about it further.

### 5.3  Removal of Keyword Property

The third point is regarding the Keyword property. If you check the news sitemap from the link in the settings, you’ll notice that we don’t include keyword property in it anymore. That is because it is no longer required by Google.

## 6  Conclusion

I hope it is clear to you how you can use the News Sitemap feature in Rank Math to publish compliant content and enjoy additional distribution with Google. If you have questions, feel free to create a support ticket on the Rank Math forum, and our team of helpful experts, who are available 24×7, by the way, will help you out immediately.

			

			 

			
	
		
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

		

										
			
- [How to Fix Whitespace Errors Breaking Your XML Sitemap in WordPress](https://rankmath.com/kb/fix-whitespace-errors-in-sitemap/)

										
			
- [How to Submit Your Website to Search Engines](https://rankmath.com/kb/submit-website-to-search-engines/)

										
			
- [How to Configure Sitemaps in Rank Math](https://rankmath.com/kb/configure-sitemaps/)

										
			
- [What Are the SEO Benefits of Sitemaps?](https://rankmath.com/kb/sitemaps-seo-benefits/)

										
			
- [How to Submit a Sitemap to Google](https://rankmath.com/kb/submit-sitemap-to-google/)

										
			
- [Rank Math Sitemap Issues and Their Fixes](https://rankmath.com/kb/fix-sitemap-issues/)