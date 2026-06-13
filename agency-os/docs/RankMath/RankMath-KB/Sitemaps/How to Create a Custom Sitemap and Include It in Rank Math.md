# How to Create a Custom Sitemap and Include It in Rank Math

> **Category:** Sitemaps
> **Source:** https://rankmath.com/kb/custom-sitemaps/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Create a Custom Sitemap and Include It in Rank Math

			
			

	

A **Sitemap** is an essential tool for any website if it wants to get indexed by search engines. The search engines make use of these Sitemaps to get more information about the website. A sitemap informs Google which pages and files on your site you think are relevant, as well as useful information about these files, such as when the page was last modified, how often it is changed, and any alternate language versions of the page. Thus, it is nothing but a blueprint of the website.

In this knowledgebase article, we’re going to walk you through how to create a Custom Sitemap and include it in Rank Math.

## How to Create a Custom Sitemap and Include It in Rank Math

### 1  Create a New File in the Child Theme

Navigate to **WordPress Dashboard → Appearance → Theme File Editor** (for Classic Theme).

![Theme File Editor in Classic Theme](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20900%20359'%3E%3C/svg%3E)

Or you should head over to **WordPress Dashboard → Tools → Theme File Edito**r if you are using a Block Theme.

![Theme File Editor in Block Theme](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20988%20528'%3E%3C/svg%3E)

Now, create a new file in your child theme folder (assuming you’ve added the previous filter codes in the [rank-math.php](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file) file of your child theme), name it custom-sitemap.php, and add the following code to it. You can also refer to this article to understand [how to add or create filters](https://rankmath.com/kb/wordpress-hooks-actions-filters/) on your theme files, in case, you’ve not created one before.

```
<?php

namespace RankMath\Sitemap\Providers;

defined( 'ABSPATH' ) || exit;

class Custom implements Provider {

	public function handles_type( $type ) {
		return 'custom' === $type;
	}

	public function get_index_links( $max_entries ) {
		return [
			[
				'loc'     => \RankMath\Sitemap\Router::get_base_url( 'custom-sitemap.xml' ),
				'lastmod' => '',
			]
		];
	}

	public function get_sitemap_links( $type, $max_entries, $current_page ) {
		$links     = [ 
			[
				'loc' => 'http://www.example.com/',
				'mod' => '2023-10-08',
			],
			[
				'loc' => 'http://www.example.com/page-2/',
				'mod' => '2023-10-08',
			],
		];

		return $links;
	}

}
```

### 2  Add Custom Links in `get_sitemap_links()` Function

Replace the `example.com` URLs and add your custom links in the `get_sitemap_links()` function.

### 3  Add the Code Snippet in Child’s `rank-math.php`

Add the below filter code in the rank-math.php of your child theme:

```
include_once 'custom-sitemap.php';
add_filter('rank_math/sitemap/providers', function( $external_providers ) {
	$external_providers['custom'] = new \RankMath\Sitemap\Providers\Custom();
	return $external_providers;
});
```

Once done, the new sitemap will show up with your custom links in it. Sitemaps also have [enormous benefits](https://rankmath.com/kb/sitemaps-seo-benefits/) and play a major role in boosting your rankings.

## How to Include Images in the Custom Sitemap

To add images in the custom sitemap, please pass the array of the image objects in the get_sitemap_links function:

```
<?php
namespace RankMath\Sitemap\Providers;

defined( 'ABSPATH' ) || exit;

class Custom implements Provider {

	public function handles_type( $type ) {
		return 'custom' === $type;
	}

	public function get_index_links( $max_entries ) {
		return [
			[
				'loc'     => \RankMath\Sitemap\Router::get_base_url( 'custom-sitemap.xml' ),
				'lastmod' => '',
			]
		];
	}

	public function get_sitemap_links( $type, $max_entries, $current_page ) {
		$links     = [ 
			[
			'loc' => 'http://www.example.com/',
			'mod' => '2023-10-08',
			'images' => [
				[
					'src'   => 'http://www.example.com/image1.png',
					'title' => 'Image Title',
				],
				[
					'src'   => 'http://www.example.com/image2.png',
					'title' => 'Image 2 Title',
				],
			],
		],
			[
				'loc' => 'http://www.example.com/page-2/',
				'mod' => '2023-10-08',
			],
		];

		return $links;
	}

}
```

To clear the custom sitemap cache, you’ll have to execute the `\RankMath\Sitemap\Cache::invalidate_storage( 'custom' );` on `save_post` hook. If you’re not sure how to do it, we would recommend you disable the sitemap cache completely by adding the following one line to your theme’s rank-math.php file:

```
add_filter( 'rank_math/sitemap/enable_caching', '__return_false');
```

If you still have any questions about creating a custom Sitemap and including it in Rank Math, please feel free to contact our [support team](https://rankmath.com/support/) – we’re always more than happy to help.

			

			 

			
	
		
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