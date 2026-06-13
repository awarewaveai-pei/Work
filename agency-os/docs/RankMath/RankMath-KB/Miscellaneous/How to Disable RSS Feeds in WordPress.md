# How to Disable RSS Feeds in WordPress

> **Category:** Miscellaneous
> **Source:** https://rankmath.com/kb/disable-rss-feeds/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Disable RSS Feeds in WordPress

			
			

	

By default, WordPress enables [various types of RSS feeds](https://developer.wordpress.org/advanced-administration/wordpress/feeds/), including those for taxonomies, authors, individual posts, and pages.

However, you might want to disable these [RSS feeds](https://rankmath.com/seo-glossary/rss-feed/) for various reasons, such as reducing server load, avoiding content scraping, or simply because your site doesn’t rely on RSS for content distribution.

It’s important to note that the Rank Math Plugin does not enable or disable RSS feeds on your website. WordPress automatically generates these feeds, and there is no built-in option to disable them.

In this knowledgebase article, we’ll guide you on how to disable RSS feeds in WordPress.

## 1  Disabling RSS Feeds in WordPress

To disable RSS feeds in WordPress, you’ll need to edit the `functions.php` file of your active theme.

First, [back up your website](https://rankmath.com/blog/backup-wordpress-site/) to ensure easy recovery if anything goes wrong. Since you’ll be editing the `functions.php` file, [create a child theme](https://rankmath.com/blog/wordpress-child-theme/), too, if you haven’t already, to prevent changes from being overwritten during theme updates.

Once you set up a child theme, access your File Manager or use an FTP client to connect to your website’s server. Navigate to the `wp-content/themes/your-child-theme` folder, where you’ll find the `functions.php` file.

Next, right-click to select or double-click to open the file and paste the following code into it:

```
// Disable RSS Feeds
function disable_rss_feeds() {
    wp_die( __( 'No feed available, please visit the <a href="'. esc_url( home_url( '/' ) ) .'">homepage</a>!' ) );
}
add_action('do_feed', 'disable_rss_feeds', 1);
add_action('do_feed_rdf', 'disable_rss_feeds', 1);
add_action('do_feed_rss', 'disable_rss_feeds', 1);
add_action('do_feed_rss2', 'disable_rss_feeds', 1);
add_action('do_feed_atom', 'disable_rss_feeds', 1);
add_action('do_feed_rss2_comments', 'disable_rss_feeds', 1);
add_action('do_feed_atom_comments', 'disable_rss_feeds', 1);

// Remove RSS feed links from header
remove_action('wp_head', 'feed_links', 2);
remove_action('wp_head', 'feed_links_extra', 3);
```

Once you’ve done that, click the **Save File** button to save your changes.

![save functions.php file](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20415'%3E%3C/svg%3E)

Alternatively, you can access the file editor directly within your WordPress dashboard. Go to **Appearance → Theme File Editor** and select your theme from the right-hand sidebar.

Then, click on the `functions.php` file. Paste the code there and click the **Update File**button to save the changes, as demonstrated below.

![Theme file editor in WordPress](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20642'%3E%3C/svg%3E)

After disabling the RSS feeds, visit your website’s feed page (usually yourdomain.com/feed); it will display an error message instead of the RSS feeds, as shown below.

![A website RSS feeds page when disabled](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201135%20294'%3E%3C/svg%3E)

In case your changes don’t reflect on the feeds page, [clear your website’s cache](https://rankmath.com/blog/clear-cache-in-wordpress/) and reload the page.

If you don’t want an error message displayed when users access the RSS feeds page, use this code instead. It automatically redirects users to your homepage.

```
// Disable RSS Feeds and redirect to homepage
function disable_rss_feeds() {
    wp_redirect(home_url());
    exit();
}
add_action('do_feed', 'disable_rss_feeds', 1);
add_action('do_feed_rdf', 'disable_rss_feeds', 1);
add_action('do_feed_rss', 'disable_rss_feeds', 1);
add_action('do_feed_rss2', 'disable_rss_feeds', 1);
add_action('do_feed_atom', 'disable_rss_feeds', 1);
add_action('do_feed_rss2_comments', 'disable_rss_feeds', 1);
add_action('do_feed_atom_comments', 'disable_rss_feeds', 1);

// Remove RSS feed links from header
remove_action('wp_head', 'feed_links', 2);
remove_action('wp_head', 'feed_links_extra', 3);
```

**Note:** Disabling RSS feeds generally won’t harm your SEO, as long as your website doesn’t rely on them for traffic, content syndication, or backlink opportunities.

If you’re not comfortable adding code to your theme files, you can also use a plugin like [Disable Everything](https://wordpress.org/plugins/disable-everything/) to turn off RSS feeds without touching code.

By following these steps and considering the alternative method, you can make an informed decision about disabling RSS feeds on your WordPress site.

That’s it! We hope this tutorial helped you disable RSS feeds in WordPress. If you have any questions about Rank Math, please feel free to [reach out to our support team](https://rankmath.com/support/). They’re always here to help.

			

			 

			
	
		
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