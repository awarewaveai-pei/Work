# How to Disable Custom Product Redirection in Rank Math

> **Category:** 404 & Redirections
> **Source:** https://rankmath.com/kb/disable-custom-product-redirection/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Disable Custom Product Redirection in Rank Math

			
			

	

In this post, we’ll show you how to disable the custom product redirection in Rank Math. This is an important step if you want to keep using the old URLs for your products. Rank Math offers a number of options to redirect links with a base, but if you ever want to revert these changes, you can use the filter provided by Rank Math.

Let’s get started!

## Table of Contents

- [Why Do You Need to Disable Custom Product Redirection in Rank Math?](#need)

- [Product-based Redirection Options](#product-based-redirections)

- [How to Disable Custom Product Redirection in Rank Math?](#disable-redirection)

- [Conclusion](#conclusion)

## 1  Why Do You Need to Disable Custom Product Redirection in Rank Math?

While using Rank Math to manage your product URLs, you may have noticed that there are a few options to remove links with a base. For example, you can remove the category base, and product base altogether.

Let’s say you were using the **/product/** URL for your products, but you decided to remove the base and create redirects. Now, when someone goes to **/product/my-product**, they’ll be redirected to **/my-product**.

This can cause problems if you ever want to revert the changes or if you have other systems in place that rely on the **/product/** URL. That’s why it’s important to know how to disable the custom product redirection in Rank Math.

## 2  Product-based Redirection Options

Before we move on, you need to make sure the Remove Base and/or Remove Category Base options are enabled.

### 2.1  Remove Base

By default, WooCommerce uses /product/ as the base for product URLs. Remove base is the option that will remove /product/ from your product URL. For example, if you have a product with the URL /product/my-product, it will be changed to /my-product. This can be useful if you want to keep your product URLs short and clean.

This can be done in the **Rank Math SEO → General settings**. Scroll down to the **WooCommerce** tab. Toggle Remove Base to **On** and click “Save Changes”. This will remove the base from all of your product URLs.

![Remove base](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201514%20344'%3E%3C/svg%3E)

### 2.2  Remove Category Base

WooCommerce products are assigned to categories. By default, these category URLs have a ‘product-category’ base added to them. So, the URL for a product in the ‘Clothing’ category would look like this:

`https://rankmath.local/product-category/clothing/`

Enabling the Remove Category Base option lets you remove the ‘product-category’ part from the URL, so the resulting URL becomes: `https://rankmath.local/product/clothing/`

This can also be done in the **Rank Math SEO →** **General settings**. Head over to the **WooCommerce** tab. Toggle Remove Category Base to **On** and click “Save Changes”. This will remove the base from all of your product URLs.

![Remove category base](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201500%20304'%3E%3C/svg%3E)

If you want to keep your product URLs short, you can enable the Remove Base and Remove Category Base options. This will remove the /product/ and /product-category/ parts from the URL, so the resulting URL for a product in the **Clothing**category would be: `https://rankmath.local/clothing/`

**Now, if you’ve enabled one of these options and then decide you want to go back to the old URL, you’ll need to disable the internal redirection rule in Rank Math.**

**Fortunately, this is easy to do with the filter provided by Rank Math that we have covered in the next section.**

## 3  How to Disable Custom Product Redirection in Rank Math?

If you’ve enabled Rank Math’s options to remove the base or category base for WooCommerce products, and you want to disable them again, you can use a filter provided by Rank Math. To do this, you’ll need to add the following code to your theme’s [rank-math.php](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file) file.

```
/** * Filter to disable custom product redirection. */add_filter( 'rank_math/woocommerce/product_redirection', '__return_false' );
```

### 3.1  Navigate to Theme File Editor

Once you’ve created the Rank Math file in your theme folder, you can edit the file by navigating to **Appearance → Theme File Editor** (for Classic Theme) or **Tools → Theme File Editor** (for Block Theme) in your WordPress admin area.

![Theme File Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20900%20359'%3E%3C/svg%3E)

Next, the right side of your screen lists all the theme files and templates. The files being shown here would vary depending upon the theme you’re using on your website. You can access the rank-math.php file you created in the previous section.

![Select rank-math.php file](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20992%20655'%3E%3C/svg%3E)

### 3.2  Add Code Snippet

Now that you have access to the rank-math.php file, you can start adding your custom code snippets to it. Add the filter to disable custom product redirection in the code editor, as we’ve shown below.

![Add Rank Math filter](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201105%20625'%3E%3C/svg%3E)

### 3.3  Saving Changes

Once you’re done adding your code snippets, click on the **Update File** button to save your changes.

![Click Update File](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201000%20432'%3E%3C/svg%3E)

Once you’ve added the code, Rank Math will automatically include the canonical URL for the base URLs to baseless URLs, without the need for any further configuration. Both the old URLs and new URLs will be available for access, but with appropriate canonical.

For instance, in the below example, you can notice that the page (`https://rankmath.local/product/hoodie-with-logo/`) is including a canonical to (`https://rankmath.local/hoodie-with-logo/`)

![Canonical URL](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201788%20748'%3E%3C/svg%3E)
Source code for the URL https://rankmath.local/product/hoodie-with-logo/

The canonical URL is an important way to tell search engines like Google or Bing which version of a page is the “true” or “master” version. By pointing the canonical URL to the removed version, you are telling search engines that this is the version you want them to index. This way, you can be sure that there is no duplicate content issue.

## 4  Conclusion

In the end, we hope this article helped you learn how to disable the custom redirection in Rank Math. If you have any doubts or questions related to this matter, please don’t hesitate to reach out to our[support team](https://rankmath.com/support/). We are available 24×7, 365 days a year, and are happy to help you with any issues that you might face.

			

			 

			
	
		
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

		

										
			
- [How to Track and Fix 404 Errors from ChatGPT](https://rankmath.com/kb/fix-404-errors-from-chatgpt/)

										
			
- [How to Trace Your Website’s URL Redirects](https://rankmath.com/kb/trace-url-redirects/)

										
			
- [How to Set 410 Status Code in Bulk for WordPress](https://rankmath.com/kb/set-410-status-in-bulk/)

										
			
- [301 vs 302 Redirect: Which One Should You Use?](https://rankmath.com/kb/301-vs-302-redirect/)

										
			
- [How to fix ‘The Redirection you are trying to create may cause infinite loops’?](https://rankmath.com/kb/fix-infinite-loop-error/)

										
			
- [How to Set Up Redirections](https://rankmath.com/kb/setting-up-redirections/)