# How to Limit the Number of Words in RSS Feed?

> **Category:** Miscellaneous
> **Source:** https://rankmath.com/kb/limit-rss-feed-word-count/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Limit the Number of Words in RSS Feed?

			
			

	

RSS feeds are an essential component of many websites, providing a convenient way for users to subscribe to and receive updates from your content.

While the default WordPress RSS feed includes the full content of your posts, you can control the amount of text displayed to maintain a concise and engaging feed.

In this knowledgebase article, we’ll guide you through limiting the number of words in your RSS feed in WordPress.

## **Limiting Words in WordPress RSS Feed**

In WordPress, you can limit the number of words in your RSS feed by using filters and functions.

To achieve this, simply incorporate a custom function into your theme’s `functions.php` file. This function filters your RSS feed content, enabling you to tailor it to your preferred word count.

Here’s a guide to help you through the process:

### **Access the ‘functions.php’ File**

Log in to your WordPress dashboard and go to **Appearance → Theme File Editor**. Here, click **functions.php** file, as illustrated below.

![navigate to functions.php](https://rankmath.com/wp-content/uploads/2024/02/image-62.png)

### **Insert Custom Code**

In the `functions.php` file, you’ll need to insert custom code to restrict the word count in your RSS feed.

**Note:** Exercise caution when editing the `functions.php` file and create a [site backup](https://rankmath.com/blog/backup-wordpress-site/) before making any changes.

Now, scroll down to the bottom of the file and paste the following code:

```
function custom_rss_word_limit($content) {
    $limit = 100; // Change this value to set the desired word limit
    $content = explode(' ', $content, $limit + 1);
    if (count($content) > $limit) {
        array_pop($content);
        $content = implode(' ', $content) . '...';
    } else {
        $content = implode(' ', $content);
    }
    return $content;
}
add_filter('the_excerpt_rss', 'custom_rss_word_limit');
add_filter('the_content_feed', 'custom_rss_word_limit');
```

After adding the code, click the **Update File** button to save your changes, as shown below.

![add code](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201139%20568'%3E%3C/svg%3E)

The `custom_rss_word_limit` function within the code takes the content of the RSS feed as input and limits it to a specified number of words.

So, in the example above, the word limit is set to **100**, but feel free to adjust this value to meet your requirements.

Following this guide, you can effectively limit the number of words in your RSS feed and maintain a more streamlined and reader-friendly content delivery.

Remember to conduct thorough testing of any modifications made to your website to ensure their expected performance. To achieve this, you can append `/feed/` to your website’s URL, for instance, `https://yourwebsite.com/feed/`.

If you have any questions, you can always reach out to our [dedicated support team](https://rankmath.com/support/). They are available 24/7 to help.

			

			 

			
	
		
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