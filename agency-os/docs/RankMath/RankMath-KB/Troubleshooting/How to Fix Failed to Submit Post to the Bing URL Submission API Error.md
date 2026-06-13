# How to Fix Failed to Submit Post to the Bing URL Submission API Error

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/fix-bing-url-submission-api-error/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Fix Failed to Submit Post to the Bing URL Submission API Error

			
			

	

Rank Math’s Instant Indexing module makes it easier to [submit your recently published/updated articles directly to Bing](https://rankmath.com/blog/bing-indexing-api/) without leaving your WordPress dashboard. But, if you’re seeing the error notice ‘**Failed to submit post to the Bing URL Submission API**‘, then in this knowledgebase article, we’ll walk you through how to fix this error.

**Note:** This KB is applicable only to the Instant Indexing module in Rank Math before version 1.0.81. If your version of Rank Math is 1.0.81 or above, kindly follow our KB article on [How to Use IndexNow with Rank Math](https://rankmath.com/kb/how-to-use-indexnow/).

## What Does This Error Mean?

The error indicates an issue preventing Rank Math from submitting your URL to Bing.

![Failed to submit post to the Bing URL Submission API error](https://rankmath.com/wp-content/uploads/2021/09/Failed-to-submit-post-to-the-Bing-URL-Submission-API.jpg)

To understand the exact issue, we’ll need to use the URL submission tab that is available under **Rank Math SEO → Instant Indexing** inside your WordPress admin area.

**Note:** If you’ve also installed our [Instant Indexing by Google plugin](https://wordpress.org/plugins/fast-indexing-api/), then the User Interface will look different.

On the Instant Indexing page, navigate to the **URL Submission** tab and enter the URL that you’re trying to submit. Then hit the **Submit URLs** button. Now the error notice with more details will be provided for us to understand, try & debug the issue.

![Submit URLs to Bing URL Submission API](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202366%201228'%3E%3C/svg%3E)

## 1  Not Authorized

![Bing URL Submission API Error - Not Authorized](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201692%20498'%3E%3C/svg%3E)

The error **Not Authorized** indicates your website is not verified at your Bing Webmaster Tools account.

Well, if you’ve already verified your website at Bing, a likely scenario could be the API Key you’ve used does not belong to the Bing Webmaster Tools account you’ve used for verifying your website.

So we will walk you through how to connect & verify your website with Bing Webmaster Tools in the following steps. (_If you’ve already done them, we recommend following through the steps and double-check the configuration_)

### 1.1  Add Your Website to Bing

Head over to [Bing Webmaster Tools](https://www.bing.com/webmasters/tools/). We assume that you already have an account at Bing Webmaster Tools, if not, you can always create one with any email address of your choice. To add your website manually to Bing Webmaster Tools, enter the URL of your site and then click the **Add** button.

![Add website manually to Bing](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20941%20663'%3E%3C/svg%3E)

### 1.2  Copy the HTML Meta Tag

On the next page, you’ll be presented with various options to verify your site. We recommend using the HTML Meta Tag method, as you can easily add the required meta tag with Rank Math. Copy the content part of the meta tag.

![Copy HTML Meta tag](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20957%20665'%3E%3C/svg%3E)

### 1.3  Add Bing Verification ID Using Rank Math

Now head over to **WordPress Dashboard → Rank Math SEO → General Settings → Webmaster Tools**. Paste the verification code you’ve copied earlier to the **Bing Webmaster Tools**. Once you’ve added, click the **Save Changes** button.

![Add Bing Webmaster Tools verification code](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201954%20652'%3E%3C/svg%3E)

### 1.4  Verify Site in Bing Webmaster Tools

Then head back to Bing Webmaster Tools and then click the **Verify** button, and now your site should be verified. If Bing is unable to find the verification code on your website, then make sure you’ve cleared the browser’s cache.

![Verify HTML Meta Tag in Bing Webmaster Tools](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20950%20276'%3E%3C/svg%3E)

### 1.5  Copy Bing API Key

To get the API key that is associated with your Bing account, head over to **Settings → API Access → API Key** inside Bing Webmaster Tools account, and then click the **Copy** button.

![Copy API Key from Bing Webmaster Tools](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201500%201010'%3E%3C/svg%3E)

### 1.6  Configure Bing API Key in Instant Indexing Settings

Next, in your WordPress admin area, navigate to **Rank Math SEO → Instant Indexing**. Under the **Settings** tab, add the **Bing API Key** and then click the **Save Changes** button.

![Add Bing API key in Bing Instant Indexing Settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201016%20626'%3E%3C/svg%3E)

Now try submitting your URL once again, and you must be able to submit your URLs to Bing.

## 2  Invalid API Key

![Bing URL submission error - invalid API key](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201690%20512'%3E%3C/svg%3E)

When your API Key is incorrect, this error happens. It could be likely because the API key has not been copied and pasted correctly. Or you might have regenerated the API Key after configuring the Bing URL Submission API with Rank Math.

To get the API key that is associated with your Bing account, head over to **Settings → API Access → API Key** inside Bing Webmaster Tools account, and then click the **Copy** button.

![Copy API Key from Bing Webmaster Tools](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201500%201010'%3E%3C/svg%3E)

Next, in your WordPress admin area, navigate to **Rank Math SEO → Instant Indexing**. Under the **Settings** tab, add the **Bing API Key** and then click the **Save Changes** button.

![Add Bing API key to Instant Indexing Settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201016%20626'%3E%3C/svg%3E)

Once you’ve configured the settings, try submitting the URLs again, and you should be able to do so.

After configuring Instant Indexing settings, make sure you don’t regenerate API Keys in your Bing Webmaster Tools (_the option that is just above your API Key_). When you choose this option, a new API key will be generated, and your existing API Key will become invalid. That said, if you happen to use this option, then all your existing websites, using this API Key will lose access to the Bing URL Submission API and will return an Invalid API Key error. So to regain access, you need to copy the newly generated API key and add it to Rank Math as we described above.

![Regenerate API Key at Bing Webmaster Tools](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201500%20979'%3E%3C/svg%3E)

## 3  Quota Exhausted

Bing sets a quota for submitting URLs through URL Submission API, and the quota resets every day. The feature allows users to submit up to 10,000 URLs per day. However, if this is a new website or account verified recently with Bing Webmaster Tools, then your quota will be really lower.

If your **Submit URLs** button is disabled and Quota left turns out to be zero, then it means your quota has been exhausted.

![Quota exhausted in Rank Math Bing Instant Indexing](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20936%20413'%3E%3C/svg%3E)

This quota will be increased/decreased periodically depending upon the usage and requirement. But that said, if you feel the quota allotted for your website is insufficient, you can [raise a request to Bing](https://www.bing.com/webmaster/support?ocid=fwsupport) for reviewing & updating your quota accordingly.

## Conclusion – For Support & Using Bing URL Submission Directly

And, that’s it! We hope the tutorial helped you resolve the error. If you’re still facing this error, please feel free to [reach our support team directly from here](https://rankmath.com/support/), along with the error message, so that our support expert can have a look into the issue.

In the meantime, feel free to submit URLs to Bing directly using the Bing Webmaster Tools, by heading over to the **URL Submission** in the left sidebar. Click the **Submit URLs** option available in the top-right corner.

![URL Submission in Bing Webmaster Tools](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201280%20776'%3E%3C/svg%3E)

Enter the URL(s) and then hit the **Submit** button. Your URL(s) will be submitted to Bing.

![Submit URLs at Bing Webmaster Tools](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201280%20776'%3E%3C/svg%3E)

Similar to the URL Submission API with Bing, Google offers an instant indexing API, and you can take advantage of this API with our [Instant Indexing plugin](https://wordpress.org/plugins/fast-indexing-api/). We’ve got a [dedicated blog post](https://rankmath.com/blog/google-indexing-api/) to help you walk through the process and get started in no time.

			

			 

			
	
		
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