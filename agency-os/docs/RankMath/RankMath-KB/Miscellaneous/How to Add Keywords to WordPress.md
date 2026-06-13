# How to Add Keywords to WordPress

> **Category:** Miscellaneous
> **Source:** https://rankmath.com/kb/keywords-meta-tag/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Add Keywords to WordPress

			
			

	

Do you want to add keywords to WordPress with ease?

Keywords are the words or phrases potential customers use to search for products, services, and information online. You can use keywords to better target your audience.

It might seem daunting if you’re new to WordPress or SEO. But after you’re done reading this post, you’ll be equipped with the knowledge necessary to define your keywords for any post at any time you want.

In this knowledgebase tutorial, we’ll discuss everything you should know about keywords and how you can add keywords to WordPress.

  
## Table Of Contents

  

    
- [What Are Meta Keywords?](#meta-keywords)
    
- [Do Search Engines Use Meta Keywords?](#search-engines)
    
- [How to Add Keywords To WordPress](#add-keywords)
      

        
- [Include Keywords Meta Tag Using Filter](#filter)
        
- [Add Keywords to Individual Posts/Pages](#posts)
        
- [Add Keywords for Your Homepage](#homepage)
    
- [Conclusion](#conclusion)
  

## 1  What Are Meta Keywords?

Meta Keywords are a type of meta tag that appears in the HTML code of a web page and are used to help search engines understand the content of a web page. Meta keywords differ from ordinary ones because they exist “behind the scenes” in your page’s source code rather than on the live, viewable page. They appear as follows:

`<meta name="keywords" content="keyword1, keyword2" />`

The meta tag’s name is keywords, and the value is specified in the content section. In the content section, you should include the keywords you want the page to rank for in search engines.

When choosing or optimizing your meta keywords, the most important thing to remember is that each term should accurately reflect your site’s content. If your website sells kitchen supplies, keyword phrases like “low-rate vehicles” and “find a house in the US” are meaningless.

## 2  Do Search Engines Use Meta Keywords?

Google has stopped [supporting the keywords meta tag](https://developers.google.com/search/blog/2009/09/google-does-not-use-keywords-meta-tag) because websites were exploiting it to manipulate search engines and create more organic traffic. This means that Google does not consider the keywords meta tag a web page ranking signal, and using it will not affect your search engine rankings.

Because meta keywords are no longer used by search engines and have no bearing on your organic results, Rank Math excludes the keyword’s meta tag by default. Although Rank Math requires you to provide a focus keyword for each post, this information is only used to analyze your content.

With that stated, you may always use the keywords meta tag if you need it for any reason.

**Note:**Google does not support [meta keywords](https://developers.google.com/search/docs/crawling-indexing/special-tags).

## 3  How to Add Keywords To WordPress

We recommend you install [Rank Math](https://rankmath.com/), the greatest WordPress SEO plugin. It comes with a full range of features to help you expand your business and allows you to optimize your entire WordPress site for improved SEO.

The plugin must first be installed and activated. To do so, see our step-by-step guide on [configuring the Rank Math plugin](https://rankmath.com/kb/how-to-setup/).

### 3.1  Include Keywords Meta Tag Using Filter

Once you’ve installed and activated Rank Math, use the following filter in your theme’s [rank-math.php](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file) file to allow Rank Math to display the keywords meta tag on your website.

You can [create a rank-math.php file](https://rankmath.com/kb/filters-hooks-api-developer/#how-to-add-code-snippets-to-rank-math-php) in the path `/wp-content/themes/theme-name/rank-math.php` using FTP or cPanel File Manager.

Within your WordPress admin area, navigate to **Appearance → Theme File Editor**(for Classic Theme) or **Tools → Theme File Editor** (for Block Theme) after you’ve created the rank-math.php file.

![navigate to theme editor to add keywords to WordPress](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20641%20404'%3E%3C/svg%3E)

Choose rank-math.php from the list of files on the right side of the screen and paste the following code snippet into the code editor.

```
/**
 * Add <meta name="keywords" content="focus keywords">.
 */
add_filter( 'rank_math/frontend/show_keywords', '__return_true');
```

After adding the code snippet, click on the **Update File** button for the changes to reflect.

![Add filter in Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20944%20649'%3E%3C/svg%3E)

Now, you can check the source code of your posts to see if the meta tag has been added, as shown below.

![Meta Keywords](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20690%20478'%3E%3C/svg%3E)

**Note:** Although Rank Math lets you add any number of keywords to your post, adding too many keywords to the keywords meta tag can do more harm than good. Hence we’d recommend using this meta tag cautiously.

### 3.2   Add Keywords to Individual Posts/Pages

All you have to do to add keywords to an existing or new blog post or a page is open the WordPress post/page editor for the post or page you want to modify.

You’ll be redirected to the regular edit screen for posts in WordPress, where you can use Rank Math in the sidebar in the Gutenberg block editor. You can add your focus keyword in the **Focus Keyword**section,****as shown below.

![Add Focus Keyword](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%201036'%3E%3C/svg%3E)

Remember that if a focus keyword is set for the page and the filter is used, the meta keywords tag will be added to the HTML code.

### 3.3  Add Keywords for Your Homepage

If you’ve set a specific page as your homepage under **WordPress Dashboard → Settings → Readings → Your homepage displays**, then you can edit the page directly from**Rank Math SEO → Titles & Meta → Homepage**,****as shown below.

![edit homepage](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202352%201094'%3E%3C/svg%3E)

When you click **Edit Page**, you’ll be taken to the usual WordPress page edit screen, where you can use Rank Math in the Gutenberg block editor’s sidebar.

You can then add the keyword in the **Focus Keyword** section as shown below.

![Add focus keyword](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20898'%3E%3C/svg%3E)

And that’s it! Keywords will be added to your homepage.

## Conclusion

You must create keyword-focused content to optimize your WordPress website for search engines and readers. Rank Math makes it simple to update your site’s keywords in just a few clicks.

If you have any questions on how to add keywords to WordPress, you’re always more than welcome to [contact our dedicated support team](https://rankmath.com/support/), who are available 24/7, 365 days a year…

			

			 

			
	
		
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