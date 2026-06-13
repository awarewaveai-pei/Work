# Solving Redirection Issues Using Rank Math SEO

> **Category:** 404 & Redirections
> **Source:** https://rankmath.com/kb/solving-redirection-issues-using-rank-math-seo/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Solving Redirection Issues Using Rank Math SEO

			
			

	

Since **redirects** are incredibly important and can wreak havoc on your website if not managed correctly, we’ve decided to dedicate an entire section to troubleshoot issues regarding redirection.

## Table Of Contents

- [Perform a Self-Diagnosis](#perform-self-diagnosis)

- [Using Rank Math’s Debug Redirection Feature](#redirection-debug)

- [My Posts Are Redirecting to www or non-www (incorrect version) of My Website](#redirecting-to-www-or-nonwww)

- [410 Errors Appear as 404 errors](#410-errors-as-404)

- [Redirects Are Happening on My Website That I Have Not Configured](#unknown-redirections)

- [I Removed AMP Support from My Website, and I Want to Redirect AMP URLs to Regular URLs](#redirect-amp-urls-to-regular-urls)

- [Redirection (or another) Module Gets Automatically Disabled from the Dashboard](#redirection-module-gets-automatically-disabled)

- [I See Strange Redirects Inside My 404 Monitor, Should I Redirect Them?](#strange-redirects-in-404-monitor)

- [I am Unable to Import Redirects from Yoast SEO Premium, Please Help.](#unable-to-import-yoast-redirects)

- [My Post Does Not Open at All](#post-not-opening)

- [How to Redirect Category Pages on Tags/Other Pages](#redirect-category-to-tag)

- [How to Remove a Particular Word From the URL?](#remove-word-from-url)

- [How to Remove the Date in a URL Without Causing 404 Errors](#remove-date-in-url)

- [I see a Warning/Notice About the Main Domain Being Twice in the URL](#domain-being-twice-in-the-url)

- [Using UTM Parameters with Redirects](#utm-redirects)

- [Redirections Are Not Saving](#redirects-not-saving)

- [Redirects Are Not Working on Cached Pages](#redirects-not-working-on-cached-pages)

- [Final Words](#final-words)

## 1  Perform a Self-Diagnosis

We’ve dealt with a lot of issues on our community forum regarding redirections. If you’re also facing issues with redirections on your website, then the **first step we would recommend is that you do a self-diagnosis of the issue**. Here’s how to do it.

Head over to the **Redirections** option inside Rank Math and check the list of all the redirections that have been created.

Ask yourself these questions:

- Do all the redirections look right?

- Are there any blank redirections?

- Is there a redirection where the source and the destination are the same? **This can cause [infinite loops](https://rankmath.com/blog/fix-redirect-loops/)**.

- Do the redirects appear to be correctly formatted?

- Are there a lot of redirects to files or weird locations that you don’t recognize? **This could be another plugin issue**.

If you notice an obvious issue, try fixing the issue yourself and see if your error is solved. Many times this will help, but if it doesn’t, keep reading to find the most common redirection problems and their solutions.

## 2  Using Rank Math’s Debug Redirection Feature

When you have hundreds of redirects on your site, it can be cumbersome to find out which rule is causing a certain page to redirect. The problem becomes even more complex when your redirects use complex regex. To combat this issue, we’ve built in a debug feature with the Redirections Manager.

The debug option can be found in **Rank Math SEO → General Settings → Redirections.** If you’re unable to find the Redirections settings under Rank Math General Settings, then ensure that you’ve enabled the **Redirections** module in **WordPress Dashboard →** **Rank Math SEO → Dashboard → Modules**. Here is how you can enable Debug Redirections:

![Enable Debug Redirections on Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20900%20565'%3E%3C/svg%3E)

It can be enabled by administrators only. If you’re not an administrator, you’ll have to ask the person who can make these changes.

Once you enable this feature, Rank Math will display an interstitial before the redirects take place, which should look similar to the image below. Note that the **interstitial is on the screen only for a few seconds** before the redirect happens, and you’d have to manually stop the redirect from taking place in that time. It’s also only visible to the website admins, and end-users can keep using the website as normal.

![Redirection debugger interstitial](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20619%20399'%3E%3C/svg%3E)

A useful feature of the interstitial is that it features a direct link to the redirect rule that triggered this redirection. We’ve highlighted it in the image above. If you click the link, you’ll be **taken to the exact rule** which caused this redirection to take place. As you probably can understand already, this feature can help you **pinpoint the redirect rules** that are applicable for a particular post and can help immensely in diagnosing issues.

Wherever it’s applicable, we would recommend that you also test your issue with the debugger enabled. Many times, simply identifying where the redirect is coming from may help you in fixing the issue yourself.

Let’s now get to the specific issues.

## 3  My Posts Are Redirecting to www or non-www (incorrect version) of My Website

This error usually occurs when you’ve made any changes to your website’s domain recently. You can refer to this guide to [fix redirections to the incorrect version of your website](https://rankmath.com/kb/url-incorrect-version-redirection/).

## 4  410 Errors Appear as 404 errors

When you delete content from your website and a user tries to access it, it results in an error. Usually, a 404 error is thrown to tell the user that the page they are trying to access does not exist. However, there is another way of doing the same thing.

If you’d like to convey to the search engines that the content has been deleted, you can **serve a 410 HTTP status on the page**. This lets the search engines know that the content on this page used to exist, but it has been deleted. The difference between a 410 and 404 error is subtle, and in most cases, it can be ignored. But, in certain circumstances, you might want to issue a 410 instead of a 404.

Currently, any deleted pages are handled by Rank Math as 404 errors, and they will show up in the 404 Monitor. If you have already marked them as 410s, you can safely ignore these errors. In a future update, we will make some changes to Rank Math that will help distinguish these errors better.

## 5  Redirects Are Happening on My Website That I have Not Configured

If you’re seeing redirects that you have not configured yourself, there can be a number of causes of the problem. Here is a guide that helps you identify the root cause of the issue and [fix these random URLs redirecting](https://rankmath.com/kb/unwanted-urls-redirecting/).

## 6  I Removed AMP Support From My Website, and I Want to Redirect AMP URLs to Regular URLs

If you’ve used [AMP on your website](https://rankmath.com/kb/using-amp-with-rankmath/) and later decided not to use it, you will have to redirect all AMP URLs back to the regular URLs. Here’s how you can [redirect all your AMP URLs to your regular mobile URLs with Rank Math](https://rankmath.com/kb/redirect-all-amp-pages-to-non-amp-pages/).

## 7  Redirection (or another) Module Gets Automatically Disabled From the Dashboard

It seems you are using an older version of Rank Math. On the older version, once you enabled a module from the Dashboard, you had to save your settings. Otherwise, the changes you made, or the modules you enabled would not be saved.

We have updated the dashboard in the latest version, and any time you enable any module in the dashboard, it will be enabled instantly. We would recommend you update to the latest version for the best experience.

## 8  I See Strange Redirects Inside My 404 Monitor, Should I Redirect Them?

There can be numerous reasons why you could be seeing weird redirects inside your 404 Monitor. Various themes, plugins, and scripts on your site might **request files or paths that do not exist on your website**. If the file does not exist on your server, Rank Math will capture that error as a 404 error.

It’s not useful to try and find which plugins or themes are causing these redirects, as your visitors will not even notice these errors while they access your website.

Just to be safe, you can check for errors inside Google Search Console. The error report is present inside the **Page indexing** report and looks something like this.

![Page indexing report in Google Search Console](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20900%20386'%3E%3C/svg%3E)

If you find that some or all of the errors you saw inside Rank Math are also showing up in Search Console, then it is worthwhile to fix them.

Otherwise, you can safely ignore them and delete them from the Redirection Manager.

## 9  I am Unable to Import Redirects from Yoast SEO Premium, Please Help.

If you’re facing issues with importing your redirects from Yoast SEO Premium, then it’s likely that you are using an older version of Rank Math.

In the earlier days of Rank Math, some users had reported that they were facing the same issue. We worked on the issue and had it fixed in the next release. Since then, no user has reported the problem. We recommend that you **update Rank Math to its latest version** and try importing the redirects again.

If the problem persists, please open a support ticket [on our community forum](https://rankmath.com/support/).

## 10  My Post Does Not Open at All

There can be many reasons why your post does not open, and one of the common reasons is that you’ve accidentally created a redirect to your own post.

When you’re working on a post, and you change your post’s URL, Rank Math creates a redirect to the new post. If you change the URL back to the original URL, then a redirect will be created for the actual post, which will **result in an infinite loop.**

To solve this problem, open the redirects and see if you could find any redirects that have the same source and destination URLs. If you see any, delete them and check if you can access your post.

You can also use the Redirection Debugger to diagnose the issue further.

## 11  How to Redirect Category Pages on Tags/Other Pages

If you want to redirect category archive pages to some other pages like Tags archive, then please create a new **Regex** redirection.

In the source field, add the below code:

```
[category/(.*)]
```

and in the destination URL, add this code:

```
tag/$1
```

## 12  How to Remove a Particular Word From the URL?

If you want to remove a specific word from your URL and redirect them to the new URL version, then you can configure a redirection in Rank Math to handle it. Here is a tutorial that will help you [remove a specific word from your permalinks with regex](https://rankmath.com/kb/remove-specific-word-from-permalinks/).

## 13  How to Remove the Date in a URL Without Causing 404 Errors

You can redirect your permalinks from `https://yoursite.com/2023/02/14/post-name` to `https://yoursite.com/post-name` by creating a regex redirection. Your current URL structure will determine the regex code you add to the **Source URLs**field.

If you want to redirect from a custom permalink that contains a year, month, and day, and ends in `.html`, add the below code to the Source URLs field.

```
\d{4}/\d{2}/\d{2}/(.*).html
```

If you want to redirect from a Day and Name permalink like `https://yoursite.com/2023/02/14/post-name/`, add the below code to the Source URLs field:

```
\d{4}/\d{2}/\d{2}/(.*)
```

If you want to redirect from a Month and Name permalink like `https://yoursite.com/2023/02/post-name/`, add the below code to the Source URLs field:

```
\d{4}/\d{2}\/([a-zA-Z0-9_.-]+)$
```

In all three instances, select the **Regex** option in the Match Type dropdown menu and add the below code to the Destination URL.

```
/$1/
```

![Add the Regex code to the Destination URL](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20900%20410'%3E%3C/svg%3E)

## 14  I See a Warning/Notice About the Main Domain Being Twice in the URL

If you see this notice when you created a redirect, then the redirect has not been set up correctly. Most likely, you have entered the destination URL in a way that it has been duplicated.

Check if the**latest redirect’s destination URL** looks something like this:

```
https://destinationurl.com/https://destinationurl.com/actual-url/
```

If it does, then you can probably see the problem already – the destination root address has been added twice. To fix this, make sure the destination URL is correct, similar to this.

```
https://destinationurl.com/actual-url/
```

## 15  Using UTM Parameters With Redirects

In some cases, you may want to use UTM parameters, and redirects involving UTM parameters may not function as you intended. Here is a guide that helps you understand [how redirections in Rank Math work with UTM parameters](https://rankmath.com/kb/utm-parameters-with-redirects/) and lets you configure your redirections accordingly.

## **16  Redirections Are Not Saving**

You may find yourself in a situation where your redirects are not saving or stop working if they’re already saved. You are experiencing this because some of your database tables are missing.

To recreate your missing tables, navigate to **Rank Math SEO → Status & Tools → Database Tools**from your WordPress dashboard.

![Navigate to Database Tools](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20900%20559'%3E%3C/svg%3E)

**Note:**If the **Database Tools**option is unavailable, you should enable **Advanced Mode** at the top-right area of the screen.

Once done, click **Re-create Missing Database Tables**, as shown below.

![Re-create Missing Database Tables](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20900%20114'%3E%3C/svg%3E)

Rank Math will create your missing tables, and your redirections will work again.

## 17  Redirects Are Not Working on Cached Pages

Your redirects may not work on your end if your pages are cached. To solve this, navigate to the settings of your caching plugin and clear its cache.

![Navigate to the settings of your caching plugin](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20655'%3E%3C/svg%3E)

Once done, save your changes and test the redirection. If the redirection still doesn’t work, proceed to clear your browser and server-level caches.

## Final Words

As we grow and improve Rank Math, we might add new features to the redirection module which might be confusing or make the process of resolution different from what we discussed here. If for any reason you have any **trouble in diagnosing issues regarding redirection** or any other issue regarding Rank Math SEO, feel free to [open a support ticket](https://rankmath.com/support/). Our support staff will help you out.

			

			 

			
	
		
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