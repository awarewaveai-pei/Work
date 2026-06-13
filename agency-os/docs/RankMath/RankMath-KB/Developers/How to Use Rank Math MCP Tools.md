# How to Use Rank Math MCP Tools

> **Category:** Developers
> **Source:** https://rankmath.com/kb/mcp-tools/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Use Rank Math MCP Tools

			
			

	

Rank Math provides AI-ready SEO abilities that let you optimize content, perform SEO tasks, and access Rank Math data directly from your AI assistant. These abilities can be accessed through compatible AI integrations, including the WordPress MCP adapter.

In this knowledgebase article, we will show you how to complete SEO tasks using the tools available in Rank Math MCP.

## In this article, we’ll cover:

- [Available Rank Math MCP Tools](#available-mcp-tools)

- [How to Complete SEO Tasks With Rank Math MCP](#complete-seo-tasks-with-mcp)

- [Run an SEO Audit of Your Site](#run-seo-audit)

- [Fix Failed SEO Tests From the Audit](#fix-failed-seo-test)

- [Run an SEO Audit of a Competitor’s Site](#run-competitors-seo-audit)[PRO](https://rankmath.com/pricing/)

- [Retrieve Schema Markup From Your Posts](#retrieve-schema-markup)

- [Retrieve Your Post’s SEO Metadata](#retrieve-post-seo-meta)

- [Retrieve Links From Your Post](#retrieve-links-from-post)

- [Check the Status of Links Across Your Site](#check-link-status-across-site)

## 1  Available Rank Math MCP Tools

An MCP tool is a command that lets your AI assistant communicate with specific features in Rank Math. The available MCP tools include:

- `rank-math/audit-site-seo`: Lets you run an SEO audit for your URL, site, or a competitor’s site

- `rank-math/fix-site-seo`: Lets you fix the tests that failed the SEO audit

![Overview of the Rank Math MCP tools](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20804'%3E%3C/svg%3E)

## 2  How to Complete SEO Tasks With Rank Math MCP

Here are the SEO tasks you can complete using Rank Math MCP.

- Run an SEO audit of your site

- Fix failed SEO tests From the audit

- Run an SEO audit of a competitor’s site

- Retrieve Schema markup from your posts

- Retrieve your post’s SEO metadata

- Retrieve links from your post

- Check the status of links across your site

### 2.1  Run an SEO Audit of Your Site

The Run SEO Audit MCP tool (`rank-math/audit-site-seo`) instructs Rank Math to run a detailed SEO audit on your site. Once complete, Rank Math passes the result to your AI assistant, which uses it to generate a detailed report for you.

To run an SEO test, prompt your AI assistant to run an SEO audit.

![Prompt your AI assistant to run an SEO audit](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20815'%3E%3C/svg%3E)

Rank Math will run your SEO tests and return its results to your AI assistant, which generates a report for you.

![Overview of your SEO audit result](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20816'%3E%3C/svg%3E)

### 2.2  Fix Failed SEO Tests From the Audit

The Fix SEO Test MCP tool (`rank-math/fix-site-seo`) instructs Rank Math to fix the failed SEO tests. This tool comes in handy after you’ve run an SEO audit. The SEO tests that can be fixed include:

- **Blog public:** This sets your blog’s visibility to public

- **Permalink structure:** This sets the permalink structure to `/%postname%/`

- **Site tagline**: This updates the site’s tagline to that provided by the user or AI assistant

- **Sitemaps:** This enables the Sitemap module

- **Schema:** This enables the Schema module

- **Noindex meta:** This sets the `robots_global` value in the Titles & Meta settings to `index`

- **Robots.txt:** This adds the default Disallow rules to the robots.txt file

- **Missing focus keywords:** This sets the post title as the focus keyword of posts without one

To get started, enter a relevant prompt into your AI assistant and instruct it to fix the failed SEO tests.

![Prompt your AI assistant to fix your SEO tests](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20815'%3E%3C/svg%3E)

Your AI assistant will fix the supported SEO tests using MCP.

![Overview of the fixed SEO test result](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20815'%3E%3C/svg%3E)

Some tests, such as adding a site tagline, require input from your end. In this instance, you can prompt your AI assistant to suggest a relevant site tagline, then instruct it to add it to your site. It will do so and return a success message, as shown below.

![Sample of the site tagline fixed using Rank Math MCP](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20809'%3E%3C/svg%3E)

### 2.3  Run an SEO Audit of a Competitor’s Site [PRO](https://rankmath.com/pricing/)

The Run SEO Audit MCP tool also lets Rank Math to run a detailed SEO test on your competitor’s site. This is helpful when you want to understand how well a competitor’s site is faring or how your site compares against theirs.

To get started, instruct your AI assistant to analyze a competitor’s site or even compare yours against theirs. For example, let us prompt our AI assistant to compare our site with another site.

![Prompt your AI assistant to audit your competitor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20810'%3E%3C/svg%3E)

Once done, your AI assistant will return a comparison of your site and your competitor’s site.

![Overview of your competitor's audit result](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20811'%3E%3C/svg%3E)

### 2.4  Retrieve Schema Markup From Your Posts

The Get Post Schema MCP tool (`rank-math/get-post-schema`) lets your AI assistant retrieve the Schema already applied to your post, as well as other Schema types available in Rank Math that can be applied to your content.

This ensures your AI assistant is aware of the Schema already applied on your post. It also ensures your AI assistant can suggest relevant additional Schema to include in your content.

**Note:**If you use Rank Math Free, the tool will only return Schema types available to free users, while Rank Math PRO users will see both free and PRO Schema types.

### 2.5  Retrieve Your Post’s SEO Metadata

The Get Post SEO Meta MCP tool (`rank-math/get-post-seo-meta`) lets your AI assistant retrieve your post’s SEO metadata. This includes its title, description, focus keyword, robots settings, canonical URL, OpenGraph metadata, Twitter Card metadata, and SEO score.

This gives your AI assistant full visibility into your post’s SEO setup and helps it to understand what is already configured, how it may be performing, and what is missing.

### 2.6  Retrieve Links From Your Post

The Get Post Links MCP tool (`rank-math/get-post-links`) lets your AI assistant retrieve all internal and external links in your posts. This includes the post’s total link count along with each link’s URL, anchor text, and follow status.

This gives your AI assistant a clear picture of your post’s link profile. This helps it to avoid duplicating URLs or anchor texts already in the content, and uncover link opportunities relevant to your post.

### 2.7  Check the Status of Links Across Your Site

The Get Link Report MCP tool (`rank-math/get-link-report`) lets your AI assistant retrieve the status of the links across your site.

- For Rank Math Free users, your AI assistant can identify posts without internal or external links, as well as retrieve the number of the internal and external links on your site

- Rank Math PRO users get all of that, plus a comprehensive link audit that includes the total number of broken links and redirect chains, as well as the follow status of the links, and their HTTP status

This helps your AI assistant assess the health of your links and identify opportunities for improvement. For example, your AI assistant can use this tool to detect broken links before suggesting whether to remove or redirect hem.

That is how to use the available Rank Math MCP tools to complete SEO tasks directly from your AI assistant. If you have any questions, you’re always more than welcome to [contac](https://rankmath.com/support/)[t](https://rankmath.com/support/)[our dedicated support team](https://rankmath.com/support/), who are available 24/7, 365 days a year.

			

			 

			
	
		
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

		

										
			
- [Why We’re Moving Rank Math Modules to React (And What It Means for You)](https://rankmath.com/kb/react-migration/)

										
			
- [How to Customize Breadcrumbs in Rank Math](https://rankmath.com/kb/customize-breadcrumbs-in-rank-math/)

										
			
- [Rank Math SEO Filters and Hooks for Developers](https://rankmath.com/kb/filters-hooks-api-developer/)

										
			
- [How to Make Your Theme Rank Math Compatible](https://rankmath.com/kb/make-theme-rank-math-compatible/)

										
			
- [How to Enable Headless CMS Support in Rank Math?](https://rankmath.com/kb/headless-cms-support/)

										
			
- [How to Skip Rank Math Registration for Development Purposes](https://rankmath.com/kb/skip-rank-math-registration/)