# How to Get a YouTube API Key

> **Category:** Schema
> **Source:** https://rankmath.com/kb/how-to-get-a-youtube-api-key/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Get a YouTube API Key

			
			

	

Rank Math PRO allows you to automatically [fetch data from YouTube videos](https://rankmath.com/kb/auto-detect-and-fetch-video-data/) to use in Video Schema and Video Sitemap. The data is fetched using YouTube’s Public API, which works well for most users.

However, if you notice any discrepancies, such as incorrect titles, descriptions, or no thumbnails, we recommend generating a **YouTube Data API key** for more accurate results.

**Note:** YouTube’s Data API is free but has a daily quota. You can fetch data of up to 100 videos per day, which should be sufficient for most users.

In this tutorial, we will walk you through the steps to get an API key for yourself and use it with Rank Math.

## 1  Configure Rank Math’s Video Sitemap [PRO](https://rankmath.com/pricing/)

To use this advanced feature, you must first ensure that Rank Math’s Video Sitemap module is enabled from **WordPress Dashboard → Rank Math SEO → Dashboard → Modules**.

![Video Sitemap](https://rankmath.com/wp-content/uploads/2025/01/Video-Sitemap.png)

Now, when you head over to **Rank Math SEO → Sitemap Settings → Video Sitemap**, you should see the **YouTube API Key** field.

![YouTube API Key](https://rankmath.com/wp-content/uploads/2025/01/YouTube-API-Key.png)

If you don’t see this option, [switch to](https://rankmath.com/kb/switch-from-easy-to-advanced-mode/)[Advanced Mode](https://rankmath.com/kb/switch-from-easy-to-advanced-mode/) in Rank Math.

## 2  Login to Google’s Cloud Console

Visit the [Google’s Cloud Console](https://console.cloud.google.com/). If you haven’t already created a project, you will need to create a new one. If you already have a project created, then you can proceed to the next step.

To create a new project, click the **CREATE PROJECT** option that appears on the screen.

![Create New Project in Google Cloud Console](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201271%20332'%3E%3C/svg%3E)

Next, enter the project details and click the **CREATE** button.

![Project Details](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201007%20426'%3E%3C/svg%3E)

## 3  Create API Key

Once you’ve created a project, click the **Credentials** tab in the left menu.

![Visit Credentials tab](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201269%20459'%3E%3C/svg%3E)

On the Credentials page, click the **Create Credentials** option, and from the dropdown, choose **API Key**.

![Create Credentials and API Key](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201238%20600'%3E%3C/svg%3E)

Wait for a few moments for the API key to be created. Then, copy the generated API Key.

![Copy API Key](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201233%20674'%3E%3C/svg%3E)

Paste it into the **YouTube API Key** field in the Rank Math Settings, and click the **Save Changes** button as shown below.

![Save Changes](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20765%20422'%3E%3C/svg%3E)

## 4  Enable the YouTube Data API

Google, by default, doesn’t enable the YouTube Data API for all the projects.

So, we still need to head over to the **Enabled APIs & services** tab in the Cloud console menu and choose **ENABLE APIS AND SERVICES** option, as shown below.

![Enable APIs & services](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201272%20730'%3E%3C/svg%3E)

From the API Library, search for **YouTube Data API v3** and select it.

![YouTube Data API v3](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201271%20482'%3E%3C/svg%3E)

Then, **ENABLE** the YouTube Data API as shown below.

![Enable YouTube Data API](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201272%20469'%3E%3C/svg%3E)

Now that you’ve enabled the YouTube Data API, you can start using it within Rank Math PRO.

And that’s it. If you have any questions about Rank Math or facing any issues with the setup, feel free to get in touch with our [support team here](https://rankmath.com/support/), and our support team will always be happy to assist you.

			

			 

			
	
		
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

		

										
			
- [How to Convert Time Duration to ISO 8601 Format](https://rankmath.com/kb/iso-8601-format/)

										
			
- [How to Add Merchant Return and Shipping Policy in WooCommerce?](https://rankmath.com/kb/merchant-return-and-shipping-policy/)

										
			
- [What is WebSite Schema and How Do You Implement It?](https://rankmath.com/kb/website-schema/)

										
			
- [How to Implement sameAs Schema on Your Website](https://rankmath.com/kb/sameas-schema/)

										
			
- [How to Implement Author SEO on Your Website to Boost E-E-A-T](https://rankmath.com/kb/author-seo/)

										
			
- [How to Add Profile Page Schema Markup?](https://rankmath.com/kb/profilepage-schema/)