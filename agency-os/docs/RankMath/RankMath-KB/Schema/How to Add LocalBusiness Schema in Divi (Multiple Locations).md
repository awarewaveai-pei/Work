# How to Add LocalBusiness Schema in Divi (Multiple Locations)

> **Category:** Schema
> **Source:** https://rankmath.com/kb/add-localbusiness-schema-in-divi/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Add LocalBusiness Schema in Divi (Multiple Locations)

			
			

	

If you have a business with multiple locations, you’ll want to ensure your website reflects that accurately. This includes adding your location information to each respective page and implementing Schema markup for better search engine visibility.

Thankfully, combining Divi with Rank Math makes this process relatively straightforward. In this knowledgebase article, we will guide you on adding multiple locations with Schema in Divi using Rank Math.

**Note:** Ensure the [Local SEO module is enabled](https://rankmath.com/kb/how-to-set-up-aboutpage-schema/#enable-local-seo-and-schema-modules)on your WordPress Dashboard before moving to the initial step.

## 1  Configure Local SEO Settings

Log in to your WordPress website and head over to **Rank Math SEO → Titles & Meta → Local SEO**.

![Local SEO settings](https://rankmath.com/wp-content/uploads/2023/12/image-8.png)

Scroll down to enable **Use Multiple Locations** and **Save**your Changes.

![Enable Use Multiple Locations option](https://rankmath.com/wp-content/uploads/2023/12/image-2.png)

## 2  Create Your New Locations

After activating the “Use Multiple Locations” feature, Rank Math will generate a new custom post type named “RM Locations” enabling you to add multiple locations for your business or organization.

Navigate to **RM Locations → All RM Locations**and click the **Add New Post** button above.

![create new post](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201017%20383'%3E%3C/svg%3E)

Next, navigate to **Schema → Schema Generator**from the Rank Math Metabox.

Within the Schema Generator, select the Schema Type labeled “Local Business” as indicated below.

![Select Local Business Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20901%20214'%3E%3C/svg%3E)

Next, the Schema Builder will open, allowing you to input pertinent details about your business location. You can find a comprehensive guide on this process [here](https://rankmath.com/kb/multiple-locations/#new-location).

Within the Schema Builder, copy the Local Business Schema Shortcode, as demonstrated below.

![copy the Shortcode](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20842%20626'%3E%3C/svg%3E)

Before moving on to the next step, enter your business location information in the Schema Builder and copy the generated Shortcode.

## 3  Use Rank Math’s Local Business Shortcode

Now, to edit the location page using Divi builder, click the **Use The Divi Builder** button.

![Click Use the Divi Builder option](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201195%2060'%3E%3C/svg%3E)

In the Divi Editor, add a new module by clicking on the plus icon and then search for **Code**.

![click the Use The Divi Builder button.](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201145%20445'%3E%3C/svg%3E)

Now, paste the copied shortcode in the blank field on the Code module.

Before pasting the Local Business Schema Shortcode, edit it to display specific details. The shortcode typically takes the form of:

```
[rank_math_local type='address/map/opening-hours/store-locator' locations='187']
```

It requires location data and must include “type” and “locations” (which is the post ID of the location page) attributes, with additional attributes available for customization.

For example, if you wish to exclusively showcase your business address, modify the shortcode as follows:

```
[rank_math_local type='address' locations='187']
```

Refer to this [link](https://rankmath.com/kb/location-data-shortcode/) for more information on customizing the local business shortcode data.

As illustrated below, paste this revised shortcode into the Divi Code module field. Finally, **Save** the module, as shown below.

![Save module](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20991%20611'%3E%3C/svg%3E)

Now, the preview of the location shortcode will be displayed. If all the essential details are included, click the **Save** button to publish the changes.

![click Save button](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201340%20476'%3E%3C/svg%3E)

And that’s it! This is how you can add multiple locations with Schema in Divi using Rank Math. We hope this tutorial helped you add Schema markup to multiple locations using Rank Math in Divi.

If you have any further questions, please don’t hesitate to contact our [support team](https://rankmath.com/support/)—they’re available to assist you anytime.

			

			 

			
	
		
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