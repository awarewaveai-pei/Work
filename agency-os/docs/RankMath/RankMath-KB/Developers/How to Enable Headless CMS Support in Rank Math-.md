# How to Enable Headless CMS Support in Rank Math?

> **Category:** Developers
> **Source:** https://rankmath.com/kb/headless-cms-support/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Enable Headless CMS Support in Rank Math?

			
			

	

Headless CMS includes only the back-end functionalities (_creation and storage of your content_) and makes use of REST API or GraphQL API to display content on the front-end. This gives the opportunity to make use of modern web technologies for the front-end, while the back-end makes use of a dedicated content management system.

If your website makes use of WordPress as the headless CMS, thankfully, Rank Math offers a REST API endpoint to support headless CMS. So you can make use of this feature and let Rank Math take care of the technical SEO aspects of your website while your website can use any modern web technologies without worrying about SEO.

**Note:** This tutorial is intended for developers and users who are familiar with handling headless websites.

GraphQL is a powerful tool that allows you to query and mutate data. However, it can be tricky to set up and use. Rank Math does not currently support GraphQL out of the box, but you can create a new GraphQL integration [WPGraphQL plugin](https://wordpress.org/plugins/wp-graphql/). This will allow you to query and mutate your data more easily.

## 1  Headless CMS Support in Rank Math

In this knowledgebase article, we’ll walk you through how to enable headless CMS support in Rank Math, and you can get started by following the steps discussed below.

### 1.1  Navigate to Rank Math General Settings

Start by heading over to **Rank Math SEO → General Settings → Others** inside your WordPress admin area. If the Others tab is unavailable for you, then ensure that you’re [using Rank Math in advanced mode](https://rankmath.com/kb/advanced-mode/).

![Enable Rank Math General Settings - Others section](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20900%20432'%3E%3C/svg%3E)

### 1.2  Enable Headless CMS Support

Then, enable the **Headless CMS Support** option, as shown below.

![Enable Headless CMS support](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201490%20304'%3E%3C/svg%3E)

### 1.3  Save Changes

Finally, click the **Save Changes** button at the bottom of the screen to reflect the changes.

![Save changes in Rank Math others settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201530%20300'%3E%3C/svg%3E)

### 1.4  Rank Math REST API Syntax

Now you’ll be able to send a GET request to our REST API endpoint for a specific URL, and the API will return the meta tags added by Rank Math for that URL.

To send a request, use our `getHead` REST endpoint, followed by the URL of the webpage. You can add your posts/categories/user pages or any internal URL and even invalid URLs like 404s/other errors. Here is an example of how to create a request.

```
https://your-domain.com/wp-json/rankmath/v1/getHead?url=https://your-domain.com/hello-world
```

Make sure to replace `your-domain.com` with your website’s domain and then `https://your-domain.com/hello-world` with your URL. The data will now be returned in a JSON format that contains,

- `success` – returns `true` on successful retrieval

- `head` – contains the HTML tags added by Rank Math

Now, you can use the head data in your favourite front-end web app and still take advantage of Rank Math’s on-page optimization.

## 2  Allow Firewall to Access Rank Math’s REST Endpoint

If you’re unable to access Rank Math’s REST endpoint, it is possible that your website uses any security plugin that blocks your access to Rank Math’s endpoint. To ensure that you can retrieve the meta tags with this method, you’ll need to whitelist the following REST API endpoint in your firewall.

```
https://example.com/wp-json/rankmath/v1/getHead
```

If you’re using [Wordfence](https://rankmath.com/kb/whitelist-rank-math-in-wordfence/#whitelisting-rank-math-in-wordfence) or [Cloudflare](https://rankmath.com/kb/meta-data-not-saving/#whitelist-rankmath-cloudflare), you can follow our dedicated tutorials to whitelist Rank Math’s REST API endpoints.

## 3  Fixing Errors with REST API Endpoint

In case you’re receiving an error message while attempting to retrieve meta tags, the following steps will help you resolve them.

### 3.1  No Route Was Found Matching the URL and Request Method

![Rest no route](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201000%20254'%3E%3C/svg%3E)

You are bound to see this error message when you’re trying to access the REST API endpoint without enabling the Headless CMS support in Rank Math. To enable the support, head over to **Rank Math SEO → Dashboard →** **Others** and enable the **Headless CMS support** option as we described earlier in this tutorial.

### 3.2  Invalid Parameter(s) URL

You’ll likely see this error if the added URL is incomplete or empty. The URL parameter looks for a full URL (_for instance, the current page’s URL should be used as,_ `https://rankmath.com/kb/headless-cms-support/`), and instead, if you’re using only slugs (_like_ `/headless-cms-support/`) the API endpoint will return this error.

![Invalid parameters URL](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20836%20532'%3E%3C/svg%3E)

### 3.3  Missing Parameter(s) URL

This error message is seen when your request does not include the URL parameter as described.

![Missing parameter(s) URL in Rest API](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20842%20496'%3E%3C/svg%3E)

Here is an example of how you can request data from the endpoint and make sure to include the URL parameter that follows the `getHead` endpoint.

```
https://your-domain.com/wp-json/rankmath/v1/getHead?url=https://your-domain.com/blog/
```

## 4  Frequently Asked Questions

### How to retrieve the canonical URL or any specific meta tag using the REST API?

Our REST API endpoint does not currently support the direct retrieval of specific meta tags. However, you can obtain the entire metadata and then extract the desired meta tag from it.

So, If you need a specific meta tag, you have to call the entire metadata first and then proceed to extract the meta tag you require.

And, that’s it! We hope the tutorial helped you retrieve your page’s HTML tags added by Rank Math. If you still have absolutely any questions, please feel free to [reach our support team directly from here](https://rankmath.com/support/), and we’re always here to help.

			

			 

			
	
		
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

		

										
			
- [How to Use Rank Math MCP Tools](https://rankmath.com/kb/mcp-tools/)

										
			
- [Why We’re Moving Rank Math Modules to React (And What It Means for You)](https://rankmath.com/kb/react-migration/)

										
			
- [How to Customize Breadcrumbs in Rank Math](https://rankmath.com/kb/customize-breadcrumbs-in-rank-math/)

										
			
- [Rank Math SEO Filters and Hooks for Developers](https://rankmath.com/kb/filters-hooks-api-developer/)

										
			
- [How to Make Your Theme Rank Math Compatible](https://rankmath.com/kb/make-theme-rank-math-compatible/)

										
			
- [How to Skip Rank Math Registration for Development Purposes](https://rankmath.com/kb/skip-rank-math-registration/)