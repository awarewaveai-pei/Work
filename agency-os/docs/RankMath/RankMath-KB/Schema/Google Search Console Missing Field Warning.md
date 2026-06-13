# Google Search Console Missing Field Warning

> **Category:** Schema
> **Source:** https://rankmath.com/kb/either-offers-review-or-aggregaterating-should-be-specified/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Google Search Console Missing Field Warning

			
			

	

If you see the warning**“Missing field”** in your [Google Search Console](https://search.google.com/search-console/about) or [Google Rich Results Test](https://search.google.com/test/rich-results) and wonder what it means, we’re here to break it all down for you. In this knowledgebase article, we’re going to walk you through some of the common Google Search Console’s missing field warnings and show you how to fix them.

Let’s have a close look at some of the warnings.

## Google Search Console Warnings

- [Either “offers”, “review”, or “aggregateRating” Should be Specified](#offers-review-aggregateRating)

- [Missing Field “Brand” Warning](#brand)

- [Missing Field “SKU” Warning](#sku)

- [Missing Field “priceValidUntil” Warning](#priceValidUntil)

- [No Global Identifier Provided (GTIN, BRAND)](#global-identifier)

### 1  Either “offers”, “review”, or “aggregateRating” Should be Specified

If you have come across an error: **Either “offers,”** **“review,” or “aggregateRating” should be specified** in the Google Search Console, you’ve come to the right place.

Rank Math takes the Schema data from your [WooCommerce](https://rankmath.com/kb/woocommerce-product-schema/) & [Easy Digital Downloads](https://rankmath.com/kb/edd-product-schema/) product pages automatically and turns it into [Schema-ready content](https://rankmath.com/blog/schema-markup/).

Meaning that the aggregateRating and review fields are taken from your actual product reviews that your buyers/customers leave on your products.

![WooCommerce product review](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201672%201008'%3E%3C/svg%3E)

If you don’t have any reviews yet, that will show up as a warning in the Schema testing tool. That’s because Google will actually look out for those fields. Hence we recommend you spend some time asking happy customers to leave a review/rating to get rid of the “aggregateRating” and “review” warnings.

If you already have reviews, the error may result from the presence of the Product Schema in your product categories. As per Google guidelines, the Product Schema should only be used on pages that contain a single product.

To remove the Product Schema from your product categories, navigate to **Rank Math SEO →** **Titles & Meta → Product categories**from your WordPress dashboard.

Once done, scroll down and enable the **Remove Snippet Data** option. Then, click **Save Changes**, as shown below.

![Remove Snippet Data](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202414%201344'%3E%3C/svg%3E)

After saving your changes, clear your website cache.

### 2  Missing Field “Brand” Warning

The warning **missing field brand**occurs in Google Search Console when the product brand option hasn’t been configured in the WooCommerce SEO plugin settings.

[To fix the brand warning in Rank Math](https://rankmath.com/kb/woocommerce-brand-names/), head over to **WordPress Dashboard → Rank Math SEO →** **General Settings → WooCommerce → Select Brand** and choose from any of the available fields to use as your product’s brands.

![Select Brand](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201606%20878'%3E%3C/svg%3E)

If you want to use a custom value for your Brands, then choose the **Custom** option under **Select Brand** available in the PRO version. Now another field **Brand** would appear below, and here enter your [custom Brand name](https://rankmath.com/kb/woocommerce-custom-brand-schema/).

![Custom Brand](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201528%20512'%3E%3C/svg%3E)

To add a custom value for your Brand in the free version, add the following filter in your theme’s [rank-math.php file](https://rankmath.com/kb/filters-hooks-api-developer/#how-to-add-code-snippets-to-rank-math-php).

```
// Add Brand for Products.
add_filter( 'rank_math/snippet/rich_snippet_product_entity', function( $entity ) {
$entity['brand'] = 'Rank Math';
return $entity;
});
```

Replace “Rank Math” text with your actual brand name and run your website through the [Google Structured Data Testing Tool](https://search.google.com/structured-data/testing-tool/u/0/) again.

### 3  Missing Field “SKU” Warning

The warning **missing field__SKU** occurs in Google Search Console when a product does not have an SKU (stock keeping unit) defined.

You can easily fix the SKU and the availability warning in Rank Math. To do so, head over to your **WooCommerce → Product → Inventory.** Add the details in the Inventory tab of your product’s data as shown below:

![Missing field SKU](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201702%20858'%3E%3C/svg%3E)

### 4  Missing Field “priceValidUntil” Warning

For the **“priceValidUntil,**” you need to either ignore or add a sale price with validity to get rid of it. Please head over to your WooCommerce product settings for each of the affected products and set **Sale price dates** on these fields as shown below:

![Add sales price](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202286%20830'%3E%3C/svg%3E)

**Note:** Rank Math will now add a default value for `priceValidUntil` property (_that corresponds to the last date of the following year_) if no sale price date is added in WooCommerce. Hence you’ll no longer see this error. If you’re still seeing this error on WooCommerce Product Schema, please ensure you’ve updated to the latest version of Rank Math.

### 5  No Global Identifier Provided (GTIN, Brand)

You can fix the **no global identifier provided (e.g., GTIN, Brand)** warning in Google Search Console by adding the relevant data to the products on your site.

With [Rank Math’s PRO version](https://rankmath.com/pricing/), you can easily [add GTIN and Brand details to your products](https://rankmath.com/kb/gtin-mpn-woocommerce/), including a Schema-ready GTIN value, eliminating any related warnings.

If you have any further questions about the missing field warnings, please feel free to [contact our dedicated support team](https://rankmath.com/support/) – we’re always more than happy to help.

			

			 

			
	
		
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