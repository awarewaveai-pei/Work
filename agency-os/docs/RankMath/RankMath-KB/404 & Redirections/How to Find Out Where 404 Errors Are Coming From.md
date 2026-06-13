# How to Find Out Where 404 Errors Are Coming From

> **Category:** 404 & Redirections
> **Source:** https://rankmath.com/kb/find-the-source-of-404-errors/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Find Out Where 404 Errors Are Coming From

			
			

	

“404 – page not found” – who hasn’t seen this when browsing the internet? Landing on a 404 error page is one of the most annoying things you can experience on a website. 404 errors can negatively affect your website in many ways – they frustrate visitors and send negative signals to search engine bots. It’s therefore important to quickly identify and deal with 404 errors.

The first place to look is in your Google Analytics reports and Google Search Console to see what’s already turning up. Then, after taking care of the easy-to-find errors, you can use crawling tools to find more in-depth 404 errors, like broken images on your site.

In this knowledgebase article, we will walk you through how to find out where your 404 errors are coming from.

## Table Of Contents

- [Using Rank Math](#using-rank-math)

- [Using Google Search Console](#using-google-search-console)

- [Using 404 to 301 – Redirect, Log and Notify 404 Errors](#using-404-to-301-redirect-log-and-notify-404-errors)

## 1  Using Rank Math

Rank Math offers features to discover the source of your 404 errors and redirect visitors to the correct URL. To do that, you first need to ensure you have Rank Math installed.

### 1.1  Install Rank Math

To install Rank Math, navigate to **Plugins → Add New** from your WordPress dashboard.

![How to install Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201887%20769'%3E%3C/svg%3E)

Once done, enter Rank Math in the search bar and click **Install Now**, as shown below.

![Click Install Now to install Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20692'%3E%3C/svg%3E)

Once the installation is complete, click **Activate**.

![Click Activate to activate Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20696'%3E%3C/svg%3E)

### 1.2  Enable the 404 Monitor Module

If you have Rank Math installed, navigate to **Rank Math SEO → Dashboard**from your WordPress dashboard and enable **Advanced Mode**at the top-right corner of the page. Once done, enable the **404 Monitor**module, as shown below.

![Enable Rank Math 404 Monitor module](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201791%20838'%3E%3C/svg%3E)

### 1.3  Navigate to the 404 Monitor

The final step is to navigate to **Rank Math SEO → 404 Monitor**. You will be presented with your 404 Monitor, as shown below.

![Navigate to Rank Math 404 Monitor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201862%201016'%3E%3C/svg%3E)

The 404 Monitor contains the details of every 404 error on your site. If it is empty, it simply means your visitors have not encountered a 404 error since you installed Rank Math. You can replicate a 404 error by opening a new tab on your browser and visiting a nonexistent URL on your website.

Once done, return to the 404 Monitor and reload the page. You will notice that the URI, Hits, and Access Time of the 404 error will be displayed, as shown below.

![Example of an error in the 404 Monitor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201773%20630'%3E%3C/svg%3E)

- The **URI**is the link to the 404 page.

- **Hits**refer to the number of times the 404 page was visited.

- **Access Time** refers to the last time the 404 page was visited.

### 1.4  Enable the Advanced 404 Monitor

The Advanced 404 Monitor allows you to capture some extra details, including the website that directed your visitors to your site and the browser your visitors used to access your site.

To enable the Advanced 404 Monitor, head over to **Rank Math SEO → General Settings → 404 Monitor**,****as shown below.

![Rank Math 404 Monitor settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201237%20847'%3E%3C/svg%3E)

In the Mode settings, select **Advanced.**Once done, scroll down and click **Save Changes**.

![Rank Math Advanced 404 Monitor settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201611%201685'%3E%3C/svg%3E)

**Note:**A warning will be displayed when you select the Advanced option. This is because your site’s database can quickly overload if you have many 404 errors. We recommend you only enable the Advanced option when investigating the source of a 404 error.

If you return to the 404 Monitor log, you will notice it now includes two new fields, Referer and User-Agent.

![Advanced 404 Monitor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201765%20601'%3E%3C/svg%3E)

- The **Referer**field will contain the webpage URL directing visitors to your site.

- The **User-Agent** will contain the details of the browser the visitor used to access your site.

You can open another nonexistent URL on your site and refresh the 404 Monitor to see how errors are displayed.

![Example of the Advanced 404 Monitor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201771%20814'%3E%3C/svg%3E)

**Note:**The Referer field will be empty since you directly typed the URL into your browser. If the URL were a backlink from a webpage on your site or another site, the webpage URL would be displayed.

With that said, you just experienced the [Advanced 404 Monitor](https://rankmath.com/kb/advanced-404-monitor/) in Rank Math. It provides the exact data you need to identify the source of your 404 errors.

Once you have identified a 404 error, the next step is to use the Rank Math redirection module to redirect your visitors to the correct URL. That way, you will improve your visitors’ user experience and pass the link juice to the new URL. You can refer to this detailed guide on [creating redirections and solving 404 errors using Rank Math](https://rankmath.com/kb/how-to-create-a-redirection/).

## 2  Using Google Search Console

The Google Search Console is another tool that will help you uncover where your 404 errors are coming from. However, it will only display your 404 errors if you have previously connected it to your site.

### 2.1  Log in to the Google Search Console

The first step is to log into the [Google Search Console](https://search.google.com/search-console).

If multiple variations of your site are connected to the Google Search Console, ensure that the correct variation is selected in the property dropdown menu at the top-left side of the screen.

![Example of Google Search Console property](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20659'%3E%3C/svg%3E)

### 2.2  Navigate to the Not Indexed Tab

Once you have selected the correct variation of your site, navigate to **Indexing → Pages**. Once done, ensure the **Not indexed**tab is checked, as shown below.

![Navigate to Google Search Console Not indexed tab](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20652'%3E%3C/svg%3E)

### 2.3  Navigate to Not Found (404) and Soft 404

The next step is to scroll down to the **Why pages aren’t indexed**section.

You will be presented with the reasons your URLs aren’t eligible for display on Google. You will click on the **Not found (404)**and ****Soft 404****reasons, as shown below.

![Select Not found (404) or Soft 404 ](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20691'%3E%3C/svg%3E)

### 2.4  Navigate to Examples

Once done, scroll down to the Examples section of the selected reason. A list of the URLs that returned a 404 error will be displayed.

![Scroll down to Examples](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20697'%3E%3C/svg%3E)

When you hover over a URL, you will have the option to copy the URL, open it in a new tab, or inspect it in Google Search Console.

![Sample of the Google Search Console hover options](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201819%20607'%3E%3C/svg%3E)

10 URLs are displayed on the page by default. You can scroll to the **Rows per page**dropdown****menu at the bottom to increase the number of URLs displayed per page. Optionally, you can click the navigation arrow to navigate to the next page.

![How to increase the URLs displayed per page](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20690'%3E%3C/svg%3E)

## 3  Using 404 to 301 – Redirect, Log and Notify 404 Errors

404 to 301 – Redirect, Log and Notify 404 Errors is a plugin that allows you to discover the source of your 404 errors. As usual, the first step is to ensure you have the plugin installed.

### 3.1  Install 404 to 301 – Redirect, Log and Notify 404 Errors

To install the plugin, navigate to **Plugins → Add New**from your WordPress dashboard. Once done, enter 404 to 301 – Redirect, Log and Notify 404 Errors in the search bar and click **Install Now**.

![How to install 404 to 301 - Redirect, Log and Notify 404 Errors](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201885%20997'%3E%3C/svg%3E)

Once the plugin is installed, click **Activate**.

![How to activate 404 to 301 - Redirect, Log and Notify 404 Errors](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201882%20781'%3E%3C/svg%3E)

### 3.2  Navigate to the 404 Errors Logs

Once you have activated the plugin, navigate to **404 to 301 → 404 Errors**from your WordPress dashboard. You will be presented with your 404 Error Logs. This is where the 404 errors on your site will be displayed.

![Sample of the 404 Error Logs](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201870%20963'%3E%3C/svg%3E)

Once you discover the source of your 404 errors, the next step is to use the provided data to sort and decide whether to fix or ignore the errors. If you choose to fix the errors, you must know the order in which to fix them and how to fix them to ensure that you retain your link juice. You can refer to this detailed guide on [identifying, sorting, and fixing 404 errors](https://rankmath.com/kb/fix-404-errors/).

We hope you can detect the source of your 404 errors. If you still have any questions about finding out where your 404 errors are coming from, you’re always more than welcome to [contact our dedicated support team](https://rankmath.com/support/). We’re available 24/7, 365 days a year…

			

			 

			
	
		
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

		

										
			
- [How to Track and Fix 404 Errors from ChatGPT](https://rankmath.com/kb/fix-404-errors-from-chatgpt/)

										
			
- [How to Trace Your Website’s URL Redirects](https://rankmath.com/kb/trace-url-redirects/)

										
			
- [How to Set 410 Status Code in Bulk for WordPress](https://rankmath.com/kb/set-410-status-in-bulk/)

										
			
- [301 vs 302 Redirect: Which One Should You Use?](https://rankmath.com/kb/301-vs-302-redirect/)

										
			
- [How to fix ‘The Redirection you are trying to create may cause infinite loops’?](https://rankmath.com/kb/fix-infinite-loop-error/)

										
			
- [How to Set Up Redirections](https://rankmath.com/kb/setting-up-redirections/)