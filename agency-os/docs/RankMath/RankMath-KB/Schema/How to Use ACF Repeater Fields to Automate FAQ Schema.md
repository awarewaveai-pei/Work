# How to Use ACF Repeater Fields to Automate FAQ Schema

> **Category:** Schema
> **Source:** https://rankmath.com/kb/automate-faq-schema-with-acf-repeater-fields/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Use ACF Repeater Fields to Automate FAQ Schema

			
			

	

In this knowledgebase article, we’re going to walk you through how to use **ACF Repeater Fields to Automate FAQ Schema**.

## 1  Install Rank Math Plugin

First, you need to Install the [Rank Math](https://rankmath.com/pricing/) plugin.

![Rank Math Plugin](https://rankmath.com/wp-content/uploads/2021/01/Download-rankmath.jpg)

## 2  Install Advanced Custom Field

Once you have installed Rank Math, then install the Advanced Custom Field. Please ensure that the ACF module is enabled from **WordPress Dashboard → Rank Math SEO →** **Dashboard**.

![Advanced Custom Fields PRO](https://rankmath.com/wp-content/uploads/2021/01/ACF-1.jpg)

## 3  Create ACF Repeater Field

Create a new ACF Repeater Field. To do so, navigate to **Custom Field → Field Groups**. Click on **Add New** as shown below:

![Field Groups](https://rankmath.com/wp-content/uploads/2021/01/CustomField-AddNew.jpg)

## 4  Create New FAQ Fields

Create a new field as **FAQ Fields** and click on **Add Field** as shown below:

![Add New Field Group](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201948%20642'%3E%3C/svg%3E)

Fill in all the details and select the **Field Type**as **Repeater**.

![Field Type- Repeater](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201922%201232'%3E%3C/svg%3E)

## 5  Create Field for FAQ Question

Create a new field for**FAQ Question**in the Repeater field as shown below:

![FAQ Questions](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201928%202096'%3E%3C/svg%3E)

## 6  Create Field for FAQ Answer

Similarly create a new field for **FAQ Answer** in the Repeater field.

![FAQ Answer](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201948%201852'%3E%3C/svg%3E)

## 7  Create a Post and Fill the FAQ Fields

Add a new Post and fill the FAQs using the newly created fields.

![Fill the FAQ in Post](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201880%201078'%3E%3C/svg%3E)

## 8  Add the Code in rank-math.php File

Navigate to **WordPress Dashboard → Appearance → Theme File Editor**.

![Navigate to Theme File Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20900%20359'%3E%3C/svg%3E)

In case, if it is a block theme you should navigate to **WordPress Dashboard → Tools → Theme File Editor**.

![Theme File Editor in Block Theme](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20988%20528'%3E%3C/svg%3E)

Now, select `rank-math.php` in the theme files. If you’re automating the FAQ Schema for your posts, add the below code snippet to the rank-math.php file.

```
add_filter( 'rank_math/json_ld', function( $data, $jsonld ) {
if( ! have_rows('faq-acf-repeater') ) {
return $data;
}
$data['faqs'] = [
'@type' => 'FAQPage',
];
while( have_rows('faq-acf-repeater') ) {
the_row();
$data['faqs']['mainEntity'][] = [
'@type' => 'Question',
'name' => esc_attr( get_sub_field('faq_question') ),
'acceptedAnswer' => [
'@type' => 'Answer',
'text' => esc_attr( get_sub_field('faq_answer') ),
],
];
}
return $data;
}, 10, 2 );
```

If you’re automating the FAQ Schema for your categories, add the below code snippet to the rank-math.php file.

```
add_filter( 'rank_math/json_ld', function( $data, $jsonld ) {	
    if(is_category()) {
		$queried_object = get_queried_object_id( );
		if( ! have_rows('faq-acf-repeater', "category_".$queried_object) ) {
		return $data;
	    }
        $data['faqs'] = [
            '@type' => 'FAQPage',
        ];
        while( have_rows('faq-acf-repeater', "category_".$queried_object) ) {
            the_row();
            $data['faqs']['mainEntity'][] = [
                '@type' => 'Question',
                'name' => esc_attr( get_sub_field('faq_question', "category_".$queried_object) ),
                'acceptedAnswer' => [
                '@type' => 'Answer',
                'text' => esc_attr( get_sub_field('faq_answer', "category_".$queried_objectt) ),
                ],
            ];
        }
    }
	return $data;
}, 10, 2 );
```

Once done, edit the filter as explained below.

- Change the `faq-acf-repeater` to the field created in step 3 at line2.

- Change `faq_question` to the field created in step 5 at line 12.

- Change `faq_answer` to the field created in step 6 at line 15.

Finally, click the **Update File** button.

If you still have any questions about how to use ACF repeater fields to automate FAQ Schema – you’re always more than welcome to [contact our dedicated support team](https://rankmath.com/support/). They are available 24/7, 365 days a year…

			

			 

			
	
		
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