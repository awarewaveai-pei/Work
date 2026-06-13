# How to Whitelist Rank Math in Wordfence

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/whitelist-rank-math-in-wordfence/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Whitelist Rank Math in Wordfence

			
			

	

Rank Math uses REST API for saving metadata on your website. In case, if you’ve security plugins like Wordfence installed on your website and in an unlikely situation, if Rank Math’s REST routes are being blocked, then you should whitelist Rank Math in Wordfence.

In this knowledgebase tutorial, we’ll walk you through how to whitelist Rank Math in Wordfence.

## Enabling Learning Mode in Wordfence

Wordfence Web Application Firewall would look for typical attack patterns on your website’s requests and then blocks them to secure your website. But at times, this could be a false positive, and Wordfence may block a functionality you’re using on your website.

To help Wordfence distinguish suspicious attacks and the functionality of your website, it comes with a feature called **Learning Mode**.

When you set Wordfence in Learning Mode, Wordfence will start to learn the requests you make on your website during day-to-day tasks, and any suspicious requests during this learning period will be automatically added to the Allowlist.

This could reduce the chances of Wordfence blocking your website’s regular functionalities. To set Wordfence in learning mode,

### 1  Open Wordfence Firewall Options

At first, head over to **Wordfence →** **Firewall** inside your WordPress admin area and then choose **All Firewall Options**.

![Open Wordfence - All Firewall Options](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201272%20831'%3E%3C/svg%3E)

### 2  Change Web Application Firewall Status

In the Firewall Options, scroll down to the **Basic Firewall Options** section. Under the **Web Application Firewall Status**, choose **Learning Mode**, as shown below.

![Choose learning mode in Wordfence](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201080%20435'%3E%3C/svg%3E)

You can also set up a date in the **Automatically enable on** field. Wordfence will be under Learning Mode until this date, and after that, Wordfence will enable protection.

![Automatically enable on Wordfence protection](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201092%20388'%3E%3C/svg%3E)

## Whitelisting Rank Math in Wordfence

You’ll have to whitelist the URL using the **Live Traffic tool of WordFence** to apply it to all the user-roles. To do so, navigate to **WordFence → Tools → Live Traffic**, as shown below.

![Live Traffic in WordFence](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201960%20766'%3E%3C/svg%3E)

Next, find the rule that got blocked by the firewall and click on **ADD PARAM TO FIREWALL ALLOWLIST,**as shown below.

![Add param to firewall allowlist](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201708%20932'%3E%3C/svg%3E)

Navigate to **WordFence →** **Firewall → Web Application Firewall** **→ Allowlisted URLs**, and you can notice the URL in the Allowlist, as shown below.

![Allowlisted URLs](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202014%20982'%3E%3C/svg%3E)

And, that’s it! Now check if you’re able to save the metadata with Rank Math. If you’ve followed the above steps and still your Rank Math REST routes are being blocked by Wordfence, then feel free to [open a support ticket directly from here](https://rankmath.com/support/), and we’re always here to help.

			

			 

			
	
		
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