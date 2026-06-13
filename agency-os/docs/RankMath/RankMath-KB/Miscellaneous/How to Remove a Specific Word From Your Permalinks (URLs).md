# How to Remove a Specific Word From Your Permalinks (URLs)

> **Category:** Miscellaneous
> **Source:** https://rankmath.com/kb/remove-specific-word-from-permalinks/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Remove a Specific Word From Your Permalinks (URLs)

			
			

	

When you begin writing your posts, you might not be familiar with the permalink structure. But to make your permalink structure look clean, you must remove unnecessary words from your URLs.

If you’ve removed the base from your permalink structure, you must consider redirecting your old URLs to the new URLs to ensure you don’t lose any search engine traffic due to these broken links.

In this knowledgebase article, we’ll walk you through how you can remove a particular word from all your URLs. This can be handled easily in Rank Math by [setting up redirections](https://rankmath.com/kb/setting-up-redirections/) in the Redirection Manager.

## Removing a Particular Word from the URL

### 1  Navigate to Redirections

At first, head over to **WordPress Dashboard → Rank Math SEO → Redirections,** as shown in the image below. If the Redirections Manager is unavailable in your Rank Math menu, ensure that you’ve enabled the **Redirections** module from **WordPress Dashboard →** **Rank Math SEO**.

![Navigate to Redirections](https://rankmath.com/wp-content/uploads/2023/01/redirections-menu-1.jpg)

### 2 Add a New Redirection

In the Redirections Manager, click the **Add New** button as shown below.

![add new redirection in Rank Math](https://rankmath.com/wp-content/uploads/2022/09/add-new-redirection.jpg)

### 3  Create a Regex Redirection

To remove a particular word from all your URLs, you need to create a redirection with the [regex (regular expression) matching type](https://rankmath.com/kb/how-to-use-regex-redirects/).

You need to instruct Rank Math to look for a specific word in the URL with a regex. And when the URL with a specific word matches your regex, Rank Math would remove the word from the URL and return the URL’s remaining part. The resulting URL would be the destination URL or the URL where your visitor would be redirected to when they land on your old links.

The regex for removing a word would be:

```
Regex Source URL: ^wordtoreplace/(.*)
Destination URL: /$1
```

In the **Regex Source URL**, you’ll need to replace `wordtoreplace` with the word you wanted to remove from the URL.

Now in the Add Redirections dialog box, add your source and destination URLs and select the matching type as **Regex** from the drop-down list. This is how the redirect will look inside the dialog box.

![Adding regex redirect to remove a particular word from the URL](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201678%202184'%3E%3C/svg%3E)

Once you’ve added the Source URL, Regex matching type, and Destination URL, set the status to **Activate** and click the **Add Redirection** button.

Now that the redirection is activated, for instance, a visitor landing on your website’s page `https://www.example.com/wordtoreplace/post-url/` would be redirected to `https://www.example.com/post-url/` with a 301 redirection.

And that’s it! We hope you were able to remove a particular word from the URL with this tutorial. If you still have questions about using our Redirection feature, feel free to contact[our support team](https://support.rankmath.com/) — as we’re always here to help.

			

			 

			
	
		
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