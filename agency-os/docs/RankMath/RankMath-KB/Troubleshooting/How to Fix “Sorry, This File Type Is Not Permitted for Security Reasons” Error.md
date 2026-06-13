# How to Fix “Sorry, This File Type Is Not Permitted for Security Reasons” Error

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/sorry-this-file-type-is-not-permitted-for-security-reasons/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Fix “Sorry, This File Type Is Not Permitted for Security Reasons” Error

			
			

	

Have you ever encountered the “Sorry, this file type is not permitted for security reasons” error? Even though this is a common error message, it can sometimes be annoying. But you need not worry; while this message may appear inauspicious, it only signifies that WordPress does not support the file type you attempted to upload.

In this knowledgebase article, we’ll look at what causes this error message and easy solutions to fix it.

    
## Table Of Contents

    

        
- [What Triggers ‘Sorry, This File Type Is Not Permitted for Security Reasons’?](#error)
        
- [File Types Allowed In WordPress](#file-types)
        
- [How To Fix ‘Sorry, This File Type Is Not Permitted for Security Reasons’Error](#fix-error)
            

                
- [Check and Correct the File Type Extension Spelling](#check-spelling)
             
- [Edit the wp-config.php File to Upload Any File Type](#edit-wp-config-file)
          
- [Edit the functions.php File to Upload Any File Type](#edit-functions-file)
                
- [Allow New File Types By Using a Plugin](#use-a-plugin)
                
- [Change the Multisite Network Settings](#change-multisite-network-settings)
               
- [Secure the WordPress File Uploads](#secure-wordpress-file-uploads)
                
- [Contact Your Hosting Provider](#contact-hosting-provider)
        
- [Conclusion](#conclusion)
    

## 1  What Triggers ‘Sorry, This File Type Is Not Permitted for Security Reasons’?

For security concerns, WordPress restricts the file types you can upload through your site’s admin – photos, videos, documents, and audio. If you’re trying to upload a file not supported by WordPress, you are bound to get this error.

![Sorry, this file type is not permitted for security reasons error](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202552%20850'%3E%3C/svg%3E)

If you only upload file types that WordPress supports, you probably won’t come across the error message. Next, let’s have a look at what those file types are.

## 2  File Types Allowed in WordPress

WordPress enforces limitations on the file types you can upload for security reasons. By default, the file types you can upload are as follows:

- **Images:** .png, .gif, .jpg, .jpeg, .ico, .bmp, .tiff, .webp, .heic, .avif.

- **Documents:** .pdf, .doc, .docx, .xls, .xlsx, .ppt, .pptx, .pps, .ppsx, .odt, .PSD

- **Audio:** .wav, .mp3, .m4a, .m4b, .aac, .ra, .ram, .ogg, .oga, .flac, .mid, .midi, .wma, .wax, .mka

- **Video:** .mp4, .m4v, .mpg, .mov, .wm, .wmx, .wmv, .avi, .mkv, .webm, .mpeg, .mpe, .flv, .divx,  .ogv, .3gp, .3gpp, .3g2, .3gp2

These are all the most common file types. Any file that is not one of the permitted file types cannot be uploaded to the media library. You’ll get the “Sorry, this file type is not permitted for security reasons” error in WordPress when you try to upload them.

Now let’s take a look at how to fix this error message.

## 3  How to Fix ‘Sorry, This File Type Is Not Permitted for Security Reasons’

### 3.1  Check and Correct the File Type Extension Spelling

Check the extension of the file you’re trying to upload before making any changes to your WordPress settings or files. It’s possible that when you saved the file, you altered the extension unintentionally.

When you get this error, the first thing you should do is double-check that the file extension is correct. While editing or saving a file on your computer, you may accidentally erase or mistype a file name extension. So you need to check and correct the file type extension spelling and then upload the file.

### 3.2  **Edit the wp-config.php File to Upload Any File Type**

To upload all types of file extensions on your site, you can edit your wp-config.php file and add a one-liner code.

We recommend you always make a **[backup](https://rankmath.com/blog/backup-wordpress-site/) of your** **wp-config.php** file before modifying it. Even a minor file issue can turn your site inaccessible. Once you’ve made a copy of your wp-config.php file, follow the instructions below to allow any file type upload.

You can access your wp-config.php file via [FTP](https://mythemeshop.com/blog/upload-files-on-wordpress-using-ftp/) and look for the file in your site’s root directory. Click on **View/Edit**to open the file as shown below.

![Locate wp-config.php file](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202376%201089'%3E%3C/svg%3E)

Scroll down to the bottom of the file, and you’ll notice the line **/* That’s all, stop editing! Happy blogging. */**. Before this line, paste the following one-liner code:

```
define('ALLOW_UNFILTERED_UPLOADS', true);
```

Once you’ve added the code, save the changes, re-upload the file, and now you’ll be able to upload the new file types on your site.

![Add code to the wp-config.php file](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201342%20833'%3E%3C/svg%3E)

This is a simple approach; however, it isn’t ideal for every website. You may want to specify which file types are allowed if multiple users upload files to your WordPress site. In such a case, you can edit the functions.php file and upload only certain file types.

### 3.3  **Edit the functions.php File to Upload Any File Type**

If you are code-savvy, you can add the **[upload_mimes](https://developer.wordpress.org/reference/hooks/upload_mimes/)** filter to the theme’s functions.php file. This method will allow certain file types so that you have control over what’s uploaded to your site and prevent file upload vulnerabilities.

Once you’ve **backed up your site**, access your functions.php file via FTP. You can locate the file in your theme’s folder in the **wp-content**directory: Right-click and select **View/Edit** as shown below.

![Edit functions.php file](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202380%201074'%3E%3C/svg%3E)

Add the following code snippet in the [**functions.php** file](https://rankmath.com/kb/wordpress-hooks-actions-filters/#functions-php-file) from the theme files. The below code allows SVG and SVGZ files. You can modify the code depending on the type of file you want to upload.

```
/**
 * Function to change the allowed mime types
 *
 * @param  mixed $mimes Allowed mime types.
 * @return mixed $mimes Updated mime types list.
 */
function my_custom_mime_types( $mimes ) {
	// New allowed mime types.
	$mimes['svg']  = 'image/svg+xml';
	$mimes['svgz'] = 'image/svg+xml';
	return $mimes;
}

add_filter( 'upload_mimes', 'my_custom_mime_types' );
```

Once you’ve added the above code, don’t forget to save your changes. Beginners may have difficulty adding code to their functions.php or wp-config.php files. You can then [utilize a WordPress plugin](https://rankmath.com/kb/wordpress-hooks-actions-filters/#code-snippets-plugin) to allow new file types in WordPress.

### 3.4  Allow New File Types By Using a Plugin

Various plugins are available that allow uploading the file types to your site, such as the [File Uploads Type](https://wordpress.org/plugins/file-upload-types/) plugin. At first, install and activate the File Uploads Type plugin from your WordPress dashboard.

![Install and activate File Upload Types plugin](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20854'%3E%3C/svg%3E)

There are two ways to permit uploads for a specific MIME type. The first is to select the box corresponding to the desired MIME type. However, if your desired type is not listed, you can add your custom file type at the bottom of the page. Click on the **Save Settings** button to save your changes.

![File upload types](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201918%202087'%3E%3C/svg%3E)

You’ll now be able to add your file type without receiving an error message.

### 3.5  **Change the Multisite Network Settings**

You can easily add more file types if you’re running a [multisite installation](https://rankmath.com/blog/setup-wordpress-multisite-network/). To do so, navigate to **Settings** →**Network Settings** from your WordPress dashboard. Scroll down to **Upload Settings**,****and you can add the extension for the file type in the input field next to **Upload file types**, as shown below.

![Add file types in multisite environment](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20441'%3E%3C/svg%3E)

Click on **Save Changes** once you’ve added your file types.

### 3.6  Secure the WordPress File Uploads

Allowing users to upload files in various formats may be easy, but it also leads to security concerns. You can make your site more secure while still allowing specific upload types. To do so, you should:

- Limit the types of files uploaded to only those truly necessary.

- Limit the file size that can be uploaded.

- Use a WordPress security plugin to keep an eye on your site for flaws.

- Scan your WordPress site for possibly malicious code regularly.

- Non-registered users should be limited to only uploading the file types that they require. A file upload form is an ideal way to do this.

### 3.7  Contact Your Hosting Provider

If you’ve tried all of the methods above but still receive an error message, contact your WordPress hosting provider’s support team and explain your situation.

Your provider likely imposes stronger file-type restrictions than WordPress does by default. If the instructions above fail to resolve the ‘sorry, this file type is not permitted for security reasons’ error, contact your provider’s customer support.

## 4  Conclusion

When making changes to your site, WordPress problems can cause problems. When it comes to the ‘Sorry, this file type is not permitted for security reasons’ error; there are solutions for allowing you to upload files that WordPress does not permit by default.

We hope this article has helped you to solve the error. Which method did you choose? Let us know by [**Tweeting @rankmathseo.**](https://twitter.com/rankmathseo) 💬

			

			 

			
	
		
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