# How to Completely Uninstall Rank Math From Your Website

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/uninstall/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Completely Uninstall Rank Math From Your Website

			
			

	

Trying to uninstall Rank Math completely? You’ve come to the right place, we’ll walk you through the entire process in this knowledgebase article.

If this is a temporary deactivation, you’ll be pleased to hear that you can safely deactivate and uninstall Rank Math. Here’s how:

**1.** Log into your WordPress website.

**2.** Navigate to **Plugins**

**3.** Locate Rank Math on the plugins page & click **Deactivate**

![Deactivate Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20180'%3E%3C/svg%3E)

**4.**Wait for the page to reload, then click **Delete**.

![Delete Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20139'%3E%3C/svg%3E)

This is safe to do, [temporarily uninstalling the plugin](https://rankmath.com/blog/uninstall-wordpress-plugin/) does not remove any of Rank Math’s data from your database. In case, if you’re looking to turn off _only_ specific features of Rank Math, then we recommend you to follow this tutorial to [disable modules in Rank Math](https://rankmath.com/kb/managing-modules/) instead of uninstalling the entire plugin.

In the unlikely event that you wish to completely clear all of Rank Math’s data from your database – please keep reading.

**Please note:**You will lose all of your hard work when uninstalling the plugin using the method we’re about to cover. Please only proceed if you’re sure you won’t need that data and want to start from scratch/completely reconfigure Rank Math.

## Completely Removing Rank Math’s Data

If you wish to proceed with completely uninstalling the plugin with all the data, use this filter:

```
/**
 * Filter to remove Rank Math data from the database
 */
add_filter( 'rank_math_clear_data_on_uninstall', '__return_true' );
```

Make sure that you have:

**1.** Activated Rank Math if it is not already enabled.

**2.** Head over to **Appearance → Theme File Editor** (for Classic Theme) or **Tools → Theme File Editor** (for Block Theme) inside your WordPress admin area.

![Navigate to Theme File Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20650%20360'%3E%3C/svg%3E)

**3.** Now, add the above code to your theme’s functions.php file. Ensure that you click the **Update File** button after adding the code.

![Updated functions.php file](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201272%20625'%3E%3C/svg%3E)

**4.** Then navigate to the Plugins page and find Rank Math. Now that we’ve added a filter to delete Rank Math data, you’ll see an irreversible action notice. If you prefer to remove all Rank Math data completely, click **Deactivate** and then **Delete**.

![Completely deactivate and delete Rank Math plugin](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201105%20273'%3E%3C/svg%3E)

**5.** After deleting Rank Math, you can inspect your database to ensure Rank Math’s files are completely deleted. To do that, log into your database.

**Note:**You may need to contact your web host for your database location and login details.

Once done, copy and paste the below prefix into your database search bar.

```
rank_math
```

If you see any Rank Math table with a prefix like this ( `*_rank_math_*` ) then you can click **Drop**to delete the tables from your database.

![Rank Math tables in the database](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201822%20876'%3E%3C/svg%3E)

If you still have any questions about Rank Math – you’re always more than welcome to [contact our dedicated support team](https://rankmath.com/support/), and we’re available 24/7, 365 days a year.

			

			 

			
	
		
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

		

										
			
- [How to Fix the Japanese Keyword Hack in WordPress](https://rankmath.com/kb/fix-japanese-keyword-hack/)

										
			
- [How to Disable Directory Listing in WordPress](https://rankmath.com/kb/disable-directory-listing/)

										
			
- [How Rank Math Prevents Duplicate Content Issues in a WooCommerce Store](https://rankmath.com/kb/woocommerce-duplicate-content-issues/)

										
			
- [How to Fix Indexing Issues in Google Search Console](https://rankmath.com/kb/fix-google-indexing-issues/)

										
			
- [How to Resolve Wordfence Warning for update-1.0.42.php?](https://rankmath.com/kb/fix-wordfence-warning/)

										
			
- [Why GSC Shows “No Referring Sitemaps Detected”](https://rankmath.com/kb/no-referring-sitemaps-detected/)