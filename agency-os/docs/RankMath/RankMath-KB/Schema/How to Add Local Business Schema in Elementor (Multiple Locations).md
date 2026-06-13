# How to Add Local Business Schema in Elementor (Multiple Locations)

> **Category:** Schema
> **Source:** https://rankmath.com/kb/add-localbusiness-schema-in-elementor/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Add Local Business Schema in Elementor (Multiple Locations)

			
			

	

If your business is located at multiple locations, then adding the Local Business Schema Markup to relevant location pages can improve your visibility in SERP.

Rank Math provides a user-friendly method for incorporating Schema Markup for multiple locations, and in this Knowledgebase article, we will guide you on how to add them in Elementor. So let’s get started.

**Note:** Ensure that you’ve [enabled the Local SEO module](https://rankmath.com/kb/how-to-set-up-aboutpage-schema/#enable-local-seo-and-schema-modules) on your WordPress Dashboard before proceeding with the first step.

## 1  Configure Local SEO Settings

Access your WordPress site and navigate to **Rank Math SEO → Titles & Meta → Local SEO.**

![Navigate to Local SEO module](https://rankmath.com/wp-content/uploads/2024/01/image-8.png)

Scroll down the settings to enable **Use Multiple Locations** and **Save**your Changes.

![Enable Use Multiple Locations option](https://rankmath.com/wp-content/uploads/2024/01/image-1.png)

## 2  Create a New Location for Your Business

Once you activate the “Use Multiple Locations” feature, Rank Math will create a new custom post type called “RM Locations,” allowing you to include various locations for your business or organization.

Head over to **RM Locations → All RM Locations** and click the **Add New Post** button above to add a new location.

![create new location](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201017%20383'%3E%3C/svg%3E)

Next, navigate to **Schema → Schema Generator**from the Rank Math Metabox. In the Schema Generator, click on the Schema Type – Local Business as shown below.

![navigate to Schema Generator](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20901%20214'%3E%3C/svg%3E)

Next, the Schema Builder will be accessible, enabling you to add relevant details about your business location. You can refer to a comprehensive guide on this process [here](https://rankmath.com/kb/multiple-locations/#new-location).

In the Schema Builder, copy the Local Business Schema Shortcode, as shown below.

![copy the shortcode](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20842%20626'%3E%3C/svg%3E)

## 3  Use Rank Math’s Local Business Shortcode

Now, to edit the location page using Elementor, click the “Edit with Elementor” button at the top of the page.

![Edit with Elementor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20109'%3E%3C/svg%3E)

On the Elementor editing page, search for **Shortcode** widget and drag it into the content area.

![click edit with Elementor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201262%20393'%3E%3C/svg%3E)

After dragging and dropping the Shortcode widget, there will be a field to paste the copied shortcode.

Before pasting the Local Business Schema Shortcode, filter it to display specific information. The shortcode typically resembles this:

```
[rank_math_local type='address/map/opening-hours/store-locator' locations='187']
```

It pulls location data and requires at least the “type” and “locations” attributes, with additional attributes available for customization.

For instance, if you want to display only the **address**of your business, rewrite the shortcode as follows:

```
[rank_math_local type='address' locations='187']
```

Refer to this [link](https://rankmath.com/kb/location-data-shortcode/)for more information on customizing the local business shortcode data.

Copy and paste this edited shortcode into the Elementor Shortcode widget field, as shown below. Finally, click on the “Apply” button.

![copy and paste the shortcode](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201144%20431'%3E%3C/svg%3E)

After saving your changes, click the ‘eye icon’ next to the Publish/Update button to preview your work.

![Click the eye icon](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20982%20318'%3E%3C/svg%3E)

That’s it! We hope this tutorial helped you add Local Business Schema markup to multiple locations using Rank Math in Elementor. If you have any further questions, please don’t hesitate to contact our [support team](https://rankmath.com/support/) — we’re available to assist you anytime.

			

			 

			
	
		
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