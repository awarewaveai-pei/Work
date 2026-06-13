# How to Disable Rank Math Meta Box from the Right Sidebar

> **Category:** Miscellaneous
> **Source:** https://rankmath.com/kb/disable-rank-math-meta-box/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Disable Rank Math Meta Box from the Right Sidebar

			
			

	

In the Gutenberg Block editor, WordPress displays the Rank Math SEO meta box in the right sidebar of your post or page editor by default. However, you can use a filter to move it to the bottom of the Block editor instead. Here’s how to do that.

**Note**: This filter does not affect the Classic editor, which already displays the Rank Math SEO meta box at the bottom of the post or page editor by default. It also does not affect the Content AI meta box, which will always be in the right sidebar of the Block Editor even when the filter is present.

To get started, click **Tools**→ **Theme File Editor** from your WordPress dashboard.

**Note**: We recommend adding this filter to a child theme rather than the parent theme. This ensures you do not lose the filter when you update your theme. You can refer to this guide on [creating a child theme in WordPress](https://rankmath.com/blog/wordpress-child-theme/).

![Click Tools and Theme File Editor from your WordPress dashboard](https://rankmath.com/wp-content/uploads/2026/01/Click-Tools-and-Theme-File-Editor-from-your-WordPress-dashboard.png)

Next, click **Theme Functions**.

![Click Theme Functions](https://rankmath.com/wp-content/uploads/2026/01/Click-Theme-Functions.png)

Now, scroll to the bottom of the code. Then, copy this filter and paste it after the last line.

```
/**
 * Disable Gutenberg Sidebar Integration
 */
add_filter( 'rank_math/gutenberg/enabled', '__return_false' );
```

This is how the filter should look when pasted into the code. Once done, click **Update File**. You have now added the filter to your site.

![Add the filter and click Update File ](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20865'%3E%3C/svg%3E)

You can now proceed to your post or page editor. You will notice the Rank Math meta box is now located at the bottom of the Block editor instead of in the sidebar.

![Sample of the Rank Math meta box at the bottom of the post or page editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20698'%3E%3C/svg%3E)

That’s how to move the Rank Math meta box from the Block editor sidebar to the bottom of the editor screen. If you have any questions about Rank Math, feel free to [reach out to our dedicated support team](https://rankmath.com/support/). They are always available and happy to assist you.

			

			 

			
	
		
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

										
			
- [Migrating The Rank Math Support from Forum to Zendesk](https://rankmath.com/kb/support-migration-to-zendesk/)

										
			
- [How to Customize RSS Feed in WordPress](https://rankmath.com/kb/customize-rss-feed/)

										
			
- [How to Add Twitter Cards to WordPress](https://rankmath.com/kb/how-to-add-twitter-cards/)

										
			
- [How to Use llms.txt in Rank Math SEO](https://rankmath.com/kb/llms-txt/)