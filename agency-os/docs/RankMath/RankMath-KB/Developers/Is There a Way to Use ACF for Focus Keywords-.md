# Is There a Way to Use ACF for Focus Keywords?

> **Category:** Developers
> **Source:** https://rankmath.com/kb/acf-for-focus-keywords/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Is There a Way to Use ACF for Focus Keywords?

			
			

	

In this knowledgebase article, we’ll show you how to automatically set focus keywords from your ACF fields.

You can easily add more data and information to your pages and blog posts by using Advanced Custom Fields with Rank Math. Additionally, [Rank Math and Advanced Custom Fields](https://rankmath.com/kb/advanced-custom-fields/) are easily integrated.

## 1  Navigate to the Theme File Editor

At first, navigate to the Theme File Editor from your WordPress dashboard. To do so, navigate to **Appearance → Theme File Editor** (for a Classic Theme) inside your WordPress admin area.

![Navigate to the Theme File Editor](https://rankmath.com/wp-content/uploads/2022/12/Navigate-to-Theme-File-Editor.png)

## 2  Add the Code Snippet

To update the focus keyword using the ACF field, add the below code snippet to your theme’s [rank-math.php](https://rankmath.com/kb/filters-hooks-api-developer/#how-to-add-code-snippets-to-rank-math-php) file.

```
function update_focus_keywords() {
	$posts = get_posts(
		array(
			'posts_per_page' => -1,
			'post_type'      => 'post', // replace post with the name of your post type.
		)
	);
	foreach ( $posts as $p ) {
		// Replace 'article_topic' with your ACF field name.
		if ( ! get_post_meta( $p->ID, 'rank_math_focus_keyword', true ) && function_exists( 'get_field' ) && ( null !== get_field( 'article_topic', $p->ID ) ) ) {
			update_post_meta( $p->ID, 'rank_math_focus_keyword', strtolower( get_field( 'article_topic', $p->ID ) ) );
		}
	}
}
add_action( 'init', 'update_focus_keywords' );
```

In the above code snippet, you need to change the  `article_topic` field with your ACF field name. This field is used in two places in the code.

![Add the code snippet](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202544%201278'%3E%3C/svg%3E)

This code works only for published articles. The code checks if the focus keyword is set for a post. Then it checks if the ACF field is set (you can change this field name).

If the Rank Math focus keyword is not set, the above code automatically updates the focus keyword from the ACF field value.

## 3  Update the File

Once you’ve added the code snippet, click on the **Update File** button to save the changes made to the file.

![Update the file](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202542%201114'%3E%3C/svg%3E)

Once the snippet code has been added, the end result will look like this:

![Final result after adding the code snippet](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201438%20664'%3E%3C/svg%3E)

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

		

										
			
- [How to Use Rank Math MCP Tools](https://rankmath.com/kb/mcp-tools/)

										
			
- [Why We’re Moving Rank Math Modules to React (And What It Means for You)](https://rankmath.com/kb/react-migration/)

										
			
- [How to Customize Breadcrumbs in Rank Math](https://rankmath.com/kb/customize-breadcrumbs-in-rank-math/)

										
			
- [Rank Math SEO Filters and Hooks for Developers](https://rankmath.com/kb/filters-hooks-api-developer/)

										
			
- [How to Make Your Theme Rank Math Compatible](https://rankmath.com/kb/make-theme-rank-math-compatible/)

										
			
- [How to Enable Headless CMS Support in Rank Math?](https://rankmath.com/kb/headless-cms-support/)