# How to Change Your Website’s Favicon in WordPress

> **Category:** Miscellaneous
> **Source:** https://rankmath.com/kb/wordpress-favicon/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Change Your Website’s Favicon in WordPress

			
			

	

In this knowledgebase article, we’re going to walk you through how to change your website’s favicon in WordPress.

## What is Favicon?

A favicon is generally just thought to be the small icon that appears next to website names in browser tabs. However, while that’s certainly the most familiar place we see them – they have also appeared in Google Search, also appear in bookmarks, mobile device home screen buttons, and more. All in all, they’re a vital part of your brand recognition & thankfully, setting one up for your site is very easy to do.

Below, we have listed some of the ways in which you can change your website’s favicon without any hassle.

## How to Change Your Website’s Favicon in WordPress?

WordPress provides several methods for changing your website’s favicon. You can modify your WordPress settings or theme or install a third-party favicon plugin from the WordPress plugin directory.

### Change Your Website’s Favicon in the WordPress Customizer

You can change your favicon by customizing the appearance of your WordPress site and then uploading a logo to serve as your site icon. This icon will be your favicon.

#### 1.1  Navigate to Customize

Log into your WordPress site. Once you have logged in navigate to the **WordPress Dashboard → Appearance** as shown below:

![Appearance Settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20312%20460'%3E%3C/svg%3E)

In the Appearance settings, click on **Customize**.

![Click on Customize](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20628%20436'%3E%3C/svg%3E)

#### 1.2  Select a Site Icon

Click on **Site Identity**. Here, you can specify your site name, tagline, logo, and icon. The image that you set in **Site Icon** will be used as your site’s favicon.

![Set your Site Icon](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20598%201234'%3E%3C/svg%3E)

Simply click on the **Select Image** button and upload the image you want to use as a site icon.

### 2  Change Your Website’s Favicon Using Site Logo Block

You can also change your favicon by using the Site Logo Block on one of your pages. Depending on your settings, this image may serve as your favicon, site logo, or favicon and site logo.

**Note:** This method is more suitable for sites using full-site editing themes.

#### 2.1  Create a New Page

Head to **WordPress Dashboard**→**Pages**→**Add New Page**.

![create a new page](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20600'%3E%3C/svg%3E)

#### 2.2  Select the Site Logo Block

Next, type a forward slash `/`****followed by `site logo` into the WordPress editor. Once done, select the **Site Logo**block, as shown below.

![Select the SIte Logo block](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20608'%3E%3C/svg%3E)

#### 2.3  Upload a Site Logo

Now, click the **Site Logo** block to upload a site logo. You can select an image from your media library or upload one from your device.

![Select or upload an image](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20607'%3E%3C/svg%3E)

Next, click on the logo you just uploaded. Once done, click the **Settings** icon, as shown below.

![Click the Settings icon](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20608'%3E%3C/svg%3E)

In the **Block**menu, scroll down and enable **Use as site icon**. Once done, click **Publish**.

![Enable Use as site icon](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20618'%3E%3C/svg%3E)

You will be presented with the option to use the image as your favicon (Icon) and site logo (Logo). If you don’t want to use the image as your site logo, uncheck **Logo**. Once done, click **Save**.

![Click Save](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20607'%3E%3C/svg%3E)

### 3  Use the Plugin RealFaviconGenerator

You can make use of the [RealFaviconGenerator](https://wordpress.org/plugins/favicon-by-realfavicongenerator/) plugin to add the favicon to your WordPress website. You can set up a favicon in a matter of seconds with the help of this plugin.

RealFaviconGenerator generates all the icons you need for desktop browsers, iPhone/iPad, Android devices, Windows 8 devices, and more. To use the plugin install and activate the plugin from your **WordPress Dashboard → Plugins** section.

![Add RealFaviconGenerator plugin](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201664%20656'%3E%3C/svg%3E)

Once you’ve installed and activated the plugin, navigate to the **‘Favicon’** entry in the Appearance menu as shown below:

![Navigate to the Favicon in the Appearance menu](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%201330'%3E%3C/svg%3E)

Select a master picture from the Media Library, click the **‘Generate favicon’** button, and follow the on-screen instructions.

![Enter the picture URL and click on Generate favicon](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202064%20742'%3E%3C/svg%3E)

And that’s it! Your favicon will be set up and ready to go.

### 4  Add Code to Theme’s `header.php`

You can also add code like shown below in the `<head>` section of the theme’s header.php.

`<link rel=“shortcut icon” href=“https://example.com/favicon.ico” />`

Replacing the URL with the location of your favicon file. This code can be easily inserted by editing your header.php file (ideally in a Child Theme) or using the [Code Snippets plugin](http://wordpress.org/plugins/code-snippets/).

## Frequently Asked Questions

### How to Change the Website icon in SERP?

The website icon in SERP indicates that you haven’t set a favicon for your site. You can set your website’s favicon at  **WordPress Dashboard → Appearance → Customize → Site Identity**.

If you’re facing the issue setting up the favicon for your site, you should get in touch with your theme provider instead since this is related to your theme. We suggest [clearing your site, plugin, or any server-level cache](https://rankmath.com/blog/clear-cache-in-wordpress/).

Please follow the [guidelines by Google](https://developers.google.com/search/docs/appearance/favicon-in-search) to make your favicon appear on SERPs. Note that the Google Favicon crawler [occasionally crawls your site](https://developers.google.com/search/docs/appearance/favicon-in-search#crawler), and this can take a while to update your favicon on SERPS.

A WordPress favicon can help accelerate your brand recognition and improve the UX for your website’s visitors. Fortunately, as we’ve discussed, you have multiple options to choose from that make it easy to add a favicon to your WordPress site.

If you still have any questions about changing your website’s favicon in WordPress, please feel free to contact our dedicated [support team](https://support.rankmath.com/). They are available 24/7, 365 days a year…

			

			 

			
	
		
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