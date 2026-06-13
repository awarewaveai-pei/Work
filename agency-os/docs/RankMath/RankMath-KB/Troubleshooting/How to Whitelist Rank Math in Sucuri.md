# How to Whitelist Rank Math in Sucuri

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/how-to-whitelist-rank-math-in-sucuri/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Whitelist Rank Math in Sucuri

			
			

	

To [protect your site from hackers](https://rankmath.com/blog/secure-wordpress-site/), you turn to a security platform like Sucuri. However, after activating Sucuri, you may discover that Rank Math cannot save metadata and focus keywords on your posts and pages. For many users, the only solution is to disable Sucuri.

However, instead of deactivating Sucuri, you can use a code snippet to whitelist Rank Math. In this knowledgebase article, we’ll show you how to whitelist Rank Math in Sucuri.

## 1  How Sucuri Blocks Rank Math from Saving Your Data

Rank Math uses REST API to save metadata and focus keywords on your posts and pages. Sometimes, Sucuri’s firewall flags Rank Math’s REST API path and blocks Rank Math from using it to save your data. Hence, Rank Math cannot save metadata and focus keywords on your posts and pages.

To allow Rank Math to save your metadata and focus keywords, you’ll have to whitelist Rank Math’s REST API path in Sucuri.

## 2  How to Whitelist Rank Math in Sucuri

### 2.1  Navigate to Sucuri

The first step is to log into your Sucuri dashboard and navigate to**Access Control → Allow URL Paths**, as shown below.

![Navigate to Allow URL Paths in Sucuri](https://rankmath.com/wp-content/uploads/2023/01/allow-url-paths.jpg)

### 2.2  Add Code Snippet to Sucuri

Once done, copy the code snippet below and paste it into the text field.

```
/wp-json/rankmath/v1/updateMeta
```

Next, select **Matches** from the dropdown menu and click **Allow**, as shown below.

![Whitelist Rank Math in Sucuri](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201758%20903'%3E%3C/svg%3E)

And that’s it! You have whitelisted Rank Math in Sucuri.

When Sucuri blocks Rank Math’s REST API’s path, disabling the Sucuri firewall is often the quickest way to rectify the problem. However, it can leave your site vulnerable to attacks. Besides, there is a chance that Sucuri can still block Rank Math’s REST API even after you disable the firewall. So, it’s best to whitelist Rank Math instead.

We hope you’re able to whitelist Rank Math in Sucuri. If you have questions, you’re always more than welcome to [contact our dedicated support team](https://rankmath.com/support/). We’re available 24/7, 365 days a year…

			

			 

			
	
		
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