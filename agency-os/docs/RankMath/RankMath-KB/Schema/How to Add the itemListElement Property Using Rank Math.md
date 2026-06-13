# How to Add the itemListElement Property Using Rank Math

> **Category:** Schema
> **Source:** https://rankmath.com/kb/itemlistelement/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Add the itemListElement Property Using Rank Math

			
			

	

The property itemListElement is used in Schema so that you can provide additional information about the elements of an ordered list. The itemListElement property accepts itemList, thing, or text as its value, and the usage can be widely seen across Schema types such as — Breadcrumb, HowTo, ItemList, OfferCatalog, etc.

In this knowledgebase article, we’ll discuss how you can add the itemListElement property using Rank Math for relevant Schema types. Before getting started with adding Schema, ensure that you’ve enabled the Schema module under **WordPress Dashboard →** **Rank Math SEO**inside your WordPress admin area, as shown below.

![Enable Schema module](https://rankmath.com/wp-content/uploads/2022/10/enable-structered-data.jpg)

## Table of Contents

- [Breadcrumb Schema](#breadcrumb-schema)

- [HowTo Schema](#howto-schema)

- [ItemList Schema](#itemlist-schema)[PRO](https://rankmath.com/pricing/)

- [OfferCatalog Schema](#offercatalog-schema)[PRO](https://rankmath.com/pricing/)

## 1  Breadcrumb Schema

The itemListElement property is automatically added when you use Breadcrumb Schema with Rank Math. Breadcrumb Schema can be added with Rank Math by following the exact steps discussed below.

### 1.1  Open Breadcrumbs Settings

At first, navigate to **Rank Math SEO → General Settings → Breadcrumbs**.

![Open Breadcrumb settings in Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202036%201314'%3E%3C/svg%3E)

### 1.2  Enable Breadcrumbs

From the list of available settings, enable the breadcrumbs function as shown below.

![Enable breadcrumbs function](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201479%20208'%3E%3C/svg%3E)

Once you’ve enabled breadcrumbs you can notice a number of options appearing below. You can [refer to this detailed guide](https://rankmath.com/kb/breadcrumbs/) to configure them.

![Rank Math breadcrumb options](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201447%202560'%3E%3C/svg%3E)

After configuring breadcrumbs, click the **Save Changes** button at the bottom of the page.

![Save Changes](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201540%20207'%3E%3C/svg%3E)

### 1.3  Adding Breadcrumbs to Your Website

Once you’ve enabled the breadcrumbs, you need to add the following code snippet to your website’s template file (single.php or header.php depending upon your theme) so that the breadcrumbs can be displayed on the front-end.

```
/**
 * Use the following code in your theme template files to display breadcrumbs:
 */
<?php if (function_exists('rank_math_the_breadcrumbs')) rank_math_the_breadcrumbs(); ?>
```

Or alternatively, you can use the following shortcode.

```
[rank_math_breadcrumb]
```

There are more ways to add breadcrumbs to your website with Rank Math. Here is a [detailed tutorial](https://rankmath.com/kb/breadcrumbs/#add-breadcrumbs-theme) explaining the different options that Rank Math offers. When the breadcrumb is displayed on the front-end, Rank Math would automatically add the Breadcrumb Schema Markup.

Once the breadcrumb is added, you can check the added Schema Markup to see if the `itemListElement` property is added.

![itemListElement in Breadcrumb Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201460%201396'%3E%3C/svg%3E)

## 2  HowTo Schema

Rank Math allows you to add HowTo Schema using the HowTo Block or Schema Generator. The feature to [add HowTo Schema using Schema Generator](https://rankmath.com/kb/howto-schema/#schema-generator) is available only in Rank Math PRO. To add HowTo Block, you can follow the exact steps discussed below.

### 2.1  Open the Post/Page

Open the post/page where you want to use the HowTo Block or simply create a new post by clicking the **Add New** option available under the Posts menu.

![Add New post in WordPress](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201030%20500'%3E%3C/svg%3E)

### 2.2  Add HowTo Block to the Post

In the Gutenberg Editor, you can add HowTo Block by clicking the “+” icon that appears on the right side of the content screen. Or alternatively, you can type “/” in a new block. From the list of available blocks displayed, you can choose **HowTo By Rank Math,** as shown below.

![Adding HowTo block by Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201503%20925'%3E%3C/svg%3E)

### 2.3  Configure HowTo Block

Now, the HowTo Block will be added to your editor, and it will look as shown below. You can notice the HowTo Block contains a number of options available. Here is a [detailed guide](https://rankmath.com/kb/howto-schema/#gutenberg-block) that will help you take advantage of the various options available with HowTo Block.

![HowTo Block by Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20868%201060'%3E%3C/svg%3E)

Once you’ve filled the HowTo block, update the post as you would normally do and if it is a new post, simply publish the post. Once the post is updated/published, you can check the Schema Markup.

The following image shows a part of the generated Schema Markup with `itemListElement` being nested inside each `HowToStep`.

![itemListElement in HowTo Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201850%201216'%3E%3C/svg%3E)

## 3  ItemList Schema [PRO](https://rankmath.com/pricing/)

The [ItemList Schema](https://rankmath.com/kb/itemlist-schema/) is used to mark up a list of items. And when you’re marking the following Schema types with ItemList Schema, Google would feature a [carousel rich result](https://rankmath.com/kb/carousel-results/):

- [Course](https://rankmath.com/kb/course-schema/)

- [Movie](https://rankmath.com/kb/movie-schema/)

- [Recipe](https://rankmath.com/kb/recipe-schema/)

- [Restaurant](https://rankmath.com/kb/restaurant-schema/)

The itemListElement is used for describing the context of each element in the ItemList. Rank Math would [automatically generate the ItemList Schema to any post or page](https://rankmath.com/kb/carousel-results/#adding-carousel-schema-post-page) when you use any of the above Schema types more than once in a post/page.

To add the ItemList Schema on taxonomy pages, you can follow the exact steps discussed below:

### 3.1  Open the Archive Page

Open the category or tag or any archive page where you want to use the ItemList Schema.

![Open the Archive Page](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202400%20641'%3E%3C/svg%3E)

### 3.2  Navigate to Schema Generator

In the Edit screen of the taxonomy page, scroll down to find the familiar Rank Math Meta Box. In case if the Meta Box is not available, navigate to **Rank Math SEO → Titles & Meta → Categories** (or any other taxonomy) and ensure that **Add SEO Controls** option is enabled.

Now in the Rank Math Meta Box, navigate to the **Schema** tab and then click on the **Schema Generator**. In case, if the Schema tab is missing on your taxonomy page, navigate to **Rank Math SEO → Titles & Meta → Categories** (or any other taxonomy) and then ensure that **Remove Snippet Data** is disabled.

![Navigate to Schema Generator](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201568%20444'%3E%3C/svg%3E)

### 3.3  Choose Carousel Schema

From the list of available Schema types in Schema Generator, click on **Use** against the Carousel Schema.

![Click on Use against Carousel Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201318%201254'%3E%3C/svg%3E)

### 3.4  Save the Schema

Now the Schema Builder for the Carousel Schema will appear. Here you will find the `itemListElement` being assigned value with `%itemlistloop%` variable. In case, if you want to add a custom itemListElement, then you can easily do that by clicking the **Advanced Editor**.

Once you’ve built the Schema, click the **Save for this Term**.

![Save for this Term - Carousel Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201257%20640'%3E%3C/svg%3E)

Now, you can check the Schema Markup, and here is an example of the generated Schema Markup for ItemList Schema with `itemListElement`.

![itemListElement in itemList Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201430%201324'%3E%3C/svg%3E)

## 4  OfferCatalog Schema [PRO](https://rankmath.com/pricing/)

OfferCatalog is a specific type of ItemList Schema that includes the collection of offers/sub-catalogs from the same provider. Being a type of ItemList Schema, the OfferCatalog Schema involves the usage of the itemListElement property.

The OfferCatalog Schema can be effectively nested under [Service Schema](https://rankmath.com/kb/service-schema/), and we will build the Schema with our [Custom Schema Builder](https://rankmath.com/kb/schema-generator/) (available only in Rank Math PRO) in the following steps.

### 4.1  Edit Your Post or Page

Open the post or page where you want to add the Custom Schema by clicking the **Edit** option.

![Edit post](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201127%20287'%3E%3C/svg%3E)

### 4.2  Open Rank Math in Gutenberg Editor

In the Gutenberg Editor, click the Rank Math SEO icon that appears in the top-right corner of the page.

![Click on Rank Math SEO icon](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201030%20758'%3E%3C/svg%3E)

### 4.3  Open Schema Generator

In the Rank Math Meta Box, navigate to the **Schema** tab and then click on **Schema Generator,** as shown below.

![Open Schema Generator in Rank Math meta box](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20598%20536'%3E%3C/svg%3E)

### 4.4  Navigate to Custom Schema

In the Schema Generator, navigate to the **Custom Schema** tab.

![Open Custom Schema tab](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201268%20457'%3E%3C/svg%3E)

### 4.5  Add Properties and Property Groups

Now the Schema Builder would appear, where you can add properties and property groups.

![Custom Schema Builder](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202282%20670'%3E%3C/svg%3E)

Here is an example of OfferCatalog Schema with itemListElement that we’ve built with Custom Schema.

![ItemListElement in offerCatalog](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202024%203635'%3E%3C/svg%3E)

### 4.6  Save Schema

Once you’ve built the Custom Schema, click on **Save for this Post**.

![Save for this Post - Custom Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201017%20147'%3E%3C/svg%3E)

Then update the post as you would normally do or if it is a new post, then click **Publish**. Now you can check the generated Schema Markup with [Google’s Rich Results Testing tool](https://search.google.com/test/rich-results) for any errors.

And, that’s it! We hope the tutorial was helpful in adding itemListElement property to your website. If you still have absolutely any questions, please feel free to [reach our support team directly from here](https://rankmath.com/support/), and we’re always here to help.

			

			 

			
	
		
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