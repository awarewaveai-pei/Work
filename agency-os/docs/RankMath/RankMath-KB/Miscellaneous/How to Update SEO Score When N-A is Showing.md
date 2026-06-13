# How to Update SEO Score When N/A is Showing

> **Category:** Miscellaneous
> **Source:** https://rankmath.com/kb/seo-score-not-available/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Update SEO Score When N/A is Showing

			
			

	

In this knowledgebase article, we’ll show you how you can update the SEO score of your posts when it is showing N/A.

## Table of Contents

- [Why Do Posts Show N/A in SEO Score?](#score-not-available)

- [Imported Focus Keywords from Other SEO Plugin](#imported-focus-keywords)

- [Focus Keyword Not Set](#focus-keyword-not-set)

- [Post Is Set to No Index](#noindex)

- [Updating SEO Score for Posts With N/A Using Database Tools](#database-tools)

- [Update SEO Score While Importing Data](#import-data)

- [Manually Update SEO Score for Posts with N/A](#manual-update)

## 1  Why Do Posts Show N/A in SEO Score?

If your post shows N/A in the SEO score, then it could be because of one of the below reasons.

### 1.1  Imported Focus Keywords from Other SEO Plugin

If you’ve migrated to Rank Math SEO from other SEO plugins, it is normal to see N/A in the SEO score of your posts. This is because, during the migration process, Rank Math will only import your SEO metadata, such as SEO titles, descriptions, focus keywords, etc. But for Rank Math to display the SEO score, it needs to run content analysis tests on your posts to check if your content is optimized for the focus keyword.

Rank Math can run these scoring scripts only when the post/page is opened. And hence, if you’ve migrated focus keywords from other SEO plugins, Rank Math hasn’t got the opportunity yet to run these tests, and as a result, you see the SEO score as N/A.

**Note:** From v1.0.97, Rank Math includes an option to recalculate SEO scores while importing data from other SEO plugins. You can read more about this option below.

![SEO Score N/A when focus keywords are imported from other SEO Plugin](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202510%20578'%3E%3C/svg%3E)

### 1.2  Focus Keyword Not Set

You can also see N/A for your SEO score when you haven’t set a focus keyword for your post/page yet. The SEO score provided by Rank Math is only a measure of how well your content is optimized for the set focus keyword.

So, only if you tell Rank Math, what the focus keyword for the post/page is, it can provide you with an SEO score.

![SEO score not available when focus keyword is not set](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201508%20576'%3E%3C/svg%3E)

### 1.3  Post Is Set to No Index

Rank Math will also display the SEO score as N/A on the posts page if the post is set to **No Index**.

![Noindexed posts](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202386%20236'%3E%3C/svg%3E)

Given that the post is not expected to be indexed in search results, having a score to rate how well the post is optimized for search engines would not make sense. Hence for that reason, Rank Math does not display the SEO score for the articles set to be No Indexed.

If you prefer to get the article indexed, you can [follow this tutorial and set the article to index](https://rankmath.com/kb/advanced-tab/#index) from the Advanced Tab.

Now that we’re clear about why the SEO score of your post is shown as N/A, let’s look at the different options that Rank Math offers to get the SEO score updated.

## 2  Update SEO Score While Importing Data

If you’re importing the data from other SEO plugins, you can also choose to recalculate SEO scores along with. However, please note, **this method will only update the SEO score of posts set as N/A**

In the Import tab of Rank Math Setup Wizard, ensure the option **Recalculate SEO Scores** is checked as shown below.

![Recalculate SEO scores along with importing data](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20960%20552'%3E%3C/svg%3E)

Then, click the **Start Import** option. The importing will start right away, and Rank Math will recalculate your SEO Scores along with. The process may take a while depending upon the posts on your site. Once done, you’ll see a success message as shown below.

![SEO Score updated](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20900%20379'%3E%3C/svg%3E)

**Note:** This option is also available when you’re importing data from other SEO plugins through Import & Export tab in Rank Math at **WordPress Dashboard → Rank Math SEO → Status & Tools → Import & Export → Other Plugins**.

## 3  Updating SEO Score for Posts With N/A Using Database Tools

If **you’ve got the focus keywords set** for these posts, you can follow the exact steps shown below to resolve this.

### 3.1  Navigate to Database Tools

Head over to **Rank Math SEO → Status & Tools → Database Tools** inside your WordPress dashboard. Ensure that you’re using Rank Math in the [Advanced Mode](https://rankmath.com/kb/advanced-mode/) for these options to appear.

![Navigate to Database Tools](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202046%201270'%3E%3C/svg%3E)

### 3.2  Update SEO Scores

Scroll down to the bottom of the page to find the **Update SEO Scores** tool and click the **Recalculate Scores** option as shown below.

![Update SEO Scores](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201052%20184'%3E%3C/svg%3E)

### 3.3  Wait for Rescoring to Complete

Now, a new popup would open, and Rank Math would start calculating the SEO Scores for your **published posts**. Please note that this tool would rescore all the published posts with **focus keywords set** and not just the posts with a score of N/A.

![Recalculating SEO scores popup](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201055%20449'%3E%3C/svg%3E)

**Note:** The process takes some time depending upon the number of posts on your website. We request you keep the browser open until the process ends.

Once done, you’ll see a success message as shown below.

![Recalculating SEO scores is complete](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201059%20463'%3E%3C/svg%3E)

## 4  Manually Update SEO Score for Posts With N/A

If you prefer to manually update the posts where the SEO Score is N/A, follow the steps we walk you through below.

### 4.1  Edit the Post/Page

At first, open the post/page that is showing the SEO score as N/A.

![Edit the Post/Page](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201310%20552'%3E%3C/svg%3E)

### 4.2  Add Focus Keyword (If Not Already)

In the Block Editor, you can access Rank Math either by clicking the Rank Math SEO icon on the top-right corner of the page or by clicking the three vertical dots and selecting Rank Math from the list of options available.

Under the **General** tab of Rank Math, you can find the **Focus Keyword** section available. Add a focus keyword to your article if you haven’t already added it.

![Adding Focus Keyword with Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201912%20910'%3E%3C/svg%3E)

Once the focus keyword is added, you can notice that Rank Math starts running all content analysis tests, and an SEO score will be available instantly.

### 4.3  Update the Post/Page

Now, you can make any further changes to your content to optimize your SEO score and then click the **Save** button.

![Save Post](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201176%20588'%3E%3C/svg%3E)

Once you update your post, the SEO score of the post will also be updated. You can check the post list view to see if the SEO score is visible now.

![Updated SEO score on the post list view](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202026%20576'%3E%3C/svg%3E)

We suggest not hitting the Update button without making any changes to your content, as search engines might consider them to be date manipulation in some cases. Hence, if you’ve got a large number of posts with an SEO score of N/A, we recommend that you start with your most important posts, open them, make changes as per recommendations made by Google, and then hit the Update button.

**Note:** In case if you’ve followed the above tutorial, but your focus keywords are not being saved and resulting in N/A, then [refer to this dedicated tutorial](https://rankmath.com/kb/meta-data-not-saving/) to debug the issue.

And that’s it! If you’re still facing this issue after updating your posts, please feel free to [reach our support team directly from here](https://rankmath.com/support/), and we’re always here to help.

			

			 

			
	
		
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

										
			
- [How to Create an AI Traffic Report in Google Analytics 4](https://rankmath.com/kb/create-ai-traffic-report/)

										
			
- [How to Disable Rank Math Meta Box from the Right Sidebar](https://rankmath.com/kb/disable-rank-math-meta-box/)

										
			
- [Migrating The Rank Math Support from Forum to Zendesk](https://rankmath.com/kb/support-migration-to-zendesk/)

										
			
- [How to Customize RSS Feed in WordPress](https://rankmath.com/kb/customize-rss-feed/)

										
			
- [How to Add Twitter Cards to WordPress](https://rankmath.com/kb/how-to-add-twitter-cards/)