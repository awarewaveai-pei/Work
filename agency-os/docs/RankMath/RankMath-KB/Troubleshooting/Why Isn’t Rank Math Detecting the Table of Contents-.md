# Why Isn’t Rank Math Detecting the Table of Contents?

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/table-of-contents-not-detected/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Why Isn’t Rank Math Detecting the Table of Contents?

			
			

	

You might have come across scenarios where Rank Math is not able to detect the Table of Contents. In this article, we will discuss why Rank Math is not able to detect the Table of Contents and what you can do about that…

![Why isn't Rank Math Detecting the Table of Contents? - Rank Math SEO](https://img.youtube.com/vi/wClLpBuwX3s/maxresdefault.jpg)
__

## TOC Plugins Detected by Rank Math

Since there is no specific method to look for a Table of Contents inside your HTML code, Rank Math will check for the presence of a Table of Contents creation plugin on your site.

Assuming that you will use the [Table of Contents](https://rankmath.com/kb/table-of-contents/) and you have the plugin installed, Rank Math can detect the Table of Contents if any one of the below-supported plugins is used:

- [Rank Math](https://rankmath.com/kb/table-of-contents-block/) _(use Rank Math Table of Contents block to clear the test_)

- [WP Shortcode Pro](https://mythemeshop.com/plugins/wordpress-shortcode/)

- [WP Shortcode](https://mythemeshop.com/plugins/wordpress-shortcode/)

- [TOC Pack – Table of Contents for Elementor](https://rankmath.com/compatibility/toc-pack-table-of-contents-for-elementor/)

- [Ultimate Blocks](https://rankmath.com/compatibility/ultimate-blocks/)

- [LuckyWP Table of Contents](https://rankmath.com/compatibility/luckywp-table-of-contents/)

- [Elementor Pro](https://rankmath.com/compatibility/elementor/)

- [Table of Contents Plus](https://wordpress.org/plugins/table-of-contents-plus/)

- [Divi Table Of Contents Maker](https://rankmath.com/compatibility/divi-table-of-contents-maker/)

- [TOP Table of Contents](https://rankmath.com/compatibility/top-table-of-contents/)

Rank Math also has its own Table of Contents block, which makes it easier for your readers to navigate your content, allowing them to read exactly what they want. Follow this step-by-step guide to add a [Table of Contents block by Rank Math](https://rankmath.com/kb/table-of-contents-block/) to your WordPress posts and pages.

## Adding Your Plugin to TOC List

But, if your plugin is not included in the above list, then you may need to add the following piece of code in your theme’s [rank-math.php](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file) file.  If you haven’t created the filter, you can check this KB article to learn how to create the [rank-math.php file](https://rankmath.com/kb/filters-hooks-api-developer/#num-1-create-rank-math-php-file).

After creating the PHP file, go to the theme file editor. For the classic users, the navigation path is **WordPress Dashboard → Appearance → Theme File Editor → rank-math.php** and add the below-given code snippet. If you are using a block theme, then navigate to  **WordPress Dashboard → Tools → Theme File Edito**r.

```
/**
 * Filter to add plugins to the TOC list.
 *
 * @param array TOC plugins.
 */
add_filter( 'rank_math/researches/toc_plugins', function( $toc_plugins ) {
       $toc_plugins['plugin-directory/plugin-filename.php'] = 'Plugin Name';
    return $toc_plugins;
});
```

In the above code snippet, you’ll need to replace,

- `plugin-directory/plugin-filename.php` – with the path to your TOC plugin file inside the WordPress plugins folder

- `Plugin Name` – with the name of your TOC plugin

Once you’ve added the above piece of code, Rank Math can detect that you are using a Table of Contents section in your posts. We recommend adding this code to a child theme so that even when your theme developer releases updates to your main theme, changes are not overridden.

## Disable Test for Table of Contents

In case if you’re adding Table of Contents by any other method that does not involve the usage of a plugin, then you can completely disable the test for Table of Contents.

To disable the test of the Table of Contents, add the following piece of code to your theme’s [rank-math.php](https://rankmath.com/kb/filters-hooks-api-developer/#adding-filters-and-hooks-in-rank-math-php) file.

```
/**
 * Filter to disable the table of contents test
 */
add_filter( 'rank_math/researches/tests', function( $tests, $type ) {
    unset(
        $tests['contentHasTOC'],
    );
    return $tests;
}, 10, 2 );
```

Once the code snippet has been added, Rank Math will completely ignore the test for Table of Contents while analyzing your content.

And, that’s it! We hope the tutorial helped you fix the issue. If you’re still facing the issue, please feel free to [open a support ticket directly from here](https://rankmath.com/support/), and we’re always here to help.

			

			 

			
	
		
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