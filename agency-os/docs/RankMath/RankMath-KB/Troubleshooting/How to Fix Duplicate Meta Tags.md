# How to Fix Duplicate Meta Tags

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/fix-duplicate-meta-tags/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Fix Duplicate Meta Tags

			
			

	

Rank Math adds several meta tags essential for search, but it is also possible that your theme or plugin could add the same meta tag, leading search engines to pick up the incorrect one.

With that said, if you encounter duplicate meta tag issues, it’s most likely coming from your active theme or another plugin installed on your site. However, since you cannot tell which is responsible, we recommend using the Health Check and Troubleshooting plugin to identify the culprit.

In this knowledgebase article, we will show you how to fix the duplicate meta tags on your posts and pages.

## Table Of Contents

- [Install Health Check & Troubleshooting](#install-health-check-and-troubleshooting)

- [Enable Troubleshooting Mode](#enable-troubleshooting-mode)

- [Enable Rank Math](#enable-rank-math)

- [Activate Your Theme and Plugins](#activate-your-themes-and-plugins)

- [Fix the Duplicate Meta Tag](#fix-the-duplicate-meta-tag)

## 1  Install Health Check & Troubleshooting

To identify the plugin or theme adding duplicate meta tags, install the **Health Check and Troubleshooting** plugin by heading over to **WordPress Dashboard → Plugins → Add New**.

![Install Health Check & Troubleshooting plugin](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201895%20938'%3E%3C/svg%3E)

Once the installation is complete, click **Activate**.

![Activate Health Check & Troubleshooting plugin](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201894%20904'%3E%3C/svg%3E)

## 2  Enable Troubleshooting Mode

After installing the plugin, head to **Tools →** **Site Health → Troubleshooting** and click **Enable Troubleshooting Mode**, as shown below.

![Enable Troubleshooting Mode](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201891%20916'%3E%3C/svg%3E)

## 3  Enable Rank Math

Then navigate to **Plugins → Installed Plugins** and click **Enable while troubleshooting** under Rank Math SEO and Rank Math SEO PRO.

![Enable Rank Math SEO](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20778'%3E%3C/svg%3E)

## 4  Activate Your Theme and Plugins

Now, you can activate your theme from **Appearance → Themes** and check if the theme is adding duplicate meta tags.

If your theme isn’t responsible, then enable your plugins one by one until you find the plugin causing the issue. This way, you can identify the conflicting plugin/theme.

![Enable your plugins one by one](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201678%20586'%3E%3C/svg%3E)

## 5  Fix the Duplicate Meta Tag

Once you identify the theme or plugin responsible for the duplicate meta tag, uninstall or adjust its settings to ensure it no longer generates a meta tag. If you’re unable to do this, contact their developer for support. Your plugin or theme may also have specific filters to remove the meta tags added by them.

For example, the Hello Elementor theme can add a meta description tag to your site and cause conflict with the meta description tag added by Rank Math. Adding a theme-specific filter like the one below can resolve the issue. You can refer to this guide on [adding filters to your site](https://rankmath.com/kb/wordpress-hooks-actions-filters/).

```
function remove_hello_elementor_description_meta_tag() {
	remove_action( 'wp_head', 'hello_elementor_add_description_meta_tag' );
}
add_action( 'after_setup_theme', 'remove_hello_elementor_description_meta_tag' );
```

That’s it. We hope the tutorial helped you troubleshoot and fix the duplicate meta tags issue in WordPress. If you’re still facing any issues, you’re more than welcome to [contact our dedicated support team](https://rankmath.com/support/). We’re available 24/7, 365 days a year…

			

			 

			
	
		
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