# Why Rank Math’s Analytics Data Differs from Search Console & Google Analytics?

> **Category:** Analytics
> **Source:** https://rankmath.com/kb/analytics-data-differs-from-ga-gsc/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Why Rank Math’s Analytics Data Differs from Search Console & Google Analytics?

			
			

	

If you are a Rank Math user, you might have noticed that data from our [Analytics module](https://rankmath.com/kb/analytics/) differ from both Google Search Console and Google Analytics.

In this knowledgebase article, we will explain the discrepancies between Rank Math’s Analytics data and the data from Google.

## 1  **Important Metrics**

Many metrics correspond to search traffic, and each differs from the other.

**Users:**Users involve the number of site visitors who have visited your website during the chosen timeframe, including both new and returning visitors.

**New User:**The number of unique site visitors who visited the site during the selected timeframe. These users have initiated action on your site for the first time.

**Sessions:**Every time someone visits your site, it is considered a “session.” A session starts whenever a user loads a web page and ends after 30 minutes of inactivity. During this timeframe, all activities undertaken by the user, such as a pageview, click, transaction, etc., are tracked and considered a part of the session. If the same user revisits your site anytime later that day, it is treated as a new session. And this accounts for multiple sessions for the same user.

**Pageviews:**Every time someone visits one of your website pages, it is recorded in Google Analytics as a “pageview.”

Before going ahead with the reasons, you need to make sure you have connected your [Google Analytics with Rank Math](https://rankmath.com/kb/install-google-analytics/).

## 2  How Rank Math Fetches Data

When a new post or page is created or updated (which could be from an import, post/page edit form, post by email, etc.), our Analytics module does not instantly fetch any of the data from Google. It only updates the local index that holds essential information about each publicly accessible object on your site, such as posts, pages, categories, users, etc.

All the data fetching from Analytics and Search Console (also from Adsense) happen in the background, as scheduled actions. You can check these scheduled actions when you navigate to **Tools → Scheduled Actions** inside your WordPress dashboard.

![Scheduled tasks in Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201200%20455'%3E%3C/svg%3E)

## 3  Reasons Why Rank Math Analytics Data Are Different from Google

To help you understand the data that Rank Math Analytics offers and how it differs from that of Google Analytics and Google Search Console, we’ve outlined the various factors involved:

- [Rank Math Uses Different Metrics](#different-metrics)

- [Different Data from Google API](#google-api)

- [Present in Local Index](#local-index)

- [Data Differs in Different Countries](#differs-in-different-countries)

- [Ignored Data Points](#data-points)

- [Search Traffic Data](#search-traffic)

- [Data Report Time](#report-time)

### 3.1  Rank Math Uses Different Metrics

Rank Math Analytics uses different metrics to calculate some data points compared to Google. The Traffic report of Google Analytics shows the number of users or sessions from all organic traffic sources. In contrast, Rank Math’s search traffic shows the number of **page views** by visitors _only from Google search_es.

![Search Traffic in Rank Math Analytics](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20908%20301'%3E%3C/svg%3E)

### 3.2  Different Data from Google API

The data you get to see in Rank Math Analytics is the data we get from Google’s APIs. In some cases, Google’s APIs may send different data than what can be seen in their own Dashboard (Google Analytics and Google Search Console). So, the chances are that there can be data discrepancies between Rank Math & Google’s services.

To preserve the privacy of the user who submitted the query, some anonymized queries are not displayed in the Search Console data results and are never included in the table. Unless you filter by query, anonymized searches are included in the chart totals (either query containing or queries not containing a given string).

This is because there is no row for [anonymized queries](https://support.google.com/webmasters/answer/7576553?hl=en#by_query) in the report table or API. So if you sum up clicks for all the rows, you’ll not find the same number of clicks as the chart totals.

### 3.3  Present in Local Index

Rank Math only accounts for the data for the posts (and other objects) that are currently published and present in the local index. If you have moved some content to the Trash, converted to draft, or otherwise eliminated from your site, those will be counted in the Search Console but not in Rank Math.

### 3.4  Data Differs in Different Countries

You should check the **Country** option available inside Rank Math, which allows users to [filter the data](https://rankmath.com/kb/analytics/#country-wise-analytics-data)by choosing the respective locations. The default setting is **Worldwide**, but you can click the drop-down list and select a specific country if you want the corresponding analytics data.

When you select a preferred country, all the reports in Rank Math Analytics will show data only from that country.

![Country settings in Rank Math Analytics](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202068%201321'%3E%3C/svg%3E)

### 3.5  Ignored Data Points

Rank Math does not store the data related to keywords ranked for positions 100 and higher. Consequently, the clicks/impressions/CTR associated with those keywords won’t be recorded either. These data points are ignored to focus on the essential data for site owners.

### 3.6  Search Traffic Data

Both Google Analytics and Rank Math measure search traffic in different ways. The search traffic in Google Analytics includes traffic your website receives from Google suggest box and Google Discover.

However, Rank Math only shows the search traffic from Google organic search results to represent the relevance of the user’s search intent.

Also, Google Search Console shows Google organic search results and Google Discover in the split reports. The mismatch of search traffic differs the data between Google services and Rank Math.

### 3.7  Data Report Time

The purpose and approach for collecting and reporting data differ in Google Search Console and Google Analytics.

Google Analytics reports its data within seconds, and Google Search Console reports within days, which results in incomplete data when you’re analyzing your report.

However, Rank Math fetches data from both the services as scheduled actions which also discrepancies the data in Rank Math.

And that’s it! We hope the article helped you understand why there are discrepancies between Rank Math and Google Analytics & Google Search Console.****If you are still not clear and need more clarification, please feel free to [reach out to our support team](https://rankmath.com/support/). We’re always here to help.

			

			 

			
	
		
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