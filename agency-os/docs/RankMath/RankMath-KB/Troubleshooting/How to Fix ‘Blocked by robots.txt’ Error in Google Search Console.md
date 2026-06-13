# How to Fix ‘Blocked by robots.txt’ Error in Google Search Console

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/fix-submitted-url-blocked-by-robots-txt-error/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Fix ‘Blocked by robots.txt’ Error in Google Search Console

			
			

	

If you’ve ever seen the “Blocked by robots.txt” error in your Google Search Console and in the Index Status report of Rank Math’s analytics, you know it can be pretty frustrating. After all, you’ve followed all the rules and made sure your website was optimized for search engines like Google or Bing. So why is this happening?

![Blocked by robots.txt error in Google Search Console](https://rankmath.com/wp-content/uploads/2023/04/Blocked-by-robots-txt-metrics.jpg)

In this knowledgebase article, we’ll show you how to fix the “Blocked by robots.txt” error, as well as explain what this error means and how to prevent it from happening again in the future.

Let’s get started!

## Table of Contents

- [What Does the Error Mean?](#error-meaning)

- [How to Find the “Blocked by robots.txt” Error](#find-error)

- [How to Fix the “Blocked by robots.txt” Error](#fix-error)

- [How to Prevent the Error From Happening Again](#prevent-error-again)

- [Conclusion](#conclusion)

## 1  What Does the Error Mean?

The “Blocked by robots.txt” error means that your website’s robots.txt file is blocking Googlebot from crawling the page. In other words, Google is trying to access the page but is being prevented by the robots.txt file.

This can happen for a number of reasons, but the most common reason is that the robots.txt file is not configured correctly. For example, you may have accidentally blocked Googlebot from accessing the page, or you may have included a disallow directive in your robots.txt file that is preventing Googlebot from crawling the page.

## 2  How to Find the “Blocked by robots.txt” Error

Luckily, the ‘Blocked by robots.txt’ error is pretty easy to find. You can use either the Google search console or the Index Status report in Rank Math’s Analytics to find this error.

### 2.1  Use Google Search Console to Find the Error

To check if you have this error in your Google Search Console, simply go to the **Pages** and click on the **Not indexed** section.

![Navigate to the Pages section](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201270%20565'%3E%3C/svg%3E)

Then, click on the **Blocked by robots.txt** error as shown below:

![Click on the error -blocked by robots.txt](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201269%20516'%3E%3C/svg%3E)

If you click on the error, you’ll see a list of the pages that are being blocked by your robots.txt file.

### 2.2  Use Rank Math’s Analytics to Identify Pages with the Problem [PRO](https://rankmath.com/pricing/)

You can also use the [Index Status](https://rankmath.com/kb/url-inspection-api-integration/) report in Rank Math’s Analytics to identify the pages with the problem.

To do so, navigate to **Rank Math SEO → Analytics** in the WordPress dashboard. Next, click on the **Index Status** tab. Under this tab, you’ll get the real data/status of your pages as well as their presence on Google.

![Index tab](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202488%202416'%3E%3C/svg%3E)

Moreover, if you’re using the Rank Math PRO, you can filter the post’s index status using the drop-down menu. When you select a specific status, say “Blocked by robots.txt,” you’ll be able to see all posts that share the same index status.

![Index status drop-down](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202484%201708'%3E%3C/svg%3E)

Once you have the list of pages that are returning this status, you can start to troubleshoot and fix the issue.

## 3  How to Fix the “Blocked by robots.txt” Error

In order to fix this, you will need to ensure that your website’s robots.txt file is configured correctly. You can use the robots.txt testing tool to check your file and ensure that no directives are blocking Googlebot from accessing your site.

If you find directives in your robots.txt file that are blocking Googlebot from accessing your site, you will need to remove them or replace them with more permissive ones.

Let’s see how you can test your robots.txt file and make sure that there are no directives blocking Googlebot from accessing your site.

### 3.1  Open robots.txt Tester

At first, head over to the [robots.txt testing tool](https://rankmath.com/tools/robots-txt/). Here is what it would look like.

![Robots.txt Tester](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20732'%3E%3C/svg%3E)

### 3.2  Enter the URL of Your Site

First, you will find the option to enter a URL from your website for testing.

![Enter URL in robots.txt texter](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20639'%3E%3C/svg%3E)

### 3.3  Select the User-Agent

Next, you will see the dropdown arrow. Click on it, and select the user agent you want to simulate (Googlebot, in our case).

![Select Googlebot as user agent in robots.txt](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20579'%3E%3C/svg%3E)

### 3.4  Validate Robots.txt

Finally, click the **TEST**button.

The crawler will instantly validate if it has access to the URL based on the robots.txt configuration and accordingly process the test.

The code editor available at the center of the screen will also highlight any unclear rule in your robots.txt, as shown below.

![Testing robots.txt file](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20676'%3E%3C/svg%3E)

### 3.5  Edit & Debug

If the robots.txt Tester finds any rule preventing access, you can try editing the rule right inside the code editor and then run through the test once again.

You can also refer to our [dedicated knowledgebase article on robots.txt](https://rankmath.com/kb/how-to-edit-robots-txt-with-rank-math/#robotstxt-rules) to learn more about the accepted rules, which would be helpful in editing the rules here.

If you happen to fix the rule, then it’s great. But please note this is a debugging tool, and any changes you make here will not be reflected on your website’s robots.txt unless you copy and paste the contents to your website’s robots.txt.

### 3.6  Edit Your Robots.txt With Rank Math

To do this, navigate to your robots.txt file in Rank Math, which is located under **WordPress Dashboard → Rank Math SEO → General Settings → Edit robots.txt** as shown below:

![Edit robots.txt in Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202350%201250'%3E%3C/svg%3E)

**Note:**If this option isn’t available for you, then ensure you’re using the [Advanced Mode](https://rankmath.com/kb/advanced-mode/) in Rank Math.

In the code editor that is available in the middle of your screen, paste the code you’ve copied from robots.txt tester and then click the **Save Changes** button to reflect the changes.

**Caution:__**Please be careful while making any major or minor changes to your website via robots.txt. While these changes can improve your search traffic, they can also do more harm than good if you are not careful.

For further ado, see the screenshots below:

![Copy and paste robots.txt](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202350%201250'%3E%3C/svg%3E)

That’s it! Once you’ve made these changes, Google will be able to access your website, and the “Blocked by robots.txt” error will be fixed.

## 4  How to Prevent the Error From Happening Again

To prevent the “Blocked by robots.txt” error from happening again in the future, we recommend reviewing your website’s robots.txt file on a regular basis. This will help to ensure that all directives are accurate and that no pages are accidentally blocked from being crawled by Googlebot.

We also recommend using a tool like Google Search Console to help you manage your website’s robots.txt file. It will allow you to monitor your robots.txt file status and issues easily, as well as submit pages for indexing, view crawl errors, and more.

## 5  Conclusion

In the end, we hope that this article helped you learn how to fix the “Blocked by robots.txt” error in Google Search Console and in the Index Status report of Rank Math’s analytics. If you have any doubts or questions related to this matter, please don’t hesitate to reach out to our [support team](https://rankmath.com/support/). We are available 24×7, 365 days a year, and are happy to help you with any issues that you might face.

			

			 

			
	
		
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