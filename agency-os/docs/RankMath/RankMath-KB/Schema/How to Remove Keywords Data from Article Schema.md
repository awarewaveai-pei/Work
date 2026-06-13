# How to Remove Keywords Data from Article Schema

> **Category:** Schema
> **Source:** https://rankmath.com/kb/remove-keywords-data-from-schema/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Remove Keywords Data from Article Schema

			
			

	

Rank Math adds the keyword data to the Article Schema by default, and if that isn’t desirable, we’re incredibly sorry for the inconvenience caused.

In this knowledgebase article, we’ll show how to remove keywords data from Article Schema.

The keywords are added to the [Article Schema](https://rankmath.com/kb/article-schema/) to submit them to the search engines. Here’s how Rank Math displays the keyword in the Schema.

![Keywords added to Article Schema](https://rankmath.com/wp-content/uploads/2022/12/keywords-rank-math-scaled.jpg)

If you wish to remove them, you’ll have to add a filter/hook to your website. There are various ways to add filter to your website. You can further refer to our dedicated tutorial on [how to add a filter/hook to your website.](https://rankmath.com/kb/wordpress-hooks-actions-filters/)

We have used the Code Snippets plugin, to add the snippet to the website’s [rank-math.php](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file) file. You can also add the code snippet in the rank-math.php file.

To do so, first install and activate the [Code Snippets](https://wordpress.org/plugins/code-snippets/) plugin from **Plugins → Add New** section of your WordPress dashboard.

![install and activate Code Snippets plugin](https://rankmath.com/wp-content/uploads/2022/12/code-snippets.jpg)

Once the plugin is installed and activated, add the below filter by navigating to **Snippets → Add New** from your WordPress dashboard.

```
add_filter('rank_math/snippet/rich_snippet_article_entity', function( $entity ) {
	unset( $entity['keywords'] );
	return $entity;
});
```

Here’s how the filter/hook will look in the code editor.

![Add code snippet](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%201017'%3E%3C/svg%3E)

Once done, click on the **Save Changes** button to save your changes.

Once the filter is added to your website, the keywords will be removed from the Article Schema.

![Keywords removed from the Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%201131'%3E%3C/svg%3E)

If you still have questions – you’re always more than welcome to [contact our dedicated support team](https://rankmath.com/support/). We’re available 24/7, 365 days a year…

			

			 

			
	
		
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