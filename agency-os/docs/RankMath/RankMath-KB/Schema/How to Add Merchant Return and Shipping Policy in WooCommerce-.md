# How to Add Merchant Return and Shipping Policy in WooCommerce?

> **Category:** Schema
> **Source:** https://rankmath.com/kb/merchant-return-and-shipping-policy/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Add Merchant Return and Shipping Policy in WooCommerce?

			
			

	

If you run a WooCommerce store, adding a Merchant Return and Shipping policy to your Schema markup will further enhance your rich snippet. Google offers several ways to add this data, including Google Merchant Center, etc., and Schema Markup is one among them.

In this knowledgebase article, we will walk you through how to add them to your Online Store using Rank Math to become eligible for these rich results.

![Example of online store](https://rankmath.com/wp-content/uploads/2024/07/Merchant-Return-Policy-rich-snippet-scaled-e1721287561663.jpg)

You can add the merchant return policy at the Organization level as well as the product level. However, note that your **product-level markup would override your organization-level markup**.

### How to Add Merchant Return Policy at Organization Level [PRO](https://rankmath.com/pricing/)

If your business or online store has a standard return policy, then you may consider adding it using our [Schema Templates](https://rankmath.com/kb/schema-templates/), which are available only in the PRO version of Rank Math. If you haven’t already, you can choose a [PRO subscription of your choice from here](https://rankmath.com/pricing/).

**Note:** Before you get started, ensure that you have your Schema module enabled at **Rank Math SEO → Dashboard → Modules**.

Start by heading over to **Rank Math SEO → Schema Templates** and then click the **Add New Schema** button here. In the popup that appears on the screen, choose **Custom Schema** Builder.

![Custom Schema builder](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201256%20827'%3E%3C/svg%3E)

Next, in the Schema Builder, use the **Add Property** and **Add Property Group** options to add the MerchantReturnPolicy Schema, as shown below.

Please feel free to adjust the values according to your website. You can also refer to the [documentation from Google for configuring this Schema](https://developers.google.com/search/docs/appearance/structured-data/organization#merchant-return-policy-properties).

![Merchant Return Policy](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201017%20869'%3E%3C/svg%3E)

Then head over to the **Display Conditions** tab, where you can choose to **Insert** this custom Schema into the **Organization Schema**, as shown below. Finally, click the **Save** button.

![Click Insert to add Custom Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201279%20827'%3E%3C/svg%3E)

### How to Add Merchant Return and Shipping Policy at the Product Level

To add the Merchant Return and Shipping policy at the product level, you can add the below filter to your website theme’s `rank-math.php` file. If you haven’t already created a `rank-math.php` file, [you can refer to this tutorial to create one](https://rankmath.com/kb/filters-hooks-api-developer/#how-to-add-code-snippets-to-rank-math-php).

Please feel free to customize the filter with the values relevant to your WooCommerce store. You can [refer to this documentation from Google](https://developers.google.com/search/docs/appearance/structured-data/merchant-listing) to understand the accepted values.

The below filter adds this Merchant Return and Shipping policy to all your simple products, but you can also further customize this filter with conditions to change them for specific products.

```
add_filter( "rank_math/snippet/rich_snippet_product_entity", function( $entity ) {
    // Return policy
    $entity['offers']['hasMerchantReturnPolicy']['@type'] = 'MerchantReturnPolicy';
    $entity['offers']['hasMerchantReturnPolicy']['applicableCountry'] = 'US';
    $entity['offers']['hasMerchantReturnPolicy']['returnPolicyCountry'] = 'US';
    $entity['offers']['hasMerchantReturnPolicy']['returnPolicyCategory'] = 'https://schema.org/MerchantReturnFiniteReturnWindow';
    $entity['offers']['hasMerchantReturnPolicy']['merchantReturnDays'] = 7;
    $entity['offers']['hasMerchantReturnPolicy']['returnMethod'] = 'https://schema.org/ReturnByMail';
    $entity['offers']['hasMerchantReturnPolicy']['returnFees'] = 'https://schema.org/FreeReturn';
    $entity['offers']['hasMerchantReturnPolicy']['refundType'] = 'https://schema.org/FullRefund';

    // Shipping details
    $entity['offers']['shippingDetails']['@type'] = 'OfferShippingDetails';
    $entity['offers']['shippingDetails']['shippingRate']['@type'] = 'MonetaryAmount';
    $entity['offers']['shippingDetails']['shippingRate']['value'] = 5;
    $entity['offers']['shippingDetails']['shippingRate']['currency'] = 'USD';
    $entity['offers']['shippingDetails']['shippingDestination']['@type'] = 'DefinedRegion';
    $entity['offers']['shippingDetails']['shippingDestination']['addressCountry'] = 'US';
    $entity['offers']['shippingDetails']['deliveryTime']['@type'] = 'ShippingDeliveryTime';
    $entity['offers']['shippingDetails']['deliveryTime']['handlingTime']['@type'] = 'QuantitativeValue';
    $entity['offers']['shippingDetails']['deliveryTime']['handlingTime']['minValue'] = 0;
    $entity['offers']['shippingDetails']['deliveryTime']['handlingTime']['maxValue'] = 1;
    $entity['offers']['shippingDetails']['deliveryTime']['handlingTime']['unitCode'] = 'DAY';
    $entity['offers']['shippingDetails']['deliveryTime']['transitTime']['@type'] = 'QuantitativeValue';
    $entity['offers']['shippingDetails']['deliveryTime']['transitTime']['minValue'] = 0;
    $entity['offers']['shippingDetails']['deliveryTime']['transitTime']['maxValue'] = 3;
    $entity['offers']['shippingDetails']['deliveryTime']['transitTime']['unitCode'] = 'DAY';
    return $entity;
});
```

However, if you have variable products, you can use the following filter to add this Merchant Return and Shipping policy to them. You can still customize this filter specifically.

```
add_filter( 'rank_math/json_ld', function( $data, $jsonld ) {
    if ( empty( $data['richSnippet'] ) || ! in_array( $data['richSnippet']['@type'], [ 'Product', 'ProductGroup' ] ) ) {
		return $data;
	}
 
	$data['shippingDetails'] = [
		'@context'     => 'https://schema.org/',
		'@type'        => 'OfferShippingDetails',
		'@id'          => '#shipping_policy',
		'deliveryTime' => [
			'@type'        => 'ShippingDeliveryTime',
			'handlingTime' => [
				'@type'    => 'QuantitativeValue',
				'minValue' => 0,
				'maxValue' => 1,
				'unitCode' => 'DAY',
			],
			'transitTime' => [
				'@type'    => 'QuantitativeValue',
				'minValue' => 1,
				'maxValue' => 5,
				'unitCode' => 'DAY'
			],
		],
		'shippingRate' => [
			'@type'    => 'MonetaryAmount',
			'value'    => 200,
			'currency' => 'PKR',
		],
		'shippingDestination' => [
			'@type' => 'DefinedRegion',
			'addressCountry' => 'PK'
		]
	];
	$data['hasMerchantReturnPolicy'] = [
		'@context'     => 'https://schema.org/',
		'@type'        => 'MerchantReturnPolicy',
		'@id'          => '#merchant_policy',
		'applicableCountry' => 'PK',
                'returnPolicyCountry' => 'PK',
		'returnPolicyCategory' => 'https://schema.org/MerchantReturnFiniteReturnWindow',
		'merchantReturnDays' => 7,
		'returnMethod' => 'https://schema.org/ReturnByMail',
		'returnFees' => 'https://schema.org/FreeReturn'
	];
	if ( 'Product' ===  $data['richSnippet']['@type'] ) {
		$data['richSnippet']['offers']['shippingDetails'] = [ '@id' => '#shipping_policy' ];
		$data['richSnippet']['offers']['hasMerchantReturnPolicy'] = ['@id' => '#merchant_policy'];
		return $data;
	}
 
	if ( empty( $data['richSnippet']['hasVariant'] ) ) {
		return $data;
	}
 
	foreach ( $data['richSnippet']['hasVariant'] as $key => $value ) {
		if ( empty( $value['offers'] ) ) {
			continue;
		}
 
		$data['richSnippet']['hasVariant'][ $key ]['offers']['shippingDetails'] = [ '@id' => '#shipping_policy' ];
		$data['richSnippet']['hasVariant'][ $key ]['offers']['hasMerchantReturnPolicy'] = [ '@id' => '#merchant_policy' ];
	}
 
	return $data;
 
}, 99, 2);
```

And that’s it! If you have absolutely any questions about adding Merchant Return and Shipping policy, please [open a support ticket here](https://rankmath.com/support/) and our support team would be more than happy to assist you.

			

			 

			
	
		
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

										
			
- [What is WebSite Schema and How Do You Implement It?](https://rankmath.com/kb/website-schema/)

										
			
- [How to Implement sameAs Schema on Your Website](https://rankmath.com/kb/sameas-schema/)

										
			
- [How to Implement Author SEO on Your Website to Boost E-E-A-T](https://rankmath.com/kb/author-seo/)

										
			
- [How to Add Profile Page Schema Markup?](https://rankmath.com/kb/profilepage-schema/)