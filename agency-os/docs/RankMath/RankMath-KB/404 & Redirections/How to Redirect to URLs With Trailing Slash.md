# How to Redirect to URLs With Trailing Slash

> **Category:** 404 & Redirections
> **Source:** https://rankmath.com/kb/how-to-redirect-to-urls-with-trailing-slash/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Redirect to URLs With Trailing Slash

			
			

	

A [trailing slash](https://rankmath.com/seo-glossary/trailing-slash/) is the forward-slash (/) character placed at the end of the URL. The primary purpose of adding it is to help distinguish between [a directory with the trailing slash and a file that doesn’t](https://developers.google.com/search/blog/2010/04/to-slash-or-not-to-slash).

Here’s an example:

_https://yourdomain.com/page/_(with a trailing slash, a directory)

_https://yourdomain.com/page_(without a trailing slash, a file)

These are, however, guidelines and not requirements.

A consistent URL structure is essential for your web pages as it helps avoid search engines treating the same URL differently, causing duplicate content. In this knowledgebase article, we’ll show you how to redirect to URLs with a trailing slash.

    
## Table Of Contents

    

        
- [Why Redirect to URLs With Trailing Slash?](#why-redirect-to-urls-with-trailing-slash)
        
- [Redirect to URLs With Trailing Slash](#redirect-to-urls-with-trailing-slash)
            

                
- [Using Rank Math .htaccess Editor](#using-ht-access)
                
- [Using the cPanel](#using-cPanel)
        
- [Conclusion](#conclusion)
    

## 1  Why Redirect to URLs With Trailing Slash?

If you take a look at the below two URLs, they look similar.

_yourdomain.com/page_ and _yourdomain.com./page/_

However, to a search engine bot, they are not. [Google especially treats both URLs differently](https://developers.google.com/search/blog/2010/04/to-slash-or-not-to-slash).

Although you can have the same page content on both URLs, Google treats them separately, causing duplicate content issues. That’s because it’s hard for Google to determine the source URL of the page, thereby treating both URLs as different pages but having the same content.

But how do you prevent such issues from happening?

The best solution is to redirect the URL without a trailing slash to the one with a trailing slash. We’ll now show you how to redirect to URLs with a trailing slash.

## 2  Redirect to URLs With Trailing Slash

By default, WordPress ensures that most URL pages have a trailing slash.

If you look at your permalink settings, you’ll notice that most URL structures you may want to use have trailing slashes.

![Permalink settings -URLs with trailing slash](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202543%201334'%3E%3C/svg%3E)

Let’s say you’ve decided to use the **Custom Structure** as your permalink structure with a `%postname%` tag ending with a trailing slash. That means all the webpage URLs with or without a trailing slash will be redirected to those that do.

![Custom permalink structure](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201994%20370'%3E%3C/svg%3E)

What if you remove the trailing slash at the end of the tag?

![Custom permalink strucutre without trailing slash](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202026%20326'%3E%3C/svg%3E)

In this situation, all page URLs, whether they have a trailing slash or not, will be redirected to links without one.

The reason for this is to ensure consistency in your URLs. You don’t want to use a trailing slash on one page and then not use it on a couple of other pages. It’ll make crawling by search engine bots chaotic, causing duplicate content issues.

If the default WordPress redirect solution is not working as expected, or you have custom requirements, then you can use the .htaccess to redirect them. To do so, add the following code to your .htaccess file.

```
# Force trailing slash
<IfModule mod_rewrite.c>
	RewriteCond %{REQUEST_URI} /+[^\.]+$ 
        RewriteCond %{REQUEST_URI} !^/wp-json
	RewriteRule ^(.+[^/])$ %{REQUEST_URI}/ [R=301,L]
</IfModule>
```

**Note**: This method will only work for websites hosted on Apache servers.

You can use the [htaccess tester](https://technicalseo.com/tools/htaccess/) tool to debug and ensure the rewrites are correct before adding them to the .htaccess file.

Before you [modify your .htaccess file](https://rankmath.com/kb/edit-htaccess/), we recommend downloading a copy to your computer as a backup. The .htaccess file is a sensitive document; any error can cause your website to crash or cause a [loop of unintended redirections](https://rankmath.com/blog/fix-redirect-loops/). Backing up your website makes it easier to restore the original version if something goes wrong. Refer to our dedicated tutorial on [backing up the WordPress site](https://rankmath.com/blog/backup-wordpress-site/).

We’ll now show you how to redirect URLs to those with trailing slash using two methods—using Rank Math and cPanel via the File Manager.

### 2.1  Using Rank Math .htaccess Editor

The Rank Math plugin is the best way to redirect URLs without trailing slashes to those with trailing slashes using the .htaccess file.

To make changes to your .htaccess file, navigate to **Rank Math SEO → General Settings → Edit .htaccess** from your WordPress dashboard, as shown below.

![Edit .htaccess file in Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202446%201150'%3E%3C/svg%3E)

Within this section is a single text area where you can edit the .htaccess file. Before editing the file, please be careful and read the warning above the text area.

The notice warns you that changing the .htaccess file may cause problems with your website. Even if you are tech-savvy, you can make mistakes. To avoid problems, Rank Math automatically backs up your .htaccess file before you modify it.

Mark the checkbox, and the text area below will become active, where you can modify your .htaccess file.

![Edit the .htaccess file](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202086%201184'%3E%3C/svg%3E)

Paste the code, and click the **Save Changes** button, as shown below.

![Add code to .htaccess file](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202058%201318'%3E%3C/svg%3E)

### 2.2  Using the cPanel

Login to your cPanel dashboard and navigate to the**File Manager** section.

![Navigate to File Manager ](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202002%20552'%3E%3C/svg%3E)

Next, locate the**public_html** folder. Click on the folder, and then locate the .htaccess file, as shown below. Right-click on the .htaccess file, and select the **Edit** option.

![Edit .htaccess file using the cPanel](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202054%201396'%3E%3C/svg%3E)

Add the above-mentioned code in the .htaccess file and save your changes.

![Add code in the .htaccess file using the cPanel](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20468'%3E%3C/svg%3E)

## 3  Conclusion

Trailing slashes in your website URLs play an important role in reducing duplicate content issues. By redirecting to URLs with trailing slashes, you can maintain a consistent [URL structure](https://rankmath.com/seo-glossary/url-structure/) for your web pages.

If you’re having trouble redirecting to URLs with trailing slashes using Rank Math, you’re always more than welcome to [contact our dedicated support team](https://rankmath.com/support/). We’re available 24/7, 365 days a year…

			

			 

			
	
		
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