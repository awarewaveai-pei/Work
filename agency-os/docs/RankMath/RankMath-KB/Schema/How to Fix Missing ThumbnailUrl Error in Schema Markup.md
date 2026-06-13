# How to Fix Missing ThumbnailUrl Error in Schema Markup

> **Category:** Schema
> **Source:** https://rankmath.com/kb/fix-missing-thumbnailurl-error/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Fix Missing ThumbnailUrl Error in Schema Markup

			
			

	

If you publish content containing videos, you want to ensure the [videos appear correctly in Google’s search results](https://rankmath.com/blog/video-seo/). Adding a thumbnail image to the videos is one way to achieve this.

If your video lacks a thumbnail image, Google may autogenerate one, or Rank Math may add one automatically, depending on your settings. However, if none of these happens, Google Search Console (GSC) and the Rich Results Test tool will display a Missing field “thumbnailUrl” error message, as shown below.

![Missing field thumbnailUrl error message](https://rankmath.com/wp-content/uploads/2023/09/Missing-field-thumbnailUrl-error-message.png)

This knowledgebase article will show you how to fix the Missing field “thumbnailUrl” error in Google Search Console using Rank Math.

## In this guide, we’ll cover:

- [Use Your YouTube API Key](#use-your-youtube-api-key)

- [Add a Featured Image to Your Page or Post](#add-a-featured-image)

- [Add a Custom thumbnailUrl Property via Video Schema](#add-a-thumbnailurl-property)

- [Validate Your Page Schema Markup](#validate-schema-markup)

## 1  Use Your YouTube API Key [PRO](https://rankmath.com/pricing/)

If your video thumbnail displays an error message in GSC, and you’ve already enabled the [Autodetect Video and Autogenerate Image](https://rankmath.com/kb/auto-detect-and-fetch-video-data/) options, adding your **YouTube API key** to Rank Math can fix the issue.

This allows Rank Math to fetch data, including video thumbnails, directly from YouTube, resolving discrepancies when Google or Rank Math fails to autogenerate one.

To do this, first, enable the **Video Sitemap module** by navigating to **Rank Math SEO → Dashboard → Modules** in your WordPress dashboard.

![Enable the Video Sitemap in Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20924%20351'%3E%3C/svg%3E)

Then go to **Rank Math SEO → Sitemap Settings → Video Sitemap**, and enter your **YouTube API key** in the **YouTube API Key** field.

![Add your YouTube API Key to Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201014%201005'%3E%3C/svg%3E)

If you’re unsure how to get your API key, you can [follow our guide](https://rankmath.com/kb/how-to-get-youtube-api-key/) for detailed instructions. Don’t forget to save your changes once you’ve added the key.

## 2  Add a Featured Image to Your Page or Post

**When your video is hosted directly on your WordPress site, Rank Math uses the featured image as the thumbnail.** This happens because Rank Math can only automatically detect videos and fetch their thumbnails if the videos are hosted on supported external platforms like YouTube, provided the Autodetect Video and Autogenerate Image options are enabled.

To ensure your WordPress-hosted videos display properly, add a featured image to your page or post. But before then, enable the Schema Module.

### 2.1  Enable the Schema Module

Navigate to **WordPress Dashboard**→ **Rank Math SEO**and enable the **Schema**module, as shown below.

![Enable the Schema module in Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201371%20494'%3E%3C/svg%3E)

Now, follow these steps to set a featured image:

### 2.2  Click the Settings Icon

To set a featured image, navigate to the post or page. In the top taskbar, click the **Settings/Sidebar** icon, as shown below.

![click the Settings icon](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20655'%3E%3C/svg%3E)

### 2.3  Navigate to the Featured Image Tab

In the sidebar, scroll to the Featured Image section and click **Set featured image** to select a thumbnail image from your website’s media files or upload one from your computer.

![Click Set featured image](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20655'%3E%3C/svg%3E)

After adding a featured image, the thumbnailUrl property will be automatically added to your Video Schema, thus fixing the Missing field “thumbnailUrl” error.

## 3  Add a Custom thumbnailUrl Property via Video Schema

If you don’t want to use your featured image as your video’s thumbnail**,**you can add a custom thumbnail using Rank Math’s [Video Schema](https://rankmath.com/kb/video-schema/). Here’s how to do it:

### 3.1  Open the Rank Math Metabox

The first step is to navigate to the top-right of the screen and click the **Rank Math**icon, as shown below.

![Open the Rank Math metabox](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20655'%3E%3C/svg%3E)

### 3.2  Open the Video Schema

In the Rank Math metabox, click the **Schema** icon. Then, navigate to the Video Schema and click the **Edit**icon.

![Click the Schema tab and the Edit icon](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201180%201076'%3E%3C/svg%3E)

**Note:** You will be presented with multiple Video Schema Markups if the content contains multiple videos. You can copy and open the **EMBED URL** or **CONTENT URL**in a new tab to reveal the video connected to the Schema.

### 3.3  Upload a Video Thumbnail URL

In the Schema Builder, locate the**VIDEO THUMBNAIL** section and paste your video’s custom thumbnail image URL. Once done, click **Save for this Post**.

![Paste your video thumbnail in the Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20655'%3E%3C/svg%3E)

This will automatically fix the Missing field “thumbnailUrl” error for a single Video Schema. If the content contains multiple videos, you will insert the VIDEO THUMBNAIL URL one after another.

## 4  Validate Your Page Schema Markup

You can validate your Schema to confirm that you have fixed the Missing field “thumbnailUrl” error. Here’s how to go about it.

### 4.1  Navigate to the Schema Tab

Return to the Schema in Use field and click the **View** icon, as shown below.

![Click the view icon of the Video Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201362%20520'%3E%3C/svg%3E)

### 4.2  Test the Code

A popup box will appear showing the JSON-LD CODE of your page Schema. To validate the code, click **Test with Google**, as shown below.

![Click Test with Google](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20655'%3E%3C/svg%3E)

You’ll be redirected to [the Rich Result Test tool](https://rankmath.com/kb/rich-results-test/). Click **TEST CODE** as shown below.

![Click TEST CODE](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20646'%3E%3C/svg%3E)

If you’ve correctly resolved the issue, the results will show that your video item is detected as valid.

![Example of a valid thumbnailUrl property](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20646'%3E%3C/svg%3E)

The Missing field “thumbnailUrl” error occurs when Google cannot find a valid thumbnail image for your video content on your web page. By fixing the error as shown in this knowledgebase, you can ensure that Google can find and display your video thumbnails correctly and improve your site’s visibility in search results.

We hope you’re able to fix the Missing field “thumbnailUrl” error. If you have questions, you’re always more than welcome to [contact our dedicated support team](https://rankmath.com/support/). We’re available 24/7, 365 days a year…

			

			 

			
	
		
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

										
			
- [How to Get a YouTube API Key](https://rankmath.com/kb/how-to-get-a-youtube-api-key/)

										
			
- [How to Add Merchant Return and Shipping Policy in WooCommerce?](https://rankmath.com/kb/merchant-return-and-shipping-policy/)

										
			
- [What is WebSite Schema and How Do You Implement It?](https://rankmath.com/kb/website-schema/)

										
			
- [How to Implement sameAs Schema on Your Website](https://rankmath.com/kb/sameas-schema/)

										
			
- [How to Implement Author SEO on Your Website to Boost E-E-A-T](https://rankmath.com/kb/author-seo/)