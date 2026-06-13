# How to Create an AI Traffic Report in Google Analytics 4

> **Category:** Miscellaneous
> **Source:** https://rankmath.com/kb/create-ai-traffic-report/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Create an AI Traffic Report in Google Analytics 4

			
			

	

Google Analytics 4 (GA4) allows you to customize your analytics report to view traffic coming from AI search engines and chatbots. You can then add this report to the left sidebar, as shown below.

![AI traffic report in Google Analytics 4 (GA4)](https://rankmath.com/wp-content/uploads/2026/01/AI-traffic-report-in-Google-Analytics-4-GA4.png)

That way, you can easily view and analyze AI-driven traffic directly from the GA4 interface. We will show you how to do that in this knowledgebase article.

## In this article, we’ll cover:

- [Create the AI Traffic Report](#create-ai-traffic-report)

- [Configure the AI Traffic Report](#configure-ai-traffic-report)

- [Add the AI Traffic Report to Your GA4 Sidebar](#add-ai-traffic-report-to-sidebar)

## 1  Create the AI Traffic Report

To get started, head to your Google Analytics 4 account. Then, click the **Reports**icon from your dashboard.

![Click the Reports icon in Google Analytics 4](https://rankmath.com/wp-content/uploads/2026/01/Click-the-Reports-icon-in-Google-Analytics-4.png)

Next, click **Library** at the bottom of the sidebar.

![Click Library ](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20733'%3E%3C/svg%3E)

Now, head to the **Traffic acquisition**report and click the three dots, as shown below.

![Click the three dots in the Traffic acquisition report](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20733'%3E%3C/svg%3E)

Then select **Make a copy**.

![Click Make a copy](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20739'%3E%3C/svg%3E)

Name it **AI traffic** and click **Save**.

![Name the copy and click Save](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20740'%3E%3C/svg%3E)

You have now created your AI traffic report. It is now time to configure it so that it only displays the traffic you receive from AI sources.

## 2  Configure the AI Traffic Report

Scroll to the top of the Reports section. You will see the AI traffic report you just created. Click the three dots.

![Click the three dots in the AI traffic report](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20730'%3E%3C/svg%3E)

Select **Edit**.

![Select Edit](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20733'%3E%3C/svg%3E)

Now, in the Customize report sidebar, head to the Report filter section. Then click **Add Filter**.

![Click Add Filter in the Customize report sidebar](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20729'%3E%3C/svg%3E)

Now, type `session source` into the Dimension dropdown. The dropdown will display the **Session source** option. Click on it.

![Click the Session source option](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20724'%3E%3C/svg%3E)

Set the Match Type to **Matches regex**.

![Set the Match type to Matches regex](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20730'%3E%3C/svg%3E)

Then copy the regex code below and paste it into the Value field.

```
(chatgpt|openai|anthropic|deepseek|grok)\.com|(gemini|bard)\.google\.com|(perplexity|claude)\.ai|(copilot\.microsoft|edgeservices\.bing)\.com|edge\scopilot
```

This is what the Value field should look like after you have pasted the regex code. The regex code will also be displayed in the Summary field. Once done, click **Apply**.

![Click Apply](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20733'%3E%3C/svg%3E)

Now, click on the **Session dimension** **dropdown**, as shown below.

![Click the Session dimension dropdown](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20740'%3E%3C/svg%3E)

Then, select **Session source**. The sources of your AI traffic will now be visible to you.

![Select Session source](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20736'%3E%3C/svg%3E)

Now, head to the top of the report and click **Save**. Then select **Save changes to current report**.

![Click Save and Save changes to current report](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20735'%3E%3C/svg%3E)

You have now configured and saved your AI traffic report. It is now time to place it in your Google Analytics 4 sidebar. This ensures you can quickly view it from your dashboard.

## 3  Add the AI Traffic Report to Your GA4 Sidebar

To get started, click **Back** to return to the Library.

![Click Back to return to the Library](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20736'%3E%3C/svg%3E)

Alternatively, from your Google Analytics dashboard, click **Reports**→**Library** to return to the Library.

![Head to Library from your Google Analytics dashboard](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20737'%3E%3C/svg%3E)

Once in the Library, head to the **Business objectives** collection and click the three dots.

![Click the three dots of the Business objectives](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20731'%3E%3C/svg%3E)

Select **Edit**.

![Select Edit in the Business objectives options](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20735'%3E%3C/svg%3E)

In the Search reports field, enter **AI traffic**. The AI traffic report you just created will be displayed, as shown below.

![Enter AI traffic into the Search reports bar](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20728'%3E%3C/svg%3E)

Now drag the AI traffic report into the Topics and Reports field. It is recommended to place it under **Traffic acquisition**.

Once done, click **Save**and select **Save changes to current selection**.

![Drag the AI traffic report into the Topics and Reports field](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20736'%3E%3C/svg%3E)

The AI Traffic report has now been added to your Google Analytics 4 sidebar. You can easily view it by heading to **Reports → Business objectives → Generate leads → AI traffic** from your dashboard.

![How to view AI traffic in Google Analytics 4](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20739'%3E%3C/svg%3E)

That is how to view your AI traffic in your Google Analytic 4 sidebar. If you have any questions about using Rank Math, you’re always more than welcome to [contact our dedicated support team](https://rankmath.com/support/), who are available 24/7, 365 days a year…

			

			 

			
	
		
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

		

										
			
- [How to Share Credentials Using the Rank Math Vault](https://rankmath.com/kb/how-to-use-vault/)

										
			
- [How to Disable Rank Math Meta Box from the Right Sidebar](https://rankmath.com/kb/disable-rank-math-meta-box/)

										
			
- [Migrating The Rank Math Support from Forum to Zendesk](https://rankmath.com/kb/support-migration-to-zendesk/)

										
			
- [How to Customize RSS Feed in WordPress](https://rankmath.com/kb/customize-rss-feed/)

										
			
- [How to Add Twitter Cards to WordPress](https://rankmath.com/kb/how-to-add-twitter-cards/)

										
			
- [How to Use llms.txt in Rank Math SEO](https://rankmath.com/kb/llms-txt/)