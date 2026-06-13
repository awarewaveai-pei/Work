# How to Use IndexNow With Rank Math

> **Category:** Getting Started
> **Source:** https://rankmath.com/kb/instant-indexing/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Use IndexNow With Rank Math

			
			

	

You need to get your website & all your web content indexed in order to drive traffic from organic search, indexing the content in a timely manner is an essential part of [WordPress SEO](https://rankmath.com/wordpress/plugin/seo-suite/). Without indexing, search engines won’t be able to find your website, which means your site won’t rank, and no one will find it on search results. And, if it happens, you’ll lose the potential traffic that could be converted into leads and customers.

Rank Math’s **Instant Indexing** allows you to submit your URLs to IndexNow-enabled search engines and helps you to index your website and its content, even without configuring your site with any of these webmaster tools. Let’s see how the **[IndexNow](https://www.indexnow.org/)** feature helps you to instantly submit URLs to Bing and Yandex.

## Table of Contents

- [What is IndexNow?](#indexnow)

- [How to Configure Automatic URL Submission](#automatic-url-submission)

- [Submit URLs Manually](#submit-urls-manually)

- [Managing API Key](#managing-api-key)

- [Checking the History](#history)

- [What Are the Benefits of IndexNow to the Publishers?](#benefits)

- [FAQs on IndexNow: Everything You Need to Know](#faqs)

## 1  What is IndexNow?

IndexNow is Microsoft and Yandex’s proud initiative to crawl sites efficiently so that they can reduce the crawl footprint. Various engines have already adopted the IndexNow protocol.

The protocol works by allowing websites to submit URLs to the IndexNow API once, and it would be shared with all the participating search engines. So you only have to **submit your site changes and URLs once**, and all the participating search engines will be aware of the latest changes on your site, to **crawl, index, and reflect these changes sooner** in search results.

While you start submitting your URLs, search engines want to verify if these submissions are legit and come from the website itself and not from any malicious elements. Hence search engines want the websites to generate a unique API key and get it verified.

Thankfully, Rank Math automatically **generates an API key for your website, dynamically hosts it on your website, and serves it to the search engines**, so you don’t have to go through all the hassle and instead focus more on creating and managing the content on your site.

## 2  How to Configure Automatic URL Submission

The IndexNow API submission is available in Rank Math Free out of the box. So from here, all you need to do is head over to **WordPress Dashboard → Rank Math SEO**and enable the **Instant Indexing** module as shown below:

![Enable Instant Indexing module](https://rankmath.com/wp-content/uploads/2022/01/Rank-Math-Instant-Indexing.jpg)

The rest can be configured at **Rank Math SEO → Instant Indexing → Settings**. You can select/ deselect whichever content you want to submit automatically. Once you select the post types, ensure that Rank Math has generated an API Key. Finally, hit “Save Changes” to save your preferences.

![IndexNow Auto-Submit Post Types](https://rankmath.com/wp-content/uploads/2022/02/IndexNow-Auto-submit-post-types.png)

Rank Math will now automatically submit URLs to IndexNow API, whenever a new post is published or modified on your website. However, please note, **Rank Math will not automatically submit URLs that are set to NoIndex**.

## 3  Submit URLs Manually

Rank Math offers a few different options to submit your URLs manually. Here are they:

### 3.1  Submit URLs in Batch

To submit URLs manually, just go to **Rank Math SEO → Instant Indexing → Submit URLs**. Here you can add multiple URLs (one per line) of your blog posts, the home page, or any other web content.

Then click **Submit URLs** button, and all the added URLs will be submitted for indexing without actually visiting the webmaster tools or configuring it with an API key.

![Submit URLs in IndexNow](https://rankmath.com/wp-content/uploads/2022/01/Submit-URLs-in-IndexNow.png)

### 3.2  Submit Individual Post/Page

In addition to the Submit URLs feature in the Instant Indexing settings, you can always submit your post (or page) from the Posts page in WordPress Editor.

On the Posts page, as you hover over the post, you’ll see a row of options. Choose the **Instant Indexing: Submit Page** option, as shown below.

![Instant Indexing Submit Page](https://rankmath.com/wp-content/uploads/2023/06/instant-indexing.jpg)

Once the post gets submitted successfully, you’ll see a notice at the top of the page, similar to the one below.

![IndexNow successful submission](https://rankmath.com/wp-content/uploads/2022/01/IndexNow-successful-submission-notice.png)

### 3.3  Instant Indexing Bulk Action

In certain scenarios, you may need to submit multiple URLs from the Posts page. Submitting URLs one by one would be tedious in this case, and Rank Math offers a bulk action, so you can save your time.

To use the bulk action, select the posts that you want to submit to IndexNow. Then choose the **Instant Indexing: Submit Pages** option from the Bulk Actions and click the **Apply** button.

![Instant Indexing bulk action](https://rankmath.com/wp-content/uploads/2023/06/instant-indexing-bulk-action.jpg)

## 4  Managing API Key

You can manage the API key that Rank Math has generated for the IndexNow Protocol from the Instant Indexing settings under **Rank Math SEO → Instant Indexing →** **Settings**.

![Managing API Key with Instant Indexing settings](https://rankmath.com/wp-content/uploads/2022/02/Managing-API-key-with-Instant-Indexing-Settings.png)

### 4.1  Change API Key

The API key field displays the API key that Rank Math has generated automatically for your website. This API key helps you prove the ownership of your site.

In an unlikely case, if the API key becomes known to third parties, you can always regenerate a new one by clicking the **Change Key** option. Rank Math would then generate a new API Key for your site in a few moments.

![Change IndexNow API Key in Instant Indexing Settings](https://rankmath.com/wp-content/uploads/2022/02/Change-API-Key.png)

### 4.2  Check API Key Location

As we mentioned earlier, Rank Math hosts the API Key dynamically and serves it for search engines. In case, you prefer to check if the API key is accessible for search engines, then you can click the **Check Key** button available under the API Key location. A new tab will open and lead to the location where Rank Math hosts the API key.

![Check API Key location in Instant Indexing settings](https://rankmath.com/wp-content/uploads/2022/02/Check-API-Key-location-in-Instant-Indexing-Settings.png)

If the new tab displays your API key, then you can rest assured that the API key will be served to search engines for verifying your site (provided this page is not blocked through robots.txt).

![API Key served by Rank Math](https://rankmath.com/wp-content/uploads/2022/02/API-Key-served-by-Rank-Math.png)

## 5  Checking the History

To check the URLs you have submitted, you can always visit the “History” section under Rank Math’s IndexNow. You can also check the response code related to your submission. Ideally, it should show “200 – OK” whenever you submit any valid and relevant URLs. This means that the URL you’ve submitted has been successfully submitted without any problems.

**Note:** Users will initially see the “202 – Accepted” status. It means that IndexNow API has accepted the request, but the site is yet to be verified with the API Key.

![Instant Indexing History](https://rankmath.com/wp-content/uploads/2022/01/IndexNow-History.png)

Below are the response codes you may encounter in this section:

| HTTP Code | Response | Description |
|---|---|---|
| 200 | OK | The URL was successfully submitted to the IndexNow API. |
| 202 | Accepted | The IndexNow API received your URL. However, it still needs to validate the API key to confirm the URL belongs to your site. |
| 400 | Bad Request | The URL was not properly formatted. |
| 403 | Forbidden | The IndexNow API did not find your API key and cannot confirm the URL belongs to your site. |
| 422 | Unprocessable Entity | The URL belongs to another site and cannot be processed. |
| 429 | Too Many Requests | The IndexNow API received too many requests beyond the permitted quota of 10,000 requests per HTTP POST. You can refer to this article on how to fix the 429 response error. |

## 6  What Are the Benefits of IndexNow to the Publishers?

- **Single Submission:** With a single submission, IndexNow API allows webmasters to keep all the participating search engines informed with the changes on the site.

- **Helps to Publish Web Content Faster:** IndexNow cuts down crawling demands on the server. That is, all participating search engines don’t have to spend more time on exploratory crawls in order to make sure that all the web pages have been updated or not. This will further help in reducing the time for content to be indexed and discovered by users.

- **Reducing Server Load Time:** It improves the performance of the server without the added burden of redundant serving of web pages that search engines already have.

- **Reduction of Global Warming Pressures:**It helps to reduce global warming pressures by reducing the energy demands of crawling and indexing.

## 7  FAQs on IndexNow: Everything You Need to Know

### **What is Meant by Index****N****ow?**

IndexNow is an open-source initiative, available for all participating search engines that aim to change the way how content is discovered to a push method. It is a simple ping protocol that lets search engines know that a URL and its content has been added, updated, or deleted, which allows search engines to quickly reflect this change in their search results by crawling and indexing faster.

### How Many Sites Publish to IndexNow?

Over [60 million](https://blogs.bing.com/webmaster/september-2023/Wix-now-supports-IndexNow-for-Faster-Content-Indexing) sites publish 1.4 billion URLs to IndexNow each day. On average, 12% of the new URLs clicked in search results were first discovered by IndexNow.

### Which Search Engines Are Using IndexNow?

This technology is developed by Microsoft Bing and Yandex, which allows websites to easily notify search engines when their website content is created, updated, or deleted. Currently, Bing, Yandex, Seznam, and Naver are the only search engines that use the IndexNow feature, but more search engines are expected to adopt IndexNow.

### **How Does the Index****N****ow Module in Rank Math Work?**

When the IndexNow module is enabled, Rank Math will automatically generate an API Key for your website and host it dynamically. For the configured post types, when a new post is created, updated, or deleted, Rank Math will automatically ping IndexNow, and all the IndexNow-enabled search engines will be aware of the latest changes on the site.

### **How Many U****RL****s Can I Submit per Day?**

Currently, the IndexNow feature does not have any known limitation to the URLs that can be submitted per day. But it is always advised not to exploit this benefit.

### Despite Submitting the URL, Why is My URL Not Indexed Yet?

IndexNow is a way to keep search engines informed about the latest changes on the site. However, crawling and indexing these pages is at the complete discretion of the participating search engine.

### Indexnow API Key Location Leads to a 404 Page or Homepage. How to Fix It?

Since the text file is not being created automatically, you will need to manually add the text file to the root of your website with the following name: `[your_api_key].txt` and the contents should also include the API key.

Once done, when you submit a URL you should get a status code 202 which means the request has been accepted and it’s waiting for the validation of the API key before being submitted.

### Can I Submit URLs That No Longer Exist to Inform Search Engines They Are Gone?

Yes, this is a great way to quickly remove content. You can submit URLs that have been removed and now show return 404 and 410 errors. When you delete a post or page, [Rank Math SEO](https://rankmath.com/wordpress/plugin/seo-suite/) automatically does this for you.

### Why Do I Not Have Access to Option Settings for Instant Indexing?

To access the settings for Instant Indexing, enable the Advanced Mode of our plugin, [as shown in this tutorial](https://rankmath.com/kb/switch-from-easy-to-advanced-mode).

## 8  Conclusion

That’s it! We hope this guide has helped in configuring the IndexNow module from Rank Math, without any hurdles. If you still have any doubts regarding the usage of the IndexNow feature on your website, please feel free to [reach our support team](https://rankmath.com/support/), and we’ll be happy to help you anytime.

			

			 

			
	
		
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

		

										
			
- [How to Download & Install WP Rocket from Rank Math Website?](https://rankmath.com/kb/how-to-install-wp-rocket/)

										
			
- [How to Add Multiple Keywords in WordPress](https://rankmath.com/kb/how-to-add-multiple-keywords/)

										
			
- [How to Install the Imagify Plugin via Rank Math PRO](https://rankmath.com/kb/install-imagify-plugin/)

										
			
- [How to Build SEO Report for Your Website](https://rankmath.com/kb/seo-report/)

										
			
- [How to Connect/Disconnect Your Website From Rank Math](https://rankmath.com/kb/how-to-connect-or-disconnect-rank-math/)

										
			
- [Installing the Rank Math Plugin for the First Time](https://rankmath.com/kb/installation/)