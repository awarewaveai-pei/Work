# Open Graph/Social Preview Image Is Not Displayed

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/open-graph-image-not-displaying/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Open Graph/Social Preview Image Is Not Displayed

			
			

	

You may encounter a situation where your Open Graph/Social Preview Image for posts & pages on your website isn’t showing up when you’re sharing your website. Before considering why that may be the case, let’s walk through how you can set your Open Graph Image and Facebook App ID with Rank Math.

## Table of Contents

- [Set the Default Open Graph Image Using Rank Math](#default-opengraph-image)

- [Set Open Graph Image for Homepage Using Rank Math](#homepage-og-image)

- [Configure Facebook App ID in Rank Math](#facebook-app-id)

- [Why the Open Graph/Social Preview Image Isn’t Appearing](#opengraph-image-not-appearing)

## 1  Set the Default Open Graph Image Using Rank Math

You can set the fallback Open Graph thumbnail at **WordPress Dashboard → Rank Math SEO → Titles & Meta → Global → OpenGraph Thumbnail.** Click the **Add or Upload File** button and then set your image. Finally, click on **Save Changes.**

![OpenGraph Thumbnail](https://rankmath.com/wp-content/uploads/2021/09/OpenGraph-Thumbnail.jpg)

This is in addition to the individual post/page settings, where you can always easily set a custom Open Graph/Social Preview image simply by uploading a featured image:

![Add featured image](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20800%20463'%3E%3C/svg%3E)

And/or by opening Rank Math in the WordPress Block Editor sidebar and adding one through the Social tab, as shown below:

![Rank Math Open Graph Image](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20800%20384'%3E%3C/svg%3E)

## 2  Set Open Graph Image for Homepage Using Rank Math

While the previous method lets you set a default Open Graph Thumbnail for all pages on your website, Rank Math includes a dedicated option to set the Open Graph Thumbnail for your homepage.

Start by checking what your homepage is set to display under **Settings → Reading → Your homepage displays**. If your homepage is set to display **Your latest posts**, then you can change the homepage Open Graph thumbnail under **Rank Math SEO → Titles & Meta → Homepage → Homepage Thumbnail for Facebook**.

![Homepage Thumbnail for Facebook](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201525%20500'%3E%3C/svg%3E)

In case an individual page is set as a homepage, then you can edit the page in WordPress Editor and set the Open Graph thumbnail in the Rank Math Metabox of that page, as shown in the previous section.

## 3  Configure Facebook App ID in Rank Math

Facebook App ID is one of the [basic tags that Facebook recommends](https://developers.facebook.com/docs/sharing/webmasters/#basic) using on all content types. However, this tag was used for Facebook Insights, which allowed users to view and access analytics on traffic to your website from Facebook.

Since [Facebook Insights is no longer available](https://www.facebook.com/business/help/966883707418907), you may skip adding this tag, but the sharing debugger continues to provide warnings for not adding the app ID. You may consider creating a new app or using Facebook’s default app ID (_966242223397117_) to remove the warning from sharing debugger.

To set your Facebook App ID, go to **WordPress Dashboard →** **Rank Math SEO → Titles & Meta → Social Meta**. Here, you can set the Facebook App ID in the **Facebook App** field.

![Set Facebook App ID in Rank Math Social Meta](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202046%202285'%3E%3C/svg%3E)

Once you’ve added the Facebook App ID, click the **Save Changes** button at the bottom of the page for Rank Math to update the Open Graph tags.

## 4  Why the Open Graph/Social Preview Image Isn’t Appearing

The [social options](https://rankmath.com/kb/meta-box-social-tab/) may be tricky to understand and configure, but their outcomes are massive. There are a few reasons why Facebook (or any other social network like WhatsApp) does not pick your images and other social tags. We will list them below so you can check which one applies in your case:

### 4.1  Added Facebook/Twitter Sharing Images

At first, you need to check if you’ve added Facebook/Twitter sharing images through Rank Math Meta Box, as shown below.

![Social Meta using Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201342%20532'%3E%3C/svg%3E)

### 4.2  Image Dimensions & Image Format

If you’ve added an image, then double-check the dimension and format of the uploaded image.

[Facebook officially supports](https://developers.facebook.com/docs/sharing/webmasters/#images) only JPEG, PNG, and GIF image formats for Open Graph images. However, Rank Math supports additional formats like WebP and AVIF for Facebook Open Graph images.

So, if you use WebP or AVIF formats, Facebook and similar social media platforms can recognize them. However, if you use any image format other than these, the images may not display correctly when [shared on social media](https://rankmath.com/kb/sharing-content-on-social-media/).

Similarly, the recommended image size is **1200px X 630px**. If the image’s dimensions are too small or too large compared to the recommended image size, then individual social networks may not read your image correctly. In these cases, social networks will pick other images of your page that satisfy these dimensions (_if any_) instead of your desired social preview image.

### 4.3  Non-English Characters in Image Filenames

If your Open Graph image filename contains non-English or special characters, Facebook might not display it properly when the link is shared.

To fix this, check the filename of your thumbnail image. If it includes non-English characters, rename it using only English letters and standard characters — for example, `image-name.png`. Then, re-upload the image to your WordPress media library.

After uploading, clear your site cache and any server-level caches (including Cloudflare) to ensure the changes take effect.

If you have multiple images with non-English filenames, consider using a plugin like [Phoenix Media Rename](https://wordpress.org/plugins/phoenix-media-rename/) to bulk-rename them. Just be cautious while using it.

![Rename filenames in bulk](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20677'%3E%3C/svg%3E)

Finally, use the [Facebook Sharing Debugger tool](https://developers.facebook.com/tools/debug/) to scrape the URL again. This refreshes Facebook’s cache and helps it detect the updated image.

### 4.4  URL is Accessible

Then, you need to check if the page URL and Open Graph image are accessible. If, for some reason, your server responds with a [403 Forbidden error](https://rankmath.com/kb/fix-blocked-due-to-access-forbidden-403-error/) or other errors, then Facebook and other social media platforms might not be able to crawl and access the contents of your page.

To check if your URLs are accessible, open the [URL checker](https://httpstatus.io/) and then add the page URL and Open Graph image URL. Click the **Check Status** button, and now you’d be able to check if your URLs are returning a status code HTTP 200.

![Check if URL is accessible](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201264%20362'%3E%3C/svg%3E)

### 4.5  Check the Page Source

Next, you must check the page source of the URL in question. Right-click on your page and click on **View Page Source**. Then check if you’re able to find the **og:image** tag added in the source code.

![Check OpenGraph Image tags in source code](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201926%20940'%3E%3C/svg%3E)

If the **og:image** tag is not found, that means Rank Math is either disabled or not able to print your social tags. Once you have checked whether Rank Math is enabled, you must check why it isn’t able to print social content by following this [troubleshooting guide](https://rankmath.com/kb/check-plugin-conflicts/). Please be careful and follow the instructions correctly.

It is also possible that og:image tag could be duplicated because of a conflict with other plugins or with your theme. This could leave social networks confused about the exact image to be picked. You can follow our troubleshooting guide to identify any [possible plugin or theme conflict](https://rankmath.com/kb/check-plugin-conflicts/).

### 4.6  og:image Found Towards the End of Source Code

Assuming the og:image tag was found in the previous step, we can proceed with the next step to find the issue.

If you’re using minification on your website and your cache plugin is inputting too much inline CSS into your page source that your Open Graph tags may be pushed way too down your page’s source code.

![Check if OpenGraph tags are pushed towards the end of source code](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201280%20541'%3E%3C/svg%3E)

If this is the cache, you must move your inline CSS to a file because Facebook and other social networks will only look for Open Graph tags in the first 60 KB of your page’s source.

If they don’t find it, they will assume you haven’t added them. They don’t want to waste their resources crawling huge pages looking for Open Graph tags.

### 4.7  Gzip Compression

The gzip browser cache option in most cache plugins like W3 Total Cache is known to not play well with Facebook’s Open Graph detection. If you have it enabled, **disable it**.

The option for W3 Total Cache is at **WordPress Dashboard → Performance → Browser Cache → HTTP (gzip) compression**.

![Disable HTTP (gzip) compression](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201500%201060'%3E%3C/svg%3E)

Then, [clear your website and server cache](https://rankmath.com/blog/clear-cache-in-wordpress/) (including Cloudflare – if enabled). Once you are done, you can [test](https://developers.facebook.com/tools/debug/) again.

Click the **Scrape Again** button:

![Scrape again in Facebook sharing debugger](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202050%201619'%3E%3C/svg%3E)

You should now see the Open Graph tags updated, including the image.

And that’s it. We hope the article helped you resolve the issue. In case, If the above steps did not resolve your problem, please feel free to [reach our support team](https://rankmath.com/support/) directly from here, and we will be more than happy to help.

			

			 

			
	
		
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