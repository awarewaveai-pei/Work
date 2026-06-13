# Remove Organization Schema from Your Website

> **Category:** Schema
> **Source:** https://rankmath.com/kb/remove-organization-schema/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Remove Organization Schema from Your Website

			
			

	

The Organization Schema Markup is a great way to help you generate brand signals that can further help make your Knowledge Graph entities and website snippet presence appear more frequently on the search engine results pages (SERPS).

But if you prefer to remove the Organization Schema from your website, then we’ll walk you through the steps in the knowledgebase article.

## Table Of Contents

- [Remove Organisation Schema from All Pages Except Homepage](#remove-organisation-schema-from-all-pages-except-homepage)

- [Remove Organisation Schema from the Homepage](#remove-organisation-schema-from-the-homepage)

- [How to Add the Snippet Code](#how-to-add-the-snippet-code)

## 1  Remove Organisation Schema from All Pages Except Homepage

You can use the below code to remove the Organization Schema from all pages except the homepage:

```
add_filter( 'rank_math/json_ld', function( $data, $jsonld ) {
	if ( is_front_page() || ! isset( $data['publisher'] ) ) {
		return $data;
	}	unset( $data['publisher'] );
	unset( $data['place'] );	return $data;
}, 99, 2);
```

## 2  Remove Organisation Schema from the Homepage

You can use the code below to remove the Organization Schema just from the homepage:

```
add_filter( 'rank_math/json_ld', function( $data, $jsonld ) {
	if ( ! is_front_page() || ! isset( $data['publisher'] ) ) {
		return $data;
	}	unset( $data['publisher'] );
	unset( $data['place'] );	return $data;
}, 99, 2);
```

## 3  Remove Organization Schema from Product Pages

You can use the code below to remove the Organization Schema from your product pages:

```
add_filter( 'rank_math/json_ld', function( $data, $jsonld ) {
    if (isset( $data['publisher'] ) && is_product() ) {
        unset( $data['publisher'] );
    }
    return $data;	
}, 99, 2);
```

**Note**: All these entities are interconnected, and we do not recommend removing any one entity from the Schema. Only developers with a sound understanding of what they are doing should attempt this. Additionally, it’s not recommended to remove the global entities, as this could break the Schema structure.

## 3  How to Add the Snippet Code

We recommend adding the above-mentioned code snippets to your theme’s [rank-math.php](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file) file. Adding it to your parent theme could mean that you’ll lose all changes upon updating when your theme developer releases an update.

### 3.1  Navigate to Theme File Editor

First of all, navigate to **WordPress Dashboard → Appearance → Theme File Editor** (for Classic Theme) as shown below or **WordPress Dashboard → Tools → Theme File Editor** (for Block Theme).

![Navigate to Theme File Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20900%20359'%3E%3C/svg%3E)

### 3.2  Edit Your rank-math.php File

To edit your theme’s rank-math.php click on the **rank-math.php** file from the right sidebar that lists down all the files in your child theme.

![Choose the rank-math.php file](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201037%20690'%3E%3C/svg%3E)

Then, add your snippet code to the field as shown above and click “**Update File**“.

And, that’s it! We hope this tutorial was helpful in adding code snippets to your WordPress site. In case, if you still have any questions about removing Organization Schema from your website – you’re always more than welcome to [contact our dedicated support team](https://rankmath.com/support/). They are available 24/7, 365 days a year…

			

			 

			
	
		
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