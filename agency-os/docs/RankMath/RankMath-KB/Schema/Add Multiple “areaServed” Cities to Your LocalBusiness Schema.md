# Add Multiple “areaServed” Cities to Your LocalBusiness Schema

> **Category:** Schema
> **Source:** https://rankmath.com/kb/add-multiple-areaserved-cities-to-localbusiness-schema/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Add Multiple “areaServed” Cities to Your LocalBusiness Schema

			
			

	

[Local Business Schema](https://schema.org/LocalBusiness) is a [Schema Markup](https://rankmath.com/blog/schema-markup/) type that you can add to your business’s website so that search engines can easily identify what type of organization you are and what you do. This further helps to optimize your website for local SEO.

According to [Schema.org](https://schema.org/areaServed), the “areaServed” Schema property is described as the geographic area where a service or offered item is provided. The areaServed Schema property helps Google know what areas businesses serve.

In this knowledgebase article, we’ll show you how to add multiple “areaServed” cities to your LocalBusiness Schema.

## Table Of Contents

- [Create a Rank Math Location for a Single Location of Your Business](#create-rank-math-location)

- [Save the Post and Copy the Schema from the Page Source](#copy-the-schema)

- [Enter the Code in Any Text Editor](#enter-the-code)

- [Make the Necessary Changes to the areaServed Field](#make-changes-to-area-served-field)

- [Import the Schema Code to a New Post/Page](#import-the-schema-code)

- [Test the Schema](#test-the-schema)

## 1  Create a Rank Math Location for a Single Location of Your Business

At first, you need to create a [Rank Math location](https://rankmath.com/kb/multiple-locations/) for a single location. Go to the **Schema Generator**and click on **Local Business**. Add the area served and select the timezone for that particular area as shown below:

![Add single location](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20937%20723'%3E%3C/svg%3E)

## 2  Save the Post and Copy the Schema from the Page Source

Once you have completed the above step, save the post by clicking on the **Save for this Post** button.

Then right-click on the page and click **Show Page Source** to view the source code of the page.

![Show Page Source](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20929%20923'%3E%3C/svg%3E)

Then copy the Schema from the page source:

![Copy the Schema from the page source](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202256%20742'%3E%3C/svg%3E)

## 3  Enter the Code in Any Text Editor

Once you have copied the page source code, enter this code in any text editor of your choice.

## 4  Make the Necessary Changes to the areaServed Field

Change the AreaServed field with the one containing multiple locations. This is an example that we will be using for this tutorial:

```
"areaServed": [

{
"@type": "City",
"name": "Toronto",
"@id": "https://en.wikipedia.org/wiki/Toronto"
},

{
"@type": "City",
"name": "Aurora",
"@id": "https://en.wikipedia.org/wiki/Aurora,_Ontario"
},

{
"@type": "City",
"name": "Oshawa",
"@id": "https://en.wikipedia.org/wiki/Oshawa"
}

],
```

So we copy the above code and paste it in the ‘areaServed’ field of the text editor. This is what the code will look like once you are have copy pasted the code in the text editor:

![Schema Code in Text Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201480%201432'%3E%3C/svg%3E)

## 5  Import the Schema Code to a New Post/Page

Copy the full, edited Schema code and import it into a new post/page.

In order to do so, create a new post/page. Then head over to the **Schema Generator → Import tab.** From the drop-down list of **Import Schema Code from** select JSON-LD/Custom Code. Paste the code in the Custom JSON-LD code area, then click **Process Code.**

![Import the Schema Code](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201278%201094'%3E%3C/svg%3E)

In the Schema Builder of LocationBusiness Schema, confirm the location names and click on **Save for this Post** as shown below:

![Click on Save for this Post](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20878'%3E%3C/svg%3E)

## 6  Test the Schema

Once you have saved the post, test your post with the [Google Rich Results Testing Tool](https://search.google.com/test/rich-results?id=U0AAAUS_Ukl0c_sfhl1uTw). And you can locate the ‘areaServed’ field there.

![Rich Result Test](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20606'%3E%3C/svg%3E)

We hope that this article has helped you add multiple “areaServed” cities to your LocalBusiness Schema. If you still have absolutely any questions, feel free to [reach out to our support team](https://rankmath.com/support/).

			

			 

			
	
		
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