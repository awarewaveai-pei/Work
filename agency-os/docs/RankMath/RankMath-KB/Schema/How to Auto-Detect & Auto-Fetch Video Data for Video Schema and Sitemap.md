# How to Auto-Detect & Auto-Fetch Video Data for Video Schema and Sitemap

> **Category:** Schema
> **Source:** https://rankmath.com/kb/auto-detect-and-fetch-video-data/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Auto-Detect & Auto-Fetch Video Data for Video Schema and Sitemap

			
			

	

Rank Math PRO can automatically detect videos inside your content and fetch the video data. You can use this fetched video data to generate the required [Video Schema](https://rankmath.com/kb/video-schema/) and include them in your [Video Sitemap](https://rankmath.com/kb/video-sitemap/) as well. To ease your workflow, Rank Math can also get them done automatically when configured to do so.

Rank Math will be able to detect videos from any of the supported platforms like YouTube, Vimeo, DailyMotion, TedVideos, and VideoPress, or if you had hosted the video on your own WordPress website itself.

In this knowledgebase article, we’ll show you the exact steps you need to follow to take advantage of the auto-detect and auto-fetch feature of Rank Math.

## Table of Contents

- [Configuring Settings](#configuring-settings)

- [Auto-Detect and Auto-Fetch Video Data](#auto-detect-auto-fetch)

- [Using Schema Generator](#schema-generator)

- [Using Video Block](#video-block)

- [Using Elementor Video Widget](#elementor-video-widget)

- [Auto-Fetched Fields](#auto-fetched-fields)

- [Conclusion](#conclusion)

## 1  Configuring Settings

For Rank Math to auto-detect and auto-fetch video data, at first, you’ll need to configure the following settings – let’s get started.

### 1.1  Enable Schema Module

Rank Math can generate Schema Markup for any post on your website only if you have enabled the Schema module. If you haven’t already enabled the Schema module, you can do that by navigating to **WordPress  Dashboard → Rank Math SEO**. From the list of available modules, enable the **Schema**module as shown below.

![Enable Schema (Structured Data) module](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201371%20494'%3E%3C/svg%3E)

### 1.2  Autodetect Video [PRO](https://rankmath.com/pricing/)

To allow Rank Math to start detecting your videos, navigate to **Rank Math SEO → Titles & Meta Settings → Posts** inside your WordPress admin area. As you scroll down the page, you’ll find the **Autodetect Video**option. Enable this option.

![Autodetect Video](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201504%20233'%3E%3C/svg%3E)

Once you’ve enabled the option, Rank Math will start detecting videos inside your posts and automatically fetches the video data. Further Rank Math can now generate Video Schema (_if you had enabled the Schema module_) and include the video to your Video Sitemap (_which we’ll configure shortly_).

This setting under the **Posts** section lets Rank Math auto-detect videos only for posts. But, if you want to enable the **Autodetect Video** option for other posts types, you can choose the corresponding post type section and then enable the Autodetect Video option in the same way.

### 1.3  Autogenerate Image [PRO](https://rankmath.com/pricing/)

When you enable the **Autodetect Video** option, the Autogenerate Image option will appear below. Once you enable the **Autogenerate Image** option, Rank Math will automatically generate thumbnails for the detected videos and use them in the Video Schema and Video Sitemap.

![Autogenerate Image](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201501%20238'%3E%3C/svg%3E)

**Note:** Rank Math will generate thumbnails only for videos hosted on external supported platforms. For videos hosted on your own website, Rank Math will use the post thumbnail as the **Video Thumbnail**.

### 1.4  Enabling Video Sitemap [PRO](https://rankmath.com/pricing/)

Rank Math includes a fully compliant Video Sitemap generator. Enabling this feature is completely optional. But, having a [Video Sitemap on your website](https://rankmath.com/kb/video-sitemap/) will help search engines find, crawl and index all the videos present on your website.

For Rank Math to include your autodetected videos to your Video Sitemap, you’ll need to enable the **Video Sitemap** module under **WordPress Dashboard → Rank Math SEO**, as shown below.

![Enable Video Sitemap module](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201371%20517'%3E%3C/svg%3E)

**Please note:** The Video Sitemap module can be enabled only if the Sitemap module and Schema module are already activated. Otherwise, if any one of the modules (Sitemap or Schema) is disabled, you’ll be prompted to activate both the Schema and Sitemap modules, in order to enable the Video Sitemap module.

### 1.5  Video Post Type [PRO](https://rankmath.com/pricing/)

Once you’ve enabled the Video Sitemap module, you can configure your Video Sitemap under **Rank Math SEO → Sitemap Settings → Video Sitemap**.

Under the Video Sitemap section, you’ll find the **Video Post Type** option that lets you choose all the post types where you use video. Rank Math will look for the presence of videos only in these posts types and includes them in the Video Sitemap.

![Video Post Type](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201500%20516'%3E%3C/svg%3E)

### 1.6  Custom Fields [PRO](https://rankmath.com/pricing/)

If you want Rank Math to look for videos present in custom fields, then you must let Rank Math know the name of the custom fields to look for.

In the **Custom Fields** option available under **Rank Math SEO → Sitemap Settings → Video Sitemap**, enter the name of the custom fields one per line. If you’re unable to find the Custom Fields option under Video Sitemap settings, make sure that you’re using the [advanced mode of Rank Math](https://rankmath.com/kb/advanced-mode/).

![Custom Fields](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201500%20368'%3E%3C/svg%3E)

**Note:** You might be familiar with the Custom Fields option available under **Rank Math SEO → Titles & Meta Settings → Posts**. While the Custom Fields option available under Titles & Meta Settings is used for page analysis, the Custom Fields option available under Video Sitemap settings is used for detecting the presence of videos.

## 2  Auto-Detect and Auto-Fetch Video Data

Now that you’ve configured, Rank Math can automatically detect and fetch video data if you’ve used a video inside your content. While there are multiple ways to add or embed videos to your content, Rank Math works out of the box to detect all the videos.

**Note:** While Rank Math automatically detects video and includes Video Schema, you would need to manually remove this Video Schema if you ever remove the video from the page.

While the auto-detect and auto-fetch feature in Rank Math is built to ease your workflow, we’ll show you some use-cases and how you can take advantage of this feature with Rank Math.

## 3  Using Schema Generator

If your videos are hosted at any one of the external supported platforms (like YouTube, Vimeo, etc.), then to automatically generate the required Video Schema, you only have to paste the URL in the **Embed URL** field of Schema Generator.

To fetch your video data and generate Video Schema with the Schema Generator, you can follow the exact steps shown below.

### 3.1  Edit the Post or Page

Open the post/page where you want to add the Video Schema by clicking the **Edit** option of that post/page.

![Edit the post or page](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201980%20579'%3E%3C/svg%3E)

### 3.2  Open Schema Generator

Now, access the Rank Math Meta Box by clicking the Rank Math SEO icon at the top-right corner of the page, or alternatively click the three vertical dots and choose **Rank Math** under **Plugins**.

![Open Rank Math Meta Box](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%201002'%3E%3C/svg%3E)

In the Rank Math Meta Box, navigate to the **Schema** tab and then choose **Schema Generator**.

![Open Schema Generator](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201240%201122'%3E%3C/svg%3E)

### 3.3  Use Video Schema

From the list of **Available Schema Types**, choose the **Use** option against the Video Schema.

![Use Video Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201300%20429'%3E%3C/svg%3E)

### 3.4  Add Video URL in Embed URL

The Schema Builder will appear on the screen with several options related to Video Schema. In the Embed URL field, add the URL of your video hosted in an external supported platform.

Rank Math will now automatically fetch the video data within a few seconds and sets them to the corresponding fields in the Video Schema. You can also notice the video URL you’ve added to the Embed URL field has now been automatically converted to the appropriate format for Embed URL.

![Auto-fetch video data in Schema Generator](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201274%20718'%3E%3C/svg%3E)

**Note:** While this method may generate the required Video Schema even before adding video to your post, you must still add the video content. Only then, your post will be eligible for featuring rich snippets according to [Google’s structured data guidelines](https://developers.google.com/search/docs/guides/sd-policies#content).

## 4  Using Video Block

The Block Editor in WordPress includes a Video Block that lets you upload or embed videos directly to your post/page. The Video Block also supports embedding Video URLs from external platforms.

To add or embed a video to your post with the Video Block, follow the steps shown below.

### 4.1  Edit the Post or Page

Open the post/page where you want to add the video by clicking the **Edit** option of that post/page.

![Edit your Post or Page](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201980%20579'%3E%3C/svg%3E)

### 4.2  Add a Video Block

To use the Video Block in the Block Editor, click the **Add Block** icon and choose the Video Block from the list of available blocks or simply type `/video` in a new paragraph block and choose **Video Block**, as shown below.

![Add a Video Block](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20973'%3E%3C/svg%3E)

### 4.3  Upload/Embed Your Video

If you’re embedding videos hosted on any external platforms, click the **Insert from URL** option. Enter the URL of your video in the text box that appears, and then click **Apply**.

![Insert Video from URL](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201787%20704'%3E%3C/svg%3E)

If you want to upload the video directly to your website or embed a video that you’ve already uploaded to your website, then click the **Media Library** option in the Video Block. In the WordPress Media Manager, you can upload/select the video to be embedded to your post/page. Once you’ve selected the video click the **Select** button.

![Upload or select video from WordPress media manager](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201211%20655'%3E%3C/svg%3E)

### 4.4  Save the Post

Update the post as you would normally do, and in case if it is a new post, click the **Publish** button. In the blink of an eye, Rank Math will detect the video, fetch the video data, generate the Video Schema, and even includes the video in the Video Sitemap.

![Auto-detect video block and generate Video Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201278%20718'%3E%3C/svg%3E)

## 5  Using Elementor Video Widget

If you’re using a page builder that comes with native integration support for Rank Math, like the Elementor page builder, then Rank Math can also detect videos from the page builder’s widgets. For instance, we’ll show you how this works with the Elementor Video widget.

### 5.1  Edit Page with Elementor Page Builder

To add a Video widget, open any post/page using the Elementor page builder by clicking the **Edit with Elementor** option.

![Edit post with Elementor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201971%20570'%3E%3C/svg%3E)

### 5.2  Add Video Widget

Under the **Elements** tab, you can find the Video widget. Drag and drop the Video widget to your editing screen.

![Drag and drop Elementor video widget](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201195%20645'%3E%3C/svg%3E)

### 5.3  Configure Video Settings

Under the Video settings, choose the **Source** of the video. And then, enter the video URL in the **Link** field.

If this is a self-hosted video, you’ll need to click **Choose File** and then upload/select the video from the WordPress Media Manager. Elementor offers more options for the Video widget, and you can check their [official documentation](https://elementor.com/help/video-widget/) to configure them.

![Configuring Elementor Video widget settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201150%20466'%3E%3C/svg%3E)

### 5.4  Update the Post

Update the post as you would normally do. As soon as you update the post, you can notice the Video Schema automatically appearing under the Schema tab of Rank Math with the fetched video data. The video will also be included in the Video Sitemap if you’ve configured to do so.

![Autodetecting video from Elementor Video widget](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201278%20716'%3E%3C/svg%3E)

## 6  Auto-Fetched Fields

The Video Schema in the Schema Generator has got several fields related to your video. While you can check our [detailed Video Schema KB](https://rankmath.com/kb/video-schema/) on their usage, in this article, we’ll discuss the fields in detail that Rank Math can automatically fetch data for.

### 6.1  Embed URL

The **Embed URL** field in Video Schema will include a link to the embeddable player of the video. For example, the embed URL for a video from YouTube is of the format: `https://youtube.com/embed/videoid`.

While fetching video data directly from the Schema Generator, you can notice that whenever you add an external video URL, Rank Math will automatically convert the URL to the appropriate format.

![Embed URL](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201237%20285'%3E%3C/svg%3E)

**Note:** The Embed URL field will be left empty if the video is hosted on your own website.

### 6.2  Content URL

The **Content URL** field includes the URL to the actual media file. If the video is hosted on your own website, Rank Math will fetch the video data and includes the link to your actual video file.

![Content URL](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201247%20288'%3E%3C/svg%3E)

**Note:** The Content URL field will be left empty if you’re embedding video hosted in an external platform.

### 6.3  Headline

For videos hosted on any external supported platform, Rank Math can automatically fetch the video title and adds it to the **Headline** field.

For videos hosted on your own website, Rank Math considers the SEO Title set for the post as the Headline for the video. But, in case, if you want to set a Headline different from the SEO Title of the post, then you can add your own title in the Headline field or use variables to create one.

![Headline](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201240%20196'%3E%3C/svg%3E)

### 6.4  Description

Similar to Headline, Rank Math can also fetch the video’s description from external supported platforms and adds it to the **Description** field.

If the video is hosted on your own website, you can leave with the default SEO description of your post or choose to craft your own.

![Description](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201241%20334'%3E%3C/svg%3E)

### 6.5  Upload Date [PRO](https://rankmath.com/pricing/)

For videos hosted on any external supported platforms, Rank Math can fetch the uploaded date of the video and adds it to the **Upload Date** field in the Video Schema.

If your videos are hosted on your own website, Rank Math will set the published date of the post to the Upload Date field with the variable `%date(Y-m-dTH:i:sP)%`. In case the upload date of the video is different from that of the published date of the post, then you can manually enter the date or use variables to set the date.

![Upload Date](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201236%20198'%3E%3C/svg%3E)

### 6.6  Duration

If your videos are hosted on any external supported platforms, Rank Math fetches the duration of the video and adds it to the **Duration** field.

But, if your videos are hosted on your own website, you’ll need to enter the duration of the video manually. Enter the duration in the Duration field in ISO 8601 duration format. For example, if your video runs for 1 minute 54 seconds, it should be added as PT1M54S.

![Duration](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201245%20242'%3E%3C/svg%3E)

### 6.7  Video Thumbnail [PRO](https://rankmath.com/pricing/)

For videos hosted on any external supported platforms, Rank Math will automatically generate a thumbnail and set it as the **Video Thumbnail**. This thumbnail will be used in the Video Schema as well as in the Video Sitemap.

If you’re hosting videos on your own website, then the Video Thumbnail will be set to the Post Thumbnail.

![Video Thumbnail](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201240%20236'%3E%3C/svg%3E)

**Note:** Rank Math will automatically generate the thumbnail only if you have enabled the Autogenerate Image option.

### 6.8  Width [PRO](https://rankmath.com/pricing/)

For both self-hosted and externally hosted videos, Rank Math will fetch the video’s width and set it to the **Width** field.

![Width](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201237%20199'%3E%3C/svg%3E)

### 6.9  Height [PRO](https://rankmath.com/pricing/)

For both self-hosted and externally hosted videos, Rank Math will fetch the video’s height and set it to the **Height** field.

![Height](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201254%20200'%3E%3C/svg%3E)

## 7  Conclusion

And, that’s it! We hope the article was helpful in configuring Rank Math to auto-detect and auto-fetch video data. In case if you’ve several old posts and pages on your website to be added with Video Schema, you can follow our [detailed tutorial to add them retroactively](https://rankmath.com/kb/add-video-schema-to-existing-posts/).

And if you’ve absolutely any questions on using the auto-detect and auto-fetch video data feature of Rank Math, feel free to [reach our support team directly from here](https://rankmath.com/support/), and we’re always here to help.

			

			 

			
	
		
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