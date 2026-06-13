# How to Use Schema Markup Validator?

> **Category:** Schema
> **Source:** https://rankmath.com/kb/schema-markup-validator/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Use Schema Markup Validator?

			
			

	

With the rising competition, everyone wants to optimize their websites with rich snippets that will stand out on search engine results pages (SERP). And you shouldn’t miss this opportunity either.

To take advantage of these snippets, you will need to include Schema markup on your website, which helps search engines understand your content better. This, in turn, can lead to richer search results and potentially increased website traffic.

But how do you ensure your Schema markup is implemented correctly? Here’s where the **Schema Markup validator** comes in.

In this knowledgebase article, you will learn how to validate your Schema markup, ensuring your structured data is optimized for search engine success.

## 1  What is the Schema Markup Validator?

The [Schema Markup Validator](https://validator.schema.org/) is a free tool from Schema.org, a collaboration between major search engines like Google, Microsoft, Yahoo, and Yandex.

This tool is a reliable structured data checker that ensures your website’s Schema markup adheres to a standardized format that search engines understand. It supports various formats, such as JSON-LD, RDFa, and Microdata.

For instance, you can use this tool to identify any errors, inconsistencies, or non-compliance with Schema.org guidelines when adding structured data (Schema markup) to your website’s HTML code.

While the Schema Markup Testing Tool can validate any Schema type and identify potential errors, it doesn’t focus on Google-specific rich results features, and Google has a [dedicated tool to validate them](https://rankmath.com/kb/rich-results-test/).

## 2  Validating Your Schema Markup

To validate your page’s Schema markup, start by locating the Schema markup code implemented on your website, typically found within the webpage’s HTML.

For quick access, you can use Rank Math’s Code Validator tool to generate your site’s structured data in JSON-LD format. Here’s a [step-by-step guide](https://rankmath.com/blog/schema-markup/#add-schema) on how to do that.

Once the code is ready, proceed to the [Schema Markup Validator tool.](https://validator.schema.org/)

Here you can enter the webpage’s URL containing the markup in the designated field, as shown below.

![Test your webpages URL with the schema markup using the Schema Markup Validator tool](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20671'%3E%3C/svg%3E)

Alternatively, as illustrated below, you can copy and paste the Schema markup code directly into the validator’s input area.

![Test your schema markup code using the Schema Markup Validator tool](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20671'%3E%3C/svg%3E)

However, using the URL option is recommended, as it’s more convenient and accurate than the code option and reduces the chance of errors in the code.

After providing the URL or the code, click the**Run test**button to initiate the validation process.

## 3  Reviewing the Results

Once you’ve run the test, the Schema Markup Validator will analyze your code and display the results. On the left side, you’ll see the Schema markup you’ve included; on the right, you’ll find the analysis.

At this point, you need to review the results carefully to identify any errors or warnings. A perfect score of zero here indicates that there are no issues.

![Reviewing the schema markup results](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20664'%3E%3C/svg%3E)

In case you see any errors or warnings in the results, click on the item and slowly scroll to where the issue is highlighted.

![Detected error on Schema Validator](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20547'%3E%3C/svg%3E)

This will automatically point you to the exact part of the schema markup where the error started, making it easier to understand and fix. For example, the error shown below indicates that the `@type` value is missing. Without it, the system can’t properly interpret your schema.

![Unspecified type error](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20482'%3E%3C/svg%3E)

## 4  Fixing a Detected Error

To fix this, go to the page you’re testing on your site. If you’re using **Rank Math**, navigate to the **Schema** section and click the edit icon.

This will likely take you straight to the **Advanced Schema Editor**, especially if any manual changes were made earlier.

![Navigate to the Schema in Use in Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201078%20742'%3E%3C/svg%3E)

In the editor, scroll down and look for any area with a missing or empty property. In this case, it’s likely the `@type` value was accidentally removed from part of the Article schema.

![Article Schema missing type](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20865'%3E%3C/svg%3E)

Just re-enter the correct `@type` value in that field, then click the **Save for this Post**button at the bottom. After that, update the main content of the page or post in your WordPress editor.

![Add the missing @type property](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20878'%3E%3C/svg%3E)

Once that’s done, validate the page again. You should now see that the error has been resolved, as shown in the corrected example below.

![Fixed the unspecified type error in Schema Validator](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20550'%3E%3C/svg%3E)

That’s it! We hope this guide helped you learn how to validate your Schema markup. If you have any questions regarding Rank Math or implementing Schema Markup on your website, please feel free[to open a support ticket](https://rankmath.com/support/). Our support team is always here to assist you.

			

			 

			
	
		
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

										
			
- [What is WebSite Schema and How Do You Implement It?](https://rankmath.com/kb/website-schema/)

										
			
- [How to Implement sameAs Schema on Your Website](https://rankmath.com/kb/sameas-schema/)

										
			
- [How to Implement Author SEO on Your Website to Boost E-E-A-T](https://rankmath.com/kb/author-seo/)