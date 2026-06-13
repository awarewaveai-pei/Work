# ItemList Schema

> **Category:** Schema
> **Source:** https://rankmath.com/kb/itemlist-schema/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# ItemList Schema

			
			

	

In this knowledgebase article, we will discuss **ItemList Schema** type in detail and how you can use it on your website with Rank Math.

**Note:** **ItemList Schema** type is available only in **Rank Math** [PRO](https://rankmath.com/pricing/)

## What is ItemList Schema?

In simple terms, ItemList Schema is used to mark a list of Items. A list can be of any type, say movies, products, apps, songs, etc., but all the list items should be of the same Schema type. You can also read the complete definition of [ItemList](https://schema.org/ItemList) in Schema.org’s documentation if you wish to understand how it works from a technical point of view.

ItemList Schema and [Carousel Schema](https://rankmath.com/kb/carousel-results/) are similar, except that Google features a carousel rich snippet for marking up list items that belong to specific data types, such as,

- [Course](https://rankmath.com/kb/course-schema/)

- [Movie](https://rankmath.com/kb/movie-schema/)

- [Recipe](https://rankmath.com/kb/recipe-schema/)

- [Restaurant](https://rankmath.com/kb/restaurant-schema/)

ItemList Schema is preferred to use on two types of pages — summary page linking to multiple details page and all-in-one page list.

### Summary Page Linking to Multiple Details Page

A summary page can have a short description of each item of the list, and you should link each item on the list to separate detailed pages. And these detailed pages are focused on the specific item(or topic).

While using ItemList Schema in this case, the [summary page](https://developers.google.com/search/docs/data-types/carousel#summary) and all item URLs you’re linking to should be separate pages on the same domain. You can consider using ItemList Schema on the archive pages of your website, which would link to multiple posts.

### All-In-One Page List

In contrast to the summary page, all items on the [all-in-one page list](https://developers.google.com/search/docs/data-types/carousel#all-in-one) should be available on the same page. And the URLs of the items should be pointed out with an anchor on the page hosting the structured data list. So, if you’re covering a listicle, you can use ItemList Schema to mark your items in the list.

You can use Rank Math’s [Custom Schema Builder](https://rankmath.com/kb/schema-generator/)/[Import Schema feature](https://rankmath.com/kb/schema-templates/#importing-schema-markup) to create your Schema template and reuse it for all listicles (or list blog posts).

## How to Add Itemlist in Rank Math? [PRO](https://rankmath.com/pricing/)

You can use ItemList Schema to your categories/tags/product archives/any taxonomy pages by using Rank Math’s Schema Generator. If you haven’t installed Rank Math PRO yet, you can choose a [PRO membership of your choice](https://rankmath.com/pricing/) and make use of the [various types of Schema](https://rankmath.com/blog/schema-markup/) supported by Rank Math.

### 1  Enable Schema Module

In order for this functionality to work, you have to [enable the Schema Module](https://rankmath.com/kb/managing-modules/) in your Rank Math Dashboard (in your site’s WordPress admin area) located under **Rank Math SEO → Dashboard**.

![Enable Schema (structured data) module](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20927%20351'%3E%3C/svg%3E)

### 2  Edit the Archive Page

Open the category or tag or any archive page where you want to use the ItemList Schema.

![Editing category page](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202400%20641'%3E%3C/svg%3E)

### 3  Navigate to Schema Generator

As you scroll down the page, you can find the Rank Math Meta box available at the bottom of the page. If the Meta box is not available on the edit screen, then you can navigate to **Rank Math SEO → Titles & Meta →** **Categories** (for other taxonomies, you can choose from the tabs on the left) and enable **Add SEO Controls** option.

Now, in the Meta box, navigate to the **Schema** tab and then click the **Schema Generator**. If the Schema tab is unavailable on your Meta box, you can navigate to **Rank Math SEO →** **Titles & Meta page → Categories** (choose the taxonomy you’re working with) and ensure **Remove Snippet Data** is disabled.

![Navigate to Schema Generator](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201590%20602'%3E%3C/svg%3E)

### 4  Choose Carousel Schema

From the list of available Schema types, choose **Carousel Schema** as shown below.

![Use Carousel Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201309%20769'%3E%3C/svg%3E)

### 5  Save the Schema

Now the Schema Builder for Carousel Schema will be open. Here you can find only the option for adding [itemListElement](https://rankmath.com/kb/itemlistelement/). By default, it is set to the variable `%itemlistloop%`, which includes all your posts that will be displayed on your archive page.

If you wish to add your own elements to ItemList Schema, you can click the **Advanced Editor** to make the changes.

![Saving the Carousel Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201266%20788'%3E%3C/svg%3E)

You can click the **Save for this Term** button to save the Schema for this specific taxonomy term. To reuse/add this Schema across various taxonomy terms, you can click the **Save as Template** button.

## Adding ItemList with a Schema Template [PRO](https://rankmath.com/pricing/)

Now we’ll look into how to add this Schema Template to all your tags, categories, or any archive pages.

### 1  Navigate to Schema Templates

If you haven’t created the Schema Template from the last step, you can also create one by navigating to **WordPress Dashboard **→**** **Rank Math SEO → Schema Templates **→**** **Add New Schema**.

![Rank Math Schema Templates](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20577'%3E%3C/svg%3E)

### 2  Create Carousel Schema Template

Next, in the Schema Generator, choose **Carousel Schema type**, as shown below.

![Use Carousel Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201309%20769'%3E%3C/svg%3E)

### 3  Editing Carousel Schema

Now, if you want to make any changes to the Carousel Schema, you can use the Advanced Editor here, or else you can leave it with the default variable `%itemlistloop%` which would allow Rank Math to take care of the ItemList Schema in your Taxonomy pages.

![Editing Carousel Schema with Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201261%20662'%3E%3C/svg%3E)

### 4  Display Conditions for Carousel Schema

In the **Display Conditions** tab, you can set the Schema Template to display on Archive pages. For this example, we’ve selected it to display on all Categories. You can also click the drop-down list to find any other taxonomies where you want to add this ItemList Schema. If you choose **All Archives**, then the Schema Template will be used on all archive pages such as categories, tags, post formats, author pages, and other custom taxonomies you’ve created on your website.

![Display conditions for Carousel Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201259%201041'%3E%3C/svg%3E)

Now click the **Save** button for the changes to take effect. You can then also check your Schema with the help of [Google’s Rich Results Testing Tool](https://search.google.com/test/rich-results) to ensure everything appears as expected. And, if you still have any questions, please don’t hesitate to [reach out to us](https://rankmath.com/support/) & we’d be more than happy to help.

			

			 

			
	
		
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