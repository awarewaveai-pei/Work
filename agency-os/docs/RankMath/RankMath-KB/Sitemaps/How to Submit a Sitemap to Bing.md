# How to Submit a Sitemap to Bing

> **Category:** Sitemaps
> **Source:** https://rankmath.com/kb/submit-sitemap-to-bing/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Submit a Sitemap to Bing

			
			

	

Your website’s sitemap can keep Bing informed with all the indexable URLs on your website. And, as you know, Rank Math has a dedicated Sitemap module that lets you build your website’s sitemap in a matter of a few clicks.

So, if you haven’t already created your website’s sitemap, then please refer to our [dedicated KB on configuring sitemaps](https://rankmath.com/kb/configure-sitemaps/).

And in this knowledgebase tutorial, we’ll walk you through the different ways to submit your sitemap to Bing, so that Bing can crawl your pages and index them.

## Submit Sitemap to Bing:

- [Using Bing Webmaster Tools](#bing-webmaster-tools)

- [By Importing from Google Search Console](#import-from-gsc)

- [Using Robots.txt](#robots-txt)

## 1  Bing Webmaster Tools

Bing Webmaster Tools provides a wealth of diagnostic information on how Bing sees your website. If you’ve already [verified your website in Bing Webmaster Tools](https://rankmath.com/kb/verify-your-site-with-bing-webmaster-tools/), then you can follow the steps discussed below to add your sitemap.

### 1.1  Open Bing Webmaster Tools

At first, log in to [Bing Webmaster Tools](https://www.bing.com/webmasters/about) and choose your website.

![Login to Bing Webmaster Tools](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201262%20615'%3E%3C/svg%3E)

### 1.2  Navigate to Sitemaps section

In your Webmaster Tools dashboard, navigate to the **Sitemaps** section from the left sidebar, as shown below.

![Open Sitemaps section in Bing Webmaster Tools](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201280%20720'%3E%3C/svg%3E)

This section includes all the sitemaps and feeds that Bing knows about your website. So, if you’ve already submitted any sitemap for your website or [imported from Google Search Console](#import-from-gsc), or even if Bing organically discovered your sitemap, then it will be shown here. You may consider removing any old sitemap if it isn’t relevant to your website anymore.

### 1.3  Submit Sitemap

Now to submit your sitemap, click the **Submit Sitemap** button. And in the prompt that appears on your screen, enter the URL of your sitemap, [as displayed in Rank Math](https://rankmath.com/kb/configure-sitemaps/#finding-your-posts-sitemap).

![Submit sitemap to Bing Webmaster Tools](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201280%20720'%3E%3C/svg%3E)

While adding the sitemap, ensure that you’re submitting the sitemap index, that would look like this:

`https://rankmath.local/sitemap_index.xml`

As it goes by the name, it is an index of all the sitemaps on your website. Submitting your sitemap index is a one-off submission process, and every time you add/remove a sitemap on your website, Bing will crawl your sitemap index and identify them. Hence, no manual inputs are required from your end to do that.

Finally, click the **Submit** button. That’s it. Your sitemap is successfully submitted to Bing Webmaster Tools, and now Bing will start to crawl all your links from the submitted sitemap(s).

## 2  By Importing from Google Search Console

Bing Webmaster Tools also lets you import any existing verified properties from Google Search Console. So if your website is already verified at Google Search Console, then you can import your site to Bing Webmaster Tools with the following steps.

### 2.1  Import Your Sites from GSC

At first, sign in to your Bing Webmaster Tools account using your email address, and you’ll reach the Welcome page as shown below. Existing users can simply click the **Add a Site** option from the left sidebar to access the options available on this page.

On the Welcome page, click the **Import** button available under **Import your sites from GSC** option.

![Import your sites from GSC](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201280%20720'%3E%3C/svg%3E)

### 2.2  Allow Permissions

On the next page, Bing would request your confirmation to fetch data from your Google Search Console and import them to Bing Webmaster Tools. Click **Continue**.

![Allow Bing to import data from Google Search Console](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201280%20720'%3E%3C/svg%3E)

Next, Google would request you to authenticate and then requests your permission to let Bing access the Google Search Console data of your verified properties. Click **Allow**.

![Allow Bing to access your Google account](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201000%20694'%3E%3C/svg%3E)

### 2.3  Select Your Sites to Import

Now Bing would fetch all the verified websites available in your Google Search Console account, and here you can select the sites that you want to import. You can also notice from the below image, Bing was able to fetch the sitemap from your Google Search Console account.

Select the sites to be imported and then click the **Import** button.

![Select site to import](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201280%20720'%3E%3C/svg%3E)

### 2.4  Check Imported Sitemap

Once Bing has successfully imported your website’s data, you’ll see a success notice, as shown below.

![Site addition successful](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201280%20720'%3E%3C/svg%3E)

Click **Done,** and now you can confirm if Bing has imported your sitemap, by navigating to the **Sitemaps** section from the left sidebar.

![Sitemap in Bing Webmaster Tools](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201088%20612'%3E%3C/svg%3E)

And, that’s it! Soon Bing will start to crawl the URLs submitted through the sitemap for indexing.

Apart from submitting sitemap using the Bing Webmaster Tools, there are other methods as well, and we’d discuss them next in this article.

## 3  Using Robots.txt

Bing offers yet another method to submit your sitemap — using the robots.txt file. You may add your sitemap to your website’s robots.txt file, and if Bing organically discovers your website, it will crawl the links from the sitemap mentioned in the robots.txt file.

By default, Rank Math includes your sitemap URL in the robots.txt file, but, if you’ve made any changes to the robots.txt file in due course of time, then you may double-check the robots.txt code with the steps discussed below.

### 3.1  Open Robots.txt in Rank Math

Navigate to **WordPress Dashboard → Rank Math SEO →** **General Settings → Edit robots.txt**.

![Edit robots.txt](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202350%201250'%3E%3C/svg%3E)

### 3.2  Include Your Sitemap

As you can notice from the above image, Rank Math, by default, includes the sitemap URL here. In case, if it isn’t available, then you can include the sitemap in robots.txt by adding the following code in the code editor. Make sure to replace `yourdomain.com` with your website’s domain name.

```
Sitemap: https://yourdomain.com/sitemap_index.xml
```

### 3.3  Save Changes

Now click the **Save Changes** button at the bottom of the page for the changes to reflect.

![Save changes to robots.txt](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201536%20400'%3E%3C/svg%3E)

**Note:** This method does not guarantee sitemap submission to Bing. Hence we recommend submitting your sitemap through Bing Webmaster Tools.

And, that’s it! We hope the tutorial was helpful in submitting your website’s sitemap to Bing. If you still have absolutely any questions on Rank Math’s features, feel free to [reach our support team directly from here](https://rankmath.com/support/), and we’re always here to help.

			

			 

			
	
		
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

		

										
			
- [How to Fix Whitespace Errors Breaking Your XML Sitemap in WordPress](https://rankmath.com/kb/fix-whitespace-errors-in-sitemap/)

										
			
- [How to Submit Your Website to Search Engines](https://rankmath.com/kb/submit-website-to-search-engines/)

										
			
- [How to Configure Sitemaps in Rank Math](https://rankmath.com/kb/configure-sitemaps/)

										
			
- [What Are the SEO Benefits of Sitemaps?](https://rankmath.com/kb/sitemaps-seo-benefits/)

										
			
- [How to Submit a Sitemap to Google](https://rankmath.com/kb/submit-sitemap-to-google/)

										
			
- [Rank Math Sitemap Issues and Their Fixes](https://rankmath.com/kb/fix-sitemap-issues/)