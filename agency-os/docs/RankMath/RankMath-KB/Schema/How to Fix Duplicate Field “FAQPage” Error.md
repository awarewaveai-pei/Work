# How to Fix Duplicate Field “FAQPage” Error

> **Category:** Schema
> **Source:** https://rankmath.com/kb/fix-duplicate-field-faqpage-error/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Fix Duplicate Field “FAQPage” Error

			
			

	

If you’re reading this, you’ve probably encountered a Duplicate Field “FAQPage” error in Google Search Console or [the Rich Results Test tool](https://search.google.com/test/rich-results).

**Note:**Google has deprecated the FAQPage Schema and no longer displays it as a rich result. Google Search Console is also phasing out the associated rich result and error reports, including errors such as Duplicate field “FAQPage.”

![Duplicate Field “FAQPage” Error sample](https://rankmath.com/wp-content/uploads/2023/09/Duplicate-Field-FAQPage-Error-sample.png)

The Duplicate Field “FAQPage” error indicates the presence of multiple FAQ Schema in your content. As per [Google guidelines](https://developers.google.com/search/docs/appearance/structured-data/faqpage#faq-page), a post or page should have a maximum of one FAQ Schema. Fortunately, you can quickly resolve this error by deleting the duplicate FAQ Schema.

In this knowledgebase, we will show you how to identify and delete the duplicate FAQ Schema.

## Table Of Contents

- [Disable the Duplicate FAQ Plugin](#disable-faq-plugin)

- [Delete the FAQ Block or Schema](#delete-faq-block-or-schema)

- [Disable the FAQ Schema in the Elementor Builder](#disable-elementor-faq-schema)

## 1  Disable the Duplicate FAQ Plugin

You should only have one plugin generating your [FAQ Schema](https://rankmath.com/blog/faq-schema/). If you’ve another plugin generating FAQ Schema Markup apart from Rank Math, then head over to **WordPress Dashboard **→** Plugins** and delete any other plugin generating FAQ Schema.

**Note:**If you cannot identify the plugin generating the duplicate FAQ Schema, deactivate your plugins one after another while testing the affected URL [using the Rich Results Test tool](https://rankmath.com/kb/rich-results-test/).

![Click Plugins](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20655'%3E%3C/svg%3E)

## 2  Delete the FAQ Block or Schema

Rank Math PRO members can add frequently asked questions to their content using:

- [The Schema Generator](https://rankmath.com/kb/faq-schema-block/#schema-generator)

- [The FAQ by Rank Math Block](https://rankmath.com/kb/faq-schema-block/)

If you are a PRO member, you should add your frequently asked questions using one of the two methods. Using both will cause Google to return a Duplicate Field “FAQPage” error. Thankfully, you can quickly solve this by deleting one of the FAQ Schemas.

**Note:**We recommend you delete the Schema Generator FAQ Schema.

### 2.1  Delete the Schema Generator FAQ Schema

#### 2.1.1  Using the Block Editor

First, head over to the affected post or page and click the **Rank Math SEO**icon, as shown below.

![Click the Schema icon in the Block editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201330%20522'%3E%3C/svg%3E)

Next, click the **Schema** icon. The ‘Schema in Use’ section lists the Schema Markups on the post or page. If the FAQ Schema is present, click the **Delete** icon, as shown below.

![Click the Bin icon](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201246%201016'%3E%3C/svg%3E)

Once done, head over to the content and delete the shortcode of the deleted FAQ Schema.

![Delete the shortcode block](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201270%20476'%3E%3C/svg%3E)

#### 2.1.2  Using the Classic Editor

If you use the Classic Editor, scroll to the Rank Math SEO Meta Box and click the **Schema**icon. Then, head to the FAQ Schema and click the **Delete** icon, as shown below.

![Click the Schema icon in the Classic Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20655'%3E%3C/svg%3E)

Next, head to the content and delete the FAQ Schema shortcode, as shown below.

![Delete the FAQ Schema shortcode in the Classic Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20655'%3E%3C/svg%3E)

### 2.2  Delete the FAQ by Rank Math Schema

**Note:**If you want to continue using the FAQ by Rank Math block but do not want it to create a FAQ Schema, add the below filter to your site. You can refer to this guide on [adding filters to WordPress](https://rankmath.com/kb/wordpress-hooks-actions-filters/).

```
remove_filter( 'rank_math/schema/block/faq-block', [ RankMath\Schema\Block_FAQ::get(), 'add_graph' ] );
```

If you prefer to delete the FAQ by Rank Math block and its Schema, head over to the content using the WordPress Block Editor. Once done, scroll to the FAQ block and click the three dots in the block toolbar. Next, click **Delete**, as shown below.

![Select Remove FAQ by Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201038%20526'%3E%3C/svg%3E)

## 3  Disable the FAQ Schema in the Elementor Builder

Rank Math and Elementor can both generate FAQ Schema Markups. If you have both, you can disable one from creating a FAQ Schema.

To do that, head to **WordPress Dashboard ****→****** **Posts**or **Pages**. Once done, navigate to the affected post or page, and hover over it. Then, click **Edit with Elementor**, as shown below.

![Click Edit with Elementor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20655'%3E%3C/svg%3E)

In the Elementor sidebar, click **Elements**and then **General**, as shown below.

![Click Elements and General](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20646'%3E%3C/svg%3E)

In the options available under General, click **Accordion**.

![Click Accordion](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20646'%3E%3C/svg%3E)

Next, scroll down and disable one of **FAQ Schema**and **Add FAQ Schema Markup**.

- **FAQ Schema** controls the Elementor FAQ Schema

- **Add FAQ Schema Markup** controls the Rank Math FAQ Schema

Once done, click **UPDATE**, as shown below.

![Click Update](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20646'%3E%3C/svg%3E)

We hope you are able to fix the Duplicate Field “FAQPage” error. If you have any questions about fixing the error – you’re always welcome to [contact our dedicated support team](https://rankmath.com/support/). We’re available 24/7, 365 days a year…

			

			 

			
	
		
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