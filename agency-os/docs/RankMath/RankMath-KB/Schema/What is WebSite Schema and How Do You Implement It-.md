# What is WebSite Schema and How Do You Implement It?

> **Category:** Schema
> **Source:** https://rankmath.com/kb/website-schema/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# What is WebSite Schema and How Do You Implement It?

			
			

	

Having a strong online presence is crucial for both businesses and individuals. However, simply having a website isn’t enough.

You need to ensure [search engines](https://rankmath.com/blog/best-search-engines/) understand your website and can effectively present it to users searching for relevant information. This is where **WebSite Schema** comes in.

In this knowledgebase article, we’ll explore WebSite Schema, why it matters, and how to implement it on your WordPress website.

## 1  What is WebSite Schema?

WebSite Schema is a structured data markup designed to provide search engines with detailed information about your website.

Typically found on the homepage and sometimes other pages, it includes crucial details such as the website’s URL and potential search actions users can perform.

The primary goal is to help search engines understand your [website’s structure](https://rankmath.com/blog/site-structure/) and navigation, leading to improved search engine visibility and more accurate indexing.

## 2  How Does WebSite Schema Work?

WebSite Schema helps search engines understand your website’s structure and content by using a specific vocabulary of tags (or microdata) that you can add to your HTML.

Here’s an example of WebSite Schema using JSON-LD and a brief description of its properties.

**Example of WebSite Schema Markup**

```
<script type="application/ld+json">
{
    "@context": "https://schema.org",
    "@type": "WebSite",
    "url": "http://example.com",
    "name": "Example",
    "potentialAction": {
      "@type": "SearchAction",
      "target": "http://example.com/search?q={query}",
      "query-input": "required name=query"
    }
}
</script>
```

## 3  Implementing WebSite Schema on Your Site

To add WebSite Schema to your site, you need to write the Schema markup and add it to your website’s HTML. However, with the Rank Math SEO plugin, you can easily implement WebSite Schema on your WordPress site without writing any code.

Simply install and [set up the plugin on your WordPress website](https://rankmath.com/kb/how-to-setup/). Once done, enable the Schema module by navigating to **Rank Math SEO → Dashboard**.

On the Modules tab, scroll down and enable the **Schema (Structured Data)** module, as shown below.

![Enabling Rank Math Schema (Structured Data)](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201371%20494'%3E%3C/svg%3E)

Once enabled, _Rank Math will automatically add the WebSite Schema markup to your site_. To verify this, navigate to your homepage’s edit page and locate the Rank Math meta box. Click on it and go to the Schema tab, as indicated below.

![Navigate to Rank Math meta box](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20578'%3E%3C/svg%3E)

When you access the Schema tab, you will notice that [Article Schema](https://rankmath.com/kb/article-schema/) is already used for the page.

Next, click the eye icon on the interface to view the Schema JSON-LD Code. Scroll down a bit, and you will find the WebSite Schema markup attached to it, as shown below.

![The WebSite Schema JSON-LD Code](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%201464'%3E%3C/svg%3E)

Alternatively, [inspect the source code](https://rankmath.com/kb/how-to-view-page-source/) of your homepage by right-clicking and selecting ‘View page source’ from the context menu.

![Click View Page Source](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20732'%3E%3C/svg%3E)

Then, use the keyboard shortcut Ctrl + F (Windows) or Command + F (Mac) to search for ‘@type’.

The first highlighted line will show the WebSite Schema markup implemented by Rank Math, as shown below.

![Implemented WebSite Schema markup ](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20352'%3E%3C/svg%3E)

**Test Your Markup**

After adding Schema markup, it’s crucial to test it using tools like [Schema Markup Validator](https://validator.schema.org/) to ensure everything is implemented correctly.

Simply paste your homepage URL or the JSON-LD code snippet from your homepage’s edit page in the provided field. For more details, refer to [our guide on how to use the Schema Markup Validator](https://rankmath.com/kb/schema-markup-validator/).

On the structured data detected, you will see the ‘Article’ option. Click to expand it.

![Verify implemented WebSite Schema markup](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20664'%3E%3C/svg%3E)

Once you’ve done that, you can use the CTRL+F keyboard shortcut to search for “WebSite” or scroll down a bit, and you will see the WebSite Schema you implemented.

![WebSite Schema on Schema Markup Validator](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20664'%3E%3C/svg%3E)

Remember to fix any errors or warnings if you see any.

That’s it. We hope you have learned about WebSite Schema and how to implement it on your website. If you still have questions about WebSite Schema or Rank Math, feel free to [contact our dedicated support team](https://rankmath.com/support/). We’re available 24/7, 365 days a year.

			

			 

			
	
		
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

		

										
			
- [How to Convert Time Duration to ISO 8601 Format](https://rankmath.com/kb/iso-8601-format/)

										
			
- [How to Get a YouTube API Key](https://rankmath.com/kb/how-to-get-a-youtube-api-key/)

										
			
- [How to Add Merchant Return and Shipping Policy in WooCommerce?](https://rankmath.com/kb/merchant-return-and-shipping-policy/)

										
			
- [How to Implement sameAs Schema on Your Website](https://rankmath.com/kb/sameas-schema/)

										
			
- [How to Implement Author SEO on Your Website to Boost E-E-A-T](https://rankmath.com/kb/author-seo/)

										
			
- [How to Add Profile Page Schema Markup?](https://rankmath.com/kb/profilepage-schema/)