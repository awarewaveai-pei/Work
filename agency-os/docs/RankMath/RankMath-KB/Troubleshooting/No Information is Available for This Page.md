# No Information is Available for This Page

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/no-information-is-available-for-this-page/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# No Information is Available for This Page

			
			

	

When your site appears in Google search results, the visitors will first read the meta title and description that will convince and persuade them to click through to your website. However, If a Google search result displays “No Information is Available for This Page,” they’re likely to ignore your site.

On the other hand, if you intentionally blocked Google from crawling the page, you don’t want it to appear in search results. In this knowledgebase article, we’ll show you why Google displays “No information is available for this page.” in the meta description of your site.

## 1  Why Google Displays “No Information is Available for This Page”

Google displays “No information is available for this page” because the robots.txt file on your site blocks it from crawling the URL. However, [Google discovers and indexes](https://developers.google.com/search/docs/crawling-indexing/robots/intro#what-is-a-robots.txt-file-used-for) the web page because the page receives [a backlink](https://rankmath.com/seo-glossary/backlinks/) or is part of [a redirect chain](https://rankmath.com/seo-glossary/redirect-chain/).

![A Google search result showing No information is available for this page](https://rankmath.com/wp-content/uploads/2023/01/no-info-available.jpg)

## 2  How to Check if a Web Page is Blocked by robots.txt

### 2.1  Debug the URL

To check if Google is blocked from crawling a page, head over to the [**HTTP Status Tester**](https://http.dev/tester) and paste the page’s URL in the text box. Then click on the **Test URLs**button, as shown below.

![debug the URL](https://rankmath.com/wp-content/uploads/2023/01/test-urls.jpg)

### 2.2  Review the Status of the URL

HTTP Status Tester will display “**[Blocked by robots.txt](https://rankmath.com/kb/fix-submitted-url-blocked-by-robots-txt-error/)**“****if it detects that the robots.txt file will block Google from crawling the page.

![URL is blocked by Google](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20987'%3E%3C/svg%3E)

Likewise, the HTTP Status Tester will display “**Allowed**” if it detects that the robots.txt file will allow Google to crawl the page.

![URL is allowed to crawl](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20903'%3E%3C/svg%3E)

If the URL is part of a redirect chain, you need to scroll down to the last URL, as shown below. The robots.txt file may block Google from crawling the final URL even if it allows Google to crawl the other URLs that redirect to it.

![Scroll to the last URL if the URL is a redirect chain](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20934%201145'%3E%3C/svg%3E)

As you already know, you can use robots.txt to block Google from accessing a URL on your site. However, Google can still find and index the URL. So, if you don’t want a web page to appear in search results, you should set it to “[noindex](https://rankmath.com/kb/how-to-noindex-urls/)” or lock it with a password.

Additionally, if robots.txt blocks the meta description of a web page you want on Google, you’ll have to edit robots.txt to remove or modify the instructions responsible. You can refer to this knowledgebase article on [how to edit your robots.txt file with Rank Math](https://rankmath.com/kb/how-to-edit-robots-txt-with-rank-math/).

If you have questions, you’re always more than welcome to [contact our dedicated support team](https://rankmath.com/support/). We’re available 24/7, 365 days a year…

			

			 

			
	
		
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