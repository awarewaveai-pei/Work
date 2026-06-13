# How to Display Business Location Data on Your Website Using a Shortcode

> **Category:** Schema
> **Source:** https://rankmath.com/kb/location-data-shortcode/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Display Business Location Data on Your Website Using a Shortcode

			
			

	

In this knowledgebase article, we’ll show you how to use Rank Math to display your business location data using shortcodes.

Adding location data becomes even simpler if you’re using the Gutenberg Block Editor. Rank Math offers a dedicated **Local Business by Rank Math** block that easily adds location data for [multiple locations](https://rankmath.com/kb/multiple-locations/).

![Local Business block](https://rankmath.com/wp-content/uploads/2023/11/localbusiness-block.jpeg)

However, if you prefer the Classic Editor, the easiest way to add this information to your posts and pages is by using the Location Data shortcode.

## 1  Displaying Business Location Data Using Shortcode

Here’s a step-by-step process to get started.

### 1.1  Access Rank Math’s Schema Generator

In the Classic Editor, locate Rank Math’s Metabox, typically visible at the end after the post-edit area.

![Schema Generator in Classic editor](https://rankmath.com/wp-content/uploads/2023/11/schema-generator-classic-editor-1.jpeg)

### 1.2  Open Local Business Schema

Once in the Schema Generator, look for the Local Business Schema and proceed to edit. This will bring up the Schema Builder, where you can find your location’s shortcode.

![Shortcode option in Classic editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201860%201262'%3E%3C/svg%3E)

The Location ID is the Post ID of the Rank Math Location post that you’ll create for a location:

![Location ID](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202472%2096'%3E%3C/svg%3E)

### 1.3  Copy and Paste the Shortcode

Copy the shortcode and place it in the Classic editor. Click on **Update/Publish** to save the changes.

![Paste the shortcode](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202554%20992'%3E%3C/svg%3E)

When you view the post, all the information will be added, as shown below.

![Information added to the post.](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201358%20944'%3E%3C/svg%3E)

When utilizing Rank Math PRO’s Local SEO Module to create multiple locations, you can effortlessly [auto-generate your KML sitemap for business locations](https://rankmath.com/kb/kml-sitemap/).

## 2  How to Create Custom Shortcodes for Displaying Business Location Data

While you can copy and use the shortcode from the Schema Builder, as we have shown in the previous step, you can also construct one with custom attributes.

Here is an example of the shortcode:

`[rank_math_local type="address" locations="297"]`

The shortcode pulls location data and requires at least the “type” and “locations” attributes, but more attributes are available for customization.

For instance, if you want to show the address along with the opening hours, the shortcode will be:

```
[rank_math_local type="address" locations="297" show_opening_hours="true"]
```

The opening hours and the address will be displayed, as shown below.

![Information added using custom shortcode](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201498%201186'%3E%3C/svg%3E)

Let’s now discuss all the attributes in the next section.

## 3  Rank Math’s Local SEO Attributes

Rank Math makes the following attributes available:

### 3.1  Type

This attribute lets you mention the address, opening-hours, map, store-locator. By default, it is set to address.

**Accepted values:** `map`, `opening-hours`, `store-locator`, `address`

**Default value:** `address`

```
type
```

### 3.2  Locations

This attribute is the ID of the location to be shown. By default, it is set to show all locations.

```
locations
```

### 3.3  Terms

This attribute indicates the location to show from a specific Location category.

```
terms
```

### 3.4  Limit

This attribute indicates the number of location to show.

```
limit
```

### 3.5  Show Company Name

By default this attribute is set to 1 (true) and displays the name of the company.

**Accepted values:** `1`, `0`

**Default value:** `1`

```
show_company_name
```

### 3.6  Show Company Address

**Accepted values:** `1`, `0`

**Default value:** `1`

```
show_company_address
```

### 3.7  Show On One Line

This attribute displays the company’s address in one line. By default it is set to false.

**Accepted values:** `1`, `0`

**Default value:** `0`

```
show_on_one_line
```

### 3.8  Show State

This attribute displays the State of your Business and by default, it is set to true.

**Accepted values:** `1` , `0`

**Default value:** `1`

```
show_state
```

### 3.9  Show Country

This attribute displays the country’s name of your Business and by default, it is set to 1 (i.e. true).

**Accepted values:**`1,0`

**Default value:** `1`

```
show_country
```

### 3.10  Show Telephone

This attribute displays the telephone number and by default is set to 1 (i.e. true).

**Accepted values:**

**Accepted values:**`1,0`

**Default value:** `1`

```
show_telephone
```

### 3.11  Show Secondary Number

This attribute displays the secondary number and by default is set to 1 (i.e. true).

**Accepted values:** `1,0`

**Default value:** `1`

```
show_secondary_number
```

### 3.12  Show Fax

This attribute displays the fax and by default, it is set to false.

**Accepted values:** `1`, `0`

**Default value:** `0`

```
show_fax
```

### 3.13  Show Email

This attribute displays the email address and by default, it is set to 1 (i.e. true).

**Accepted values:** `1`, `0`

**Default value:** `1`

```
show_email
```

### 3.14  Show URL

**Accepted values:** `1`, `0`

**Default value:** `1`

```
show_url
```

### 3.15  Show Logo

This attribute displays the logo and by default, it is set to 1 (i.e. true).

**Accepted values:** `1`, `0`

**Default value:** `1`

```
show_logo
```

### 3.16  Show VAT ID

This attribute displays the VAT ID and by default, it is set to false.

**Accepted values:** `true`, `false`

**Default value:** `false`

```
show_vat_id
```

### 3.17  Show Tax ID

This attribute displays the tax ID and by default, it is set to false.

**Accepted values:** `1`, `0`

**Default value:** `0`

```
show_tax_id
```

### 3.18  Show Chamber of Commerce ID

This attribute displays the chamber of commerce ID and by default, it is set to false.

**Accepted values:** `1`, `0`

**Default value:** `0`

```
show_coc_id
```

### 3.19  Show Price Range

This attribute displays the price range and by default, it is set to false.

**Accepted values:** `1`, `0`

**Default value:** `0`

```
show_pricerange
```

### 3.20  Show Opening Hours

This attribute displays the opening hours of your business and by default, it is set to false.

**Accepted values:** `1`, `0`

**Default value:** `0`

```
show_opening_hours
```

### 3.21  Show Days

This attribute displays the opening hour of a specific day. Default Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.

**Accepted value:**

**Default value:** `Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday`

```
show_days
```

### 3.22  Hide Closed Days

This attribute hides the days when your business is closed or not working. By default, it is set to false.

**Accepted values:** `1`, `0`

**Default value:** `0`

```
hide_closed_days
```

### 3.23  Show Opening Now Label

This attribute displays the Open Now label when a company is currently open based on the user’s timezone. It is enabled by default.

**Accepted values:** `1`, `0`

**Default value:** `1`

```
show_opening_now_label
```

### 3.24  Opening Hours Note

This attribute adds a note after Opening hours data.

**Accepted values:**

**Default value:** `Open Now`

```
opening_hours_note
```

### 3.25  Show Map

This attribute displays the map and is by default it is set to false.

**Accepted values:** `true`, `false`

**Default value:** `false`

```
show_map
```

### 3.26  Map Style

This attribute displays the map style. By default, it shows roadmap.

**Accepted values:** `hybrid`, `satellite`, `roadmap`, `terrain`

**Default value:** `roadmap`

```
map_style
```

### 3.27  Map Width

This attribute displays the width of the map. By default, it is set to 100%.

**Accepted values:**

**Default value:** `100%`

```
map_width
```

### 3.28  Map Height

This attribute displays the height of the map. By default, it is set to 300px.

**Accepted values:**

**Default value:** `300px`

```
map_height
```

### 3.29  Zoom Level

This attribute displays the map zoom level. By default, it is set to -1.

**Accepted values:**

**Default value:** `-1`

```
zoom_level
```

### 3.30  Allow Zoom

This attribute is used in the map and lets you zoom. By default, it is set to 1 (i.e. true).

**Accepted values:** `1`, `0`

**Default value:** `1`

```
allow_zoom
```

### 3.31  Allow Scrolling

This attribute is used in the map and allows scrolling. By default, it is set to true.

**Accepted values:** `true`, `false`

**Default value:** `true`

```
allow_scrolling
```

### 3.32  Allow Dragging

This attribute is used in the map and allows dragging. By default, it is set to 1 (i.e. true).

**Accepted values:** `1`, `0`

**Default value:** `1`

```
allow_dragging
```

### 3.33  Show Route Planner

This attribute is used in the map to display the route planner. By default, it is set to true.

**Accepted values:** `true`, `false`

**Default value:** `true`

```
show_route_planner
```

### 3.34  Route Label

This attribute is used in the map and you can use the value from the Settings.

**Default value:** My Route

```
route_label
```

### 3.35  Show Category Filter

This attribute filters displays`filter locations by Category` dropdown in Map. By default, it is set to false.

**Accepted values:** `1`, `0`

**Default value:** `0`

```
show_category_filter
```

### 3.36  Show Marker Clustering

This attribute is used in map and by default, it is set to true.

**Accepted values:** `1`, `0`

**Default value:** `1`

```
show_marker_clustering
```

### 3.37  Show Info Window

This attribute is used in map and by default, it is set to true.

**Accepted values:** `1`, `0`

**Default value:** `1`

```
show_infowindow
```

### 3.38  Show Radius

This attribute displays the radius and is used in the map. By default, it is set to true.

**Accepted values:** `1`, `0`

**Default value:** `1`

```
show_radius
```

### 3.39  Show Nearest Location

This attribute displays whether to show the Location nearest to the current location of the user. By default, it is set to true.

**Accepted values:** `true`, `false`

**Default value:** `true`

```
show_nearest_location
```

### 3.40  Search Radius

This attribute is used in Store Location to search locations within the given radius – Default 10 in kilometers, can be changed to miles from the Titles & Meta settings as shown below:

![Measurement System](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202412%201014'%3E%3C/svg%3E)

**Accepted values:**``

**Default value:** `10`

```
search_radius
```

We hope that this tutorial has helped you to display the location data using a shortcode. However, if you still have any queries please feel free to contact our [support team](https://rankmath.com/support/) and they’d be happy to help you at any given time.

			

			 

			
	
		
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