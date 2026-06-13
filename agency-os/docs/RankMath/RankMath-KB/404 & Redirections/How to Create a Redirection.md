# How to Create a Redirection

> **Category:** 404 & Redirections
> **Source:** https://rankmath.com/kb/how-to-create-a-redirection/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Create a Redirection

			
			

	

WordPress is a powerful and popular web development platform that allows users to create custom websites. It has various features and capabilities to help users customize their sites and redirect visitors to different pages. Redirecting a page in [WordPress](https://mythemeshop.com/blog/what-is-wordpress/) is a simple process, but it can be intimidating if you’re unfamiliar with the platform.

In this knowledgebase article, we’ll show you how to create a redirection in WordPress using Rank Math.

## 1  How to Create a Redirection in Rank Math

    

        
                
- [Enable the Redirection Module](#enable-redirection-module)
                
- [Add a Redirection](#add-redirection)
                
- [Add the Source URL](#add-source-url)
                
- [Add the Destination URL](#add-destination-url)
                
- [Select the Redirection Type or Maintenance Code](#redirection-type-maintenance-code)
                
- [Select the Redirection Category](#redirection-category)
                
- [Select the Activation Status](#activation-status)

        
   
    

### 1.1  Enable the Redirection Module

Navigate to **WordPress Dashboard →** **Rank Math SEO** and enable the **Redirections** module, as shown below.

![Enable Redirectiaon module](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20531'%3E%3C/svg%3E)

If you’re unable to find the Redirections module, please enable the [Advanced Mode](https://rankmath.com/kb/switch-from-easy-to-advanced-mode/) by navigating to 
**Rank Math SEO → Dashboard → Advanced Mode,** as shown below.

![Enable Advanced Mode](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20920'%3E%3C/svg%3E)

### 1.2  Add a Redirection

To add a new Redirection, navigate to **Rank Math SEO → Redirections** from your WordPress dashboard. Click on **Add New** button, as shown below.

![Create a Redirection](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202068%201142'%3E%3C/svg%3E)

### 1.3  Add the Source URL

#### 1.3.1  Enter the Source URLs

The Source URL is where you type the URL (or URLs) from which you want to redirect. Any errors causing URLs you find in the [404 Monitor](https://rankmath.com/kb/monitor-404-errors/) will go here.

![Add source URL](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201580%20428'%3E%3C/svg%3E)

#### 1.3.2  Match Types

Match Types gives you multiple options by which Rank Math will match a URL to see if it needs redirecting.

![Match Types](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201568%20446'%3E%3C/svg%3E)

Here are the options available in the Match Type:

- If you select the **Exact**match type, the first field will contain the URL you want to redirect. For example, suppose we want to redirect visitors from our SEO analyzer at rankmath.com/tools/seo-analyzer. In that case, we’ll enter **rankmath.com/tools/seo-analyzer**in the first field.

- If you choose the **Contains** match type, the first field will contain a word or part of the URLs you want to redirect. For example, if we type **plugin**in the first field, URLs like rankmath.com/compatible/**plugins**and rankmath.com/kb/check-**plugin**-conflicts will redirect.

- If you pick the **Starts With**match type, the first field will contain the word that comes right after the first slash of the URL you want to redirect. For example, suppose we enter **kb**in the first field; our entire knowledgebase will redirect since the articles begin with rankmath.com/**kb**.

- If you select the **End With**match type, the first field will contain the word at the end of the URL you want to redirect. For example, rankmath.com/kb/configure-**sitemaps** will redirect if we enter **sitemaps**in the first field.

- If you select the **Regex**match type, you’d be able to redirect multiple URLs simultaneously as long as they contain a word or group of words. Read more on [how to set up regex redirects](https://rankmath.com/kb/how-to-use-regex-redirects/) here.

#### 1.3.3  The Ignore Case Checkbox

URLs are case-sensitive. If you’re sure the URL you entered in Source URLs doesn’t have an uppercase variant that leads to another webpage, check the **Ignore Case**checkbox.

![Check or uncheck Ignore case option](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201580%20428'%3E%3C/svg%3E)

### 1.4  Add the Destination URL

You should skip this part if setting up a 410 or 451 maintenance code. But if you’re setting up [301, 302, or 307 redirects](https://rankmath.com/kb/301-vs-302-redirect/), enter the **full URL** to which you want to redirect your visitors. For example, if we want to redirect visitors to our blog, we’ll use **rankmath.com/blog** as the destination URL.

![Add Destination URL](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201582%20190'%3E%3C/svg%3E)

### 1.5  Select the Redirection Type or Maintenance Code

There are three Redirection Type and two Maintenance Code, as shown below.

![Select a Redirection Type or Maintenance Code](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201564%20328'%3E%3C/svg%3E)

You can refer to our dedicated article on [types of redirects](https://rankmath.com/kb/redirect-types/) supported by Rank Math.

Here is a brief summary of the Redirection Type and the Maintenance Code:

- Use**301 Permanent Move** if the redirection is permanent.

- Use **302 Temporary Move** or **307 Temporary Redirect** if the redirection is temporary.

- Use **410 Content Deleted**if the removal is permanent.

- Use **451 Content Unavailable for Legal Reasons** if the removal results from a legal decision.

### 1.6  Select the Redirection Category [PRO](https://rankmath.com/pricing/)

**Note:**Redirection Category is a Rank Math feature. You can access it by navigating to **Rank Math SEO →  Redirections → Manage Categories**from your WordPress**Dashboard**.

After creating a few redirections, you should begin sorting them into categories. If you have previously created a category, it’ll be at the top of the Redirection Category settings. Click on its checkbox to assign it to your new redirection. You can also create a new category by typing a name in the **New Category**field and clicking **Add New**.

![Add Redirection category](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201470%20320'%3E%3C/svg%3E)

### 1.7  Select the Activation Status

The Status is set to**Activate**by default. This option can be used to create redirects in advance and enable them later or create redirects that you want to disable later**.**

![Select Activation status](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20976%20204'%3E%3C/svg%3E)

Optionally, in the **PRO version of Rank Math**, you can use the **Scheduled Activation** and **Scheduled Deactivation**options to select the dates you want the redirection to begin or end.

![Set Activation Deactivation Date](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201607%20352'%3E%3C/svg%3E)

Once done, scroll to the bottom of the page and click the **Add Redirection** button to create your redirection.

![click on Add Redirection button](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201626%20199'%3E%3C/svg%3E)

And this is how you can create a redirection in Rank Math. If you still have questions about creating the redirections in Rank Math – you’re always more than welcome to [contact our dedicated support team](https://rankmath.com/support/). We’re available 24/7, 365 days a year…

			

			 

			
	
		
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

		

										
			
- [How to Track and Fix 404 Errors from ChatGPT](https://rankmath.com/kb/fix-404-errors-from-chatgpt/)

										
			
- [How to Trace Your Website’s URL Redirects](https://rankmath.com/kb/trace-url-redirects/)

										
			
- [How to Set 410 Status Code in Bulk for WordPress](https://rankmath.com/kb/set-410-status-in-bulk/)

										
			
- [301 vs 302 Redirect: Which One Should You Use?](https://rankmath.com/kb/301-vs-302-redirect/)

										
			
- [How to fix ‘The Redirection you are trying to create may cause infinite loops’?](https://rankmath.com/kb/fix-infinite-loop-error/)

										
			
- [How to Set Up Redirections](https://rankmath.com/kb/setting-up-redirections/)