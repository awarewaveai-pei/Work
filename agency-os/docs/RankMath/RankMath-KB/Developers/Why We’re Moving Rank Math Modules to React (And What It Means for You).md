# Why We’re Moving Rank Math Modules to React (And What It Means for You)

> **Category:** Developers
> **Source:** https://rankmath.com/kb/react-migration/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Why We’re Moving Rank Math Modules to React (And What It Means for You)

			
			

	

We are currently transitioning the code that powers some of our modules and pages to React. There will be no changes from your end, and you will continue to use Rank Math as usual.

However, we decided to create this knowledgebase article to give you a heads-up on what we are doing, why we are doing it, and how it will benefit you.

## Why Are We Moving Our Modules to React?

Rank Math was built from the ground up to be light and fast. We achieved this by optimizing our code and incorporating modules that allow you to enable or disable the functionalities available in Rank Math, depending on your needs.

**We are now migrating the code that powers our modules and pages to React.**

These modules were originally written using [Custom Meta Boxes 2 (CMB2)](https://github.com/CMB2/CMB2), a PHP-based library. React is a JavaScript-based library and allows us to reuse code across multiple areas of Rank Math. This speeds up development and makes our code easier to maintain. It also means our ZIP files will be smaller and efficient.

## How Does the Move from PHP to React Benefit You?

This transition makes our codebase even more lightweight, meaning Rank Math will consume fewer server resources and have less impact on your site’s performance.

Currently, the ZIP files for our Free and PRO versions total just **11.8 megabytes**, which is already smaller than that of similar plugins, which is remarkable considering **we offer more features than the competition**.

![Rank Math file size compared to other plugins](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20636'%3E%3C/svg%3E)

As we complete the React migration, these files will shrink further, leading to faster response times, reduced hosting costs, and improved scalability for high-traffic sites, all while maintaining our powerful features.

React also brings noticeable improvements to your experience. It’s more dynamic and intuitive than CMB2 or PHP, making it easier to navigate, especially for non-technical users. It allows your settings to update in real-time without requiring you to reload the page. This is particularly helpful for dynamic and conditional fields that can be shown, hidden, or changed depending on your settings.

React will also enhance compatibility and minimize conflicts with the other themes and plugins on your site. CMB2, for its part, can cause conflict when you run different versions on your site. However, with React, you will see improved compatibility and fewer conflicts.

Lastly, the transition from CMB2 to React allows your site to better integrate with WordPress. [WordPress is transitioning its admin panel to React](https://github.com/WordPress/gutenberg/issues/53322). So, it makes sense to switch to React to ensure compatibility with WordPress once it fully transitions to React in the future.

## What to Expect

The process of switching your Rank Math modules from PHP to React will be seamless. You probably wouldn’t even know it happened. So, you should not experience any issues and can continue using Rank Math as you normally would.

And if you happen to face any issues like a blank screen (which could be caused by incompatibility with other plugins or themes installed on your site), then you can disable the React UI and revert to the previous CMB2 library.

You can do that by heading over to the **Rank Math SEO → Dashboard → Modules** from your WordPress dashboard and disabling the **React Settings UI** module from here.

![React Settings UI](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20924%20355'%3E%3C/svg%3E)

**Note:** Disabling the module is a temporary workaround, and the option will be removed in the future. Hence, we recommend [reaching out to our support team](https://rankmath.com/support/) for further debugging this issue.

And, that’s it! If you encounter any issues, you are always welcome to [contact our dedicated support team](https://rankmath.com/support/). We’re available 24/7, 365 days a year.

			

			 

			
	
		
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

										
			
- [How to Customize Breadcrumbs in Rank Math](https://rankmath.com/kb/customize-breadcrumbs-in-rank-math/)

										
			
- [Rank Math SEO Filters and Hooks for Developers](https://rankmath.com/kb/filters-hooks-api-developer/)

										
			
- [How to Make Your Theme Rank Math Compatible](https://rankmath.com/kb/make-theme-rank-math-compatible/)

										
			
- [How to Enable Headless CMS Support in Rank Math?](https://rankmath.com/kb/headless-cms-support/)

										
			
- [How to Skip Rank Math Registration for Development Purposes](https://rankmath.com/kb/skip-rank-math-registration/)