# How to Fix the 413 Request Entity Too Large Error in WordPress

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/413-request-entity-too-large/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Fix the 413 Request Entity Too Large Error in WordPress

			
			

	

In this knowledgebase article, we’ll walk you through how to fix the **413 request entity too large error**.

## What does **_413 Request Entity Too Large_** mean?

The **413 request entity too large error** generally occurs when you try and upload either a theme or a plugin file that exceeds the maximum upload limit on your website.

If this happens then your web server will fail to upload the file and you notice the 413 request entity too large error. In most cases the WordPress hosting providers have their servers configured so that it is easy for you to upload [large images](https://mythemeshop.com/blog/how-to-resize-images-losing-quality/) and other media.

However, at times, this setting is not enough in order to upload the large files to the server.

## Fixing 413 Request Entity Too Large Errors

You can implement the necessary changes mentioned below depending on which web server you use. You can set the threshold file size for which a user is allowed to upload a file and if that particular limit is over then they will receive a 413 Request Entity Too Large error.

### 1  For Nginx Users

For Nginx users, you need to edit the nginx.conf file located at `/etc/nginx/nginx.conf`. The directive that determines the maximum accepted request size is  `client_max_body_size`.

The default value for this directive is `1M` (1 megabyte) and if you do not wish to have a request size limit you can set the value to `0`.

```
server {
    client_max_body_size 100M;
    ...
}
```

Once you have your desired value set, as shown above, save your changes and then reload Nginx with the help of the following command:

`service nginx reload`.

### 2  For Apache Users

For Apache Web Servers, a directive called [LimitRequestBody](http://httpd.apache.org/docs/2.0/mod/core.html#limitrequestbody) provides the same functionality as `client_max_body_size`. This directive can be defined in either your `http.conf` file or `.htaccess`[`file`](https://mythemeshop.com/blog/edit-htaccess-file/). The directive’s default value is 0 but you can set this value as per your choice.

For instance, if you want to restrict requests larger than 100 MB it would be as follows:

```
LimitRequestBody 104857600
```

Once you have made the necessary changes, save the configuration file and reload Apache with the help of the following command:

`service apache2 reload`.

### 3  Increase Upload File Size Limit by Editing Your Functions.PHP File

Add the following code to your theme’s functions.php file:

| 123 | @ini_set( 'upload_max_size' , '74M' );@ini_set( 'post_max_size', '74M');@ini_set( 'max_execution_time', '400' ); |
|---|---|

You can increase the values in `upload_max_size` and `post_max_size` to be more than the file you are trying to upload. Also, you need to increase the time for `max_execution_time` to the time that you think it might need for the file to be uploaded.

And that’s it! We hope this article helped you learn how to fix the WordPress 413 request entity too large error.

			

			 

			
	
		
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