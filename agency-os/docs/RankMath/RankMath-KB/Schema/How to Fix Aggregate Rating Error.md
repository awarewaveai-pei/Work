# How to Fix Aggregate Rating Error

> **Category:** Schema
> **Source:** https://rankmath.com/kb/aggregate-rating-error/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Fix Aggregate Rating Error

			
			

	

If you have a website that uses WooCommerce, you’ll likely notice that the errors are generally about various products on your archive or category pages. One such error that you might notice in [Google’s Rich Results Test](https://search.google.com/test/rich-results) or in your Google Search Console Report is the aggregateRating error.

![Missing field aggregateRating warning](https://rankmath.com/wp-content/uploads/2021/11/Missing-field-aggregateRating-warning.png)

This error means that the `aggregateRating` value is empty in your Product Schema. Apart from the Product Schema, this error can also be seen on other [review supported Schema types](https://rankmath.com/kb/review-schema/) like Recipe, Movie, Software, etc.

In this knowledgebase article, we’ll discuss how you can fix the aggregateRating error with the help of [Rank Math](https://rankmath.com/wordpress/plugin/seo-suite/).

## Table of Contents

- [Why You Should Fix This Error?](#why-fix-this-error)

- [How Rank Math Adds Aggregate Rating for WooCommerce?](#woocommerce)

- [How to Add Aggregate Rating Using Advanced Schema Builder?](#advanced-schema-builder)

- [How to Add Aggregate Rating Using Schema Templates?](#schema-templates)

- [How to Add Aggregate Rating Using Filter?](#filter)

## 1  Why You Should Fix This Error?

Google utilizes the [Schema Markup](https://rankmath.com/blog/schema-markup/) (structured data) to get a better understanding of your content. And, if your website can deliver content that makes it easy for the search engines to understand, the results can be eligible for special SERP features, also known as rich results. Not only this, but it also results in greater visibility and voice search domination.

If you get your [Product Schema](https://rankmath.com/kb/product-schema/) right then you can cherish these kinds of results. You can read our guide on [How to Use Product Schema for WooCommerce Products](https://rankmath.com/kb/woocommerce-product-schema/) that will help you to understand how to use the Product Schema and get rich results.

## 2  How Rank Math Adds Aggregate Rating for WooCommerce?

For WooCommerce users, Rank Math automatically converts the data from your product pages into Schema-ready content. Likewise, the aggregateRating and review fields are picked up from your actual product reviews that your buyers/customers leave on your products. So if you are using WooCommerce Product Schema then you need to acquire some reviews on your product in order to fix this automatically.

![WooCommerce product review](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201672%201008'%3E%3C/svg%3E)

Once you acquire reviews for your WooCommerce product, you can notice that Rank Math adds the aggregateRating to the Schema Markup as shown below.

![Aggregate Rating added by Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201338%201084'%3E%3C/svg%3E)

**Quick Tip:** To acquire reviews, you can ask or encourage your customers to leave a review or feedback on your products. You can do this via follow-up emails, social media, or reward programs.

## 3  How to Add Aggregate Rating Using Advanced Schema Builder? [PRO](https://rankmath.com/pricing/)

Apart from Product Schema, aggregateRating is used on other Review Schema types as well. So if you ever write any kind of review on your website, then you should try to take advantage of [Rich Snippets](https://rankmath.com/blog/schema-markup/), so that you can boost the effort you put into that review already.

On all Schema types, `aggregateRating` will only be a warning (in yellow) and can be ignored. Or, you can use 3rd party plugins to add user ratings because Rank Math only has the option to add author review (_added by the post author and not visitors_).

Rank Math PRO users can add aggregateRating to all review supported Schema types using the Advanced Schema Builder, with the following steps.

### 3.1  Edit your Post or Page

Start by heading over to the post or page where you want to add the Schema by clicking the **Edit** option.

![Edit post or page](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201469%20567'%3E%3C/svg%3E)

### 3.2  Open Rank Math in the Gutenberg Sidebar

In the Gutenberg Editor, click the Rank Math SEO icon in the top-right corner. Alternatively, you can click the three vertical dots and choose **Rank Math** from the Plugins section.

![Open Rank Math from the Gutenberg Sidebar](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20614%20764'%3E%3C/svg%3E)

### 3.3  Navigate to the Schema Settings for This Post/Page

Navigate to the Schema settings by clicking on the **Schema** tab. Then choose **Schema Generator**.

![Open Schema Generator](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20580%20518'%3E%3C/svg%3E)

### 3.4  Open Rank Math’s Schema Builder & Configure

From the list of available Schema types, click on **Use** against the specific Schema to open the Schema Builder. Configure all the relevant Schema fields.

![Click on Use against Schema type](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201328%201324'%3E%3C/svg%3E)

### 3.5  Choose Advanced Editor

Once you’ve configured the Schema fields, click on **Advanced Editor**.

![Choose Advanced Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201268%20924'%3E%3C/svg%3E)

### 3.6  Add Aggregate Rating Schema

Now you’ll be able to add Schema fields. Add the aggregateRating as shown below.

![Add AggregateRating with Advanced Schema Builder](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201010%20504'%3E%3C/svg%3E)

### 3.7  Save Schema

Finally, click the **Save for this Post** button. You can also save this custom Schema you’ve built as a Schema Template to reuse them in other posts.

![Save for this Post - Advanced Schema Builder](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201015%20191'%3E%3C/svg%3E)

## 4  How to Add Aggregate Rating Using Schema Templates? [PRO](https://rankmath.com/pricing/)

When you use any review plugin that allows visitors to leave ratings on your website, you can integrate them with Rank Math’s Schema Templates.

So whenever you use the Schema Template, Rank Math can pull out the rating value and add aggregateRating.

### 4.1  Add New Schema Template

To create a new Schema Template, head over to **Rank Math SEO → Schema Templates → Add New** **Schema**.

![Add new Schema Template in Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20577'%3E%3C/svg%3E)

### 4.2  Choose Custom Schema

In the Schema Generator that appears on the screen, choose **Custom Schema**.

![use custom Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201330%20574'%3E%3C/svg%3E)

### 4.3  Create Schema Template with Aggregate Rating

Now you’ll be presented with a blank slate that lets you build your Schema Template. You can make use of **Add Property** and **Add Property Group** to build your Schema.

Here is a sample Schema that we’ve built with aggregateRating.

![AggregateRating Schema Markup with Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201734%201447'%3E%3C/svg%3E)

For the `@type` field, ensure that you [set a review data type that Google accepts](https://developers.google.com/search/docs/data-types/review-snippet#review-properties) and the one that is relevant to your website content.

**Note**: Depending upon the review data type you’ve set, you might require additional properties to be added. Validate the code in Google Rich Results Tool for the suggestions, and you can add them accordingly.

For this example, we’re using the [WP Review plugin](https://wordpress.org/plugins/wp-review/) (_which can also add this Review Schema Markup on its own_) to allow visitors to add review ratings. We’re using the following variables to provide values for the Schema properties:

- `%customfield(wp_review_user_reviews)%` – to add value for `ratingValue` property

- `%customfield(wp_review_review_count)%` – to add value for `ratingCount` property

However, you can also add values to these fields manually.

### **4.4  Set the Display Conditions**

Once done, click **Display Conditions** and select **Insert**in the top dropdown menu and **Custom** in the bottom dropdown menu. Then, enter the Schema Type you want to add the aggregateRating property to.

In this example, we want to add the aggregateRating property to the Game Schema, as shown below.

![Add Schema Type](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202284%201028'%3E%3C/svg%3E)

### 4.5  Save Schema Template

Once you’ve set the Display Conditions, click the **Save** button. Rank Math will add the aggregateRating property to every content containing the Schema Type you set in section 4.4.

![Save the Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202284%201028'%3E%3C/svg%3E)

## 5  How to Add Aggregate Rating Using Filter?

While Rank Math PRO users can make use of Schema Templates / Custom Schema to include aggregateRating Schema, Rank Math free users can still make use of the filter to add aggregateRating.

### 5.1  Navigate to Theme File Editor

At first, head over to **WordPress Dashboard → Appearance → Theme File Editor** (for Classic Theme) or **WordPress Dashboard → Tools → Theme File Editor** (for Block Theme).

![Navigate to Theme File Editor from Appearances ](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20793%20516'%3E%3C/svg%3E)

And, from the list of files shown on the right side of the screen, choose the [rank-math.php](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file) file.

![select rank-math.php for editing the snippet](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20957%20764'%3E%3C/svg%3E)

### 5.2  Add Code Snippet

Copy and paste the following code snippet. Make sure to replace `users_rating` and `users_rating_count` with your post meta.

```
add_filter('rank_math/snippet/rich_snippet_product_entity',	function ($entity) {
	$score = get_post_meta(get_the_ID(), 'users_rating', true); // Replace with your rating post meta.
	$count = get_post_meta(get_the_ID(), 'users_rating_count', true); // Replace with your rating count post meta.
	$entity['aggregateRating'] = array(
		'@type'       => 'aggregateRating',
		'ratingValue' => $score,
		'ratingCount' => $count,
	);
	return $entity;
});
```

**Note:** The above filter is for Product Schema. If you’re looking to add aggregateRating to other review-supported Schema types, then use the filter `rank_math/snippet/rich_snippet_{$schema}_entity`, where `{$schema}` being replaced by the Schema name.

### 5.3  Update File

Once you’ve added the code snippet, click the **Update File** button at the bottom of the screen to reflect the changes.

![Add code snippet for aggregate rating](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201102%20669'%3E%3C/svg%3E)

And, that’s it! We hope that this article has helped you solve the aggregateRating error. However, if you still have any queries please feel free to contact our [support team](https://rankmath.com/support/) and we’d be happy to help you at any given time.

			

			 

			
	
		
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