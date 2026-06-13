# How to Fix the “og:image Property Should Be Explicitly Provided” Error

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/ogimage-property-should-be-explicitly-provided/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Fix the “og:image Property Should Be Explicitly Provided” Error

			
			

	

When [sharing a link on social media platforms](https://rankmath.com/kb/sharing-content-on-social-media/) like Facebook or Twitter, these platforms rely on Open Graph tags to display a preview.

If the `og:image` tag isn’t clearly set, you may see a warning stating that the image should be explicitly provided — even if one can be inferred.

In this knowledgebase article, we’ll explain why this happens and how to fix it using Rank Math.

## 1  What Does the “og:image Property Should Be Explicitly Provided” Error Mean?

When you share a URL on Facebook, the platform scans the page for Open Graph tags — which control how your content appears, including the title, description, and image.

If the page doesn’t have a clearly defined `og:image` tag, Facebook tries to infer one based on other elements. When that happens, you may see this warning:

```
Inferred PropertyThe 'og:image' property should be explicitly provided, even if a value can be inferred from other tags.
```

This warning indicates that Facebook couldn’t find a defined image tag and had to guess, which can lead to missing or incorrect link previews, reducing engagement and clicks.

Common reasons for this error include:

- No dedicated Open Graph image set for the post or page

- No fallback Open Graph thumbnail is configured in your SEO plugin

- The `og:image` tag appears too far down in the page source (beyond Facebook’s 50KB scan limit)

- Aggressive minification or inline CSS interfering with metadata output

## 2  How to Fix the “og:image Property Should Be Explicitly Provided” Error

To fix this, make sure the `og:image` tag is correctly added to your page. The easiest way to do this is by [using the Rank Math SEO plugin](https://rankmath.com/kb/how-to-setup/), which automatically generates Open Graph tags for your content.

Once Rank Math is installed and activated, open the post or page editor. Then, click the **Rank Math SEO** icon, as shown below.

![Click the Rank Math SEO icon](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20615'%3E%3C/svg%3E)

Next, click the Social tab icon, as shown below.

![](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20703'%3E%3C/svg%3E)

The snippet editor will open. Now, click **Add Image** and upload a dedicated image for social sharing. This ensures the `og:image` tag is included in the page’s HTML.

![Click Add Image](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20726'%3E%3C/svg%3E)

Once done, the snippet editor will display the image, as shown below.

![Sample of the social sharing image in the snippet editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%201938'%3E%3C/svg%3E)

To avoid the warning when no image is set manually, you can configure a fallback image. Go to **Rank Math SEO**→**Titles & Meta **→** Global Meta** and upload a Default OpenGraph Thumbnail. Rank Math will use this image automatically for any page that doesn’t have its own.

![Upload a Default OpenGraph Thumbnail](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201210%201399'%3E%3C/svg%3E)

You can confirm the tag is working by viewing your page source. Right-click on the page, select **View Page Source**, and search for `og:image`, as shown below.

![Find og:image in the page source](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20928%20585'%3E%3C/svg%3E)

Also, note that Facebook only scans the first 50KB of your HTML. If the tag appears too far down, often due to inline CSS or aggressive minification, it may be skipped.

Rank Math outputs metadata early in the page, so this usually isn’t an issue. You can also use [filters provided by Rank Math](https://rankmath.com/kb/filters-hooks-api-developer/#opengraph) to customize Open Graph output if needed.

If you still need help, feel free to reach out to [our support team](https://rankmath.com/support/) — we’re here to assist you.

			

			 

			
	
		
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