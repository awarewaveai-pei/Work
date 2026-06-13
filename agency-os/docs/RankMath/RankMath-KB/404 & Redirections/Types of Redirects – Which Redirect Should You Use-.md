# Types of Redirects – Which Redirect Should You Use?

> **Category:** 404 & Redirections
> **Source:** https://rankmath.com/kb/redirect-types/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Types of Redirects – Which Redirect Should You Use?

			
			

	

Every website owner is going to need redirects at some point. Whether that’s because you deleted a page, changed your entire website’s permalink structure, or migrated to a completely new domain.

Fortunately, Rank Math & **[Rank Math PRO](https://rankmath.com/pricing/)** make managing redirections for your WordPress site easier than ever. So, without further ado – let’s dive into the different types of redirects as well as a range of situations in which you’d use each of them.

## Table of Contents

- [What are Redirects?](#what-are-redirects)

- [Why are Redirects So Important?](#redirects-importance)

- [When to Use Redirects?](#redirects-usage)

- [Types of Redirects](#types-of-redirects)

- [301 Permanent Move](#301-redirect)

- [302 Temporary Move](#302-redirect)

- [307 Temporary Redirect](#307-redirect)

- [Maintenance Codes](#maintenance-code)

- [410 Content Deleted](#410-content-deleted)

- [451 Content Unavailable for Legal Reasons](#451-content-unavailable)

## 1  What Are Redirects?

Redirects are a way to forward traffic and redirect visitors (or search engine bots) from one URL to another when the original URL is no longer available. A visitor who lands on a page that has been moved or removed will come across an error if there is no redirect put in place.

## 2  Why Are Redirects So Important?

If a visitor who expects to view a live web page lands on an error page, there are chances for the visitor to leave the site immediately due to a poor experience on the web page. That’s when redirects come into the picture.

Redirects are important for both visitors as well as search engines when content has moved or becomes inaccessible:

- **Visitors:** you want to offer visitors a great user experience on your website. So when they’re requesting content previously available on page A, you don’t want them to smash a [404-page](https://rankmath.com/kb/fix-404-errors/). Instead, you want them to be redirected to page B without any hassle.

- **Search engines:** you want search engines to understand that content has moved and is either temporary or permanent. Therefore, providing search engines the right signals is crucial to your SEO performance.

If you forget to implement redirects at the right place, it can lead to a loss of search engine rankings and dissatisfied users. So, whether you’re recreating your website and updating the URL structure of your pages, switching to a new domain, or just cleaning up old content regularly, you need to understand the importance of redirects and when to use them.

## 3  When to Use Redirects?

There are many reasons for using redirects, but these are some of the most common ones:

- You move the URL of a web page (from URL A to URL B).

- You delete a page or a post.

- You recreate your website and the structure changes.

- You move your website to a new domain name.

- You merge two or more websites.

- You migrate from HTTP to HTTPS.

## 4  Types of Redirects

Now, let’s look at the type of redirects that Rank Math supports.

### 4.1  301 Permanent Move

A 301 redirect permanently redirects the visitors from one URL to another. It informs the search engines that the original URL is no longer used and replaced by another page. The search engines then replace the original URL in its index with the one the redirect points to.

#### When to Use a 301 Redirect?

301 redirect should be used when you’ve removed or deleted a page permanently from the website’s architecture yet want to preserve its traffic, rankings, and links. Below are some of the examples where 301 redirects would be a good option:

- **Moving a new domain permanently** 
Original domain: https://www.yoursite.com/
New domain: https://www.yoursite2.com/

- **Moving a document or page permanently**
Original “About Us” page: https://www.yoursite.com/about-us.html
New “About Us” page: https://www.yoursite.com/about/

- **Changing a site’s structure permanently**
Original structure: https://www.yoursite.com/shirts
New structure: https://www.yoursite.com/clothes/shirts

#### When Not to Use a 301 Redirect?

- Geotargeting

- A/B testing

- Device Targeting

301 redirects will potentially help SEO because they transfer almost all of the original page’s [PageRank](https://ahrefs.com/blog/google-pagerank/) to the new one. This means that the new page would have the same authority as the original content you’ve redirected after the redirect.

#### How to Add a 301 Redirection in Rank Math?

To implement your 301 redirects with WordPress, use the powerful redirection manager in Rank Math and [set up your redirections](https://rankmath.com/kb/setting-up-redirections/) easily. Ensure that your Redirections module is enabled under **WordPress Dashboard → Rank Math SEO →** **Dashboard → Modules**.

To add a 301 redirect in Rank Math, navigate to the Redirections from your Rank Math dashboard. Then, click on **Add New Redirection.**Next, add your Source and Destination URLs and select the redirection type **301 Permanent Move** as shown below:

![Create 301 redirect in Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20842%201068'%3E%3C/svg%3E)

Make sure that the redirect is activated, and click on **Add Redirection** to add your redirect. If you do want to use the URL again, you need a temporary redirect instead.

### 4.2  302 Temporary Move

A 302 redirect helps forward traffic to a new URL temporarily. If you want to send visitors to an alternative page when visiting a particular page and reuse the URL in the future, use a 302 redirect.

#### When to Use a 302 Redirect?

- When a URL is temporarily moved to another URL.

- When you want to redirect visitors to another page based on their location or language preferences.

- When you have a desktop and mobile website, and you want to redirect desktop visitors to the mobile website and vice versa.

- If a page is under maintenance, and you want to temporarily redirect visitors to a separate temporary version of that page.

#### When Not to Use a 302 Redirect?

Do not use a 302 redirect when you want to move either a domain or website structure permanently.

A 302 redirect notifies Google and other search engines that the change is temporary while still maintaining the page’s ranking and link equity. As a consequence, using a 302 redirect should not have any negative effect on your SEO. Remember to delete the redirect when the page no longer needs to be redirected, and your SEO should be unaffected.

#### How to Add a 302 Redirection in Rank Math?

To add a 302 redirection, navigate to **Redirections** from your Rank Math dashboard. Next, click on **Add New Redirection**. Then, add your Source and Destination URLs and select the redirection type **302 Temporary Move** as shown below:

![Create 302 redirect in Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20850%201080'%3E%3C/svg%3E)

### 4.3  307 Temporary Redirect

A 307 redirect, very similar to 302 redirects, is introduced with HTTP/1.1 and states that the page has been moved to a temporary location. The usage scenarios are, for the most part, the same as for 302 redirects.

Use this redirect if you’re assured that the move is temporary, and you’ll require the original URL later on. However,  a 307 redirect should never be used when forwarding traffic from one URL to another permanently.

#### How to Add a 307 Redirection in Rank Math?

Like 301, 302 redirects, you can create a 307 redirect by selecting the **307 Temporary Redirect** option from the redirection type in Rank Math’s Redirection Manager.

![307 Redirect in Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201586%20232'%3E%3C/svg%3E)

## 5  Maintenance Code

Rank Math supports 410 Content Deleted maintenance code and 451 Content Unavailable for Legal Reasons maintenance codes.

### 5.1  410 Content Deleted

410 Content Deleted should be used when you’re sure that you want to delete a particular page completely. If a URL returns a 410, Google knows for sure you removed the URL on purpose, and it should remove that URL from its index the earliest and stop crawling the page further.

Rank Math supports 410 Content Deleted maintenance code that you can use when the content in question has been deleted, and no suitable replacement is available.

![410 Content Deleted in Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201504%20232'%3E%3C/svg%3E)

### 5.2  451 Content Unavailable for Legal Reasons

451 Content Unavailable for legal reasons should be used when the law requires that content should be made unavailable for legal reasons. For example, if you’ve received a takedown request or ordered by a judge to delete content, this is the status code that serves the purpose.

![451 Content Unavailable for Legal Reasons maintenance code](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201508%20248'%3E%3C/svg%3E)

Redirects are a vital part of SEO, but their use goes way beyond what is mentioned in this article. This article has covered the different options for redirecting pages and shown you how and when to use them. But be careful when choosing! First, think about what you want to accomplish, and then pick the most appropriate method.

If you have any other questions about redirects & how to use them on your site – feel free to reach out to our [dedicated support team](https://rankmath.com/support/), we’re always here and more than happy to help…

			

			 

			
	
		
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