# How to Whitelist Rank Math in Cloudflare

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/whitelist-rank-math-in-cloudflare/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Whitelist Rank Math in Cloudflare

			
			

	

Rank Math uses REST API requests to fetch & update data on your website. So, if you’re using Cloudflare, there is a chance that it may block some of the REST API requests.

In this knowledgebase article, we’ll show you how to whitelist Rank Math in Cloudflare.

    
## Table Of Contents

    

        
- [Rank Math’s REST API Endpoints](#rest-api)
        
- [Whitelisting Rank Math in Cloudflare](#whitelist-rank-math-in-cloudflare)
- [How to Exclude Sitemaps in Cloudflare](#how-to-exclude-sitemaps-in-cloudflare)
- [Whitelisting Rank Math’s IP Address in Cloudflare](#whitelist-rank-math-ip-address)
       
    

## 1  Rank Math’s REST API Endpoints

Here’s the complete list of REST API endpoints that Rank Math uses. (_Note: This list is only for reference; you don’t have to whitelist them manually one by one, as we’ll walk you through the most effortless way below_).

```
/rankmath/v1/
/rankmath/v1/saveModule/
/rankmath/v1/autoUpdate/
/rankmath/v1/toolsAction/
/rankmath/v1/updateMode/
/rankmath/v1/dashboardWidget/
/rankmath/v1/updateSeoScore/
/rankmath/v1/disconnectSite/
/rankmath/v1/getFeaturedImageId/
/rankmath/v1/updateRedirection/
/rankmath/v1/updateMeta/
/rankmath/v1/updateSchemas/
/rankmath/v1/updateMetaBulk/
/rankmath/v1/saveTemplate/
/rankmath/v1/getVideoData/
/rankmath/v1/an/
/rankmath/v1/an/getKeywordPages/
/rankmath/v1/an/postsOverview/
/rankmath/v1/an/getTrackedKeywords/
/rankmath/v1/an/getTrackedKeywordsRows/
/rankmath/v1/an/getTrackedKeywordSummary/
/rankmath/v1/an/trackedKeywordsOverview/
/rankmath/v1/an/addTrackKeyword/
/rankmath/v1/an/autoAddFocusKeywords/
/rankmath/v1/an/removeTrackKeyword/
/rankmath/v1/an/deleteTrackedKeywords/
/rankmath/v1/an/getPagespeed/
/rankmath/v1/an/postsRows/
/rankmath/v1/an/inspectionStats/
/rankmath/v1/pingSettings/
/rankmath/v1/an/dashboard/
/rankmath/v1/an/keywordsOverview/
/rankmath/v1/an/postsSummary/
/rankmath/v1/an/postsRowsByObjects/
/rankmath/v1/an/post/(?P<id>\d+)/
/rankmath/v1/an/keywordsSummary/
/rankmath/v1/an/analyticsSummary/
/rankmath/v1/an/keywordsRows/
/rankmath/v1/an/userPreferences/
/rankmath/v1/an/inspectionResults/
/rankmath/v1/an/removeFrontendStats/
/rankmath/v1/ca/
/rankmath/v1/ca/researchKeyword/
/rankmath/v1/ca/getCredits/
/rankmath/v1/in/
/rankmath/v1/in/submitUrls/
/rankmath/v1/in/getLog/
/rankmath/v1/in/clearLog/
/rankmath/v1/in/resetKey/
```

## 2  Whitelisting Rank Math in Cloudflare

### 2.1  Navigate to Security in Cloudflare

To begin, navigate to the **Security**section in your domain’s Cloudflare dashboard and select **Security rules**, as shown below.

![Security rules in Cloudflare](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20564%201399'%3E%3C/svg%3E)

### 2.2  Create a New Custom Rule

Under the **Security Rules** section, click the **Create rule** button and select **Custom rules** from the pop-up.

![Create custom rules in cloudflare](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20567'%3E%3C/svg%3E)

Although you can’t include all REST endpoints due to Cloudflare’s limit of 5 custom rules for free users, we recommend using the version below, which should match most Rank Math endpoints:

```
http.request.uri.path wildcard r"*/wp-json/rankmath/*"
```

On the **New custom rule** page, give the rule a descriptive name, such as _Whitelist Rank Math_.

Next, go to the **Incoming request match** fields and:

- Select **URI Path** as the _Field_.

- Leave **Wildcard** as the _Operator_.

- Paste `*/wp-json/rankmath/*` in the _Value_ field.

- Click the **Or** button.

Everything should now look like the example shown below.

![New custom rule page](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20765'%3E%3C/svg%3E)

Once you’re done, check the **Expression Preview** to confirm it matches the snippet we provided earlier. If it does, you’re good to go.

## 3  How to Exclude Sitemaps in Cloudflare

To exclude your sitemap from being cached or blocked by Cloudflare, add a custom rule with the snippet below:

```
http.request.uri.path wildcard r"*/sitemap_index.xml"
```

To do this, while still on the **New custom rule** page:

- Click the **Or** button.

- Select **URI Path** in the _Field_ option.

- Leave the _Operator_ as **Wildcard**.

- Paste `*/sitemap_index.xml` in the _Value_ field.

Once done, check the **Expression Preview** to ensure everything looks correct.

![Whitelist Sitemap in Cloudflare](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20969'%3E%3C/svg%3E)

## 4  Whitelisting Rank Math’s IP Address in Cloudflare

You may also need to whitelist the following IP addresses in Cloudflare:

- rankmath.com – 172.66.40.202

- rankmath.com – 172.66.43.54

- rankmath.com – 193.138.6.5

- auth.rankmath.com – 204.48.29.92

To do this, still on the **New custom rule** page:

- **Field** – IP Source Address

- **Operator** – equals

- **Value** – 172.66.40.202

- **(Or)**– 172.66.43.54

- **(Or) –**193.138.6.5

- **(Or) –** 204.48.29.92

The **Expression Preview** should display:

`(ip.src eq 172.66.40.202) or (ip.src eq 172.66.43.54) or (ip.src eq 193.138.6.5) or (ip.src eq 204.48.29.92)`

![Whitelist Rank Math's IP Address in Cloudflare](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%201075'%3E%3C/svg%3E)

Finally:

- Set the action to **Skip**.

- Ensure **Log matching requests** is toggled on.

- In the _WAF components to skip_ section, select **All remaining custom rules**, **All managed rules**, and **All Super Bot Fight Mode Rules**.

Once everything is configured, click **Deploy**.

![Deploy your whitelists](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20718'%3E%3C/svg%3E)

And that’s it! If you still have questions about whitelisting Rank Math in Cloudflare– you’re always more than welcome to [contact our dedicated support team](https://rankmath.com/support/). We’re available 24/7, 365 days a year…

			

			 

			
	
		
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