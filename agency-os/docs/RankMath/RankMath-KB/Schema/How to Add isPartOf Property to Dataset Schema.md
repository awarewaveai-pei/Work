# How to Add isPartOf Property to Dataset Schema

> **Category:** Schema
> **Source:** https://rankmath.com/kb/ispartof-property-dataset-schema/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Add isPartOf Property to Dataset Schema

			
			

	

The isPartOf property in a [Dataset Schema](https://rankmath.com/kb/dataset-schema/) is used for defining relationships between datasets. In this knowledgebase article, we will walk you through how to add isPartOf property to Dataset Schema using Rank Math.

## isPartOf vs hasPart

If the dataset you’re defining in a post has a collection of smaller datasets, then the hasPart property is used for defining the relationship.

On the other hand, if the dataset you’re defining is a part of a larger dataset, then the isPartOf property is used for defining the relationship.

To demonstrate in a simple way,

Smaller dataset **→** isPartOf → Larger dataset

Larger dataset → hasPart → Smaller dataset

In this tutorial, we will choose an example, with a dataset of global internet users and regional internet users and how you can add the Dataset Schema for this relationship with Rank Math.

## Table Of Contents

- [How to Add isPartOf with Rank Math?](#how-to-add-ispartof-with-rank-math)

- [How to Add hasPart Property with Rank Math?](#how-to-add-haspart-property-with-rank-math)

## How to Add isPartOf with Rank Math

To add the isPartOf property with Rank Math, you can use Rank Math’s Advanced Schema Editor, available in the Rank Math PRO version.

### 1  Edit Post or Page

Open the post or page where you want to add the isPartOf property.

![Edit post or page](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201295%20287'%3E%3C/svg%3E)

### 2  Open Rank Math in Gutenberg Editor

In the Gutenberg Editor, click the Rank Math SEO icon in the top right corner of the page.

![Click Rank Math SEO icon in Gutenberg Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201060%20240'%3E%3C/svg%3E)

### 3  Open Schema Generator

In the Rank Math Meta Box, click the Schema tab and then choose Schema Generator.

![Click on Schema Generator](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20686%20514'%3E%3C/svg%3E)

### 4  Choose Dataset Schema

From the list of available Schema types, click **Use** against the Dataset Schema.

![Click Use on Dataset Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201306%20763'%3E%3C/svg%3E)

### 5  Configure Dataset Schema

In the Schema Builder, you can find a number of options available for configuring Dataset Schema. Here is a detailed guide that would help you [configure all the fields](https://rankmath.com/kb/dataset-schema/).

Configure all the fields, except the Dataset fields, as it would add the hasPart property.

![Configure Dataset Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201193%20458'%3E%3C/svg%3E)

### 6  Open Advanced Editor

Once you’ve added the data in the Schema Builder fields, click the **Advanced Editor** option at the bottom of the page.

![Open Advanced Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201260%20445'%3E%3C/svg%3E)

### 7  Add isPartOf Property

Now in the Advanced Editor, add the isPartOf property details (_use Add Property and Add Property Group options for creating new fields_).

Here is an example, where we’ve added the Global Internet Users (larger dataset) as isPartOf using Dataset Schema.

![isPartof Property](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202024%201131'%3E%3C/svg%3E)

### 8  Save Schema for this Post

Once you’ve added Schema, click the **Save for this Post**.

![Save for this Post](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202024%20390'%3E%3C/svg%3E)

Now update the post as you would normally do, or if it is a new post, click **Publish** and then check the generated Schema Markup. Here is an example of the generated Schema Markup.

![isPartOf property group in dataSet Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201556%201480'%3E%3C/svg%3E)

## How to Add hasPart Property with Rank Math?

The default Dataset Schema type available at Rank Math adds the hasPart property, which lets you define the dataset as a collection of a number of larger datasets.

To add the hasPart property for Dataset Schema with Rank Math, you can follow the exact steps discussed below.

### 1  Edit Post or Page

Open the post or page where you want to add the hasPart property.

![Edit post or page](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201280%20293'%3E%3C/svg%3E)

### 2  Open Rank Math in Gutenberg Editor

In the Gutenberg Editor, click the **Rank Math SEO** icon in the top right corner of the page.

![Click Rank Math SEO icon in Gutenberg Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201060%20240'%3E%3C/svg%3E)

### 3  Open Schema Generator

In the Rank Math Meta Box, click the Schema tab and then choose Schema Generator.

![Click on Schema Generator](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20686%20514'%3E%3C/svg%3E)

### 4  Choose Dataset Schema

From the list of available Schema types, click **Use** against the Dataset Schema.

![Click Use on Dataset Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201306%20763'%3E%3C/svg%3E)

### 5  Configure Dataset Schema

To configure the individual fields in our Dataset Schema, you can refer to our [dedicated guide](https://rankmath.com/kb/dataset-schema/). For the hasPart property to be included, make sure to add the DataSets field.

More Datasets can be added by clicking the **Add Property Group**.

![Add property group](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20787%20905'%3E%3C/svg%3E)

### 6  Save Changes

Once you’ve filled in the data, click the **Save for this Post** button for the changes to reflect.

![Save for this Post - Dataset Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201265%20282'%3E%3C/svg%3E)

Here is the generated Schema Markup with hasPart property.

![hasPart property in DataSet Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201774%202344'%3E%3C/svg%3E)

And, that’s it! We hope the tutorial was helpful in adding the isPartOf property. If you still have absolutely any questions, please feel free to [reach our support team directly from here](https://rankmath.com/support/), and we’re always here to help.

			

			 

			
	
		
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