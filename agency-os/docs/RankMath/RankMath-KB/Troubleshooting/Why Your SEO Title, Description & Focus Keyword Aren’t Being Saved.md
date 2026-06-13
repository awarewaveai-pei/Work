# Why Your SEO Title, Description & Focus Keyword Aren’t Being Saved

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/meta-data-not-saving/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Why Your SEO Title, Description & Focus Keyword Aren’t Being Saved

			
			

	

We recommend adding a Meta Description, Focus Keyword, and SEO Title to all your posts and pages to [increase the organic traffic](https://rankmath.com/blog/increase-website-traffic/) to your website.

In the unlikely event if you’re unable to save SEO Title, Description, and/or Focus Keyword while trying to update your post or page – here are some of the most common causes:

## Table Of Contents

- [Plugin Conflicts](#plugin-conflicts)

- [JavaScript-Related Errors](#js-errors)

- [Firewall Blocked Access to the file](#firewall)

## 1  Plugin Conflicts

There can be plugin conflicts due to which you might not be able to save the SEO Title, Description, and Focus Keyword. You can solve these plugin conflicts by going through our knowledgebase article on [plugin conflict](https://rankmath.com/kb/check-plugin-conflicts/).

In case if you’ve followed through our plugin conflict tutorial and troubleshot but still couldn’t find any conflict, then proceed with the next step.

## 2  JavaScript-Related Errors

Another possible reason for experiencing issues while saving your SEO Title, Description, or Focus keyword could be JavaScript-related errors. You can [diagnose JavaScript-related errors](https://wordpress.org/support/article/using-your-browser-to-diagnose-javascript-errors/) from the JavaScript Console.

### 2.1  How to Check JavaScript Errors in Chrome?

To look for any JavaScript-related errors in the Chrome browser (desktop), you can follow the exact steps discussed below. While for other browsers like [Safari](https://wordpress.org/support/article/using-your-browser-to-diagnose-javascript-errors/#safari), [Opera](https://wordpress.org/support/article/using-your-browser-to-diagnose-javascript-errors/#opera), [Firefox](https://wordpress.org/support/article/using-your-browser-to-diagnose-javascript-errors/#firefox), you can refer to relevant tutorials.

#### Open the Developer Tools Console Panel

To open the console panel in Chrome Developer Tools, navigate to **More Tools **→** Developer Tools** from the Chrome menu.

![Open Developer Tools](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201280%20800'%3E%3C/svg%3E)

And then click the **Console** tab as shown below.

![Open console tab](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201280%20800'%3E%3C/svg%3E)

Alternatively, you can use the keyboard shortcut, **Cmd + Option + J** (in Mac) or **Ctrl + Shift + J** (in Windows, Linux) to open the Chrome console panel.

#### Identify the Error

The error console will open. If the error doesn’t appear, you may need to try reloading the page. The error console would provide the details of the error, such as — error type, where the error appears, and the line number.

![Google Chrome JavaScript console errors](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201018%20390'%3E%3C/svg%3E)

If any plugin or theme installed on your website causes JavaScript conflict on your Editor window, then Rank Math might not be able to save the metadata. You can reach out to the respective support forum with the error details to fix this issue.

You can also [open a support ticket in our Rank Math support forum](https://rankmath.com/kb/getting-support/) with the error details so that our support expert can have a look into the issue that is preventing Rank Math from saving the metadata.

## 3  Firewall Blocked Access to the File

If you are using a Firewall, then there are chances that it will prevent saving the data. Check if Rank Math is being blocked by your firewall and if it is the case, whitelist Rank Math and its files.

If you see blocked access to these files:

```
/wp-json/rankmath/v1/updateMeta
/wp-json/rankmath/v1/updateSchemas
/wp-json/rankmath/v1/updateRedirection
/wp-json/rankmath/v1/getFeaturedImageId
/wp-json/rankmath/v1/getHead
```

Then, you can whitelist the file using [Wordfence in Learning Mode](https://www.wordfence.com/help/firewall/learning-mode/). These instructions are for Wordfence but will likely work on any firewall plugin/software.

### 3.1  How to Ensure Rank Math Meta Data Can Be Updated?

To ensure Rank Math can update the metadata, you’d need to double-check that the above-listed files are being whitelisted and the access to these files isn’t blocked by any firewall or security plugin like Wordfence.

If you’re a Wordfence user, then try if you can replicate the issue. In case if it is Wordfence that is blocking access to Rank Math, then you’d need to whitelist Rank Math’s files in Wordfence. We’ve got a dedicated tutorial to [help you with this](https://rankmath.com/kb/whitelist-rank-math-in-wordfence/).

**Note:** If you aren’t using a firewall/security plugin on your website but still noticing access to these files is blocked and returning a [403 error](https://rankmath.com/kb/fix-blocked-due-to-access-forbidden-403-error/), then you may ask your web host why the files are showing 403 error.

### 3.2  How to Whitelist Rank Math File in Cloudflare?

If you’re using Cloudflare and ran into a situation where the Rank Math files are being blocked by Cloudflare, then we recommend adding page rule(s) in Cloudflare to disable security for these URLs. The following steps will help you add a page rule in Cloudflare.

#### Navigate to Rules in Cloudflare

In the Cloudflare dashboard of your domain, navigate to the **Rules** section as shown in the image below.

![Navigate to rules in Cloudflare](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201080%20231'%3E%3C/svg%3E)

#### Create New Page Rule

Under the Rules tab, click the **Create Page Rule** button.

![Create page rule in Cloudflare](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201068%20482'%3E%3C/svg%3E)

The next page lets you create a page rule. You’ll have to enter the path of the Rank Math file to be whitelisted in the field “**If the URL matches**” as:

```
*example.com/wp-json/rankmath/v1/updateMeta*
*example.com/wp-json/rankmath/v1/updateSchemas*
*example.com/wp-json/rankmath/v1/updateRedirection*
*example.com/wp-json/rankmath/v1/getFeaturedImageId*
*example.com/wp-json/rankmath/v1/getHead*
```

Make sure that you replace example.com with your domain name. Cloudflare lets you add only URL per page rule, so you would need to create additional page rules to whitelist other URLs.

**Note:** In the free plan, Cloudflare offers only 3 page rules. So if you’re using the free plan, you may need to include only the essential page rules from the above list. For instance, `getHead` is required only if you’re using Headless CMS. Similarly, `updateRedirection` head is required, only if you’re facing issues with Redirections.

Next, in the field “**Then the settings are”** choose **Disable security** as shown below.

![Whitelist Rank Math settings in Cloudflare](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20810%20488'%3E%3C/svg%3E)

#### Deploy Page Rule

After adding the necessary settings, click **Save and Deploy** button. Now Cloudflare security to the Rank Math file has been completely disabled, and you can check if you can save your SEO metadata in Rank Math.

![Save and deploy page rule in Cloudflare](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20803%20248'%3E%3C/svg%3E)

And, that’s it! We hope the article helped you fix the issue preventing the SEO metadata from being saved.  If the issue persists, [feel free to open a support ticket](https://rankmath.com/support/), and our support team will help you in the best way they can.

			

			 

			
	
		
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