# Enable Rank Math SEO on Elementor Templates

> **Category:** Miscellaneous
> **Source:** https://rankmath.com/kb/enable-rank-math-on-elementor-templates/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Enable Rank Math SEO on Elementor Templates

			
			

	

If you’re adding content to Elementor templates, you may need to optimize your template for SEO with Rank Math, just like a post or page. Rank Math, by default, excludes support for Elementor templates as they are not actual pages or posts; hence we need to extend Rank Math support for Elementor templates.

## How to Enable Rank Math SEO on Elementor Templates?

In this knowledgebase article, we’ll show you how you can enable Rank Math SEO on Elementor templates.

### 1  Add the Filter

To enable Rank Math’s Integration on Elementor Template pages, please [add the following filter](https://rankmath.com/kb/wordpress-hooks-actions-filters/) to your theme’s [rank-math.php](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file) file.

We recommend using a child theme for implementing the code snippet. Because if any error has been committed while modifying or applying changes to the main theme file, then there can be a possibility that the whole site will get corrupted.

You can create a child theme by using a plugin called [Child Theme Configurator](https://wordpress.org/plugins/child-theme-configurator/). If you use a classic theme, navigate to the Theme File Editor from **WordPress Dashboard → Appearance**.

![Navigate to Theme File Editor](https://rankmath.com/wp-content/uploads/2022/03/Navigate-to-Theme-File-Editor.png)

If you are using a block theme, then you can find Theme File Editor under the Left side of the **WordPress Dashboard → Tools → Theme File Editor**.

![Theme File Editor in Block Theme](https://rankmath.com/wp-content/uploads/2022/05/Theme-File-Editor.png)

If you haven’t already created a rank-math.php file in your theme’s directory, you can create one in the path `wp-content/themes/theme-name/rank-math.php` where the theme-name denotes the actual theme installed and activated on your site.

![Open rank-math.php in WordPress Theme Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20992%20655'%3E%3C/svg%3E)

Don’t forget to add an opening PHP tag to the beginning of rank-math.php file: `<?php`. There must be no spaces or empty lines before it.

Now add the following snippet code to the file:

```
/**
 * Filter to enable Rank Math SEO on Elementor templates
 */
add_filter( 'rank_math/excluded_post_types',function( $post_types) {
      $post_types['elementor_library'] = 'elementor_library';
     return $post_types;
}, 11 );
```

And finally, update the changes.

![Add the code snippet to rank-math.php file](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201102%20608'%3E%3C/svg%3E)

### 2  Navigate to Tiles & Meta Settings

Once you’ve added the above code snippet and saved the changes, you’ll see a new tab with the label **My Templates** when you navigate to **Rank Math SEO → Titles & Meta** inside your WordPress Dashboard. Navigate to the My Templates section.

![My templates in Rank Math Titles & Meta](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20794%20876'%3E%3C/svg%3E)

### 3  Enable SEO Controls for Elementor Templates

As you scroll down a bit, you can find the option ‘**Add SEO Controls**‘. Enable this option to add the Rank Math SEO Meta box to your Elementor templates.

![Add SEO Controls](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201515%20288'%3E%3C/svg%3E)

And then click the **Save Changes** button.

![Click save changes](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20801%20237'%3E%3C/svg%3E)

Once you’ve enabled this option, you can notice the Rank Math SEO Meta box available on your Elementor templates under the SEO tab.

![Rank Math SEO tab for Elementor templates](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20339%20586'%3E%3C/svg%3E)

Now you can use Rank Math to add a focus keyword, optimize the content or take advantage of Schema Markup, etc., in your Elementor templates, just like any post or page.

And that’s it! We hope the tutorial helped you enable Rank Math on Elementor templates. If you still have any questions, [feel free to reach our support team](https://rankmath.com/support/), as we’re always here to help!

			

			 

			
	
		
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