# How to Fix “Invalid object type for field ‘item'”

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/fix-invalid-object-type-error/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Fix “Invalid object type for field ‘item'”

			
			

	

Schema testing tools like the Rich Results Test tool and Schema Validator tool can help identify discrepancies with the added Schema Markup code. And if you’re running into an error **Invalid Object type for field ‘item’** while validating your Schema, then in this knowledgebase tutorial, we’ll show you how to debug the error and fix it.

## Table Of Contents

- [Identifying and Fixing the Schema Error](#identifying-and-fixing-the-schema-error)

- [Custom Schema](#custom-schema)

- [Breadcrumb Schema](#breadcrumb-schema)

## 1  Identifying and Fixing the Schema Error

Item is a Schema property that can be nested under [ListItem](https://schema.org/ListItem) or [DataFeedItem](https://schema.org/DataFeedItem) Schema types. The accepted value for Item is [Thing](https://schema.org/Thing), which is a generic Schema type and includes a number of properties.

Rank Math uses Item property in built-in Schema types like Breadcrumb Schema. But, as you know, with Rank Math PRO’s Custom Schema Generator, you can build any type of Schema and use it on your website effortlessly.

So, the first step in debugging is to identify the specific Schema type that is generating this error. If you’re able to identify the Schema type, then proceed further with this tutorial based on the Schema type.

## 2  Custom Schema

From the initial diagnosis, if you’re able to identify the Schema error is from a custom Schema that you’ve generated with [Custom Schema Generator](https://rankmath.com/kb/schema-generator/) / [Advanced Schema Editor](https://rankmath.com/kb/rich-snippets/#advanced-schema-editor-pro), then open the specific Schema with Rank Math.

As we mentioned, the item property accepts only Thing as its value, and here are the [accepted properties for the Thing](https://schema.org/Thing).

Now go through the properties you’ve nested under Item and check if it includes any property that violates the guidelines. If you’re able to locate any, then remove/replace it with an accepted property and value. Finally, check the generated Schema Markup to see if the issue gets resolved.

## 3  Breadcrumb Schema

If you drill down the issue to arise from Breadcrumb Schema, then refer to our [detailed KB on breadcrumbs](https://rankmath.com/kb/breadcrumbs/) to check if you’ve configured breadcrumbs correctly.

In case, If you’ve configured breadcrumbs as mentioned in our KB, but still receiving a Schema error, then it might be a conflict with your theme or other plugins installed on your website.

To confirm a theme/plugin conflict, you can follow the steps discussed below.

### 3.1  Install Health Check and Troubleshooting Plugin

To troubleshoot your website, install the **Health Check and Troubleshooting** plugin from the WordPress repository, as shown below.

![Install Health Check and Troubleshooting plugin](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201260%20473'%3E%3C/svg%3E)

### 3.2  Enable Troubleshooting Mode

Next, navigate to **Tools → Site Health → Troubleshooting** inside your WordPress admin area. Click the **Enable Troubleshooting Mode**.

![Choose Enable Troubleshooting Mode](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201280%20612'%3E%3C/svg%3E)

### 3.3  Enable Rank Math

In the troubleshooting mode, all the plugins would have been deactivated and switched to the default theme. Now enable Rank Math and Rank Math PRO as shown below.

![Enabling Rank Math and Rank Math PRO in troubleshooting mode](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201262%20522'%3E%3C/svg%3E)

For breadcrumbs to appear, you’d need to add the breadcrumbs function to the default theme’s template file.

Navigate to the **WordPress Dashboard → Appearance → Theme File Editor → header.php** (in case of Classic Theme).

![click header.php from Theme File Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201866%20533'%3E%3C/svg%3E)

Then add the below code.

```
/**
 * Use the following code in your theme template files to display breadcrumbs:
 */
<?php if (function_exists('rank_math_the_breadcrumbs')) rank_math_the_breadcrumbs(); ?>
```

Update the file to save the changes and now check the generated Schema Markup to see if you’re able to reproduce the error. If you’re able to, then open a support ticket and our support expert will have a look into the issue.

### 3.4  Check for Conflict with Theme

If the generated Schema Markup does not have any error, then switch to your current theme.

Ensure that the breadcrumbs function is added to your theme file, and then validate the Schema Markup code to see if you’re able to reproduce the error.

If you’re able to reproduce the issue, then you can confirm there is a conflict with your theme in adding the Breadcrumb Schema. And you should reach out to your theme’s support to get the issue resolved.

### 3.5  Check for Conflict with Plugins

In case, if you’re unable to reproduce the issue with the theme then:

- Enable one of the installed plugins

- Check the generated Schema Markup

If you’re able to reproduce the error, then the last activated plugin is the one causing the issue. If not, repeat these steps and activate other plugins one by one to identify the plugin that is conflicting with the Breadcrumb Schema.

Once you’ve confirmed a conflict with a plugin, consider reaching out to the plugin’s support team to get the issue resolved.

You can also refer to our knowledgebase article on how to confirm a [Theme/Plugin Conflict With Rank Math](https://rankmath.com/kb/check-plugin-conflicts/).

And, that’s it! If you have absolutely any questions or need any help in fixing this error, then please feel free to [reach our support team directly from here](https://rankmath.com/support/), and we’re always here to help.

			

			 

			
	
		
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