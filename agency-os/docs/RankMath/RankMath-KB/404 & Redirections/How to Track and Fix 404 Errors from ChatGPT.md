# How to Track and Fix 404 Errors from ChatGPT

> **Category:** 404 & Redirections
> **Source:** https://rankmath.com/kb/fix-404-errors-from-chatgpt/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Track and Fix 404 Errors from ChatGPT

			
			

	

As AI tools like ChatGPT become more widely used, they sometimes generate and cite links to your website that don’t actually exist. These incorrect URLs can lead to 404 (Page Not Found) errors, resulting in a poor user experience and missed [SEO opportunities](https://rankmath.com/blog/best-seo-practices/).

In this knowledgebase article, you’ll learn how to track and fix 404 traffic from AI tools like ChatGPT. Whether you choose to redirect the broken links or create new content, this guide will help you turn lost traffic into valuable visits.

## 1  Understand the Problem with AI-Cited URLs

AI tools like ChatGPT, Perplexity, and Google Gemini often cite URLs based on what they assume exists on your site.

For example, they may generate links like `/best-free-seo-tools` or `/best-seo-checklist`—even if those pages were never published. When users click these hallucinated links, they land on a 404 page.

This is becoming increasingly common as AI-generated search results begin driving real traffic. So, these broken links aren’t just technical errors—they’re real opportunities you can reclaim.

You can handle these URLs in three powerful ways:

- Redirect them to the most relevant existing page

- Create new content based on the topic the AI inferred

- Analyze patterns to strengthen your content strategy and [internal linking](https://rankmath.com/blog/internal-linking/)

In the following sections, you’ll learn how to identify these URLs and take meaningful action.

## 2  Track Your Website’s 404 Errors

When an AI tool cites your site as a source but makes up a URL, users may unknowingly land on a 404 page. To fix this, the first step is [identifying those broken links](https://rankmath.com/blog/broken-links/).

### 2.1  Track 404 Errors Using Rank Math’s 404 Monitor

To begin, ensure you have Rank Math installed and [fully set up](https://rankmath.com/kb/how-to-setup/). In your WordPress dashboard, go to **Rank Math SEO → Dashboard**, and activate the **404 Monitor** and **Redirections** modules, as shown below.

![Enable the 404 Monitor and Redirections modules](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20750'%3E%3C/svg%3E)

Next, go to **Rank Math SEO → General Settings → 404 Monitor**, and change the error log mode from _Simple_ to _Advanced_, as shown below. Don’t forget to save your changes.

![Enable the Advanced mode for 404 Monitor in Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%201147'%3E%3C/svg%3E)

Using _Advanced_ mode gives you more detailed logs, including the **Referrer URL**, which helps identify which AI tool or site is sending traffic to your broken links.

Finally, head over to **Rank Math SEO → 404 Monitor**. This is where you’ll see all 404 hits on your site. If the advanced mode is already enabled, the Referrer column will display the source of the traffic.

For example, in this case, the referrer is ChatGPT, as highlighted below.

![Rank Math's 404 Monitor marks ChatGPT as referer](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20734'%3E%3C/svg%3E)

### 2.2  Monitor 404 Traffic with Google Analytics 4

Google Analytics 4 (GA4) offers another way to track visits to 404 pages—and in some cases, it can help you identify where the traffic came from, including AI tools like ChatGPT.

First, ensure your site is [properly connected to GA4](https://rankmath.com/kb/install-google-analytics/). Then, in your [GA4 dashboard](https://analytics.google.com/), go to **Reports → Engagement → Pages and Screens**.

To locate your 404 pages, click the dropdown on the chart row and select **Page title and screen class**. This will show you the titles of pages that received traffic.

![Page title and screen class in GA4](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201325%20719'%3E%3C/svg%3E)

If your 404 page is titled something like _Page Not Found_, you’ll see it listed here, along with metrics like views, engagement time, and more. Your 404 title may vary depending on your theme or setup.

![404 pages in GA4](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201370%20718'%3E%3C/svg%3E)

To identify the source of the traffic (such as ChatGPT), click the **“+” icon** next to the relevant dimension row.

![plus icon in GA4](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20994%20300'%3E%3C/svg%3E)

In the popup, go to **Traffic Source → Cross-channel → Session source/medium.**

![Get the traffic source in GA4](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201171%20717'%3E%3C/svg%3E)

GA4 will now display both the 404 page titles and the source of the traffic. If ChatGPT was the referral source, you may see `chatgpt.com` in the report.

![ChatGPT cite 404 pages](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201331%20671'%3E%3C/svg%3E)

If your site has a large amount of data, you can use the search bar to filter it quickly. If no AI-related sources appear, it likely means you haven’t received AI-driven 404 traffic yet.

## 3  Redirect or Create Content for Those URLs

Once you’ve identified the broken URLs, it’s time to take action—either by redirecting them to an existing page or creating a new article around that topic.

### 3.1  Redirect to an Existing Relevant Page

If you already have a page on your site that covers a similar topic to the 404 URL, it’s best to [redirect](https://rankmath.com/kb/how-to-create-a-redirection/) the broken link to that existing content. This ensures users still land on something helpful instead of bouncing away.

If you already have a page on your site that covers a similar topic, redirecting the broken URL is a great way to retain traffic and improve the user experience.

If the URL was logged in Rank Math’s 404 Monitor, hover over it and click **Redirect**. This takes you directly to the Redirections setup screen.

![Redirect 404 pages in Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201034%20621'%3E%3C/svg%3E)

If you found the 404 URL using Google Analytics, copy the path and navigate to **Rank Math SEO → Redirections.** Then, click **Add New**.

![Add new redirections](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201092%20447'%3E%3C/svg%3E)

In the Redirection setup:

- Paste the broken URL in the **Source URL** field.

- Enter the most relevant existing page in the **Destination URL** field.

- Set the redirection type to **301 Permanent Move**.

- Click **Update Redirection** when you’re done.

This ensures that future traffic to the broken URL is routed to helpful, existing content.

![Setup redirections in Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201238%201399'%3E%3C/svg%3E)

### 3.2  Create a New Article Using Content AI

If there’s no similar content on your site and the 404 URL points to a valuable topic, consider creating a new article instead. This not only captures missed traffic but also strengthens your SEO footprint.

You can do this manually, but to save time and generate a fully optimized article, [use **Content AI**](https://rankmath.com/kb/content-ai-free/). First, ensure you have an active Content AI plan and enable its module. If your monthly feature uses are exhausted, you can [subscribe to a plan](https://rankmath.com/content-ai/) that suits your needs.

Now, you’ll be using the [Blog Post Wizard tool](https://rankmath.com/kb/content-ai-blog-post-wizard-tool/) in Content AI to create the article. But before that, use [RankBot](https://rankmath.com/kb/how-to-use-rankbot-ai/) to generate the required input.

In your WordPress dashboard, go to **Rank Math SEO → Content AI → Chat**, and enter this prompt:

“_Provide me with the best details to write a blog article on this topic: [404 URL] — including title, focus keyword, audience, main points, tone, style, and meta description”._

Replace `[404 URL]` with the actual broken link you found.

RankBot will return everything you need: the title, keyword, outline, and more.

![RankBot](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%201255'%3E%3C/svg%3E)

Next, go to the **AI Tools** tab and open the **Blog Post Wizard**.

![Blog Post Wizard AI](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201168%20779'%3E%3C/svg%3E)

In the first phase, you’ll be prompted to enter blog details. You can skip it and proceed to the next phase.

![Skip setup](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20913'%3E%3C/svg%3E)

The next phase will involve requesting the blog post details in order to create its outline. Provide the output from RankBot.

Once done, click **Generate** to create the complete outline.

![Blog Post Outline](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20919'%3E%3C/svg%3E)

If you’re satisfied, click **Write Post,** and the AI will generate the full article based on your inputs.

![Write Blog Post with Content AI](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20917'%3E%3C/svg%3E)

When the content is ready, copy it and create a new WordPress post. Be sure to use the original 404 slug (e.g., `/best-seo-checklist`) as the URL. This way, any future traffic sent to that hallucinated link will now land on a real, valuable article.

Feel free to edit the post, add media, and optimize it further; then, publish it.

Now you’ve successfully turned a broken link into an opportunity. Whether you choose to redirect it or create new content, these steps help you reclaim lost traffic, improve user experience, and grow your visibility in the AI-powered search landscape.

If you need help or encounter any issues, [our support team](https://rankmath.com/support/) is always ready to assist you. They’re available 24/7, 365 days a year.

			

			 

			
	
		
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

		

										
			
- [How to Trace Your Website’s URL Redirects](https://rankmath.com/kb/trace-url-redirects/)

										
			
- [How to Set 410 Status Code in Bulk for WordPress](https://rankmath.com/kb/set-410-status-in-bulk/)

										
			
- [301 vs 302 Redirect: Which One Should You Use?](https://rankmath.com/kb/301-vs-302-redirect/)

										
			
- [How to fix ‘The Redirection you are trying to create may cause infinite loops’?](https://rankmath.com/kb/fix-infinite-loop-error/)

										
			
- [How to Set Up Redirections](https://rankmath.com/kb/setting-up-redirections/)

										
			
- [How to Monitor 404 Errors](https://rankmath.com/kb/monitor-404-errors/)