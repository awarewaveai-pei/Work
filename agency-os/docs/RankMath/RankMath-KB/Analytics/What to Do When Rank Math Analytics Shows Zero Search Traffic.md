# What to Do When Rank Math Analytics Shows Zero Search Traffic

> **Category:** Analytics
> **Source:** https://rankmath.com/kb/zero-search-traffic-error/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# What to Do When Rank Math Analytics Shows Zero Search Traffic

			
			

	

If your Analytics data in Rank Math shows zero search traffic, then there could be a wide range of reasons causing this issue, but most likely due to an incorrect configuration with Rank Math or Google Analytics.

In this knowledgebase article, we’re going to walk you through the steps to fix the search traffic zero in Rank Math Analytics.

## Table of Contents

- [Check the Google Analytics Property You Use](#ga-property)

- [Update to the Latest Version of Rank Math](#update-latest-version)

- [Check if Rank Math SEO Account is Connected](#connect-with-rank-math-account)

- [Refresh Tokens](#refresh-tokens)

## 1  Check the Google Analytics Property You Use

First, you need to check if you’re using the Google Analytics Universal property or Google Analytics 4 and choose to connect with the correct version. Rank Math offers you huge support for [GA4 API](https://developers.google.com/analytics/devguides/reporting/data/v1) Integration and still continues support for Universal Analytics property.

Once you’ve chosen the correct analytics version, ensure that you’ve added the Google Analytics code. In case, you don’t use any other plugins to add the Google Analytics code, then you can do by enabling the **Install analytics** **code** option in Rank Math.

**Note:** You need to add the Google Analytics code to your website for Google Analytics to measure your site’s performance. Else you’re likely to notice the search traffic zero on your website.

![Create new GA4 property](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20746%20415'%3E%3C/svg%3E)

Here is a dedicated tutorial that would help you [integrate Rank Math with GA4](https://rankmath.com/kb/using-ga4/).

## 2  Update to the Latest Version of Rank Math

Next, you would need to ensure that you’re using the latest version of Rank Math. You can keep track of the latest plugin updates through our [official changelog, available here](https://rankmath.com/changelog/).

To check if you’re using the latest version of Rank Math, navigate to **Plugins →** **Installed Plugins** inside your WordPress dashboard.

![Open Installed Plugins in WordPress](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201071%20373'%3E%3C/svg%3E)

If there are any updates available for Rank Math and Rank Math PRO, you can find them here. To update the plugin, click the **update now** link below the plugin. If you’re unable to see the update now link for Rank Math PRO, it is because Rank Math PRO can be updated only after the Rank Math SEO plugin is updated to the latest version.

![Update Rank Math SEO plugin](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201029%20576'%3E%3C/svg%3E)

Alternatively, you can [setup automatic updates](https://rankmath.com/kb/version-control/) so that every time a new update is available, Rank Math will be automatically updated.

## 3  Check if Rank Math SEO Account is Connected

Next, you’d need to ensure that your website is connected with Rank Math SEO. In case, if you have multiple Rank Math accounts, ensure that your website is connected with the **Rank Math account having a PRO license**.

Login to your Rank Math account and navigate to the My Account area. Click on the **Websites** tab from the left sidebar.

![Open the Websites tab](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201353%20961'%3E%3C/svg%3E)

The Websites tab lists down all the websites connected with your Rank Math account.

![Connected Websites with Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201706%20711'%3E%3C/svg%3E)

If you find your website is not listed here, then you would need to reconnect your website with the Rank Math account. To do so, head over to **Rank Math SEO → Dashboard → Help** and then click **Disconnect Account**, as shown below.

![Disconnect Account in Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201258%20457'%3E%3C/svg%3E)

Now you’ll be able to connect your account with Rank Math once again by clicking the **Connect Now** button and following the on-screen instructions.

![Click Connect Now](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202366%201065'%3E%3C/svg%3E)

## 4  Refresh Tokens

If you’ve followed the above steps and the Analytics data still appears zero, then it is possible the authorization tokens coming from Google could have expired, and as a result, Rank Math’s Analytics module is not able to fetch the data from Analytics API.

So you need to reconnect the Google services for your website to regenerate the token and be able to fetch the data correctly once again.

To refresh the authorization tokens,

### 4.1  Delete Rank Math App

Open the Google Account permissions [from here](https://myaccount.google.com/permissions). From the list of apps connected with your Google Account, delete Rank Math SEO as shown below.

![Remove Access to Rank Math SEO](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201433%202072'%3E%3C/svg%3E)

### 4.2  Recreate Database tables

Now navigate to **WordPress Dashboard → Rank Math SEO →** **Status & Tools → Database Tools**.

![Open Database Tools](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202046%201270'%3E%3C/svg%3E)

And then, scroll down the page to find Re-create Missing Database Tables option. Click the **Re-create Tables** button.

![Re-create Missing Database Tables](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201006%20406'%3E%3C/svg%3E)

### 4.3  Reconnect Your Google Account

Next, navigate to **Rank Math SEO →** **General Settings → Analytics** and then click the **Reconnect** link to disconnect and [connect your Google Account with Rank Math](https://rankmath.com/kb/connect-your-google-account/) once again.

![Reconnect Google Account service in Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202362%201270'%3E%3C/svg%3E)

Once you’ve connected and configured Analytics settings, Rank Math will start fetching the data.

You can check the connections between Rank Math and your Google account if you notice any delays in retrieving Analytics data. To do so, click the **Test Connections**option located at the top right of the Analytics settings, as shown below.

![click Test Connections](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202096%201320'%3E%3C/svg%3E)

If the data fetch doesn’t happen, choose **Update data Manually**.

![Update data manually](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201498%20484'%3E%3C/svg%3E)

This process may take some time. The usual time required to populate the data in the Analytics Dashboard is below 20 minutes, but the time may vary depending on your server’s speed.

### 4.4  Rebuild Index for Analytics

Now head over to Database Tools once again and then click **Rebuild Index** for Analytics.

![Rebuild Index for Analytics](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20978%20412'%3E%3C/svg%3E)

### 4.5  Check if the Data is Present

Now open the Analytics dashboard by navigating to **Rank Math SEO →** **Analytics** and check if the data is present.

![Rank Math Analytics](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201102%20569'%3E%3C/svg%3E)

### 4.6  Copy System Info to Clipboard

In case the data is still not appearing, then open **Rank Math SEO → Status & Tools → System Status** and then click **Copy System Info to Clipboard**.

![Copy System Info to Clipboard](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201754%201210'%3E%3C/svg%3E)

Next, open a new [support ticket at the Rank Math support forum](https://rankmath.com/kb/getting-support/) and then add the copied system info to the ticket details, so that our support expert can look into the issue.

And that’s it! If you still have any questions about why the data in Rank Math Analytics doesn’t match up with what you see in Google Analytics – please feel free to [reach our support team directly from here](https://rankmath.com/support/), and we’re always here to help.

			

			 

			
	
		
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