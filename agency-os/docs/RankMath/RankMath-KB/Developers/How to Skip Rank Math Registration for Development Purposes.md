# How to Skip Rank Math Registration for Development Purposes

> **Category:** Developers
> **Source:** https://rankmath.com/kb/skip-rank-math-registration/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Skip Rank Math Registration for Development Purposes

			
			

	

In this knowledgebase article, we’ll show you how to skip the registration requirement when testing Rank Math in WPLoader.

**Note:** This tutorial is intended for developers who are familiar with building WordPress products.

If you build extensions for Rank Math, you might run into instances where the WPLoader test fails. This happens because the Rank Math plugin is not connected to an account.

As a developer, you can resolve this issue by copying this code and pasting it into the **wp-config.php** file using cPanel/FTP.

```
define('RANK_MATH_REGISTRATION_SKIP', true);
```

## How to Insert the Code in Your wp-config.php File

**Note:**The wp-config.php file contains sensitive information that may stop your website from working. So, we recommend you [create a backup](https://rankmath.com/blog/backup-wordpress-site/) before editing it.

You would insert the code in your wp-config.php file using a File Transfer Protocol (FTP) client or cPanel.

### 1  Open cPanel and Select File Manager

Head over to the cPanel of your site and select **File Manager**.

![Select File Manager in FTP Client](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%200%200'%3E%3C/svg%3E)

### 2  Open the wp-config.php File

In the File Manager, navigate to **public_html → wp-config.php**.****Right-click this PHP file and select **Edit**.

![Open the wp-config.php file](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%200%200'%3E%3C/svg%3E)

### 3  Add the Code and Save Your Changes

Add the code before the line that says, “That’s all, stop editing! Happy publishing”. Then save your changes.

![Add the code to wp-config.php file](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%200%200'%3E%3C/svg%3E)

## Conclusion

The good part is that this works when adding any code to your wp-config.php file. As we mentioned, you should create a backup whenever you want to add or delete code from your wp-config.php file. The file contains information about your database. Adding or deleting the wrong code here could lock you out of your WordPress site.

If you run into issues while trying to add the code to your wp-config.php file, [get in touch with our support staff](https://rankmath.com/support/). We’re always here to help.

			

			 

			
	
		
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

		

										
			
- [How to Use Rank Math MCP Tools](https://rankmath.com/kb/mcp-tools/)

										
			
- [Why We’re Moving Rank Math Modules to React (And What It Means for You)](https://rankmath.com/kb/react-migration/)

										
			
- [How to Customize Breadcrumbs in Rank Math](https://rankmath.com/kb/customize-breadcrumbs-in-rank-math/)

										
			
- [Rank Math SEO Filters and Hooks for Developers](https://rankmath.com/kb/filters-hooks-api-developer/)

										
			
- [How to Make Your Theme Rank Math Compatible](https://rankmath.com/kb/make-theme-rank-math-compatible/)

										
			
- [How to Enable Headless CMS Support in Rank Math?](https://rankmath.com/kb/headless-cms-support/)