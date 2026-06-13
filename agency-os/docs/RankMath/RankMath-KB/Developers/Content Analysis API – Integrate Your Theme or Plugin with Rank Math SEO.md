# Content Analysis API – Integrate Your Theme or Plugin with Rank Math SEO

> **Category:** Developers
> **Source:** https://rankmath.com/kb/content-analysis-api/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Content Analysis API – Integrate Your Theme or Plugin with Rank Math SEO

			
			

	

In this tutorial, you will learn how to **integrate Custom fields present in your theme or plugin with the Rank Math** SEO plugin.

Using this content analysis API, Rank Math will start analyzing data present in these fields.

Steps to register custom fields in Rank Math’s content analysis API:

### 1  Create a .js File

Create a new JS file in your Plugin or Theme and add the content analysis API related code in it. Make sure to use `wp-hooks` and `rank-math-analyzer` dependency.

```
wp_enqueue_script( 'rank-math-integration', DIR . '/js/rank-math-integration.js', [ 'wp-hooks', 'rank-math-analyzer' ], false, true );
```

### 2  Filters to analyze data

Rank Math supports 2 filters to analyze title and content. Following is a syntax to add filter:

```
wp.hooks.addFilter( 'rank_math_title', 'plugin-name', callback_function_to_fetch_title ) // This will hook into title analysis data.
wp.hooks.addFilter( 'rank_math_content', 'rank-math', this.getContent ) // This will hook into content analysis data.
```

### 3  Function to reload the data

- `rankMathEditor.refresh( 'title' )` – To reload the Title tests.
- `rankMathEditor.refresh( 'content' )` – To reload the Content tests.

You can also use this function to reload the analysis when any custom field data is changed.

Here is the example of Content Analysis API code that can be used to include WP Custom Fields data in Rank Math’s Content analysis [https://github.com/rankmath/seo-by-rank-math/blob/master/assets/admin/src/custom-fields.js](https://github.com/rankmath/seo-by-rank-math/blob/master/assets/admin/src/custom-fields.js)

			

			 

			
	
		
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