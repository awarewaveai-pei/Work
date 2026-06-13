# How to Check if Google Analytics is Installed on Your Site

> **Category:** Analytics
> **Source:** https://rankmath.com/kb/check-if-google-analytics-is-installed/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Check if Google Analytics is Installed on Your Site

			
			

	

Google Analytics is an indispensable tool for tracking website performance, understanding user behavior, and making data-driven decisions. However, if you’re unsure whether it’s properly installed on your site, verifying the setup is crucial to ensure accurate data collection and insights.

In this knowledgebase guide, we’ll explore a few straightforward methods to confirm that Google Analytics is installed and functioning correctly on your WordPress website.

Keep in mind that you don’t need to try every method—choosing just one is enough to confirm whether it’s set up correctly. If one method works, you can be confident that Google Analytics is already active.

## 1  Check the Page Source

An easy way to confirm if Google Analytics is installed on your site is by [reviewing the source code of your website](https://rankmath.com/kb/how-to-view-page-source/). Open your website in a browser, right-click anywhere on the page, and select **View page source**.

![Check page source](https://rankmath.com/wp-content/uploads/2024/12/Check-page-source.png)

Alternatively, access the page’s raw HTML code by using Ctrl+U on Windows or Cmd+Option+U on Mac.

Once the source code is displayed, press Ctrl+F (Windows) or Cmd+F (Mac) to open the search function. Search for terms such as `gtag` or `gtag.js`.

If Google Analytics is installed, the search results will highlight related sections, including the `www.googletagmanager.com` URL and your measurement ID, which appears this way: `gtag('config', 'G-...')`. This confirms that Google Analytics is active on your site.

![Find Google Analytics code on website source code](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20421'%3E%3C/svg%3E)

## 2  Check Using Rank Math SEO

The Rank Math SEO plugin makes it simple to connect your website to Google Analytics. When properly configured, it collects and displays your site’s performance data directly within the plugin.

If your site isn’t connected to Google Analytics yet, you can set it up from the Rank Math **General Settings**. To do this, navigate to **Rank Math SEO → General Settings** in your WordPress dashboard. On the settings page, locate the **Analytics** tab, where you’ll find the **Connect Google Services** button.

![Connect to Google Analytics in Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%201195'%3E%3C/svg%3E)

If you see this button, it means Google Analytics hasn’t been set up or linked to your site through Rank Math. In this case, you’ll need to follow the [detailed guide to connect your website to Google Analytics.](https://rankmath.com/kb/install-google-analytics/)

Once you’ve successfully connected Google Analytics to Rank Math, make sure the **Install Analytics Code** option under the **Analytics** section is enabled, as shown below.

![Install analytics code via Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201368%201399'%3E%3C/svg%3E)

Finally, scroll to the bottom of the page and click the **Save Changes** button to apply your settings.

## 3  Real-Time Reports in Google Analytics

Another method to confirm if Google Analytics is connected to your site is by checking the real-time reports within your Google Analytics account. These reports show the number of users active on your site within the past few minutes, helping you determine if tracking is functioning as expected.

To do this, log in to your [Google Analytics account](http://analytics.google.com) and navigate to **Reports** in the menu, then select the **Realtime** **pages**section. If the report displays the number of users who have visited your site in the past 30 minutes, it means Google Analytics is installed and working correctly.

For example, if you’re testing a site where Google Analytics was recently added, the real-time pages report might initially show no active users or views for the past 30 minutes.

![Google Analytics Realtime pages report](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20615'%3E%3C/svg%3E)

This doesn’t necessarily mean Google Analytics isn’t working. It could simply indicate that your site hasn’t had visitors during that timeframe, especially if it’s new or has low traffic.

To confirm, try visiting your site yourself. Browse through a few pages while keeping the real-time report open. You’ll notice that the report updates almost instantly to reflect your activity.

![Google Analytics Realtime pages report ](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20589'%3E%3C/svg%3E)

Seeing this real-time data clearly indicates that Google Analytics is installed and properly tracks your site’s performance.

## 4  Using Browser Developer Tools

Your browser’s developer tools provide another reliable way to verify if Google Analytics is installed.

Start by opening your website in a browser like Chrome or Edge. Right-click anywhere on the page and select **Inspect** to access the developer tools.

![Visit developer tools](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201209%20930'%3E%3C/svg%3E)

Alternatively, use the shortcut **Ctrl+Shift+I** on Windows or **Cmd+Option+I** on Mac to open them.

Once the developer tools are open, switch to the **Sources** tab. This tab lists all the files and requests your website loads. Refresh the page to ensure the data is fully populated.

Look through the list for requests made to endpoints like `www.googletagmanager.com`. When you locate it, click on it, and you’ll see a folder labeled `gtag`. Inside this folder, you should find your site’s Google Analytics measurement ID.

![Find GA installation via developer tools](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20489'%3E%3C/svg%3E)

If the measurement ID is present, it confirms that Google Analytics is active and tracking your site’s performance.

## 5  Use the Tag Assistant Companion Extension

The [Tag Assistant Companion](https://chromewebstore.google.com/detail/tag-assistant-companion/jmekfmbnaedfebfnmakmokmlfpblbfdm?hl=en) is a browser extension designed by Google to help verify the presence and functionality of tracking tags, including Google Analytics. To begin, install the Tag Assistant Companion extension from the Chrome Web Store by clicking the **Add to Chrome** button.

![Install Tag Assistant Companion Extension](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20633'%3E%3C/svg%3E)

Once installed, open your website in Chrome and click the **Tag Assistant** icon in your browser toolbar to activate it.

![Using the Tag Assistant Companion Extension](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201273%20925'%3E%3C/svg%3E)

After enabling the extension, you will be redirected to the Tag Assistant web page. On this page, you’ll see an **Add domain** button. Click on it.

![Tag Assistant page](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20553'%3E%3C/svg%3E)

A popup will appear, prompting you to enter the URL of the website you want to check for Google Analytics installation. After adding your website’s URL, click the **Connect** button.

![Add website to Tag Assistant page](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20803'%3E%3C/svg%3E)

The tool will scan your website for Google tags and provide a report. If Google Analytics is properly installed, the report will show a green checkmark on a new window tab, indicating that the tag is functioning as expected.

![Tag Assistant connected](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20841'%3E%3C/svg%3E)

To confirm the results, return to the Tag Assistant page where you added your site’s URL. You will see a **connected** notice and consent to the installation.

The page will confirm that the Google tag was found on your site and display your Google Analytics details, such as the measurement ID, indicating that Google Analytics is active on your site.

![Confirm the installation of Google Analytics](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20605'%3E%3C/svg%3E)

Now that we’ve covered several methods to check if Google Analytics is installed on your website, you can choose the one that best suits your preference.

If any of these methods reveal that Google Analytics is not installed or functioning, take the necessary steps to reconnect your website to Google Analytics. Doing so will ensure you can track your website’s performance in real-time.

We hope this guide helps you confirm the installation of Google Analytics on your site. If you have further questions about Rank Math or need assistance, feel free to [reach out to our support team](https://rankmath.com/support/). We’re available to help anytime.

			

			 

			
	
		
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

		

										
			
- [How to Create SEO Reports for Clients](https://rankmath.com/kb/create-seo-reports-for-clients/)

										
			
- [How to Check the Traffic Source of Your Website](https://rankmath.com/kb/check-the-traffic-source-ga4/)

										
			
- [How Long Does It Take for Google Analytics 4 to Show Data?](https://rankmath.com/kb/ga4-data-freshness/)

										
			
- [How to Track Affiliate Link Clicks on Your Website](https://rankmath.com/kb/track-affiliate-link-clicks/)

										
			
- [How to Track File Downloads on Your Website](https://rankmath.com/kb/track-file-downloads/)

										
			
- [How to Track Outbound Links and Monitor Click Data on Your Site](https://rankmath.com/kb/track-outbound-links/)