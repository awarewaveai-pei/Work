# Resolving Rank Math Schema Markup Related Issues

> **Category:** Schema
> **Source:** https://rankmath.com/kb/fix-schema-issues/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Resolving Rank Math Schema Markup Related Issues

			
			

	

Schema markup is an essential element of optimizing your website for search engines. However, the advantages of having a Schema markup may quickly disappear when the Schema is improperly set up or corrupted. So, you should always rectify Schema markup-related issues as soon as you identify them.

![How to Fix Schema Markup Issues & Drive More Traffic?](https://img.youtube.com/vi/PQzm_TUAPHE/maxresdefault.jpg)
__

In this knowledgebase article, we will delve into some common Schema markup problems and provide solutions to resolving them. So, let’s dive in and get your schema markup back on track!

## In this guide, we’ll cover:

- [My Schema is Corrupted](#my-schema-is-corrupted)

- [Search Console Displays Missing Field “Image”](#missing-field-image)

- [Search Console Displays Invalid DateTime Value for UploadDate](#invalid-datetime-uploaddate)

- [Schema Does Not Delete](#schema-does-not-delete)

- [Search Console Displays Missing Field “hasCourseInstance”](#missing-field-hascourseinstance)

## 1  My Schema is Corrupted

You may have encountered a situation where your post or page editor appears to break when you click on the Schema tab. This is the result of a corrupted Schema. Below, we will show you how to delete the corrupted Schema from your database.

**Note:** Changes to the database can result in errors that cannot be undone and may harm your website. You should make a [backup](https://rankmath.com/blog/backup-wordpress-site/) of your website/database before you continue.

### 1.1  Delete the Schema Using Bulk Actions [PRO](https://rankmath.com/pricing/)

If you have Rank Math PRO, navigate to **WordPress Dashboard → Posts** or **Pages** and select the affected posts or pages. Once done, click **Bulk actions**, as shown below.

![Select the affected posts or pages](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20617'%3E%3C/svg%3E)

In the Bulk actions menu, select **Set Schema: None**. Once done, click **Apply**.

**Note:**This method will delete all Schema, corrupted and uncorrupted, from the selected posts or pages. To delete only the corrupted Schema, you’ll have to do that through the database.

![Select Set Schema None](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20615'%3E%3C/svg%3E)

### 1.2  Delete the Schema From the Database

First, navigate to **WordPress Dashboard**→ **Posts**or **Pages**. Once done, hover over the affected post or page. A URL will display at the bottom-left corner of your screen. Take note of the number in between `?post=` and `&action=edit`. That is your post ID.

![Take note of your post ID](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20608'%3E%3C/svg%3E)

After getting your post ID, log into your database. For this example, our database is located in**cPanel → phpMyAdmin**.

**Note:**You may need to contact your host for your database’s location and login details.

![Log into your database](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20655'%3E%3C/svg%3E)

From the phpMyAdmin dashboard, select the affected database, as shown below.

![Select your database](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20655'%3E%3C/svg%3E)

Next, enter `postmeta`****in the search bar. Once the `postmeta` table****shows up, click on it, as shown below.

![Enter postmeta into the search bar](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20646'%3E%3C/svg%3E)

Now, select **Show all**. If unavailable, set the **Number of rows**option to `500`. Once done, enter the post id you copied earlier, followed by `rank_math_schema`, into the Filter rows bar.

![Enter the post id followed by rank_math_schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20646'%3E%3C/svg%3E)

If you click **Show all**, you will be presented with the Schema markups on the post id. If you set the **Number of rows**to `500`, you will use the navigation arrows to head to the next page until the Schema markups are displayed.

Once the Schema markups are displayed, head to the corrupted Schema and click **Delete**. Once done, you can return to WordPress to add a new Schema to the post.

![Head to the corrupted Schema and click Delete](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20646'%3E%3C/svg%3E)

## 2  Search Console Displays Missing Field “Image”

If you use WooCommerce, you may encounter a `Missing field “image”` error message in Google Search Console. You’re experiencing this error because you’re not using the WooCommerce Product Schema on your product pages. Below, we’ll show you how to resolve the error.

**Note:**Rank Math automatically adds the featured or product image to the Product Schema markup. So, before you begin, head to the affected product page and confirm that you have added a featured or product image.

### 2.1  Update the Schema Using Bulk Actions [PRO](https://rankmath.com/pricing/)

First, navigate to **WordPress Dashboard**→**Rank Math SEO**→**Titles & Meta**→**Products** and set the **Schema Type**to WooCommerce Product. Once done, scroll down the page and click **Save Changes**.

![Set the Schema Type to WooCommerce Product](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20612'%3E%3C/svg%3E)

Next, navigate to **WordPress Dashboard**→ **Products** and select the affected products. Once done, click the **Bulk actions**dropdown, as shown below.

![Select the affected products](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20615'%3E%3C/svg%3E)

In the Bulk actions menu, select **Set Schema: Default (WC Product)**. Once done, click **Apply**. The WooCommerce Product Schema will now be applied to your products.

![Select Set Schema Default (WC Product)](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20698'%3E%3C/svg%3E)

### 2.2  Update the Schema From the Product Page

Navigate to **WordPress Dashboard → Products** and click on the applicable product.

![Navigate to Products and click on the applicable product](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20571'%3E%3C/svg%3E)

Next, head to the Rank Math SEO metabox and click the **Schema** icon, as shown below.

![Click the Schema icon](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20612'%3E%3C/svg%3E)

Once done, click **Schema Generator**, as shown below.

**Note:**If you’re using Rank Math FREE, you’ll need to delete the existing Schema to add a new one.

![Click the Schema Generator](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20615'%3E%3C/svg%3E)

Now, you’ll select the **WooCommerce Product** Schema, as shown below.

![Select the WooCommerce Product Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20655'%3E%3C/svg%3E)

Once done, click **Save for this Post**. The WooCommerce Product Schema will be added to the page. You can now proceed to **Update**the page to save your changes.

![click Save for this Post](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20655'%3E%3C/svg%3E)

## 3  Search Console Displays Invalid DateTime Value for UploadDate

Google has updated its [structured data guidelines for Video Schema](https://developers.google.com/search/docs/appearance/structured-data/video), which modifies the data format for `UploadDate` Schema property. If your website includes old Video Schema data fetched from YouTube, then it is possible you might see these warnings in Google Search Console or Google Rich Results Testing tool:

- Datetime property “uploadDate” is missing a timezone

- Invalid datetime value for “uploadDate”

To fix these warnings, please include the below filter to your theme’s `rank-math.php file`. This filter will ensure that the `UploadDate` Schema property includes the correct timezone information.

```
/**
 * Filter code to add time & timezone in existing Video Schema 
 */
add_filter( 'rank_math/snippet/rich_snippet_videoobject_entity', function( $entity ) {
	if ( empty( $entity['uploadDate'] ) ) {
		return $entity;
	}

	$parts = explode( 'T', $entity['uploadDate'] );
	if ( ! empty( $parts[ 1 ] ) ) {
		return $entity;
	}

	$entity['uploadDate'] = wp_date( 'Y-m-d\TH:i:sP', strtotime( $entity['uploadDate'] ) );

	return $entity;
} );
```

Alternatively, you can add your YouTube API key to Rank Math PRO. Doing so enables it to automatically [fetch data from your YouTube videos](https://rankmath.com/kb/auto-detect-and-fetch-video-data/), ensuring accuracy and resolving potential issues such as upload date discrepancies, while enhancing the quality of your Video Schema.

![Add your YouTube API Key to Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201014%201005'%3E%3C/svg%3E)

If you’re unsure how to get your YouTube API key, [you can follow our guide](https://rankmath.com/kb/how-to-get-youtube-api-key/) for detailed instructions. Don’t forget to save your changes once the key is added.

## 4  Schema Does Not Delete

If you’re unable to delete a Schema, then you likely have a firewall installed on your site. To solve that, navigate to your firewall settings and whitelist the below route.

```
/wp-json/rankmath/v1/updateMeta
```

You can refer to this guide to [whitelisting Rank Math in Wordfence](https://rankmath.com/kb/whitelist-rank-math-in-wordfence/). 
If you use Sucuri, refer to this guide on [whitelisting Rank Math in Sucuri](https://rankmath.com/kb/how-to-whitelist-rank-math-in-sucuri/). 
If you use Cloudflare, refer to this guide on [whitelisting Rank Math in Cloudflare](https://rankmath.com/kb/whitelist-rank-math-in-cloudflare/).

## 5  Search Console Displays Missing Field “hasCourseInstance”

When you inspect your URL in Google Search Console or the Rich Results test tool, it may return a `Missing field “hasCourseInstance”` error. The error may be accompanied by a `Missing field "offers"`****error, as shown below.

**Note:**Google has phased out support for the Course Schema and will no longer display rich results for it.

![Sample-of-the-hasCourseInstance-and-offers-error](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20643'%3E%3C/svg%3E)

You’re encountering these errors because your Course Schema data needs to be updated with the Course Instance and Offers properties. Here’s how to do it.

**Note:** Before we begin, head to **WordPress Dashboard → Plugins** and ensure that Rank Math has been updated to the latest version.

### 5.1  Navigate to the Course Schema

First, head to the content displaying the error. Here, click the **Rank Math SEO**icon, as shown below.

![Click the Rank Math SEO icon](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20633'%3E%3C/svg%3E)

Next, click the **Schema** icon.

![Click the Schema icon](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20703'%3E%3C/svg%3E)

Then, head to the Course Schema and click the **Edit** icon, as shown below.

![Click the Edit icon of the Course Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20714'%3E%3C/svg%3E)

### 5.2  Fill in the Course Instance Property

Now, head to the **Course Instance** property and fill in the Course Mode and Course Workload fields. You can refer to our [dedicated KB on Course Schema](https://rankmath.com/kb/course-schema/) to learn more about these specific fields.

![Fill in the Course Mode and Course Workload fields](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201676%201600'%3E%3C/svg%3E)

If you also see the `Missing field "offers"`****error, head to the **Offers**property and fill in the Category, Price, and Currency fields. Once done, click **Save for this Post**.

![Fill in the category, price, and currency fields](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201506%201538'%3E%3C/svg%3E)

To sum up, resolving Schema markup-related issues is crucial for improving your website’s search engine visibility and overall user experience. So, take the time to address any Schema issues you may have encountered and reap the benefits of improved online visibility and user engagement.

We hope you are able to resolve the Schema markup issues you encountered on your WordPress site. If you have any questions, you’re more than welcome to [contact our dedicated support team](https://rankmath.com/support/). We’re available 24/7, 365 days a year…

			

			 

			
	
		
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