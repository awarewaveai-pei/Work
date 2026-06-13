# How to Set Constant FS_Method

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/constant-fs-method/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Set Constant FS_Method

			
			

	

If you’re seeing the following prompt from WordPress requesting your FTP credentials while trying to install, update or rollback Rank Math, then it is because your website is configured to use a filesystem that prevents modifying files directly from your WordPress Dashboard.

![WordPress connection information](https://rankmath.com/wp-content/uploads/2021/08/WordPress-connection-information-during-plugin-installation.jpg)

You can simply add your FTP credentials and then click **Proceed**. WordPress would be able to proceed with the installation. But again, you will see this prompt from time to time while updating the plugin.

On the other side, if you don’t have FTP access, then it would be better to use the direct method. In this knowledgebase article, we’ll walk you through how to set the constant FS_METHOD to remove this prompt while trying to install/update Rank Math.

## What is FS_Method?

Each web host will have its own limitation in its way with respect to the web server’s configuration. So when you try to install/update Rank Math, WordPress at first would detect if it has sufficient write access for the relevant files in your server and then automatically determines the filesystem to be used.

But if, for some reason, the automatic detection by WordPress chooses an FTP method, then you would see a prompt for FTP credentials as above. If the FTP method is not preferable, then you may force WordPress to use the direct filesystem by defining constant FS_METHOD in your wp-config.php file.

The constant FS_METHOD would determine the filesystem method that WordPress should use for reading, writing, modifying or deleting the files.

The FS_Method would accept one of the following values, and you can learn more about them in the [WordPress documentation](https://wordpress.org/support/article/editing-wp-config-php/#wordpress-upgrade-constants):

- direct

- ssh2

- ftpext

- ftpsockets

## How to Set the FS_METHOD

To set the constant FS_METHOD in your wp-config.php file, you can follow the exact steps below.

### 1  Open wp-config.php File

At first, open the wp-config.php file located at the root of your website. You may use FTP or cPanel File Manager to access the file.

### 2  Add/Update FS_METHOD

In the wp-config.php file, check if FS_METHOD is already defined. If the constant has not been defined yet, then you may include the following line of code.

If the constant is already defined, then you may update the FS_METHOD constant to direct, as shown below.

```
define( 'FS_METHOD', 'direct' );
```

### 3  Save/Upload the File

Now save the file (for cPanel File Manager) or upload the file (for FTP) to reflect the changes in your website.

**Note:** In case if your access to the wp-config.php file is restricted, then you may contact your web host to add the FS_METHOD.

And, that’s it! Now try installing/updating Rank Math, and you should be able to. If you’re still facing any trouble, feel free to [open a support ticket directly from here](https://rankmath.com/support/), and our support expert would look into this.

			

			 

			
	
		
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