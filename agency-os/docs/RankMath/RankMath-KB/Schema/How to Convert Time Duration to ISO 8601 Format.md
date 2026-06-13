# How to Convert Time Duration to ISO 8601 Format

> **Category:** Schema
> **Source:** https://rankmath.com/kb/iso-8601-format/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Convert Time Duration to ISO 8601 Format

			
			

	

Schema.org requires the usage of the ISO 8601 format [to represent durations in structured data](https://schema.org/Duration). This ensures search engines can properly interpret time-based information, such as video lengths, podcast durations, and event schedules.

If your duration is in a standard format like “1 hour 30 minutes,” you must convert it to ISO 8601 and use it in Schema for search engines like Google to recognize.

In this knowledgebase guide, we’ll explain how to manually convert any duration into the correct ISO 8601 format.

## 1  What is ISO 8601 Duration Format?

ISO 8601 is an international standard for representing date and time-related data. The **ISO 8601 duration format** specifically defines how to express periods of time, such as the difference between two dates or times, in a standardized way.

It’s required when setting up your Schema markup in Rank Math for [videos](https://rankmath.com/kb/video-schema/#duration), [podcasts](https://rankmath.com/kb/podcast-schema/#episode-duration), courses, and other time-based data.

ISO 8601 expresses time durations using a structured pattern:

`PTnHnMnS`

Here’s how it breaks down:

- PT: This stands for ‘Period of Time’ and is always at the beginning.

- {n}H for hours

- {n}M for minutes

- {n}S for seconds

![The ISO 8601 time duration structured pattern](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202700%202200'%3E%3C/svg%3E)

Here, {n} represents the number of hours, minutes, or seconds. For example:

- 37 minutes is written as PT37M

- 1 hour and 30 minutes is written as PT1H30M

- 2 hours, 15 minutes, and 30 seconds is written as PT2H15M30S

## 2  How to Manually Convert Duration to ISO 8601 Format

To convert your time duration into ISO 8601 format, follow these steps:

### 2.1  Identify the Duration

First, note down the duration in hours, minutes, and seconds. For example:

If the duration is 2 hours, 15 minutes, and 30 seconds, note it as `2 hours, 15 minutes, and 30 seconds`.

### 2.2  Use the ISO 8601 Format Rules

To convert the duration into ISO 8601 format:

- **Start with `PT`:**This indicates the beginning of the duration format. This is mandatory and always comes first.

- **Include hours (H):** If the duration includes hours, add the number of hours followed by `H`. For example, `1 hour` becomes `1H`.

- **Include minutes (`M`):** If the duration includes minutes, add the number of minutes followed by `M`. For example, `30 minutes` becomes `30M`.

- **Include seconds (`S`):** If the duration includes seconds, add the number of seconds followed by `S`. For example, `30 seconds` becomes `30S`.

- **Omit zero values:** If a value is `0`, you can skip it. For example, if there are`0 hours`, you don’t need to include `0H`.

### 2.3  Combine the Values

Now, combine the values in the correct order: `PT` + hours (`{n}H`) + minutes (`{n}M`) + seconds (`{n}S`).

Let’s look at some examples to see how this works in practice:

| Standard Time Format | Conversion Steps | Final ISO 8601 Format |
|---|---|---|
| 2 hours, 15 minutes | PT → 2H → 15M | PT2H15M |
| 45 minutes, 10 seconds | PT → 45M → 10S | PT45M10S |
| 1 hour, 30 seconds | PT → 1H → 30S | PT1H30S |
| 50 minutes | PT → 50M | PT50M |
| 3 hours | PT → 3H | PT3H |
| 1 hour, 5 minutes, and 30 seconds | PT → 1H → 5M → 30S | PT1H5M30S |

## 3  A Few Special Cases to Keep in Mind

Here are some scenarios you might run into:

- **No Hours:** If the duration is less than 1 hour, only include minutes and/or seconds. For example, 37 minutes becomes PT37M, and 45 seconds becomes PT45S.

- **No Minutes:** If the duration is in whole hours, only include hours. For example, 1 hour becomes PT1H.

- **No Seconds:**If the duration doesn’t have any seconds, you can omit the S part. For example, 1 hour and 30 minutes becomes PT1H30M.

By following this guide, you can correctly format durations for structured data, improving your site’s SEO and structured data compliance. If you have any questions or need further assistance with Rank Math, feel free to [reach out to our support team](https://rankmath.com/support/). They’re available 24/7, 365 days a year, and always happy to help!

			

			 

			
	
		
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

		

										
			
- [How to Get a YouTube API Key](https://rankmath.com/kb/how-to-get-a-youtube-api-key/)

										
			
- [How to Add Merchant Return and Shipping Policy in WooCommerce?](https://rankmath.com/kb/merchant-return-and-shipping-policy/)

										
			
- [What is WebSite Schema and How Do You Implement It?](https://rankmath.com/kb/website-schema/)

										
			
- [How to Implement sameAs Schema on Your Website](https://rankmath.com/kb/sameas-schema/)

										
			
- [How to Implement Author SEO on Your Website to Boost E-E-A-T](https://rankmath.com/kb/author-seo/)

										
			
- [How to Add Profile Page Schema Markup?](https://rankmath.com/kb/profilepage-schema/)