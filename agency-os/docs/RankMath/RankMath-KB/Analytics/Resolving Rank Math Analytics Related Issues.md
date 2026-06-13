# Resolving Rank Math Analytics Related Issues

> **Category:** Analytics
> **Source:** https://rankmath.com/kb/analytics-issues/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Resolving Rank Math Analytics Related Issues

			
			

	

In this knowledgebase article, we’re going to walk you through how to deal with issues you may encounter with Rank Math’s Analytics module, depending on your setup.

## Table of Contents

- [No Data in Analytics Module](#no-data)

- [Analytics Metrics Drops to Zero](#analytics-metrics-drop-to-zero)

- [Expired Google OAuth Token](#expired-google-oauth-token)

- [Mismatch Collations and Character Set](#mismatch-collations-character-set)

- [Data Not Visible in Real-Time in Google Analytics](#real-time-data-ga)

- [Rank Math SEO Score Shown in Analytics is Incorrect / Multiple Entries](#incorrect-seo-score)

- [Can’t Install/Configure Google Analytics 4](#can't-install-ga4)

- [Web Hosting Killing off Long-Running Processes](#web-host-killing-processes)

## 1  No Data in Analytics Module

There could be a number of underlying issues why you might not be seeing data in your Analytics module. Here are they and how you could resolve them.

### 1.1  **GA4 – No Data Received from Your Website Yet Error**

If you’ve recently connected to Google Analytics 4 using Rank Math and your Google Analytics account shows the message – **No Data received from your website yet**, as shown below.

![No data received from your website yet - Google Analytics](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201202%20556'%3E%3C/svg%3E)

To check if you’ve added the Google Analytics tracking code to your site, the easiest way is to look for the presence of the measurement ID that goes by G-XXXXXX in the source code. You can also try searching  `google_gtagjs` to trace the measurement ID in the source code easily.

![Check for measurement ID in page source code](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20999%20391'%3E%3C/svg%3E)

Please note that the GA4 property selection in the Rank Math Analytics settings will only connect Rank Math with the Google Analytics property for fetching and displaying the data in the Analytics property. You still need to **add the tracking code for Google Analytics to measure your site’s performance**.

![Rank Math is connected with Google Analytics ](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20751%20414'%3E%3C/svg%3E)
Rank Math is connected with Google Analytics – but does not add a Tracking code.

If you aren’t making use of any external plugin or theme to add the tracking code, then make use of Rank Math’s feature to install the Analytics code. Under Rank Math’s Analytics settings, enable the **Install Analytics code** option as shown below.

![Install Analytics code](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20753%20563'%3E%3C/svg%3E)
Rank Math is now connected with Google Analytics and adds the Tracking code

Now, you can clear your site’s cache and check for the tracking code added to the front end.

We’d also recommend you make use of the Tag Assistant from Google to verify if the correct Analytics code has been added to the frontend.

It is also necessary to ensure that the Google Analytics tracking code is implemented correctly on all the pages of your website. If there are any issues or errors in the implementation, the tracking code may fail to collect data.

### 1.2  **Scheduled Actions Did Not Run**

Rank Math makes use of the Action Scheduler by WooCommerce to fetch all the analytics data and makes use of the WP-Cron. [Cron](https://developer.wordpress.org/plugins/cron/) is a technical term used for commands to run on scheduled time or at regular intervals. For example, most web servers use it to maintain the server and run scheduled tasks. A Cron job is a task itself used to schedule tasks at periodic fixed times, dates, or intervals. For example, checking for updates, deleting old comments from trash, etc.

WP-Cron (also known as WordPress Cron) includes a set of automated tasks for the WordPress core to perform.  The WP-Cron does not run automatically like the Server Cron, WP-cron runs only on the page load. So if your website has very few visits, then WP-cron running on scheduled time is less likely. Alternatively, you can [consider configuring Server Cron to trigger WP-Cron](https://www.hostgator.com/help/article/how-to-replace-wordpress-cron-with-a-real-cron-job).

You can check the status of the scheduled actions under **WordPress Dashboard → Tools → Scheduled Actions → Pending** to see if the WP-cron has run the actions as scheduled. If you’re unable to find the scheduled actions in your WordPress dashboard, you can make use of the following URL to reach the page, be sure to replace `yourdomain.com` with your website domain.

```
https://yourdomain.com/wp-admin/tools.php?page=action-scheduler&status=pending
```

From the pending actions, you can check for any Rank Math analytics actions and **run** them manually to fetch the data. Rank Math’s analytics hook goes by the name `rank_math/analytics/data_fetch`.

![Run Rank Math Analytics data fetch manually.](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201098%20503'%3E%3C/svg%3E)

Once you run the data fetch, you’ll see a success notice, as shown below.

![Rank Math Analytics data fetch action ran successful](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201100%20109'%3E%3C/svg%3E)

This indicates that Rank Math has executed the action to start fetching the data, and Rank Math would now automatically fetch the data in the background.

Alternatively, from the Analytics settings at **Rank Math SEO → General Settings → Analytics**, you can choose to **Delete Data** and **Update Data manually** from the Analytics settings.

![Update data manually from Analytics settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201524%20562'%3E%3C/svg%3E)

### 1.3  Check CRON Issues

When your website does not make use of the Server CRON and is completely dependent on the WP-CRON, then in the wp-config.php file, ensure that `DISABLE_WP_CRON` is set to `false`.

```
define('DISABLE_WP_CRON', false);
```

Next to identify other CRON issues on the site, install and activate the [WP Crontrol plugin](https://wordpress.org/plugins/wp-crontrol/) from **Plugins → Add New** section from your WordPress dashboard as shown below:

![Install and Activate WP Crontrol plugin](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201602%20874'%3E%3C/svg%3E)

Upon activation, navigate to the **Tools → Cron Events** page from the WordPress dashboard to control the Cron settings.

![Navigate to Cron Events](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20322%20674'%3E%3C/svg%3E)

Next, check if any WP-Cron errors prevent the WP Cron from running successfully. For example, if you notice any error located just above the Cron Events, you can find more information about the error by clicking on the More Information link and passing the same to the user.

![Cron Error](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201982%20638'%3E%3C/svg%3E)

### 1.4  Domain Name Doesn’t Match With Google Analytics

It is possible that you might’ve created your Google Analytics property on a staging website, or you might have migrated domains over the period of time. So if the domain name doesn’t match with what is configured in Google Analytics, then Rank Math might not be able to fetch the data.

To check the configured domain name in the Google Analytics account, identify the **GA property** your Rank Math Analytics is connected with. And in the Google Analytics account, head over to **Admin → Property → Property Settings**.

Here in the **Default URL**, ensure that the domain name is the same as that of the actual site where you’re fetching Analytics data.

![Check domain in Google Analytics](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201133%20570'%3E%3C/svg%3E)

### 1.5  Test Connections

Rank Math could have been unable to fetch your data because of any possible glitch in your Google Analytics connection. To test Rank Math’s connection with your Google account, head over to **Rank Math SEO → General Settings → Analytics**.

Click the **Test Connections** option at the top right of the Analytics settings, as shown below. Please note this option is available only in the [Advanced Mode of Rank Math](https://rankmath.com/kb/switch-from-easy-to-advanced-mode/).

![Test connections](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20757%20303'%3E%3C/svg%3E)

Once you click the option, Rank Math will start to validate the existing connections. A green signal indicates a valid connection. And a red signal, as shown below, indicates a glitch in the corresponding connection.

![Issue with Google Analytics connection](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20746%20416'%3E%3C/svg%3E)

To fix this, simply reconnect with your Google account.

![Reconnect Search Console connection](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20762%20308'%3E%3C/svg%3E)

If the issue persists even after you reconnect your Google account or you see a red signal again when you validate your connection again, we would suggest you [open a support ticket here](https://rankmath.com/support/) and share the [error log](https://rankmath.com/kb/rank-math-status-and-tools/#error-log) with us.

### 1.6  Import New Data Manually

If you do not see any errors and the cron jobs are running correctly, you can then import new data. To do so, navigate to the Analytics section located under **Rank Math SEO →** **General Settings** settings.

Before you import your data, please ensure that the Search Console and [Analytics](https://rankmath.com/kb/install-google-analytics/) module are connected in the right way. Also, there should be organic data in your Google Search Console or Google Analytics profile.

![Analytics and Search Console connected](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201008%20854'%3E%3C/svg%3E)

**Note:** Under the Property drop-down, GA4 properties can be identified with the suffix `-GA4`.

Next, scroll down the page and click on **Delete Data** in the **Analytics Database** section. Once deleted, click on **Update Data manually**. Your data will be fetched within a few minutes.

![Delete and Update data in Analytics](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201524%20562'%3E%3C/svg%3E)

Next, head over to the Analytics page from **Rank Math SEO → Analytics**. On this page, you can check for errors in the Search Console or any errors due to plugin conflict. To do so, right-click on the page and click on Inspect Element.

![Check Developer Console for any errors](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201280%20472'%3E%3C/svg%3E)

If the error is due to a plugin conflict, we recommend [running a plugin conflict](https://rankmath.com/kb/check-plugin-conflicts/) and seeing if the error goes away.

## 2  Analytics Metrics Drops to Zero

There could be instances where one or more of the Analytics metrics drops to zero. The following steps will help you debug the issue.

### 2.1  Check if You’ve Connected to GA3 or GA4

When the Analytics drops to zero, there could be a number of causes, and one among them is the incorrect configuration of GA3 or GA4. The most likely cause is that you have connected Rank Math with Google Analytics 4, but you’ve added Universal Analytics tracking code through other means or vice versa.

**Solution:** If you’re adding the Google Analytics tracking code using Rank Math, then Rank Math would add the correct version of the Google Analytics tracking code.

To identify the tracking code you’ve added to the site, we recommend making use of the [Tag Assistant here](https://tagassistant.google.com/).

Start by adding the domain on the Tag Assistant.

![Add domain in Tag Assistant](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201216%20290'%3E%3C/svg%3E)

In the popup that appears on the screen, enter the website’s URL and choose the **Connect** button.

![Connect with Tag Assistant](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20685%20510'%3E%3C/svg%3E)

The Tag Assistant will now open the URL in a new window in the debug mode. In the lower right corner of the window, you can notice a notification mentioning Tag Assistant Connected with your website. You can click the **Finish** button here as the debug information will be visible on the Tag Assistant window.

![Close Tag Assistant popup](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201263%20260'%3E%3C/svg%3E)

In the Tag Assistant window, click the **Continue** button to view the debug information.

![Click Continue in Tag Assistant](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201273%20535'%3E%3C/svg%3E)

From the below screenshot, you can notice that the Google Analytics 4 measurement ID has been correctly added to the page, and in response, the Google Analytics container has recorded a page view for it. So if you intend to use Google Analytics 4 with Rank Math, then you’ve set it up correctly.

![Tag Assistant debug information](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201273%20475'%3E%3C/svg%3E)

If you’re interested in setting up the Universal Analytics (Google Analytics 3) property, then you should see the `UA-` based tracking code in the Tag Assistant as shown below.

![Universal Analytics property in Tag Assistant debug information](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201272%20477'%3E%3C/svg%3E)

### 2.2  Check if Rank Math is Updated to the Latest Version

Next, head over to **WordPress Dashboard → Plugins → Installed Plugins** and ensure that the latest version of Rank Math and Rank Math PRO is installed on the site. If not, we recommend you update Rank Math to the latest version.

![Rank Math plugins updated to the latest version](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20349'%3E%3C/svg%3E)

You can check our [changelog here](https://rankmath.com/changelog/) for the latest stable version.

### 2.3 Check if Your Website is Connected to Rank Math Account

Ensure that your website is connected to the Rank Math account from the [Client Management dashboard here](https://rankmath.com/my-account/websites/).

![connected websites](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202419%201539'%3E%3C/svg%3E)

If your site is not listed here in the connected sites, then you need to [reconnect your site with Rank Math following the tutorial here](https://rankmath.com/kb/website-not-shown-in-account/).

However, if your website’s connection with Rank Math keeps dropping very often, we request you [follow this tutorial and resolve them permanently](https://rankmath.com/kb/fix-automatic-update-unavailable-for-this-plugin/#unable-to-encrypt).

### 2.4  Check if Refresh Tokens Are Available

You can check the status of the refresh token from the Status and Tools of Rank Math. To do so, head over to **Rank Math SEO → Status and Tools → System Status**.

Here in the System Info, you can check the status of **Google Refresh Token** under Rank Math.

![Google Refresh Token](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%201146'%3E%3C/svg%3E)

If the Google Refresh Token shows the status as ‘**No Token**‘, then it means that the refresh tokens are not available for Rank Math to regenerate the token. If the refresh token is not available, then follow the tutorial below to fix it.

### 2.5  Check the Country-Wise Data

If you’ve chosen to show data only from a specific country, ensure that there are organic visitors coming from that country.

For instance, if you’ve set the country as Italy, and if you do not have traffic from Italy, then the graph will show zero traffic. As Rank Math doesn’t report direct, referral or social traffic, there is always going to be a mismatch between the Google Analytics or Google Search Console data and the data Rank Math reports.

![check country-wise data](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202142%201311'%3E%3C/svg%3E)

### 2.6  Log Analytics Issues

If the above solutions don’t resolve the issue, then please create an Analytics debug log file as discussed below. This debug log file will record details of the Analytics issues that our support experts can further examine.

To create this Analytics debug log file, add the below filter to your WordPress theme’s [rank-math.php](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file) file. You can also refer to this tutorial on how to [add a filter to your website](https://rankmath.com/kb/wordpress-hooks-actions-filters/).

```
add_filter( 'rank_math/analytics/log_response', '__return_true' );
```

Once you’ve added the filter, head over to **WordPress Dashboard → Tools → Scheduled Actions → Pending** and run the pending Scheduled Action as shown below. Rank Math’s analytics hook here goes by the name `rank_math/analytics/data_fetch`.

![Run Rank Math Analytics data fetch manually.](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201098%20503'%3E%3C/svg%3E)

Once a few actions have run, open a [support ticket here](https://rankmath.com/support/) and share the Analytics debug log file with us. The Analytics debug log can be found under _/wp-content/uploads/rank-math_ in your website directory. You can download the file from here and share it with us using a file-sharing tool like [WeTransfer](https://wetransfer.com/).

## 3  Expired Google OAuth Token

Navigate to [your Google Account](https://myaccount.google.com/permissions?gar=1&pli=1) and remove the Rank Math app. You can find Rank Math under **Third-party apps with Account access** and click the **Remove Access** button as shown below.

![Remove Rank Math app from Google account](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201433%202072'%3E%3C/svg%3E)

Now, you need to reconnect Rank Math with your Google account. Head over to **Rank Math SEO →** **General Settings → Analytics**, and click on the **Reconnect** button at the top.

![Reconnect Rank Math with Google account](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202362%201270'%3E%3C/svg%3E)

On the next screen, allow all permissions.

![Accept permissions](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201200%20723'%3E%3C/svg%3E)

Now, in the Analytics settings of Rank Math, you need to select all the values in the drop-down list to [configure Analytics properties](https://rankmath.com/kb/connect-your-google-account/) and then click on **Save Changes**.

![Configure Analytics settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201547%202560'%3E%3C/svg%3E)

You should be getting a similar notice as shown below after 30 seconds of clicking the **Save Changes**button (page reload required).

![Rank Math importing the data](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20853%20190'%3E%3C/svg%3E)

## 4  Mismatch Collations and Character Set

In case Rank Tracker does not include your tracked keywords, then we recommend checking the Error log on your website. You can do so by heading over to **Rank Math SEO →** **Status & Tools → System Status** inside your WordPress dashboard (ensure you’re using the Advanced mode of Rank Math).

Here scroll down to find the Error log. If you’re seeing the error notice ‘**Table wp_rank_math_analytics_keyword_manager doesn’t exist**‘, then it is likely to be a database collation issue.

![wp_rank_math_analytics_keyword_manager doesn't exist](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201010%20596'%3E%3C/svg%3E)

To resolve this issue, head over to **Rank Math SEO → Status and Tools → Database Tools** and scroll down to find the option **Re-create Missing Database Tables**.

![Database Tools option under Status and Tools](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201942%201188'%3E%3C/svg%3E)

Click the **Re-create Tables** option, as shown below.

![Re-create Missing Database Tools](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20970%20142'%3E%3C/svg%3E)

Now, Rank Math would resolve the issue by creating a new database table for the missing one.

**However, please note that the keywords originally tracked will not be available anymore, and you need to add the keywords to the Keyword Manager once again to track the performance of these keywords.**

## 5  Data Not Visible in Real-Time in Google Analytics

When you use the self-hosted option, the live tracking on the website doesn’t happen anymore, and all the data is sent to be parsed later. It also takes somewhere from 24h to 48h for Google Analytics to process the entire data set.

To check if your site uses the self-hosted option from Rank Math, head over to the Analytics settings under **WordPress Dashboard**→**Rank Math SEO → General Settings → Analytics**.

![Self-Hosted Analytics JS File](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20742%20564'%3E%3C/svg%3E)

Here you’d find the **Self-Hosted Analytics JS File** option. If the option is enabled, then live tracking doesn’t happen anymore on the site.

**Note:** The **Self-Hosted Analytics JS File** option is available only in the [PRO](https://rankmath.com/pricing/) version of Rank Math and would appear only if you had enabled the **Install Analytics Code** option.

## 6  Rank Math SEO Score Shown in Analytics is Incorrect / Multiple Entries

If you notice that the Rank Math SEO score shown in the Analytics module is incorrect or there are multiple entries of the same post, then it is likely to be an issue with the index Rank Math uses for Analytics. But this could be easily resolved as you head over to **Rank Math SEO→ Status & Tools → Database Tools → Rebuild Index for Analytics**. (ensure you’re using Rank Math in the Advanced mode)

![Navigate to Database Tools](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201942%201188'%3E%3C/svg%3E)

Click the **Rebuild Index** option as shown below, and Rank Math will start to re-index your posts.

![Rebuild Index for Analytics](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20964%20140'%3E%3C/svg%3E)

## 7  Can’t Install/Configure Google Analytics 4

If you’re trying to install Google Analytics 4 using Rank Math, but you aren’t seeing options to create GA4 property, as shown below.

![Create a new GA4 property](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201113%20512'%3E%3C/svg%3E)

Then check if the site uses an old version of Rank Math and update it. The feature to create and connect with GA4 properties is available only from [version 1.0.88](https://rankmath.com/blog/google-analytics-4-integration/).

## 8  Web Hosting Killing off Long-Running Processes

Some web hosting like WP Engine might kill long-running processes, and as a result, you may not see the Analytics data inside Rank Math.

In this case, you will need to check with your web host to whitelist Rank Math’s data fetch processes.

## Conclusion

And that’s it. We hope the article helped you resolve the Analytics issues on your website. However, if you still have any questions or any issues related to the analytics in Rank Math, please feel free to contact our [support team](https://rankmath.com/support/), who are available 24×7 and will help you in the best possible way.

			

			 

			
	
		
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

		

										
			
- [How to Create SEO Reports for Clients](https://rankmath.com/kb/create-seo-reports-for-clients/)

										
			
- [How to Check the Traffic Source of Your Website](https://rankmath.com/kb/check-the-traffic-source-ga4/)

										
			
- [How Long Does It Take for Google Analytics 4 to Show Data?](https://rankmath.com/kb/ga4-data-freshness/)

										
			
- [How to Track Affiliate Link Clicks on Your Website](https://rankmath.com/kb/track-affiliate-link-clicks/)

										
			
- [How to Track File Downloads on Your Website](https://rankmath.com/kb/track-file-downloads/)

										
			
- [How to Track Outbound Links and Monitor Click Data on Your Site](https://rankmath.com/kb/track-outbound-links/)