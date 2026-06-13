# How to Create a KML Sitemap Using Rank Math

> **Category:** Sitemaps
> **Source:** https://rankmath.com/kb/kml-sitemap/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Create a KML Sitemap Using Rank Math

			
			

	

Rank Math includes a feature to create a KML sitemap automatically for Local SEO, which makes it easier for Google to read and render the geographic data of your business location. So In this knowledgebase tutorial, we’ll walk you through how to create one using Rank Math.

![How to Create a KML Sitemap using Rank Math](https://img.youtube.com/vi/yMsoPTAwgYg/maxresdefault.jpg)
__

**Note: This feature is only available in [Rank Math PRO](https://rankmath.com/pricing/).**

## Table of Contents

- [What is a KML File?](#what-is-kml-file)

- [What Are the Benefits of a KML File?](#benefits)

- [KML Files in Rank Math](#kml-file)

- [How to Add KML for Your Local Business?](#add-kml-for-local-business)

- [How to Add KML for Multiple Locations?](#add-kml-multiple-locations)

- [Filter to Add Locations KML File in the Sitemap](#add-locations-kml-file-sitemap)

## 1  What is a KML File?

[Keyhole Markup Language or KML](https://developers.google.com/kml/documentation/kml_tut) is an XML-based format that is used for storing geographic data and rendering information that is easier to read. This technology was acquired by Google and subsequently submitted to the [Open Geospatial Consortium](https://www.ogc.org/standards/kml/) further.

KML files have either a **.kml** or **.kmz** (for compressed or zipped KML files) file extension. KML includes both vector and raster elements such as points, lines, polygons, and imagery, as well as related content like graphics, pictures, attributes, and HTML.

KML is more than a way to store map coordinates. KML files are like HTML and only comprise links to icons and raster layers.

## 2  What Are the Benefits of a KML File?

KML files display your business’s geographic details in such a way that it’s interoperable with other applications like Google Maps and Google Earth. Google verifies your business listing and location with the help of these KML files.

Not only this, but it also contains instructions for how to display the location, like marker color and style. You can also read more about KML in this [KML documentation](https://developers.google.com/kml/documentation/?csw=1) maintained by Google.

## 3  KML Files in Rank Math

Rank Math adds the KML file automatically when the [Local SEO](https://rankmath.com/kb/local-seo/) module is enabled. You can enable it from **Rank Math SEO → Dashboard**, as shown below:

![Enable Local SEO module](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20919%20350'%3E%3C/svg%3E)

Then navigate to **Rank Math SEO → Titles & Meta → Local SEO** and select **Organization** in order to view the geo-coordinates option.

![Choose Organization for Local SEO settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20900%20419'%3E%3C/svg%3E)

## 4  How to Add KML for Your Local Business?

At first, add geo-coordinates by navigating to **WordPress Dashboard → Rank Math SEO →** **Titles & Meta → Local SEO**. Please refer to this guide from Google on [how to find your business location’s geocoordinates](https://support.google.com/maps/answer/18539).

![Geo-coordinates in Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20840%20153'%3E%3C/svg%3E)

You can also check our guide on [how to setup Local SEO](https://rankmath.com/kb/local-seo/) that will help you understand the Local SEO settings in detail. Once you have added the Geo Coordinates, please save your page and then [check your KML](https://rankmath.com/kb/configure-sitemaps/#locations-kml-file).

****Please note:****If you fail to enter or enter incorrect geo-coordinates, a blank KML file will be created.

Here’s an example of a KML File:

![KML file in Local sitemap](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201200%20810'%3E%3C/svg%3E)

If Geo-Coordinates are missing, a blank KML file will be created. We update it with multiple location data, including Geo-Coordinates, when you use Multiple Locations CPT.

We’ll now show you how to add KML for multiple locations.

## 5  How to Add KML for Multiple Locations?

Add geo-coordinates by navigating to **WordPress Dashboard → RM Locations.** Edit the location and go to Rank Math’s Schema tab and click on **Schema Generator** as shown below:

![Click on Schema Generator](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20686%20514'%3E%3C/svg%3E)

In the Schema Generator that appears on the screen, click on **Use** against the Local Business Schema.

![Use Local Business Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201310%20558'%3E%3C/svg%3E)

Add the Geo Coordinates in the Schema Builder and click on **Save for this Post**once you have made the changes. You can go through our guide on [how to create multiple locations with the help of Rank Math](https://rankmath.com/kb/multiple-locations/) if you are creating multiple locations for the very first time.

![Geo-coordinates in Schema Builder](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201208%20416'%3E%3C/svg%3E)

Once you’ve added the geo-coordinates, then you can check the KML, and you will see each location as shown below:

![Locations listed in KML sitemap](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201000%20250'%3E%3C/svg%3E)

## 6  Filter to Add Locations KML File in the Sitemap

With the help of the Rank Math SEO plugin, you can also make use of the below filter in order to add locations KML file in the Sitemap.

```
/**
 * Filter to add Locations KML file in the sitemap
 */
add_filter( 'rank_math/sitemap/locations', '__return_true' );
```

However, if you still have any queries, please feel free to contact our [support team](https://rankmath.com/support/), and we’d be happy to help you at any given time.

			

			 

			
	
		
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

		

										
			
- [How to Fix Whitespace Errors Breaking Your XML Sitemap in WordPress](https://rankmath.com/kb/fix-whitespace-errors-in-sitemap/)

										
			
- [How to Submit Your Website to Search Engines](https://rankmath.com/kb/submit-website-to-search-engines/)

										
			
- [How to Configure Sitemaps in Rank Math](https://rankmath.com/kb/configure-sitemaps/)

										
			
- [What Are the SEO Benefits of Sitemaps?](https://rankmath.com/kb/sitemaps-seo-benefits/)

										
			
- [How to Submit a Sitemap to Google](https://rankmath.com/kb/submit-sitemap-to-google/)

										
			
- [Rank Math Sitemap Issues and Their Fixes](https://rankmath.com/kb/fix-sitemap-issues/)