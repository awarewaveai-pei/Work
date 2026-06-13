# Article Schema Type

> **Category:** Schema
> **Source:** https://rankmath.com/kb/article-schema/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Article Schema Type

			
			

	

When you mark up your posts and pages with Article Schema, they help search engines better understand the correct headline, published date & primary image of your article, and how they should be used in the search results. This gives search engines an opportunity to include your articles in various search features, and your articles gain increased visibility over normal search results.

In fact, all the articles in our Knowledge Base section and Rank Math Blog use Article Schema, and here is how our snippets appear in mobile search results with images.

![Rank Math Article Schema in search results](https://rankmath.com/wp-content/uploads/2021/06/Rank-Math-Article-Schema-Search-Results-in-Mobile.png)

If your [website uses AMP](https://rankmath.com/kb/using-amp-with-rankmath/) too, your articles are also eligible to feature in enhanced search results like Carousel, Top Stories, etc., for relevant search queries on mobile devices, attracting users to click through your results.

Thankfully adding Article Schema is so easy with Rank Math, and in this knowledgebase article, we’ll discuss more about Article Schema Type and how you can use the Article Schema Type on your posts and pages – let’s get started:

## Table of Contents

- [Choosing Article Schema as Default Schema Type](#default-schema-type)

- [Configuring Article Schema on Your Post/Page](#configuring-article-schema)

- [How to Add Author URL in Article Schema?](#add-author-url)

- [How to Add Multiple Author Schema In Rank Math?](#multiple-author)

- [How to Use reviewedBy Schema Entity?](#reviewedBy)

## 1  Choosing Article Schema as Default Schema Type

Rank Math has made it easy to select a Schema type that you use the most on your website from the wide range of built-in Schema types…

You can use the Article Schema Type on all the articles on your website. Rank Math uses `Article` for **Pages** and **Posts** by default, but you can always change that by navigating to **WordPress Dashboard **→** Rank Math SEO **→** Titles & Meta **→** Posts/Pages** and choosing the Schema Type of your choice.

![Default Schema Type configuration in Rank Math Titles & Meta](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201528%201083'%3E%3C/svg%3E)

## 2  Configuring Article Schema on Your Post/Page

While the default Schema Type lets you mark up all your posts/pages with Article Schema, you can also set this Schema Type to a specific post/page with the Schema tab under Rank Math’s Meta Box.

### 2.1  Edit Your Post or Page

To set the **Article Schema Type**, open your post/page by clicking on **Edit** post as shown below:

![Open Post](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20539'%3E%3C/svg%3E)

### 2.2  Open Rank Math in the Gutenberg Sidebar

Click on the Rank Math SEO icon that displays alongside this post/page’s SEO score to open the SEO settings for this page.

Or alternatively, click the three vertical dots in the top right-hand corner of the edit page and select Rank Math in the **Plugins**section – as shown below:

![Click on Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20614%20764'%3E%3C/svg%3E)

### 2.3  Navigate to the Schema Settings for This Post/Page

Click on the **Schema tab** of Rank Math SEO Metabox. If it doesn’t appear here, ensure that you have enabled the Schema module by navigating to **Rank Math SEO **→** Dashboard →****Modules** in your WordPress admin area.

Then click on **Schema Generator**, as shown below.

![Click on Schema Generator](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20602%20486'%3E%3C/svg%3E)

### 2.4  Navigate to the Schema Builder

Search for the Article Schema Type and click on **Use** to open the Schema Builder.

![Click on Use](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201312%201308'%3E%3C/svg%3E)

### 2.5  Fill the Details in the Schema Builder

Now, Rank Math’s Schema Builder will show up. This is where you can set the **headline, SEO description, keywords,** and other fields available for the Schema type you’ve selected.

![Add Headline, Description and Keywords](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201258%201647'%3E%3C/svg%3E)

#### Headline

The default variable `%seo_title%` will populate the SEO Title you’ve set for the post/page. Instead, you can also define your custom title. Although the headline has no character limit, search engines encourage having a concise title to avoid being truncated for smaller devices.

#### Description

If you leave this field with the default variable `%seo_description%`, then Rank Math will use the meta description you’ve added for the article.

#### Keywords

The Keywords field is set with the default variable `%keywords%`, which would automatically populate the focus keyword(s) you’ve set for the post/page. If you wish to add the keywords manually, be sure to separate them with commas.

The keywords you add to the Schema Markup will describe the content to the search engines. Although there isn’t a limit on the number of keywords you can add to this field, adding a huge number of keywords can do more harm than good.

Search engines’ usage of meta keywords is a separate topic for discussion; however, Bing uses them cautiously _only_ to identify spam pages. Hence, we recommend leaving the field with the default value or adding only a reasonable number of keywords.

### 2.6  Enable Speakable Option [PRO](https://rankmath.com/pricing/)

With the rise in voice searches and everyone looking to get ahead of the game, [Speakable Schema](https://developers.google.com/search/docs/data-types/speakable) makes your most important information coherent and easy to read.

With Speakable, you select the information you want Google to read and use for your audience. In addition, the [Speakable Schema.org](https://schema.org/speakable) property identifies sections within an article or a web page best suited for audio playback using text-to-speech (TTS).

The **Enable Speakable** option (available in [Rank Math PRO](https://rankmath.com/pricing/)) lets you add speakable attributes to your Article Schema. You can enable it by selecting ‘Enable’ from the drop-down list. Once you select it, you can add a property by clicking **Add Property.** Then, add the [cssSelectors](https://schema.org/cssSelector) such as .`headline` and .`summary` here.

![Enable Speakable](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201186%201280'%3E%3C/svg%3E)

However, this depends on the WordPress theme you’re using and the class assigned to your H1 heading tag, as it might not be `.headline`. To verify this, [navigate to the source code](https://rankmath.com/kb/how-to-view-page-source/#view-in-different-browsers) of the specific page or post, then press CTRL+F (or Cmd+F) to search for keywords.

Look for `/h1` in the search bar, and you’ll see that, for this theme, it shows a different class, which is `entry-title` as illustrated below.

![h1 heading css class](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201355%20341'%3E%3C/svg%3E)

Copy this class, then return to the `cssSelectors` property and add it, starting with a dot, along with the `.summary` property, as shown below. Be sure to save your changes.

![Adding cssSelectors in pages using Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201313%201196'%3E%3C/svg%3E)

After adding the `.summary` property, you’ll need to specify which paragraph of your article should include the Speakable Schema, as it’s not yet defined. To do this, go to the chosen paragraph, click on it, and access the Block settings. Then, locate the **Additional CSS class(es)** section and enter **summary** in the field, as illustrated below.

![Add summary class to an article paragraph](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20941'%3E%3C/svg%3E)

Don’t forget to publish or update the page.

### 2.7  Choose Article Type

And the last option would let you select the Article Type. You’ll see three options available: Article, Blog Post, and News Article. Let’s get to know more about each type.

![Article Type](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201236%20272'%3E%3C/svg%3E)

#### Article

This type is used more generally and is widely used across any article. Hence, Rank Math, by default, sets Article as the type, but you can always change it to a more specific one.

#### Blog Post

If you’re covering blog posts on your website, then you can set the article type as Blog Post. As a matter of fact, `BlogPosting` is a more specific type of `Article` under the Schema.org hierarchy. The usage of the type Article or Blog Post for your article is completely a choice of yours. But given that, [Google’s guidelines](https://developers.google.com/search/docs/guides/sd-policies#specificity) recommend using the most specific Schema Type, it is suggested to choose Blog Post as the type whenever it is applicable.

![Google's guidelines on using most specific applicable Schema Type](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201533%20339'%3E%3C/svg%3E)

#### News Article

If your post is an article on a News website, then you can set the type as News Article. Rank Math includes a fully compliant [News Sitemap generator](https://rankmath.com/kb/news-sitemap/), which is a requirement for your site to be featured in Google News, Google Discover, and other time-sensitive content.

If you’ve configured your post type to be included in the News Sitemap, then by default, Rank Math sets the Schema Type to `NewsArticle` for all the posts/pages you’ve marked as “news”, even if you set the type to `Article` or `BlogPosting`.

**Note:** Google does not allow a person as the publisher for news articles. For Article Schema, the Publisher must be an “Organization”, not a “Person”, so Rank Math adds it automatically. Also, the news article schema should only be used for factual news content. If this Schema is used for usual content you might get an error in the [rich results test](https://search.google.com/test/rich-results) by Google.

### 2.8  Update Your Post or Page

Click on **Save for this Post** once you have made the changes. Now simply save the existing post/page as you normally would do after making a change or click on **Publish**(if this is a newly created post/page).

You can then check your Schema with the help of the [Schema Testing Tool.](https://search.google.com/test/rich-results)

**Note:** To get the Schema code of the Article Schema, you can use the [Code Validation](https://rankmath.com/kb/rich-snippets/#code-validation) feature in Rank Math.

## 3  How to Add Author URL in Article Schema?

Google recommends including author URL to your Article Schema. Rank Math adds the author URL to Article Schema automatically if the author archives are enabled.

If you prefer adding the author URL to Article Schema, head over to **Rank Math SEO **→**** **Titles & Meta **→** Authors **→** Author Archives**.

![Enable Author archives in Rank Math Titles & Meta](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202334%201144'%3E%3C/svg%3E)

Here you can check if the Author Archives are enabled or disabled. In case if the option is disabled, you can toggle the option to enable it.

Please note if your author archives do not contain any unique information, we recommend adding a noindex to the author archive pages, as shown below, to [prevent pages with thin content](https://rankmath.com/kb/remove-thin-content-articles/) from being indexed.

![Noindex author archive pages](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201500%20603'%3E%3C/svg%3E)

Once you’re done making changes, scroll down to the bottom of the page and click the **Save Changes** button.

![Save Changes](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20813%20122'%3E%3C/svg%3E)

## 4  How to Add Multiple Author Schema in Rank Math? [PRO](https://rankmath.com/pricing/)

Rank Math, by default, will only [include the primary author in the Article Schema](https://rankmath.com/kb/author-schema-entity/). However, if you wish to include multiple authors, you may need to edit your current Article Schema further using our [Advanced Editor](https://rankmath.com/kb/rich-snippets/#advanced-schema-editor).

You can refer to this [guide from Google](https://developers.google.com/search/docs/advanced/structured-data/article#author-bp) to properly apply multiple authors to your markup.

To add Multiple Author Schema in Rank Math, navigate to **Rank Math SEO **→** Schema**and select the **Article Schema**, as shown below.

![edit Article Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20606%20720'%3E%3C/svg%3E)

Next, in the Schema Builder, click on the **Advanced Editor** option at the bottom.

![click on Advanced Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201320%201314'%3E%3C/svg%3E)

You’ll then see a confirmation message on the screen. Click **OK**to proceed.

![click on OK button](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20870%20224'%3E%3C/svg%3E)

In the Advanced Editor, you can add the Multiple Author Schema by using the **Add Property**and**Add Property Group** options, as shown below.

![add multiple Authors Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202282%201304'%3E%3C/svg%3E)

Once done, click the **Save for this Post** button to save the Schema. You can then check your Schema with the help of [Google’s Rich Results Testing Tool](https://search.google.com/test/rich-results).

## 5  How to Use reviewedBy Schema Entity? [PRO](https://rankmath.com/pricing/)

Including [Author Schema Entity](https://rankmath.com/kb/author-schema-entity/), reviewedBy Schema is also one of the highest priority opportunities to signal good E-E-A-T. As we know, [E-E-A-T](https://developers.google.com/search/blog/2022/12/google-raters-guidelines-e-e-a-t) (Experience, Expertise, Authoritativeness, and Trustworthiness) is Google’s framework to evaluate and rank great content on their search engine results.

By using the [reviewedBy Schema Entity](https://schema.org/reviewedBy), you can improve your E-E-A-T and overall organic performance. As shown below, you can use our Advanced Editor to add and customize your reviewedBy Schema Entity.

![reviewedBy](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202286%20886'%3E%3C/svg%3E)

And that’s it! We hope the tutorial helped you take advantage of Article Schema. If you still have questions about using Article Schema, feel free to [contact our support team](https://rankmath.com/support/) — we’re always here to help.

			

			 

			
	
		
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