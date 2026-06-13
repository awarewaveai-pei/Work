# Fatal Error Happening on Some Installations After 1.0.49 Update

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/fatal-error-after-1-0-49-update/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Fatal Error Happening on Some Installations After 1.0.49 Update

			
			

	

If you are getting a Fatal error on your website with the following error:

`Fatal error: Uncaught RuntimeException: Error saving action: Error saving action: Table 'dbname.prefix_wp8o_actionscheduler_actions' doesn't exist in /…/wp-content/plugins/action-scheduler/classes/migration/ActionScheduler_DBStoreMigrator.php:44`

Or something similar including action-scheduler in the error, then please follow the following steps to fix the issue.

1  **Before performing any action, we recommend taking a [backup](https://rankmath.com/blog/backup-wordpress-site/) of your database.**

2  Use our **Repair Action Scheduler plugin** that can fix this issue automatically on most sites:
[https://github.com/rankmath/_repair-action-scheduler](https://github.com/rankmath/_repair-action-scheduler)

**For a multisite, use the following files:**
[https://github.com/rankmath/_repair-action-scheduler-multisite](https://github.com/rankmath/_repair-action-scheduler-multisite)

On the GitHub page, we linked, click on the green “Code” button and then on “Download ZIP”. Then upload that ZIP file to your site on this admin page: **Plugins → Add New → Upload Plugin**

![Repair Action Scheduler Error Plugin](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202518%201000'%3E%3C/svg%3E)

Once you activate the plugin, it should do its thing and then deactivate itself automatically. The following messages might show up:

```
Created table: actionscheduler_actions
Created table: actionscheduler_claims
Created table: actionscheduler_groups
Created table: actionscheduler_logs

The Repair Action Scheduler plugin has been automatically deactivated.
```

Then you should be able to activate and use Rank Math without any issue.

3  **Here’s a video screencast:**
[https://i.rankmath.com/KStFug](https://i.rankmath.com/KStFug)

## For Advanced Users

### Or, you can install this plugin:

> [Code Snippets](https://wordpress.org/plugins/code-snippets/)

**A.** Head over to the Snippets menu in the left sidebar and click **Add New**.
![add new snippet](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%200%200'%3E%3C/svg%3E)

**B.** Give that post any name and copy the below code in the Code field
`add_action( 'init', function() { delete_option( 'schema-ActionScheduler_StoreSchema' ); } );`

**C.** Select **‘Only run in administration area’**option and click the **Save Changes and Activate** button.

![rank math code snippets code](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202166%201844'%3E%3C/svg%3E)

**D.** **Open WordPress Dashboard in a new window**

**E.** Then deactivate recently created snippet from here
![disable snippet](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%200%200'%3E%3C/svg%3E)

**F.** Then activate Rank Math plugin again.

**G.** Please **disable the Code Snippets plugin** if you are not going to use it.

**Here’s a video screencast:**
https://i.rankmath.com/79gPbv

**Please clear all the cache, including the server after following the above process.**

### Why is this issue happening?

This issue is caused by a third-party library included in Rank Math. We have contacted its authors and we’re working together to find a solution for this.

Here are the tickets that we have opened with them:
https://github.com/woocommerce/action-scheduler/issues/625#issuecomment-707326921
and
https://github.com/woocommerce/woocommerce/issues/27932

If we apply the fix to everyone, that could have severe implications as not everyone is facing this issue.

This is most likely caused by some of your older plugin that did not remove the Action Scheduler’s tables when removing/upgrading itself and now when the Rank Math plugin is trying to create new custom tables, the process is failing. It could also be because of a conflict with one of the plugins or the theme you are using.

### Why only some of my sites are affected?

Over half a million websites uses the Rank Math plugin, but this issue occurs only on a handful of websites. This happens because some of your other plugin(s) uses an older version of Action Scheduler and did not update it to the latest version or you removed that plugin.

Though, the above steps should help you fix the issue.

			

			 

			
	
		
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