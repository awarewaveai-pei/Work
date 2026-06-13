# Can I NoIndex PDF Files Using an SEO Plugin?

> **Category:** Miscellaneous
> **Source:** https://rankmath.com/kb/can-i-noindex-pdf-files-using-an-seo-plugin/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Can I NoIndex PDF Files Using an SEO Plugin?

			
			

	

Offering PDFs (ebooks, guides, or anything else) can be great sources of lead magnets for building your audience. But that said, you wouldn’t want these valuable resources to be available through Google search for people to find them easily, against downloading them through your forms.

And the same goes for websites in other segments; documents stored in PDF shouldn’t be available in search results unless otherwise, you intend to do.

While we are familiar with preventing your pages from getting indexed in search results using a Robots Meta tag, the same approach will not work for media files and PDF files.

So in this knowledgebase article, we will discuss about preventing your PDF files from showing up in search results.

    
## Table Of Contents

    

        
- [Why Noindex Robots Meta Directive Cannot Be Added to PDF Files?](#why)
        
- [How to Prevent PDF Files from Being Crawled?](#how-to)
            

                
- [Raise a Search Removal Request](#using-search-removal-request)
                
- [Disallow PDF Files Using robots.txt](#disallow-using-robots-txt)
                
- [Disallow PDF Files Using X-Robots-Tag](#x-robots-tag)
    

## 1  Why Noindex Robots Meta Directive Cannot Be Added to PDF Files?

The Robots Meta tag is added to the head of the page’s HTML code. With Rank Math, you can easily add it to your posts, pages, archive pages, and even your attachment pages because they’re all HTML.

But, PDF is not an HTML file and does not contain any HTML code; hence you **cannot add a NoIndex Robots Meta** tag to it.

If that’s even possible by any means — when your PDF files are accessed, they are not served through WordPress but directly by your server, and your WordPress plugins would not have control over it.

Hence, Rank Math (_or any other SEO plugin_) cannot add a Robots Meta directive to a PDF file.

But with that said, if your PDF files are already indexed in search results, or you want to prevent your PDF files from being crawled, the following methods will help you to do so.

## 2  How to Prevent PDF Files from Being Crawled?

### 2.1  Raise a Search Removal Request

Raising a removal request in Google Search Console is perhaps the quickest way to get your PDF files dropped from the index, and to raise a request, follow the exact steps we’ve discussed below.

#### 2.1.1  Open Search Console

Head over to [Google Search Console](https://search.google.com/search-console/about) and then log in to your account. If you haven’t already connected and verified your website in Google Search Console, then you can [let Rank Math do that for you](https://rankmath.com/kb/connect-your-google-account/).

Choose the correct property if you’ve multiple accounts connected with your Google Search Console.

![Open Google Search Console](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%201072'%3E%3C/svg%3E)

#### 2.1.2  Navigate to Removals Section

From the left sidebar, click the **Removals**section.

![removals section](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%201165'%3E%3C/svg%3E)

#### 2.1.3  Choose New Request

On the Removals page, click **New Request**.

![new request](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201002%20578'%3E%3C/svg%3E)

#### 2.1.4  Submit New Request

In the popup that appears on the screen, enter the PDF URL that you want to remove and then click **Next**.

![Submit new request for removal in Google Search Console](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201695%201192'%3E%3C/svg%3E)

In the next screen, confirm removing the URL by clicking the **Submit Request** button.

![Submit Request to remove URL from Google Search Console](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201422%20840'%3E%3C/svg%3E)

Once the request has been submitted, you can check the removal status in the Google Search Console.

![Temporary removal status in Google Search Console](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20995%20477'%3E%3C/svg%3E)

**Note:** This removal from the search index is only temporary for a set time period. As Google states, the content will not be indexed for six months. But to keep this PDF permanently out of Google’s search index, you’d need to block search engines from crawling the PDF using robots.txt.

### 2.2  Disallow PDF Files Using robots.txt

By using robots.txt, you can prevent your PDF file from being crawled. However, this will only prevent your page from being crawled and **_not indexing_**.

Only when someone links to your PDF file from an external site will search engines go ahead and index your file. Unless someone explicitly links, Google will not crawl your PDF and index your file. Now, let’s look at how to prevent your PDF from being crawled using robots.txt.

#### 2.2.1  Navigate to Your Robots.txt

Head over to **WordPress Dashboard → Rank Math SEO → General Settings → Edit Robots.txt**. If the Edit Robots.txt option isn’t available, then ensure you’re using the [Advanced Mode in Rank Math](https://rankmath.com/kb/advanced-mode/).

![edit robots.txt](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202338%201244'%3E%3C/svg%3E)

#### 2.2.2  Edit Robots.txt

And then, copy and paste the following code into the code editor. Make sure to replace `yoursite.com` with your domain name. The `Disallow: *.pdf` rule added here will instruct search engines not to crawl PDF files.

```
User-agent: *
Disallow: /wp-admin/
Disallow: *.pdf
Allow: /wp-admin/admin-ajax.php

Sitemap: https://yoursite.com/sitemap_index.xml
```

![Paste code in robots.txt to disallow PDF files](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202016%201330'%3E%3C/svg%3E)

If you’re using the PRO version, ensure that you select the **EDITOR**option before adding the rule to your `robots.txt` file, as shown below. Once you’re done, you can use the **Validate Code** button to return to the preview.

![Disallowing pdf files in Rank Math's robots.txt](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201132%20896'%3E%3C/svg%3E)

#### 2.2.3  Save Changes

Now, click the **Save Changes** button at the bottom of the screen to reflect the changes.

![Save Changes to robots.txt](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201536%20400'%3E%3C/svg%3E)

You can test and confirm using our [robots.txt Tester](https://rankmath.com/tools/robots-txt/) by clicking the link below your file to see if Googlebot can crawl and access your PDF file, as shown in the example below.

![Robots.txt tester link in your site](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201140%20721'%3E%3C/svg%3E)

### 2.3  Disallow PDF Files Using X-Robots-Tag

X-robots-tag is another method to prevent non-HTML files like PDFs from indexing. It is more complicated rather than the Robot Meta tag.

To prevent PDF files from using x-robots-tag, you’ll need to modify your website’s htaccess file, header.php, or require server-level modification.

If you’re using an Apache server, then add the following x-robots-tag in your website’s httpd.config file or htaccess file.

```
<Files ~ "\.pdf$">
Header set X-Robots-Tag "noindex, follow"
</Files>
```

And for the Nginx server, add the following x-robots-tag.

```
location ~* \.pdf$ 
{
add_header X-Robots-Tag "noindex, follow";
}
```

**Note:**Make sure to check [Google’s guidelines](http://developers.google.com/search/docs/crawling-indexing/robots-meta-tag) on x-robots-tag before making any modification to your website’s file.

And that’s it! We hope the above methods helped you prevent your PDF files from being crawled and get them dropped out of the search index. If you still have absolutely any questions about indexing your content, please feel free to [reach our support team directly from here](https://rankmath.com/support/), and we’re always here to help.

			

			 

			
	
		
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

		

										
			
- [How to Share Credentials Using the Rank Math Vault](https://rankmath.com/kb/how-to-use-vault/)

										
			
- [How to Create an AI Traffic Report in Google Analytics 4](https://rankmath.com/kb/create-ai-traffic-report/)

										
			
- [How to Disable Rank Math Meta Box from the Right Sidebar](https://rankmath.com/kb/disable-rank-math-meta-box/)

										
			
- [Migrating The Rank Math Support from Forum to Zendesk](https://rankmath.com/kb/support-migration-to-zendesk/)

										
			
- [How to Customize RSS Feed in WordPress](https://rankmath.com/kb/customize-rss-feed/)

										
			
- [How to Add Twitter Cards to WordPress](https://rankmath.com/kb/how-to-add-twitter-cards/)