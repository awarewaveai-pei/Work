# How to Automate the Insertion of Focus Keyword

> **Category:** Miscellaneous
> **Source:** https://rankmath.com/kb/how-to-automate-the-insertion-of-focus-keyword/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Automate the Insertion of Focus Keyword

			
			

	

If your website consists of numerous posts without focus keywords, then adding them one by one could be tedious. So in this knowledgebase article, we’ll show you how you can automate the insertion of focus keywords into your content.

## Automatically Use the Post Title as the Focus Keyword

To set the title of your post as the focus keyword, first, navigate to **WordPress Dashboard → Appearance → Theme File Editor** (for a Classic Theme) or **WordPress Dashboard → Tools → Theme File Editor** (for a Block Theme).

![Navigate to Theme File Editor](https://rankmath.com/wp-content/uploads/2022/03/Navigate-to-Theme-File-Editor.png)

You’ll need to add the following code snippet to your theme’s [rank-math.php](https://rankmath.com/kb/filters-hooks-api-developer/#how-to-add-code-snippets-to-rank-math-php) file. We recommend adding this code snippet to `/wp-content/themes/theme-name/rank-math.php`.

![Filter to remove Schema from all product category pages](https://rankmath.com/wp-content/uploads/2021/05/Filter-to-remove-all-schema-from-product-category-pages.jpg)

Add the code (given below) in the code editor and then click **Update File**for saving the changes.

```
/**
 * Function to automatically update the focus keyword with the post title
 */
function update_focus_keywords()
{
    $posts = get_posts(array(
        'posts_per_page'    => -1,
        'post_type'        => 'post' //replace post with the name of your post type
    ));
    foreach ($posts as $p) {
        update_post_meta($p->ID, 'rank_math_focus_keyword', strtolower(get_the_title($p->ID)));
    }
}
add_action('init', 'update_focus_keywords');
```

Please note the above code will replace all your existing focus keywords too. In case, if you wish to set the post title as a focus keyword only for the posts that don’t have a focus keyword set, then use the following code instead.

```
/**
 * Function to automatically update the focus keyword with the post title, if no focus keyword is set
 */
function update_focus_keywords() {
    $posts = get_posts(array(
    'posts_per_page'	=> -1,
    'post_type'		=> 'post' // Replace post with the name of your post type
    ));
    foreach($posts as $p){
        // Checks if Rank Math keyword already exists and only updates if it doesn't have it
        $rank_math_keyword = get_post_meta( $p->ID, 'rank_math_focus_keyword', true );
	if ( ! $rank_math_keyword ){ 
            update_post_meta($p->ID,'rank_math_focus_keyword',strtolower(get_the_title($p->ID)));
        }
    }
}
add_action( 'init', 'update_focus_keywords' );
```

Once the snippet code has been added, the end result would look like this:

![Focus keywords from Post Title](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201912%20778'%3E%3C/svg%3E)

## Automatically Use the Tags as the Focus Keyword

To set all your posts with the post tags as focus keywords, you can add the following code in [rank-math.php](https://rankmath.com/kb/filters-hooks-api-developer/#how-to-add-code-snippets-to-rank-math-php) under **WordPress Dashboard → Appearance → Theme File Editor** (for a Classic Theme) or **WordPress Dashboard → Tools → Theme File Editor** (for a Block Theme).

```
/**
 * Function to automatically update the focus keyword with the post tags
 */
function update_focus_keywords()
{
    $posts = get_posts(array(
        'posts_per_page' => 100,
        'post_type' => 'post' //replace post with the name of your post type
    ));
    foreach ($posts as $p) {
        $keywords = [];
        if (get_the_tags($p->ID)) {
            foreach ((get_the_tags($p->ID)) as $tag) {
                $keywords[] = strtolower($tag->name);
            }
            update_post_meta($p->ID, 'rank_math_focus_keyword', implode(", ", array_unique($keywords)));
        }
    }
}
add_action('init', 'update_focus_keywords');
```

The above code will replace any existing focus keyword as well. In case, if you wish to set focus keywords only for the posts that don’t have any focus keyword set, then use the following code instead.

```
/**
 * Function to automatically update the focus keyword with the post tags, if no focus keyword is set
 */
function update_focus_keywords()
{
    $posts = get_posts(array(
        'posts_per_page' => 100,
        'post_type' => 'post' //replace post with the name of your post type
    ));
    foreach ($posts as $p) {
        $keywords = [];
        if (get_the_tags($p->ID)) {
            foreach ((get_the_tags($p->ID)) as $tag) {
                $keywords[] = strtolower($tag->name);
            }
            if (!get_post_meta($p->ID, 'rank_math_focus_keyword', true)) {
                update_post_meta($p->ID, 'rank_math_focus_keyword', implode(", ", array_unique($keywords)));
            }
        }
    }
}
add_action('init', 'update_focus_keywords');
```

## Automatically Use the Product Category as the Focus Keyword

This code can be used in [rank-math.php](https://rankmath.com/kb/filters-hooks-api-developer/#how-to-add-code-snippets-to-rank-math-php) in **WordPress Dashboard → Appearance → Theme File Editor** (for a Classic Theme) or **WordPress Dashboard → Tools → Theme File Editor** (for a Block Theme) to use the product category as focus keyword in WooCommerce Products:

```
/**
 * Function to automatically update the product focus keyword with the product category
 */
function update_product_focus_keywords()
{
    $products = get_posts(array(
        'posts_per_page' => 100,
        'post_type' => 'product' //replace post with the name of your post type
    ));
    foreach ($products as $p) {
        $keywords = [];
        if (get_the_terms($p->ID, 'product_cat')) {
            foreach(get_the_terms($p->ID, 'product_cat') as $term) {
                $keywords[] = strtolower($term->name);
            }
            update_post_meta($p->ID, 'rank_math_focus_keyword', implode(", ", array_unique($keywords)));
        }
    }
}
add_action('init', 'update_product_focus_keywords');
```

The above code will replace any existing focus keyword with the product category. If you wish to set the focus keyword only for the WooCommerce products that don’t have any focus keyword set, then you may use the following code.

```
/**
 * Function to automatically update the product focus keyword with the product category, if no focus keyword is set
 */
function update_product_focus_keywords()
{
    $products = get_posts(array(
        'posts_per_page' => 100,
        'post_type' => 'product' //replace post with the name of your post type
    ));
    foreach ($products as $p) {
        $keywords = [];
        if (get_the_terms($p->ID, 'product_cat')) {
            foreach (get_the_terms($p->ID, 'product_cat') as $term) {
                $keywords[] = strtolower($term->name);
            }
            if (!get_post_meta($p->ID, 'rank_math_focus_keyword', true)) {
                update_post_meta($p->ID, 'rank_math_focus_keyword', implode(", ", array_unique($keywords)));
            }
        }
    }
}
add_action('init', 'update_product_focus_keywords');
```

Now let’s see whether the snippet code is working perfectly in this case:

![Focus Keywords from Product Categories](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201912%20778'%3E%3C/svg%3E)

As you can notice, the code has been successfully implemented and it is automatically capturing the Product Category as the Focus Keyword.

## Automatically Use the Post Category as the Focus Keyword

To set all your posts with the post category as focus keywords, you can add the following code in [rank-math.php](https://rankmath.com/kb/filters-hooks-api-developer/#how-to-add-code-snippets-to-rank-math-php) under **WordPress Dashboard → Appearance → Theme File Editor** (for a Classic Theme) or **WordPress Dashboard → Tools →** **Theme File Editor** (for a Block Theme).

```
/**
 * Function to automatically update the focus keyword with the post categories
 */
function update_focus_keywords() {
	$posts = get_posts(array(
	'posts_per_page'	=> -1,
	'post_type'		=> 'post' //replace post with the name of your post type
    ));
	foreach($posts as $p){
		if(get_the_category($p->ID)){
			foreach((get_the_category($p->ID)) as $category) {
                $keywords[] = strtolower($category->name);
            }
		update_post_meta($p->ID,'rank_math_focus_keyword',implode(", ", array_unique($keywords)));
		}
	}
    
}
add_action( 'init', 'update_focus_keywords' );
```

The above code will replace any existing focus keyword as well. In case, if you wish to set focus keywords only for the posts that don’t have any focus keyword set, then use the following code instead.

```
/**
 * Function to automatically update the focus keyword with the post categories, if no focus keyword is set
 */
	function update_focus_keywords(){
    $posts = get_posts(array(
        'posts_per_page' => 100,
        'post_type' => 'post' //replace post with the name of your post type
    ));
    foreach ($posts as $p) {
        $keywords = [];
        if (get_the_category($p->ID)) {
            foreach ((get_the_category($p->ID)) as $category) {
                $keywords[] = strtolower($category->name);
            }
            if (!get_post_meta($p->ID, 'rank_math_focus_keyword', true)) {
                update_post_meta($p->ID, 'rank_math_focus_keyword', implode(", ", array_unique($keywords)));
            }
        }
    }
}
add_action('init', 'update_focus_keywords');
```

Now let’s see whether the snippet code is working perfectly in this case:

![Add category as focus keyword for a post](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201440%20634'%3E%3C/svg%3E)

Search engines prefer that you add your focused keywords in your title, description, and throughout your content. However, there might be situations where your [focus keyword might not be saved](https://rankmath.com/kb/meta-data-not-saving/). Rank Math makes it very easy for you to set a [focus keyword](https://rankmath.com/kb/what-is-a-focus-keyword/) and optimize your content for it. If you have any other questions about focus keywords and how they work in Rank Math, don’t hesitate to [reach out to our support team](https://rankmath.com/support/).

			

			 

			
	
		
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