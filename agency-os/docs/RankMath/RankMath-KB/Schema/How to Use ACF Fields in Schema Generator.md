# How to Use ACF Fields in Schema Generator

> **Category:** Schema
> **Source:** https://rankmath.com/kb/how-to-use-acf-fields-in-schema-generator/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Use ACF Fields in Schema Generator

			
			

	

In this knowledgebase article, we’re going to walk you through how to use ACF fields in [Rank Math’s Schema Generator](https://rankmath.com/blog/schema-markup/).

## What is Advanced Custom Fields Plugin?

[Advanced Custom Fields](https://wordpress.org/plugins/advanced-custom-fields/), aka ACF, is a WordPress plugin that allows you to add extra content fields known as Custom Fields and helps to tailor what fields to show. Advanced Custom Fields lets you build websites faster and quickly educate your customers.

Using Advanced Custom Fields with Rank Math, you can enrich your pages and blog posts with more data and information with an easy-to-use solution. In addition, it’s effortless to [integrate Rank Math with Advanced Custom Fields](https://rankmath.com/kb/advanced-custom-fields/).

## How to Use ACF Fields in Schema Generator?

The custom field variable (`%customfield%`) will not work on the ACF fields. This is due to how ACF stores values in the post meta table. It stores values in a serialized format for groups, and for other fields, it stores key-value pairs.

You can define a new variable [using this filter](https://rankmath.com/kb/filters-hooks-api-developer/#add-extra-variables) to get the value from the ACF field and use it in the Schema Generator. Here’s how we register the [WooCommerce variable in the Rank Math](https://github.com/rankmath/seo-by-rank-math/blob/master/includes/modules/woocommerce/class-wc-vars.php#L24) plugin.

We recommend using the rank_math/json_ld filter to generate FAQ schema on the front end instead of adding it from the Schema generator.

You can do this by adding the following code to your theme’s [rank-math.php](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file) file:

```
add_filter( 'rank_math/json_ld', function( $data, $jsonld ) {
	if( ! have_rows('acf-repeater-faq') ) {
		return $data;
	}
    $data['faqs'] = [
        '@type' => 'FAQPage',
    ];
    while( have_rows('acf-repeater-faq') ) {
		the_row();
        $data['faqs']['mainEntity'][] = [
            '@type' => 'Question',
            'name'  => esc_attr( get_sub_field('faq_question') ),
            'acceptedAnswer' => [
                '@type' => 'Answer',
                'text'  => esc_attr( get_sub_field('faq_answer') ),
            ],
        ];
    }
    return $data;
}, 10, 2 );
```

The first step is to navigate to **WordPress Dashboard → Appearance → Theme File Editor** (for a Classic Theme).

![Navigate to Theme File Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20900%20359'%3E%3C/svg%3E)

For a **Block Theme** like Divi, navigate to **WordPress Dashboard → Tools → Theme File Editor**.

![Theme File Editor in Block Theme](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20988%20528'%3E%3C/svg%3E)

Now select the theme’s [rank-math.php](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file) file.

![Select rank-math.php file](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202544%20994'%3E%3C/svg%3E)

Then add the above code and click the **Update File** button.

Also, please ensure that you change the `acf-repeater-faq, faq_question, faq_answer` fields as per the settings in the ACF:

![FAQ Fields](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202474%201754'%3E%3C/svg%3E)

You can also read our knowledgebase article [How to Use ACF Repeater Fields to Automate FAQ Schema](https://rankmath.com/kb/automate-faq-schema-with-acf-repeater-fields/) to help you add and manage custom fields easily. If you still have any questions about how to use ACF fields in the Schema Generator – you’re always more than welcome to [contact our dedicated support team](https://rankmath.com/support/).

			

			 

			
	
		
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