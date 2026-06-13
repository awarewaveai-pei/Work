# How to Customize Breadcrumbs in Rank Math

> **Category:** Developers
> **Source:** https://rankmath.com/kb/customize-breadcrumbs-in-rank-math/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Customize Breadcrumbs in Rank Math

			
			

	

The Rank Math breadcrumb settings at **WordPress Dashboard** **→** **Rank Math SEO → General Settings → Breadcrumbs** provides you with a series of options to set up and modify the breadcrumbs on your site.

However, if you want to modify your breadcrumbs beyond the options available in the settings, then you will need to add custom code snippets to your site. In this knowledgebase article, we will provide you with some examples to add or remove features from your breadcrumbs.

**Note:**You can refer to this guide on [adding filters to your WordPress site](https://rankmath.com/kb/wordpress-hooks-actions-filters/).

## In this guide, we’ll cover:

- [Remove Breadcrumbs From the Homepage](#remove-breadcrumbs-from-homepage)

- [Add a Blog Page to Your Breadcrumbs](#add-blog-page-to-breadcrumbs)

- [Shorten the Post Title of Your Breadcrumbs](#shorten-breadcrumbs-post-title)

- [Display Tags in Your Breadcrumbs](#display-tags-in-breadcrumbs)

- [Remove Breadcrumb Categories on Posts and Pages](#remove-breadcrumb-categories-on-posts-and-pages)

## 1  Remove Breadcrumbs From the Homepage

Use the below code to add Rank Math breadcrumbs on all pages except the homepage. This code snippet needs to be added to the appropriate location in your theme’s template file.

```
/**
 * Use the following code in your theme's template files to display breadcrumbs except your homepage
 */
<?php
if ( function_exists('rank_math_the_breadcrumbs') && !is_home() ) {
    rank_math_the_breadcrumbs();
}
?>
```

## 2  Add a Blog Page to Your Breadcrumbs

![How to add a Blog page to your breadcrumbs](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20646'%3E%3C/svg%3E)

If you have set a static page as your blog page, navigate to**WordPress Dashboard**→ **Rank Math SEO** →**General Settings**→**Breadcrumbs**.

![Navigate to Breadcrumbs](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20617'%3E%3C/svg%3E)

Once done, scroll down and enable **Show Blog Page**. Then, click **Save Changes**.

![Enable Show Blog Page](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20614'%3E%3C/svg%3E)

This option will be unavailable if you have not set a static page as your blog page in WordPress. In that case, use the below filter to add a `Blog` page to your breadcrumbs.

**Note:**Ensure to replace `https://yourdomain.com/blog` with your blog URL.

```
/**
 * Filter to add a 'Blog' page to Rank Math Breadcrumbs.
 */
 add_filter( 'rank_math/frontend/breadcrumb/items', function( $crumbs, $class ) {

    if ( is_home() || is_front_page() ) {
        return $crumbs;
    }

	$blog = ['Blog',
		 'https://yourdomain.com/blog' //replace with the URL of your blog page
		];
	if (count($crumbs) <3){
		array_splice( $crumbs, 0, 0, array($blog) );
		return $crumbs;
	}
	array_splice( $crumbs, 1, 0, array($blog) );
	return $crumbs;
}, 10, 2);
```

## 3  Shorten the Post Title of Your Breadcrumbs

![How to shorten breadcrumbs post title](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20655'%3E%3C/svg%3E)

Use the below filter to set the maximum character count of the post title displayed in your breadcrumbs.

**Note:**The maximum character limit `$max_char_limit` is set to `19` in the filter. You can modify it to any number of your choice.

```
/**
 * Filter to shorten the post title of Rank Math Breadcrumbs.
 */
add_filter( 'rank_math/frontend/breadcrumb/items', function( $crumbs, $class ) {
    $title = get_the_title();
    $max_char_limit = 19; //Set the limit for breadcrumb title
    
    if(strlen($title) > $max_char_limit){
        $RM_truncate_breadcrumb_title = substr($title, 0, $max_char_limit).'...';
        array_splice($crumbs, count($crumbs) - 1, 1);   
        $crumbs[][0] = $RM_truncate_breadcrumb_title; 
    }   
    return $crumbs;
}, 10, 2);
```

## 4  Display Tags in Your Breadcrumbs

![How to display tags in breadcrumbs](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20646'%3E%3C/svg%3E)

To display your tags in your breadcrumbs, navigate to **WordPress Dashboard →** **Rank Math SEO → Titles & Meta → Posts**, as shown below.

![Navigate to Posts in Titles & Meta](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20618'%3E%3C/svg%3E)

Then, scroll to **Primary Taxonomy**and ensure it is set it to Categories, as shown below.

![Set the Primary Taxonomy to Categories](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20609'%3E%3C/svg%3E)

After saving your changes, add the below filter to your site.

```
/**
 * Filter to display tags in Rank Math Breadcrumbs.
 */
add_filter( 'rank_math/frontend/breadcrumb/items', function( $crumbs, $class ) {
	$get_post_tags = get_the_tags();

	if ($get_post_tags) {
	  foreach($get_post_tags as $tag) {
		  $tag_list= [  $tag->name, get_tag_link( $tag->term_id ) ];
		  array_splice( $crumbs, 2, 0, array($tag_list) );
	  }
	}
	return $crumbs;
}, 10, 2);
```

## 5  Remove Breadcrumb Categories on Posts and Pages

![How to remove categories from your breadcrumbs](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20655'%3E%3C/svg%3E)

Use the below filter to remove categories from being displayed in the breadcrumbs of your posts and pages.

```
/** 
* Filter to remove categories from Rank Math Breadcrumbs. 
*/ 
add_filter( 'rank_math/frontend/breadcrumb/items', function( $crumbs, $class ) { 
        // check if we are viewing single posts
 	
        if(is_singular('post')){ //Unset elements with key 1 		
          unset($crumbs[1]); 
          $crumbs = array_values($crumbs); 		
          return $crumbs; 	
        } 	
        return $crumbs; 
}, 10, 2);
```

**Note:** This filter will not remove the breadcrumbs on your archive pages. You can [refer to this guide](https://rankmath.com/kb/breadcrumbs/#hide-taxonomy-name) to remove categories from the breadcrumbs of your archive pages.

And that’s it! These are some handy code snippets to modify your breadcrumbs in Rank Math. With these, you have the flexibility to customize your breadcrumbs and enhance the user experience of your site. So go ahead, give them a try, and make your breadcrumbs stand out.

We hope you are able to use the codes and filters to modify your breadcrumbs. If you have questions, you’re always more than welcome to [contact our dedicated support team](https://rankmath.com/support/). We’re available 24/7, 365 days a year…

			

			 

			
	
		
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

		

										
			
- [How to Use Rank Math MCP Tools](https://rankmath.com/kb/mcp-tools/)

										
			
- [Why We’re Moving Rank Math Modules to React (And What It Means for You)](https://rankmath.com/kb/react-migration/)

										
			
- [Rank Math SEO Filters and Hooks for Developers](https://rankmath.com/kb/filters-hooks-api-developer/)

										
			
- [How to Make Your Theme Rank Math Compatible](https://rankmath.com/kb/make-theme-rank-math-compatible/)

										
			
- [How to Enable Headless CMS Support in Rank Math?](https://rankmath.com/kb/headless-cms-support/)

										
			
- [How to Skip Rank Math Registration for Development Purposes](https://rankmath.com/kb/skip-rank-math-registration/)