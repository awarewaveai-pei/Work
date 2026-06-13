# How to Use the Noydir Robots Meta Tag

> **Category:** Miscellaneous
> **Source:** https://rankmath.com/kb/noydir-robots-meta-tag/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Use the Noydir Robots Meta Tag

			
			

	

In this knowledgebase article, we’ll walk you through how to use the Noydir robots meta tag with Rank Math.

## What Is the Noydir Robots Meta Tag?

Noydir Robots Meta Tag stands for **No Yahoo Directory.** This tag is used to tell the search engines not to use the titles and descriptions for your pages in the search results from the Yahoo directory. Not only this, but they also prevented the sites from being listed in the web directories.

In the presence of this robots meta tag, the search engines would rather be forced to use your own web page to generate the title and description for search results. Most of the website owners preferred this as they were easily able to control the titles and descriptions by themselves.

## How to Use Noydir Robots Meta Tag?

Although we don’t have a UI option in [Rank Math](https://rankmath.com/kb/how-to-setup/), you can easily use the Noydir robots meta tag by using a code snippet, as we discussed below.

### 1  Navigate to Theme File Editor

Start by heading over to **Appearance → Theme File Editor** (for a Classic Theme)  inside your WordPress admin area.

![Navigate to Theme File Editor](https://rankmath.com/wp-content/uploads/2022/03/Navigate-to-Theme-File-Editor.png)

And, then choose [rank-math.php](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file) from the list of theme files shown on the right side of the screen.

![Open rank-math.php in WordPress Theme Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20992%20655'%3E%3C/svg%3E)

Block Theme users can navigate to **WordPress Admin Dashboard → Tools → Theme File Editor** from the left sidebar.

![Theme File Editor in Block Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20988%20528'%3E%3C/svg%3E)

### 2  Add Code Snippet

In the code editor, that appears in the middle of your screen, copy and paste the following code snippet.

```
add_filter( 'rank_math/frontend/robots', function( $robots ) {
	$robots['noydir'] = 'noydir';
	return $robots;
});
```

### 3  Update the File

Finally, click the **Update File** button at the bottom of the screen.

![Add the code snippet to rank-math.php file and update the file](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20975%20590'%3E%3C/svg%3E)

Now you can check your page’s source code to see if the Noydir robots meta tag has been added.

![Noydir robots meta tag added by Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201708%20784'%3E%3C/svg%3E)

It’s important to note that meta robots tags work differently from instructions in your [robots.txt](https://rankmath.com/kb/general-settings/) file and that certain conflicting rules might cause unexpected behaviours. For instance, search engines won’t be able to see your `meta` tags if the page is blocked via `robots.txt`.

We hope that this article has helped you to understand how to use the Noydir robots meta tag. However, if you still have any other questions about the Noydir Robots Meta tag, please feel free to reach out to our [support team directly from here](https://rankmath.com/support/), and we’re always here to help.

			

			 

			
	
		
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