# How to Fix ‘Automatic Update is Unavailable for this Plugin’ Error in Rank Math

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/fix-automatic-update-unavailable-for-this-plugin/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Fix ‘Automatic Update is Unavailable for this Plugin’ Error in Rank Math

			
			

	

If you are using Rank Math PRO, you might have witnessed an error ‘Automatic Update is Unavailable for this Plugin’. In this guide, let’s see in detail how to resolve such issues and help you have a hassle-free experience in using our SEO plugin.

## Table of Contents

- [Reconnect Website with Rank Math](#reconnect-website)

- [Plugin Conflict](#plugin-conflict)

- [Unable to Encrypt](#unable-to-encrypt)

- [Disable Sensitive Data Encryption](#disable-sensitive-data-encryption)

- [Conclusion](#conclusion)

## 1  Reconnect Website with Rank Math

In most cases, reconnecting your website with Rank Math would resolve the issue. Start by heading over to **WordPress Dashboard → Rank Math SEO → Dashboard → Help,** and then click **Disconnect Account.**

![Disconnect account in Rank Math SEO](https://rankmath.com/wp-content/uploads/2022/08/Disconnect-Account-in-Rank-Math-SEO.png)

Now that your website is disconnected from Rank Math, to reconnect, click on **Connect Now** button on the same page.

![Click Connect Now in Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201092%20465'%3E%3C/svg%3E)

Once you click, **Connect Now**, make sure that you’ve selected the right account and then click on **OK, Activate Now**. If you have multiple licenses, then you can click the License drop-down and choose your preferred license to activate on this website.

![Activate Rank Math PRO Subscription](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20850%20610'%3E%3C/svg%3E)

This will solve the issue of the auto-update unavailable error. In case the issue doesn’t resolve, then follow the other methods we’ve listed below.

## 2  Plugin Conflict

Sometimes, there arises a situation where Rank Math SEO conflicts with another installed plugin on your website. There can also be a conflict with your theme. Here is the list of [conflicting plugins](https://rankmath.com/kb/plugin-conflicts/).

To confirm whether there is a plugin conflict between Rank Math and other Plugins/ Themes, we have got a dedicated KB article, which helps you in checking a [Plugin/ Theme Conflict With Rank Math](https://rankmath.com/kb/check-plugin-conflicts/).

It can also arise if the plugin/ theme is not adhering to the latest coding standards or performing the same functions as each other.

## 3  Unable To Encrypt

Sometimes, even though the website is connected to your Rank Math account, it is possible that Rank Math might be unable to decrypt the encrypted user account data stored in your database. In such a case, it shows a warning message: _**“Automatic update is unavailable for this plugin”**_.

![Automatic update is unavailable for this plugin](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201102%20252'%3E%3C/svg%3E)

When you connect your site, the API key and other user data are stored in your database. It then gets encrypted for additional security. For this encryption, Rank Math uses the secret keys defined in your wp-config.php file (the `LOGGED_IN_KEY` & `LOGGED_IN_SALT` values).

These keys can be regenerated for security purposes, and some security plugins even do this automatically on a scheduled basis. This creates a problem because the encrypted data cannot be decrypted with the new keys.

A possible solution for this issue/ error is to define the ‘RANK_MATH_ENCRYPTION_KEY` & `RANK MATH ENCRYPTION_SALT` constants in your **wp-config.php** file and make sure not to change those. When these constants are set, Rank Math will use them instead of the core’s keys which get replaced from time to time.

You can add the following code in the wp-config.php file right after the `define(‘NONCE SALT’, …` line in it:

```
define( 'RANK_MATH_ENCRYPTION_KEY', 'S)xC=}0D!J;GB[Waz*)@lQ@!?MmXjQp>w57v!zeK,{WzdlF3>lnU5G8<N]kq^{' );
define( 'RANK_MATH_ENCRYPTION_SALT', '/V2&9r-3E0$#E/jY#D_+|4|jw*VOg,N9S~8-^jEgnzgZ @Y9U!Cz@~D0WgBuyf{' );
```

After adding relevant code, reconnect Rank Math one more time. This should fix the auto-update problem, and you should be able to update the plugin without any issues in the future.

Note: Please make sure you take a [backup of your site](https://rankmath.com/blog/backup-wordpress-site/) before making any changes or modifications.

## 4  Disable Sensitive Data Encryption

If the above solution does not work, then you can disable the sensitive data encryption check done by Rank Math altogether.

To do so, navigate to **WordPress Dashboard → Appearance → Theme Filter Editor** (for Classic Theme) or **WordPress Dashboard → Tools → Theme Filter Editor** (for Block Theme).

From the list of files in your theme, choose **rank-math.php** and add the following filter.

```
/**
 * Filter to disable sensitive data encryption
 */
add_filter( 'rank_math/admin/sensitive_data_encryption', '__return_false' );
```

Finally, click the **Update File** button at the bottom of the page.

## 5  Conclusion

That’s it! We hope this helps in solving the issue on a permanent basis. In case it doesn’t solve your problem, please don’t hesitate to contact our [support team](https://rankmath.com/support/) anytime. We would be happy to assist you with this.

			

			 

			
	
		
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