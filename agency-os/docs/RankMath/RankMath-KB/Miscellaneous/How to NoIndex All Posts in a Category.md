# How to NoIndex All Posts in a Category

> **Category:** Miscellaneous
> **Source:** https://rankmath.com/kb/how-to-noindex-all-posts-in-a-category/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to NoIndex All Posts in a Category

			
			

	

Rank Math’s Titles & Meta settings let you set noindex to all posts or to all category pages. But if you want to set noindex to all posts that are assigned to a specific category, then the above settings will not be of any help.

In this knowledgebase article, we’ll show you how you can set noindex to all posts in a specific category with Rank Math.

## 1  Using a Filter

The first method lets you add a code snippet to your website to set a noindex for all posts within a category.

### 1.1  Navigate to Theme File Editor

Start by navigating to **Appearance →** **Theme File Editor** (for Classic Theme)  inside your WordPress dashboard.

![Navigate to Theme File Editor](https://rankmath.com/wp-content/uploads/2022/03/Navigate-to-Theme-File-Editor.png)

The right side of the screen shows all your theme files. You can add the code snippet to the [rank-math.php](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file) file inside your theme folder.

![Choose rank-math.php file](https://rankmath.com/wp-content/uploads/2022/05/Select-rank-math.php-to-edit.png)

We prefer adding the code to the rank-math.php file, and if you haven’t created the file, you can [follow this tutorial to create your rank-math.php](https://rankmath.com/kb/filters-hooks-api-developer/#adding-filters-and-hooks-in-rank-math-php) file in your theme’s folder using FTP or cPanel File Manager.

In case you are using a Block Theme, dive into **WordPress Dashboard → Tools → Theme File Editor**

![Theme File Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20988%20528'%3E%3C/svg%3E)

And, add the code snippet into the rank-math.php file.

### 1.2  Add the Code Snippet

```
/**
 * Filter to set noindex to specific categories
 */
add_filter( 'rank_math/frontend/robots', function ( $robots ) {
	$categories = array_map( function ( $category ) {
		return $category->slug;
	}, get_the_category() );

	//Replace your_category with your category slug.
	if ( in_array( 'your_category', $categories ) ) { 
		unset( $robots['index'] );
		$robots['noindex'] = 'noindex';
	}
	return $robots;
} );
```

In the above code snippet, replace `your_category` with your category slug. For this tutorial, we’re using a posts category named ‘WordPress Plugins’. Hence, we would replace `your_category` in the code snippet with the slug of the category ‘WordPress Plugins’.

To find the category slug, you can navigate to **Posts → Categories** inside your WordPress dashboard.

![Category slug in WordPress](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20814%20535'%3E%3C/svg%3E)

You can find the slug of each category against their category name. Copy and paste the slug in the above code snippet.

**Note:** In case if you’re trying to set noindex for posts of a product category, then the above filter will not work. Please use the below filter instead. Make sure to replace `your_product_category` in the code with your product category’s slug.

```
/**
 * Filter to set noindex to specific categories
 */
add_filter('rank_math/frontend/robots', function ($robots) {
	$slugs = array();
	$product_cats = wp_get_post_terms(get_the_ID(), 'product_cat');
	foreach ($product_cats as $product_cat) {
		$slugs[] = $product_cat->slug;
	}

	//Replace your_product_category with your product category slug.
	if (in_array('your_product_category', $slugs)) {
		unset($robots['index']);
		$robots['noindex'] = 'noindex';
	}
	return $robots;
});
```

### 1.3  Update the File

Once you’ve added the code, update the file to reflect the changes.

![Add the code snippet to rank-math.php file](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20844%20619'%3E%3C/svg%3E)

### 1.4  Check Source Code

Now, you can check the source code of your posts assigned to the specific category, noindex meta tag would have been added.

![Set noindex for posts in a category](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20774%20458'%3E%3C/svg%3E)

**Note:** Once you’ve added the code snippet to set noindex, any attempt to override a specific post inside the WordPress editor by setting index robots meta tag will not work. The post will continue to show noindex in the front-end until you remove the code snippet.

## 2  Using the Bulk Actions [PRO](https://rankmath.com/pricing/)

While the previous method lets you set noindex to all posts from a specific category in one go, using **Bulk Actions** with Rank Math can give you more flexibility. It lets you check the posts that will be affected by the changes, and you can even exclude some posts from being set with noindex.

The Bulk Actions feature is available only with Rank Math PRO. If you don’t have a PRO license yet, you can [get started with a PRO membership](https://rankmath.com/pricing/) of your choice.

### 2.1  Open Posts

Start by opening **All Posts** from your WordPress Admin menu, as shown below.

![Posts in WordPress dashboard](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%201183'%3E%3C/svg%3E)

### 2.2  Select the Category

From the **Categories** filter, select the category you want to set posts with noindex, and then click the **Filter** option.

![FIlter posts by category in WordPress](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202348%20834'%3E%3C/svg%3E)

Now only the posts that belong to this specific category will be filtered and displayed.

![Category filter applied for WordPress posts](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202328%20954'%3E%3C/svg%3E)

### 2.3  Set to NoIndex

Now you can select the posts to be set with noindex. The checkbox available at the top left corner will let you select/unselect all the posts inside your visible area. While the checkbox before each post will let you select/unselect the specific post. You can use this option to exclude specific posts while trying to set posts in a category with noindex.

![Selecting posts in WordPress posts](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202252%20958'%3E%3C/svg%3E)

From the Bulk Actions drop-down list, select **Set to noindex** and then click the **Apply** button.

![Set posts to noindex with bulk actions](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20807%20280'%3E%3C/svg%3E)

Now you can see a success notice, indicating that all the selected posts have been set to noindex.

![No Index set with bulk actions](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202240%20976'%3E%3C/svg%3E)

**Note:** Unlike the previous case of using a filter, you can override the robot’s meta settings of the individual posts. And any new post created after using the Bulk Actions will follow the robots meta settings from Titles & Meta settings inside Rank Math.

So what it means is that when new posts are created, **you’ll have to use Bulk Actions once again** to set them to noindex.

And that’s it! We hope the tutorial was helpful in setting noindex to all posts in a category. If you still have any questions, [feel free to reach our support team](https://rankmath.com/support/), and we’re always here to help.

			

			 

			
	
		
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