# Why Rank Math Settings Are Not Getting Saved?

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/settings-not-saved/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Why Rank Math Settings Are Not Getting Saved?

			
			

	

Do you face issues while saving Rank Math settings, then you should definitely read this article. In this guide, we will explain why Rank Math settings are not getting saved and how to solve this issue.

## 1  Rank Math Not Updated to the Latest Version

Make sure that you have the latest version of Rank Math. You can do that by navigating to your **WordPress Dashboard → Rank Math SEO → Status & Tools → Version Control**.

![Check Rank Math version from Version Control](https://rankmath.com/wp-content/uploads/2023/01/version-control.jpg)

You’ll also get a notification from Rank Math if your plugin is not updated, as in the below screenshot.

![Update Rank Math not the latest version](https://rankmath.com/wp-content/uploads/2022/03/update-now-rm-scaled.jpg)

In that case, you can click the “Update Plugin” after ticking the box. The update will happen in the background.

If that doesn’t work, you can also update Rank Math manually.

Log on to your **Rank Math [account area](https://rankmath.com/my-account/)** to download Rank Math PRO**.** And then click “Download”.

![Download the latest version of Rank Math PRO](https://rankmath.com/wp-content/uploads/2022/03/download-pro.jpg)

Once you have downloaded the files from your Rank Math account, then go to **WordPress Dashboard → Plugins → Add New**.

![Add new plugin](https://rankmath.com/wp-content/uploads/2021/08/Add-new-plugin.jpg)

Then, upload the file downloaded from your Rank Math account, and click the **“Install Now”** button.

![install and upload rank math pro](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20900%20563'%3E%3C/svg%3E)

Once you click on **Install Now**, you will see the screen as shown below:

![Replace existing Rank Math PRO plugin](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20850%20549'%3E%3C/svg%3E)

You can continue by clicking “Replace current with uploaded,” and the latest version will be updated successfully.

![Replace current with uploaded](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201036%20286'%3E%3C/svg%3E)

The above option is only available in WordPress 5.5 and above. And, if you are using an older version of WordPress, you will have to delete Rank Math PRO and upload an updated version. Deleting the plugin will not remove any data as they are stored in the Database and installing an updated version will bring it back.

## 2  Check if Rank Math Rest Route is Blocked

It is possible that any security plugins or firewall used by your website or hosting could restrict the REST route used by Rank Math.

To check this, simply head over to the following REST route in your browser (replace example.com with your domain name).

```
https://example.com/wp-json/rankmath/v1/updateMeta
```

If you’re seeing a response like the one below, then you can conclude that your REST route is not blocked.

![REST no route](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20907%20422'%3E%3C/svg%3E)

But on the downside, if you’re seeing a notice that your access has been denied by a firewall, then it is understandable to your site’s firewall is causing the issue. Here are some solutions to [unblock Rank Math from your Firewall](https://rankmath.com/kb/meta-data-not-saving/#firewall).

## 3  Possible Conflict With the Plugin or the Theme

Plugin conflicts may arise when one or more plugins on your site don’t adhere to the latest coding standards or perform the same functions as each other, like Rank Math and Yoast or Rank Math and [Schema Pro](https://rankmath.com/kb/import-schema-pro-data/).

Some of the [plugins and themes might conflict](https://rankmath.com/kb/plugin-conflicts/) with Rank Math. It can also be due to other SEO plugins that do similar tasks as Rank Math. You could imagine how confusing it would be if you had two or three plugins asking you for the same info every time you published a post!

Rank Math will check for any known conflicts. If it finds any, it will display them like this:

![Plugin Conflict With Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20747%2038'%3E%3C/svg%3E)

If you decide to keep them, even after the warning, you will not be able to save Rank Math settings as well as end up losing your ranking position.

You can also watch the following video on how to check plugin conflict.

![Confirming a Theme/Plugin Conflict With Rank Math - Rank Math SEO](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201280%20720'%3E%3C/svg%3E)
__

## 4  Due To ModSecurity

Sometimes, `403` errors are caused by incorrect file or folder permissions on your website’s root directory. In such cases, you should ask your web host to check any file permission issues reported. Also, your website has the **ModSecurity** feature which can be the root cause of this problem.

ModSecurity otherwise known as Modsec, is an open-source cross-platform web application firewall engine. There can be instances where this feature would block the requests from our plugin. If it does, there is no way other than disabling it.

You should then contact your hosting provider and inform them to disable it temporarily. Once it is disabled, all other processes are no longer blocked. So, that you may continue to save the settings of Rank Math.

You should only block **ModSecurity** for a temporary period of time. Once you save all settings, it should be enabled because it is very important for the security of your site.

## 5  Conclusion

That’s it! We hope this guide has helped in resolving the issue of saving the Rank Math settings. If it does not help and you are still doubtful, please don’t hesitate to message or [reach our support team](https://rankmath.com/support/), and we’ll be happy to help you anytime.

			

			 

			
	
		
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