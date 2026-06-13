# How to Change the Date & Time on Your Posts/Pages

> **Category:** Getting Started
> **Source:** https://rankmath.com/kb/changing-publish-date-and-time-wordpress/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Change the Date & Time on Your Posts/Pages

			
			

	

In this knowledgebase article, we’ll walk through the steps to change the time on your posts/pages and also help you to ensure that your new dates are displayed on Google.

    
## Table Of Contents

    

        
- [Changing the Date and Time on Your Posts/Pages](#change-date-time)
        
- [How to Ensure Your New Dates Display on Google](#how-to-ensure-new-dates-display-on-Google)
       
    

## 1  Changing the Date and Time on Your Posts/Pages

### 1.1  Navigate to the Post/Page

First, navigate to the post/page for which you want to change the time by clicking on **Edit** that you want to change the time.

![Edit Post](https://rankmath.com/wp-content/uploads/2021/02/edit-post.jpg)

### 1.2  Click on the Edit Link

On the post edit screen, under the Publish meta box, you’ll see the option to publish the post immediately. Right next to it, there is an **Edit link.**Clicking on the Edit link will display the post’s time and date settings.

![Click on Edit Link](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202554%20986'%3E%3C/svg%3E)

### 1.3  Set the Date and Time

Then set the date and time for your post/page. You can also choose a future date that will allow you to schedule the post to be published on that particular date and time.

![Schedule Post for future date](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20624%20658'%3E%3C/svg%3E)

If you set a past date, then it will update the date and change the post’s position in your site’s archive pages, as shown below:

![Past Date](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202526%20512'%3E%3C/svg%3E)

Once you’ve updated the date and time in your posts/pages, Rank Math will automatically update your sitemap and the Schema & OpenGraph Tags for the post.

However, Google may continue to display the old date or a different date altogether. This can happen if the Structured data on your content still contains the old date. In such a situation, you’ll have to confirm that the Structured data has changed to the new date.

## 2  How to Ensure Your New Dates Display on Google

Google estimates the date by reviewing the dates on your content and selects the published date.

### **2.1  The Date Schema**

Google uses the `datePublished` and `dateModified` properties of the Date Schema to estimate the date and time an article was published or modified.

To check your content `datePublished` and `dateModified` properties, navigate to the [Rich Results Test tool](https://search.google.com/test/rich-results) and enter the post or page’s URL. Then, click the **Test URL**button, as shown below.

![Paste the post or page URL in the Rich Results Test tool](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202462%201018'%3E%3C/svg%3E)

Next, click **View Tested Page**. Then, click the Search icon on the right side of the screen and search for `datePublished`****and `dateModified`, as shown below.

![Search for datePublished and dateModified](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%201129'%3E%3C/svg%3E)

### 2.2  **The lastmod Tag**

Google uses the <lastmod> tag in your sitemap to estimate the last time you modified a content.

To check the `lastmod` tag on your content, navigate to **Rank Math SEO → Sitemap Settings**from your WordPress dashboard. Click on the sitemap index URL located at the top of the page, as shown below.

![Navigate to your sitemap index URL](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%201281'%3E%3C/svg%3E)

You can then check the last modified time of your post/page by navigating to the page/post sitemap, as shown below.

![Navigate to the page or post sitemap](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20835'%3E%3C/svg%3E)

You can now check the last modified time for your posts, as shown below.

![Check the lastModified time](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20921'%3E%3C/svg%3E)

### **2.3  The article:published_time Meta Tag**

Google also uses the `article:published_time` meta tag to determine the date a content was published.

To check the `article:published_time` on your content, right-click on the post/page and click on **Show Page Source**, as shown below.

![click Show Page Source](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201914%20726'%3E%3C/svg%3E)

Next, search for `article:published_time`, as shown below.

![Check article:published_time](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20894%20258'%3E%3C/svg%3E)

### 2.4  **The pubDate Tag**

Google also uses the `pubDate` tag to estimate the date a content was published.

To view the `pubDate` on your content, right-click on the post/page and click on **Show Page Source**.****Once done, search for **RSS**and click the RSS Feed URL, as shown below.

![Click the RSS Feed URL](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201464%20238'%3E%3C/svg%3E)

Next, search for the URL of the content. If the URL exists in your feed, its `pubDate` will be visible below it, as shown below.

![pubDate visible ](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201240%20460'%3E%3C/svg%3E)

That said, you can follow a few best practices to ensure Google can detect the correct date on your content. One is to have only one date on your posts/pages. You can also ensure that you use the correct timezone on your site; otherwise, Google may use an entirely wrong date as your published date.

We hope you’re able to change the date and time on your posts and pages. If you have questions, you’re always more than welcome to [contact our dedicated support team](https://rankmath.com/support/). We’re available 24/7, 365 days a year…

			

			 

			
	
		
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

		

										
			
- [How to Download & Install WP Rocket from Rank Math Website?](https://rankmath.com/kb/how-to-install-wp-rocket/)

										
			
- [How to Add Multiple Keywords in WordPress](https://rankmath.com/kb/how-to-add-multiple-keywords/)

										
			
- [How to Install the Imagify Plugin via Rank Math PRO](https://rankmath.com/kb/install-imagify-plugin/)

										
			
- [How to Build SEO Report for Your Website](https://rankmath.com/kb/seo-report/)

										
			
- [How to Connect/Disconnect Your Website From Rank Math](https://rankmath.com/kb/how-to-connect-or-disconnect-rank-math/)

										
			
- [Installing the Rank Math Plugin for the First Time](https://rankmath.com/kb/installation/)