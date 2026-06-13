# Remove All Schema from Product Category Pages

> **Category:** Schema
> **Source:** https://rankmath.com/kb/remove-schema-from-product-category-pages/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Remove All Schema from Product Category Pages

			
			

	

If you’re using the Rank Math plugin for SEO on your WooCommerce site, you may have noticed that product category pages have a lot of Schema markup added to them by default.

However, Google does not recommend adding Product Schema to category pages. In fact, they specifically state that “product offers should not be included in Schema.org/Product markup on category pages.”

The reason for this is that the Product Schema is meant to provide information about a specific product, not a category of products. When you add Product Schema to a category page, you’re effectively saying that all products in that category are the same, which is not true.

Fortunately, there’s an easy way to remove all Schema from product category pages using Rank Math.

Rank Math adds Schema to your product category pages according to [Google’s structured data guidelines](https://developers.google.com/search/docs/guides/sd-policies). However, if you want to remove the Schema from these pages, you can do so by following this tutorial.

In this knowledgebase article, we’ll show you how to remove Schema from the product category pages.

So, let’s dive in!

## Removing Schema from Product Category Pages

- [Removing Product Schema](#remove-product-schema)

- [Removing All Schema](#remove-all-schema)

- [Removing Schema from Certain Product Categories](#removing-schema-product-categories)

### 1  Removing Product Schema

To remove only the Product Schema being added by Rank Math from all your product category archives, navigate to **Rank Math SEO → Titles & Meta → Product Categories**. You’ll now get to the product category archive settings page.

On this page, you need to scroll down to the product category tab. Here, you’ll see the **Remove Snippet Data** option and a toggle that allows you to switch between default and custom settings.

By default, the Remove Snippet Data option is turned **On**. In case, it’s turned off, you need to turn it on to remove the Schema from product category pages.

![Remove snippet data from product categories](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202414%201344'%3E%3C/svg%3E)

That’s it! You have successfully removed the product Schema from your category pages. If you want to remove other Schema, such as Breadcrumb Schema, Organization Schema, and more, please check out our next method.

### 2  Removing All Schema

In order to remove all Schema from your product category pages, you’ll need to add a custom code snippet to your WordPress theme’s **rank-math.php** file.

We recommend adding this code snippet to `/wp-content/themes/theme-name/rank-math.php`.

To do this you first need to create the **rank-math.php** file. You can follow this[tutorial to create the Rank Math file](https://rankmath.com/kb/filters-hooks-api-developer/#how-to-add-code-snippets-to-rank-math-php) in your theme folder using FTP or cPanel File Manager.

Once you’ve created the file, navigate to **Appearance → Theme File Editor** (for a Classic Theme) or **Tools → Theme File Editor** (for a Block Theme) inside your WordPress dashboard.

![Theme File Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20640%201092'%3E%3C/svg%3E)

Next, find the **rank-math.php** file that you have been created previously, and add the following code. This code will remove the Schema markup from all product category pages on your site.

```
/**
 * Filter to remove all Schema from product category pages
 */
add_filter('rank_math/json_ld', function ($data, $jsonld) {
    if (is_product_category()) {
        return [];
    }
    return $data;
}, 99, 2);
```

Once you’ve added the code, click the **Update File** button to save the changes.

For further ado, see the screenshot below:

![Filter to remove Schema from all product category pages](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20832%20564'%3E%3C/svg%3E)

### 3  Removing Schema from Certain Product Categories

If you only want to remove a Schema from certain product categories, you can use this code instead:

```
/**
 * Filter to remove all Schema from certain product category pages
 */
add_filter('rank_math/json_ld', function ($data, $jsonld) {
    if (is_product_category('category-slug')) {
        return [];
    }
    return $data;
}, 99, 2);
```

Just replace **‘category-slug’** with the slug of the product category you want to remove Schema from. You can also add multiple slugs if you want to remove Schema from multiple categories by extending this code.

That’s all there is to it! Removing Schema from product category pages can help your pages load faster and avoid potential errors with[Google’s Rich Results testing tool](https://search.google.com/test/rich-results).

If you have absolutely any questions on using Schema, feel free to[reach our support team](https://rankmath.com/support/), as we’re always here to help.

			

			 

			
	
		
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