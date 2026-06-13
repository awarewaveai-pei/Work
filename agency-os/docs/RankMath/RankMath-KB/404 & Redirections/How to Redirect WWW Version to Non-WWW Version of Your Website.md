# How to Redirect WWW Version to Non-WWW Version of Your Website

> **Category:** 404 & Redirections
> **Source:** https://rankmath.com/kb/how-to-redirect-www-urls-to-non-www/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Redirect WWW Version to Non-WWW Version of Your Website

			
			

	

If you’re trying to deal with URLs on your website redirecting to the incorrect variations, you may have to redirect the WWW version of your website to the non-WWW version of your site (if that’s the primary URL of your site) or [vice versa](https://rankmath.com/kb/how-to-redirect-non-www-urls-to-www/). Luckily, besides all the extraordinary behind-the-scenes improvements in [Rank Math](https://rankmath.com/kb/how-to-setup/), it also makes it extremely easy to fix the dreaded “redirection of non-www to www version” in no more than a few minutes…

In this knowledgebase article, we’ll walk you through how to redirect the www version to the non-www version of your website.

## 1  How to Redirect www Version to Non-www Version in Rank Math

To redirect your pages to non-www URLs, you’ll need to apply the change at the full-site level. The redirect helps you avoid page duplication and a poor user experience. To redirect **www to the non-www version**, you’ll need to enter a piece of code in the .htaccess file.

### 1.1  Edit .htaccess File

Rank Math lets you edit your website’s .htaccess file inside the WordPress dashboard. To edit the file, navigate to the **WordPress Dashboard → Rank Math SEO →** **General Settings → Edit .htaccess** as shown below:

![Edit .htaccess](https://rankmath.com/wp-content/uploads/2023/01/edit-htaccess.jpg)

### 1.2  Add the Redirection Rule

To add a redirection rule to your .htaccess file, click the check box below the warning and add the code snippet after `#END WordPress`.

![Add the redirection rule](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20771%20639'%3E%3C/svg%3E)

Add the following code snippet and click on **Save Changes.**

```
RewriteEngine On
RewriteCond %{HTTP_HOST} www.example.com
RewriteRule (.*) https://example.com/$1 [R=301,L]
```

If the issue persists, then try the following code snippet instead:

```
RewriteEngine On
RewriteCond %{HTTP_HOST} ^www.website.com [NC]
RewriteRule ^(.*)$ https://website.com/$1 [L,R=301]
```

You can use the [htacces](https://htaccess.madewithlove.com)[s](https://technicalseo.com/tools/htaccess/)[tester](https://htaccess.madewithlove.com) tool to debug and ensure the rewrites are correct before adding them to the .htaccess file.

## 2  How to Redirect www Version to Non-www Version in NGINX

If you are using an NGINX server, you can redirect all www URLs to non-www by adding the following configuration to your NGINX server block:

```
server {
    listen 80;
    server_name www.yourdomain.com;
    return 301 $scheme://yourdomain.com$request_uri;
}
```

Replace yourdomain.com with your actual domain name. This configuration ensures that any request to www.yourdomain.com is permanently redirected to yourdomain.com, maintaining any specific page path or parameters in the URL.

**Note:** After updating the configuration, be sure to reload NGINX for the changes to take effect by running:

```
sudo nginx -s reload
```

And that’s it! You have successfully enabled a **.htaccess** rule that will redirect all visitors from a www version to the non-www version of your website! If you still have any questions about how to redirect the www version to the non-www version of your website – you’re always more than welcome to [contact our dedicated support team](https://support.rankmath.com/). They are available 24/7, 365 days a year…

			

			 

			
	
		
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