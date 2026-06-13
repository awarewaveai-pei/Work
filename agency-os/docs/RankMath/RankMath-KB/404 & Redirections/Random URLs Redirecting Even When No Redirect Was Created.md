# Random URLs Redirecting Even When No Redirect Was Created

> **Category:** 404 & Redirections
> **Source:** https://rankmath.com/kb/unwanted-urls-redirecting/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Random URLs Redirecting Even When No Redirect Was Created

			
			

	

If you see redirects that you’ve not configured yourself, there can be many causes of the problem.

Rank Math is not the only plugin that can control the redirection of your website. Other plugins installed on your website can also add redirection rules to the .htaccess file. Hence to fix the problem, we need to identify — what causes these redirections.

## Solving the Redirection Issue

In this knowledgebase article, we’ll identify the issue causing unexpected redirections and fix them. To get started, follow our step-by-step process to troubleshoot this issue.

## Table of Contents

- [Check for Other Redirection Plugins Installed](#other-redirection-plugins)

- [Check .htaccess (or) nginx.config File](#htaccess-or-nginx)

- [Check for Redirections Created with Rank Math](#redirections-with-rank-math)

- [Theme or Plugin Conflict](#theme-plugin-conflict)

### 1  Check for Other Redirection Plugins Installed

First, **check if you have any other redirect plugins installed** that have configured any redirects. If you find any, delete them immediately. Then, check your posts (preferably from a new browser) to see if the problem is resolved.

### 2  Check .htaccess (or) nginx.config File

Next, check your .htaccess (or nginx.conf) file if any redirects have been created there. You can check the .htaccess file in your WordPress dashboard with the Rank Math plugin. To check the redirection rules set up in your .htaccess file, navigate to **WordPress Dashboard → Rank Math SEO → General Settings → Edit .htaccess**.

![edit .htaccess](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202346%201288'%3E%3C/svg%3E)

If you see any additional redirection rules being set up, delete them and check if the problem is resolved.

**Fair warning:** Before making any changes to the .htaccess file, understand that any accidental mistakes with the .htaccess can break your website. Considering this, Rank Math creates a backup of your last saved version of the .htaccess file before the edit. Then, if anything goes wrong with the changes you’ve made to the file, you can restore this backup with FTP.

To delete any rules from the .htaccess file, select the checkbox below the warning and remove the redirection rule causing the issue from the .htaccess file.

![Remove redirection rules causing errors](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20765%20649'%3E%3C/svg%3E)

And then click the **Save Changes** button.

![Save Changes](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201540%20207'%3E%3C/svg%3E)

Now check if the redirection issues are fixed; if it doesn’t resolve, proceed with the next step.

### 3  Check for Redirections Created with Rank Math

If you’ve manually created redirects using Rank Math’s redirection option, it is a good idea to check if you’ve accidentally created “broad redirects”. Rank Math offers plenty of **advanced options to create redirects**, and misconfiguring any redirect might cause issues throughout your website.

Open the recently created redirection inside Rank Math and look through its settings. Here is an example.

![More than one redirection](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20841%201226'%3E%3C/svg%3E)

There are a few things to note here that might help in resolving the issue.

- Each redirect can have multiple options configured in it. So, it might look like only 1 redirect is taking place, but you might have configured multiple URLs inside Rank Math, which might cause the problem.

- Rank Math offers various **matching options to give you immense flexibility** in creating redirects. You can see an example image below, which shows all the options.

![Redirection - Source URL options](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20794%20369'%3E%3C/svg%3E)

As you can see, many Source URLs could have been added that will cause more than 1 URL to be redirected to a destination URL.

To find the root cause of the problem, check all the redirections you’ve created since the error started and verify if any redirects have problems. Once you fix those issues, **check to see if the troublesome redirects have disappeared**.

### 4  Theme or Plugin Conflict

Sometimes, a conflict between plugins or themes can cause serious issues to the entire website. This might lead to unwanted 301 redirects or even put you on a [redirect loop](https://rankmath.com/blog/fix-redirect-loops/).

In such cases, you might need to perform a [quick conflict check](https://rankmath.com/kb/check-plugin-conflicts/) on your website. Before running the test, ensure that you have taken a complete [backup of the entire site](https://rankmath.com/blog/backup-wordpress-site/) so that if anything happens during the conflict check, you can still restore it at any time later.

Once you’ve enabled the Troubleshooting mode, disable Rank Math and check whether any random redirections are still happening. If you are unable to find any, then try disabling other plugins one by one and check for unexpected redirections. In most cases, redirection can happen due to other plugins, or even caused by the theme which you use at present.

And, that’s it! We hope the tutorial helped you to fix the redirection issue. But, if you’re still facing issues, please open a ticket on [our support forum](https://rankmath.com/support/), and our support team will help you in the best way they can.

			

			 

			
	
		
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