# Remove “rank-math-link” Class from All Outbound Links

> **Category:** Miscellaneous
> **Source:** https://rankmath.com/kb/remove-rank-math-link-class/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Remove “rank-math-link” Class from All Outbound Links

			
			

	

In this tutorial, we’re going to walk through the steps on how to remove the Rank Math link class from the outbound links.

In the Rank Math plugin, we overwrite Gutenberg’s link module to add `nofollow` & `sponsored` attributes. The `rank-math-link` is a unique class that is needed to overwrite the default module.

However, you can paste the following code in your theme’s [rank-math.php](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file) file to remove the `rank-math-link` class.

Navigate to **WordPress Dashboard → Appearance → Theme File Editor** (for Classic Theme) or **WordPress Dashboard → Tools → Theme File Editor** (for Block Theme).

![Navigate to Theme File Editor](https://rankmath.com/wp-content/uploads/2022/03/Navigate-to-Theme-File-Editor.png)

Now click `rank-math.php` from theme files. Make sure that you are editing the child theme so as to ensure the safety and smooth running of the website.

![Navigate to rank-math.php](https://rankmath.com/wp-content/uploads/2021/05/Open-rank-math.php-file-in-Theme-Editor.jpg)

Now use the below-shown code snippet to add and then click **Update File**to reflect the changes.

```
/**
 * Filter to remove `rank-math-link` class from the frontend content links
 */
add_filter( 'rank_math/link/remove_class', '__return_true' );
```

Doing this will essentially render the `nofollow` and `sponsored` options for outbound links to be useless:

![nofollow and sponsored option](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20766%20520'%3E%3C/svg%3E)

We offer other options for links at **WordPress Dashboard → Rank Math SEO → General Settings → Links** as well. You can read more about each setting in our [General Settings](https://rankmath.com/kb/general-settings/#links) guide. If you still have any questions, please feel free to contact our [support team](https://rankmath.com/support/) who are available 24×7 and will help you out as soon as possible.

			

			 

			
	
		
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