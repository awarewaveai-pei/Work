# Set the Current Year in Post Title Using the [year] Shortcode

> **Category:** Developers
> **Source:** https://rankmath.com/kb/add-current-year-in-post-title/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Set the Current Year in Post Title Using the [year] Shortcode

			
			

	

According to a study, humans’ eyes don’t tend to read all the letters one by one, especially on the internet. Instead, it looks out for highlighted words, numbers, and bullet points.

Out of these three, numbers make the most impact on the human brain. Digits or figures stand out among other texts, which is what has inspired studies that have proven that numbers are a trigger to get your visitors to pay attention to your content. Article titles with digits or years get more clicks than titles without digits. [Rank Math](https://rankmath.com/kb/how-to-setup/) makes it very simple to automatically add the current year in your post with the help of a shortcode.

In this knowledgebase article, we’re going to walk you through how to set the current year in the post title using **[year]**shortcode.

## How to Set the Current Year in Post Title Using [year] Shortcode

Before using the [year] shortcode in the post title, you need to add a code snippet as discussed below.

### 1  Navigate to Theme File Editor

Start by heading over to **Appearance → Theme File Editor** (for Classic Theme) inside your WordPress admin area. In case of a Block Theme head over to **WordPress Dashboard → Tools → Theme File Editor**.

![Navigate to Theme File Editor](https://rankmath.com/wp-content/uploads/2022/03/Navigate-to-Theme-File-Editor.png)

And, then choose [rank-math.php](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file) (_you can create the file if you haven’t already_) from the list of theme files shown on the right side of the screen.

![Choose rank-math.php file in child theme](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20975%20561'%3E%3C/svg%3E)

### 2  Add the Code Snippet

In the code editor, that appears in the middle of your screen, copy and paste the following code snippet.

```
// Create Year shortcode to replace with current year.
add_shortcode( 'year', 'current_year' );
function current_year() {
	$year = date( 'Y' );
	return $year;
}

// To allow Rank Math Frontend title to parse shortcode.
add_filter(
	'rank_math/frontend/title',
	function ( $title ) {
		return do_shortcode( $title );}
);

// Activate shortcode function in Post Title.
add_filter( 'the_title', 'do_shortcode' );
```

![Add code snippet in rank-math.php file](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201102%20621'%3E%3C/svg%3E)

### 3  Update the File

Finally, click the **Update File** button at the bottom of the screen.

![update rank-math.php file](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20992%20591'%3E%3C/svg%3E)

Now you can try using the **[year]** shortcode in your post title.

![Year shortcode in Post Title](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201108%20278'%3E%3C/svg%3E)

Your post title and SEO title in the front end will be replaced with the current year.

![Year shortcode being replaced with current year](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201806%20286'%3E%3C/svg%3E)

**Note:** When using the [year] shortcode in Title as described in the tutorial, you don’t need to use the variable again in your Rank Math Titles & Meta. Doing so will result in the current year being shown twice.  Also, it’s normal if the preview snippet doesn’t show the year, however, if you check the source code of the live page, the year will be correctly displayed.

If you still have questions about setting the current year in post title using [year] shortcode – you’re always more than welcome to [contact our dedicated support team](https://rankmath.com/support/), who are available 24/7, 365 days a year…

			

			 

			
	
		
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