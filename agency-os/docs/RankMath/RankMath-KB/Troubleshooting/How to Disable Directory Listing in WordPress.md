# How to Disable Directory Listing in WordPress

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/disable-directory-listing/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Disable Directory Listing in WordPress

			
			

	

When someone visits a directory on your WordPress site that doesn’t have an index file, they might see a list of files and folders. This is known as **directory listing**. While it might seem harmless, it poses a significant security risk.

In this knowledgebase guide, we’ll explain why disabling directory listing is important and provide step-by-step instructions on how to do so on both Apache and Nginx servers.

## 1  Why Disable Directory Listing in WordPress?

Directory listing allows visitors, including hackers, to view the files and folders in your site’s directories. This can lead to various issues.

For one, it makes sensitive files like configurations, backups, and plugins vulnerable to unauthorized access. If directory listing is not disabled, users could potentially access and even download files directly from your website or server.

Additionally, hackers could exploit the exposed directory structure to identify vulnerabilities, putting your site at risk. Finally, directory listing can also appear unprofessional, exposing incomplete or unnecessary files to visitors.

By disabling directory listing, you’re taking an important step toward [improving security](https://rankmath.com/blog/secure-wordpress-site/), maintaining privacy, and ensuring your site looks polished.

## 2  How to Check If Directory Listing Is Enabled

To check if directory listing is enabled on your site, open your browser and enter a directory URL. For example, you can visit `https://yourwebsite.com/wp-content/uploads/` or `https://yourwebsite.com/wp-includes/` (replace `yourwebsite.com` with your actual domain).

If the directory listing is disabled, you’ll see a **403 Forbidden** error or a blank page.

![403 Forbidden error on NGINX server](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20527'%3E%3C/svg%3E)

On the other hand, if enabled, you’ll notice a list of files and folders displayed on the page.

![website files and folder directory listing](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201390%20893'%3E%3C/svg%3E)

In that case, you need to disable it by following the instructions below.

## 3  Method 1: Using .htaccess (Apache Servers)

If your site is hosted on an Apache server, you can easily disable directory listing by editing the `.htaccess` file. Usually, you will want to connect to your server using an FTP client or your hosting provider’s control panel to locate and edit your `.htaccess` file.

However, you can also access your .htaccess file using Rank Math SEO. To do this, ensure [it is set up](https://rankmath.com/kb/how-to-setup/) and navigate to **Rank Math SEO → General Settings → Edit .htaccess** from your WordPress dashboard.

Next, check to agree to the notice if you haven’t done so already, and paste the following line of code at the bottom of the file:

```
Options -Indexes
```

It will look like something like this:

![disable directory listing in .htaccess](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%201131'%3E%3C/svg%3E)

Once done, click the **Save Changes** button to save your settings. Now, revisit the directory you tested earlier.

Instead of seeing a list of files, you should encounter a **403 Forbidden** error, indicating that the directory listing has been successfully disabled.

![The 403 Forbidden error on Apache server](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201168%20676'%3E%3C/svg%3E)

## 4  Method 2: For Nginx Servers

For those using Nginx servers, the process is slightly different. Nginx doesn’t use .htaccess files, so you’ll need to edit the server configuration file instead.

Start by connecting to your server via SSH or your hosting provider’s file manager. Locate the configuration file for your site, typically found in `/etc/nginx/sites-available/your-site`.

Open the configuration file and find the server block for your domain. Inside the block, add the following directive:

```
autoindex off;
```

Save your changes and restart Nginx to apply them by running the command `sudo systemctl restart nginx`. Once this is done, visit the directory URL to confirm that the directory listing is disabled. You should see a **403 Forbidden** error on the page.

![403 Forbidden error on NGINX server](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20527'%3E%3C/svg%3E)

Disabling directory listing is a simple yet critical step in securing your WordPress site. For Apache users, adding `Options -Indexes` to the .htaccess file is the easiest and most effective method.

On the other hand, Nginx users can achieve the same result by updating their server configuration. By taking this precaution, you’re not only safeguarding sensitive data but also presenting a more professional and secure website to your visitors.

If you have any questions or encounter issues, feel free to [reach out to our support team](https://rankmath.com/support/). They’re available 24/7 to assist you.

			

			 

			
	
		
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

										
			
- [How Rank Math Prevents Duplicate Content Issues in a WooCommerce Store](https://rankmath.com/kb/woocommerce-duplicate-content-issues/)

										
			
- [How to Fix Indexing Issues in Google Search Console](https://rankmath.com/kb/fix-google-indexing-issues/)

										
			
- [How to Resolve Wordfence Warning for update-1.0.42.php?](https://rankmath.com/kb/fix-wordfence-warning/)

										
			
- [Why GSC Shows “No Referring Sitemaps Detected”](https://rankmath.com/kb/no-referring-sitemaps-detected/)

										
			
- [Rank Math Status and Tools](https://rankmath.com/kb/rank-math-status-and-tools/)