# Setting a Custom Brand for Your WooCommerce Store with Rank Math

> **Category:** Schema
> **Source:** https://rankmath.com/kb/woocommerce-custom-brand-schema/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Setting a Custom Brand for Your WooCommerce Store with Rank Math

			
			

	

In this knowledgebase article, we’ll show you how to set a custom brand for your WooCommerce Store using Rank Math.

## Table Of Contents

- [How to Set Custom Brand Name?](#how-to-set-custom-brand-name-pro)

- [How to Set Custom Brand Name Using Filter?](#how-to-set-custom-brand-name-using-filter)

## How to Set a Custom Brand Name? [PRO](https://rankmath.com/pricing/)

In Rank Math’s WooCommerce settings, which can be found by navigating to **Rank Math SEO → General Settings **→** WooCommerce** in your WordPress admin area, you’ll find a dropdown menu for the **Select Brand**setting.

Rank Math has added a **Custom**option in it. This option will add the custom Brand Name to the [Product Schema](https://rankmath.com/kb/product-schema/). This is useful if you’re seeing brand name-related warnings in Google’s Schema testing tools or in your Search Console.

If you want to use custom value for your brand then select the Custom option from the drop-down list.

![Custom Option in Rank Math](https://rankmath.com/wp-content/uploads/2021/01/Custom.jpg)

Once you select Custom you’ll be able to add a Brand value that you want to use in Schema.org and OpenGraph markup. Once done **save**your changes.

![Add Brand Value](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201528%20512'%3E%3C/svg%3E)

Adding the brand value fixes the below warning:

![Fix the warning by adding Brand Value](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201356%201094'%3E%3C/svg%3E)

After adding a custom brand name your product’s page source will look like this:

![Custom Option in Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201262%20986'%3E%3C/svg%3E)

## How to Set Custom Brand Name Using Filter?

If you’re using the Rank Math free version, then you may not see the Custom option under the **Select Brand** setting as shown above. In that case, you can simply use a filter to set your custom brand name by following the steps discussed below.

### 1  Navigate to the Theme File Editor

Head over to **Appearance → Theme File Editor** (for Classic Theme) from your WordPress admin area.

![Navigate to Theme File Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20900%20359'%3E%3C/svg%3E)

In the case of Block Theme, navigate to **WordPress Dashboard → Tools → Theme File Editor**, as shown below.

![Theme File Editor in Block Theme](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20988%20528'%3E%3C/svg%3E)

Then, choose [rank-math.php](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file) from the list of theme files shown on the right side of the screen.

![Open rank-math.php in theme file editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201265%20724'%3E%3C/svg%3E)

Or, navigate to **Tools → Theme File Editor**from the WordPress dashboard (for Block Themes). And, add the code to the `rank-math.php` file from the theme files. Then save the settings by simply clicking the **Update File** button.

### 2  Add the Code Snippet

In the code editor (_displayed in the middle of your screen_), copy-paste the following code snippet. Make sure to replace `Rank Math` with your brand name in the code snippet.

```
/**
 * Filter to add custom Brand for WooCommerce Products.
 * 
 * @param array $entity Snippet Data
 * @return array
 */
add_filter( 'rank_math/snippet/rich_snippet_product_entity', function( $entity ) {
    $entity['brand']['@type'] = 'Brand';    
    $entity['brand']['name'] = 'Rank Math';
    return $entity;
});
```

And then click the **Update File** button.

![Add code snippet for custom brand name](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201115%20630'%3E%3C/svg%3E)

### 3  Check Schema Markup

Now you can check your page with Google’s Rich Results Testing Tool to see if your brand name has been added.

![Custom brand name added to WooCommerce Product Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201274%201197'%3E%3C/svg%3E)

And, that’s it! This is how Rank Math allows you to add a custom name to your brand easily. Hence we strongly recommend you install the [Rank Math plugin](https://rankmath.com/kb/how-to-setup/) and enjoy its features. If you still have absolutely any questions, please feel free to [reach our support directly from here](https://rankmath.com/support/), and we’re always here to help.

			

			 

			
	
		
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