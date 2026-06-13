# How to Set Product Meta Description Using Rank Math

> **Category:** Getting Started
> **Source:** https://rankmath.com/kb/how-to-set-product-meta-description/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Set Product Meta Description Using Rank Math

			
			

	

When you inspect the meta tags of a product page, you may notice that its meta description is different from what you’ve set.

This happens because your product meta description is selected using an order of priority. When the meta description in your meta tag differs from what you expect to see, it means the description you want has a lower priority.

In this knowledgebase article, we will show you how your meta product description is selected and how to set a default meta description for your products.

## Table Of Contents

- [How Your Product Meta Description is Selected](#how-product-meta-description-is-selected)

- [How to Set Your Product Meta Description](#how-to-set-product-meta-description)

- [How to Set the Single Product Description as Your Default Meta Description](#how-to-set-single-product-description-as-meta-description)

## 1  How Your Product Meta Description is Selected

Rank Math ensures that a relevant meta description is added to your product. So it looks through the descriptions linked to the product and sets the one with the highest priority as your meta description.

From highest to lowest, the order of priority of your product meta description is as follows:

- SEO description

- Product short description

- Single product description

- Product description

To ensure a description is set as your meta description, you will either add it to the highest priority description available or ensure no description of a higher priority is available.

## 2  How to Set Your Product Meta Description

Below, we will show you how to set the SEO description, product short description, single product description, and product description for your products.

### 2.1  SEO Description

The SEO description takes the most priority among the descriptions considered for your meta description. If you have one, it will be set as your meta description.

You can set an SEO description using the Rank Math metabox. To do that, head over to **WordPress Dashboard → **Product**s**. Then, hover over the product and click **Edit,** as shown below.

![Edit the product](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20655'%3E%3C/svg%3E)

The next step is to scroll down to the Rank Math SEO metabox and click **Edit Snippet**.

![Edit the Rank Math SEO description](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20655'%3E%3C/svg%3E)

You will be presented with the Preview Snippet Editor. Scroll to the **Description**field and enter an SEO description, as shown below.

Instead of spending a few minutes crafting a product description, how about [using Content AI](https://rankmath.com/kb/how-to-use-content-ai/) to generate your product description in seconds? You can refer to this guide for creating engaging product descriptions using the [Product Description AI Tool](https://rankmath.com/kb/content-ai-product-description-tool/).

![Edit the SEO description](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20655'%3E%3C/svg%3E)

### 2.2  Product Short Description

The product short description will be your meta description when an SEO description is unavailable.

To set a product short description, navigate to the **Product short description** metabox on the WooCommerce product editor page. Once done, enter a description in the provided field.

![Product short description metabox](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20655'%3E%3C/svg%3E)

### 2.3  Single Product Description

The single product description will be used as your meta description when a product short description is unavailable.

To set a single product description, navigate to **WordPress Dashboard →** **Rank Math SEO →** **Titles & Meta → Products**. Once done, scroll to the **Single Product Description** field and enter a description.

![Enter a Single Product Description](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20655'%3E%3C/svg%3E)

**Note:**Instead of typing in a custom product description, you can use variables to autogenerate descriptions that are relevant to your products. You can refer to this guide for the [variables available in Rank Math](https://rankmath.com/kb/variables-in-seo-title-description/).

Once you have added a description, scroll down and click **Save Changes**.

![Click Save Changes](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20655'%3E%3C/svg%3E)

### 2.4  Product Description

The product description will be your meta description when no higher priority description is available. This is your last fallback description.

You can set a product description using the **Product description** metabox on the WooCommerce product editor page, as shown below.

![Product description metabox](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20655'%3E%3C/svg%3E)

Once done, Rank Math will use the first few sentences as your meta description.

## 3  How to Set the Single Product Description as Your Default Meta Description

The single product description is the third description in the order of priority. This means it is only used for products that do not have a higher priority.

![Enter a Single Product Description](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20655'%3E%3C/svg%3E)

You can use the below filter to override the order of priority and make the single product description the meta description of all your products. You can refer to this [guide on adding filters to your site.](https://rankmath.com/kb/filters-hooks-api-developer/)

```
/**
 * Use the Description from Global Setting, if the description is missing in the Post metabox
 */
add_action( 'rank_math/frontend/description', function( $description ) {
 global $post;
 $desc = RankMath\Post::get_meta( 'description', $post->ID );

 if ( is_product()) {
 $desc = RankMath\Helper::get_settings( "titles.pt_{$post->post_type}_description" );
 if ( $desc ) {
 return RankMath\Helper::replace_vars( $desc, $post );
 }
 }

 return $description;
});
```

Once you’ve added the filter, the single product description will be used as your meta description, even when a higher priority description is available.

We hope you are able to understand the order of priority of your product descriptions. If you still have any questions about setting a product description – you’re always more than welcome to [contact our dedicated support team](https://rankmath.com/support/). We’re available 24/7, 365 days a year…

			

			 

			
	
		
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

		

										
			
- [How to Download & Install WP Rocket from Rank Math Website?](https://rankmath.com/kb/how-to-install-wp-rocket/)

										
			
- [How to Add Multiple Keywords in WordPress](https://rankmath.com/kb/how-to-add-multiple-keywords/)

										
			
- [How to Install the Imagify Plugin via Rank Math PRO](https://rankmath.com/kb/install-imagify-plugin/)

										
			
- [How to Build SEO Report for Your Website](https://rankmath.com/kb/seo-report/)

										
			
- [How to Connect/Disconnect Your Website From Rank Math](https://rankmath.com/kb/how-to-connect-or-disconnect-rank-math/)

										
			
- [Installing the Rank Math Plugin for the First Time](https://rankmath.com/kb/installation/)