# How to Use a Table of Contents to Improve Content Readability

> **Category:** Miscellaneous
> **Source:** https://rankmath.com/kb/table-of-contents/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Use a Table of Contents to Improve Content Readability

			
			

	

User Experience (UX) is one of the most important factors you need to consider while creating a post, an article, or a guide. That’s why it’s always a good idea to include a table of contents (ToC), mostly in long-form content that includes three or more headings…

In this article, we’ll show you how to use the table of contents to break down your text.

Before we begin, let’s take a look at some of the advantages of using the Table of Contents.

## Advantages of Using the Table of Contents

- Provides a better user experience.

- Keeps your content well-structured and well-formatted.

- Helps to navigate easily between different sections.

- Makes it easier to share direct links to different sections within an article.

- Helps increase CTR from search.

## How to Use “Table of Contents”?

Table of Contents can help you improve the readability of an article.

Rank Math checks for the presence of a table of contents creation plugin on your website. If you don’t use the table of contents, then Rank Math will display an error in the Content Readability section.

![Table of Content ](https://rankmath.com/wp-content/uploads/2021/02/table-of-content.jpg)

Rank Math makes it extremely easy to add a Table of Contents block to your posts/pages without hassle. To do so, navigate to your post/page, click the **‘+’** icon and locate the **Table of Contents by Rank Math** block.

![Add Table of Contents by Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20900%20362'%3E%3C/svg%3E)

You can refer to our dedicated article on how to add [Rank Math’s Table of Contents Block](https://rankmath.com/kb/table-of-contents-block/) to further customize and configure the block.

On the assumption that you will use a Table of Contents, and if you have the plugin installed, Rank Math will pass the test if it finds any of the following plugins installed on your website.

- [Rank Math](https://rankmath.com/kb/table-of-contents-block/) _(use Rank Math Table of Contents block to clear the test_)

- [WP Shortcode Pro](https://mythemeshop.com/plugins/wordpress-shortcode/)

- [WP Shortcode](https://mythemeshop.com/plugins/wordpress-shortcode/)

- [TOC Pack – Table of Contents for Elementor](https://rankmath.com/compatibility/toc-pack-table-of-contents-for-elementor/)

- [Ultimate Blocks](https://rankmath.com/compatibility/ultimate-blocks/)

- [LuckyWP Table of Contents](https://rankmath.com/compatibility/luckywp-table-of-contents/)

- [Elementor Pro](https://rankmath.com/compatibility/elementor/)

- [Table of Contents Plus](https://wordpress.org/plugins/table-of-contents-plus/)

- [Easy Table of Contents](https://wordpress.org/plugins/easy-table-of-contents/)

- [Divi Table Of Contents Maker](https://rankmath.com/compatibility/divi-table-of-contents-maker/)

- [TOP Table of Contents](https://rankmath.com/compatibility/top-table-of-contents/)

If you are using any other plugin for adding a Table of Contents, please contact your plugin/provider and ask them to **add the below filter** to their plugin/theme so it is easier for Rank Math to detect that you are using a Table of Contents section in your posts.

```
add_filter( 'rank_math/researches/toc_plugins', function( $toc_plugins ) {
       $toc_plugins['plugin-directory/plugin-filename.php'] = 'Plugin Name';
    return $toc_plugins;
});
```

Once they add the filter, we will be happy to add them to the [compatibility list here](https://rankmath.com/compatibility/).

If you are manually adding a hard-coded Table of Contents section, you can [use this filter to disable that particular test](https://rankmath.com/kb/disable-seo-content-tests/#num-2-disable-the-table-of-contents-test).

## Get Jump Links in Google Search

**Google may include a “Jump To” link in the SERPs** when it detects a table of contents in your post. This helps to improve your click-through rate tremendously. However, note that Google does it at its discretion, like rich snippets, by simply including a table of contents, there is no guarantee that you will get the “Jump To” links.

You can see these links below a search result, and these allow you to navigate to the sections of a page from within the SERP. Below is an example of a jump link:

![Jump Links in Google Search](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20900%20220'%3E%3C/svg%3E)

For some, creating a table of contents may seem like something which is not so important, but it’s actually necessary, especially for large posts with a lot of headings. We strongly recommend using the table of contents and structure the content correctly for your visitors.

And, that’s it! If you still have any questions, please feel free to [reach our support team directly from here](https://rankmath.com/support/), and we’re always here to help.

			

			 

			
	
		
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

		

										
			
- [How to Share Credentials Using the Rank Math Vault](https://rankmath.com/kb/how-to-use-vault/)

										
			
- [How to Create an AI Traffic Report in Google Analytics 4](https://rankmath.com/kb/create-ai-traffic-report/)

										
			
- [How to Disable Rank Math Meta Box from the Right Sidebar](https://rankmath.com/kb/disable-rank-math-meta-box/)

										
			
- [Migrating The Rank Math Support from Forum to Zendesk](https://rankmath.com/kb/support-migration-to-zendesk/)

										
			
- [How to Customize RSS Feed in WordPress](https://rankmath.com/kb/customize-rss-feed/)

										
			
- [How to Add Twitter Cards to WordPress](https://rankmath.com/kb/how-to-add-twitter-cards/)