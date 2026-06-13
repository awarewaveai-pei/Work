# Why Are Posts Redirecting to www or non-www (Incorrect Version) of My Website?

> **Category:** 404 & Redirections
> **Source:** https://rankmath.com/kb/url-incorrect-version-redirection/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Why Are Posts Redirecting to www or non-www (Incorrect Version) of My Website?

			
			

	

If your website is redirecting to the www version, when it is supposed to send you to the non-www version or the way around, then it could be caused by incorrect configurations on your website. These errors most likely occur when you’ve recently made any changes to your website’s domain.

In this knowledgebase article, we will walkthrough how to fix this redirection to incorrect version issue.

## Solving the Redirection Issue

Before we proceed with fixing the issue, it’s important to be clear with your website’s URL version. Here are some of the different possible URL versions of your website:

- http://example.com

- https://example.com (SSL Required)

- http://www.example.com

- https://www.example.com (SSL Required)

If you’ve decided your website’s URL version, then we shall proceed with fixing this redirection issue.

### 1  Changing WordPress Address & Site Address

The first step is to confirm if WordPress is actually storing your website files to the correct version of your website. To do that, navigate to **Settings →** **General → WordPress Address** inside the WordPress admin area and check if the address points to the correct version of your website.

![Website Address and Site Address - WordPress General Settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201237%20759'%3E%3C/svg%3E)

Just beneath the WordPress Address setting, you will notice another setting for **Site Address**. The Site Address points out the URL where users can reach your website. In general, changes are made to this field only if you want your website’s homepage to be different from the WordPress installation directory (WordPress Address).

Ensure that both these options are configured to your website’s correct version (www or non-www). If the above options have not been configured correctly, your website will keep throwing errors, even if Rank Math is not working.

### 2  Adding Code to the .htaccess File of Your Website

If the errors persist, even after configuring the correct address in WordPress settings, then we’ll try adding redirection rules to your website’s .htaccess file.

Rank Math lets you edit your website’s .htaccess file right inside the WordPress dashboard. To edit the file, head over to the **WordPress Dashboard → Rank Math SEO → General Settings → Edit .htacess**.

![Navigate to edit .htaccess](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202346%201304'%3E%3C/svg%3E)

You can make any changes to your website’s .htaccess from this page. Since making any mistake in the .htaccess file can break your website, Rank Math creates a backup of your .htaccess file. So if your changes break your site, then you can restore the file with FTP.

But still, Rank Math only creates a backup for the last saved version. If you make multiple changes that cause problems, then the backup cannot help you either. So, you’ll have to proceed with caution.

The following redirection rule will let you redirect the www version of your website to the non-www version of your website. To add a redirection rule to your .htaccess file, click the check box below the warning and add the following code snippet after `#END WordPress`.

![Add .htaccess redirection for URL version (www or non-www)](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20771%20639'%3E%3C/svg%3E)

**Note:** The code added between `#BEGIN WordPress` and `#END WordPress` are dynamically controlled by WordPress filters. So, if you add your redirection rule between these markers, then they will be overwritten, and your changes will not be in effect over the due course of time.

```
RewriteEngine On
RewriteCond %{HTTP_HOST} www.example.com
RewriteRule (.*) https://example.com/$1 [R=301,L]
```

You can use the [htaccess tester](https://technicalseo.com/tools/htaccess/) tool to debug and ensure that the rewrites are correct before adding them to the .htaccess file. Once you’ve added the redirection rule, click the **Save Changes** button and then check if the issue has been resolved.

![Save Changes](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201540%20207'%3E%3C/svg%3E)

If the above code snippet did not work, try the following code snippet instead (to redirect www version to non-www version).

```
RewriteEngine On
RewriteCond %{HTTP_HOST} ^www.website.com [NC]
RewriteRule ^(.*)$ https://website.com/$1 [L,R=301]
```

After you’ve added the code, check the URLs that were causing the issue. They should be fine now and redirecting to the correct URL.

And, that’s it! We hope the redirection issue has been resolved now. But if the problem persists, feel free to open a support ticket on [our support forum](https://support.rankmath.com/), and our support team will help you in the best way they can.

			

			 

			
	
		
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