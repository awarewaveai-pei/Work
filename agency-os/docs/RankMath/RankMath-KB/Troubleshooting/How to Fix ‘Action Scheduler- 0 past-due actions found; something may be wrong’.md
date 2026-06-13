# How to Fix ‘Action Scheduler: 0 past-due actions found; something may be wrong’

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/fix-action-scheduler-warning/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Fix ‘Action Scheduler: 0 past-due actions found; something may be wrong’

			
			

	

Are you encountering the “Action Scheduler: 0 past-due actions found: something may be wrong” warning on your WordPress dashboard? You can fix this error quickly; however, it’s also essential to troubleshoot why the message appears on your dashboard.

In this knowledgebase article, we’ll show you how to fix the ‘Action Scheduler: 0 past-due actions found; something may be wrong’ notice.

## 1  Why Does the ‘Action Scheduler: 0 past-due actions found; something may be wrong’ Warning Occur?

Action Scheduler is designed to schedule and run tasks on a WordPress site automatically. To retrieve all the analytics data, Rank Math uses the WP-Cron and the Action Scheduler by WooCommerce. However, if the [cron jobs are not completed](https://rankmath.com/kb/analytics-issues/#scheduled-actions) on time, it can cause the Action Scheduler notice, as shown below.

![Action Scheduler: 0 past-due actions found; something may be wrong warning ](https://rankmath.com/wp-content/uploads/2022/11/action-scheduler-message.png)

## 2  Fix ‘Action Scheduler: 0 past-due actions found’ Warning

You can follow either of the following ways to remove the warning.

### 2.1  Add Filter

You can add the following filter to remove the warning in your [rank-math.php](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file) file.

```
add_filter( 'action_scheduler_pastdue_actions_check_pre', '__return_false' );
```

**Note:**You can refer to our dedicated tutorial to [add a filter to your site](https://rankmath.com/kb/wordpress-hooks-actions-filters/).

### 2.2  Delete Pending Actions

This notice states there are pending Action Scheduler actions that are not been completed. You can delete the pending actions to remove the warning message.

To delete the pending action, navigate to **Tools → Scheduled Actions** from your WordPress dashboard.

![Scheduled Actions](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20316%20506'%3E%3C/svg%3E)

In the Scheduled Actions page, choose the **Pending Actions** option, as shown below.

![choose pending options](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201668%20246'%3E%3C/svg%3E)

Select the pending actions and choose the **Delete** option from the **Bulk Actions** drop-down menu, as shown below.

![select the Hooks and click Delete to remove the warning](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202524%20788'%3E%3C/svg%3E)

Click on the **Apply** button to further delete the pending actions.

Once deleted, the warning message should be removed from your WordPress dashboard. If you still have questions regarding the Action Scheduler warning – you’re always more than welcome to [contact our dedicated support team](https://rankmath.com/support/). We’re available 24/7, 365 days a year…

			

			 

			
	
		
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