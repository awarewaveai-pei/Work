# Using Google Analytics 4 Property With Rank Math Analytics

> **Category:** Analytics
> **Source:** https://rankmath.com/kb/using-ga4/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Using Google Analytics 4 Property With Rank Math Analytics

			
			

	

Rank Math Analytics helps you track the performance of your content in search and keep an eye on which posts are performing well as well as which of them require attention.

The overall idea of the Rank Math Analytics feature is to provide you with an overview of your current SEO standing and your immediate SEO progress. You can easily view your website’s current state with respect to organic traffic with the help of this feature.

**This is how the dashboard of Rank Math analytics looks like:**

![Rank Math Analytics Dashboard](https://rankmath.com/wp-content/uploads/2021/01/google-analytics-dashboard.jpeg)

To take advantage of this Rank Math Analytics feature, you should connect Rank Math with Google Analytics. And in this knowledgebase tutorial, we’ll walk you through how to connect Rank Math with Google Analytics 4.

![Google Analytics 4 Tutorial for Beginners (2024)](https://img.youtube.com/vi/-klGwlBC2p8/maxresdefault.jpg)
__

## Connect Rank Math With GA4 Property

Rank Math can create a new GA4 property on behalf of you. To create a new GA4 property, follow the steps described below.

### 1  Navigate to Analytics Settings

Start by heading to **WordPress Dashboard →** **Rank Math SEO**→ **General Settings** → **Analytics**.

![Navigate to Analytics settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202444%201294'%3E%3C/svg%3E)

In the Analytics settings, ensure that you’ve connected Rank Math with Google Analytics, as we’ve done in this [knowledgebase tutorial](https://rankmath.com/kb/install-google-analytics/).

### 2  Create New GA4 Property

**Note:** In case, you’ve already created a GA4 property, then you can ignore this step.

Then, under the **Analytics** section, click the **Property** dropdown as shown below and choose the **Create new GA4 Property** option.

![Create new GA4 property](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20746%20415'%3E%3C/svg%3E)

Once you select this option, you’ll see a prompt asking for your confirmation to create a new GA4 property. Click **OK**.

![Prompt to create new GA4 property](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201113%20512'%3E%3C/svg%3E)

### 3  Select the GA4 Property to Connect

Within a few moments, the newly created GA4 property will be automatically selected in the **Property** drop-down.

![Select Google Analytics 4 property](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201494%20810'%3E%3C/svg%3E)

Alternatively, you can choose any existing GA4 property from the Property dropdown.

Please note that all the GA4 properties are clearly indicated with a suffix `-GA4`.

### 4  Select Data Stream and Country

In the Data Stream dropdown, select the data stream for the GA4 property. For the newly created GA4 property, Rank Math would have automatically created the **Website** data stream.

![Choose Website data stream and country](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201494%20810'%3E%3C/svg%3E)

Under the **Country** dropdown, you can either leave with the default **Worldwide** or choose a preferred country of your choice to fetch the Analytics data.

### 5  Install Analytics Code

Now that you’ve configured Rank Math to retrieve data from the GA4 property, you need to make sure that you have a plugin or theme that adds the GA4 tracking code so that all the pageviews and events on your site are recorded in Google Analytics.

If the Google Analytics 4 tracking code is not added to your site by any other means, then you can enable the toggle to **Install Analytics Code**.

![Install Analytics code](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20960%20358'%3E%3C/svg%3E)

Once you enable the toggle, you’ll see other analytics options that you can enable, such as [Anonymize IP addresses](https://rankmath.com/kb/anonymize-ip-addresses-google-analytics/), [Self-Hosted Analytics JS File](https://rankmath.com/kb/host-google-analytics-locally/), and [Exclude Logged-in users](https://rankmath.com/kb/general-settings/#exclude-logged-in-users).

### 6  Save Changes

Finally, you can click the **Save Changes** button at the bottom of the page.

![Save Changes](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20813%20122'%3E%3C/svg%3E)

To validate that Rank Math has added the Google Analytics 4 code, head over to your website’s page source code. You can search for a code of the below format to ensure that Rank Math has successfully added the Google Analytics 4 code.

```
gtag('config', 'G-xxxxxxxx', {} );
```

**Note:** For a newly created property, it will take a few hours to collect and display the initial data in Google Analytics. Rank Math will import that data from Google Analytics and make it available on your [Analytics dashboard](https://rankmath.com/kb/analytics/) on the **next scheduled data import**. If your Analytics setting disappears after you save your changes, consider switching to Google Chrome or another Chromium-based browser.

And that’s it! If you still have absolutely any questions about using GA4 with Rank Math Analytics, please feel free to [reach our support team directly from here](https://rankmath.com/support/), and we’re always here to help.

			

			 

			
	
		
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