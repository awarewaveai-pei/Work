# How to Find the Search Terms Used on Your Site

> **Category:** Analytics
> **Source:** https://rankmath.com/kb/find-the-search-terms-in-ga4/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Find the Search Terms Used on Your Site

			
			

	

Do you know how visitors use the search bar on your site to find what they need? Imagine being able to peek into exactly what they’re looking for—it’s like having a cheat sheet to their interests. What do they want? What are they struggling to find? And, more importantly, what opportunities are waiting for you to seize, whether it’s new content or products?

The good news is that you can track those search terms easily with Google Analytics, and Rank Math helps you set up Google Analytics 4 on your website.

In this knowledgebase guide, we’ll walk you through the steps to find the search terms people use on your site with the help of Google Analytics.

## 1  Ensure Google Analytics Is Connected to Your Site

Before starting, ensure your website is connected to Google Analytics and collect performance data.

If Google Analytics isn’t set up yet, Rank Math SEO makes connecting Google Analytics simple and code-free. [Follow this guide](https://rankmath.com/kb/install-google-analytics/) and enable the **Install analytics code** option in Analytics settings, as shown below.

![Install analytics code via Rank Math](https://rankmath.com/wp-content/uploads/2024/12/Install-analytics-code-via-Rank-Math-1.png)

Once you’ve successfully connected it, you’re all set to proceed!

## 2  Access Your Data Stream

Start by logging into your [Google Analytics account](https://analytics.google.com/analytics/gallery/). From the dashboard, navigate to the **Admin** section in the left-hand menu.

![Admin section in Google Analytics](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201227%20978'%3E%3C/svg%3E)

Once you’re in the Admin settings, locate the **Property Settings** side menu. Open the **Data collection and modification** toggle and click on **Data streams**.

![Navigate to Data streams on GA](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20595'%3E%3C/svg%3E)

On the Data Streams page, find the stream associated with your website and select it. This will open your site’s data stream details on the right side of the screen.

![Select your website data stream on GA](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20509'%3E%3C/svg%3E)

## 3  Enable Enhanced Measurement

Scroll down within your data stream settings to find the **Enhanced measurement** section. Enhanced measurement is a powerful feature that automatically tracks certain events—like site searches—without needing extra tags or code.

Make sure the Enhanced measurement toggle is enabled, then click on the **settings icon** to configure site search tracking, as shown below.

![Enable Enhanced measurement in GA](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20718'%3E%3C/svg%3E)

When the settings menu opens, look closely at the options. You’ll notice several toggles enabled by default. Locate the **Site search** toggle and enable it if it’s not already turned on.

![Enable Site search in GA](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20735'%3E%3C/svg%3E)

## 4  Specify the Query Parameter

With Site Search enabled, you’ll need to identify the query parameter your site uses to capture search terms. This is easy to find. Simply perform a search on your site and examine the URL in your browser’s address bar.

The query parameter is the part of the URL that holds the search term. Different sites use different parameters—some might use `s`, others `q`, or even something unique.

For instance, a search on the Rank Math knowledge base uses the query parameter `q`.

![q query parameter](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20675'%3E%3C/svg%3E)

On another test site, the parameter was `s` instead, as shown below.

![s query parameter](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20366'%3E%3C/svg%3E)

Check your site’s query parameter to confirm. Once you’ve identified your query parameter, return to the Site search settings in Google Analytics. Click on the **Show advanced settings** link to expand the options.

Here, you’ll find a field to enter your site’s query parameter. Common defaults like `q`,`s` might already be listed and separated by commas. If your parameter isn’t there, add it to the list—placing it first if you prefer—while keeping the same comma-separated format, as shown below.

![add query parameter to GA](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201241%20963'%3E%3C/svg%3E)

When done, scroll back up and click the **Save** button to apply your changes.

## 5  View Search Terms in Google Analytics

Now that everything is configured, Google Analytics will need a few hours (at least 24 hours) to start collecting data on search activity. Note that it can’t track searches made before this setup.

If your site doesn’t get much traffic, you can test it yourself by performing a few searches.

After some time, log back into your Google Analytics account to view the data. Navigate to **Reports → Engagement → Events**.

![Events report on Google Analytics](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20633'%3E%3C/svg%3E)

On the Events report page, scroll down and look for the `view_search_results` event. This event is automatically triggered when a user performs a search on your site. Click on it to analyze the search activity, as shown below.

![the view_search_results event](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20678'%3E%3C/svg%3E)

Within the `view_search_results` event page, scroll down to the **Events in Last 30 Minutes** section. You’ll see a dropdown field labeled **PARAMETER NAME**.

![View search results events dropdown](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201387%20804'%3E%3C/svg%3E)

Click on the dropdown and select the `search_term` dimension to add it to the report.

![the search_term dimension in GA](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201372%20756'%3E%3C/svg%3E)

Once selected, the report will display the exact terms users searched for on your site in the _last 30 minutes_, as shown below.

![find search terms used on your site](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201362%20873'%3E%3C/svg%3E)

Over time, you can analyze these reports to gain deeper insights into user behavior. However, this is not exactly what you’re looking for, as this data only shows searches within the last 30 minutes of a user’s visit. To view search terms over a longer period, you need to customize the report.

## 6  Customizing the Report to Show Data Over a Longer Period

To do this, go to **Admin** → **Custom definitions** in your GA4 account.

![Custom Definitions](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201191%20984'%3E%3C/svg%3E)

Next, click the **Create custom dimension** button, as shown below.

![GA4 custom definitions](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20553'%3E%3C/svg%3E)

A slide-in panel will appear from the right side to create the custom dimension. Set it up as follows:

- **Dimension name**: Enter `search_term`

- **Scope**: Select **Event**

- **Description**: Leave it empty, as this is for internal use only.

- **Event parameter**: Search for and select `search_term` from the dropdown list.

Once everything is configured, it should look like this. Click the **Save** button at the top to save your changes.

![Add new custom dimension to GA](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20764'%3E%3C/svg%3E)

After setting this up, you will need to wait at least 24 hours for Google Analytics to update the reports. Once the time has passed, go back to **Reports** → **Engagement** → **Events** → **view_search_results**.

Scroll past the previous report, and at the bottom of the page, you’ll find a new report or widget labeled `search_term`, which is the one you just set up.

![view_search_results report on GA](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201350%20857'%3E%3C/svg%3E)

Keep in mind that this report will only show newly collected data after the configuration. While it displays search terms over a longer period than the previous 30-minute report, it does not update in real time.

And that’s it! You now know how to find and analyze the search terms people use on your site with Google Analytics. If you have any questions or need assistance with Rank Math, please don’t hesitate to [contact our dedicated support team](https://rankmath.com/support/). They are available 24/7, 365 days a year.

			

			 

			
	
		
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