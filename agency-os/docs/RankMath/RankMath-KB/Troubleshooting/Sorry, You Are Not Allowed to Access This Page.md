# Sorry, You Are Not Allowed to Access This Page

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/sorry-you-are-not-allowed-to-access-this-page/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Sorry, You Are Not Allowed to Access This Page

			
			

	

If you’ve tried accessing a settings page inside Rank Math but instead greeted with an error page “Sorry, you are not allowed to access this page.” as shown below, then you’ve come to the right place. This error denotes that you don’t have the required permissions to view the page or save the changes.

![Error: Sorry, you are not allowed to access this page](https://rankmath.com/wp-content/uploads/2021/05/Sorry-you-are-not-allowed-to-access-this-page-1.jpg)

## How to Diagnose & Fix WordPress Permissions

You can come across this permissions error for a number of reasons. And in this knowledgebase article, we’ll help you troubleshoot the issue and walk you through the steps to fix them.

### 1  Check WordPress Settings for URL Mismatch

First, you need to verify that there isn’t any mismatch in the URLs on your WordPress settings. Start by heading over to **WordPress Dashboard → Settings → General**.

Ensure that the **WordPress Address (URL)** and **Site Address (URL)** fields have the same URL, as shown below. If there is any discrepancy in terms of `www` and `http://`, then set your preferred version in both fields and save your changes.

![Check site URL](https://rankmath.com/wp-content/uploads/2022/11/check-site-url.jpg)

### 2  Check If You’re Using Admin Account

To access some of the settings inside Rank Math, you’ll need to have relevant user capabilities. If you’re unable to access a specific page, check if you are using an admin account. By default, an administrator account is set to have all user capabilities. Next, try accessing the same page with an admin account to see if the issue is fixed.

If the issue still persists, proceed to the next step.

### 3  Check Your Access with Role Manager

The next step is to check if you’ve access to **Role Manager** settings inside Rank Math.

![Rank Math Role Manager](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20632%20732'%3E%3C/svg%3E)

If you’ve access to Role Manager, ensure that your user role has been granted with all the required user capabilities. After enabling the required user capabilities, click the **Update Capabilities** button at the bottom of the page to reflect the changes.

![Role Manager capabilities](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201000%20291'%3E%3C/svg%3E)

Now, check if the issue has been resolved.

If you’re still facing the issue, proceed with the following steps.

### 4  Check If You’ve Activated Rank Math Network-Wide

If you’re working in a multisite environment, this error is most likely to occur when Rank Math is not installed in the correct way. We recommend following our detailed tutorial on [installing Rank Math in a multisite environment](https://rankmath.com/kb/installing-rank-math-on-a-multisite-environment/).

**Note:** Site admins cannot install a new plugin on their own, and only the Super admin can install the Rank Math plugin on the Network Admin. Once the Rank Math plugin is installed network-wide, the site admins can only activate or deactivate Rank Math on their sub-site.

### 5  Uninstall Rank Math & Install Again

The last method is to uninstall the Rank Math plugin completely and then install it once again.

**Caution**: During this uninstallation process, you will lose all the Rank Math data, including your settings and metadata for your posts, terms, and users. Hence we recommend you to [backup](https://rankmath.com/blog/backup-wordpress-site/) all your Rank Math configurations and post data to your computer before proceeding further.

**Exporting Rank Math Settings**: You can use the [Export Settings](https://rankmath.com/kb/import-export-settings/#export-settings) feature of Rank Math to save a copy of your Rank Math settings to your computer.

**Exporting Rank Math SEO Metadata**: If you’re a Rank Math PRO user, you can save a copy of your SEO metadata as a [CSV file](https://rankmath.com/kb/editing-seo-meta-at-scale/#num-2-1-exporting-your-current-settings-to-a-csv-file) to your computer. If you’re a Rank Math Free user, you can use the [Export option](https://wordpress.org/support/article/tools-export-screen/) inside your WordPress dashboard to create a backup of your website in XML format.

Once you’ve created a backup, [add the following code snippet](https://rankmath.com/kb/wordpress-hooks-actions-filters/) to your theme’s [rank-math.php](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file) file.

```
/**
 * Filter to remove Rank Math data from the database
 */
add_filter( 'rank_math_clear_data_on_uninstall', '__return_true' );
```

Then, deactivate & uninstall the Rank Math plugin from your **Plugins** page inside your WordPress admin area.

Now, [install the Rank Math plugin](https://rankmath.com/kb/installing-through-the-admin-panel/) once again and check if the issue is fixed. Once the issue has been resolved,

- Import your Rank Math settings using the [Import Settings](https://rankmath.com/kb/import-export-settings/#importing-your-settings) feature of Rank Math.

- Next, you’ll have to import your SEO metadata. If you’ve used the CSV method, you can [import the CSV file](https://rankmath.com/kb/editing-seo-meta-at-scale/#num-2-3-import-the-csv-file), as shown in this tutorial. Instead, if you’ve created a backup of your website’s data with an XML, use the [WordPress Importer](https://wordpress.org/support/article/importing-content/#wordpress) to restore the metadata.

- And, that’s it!

We hope you were able to resolve the issue. If you’re still facing this error, please feel free to [reach our support team](https://rankmath.com/support/), as we’re always here to help.

			

			 

			
	
		
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