# Rank Math Status and Tools

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/rank-math-status-and-tools/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Rank Math Status and Tools

			
			

	

In this article, we are going to talk about some little-known features of Rank Math—Status and Tools. Both these have always been part of Rank Math, but since they won’t be used day to day as Rank Math’s other tools, they aren’t discussed much.

Even though you will rarely need to use the Status and Tools inside Rank Math, it doesn’t hurt to learn about these options. Who knows, you might encounter a critical situation where you would need to use some of the features we will discuss. At that time, spending a few minutes learning about these features will feel like a wise investment. With that said, let us discuss Rank Math’s Status and Tools section.

To reach the Status and Tools section, you would have to use the Rank Math menu. Hover over it with your mouse and locate the Status and Tools menu entry, and click on it.

![Rank Math Status & Tools](https://rankmath.com/wp-content/uploads/2023/01/status-and-tools-7.jpg)

You will reach the Status and Tools page, which will look something like this.

![status and tools options](https://rankmath.com/wp-content/uploads/2021/05/status-and-tools-options.jpg)

Let us discuss each of the tabs available here one by one.

## Table of Contents

- [Version Control](#version-control)

- [Database Tools](#database-tools)

- [System Status](#system-status)

- [Import & Export](#import-export)

## 1  Version Control

The Version Control includes features that would let you roll back to a specific version of Rank Math, access beta features, and enable automatic updates, in essence, it includes everything related to the version of Rank Math you’re using on your website. We have got a dedicated guide for [using Version Control](https://rankmath.com/kb/version-control/).

## 2  Database Tools

Let us head over to the Database Tools section by clicking the Database Tools button from the available tabs.

![database tools option](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201942%201188'%3E%3C/svg%3E)

You should reach the Database Tools section, which would look something like this.

![Rank Math Database Tools](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201536%204131'%3E%3C/svg%3E)

Before we explain each of the options, let us explain the need for Database Tools. There are many scenarios where you want to reset one or more of Rank Math’s settings. Major website changes, architecture changes, or content re-organization are just some of the scenarios where you’d want to erase or reset one or more settings.

Now, you might be thinking that most Rank Math’s settings have options to clear out the data by themselves, like the 404 monitor, where you can delete all the 404 errors. While that is true that you can delete data from a few of the settings themselves, Rank Math will still preserve some internal data for logging and diagnosis. So it is not a complete wipe. In most cases, you shouldn’t feel a change, but if you’ve made big changes, especially if you have custom-coded some functionality, you’d want a clean slate to start with. That is where the Database Tools come in. They are designed to give you extra control over Rank Math’s data by allowing you to erase data from a few of the features completely.

Now that you’ve understood, let us explain each of the options briefly.

### 2.1  Flush SEO Analysis Data

You already know that Rank Math includes a pretty powerful SEO analysis tool, and you can read all about it on its [dedicated KB](https://rankmath.com/kb/seo-analysis/).

To keep track of your SEO improvements, some of your historical data is stored by Rank Math. If there arises a scenario where you wish to delete that information, you can do so by using this option.

To delete the data, simply click the **Clear SEO Analysis** button. If you’re unable to see this option ensure that you’ve enabled the **SEO Analysis** module of Rank Math.

![Flush SEO Analysis](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202038%20302'%3E%3C/svg%3E)

### 2.2  Remove Rank Math Transients

To understand this option, you have to understand what transients are first. [Transients](https://rankmath.com/blog/wordpress-transients/) are a data-storage option inside WordPress, and it is used to cache information that takes a lot of time to retrieve.

Since Rank Math fetches a lot of information about your website inside the posts, for SEO analysis, redirections, 404s, and all the other options, it uses transients to fetch a lot of this information and store it effectively without increasing the load of your server. Rank Math does so by using the WordPress transient API, which makes it easy to manage as well.

The advantage of transients over other caching methods is that it self-expires. With every transient record, there is also a record of when the transient should expire—making it storage efficient as well.

But, there are some rare scenarios, for example, when your entire website’s architecture or content changes, where the number of transients can become too large. Most of the time, WordPress and Rank Math can work around this problem, but if you have issues, you can use this option to clear all the transients created by Rank Math.

To do that, simply click the **Remove Transients** button.

![Remove Rank Math Transients](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20985%20165'%3E%3C/svg%3E)

And all the transients will be cleared. Remember, when you clear your transients, your website’s admin area might work sluggishly for some time as the transient cache will be rebuilt from scratch.

### 2.3  Purge Analytics Cache

Rank Math 1.0.50+ comes with an option to show Analytics right inside your WordPress dashboard. If that feature is not working correctly, getting too large for your website, or if the data is showing skewed numbers, use this option to purge the Analytics cache and start afresh. The Purge Analytics Cache will be shown only if you’ve enabled the Analytics module on your website.

![Purge Analytics cache](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20987%20150'%3E%3C/svg%3E)

### 2.4  Rebuild Index for Analytics

If you are missing some posts/pages in the Analytics data or the numbers are not correct, use this option to rebuild the index and get more accurate data from your Google Analytics account.

![Rebuild Index for Analytics](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20964%20140'%3E%3C/svg%3E)

### 2.5  Clear 404 Monitor Log

Rank Math has a powerful 404 monitor built-in, which captures and lets you manage your website’s 404 errors with ease. If you want to learn more about it, you can do so by reading the dedicated [knowledgebase article](https://rankmath.com/kb/monitor-404-errors/) we’ve written about it.

The 404 monitor not only captures your website’s 404 errors but also lets you delete individual errors after you’ve fixed them. If the error comes up again, it will be captured once again and shown as a fresh error. Since you can delete individual errors, why is there a dedicated option to delete the entire 404 log?

The reason for that is simple. When you update your website, you can accidentally introduce changes that “breaks” your URLs, which in turn can cause thousands, or even millions of 404 errors (depending on your website and the traffic it gets). In the sea of errors, how would we differentiate the actual errors from all the other errors? Actually, you can’t, and it would make more sense to clear the 404 error log and start capturing errors again. Of course, there might be other scenarios where this option might be useful, but this is the one that could be easily explained.

To delete the 404 error log, click the **Clear 404 Log** button.

![Clear 404 Log](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20965%20162'%3E%3C/svg%3E)

### 2.6  Re-create Missing Database Tables

Over the period of time, your database will grow in size. In case, while trying to clean the database, if you accidentally deleted any database table that Rank Math uses, then some of the Rank Math functions would not work as expected, and you might see database errors on your website.

In that case, choose the **Re-create Tables** button, and Rank Math would automatically create any missing database table.

![Re-create missing database tables](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20970%20142'%3E%3C/svg%3E)

### 2.7  Generate Video Schema for Old Posts/Pages [PRO](https://rankmath.com/pricing/)

If you’ve configured the [Autodetect Video feature](https://rankmath.com/kb/add-video-schema-to-existing-posts/) of Rank Math and enabled the Schema module as well, then Rank Math would automatically detect videos on your posts and pages and generate the Video Schema.

But what about your existing posts that include videos?

The Generate Video Schema for Old Posts/Pages under the Database Tools would help you with that. Click the **Generate** button, and you’ll be prompted for confirmation. Click **Ok**.

![Generate Video Schema for Old Posts](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20960%20161'%3E%3C/svg%3E)

Now Rank Math would start to look for videos and generate Video Schema for the post types you’ve configured, and once the process is completed, you’ll see a success message.

### 2.8  Fix Analytics Table Collations

If you’re using Rank Math’s Analytics, it is possible that you may come across a situation where the Analytics database tables or columns may not match with each other and it may lead to database errors.

This tool is created exactly to fix this issue. Click the **Fix Collations** button and instantly the tool will start to check for any database collations and fixes them.

**Note:** This option will be available only if you’ve enabled the Analytics module in Rank Math.

![Fix Analytics table collations](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201040%20167'%3E%3C/svg%3E)

### 2.9  Yoast Block Converter

When you switch over to Rank Math from Yoast, all your data is imported using the import option. You’ll have the option to import your Yoast Blocks as well.

In case, if you haven’t imported your Blocks earlier, you can use this option available under Database Tools. When you click the **Convert Blocks** button, Rank Math will convert FAQ and HowTo Blocks created by Yoast into Rank Math’s respective Blocks.

**Note**: This option will be available in the Database Tools section, only if your website has existing Yoast Blocks.

![Yoast Block Converter](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20970%20158'%3E%3C/svg%3E)

### 2.10  Delete Internal Links Data

Rank Math has many fantastic features around internal links. Not only can Rank Math analyze your content and suggest the most appropriate internal links, but it can also keep track of the number of internal links each post makes and receives. This information is used to give your posts an SEO score, which is critical to optimize if you want to create content optimized for SEO.

As expected, Rank Math caches a lot of this information to prevent additional load on your server. But, if you make major changes to your website’s architecture, you might find it efficient to clear this cache using this option.

A bit of clarification. Even though the button next to the option says “Delete Internal Links”, this option will **not delete** your internal links. Rather, this will only delete the **metadata about the internal links** that Rank Math has captured.

To delete the data, click the **Delete Internal Links** button, and in case if you’re unable to find this database tool, ensure that you’ve enabled the **Link Counter** module in Rank Math.

![delete internal links data](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201998%20300'%3E%3C/svg%3E)

### 2.11  Delete Redirection Rules

If your website had 404 errors, then it is likely that you’ve used the Redirection Manager built inside Rank Math. It is a powerful tool that lets you create, edit, enable, disable, or delete redirects. If you’d like to learn more about the Redirect Manager, then you can refer to the [dedicated knowledgebase article](https://rankmath.com/kb/setting-up-redirections/) we’ve written about it.

Although the Redirect Manager has a built-in option for deleting the redirects you create, the process does take a couple of steps. First, the redirects go to the trash, then you have to delete them from the trash for them to be gone completely.

In many cases, that is not what you need. For example, if you change the entire structure of your website, then it is a wise choice to clear all the redirects from your website, including the metadata. To achieve that, you can use this option.

If and when you use this option, all the redirects that you’ve created, along with their metadata, will be deleted permanently. This behaviour is different from all the other options that we’ve discussed, as it deletes the actual data, not just the metadata. Proceed with caution.

To delete the redirections, click the **Delete Redirections** button.

![delete redirections](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202012%20326'%3E%3C/svg%3E)

### 2.12  Delete Old Schema Data

When Google first started using structured data in Google search, it was a rudimentary implementation. You usually had just one _type_ of Schema on a page. But, as Schema evolved, this has changed.

Now, it is not uncommon for a single page to have 2,3, or more Schema types on a single page. For example, a restaurant that does a food delivery service might have a Restaurant Schema, a Service Schema, a Review Segment, and a Local Business Schema, all on each page. While Google has no issues understanding all the Schema on the page, this does give rise to a new problem.

**_Hierarchy_**.

You see, having lots of Schema on the page can sometimes be confusing. Let us take an example. A page for a simple recipe can have a Recipe Schema, a Video Schema, a Breadcrumb Schema, and a Review Schema. In this case, should Google assume that this is primarily a video page with a recipe or vice versa? Knowing the right answer is important, as it can help Google understand which results should specific pages be displayed on.

To counter this issue, Google started supporting **nested Schema**, which means a hierarchical implementation of Schema on the page. This leaves little room for imagination, which ensures that your pages will gain impressions for the right queries. It is important to note that, currently, Google is fine with any implementation. So, if you’ve implemented Schema in the old way, it should still be fine. You can read more about this in **[Google’s documentation](https://developers.google.com/search/docs/guides/sd-policies#multiple-items)**.

#### What Does This Mean for You?

Enough context. Well, in the early days, when we introduced Schema in Rank Math, we did it the old way as well. But now, we’ve transitioned to nested/tree Schema.

Rank Math version after 1.0.48 will automatically transition your website to the new Schema type. So, you don’t have to do anything to prepare.

But, with millions of variables, some websites might experience issues with Schema on the old pages and may need to remove the old Schema data.

So we have this option to remove old Schema data, when available. Using this option is simple. But the process is irreversible, and the metadata prefixed with `rank_math_snippet` will be completely removed. So use it only if you’re facing issues or when instructed by our support staff, click the **Delete** button on the page. You will see a confirmation box on the screen. Click “OK” to confirm and start the deletion process.

![Delete Old Schema Data](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20970%20160'%3E%3C/svg%3E)

### 2.13  Update SEO Scores

Long-time users of Rank Math would notice Rank Math’s SEO scoring algorithms have improved over the period. In these cases, the SEO score shown on the Posts page for your old posts may not be the actual reflection of the current SEO score, and you may discover them only when you open the post and let Rank Math run the scoring algorithm.

There could also be other instances like migrating to Rank Math SEO from other SEO plugins where the focus keyword would have been directly imported from the other SEO plugin. Rank Math would have never run the scoring algorithm for these posts and displays N/A instead.

This database tool will help you resolve these issues by recalculating the SEO score for all your **published** posts where the **focus keyword is set**.

To use this tool, simply click the **Recalculate Scores** option.

![Update SEO Scores](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201052%20184'%3E%3C/svg%3E)

Now, a new popup would open, and Rank Math would start recalculating the SEO Scores for your published posts where the focus keyword is set.

![Recalculating SEO Scores](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201055%20449'%3E%3C/svg%3E)

**Note:** The process takes some time depending upon the number of posts on your website. We request you keep the browser open until the process ends.

Once done, you’ll see a success message as shown below.

![Recalculating SEO Scores is complete](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201059%20463'%3E%3C/svg%3E)

### 2.14  Cancel Content AI Bulk Editing Process

Content AI enables you to [generate SEO Meta tags](https://rankmath.com/kb/bulk-generate-seo-meta-tags/) for your posts in bulk. All you have to do is select the posts and choose one of the options to bulk generate SEO Meta tags. Once the process starts, you will see a notice, and it will take a few minutes to complete, depending on the number of posts chosen.

Sometimes, this bulk editing process might stall and prevent you from using any [other bulk editing feature of Rank Math](https://rankmath.com/kb/bulk-editing-in-rank-math/).

This database tool will help you resolve the issue by terminating the ongoing bulk edit process. To use this tool, simply click the **Terminate** option, and any pending modifications to your SEO Meta tags will revert to the original state.

**Note:** This database tool will be available only if you have an ongoing Content AI bulk editing process.

![Cancel Content AI Bulk Editing Process](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201051%20174'%3E%3C/svg%3E)

### 2.15  GTIN Migration Tool for WooCommerce

The Global Trade Item Number (GTIN) is a unique identifier used to track products in the global market, manage inventory, and create barcodes for both physical and digital items.

Previously, WooCommerce didn’t have a built-in GTIN field before, so Rank Math PRO added one in the product edit pages. However, since version 9.2, WooCommerce includes a native GTIN field. Hence, Rank Math has removed its own field to use WooCommerce’s built-in functionality.

If you were using Rank Math’s GTIN field, your data will be automatically migrated to WooCommerce’s GTIN field when you update the plugin.

If the automatic migration doesn’t happen, or you prefer to do it manually, use the **GTIN Migration Tool for WooCommerce** and click the **Migrate** button.

![GTIN Migration Tool for WooCommerce ](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201288%20176'%3E%3C/svg%3E)

A notice will appear indicating that the migration has started, and you’ll be notified once it’s complete.

![The GTIN values from the plugin are being transferred to the built-in WooCommerce GTIN field](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20288'%3E%3C/svg%3E)

After the migration, a message will confirm its success, along with a summary of how many GTIN entries were successfully migrated.

![GTIN value has been successfully migrated to the WooCommerce GTIN field ](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20256'%3E%3C/svg%3E)

## 3  System Status

The System Status section might look pretty confusing and disorienting, and you might even be overwhelmed with the amount of information there and what to do with it.

Worry not, as the information in the System Status section is **just for reference**. You don’t even need to know it unless you are a developer or if Rank Math is not behaving as expected on your website. In those cases, we might request the information from this screen, along with some more information, to diagnose and fix issues.

Just so you know, the System Status page is divided into 2 parts.

### 3.1  System Info

The System Info includes multiple sections, with each section having relevant information grouped into. For instance, if you were to check the Database section, it would look something like this:

![database record rankmath](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201908%20790'%3E%3C/svg%3E)

### 3.2  Error Log

The Error Log section will include a log with errors generated by Rank Math in the reverse order (limited to the last 100 lines). This is useful for the Rank Math support expert to look into when you’re experiencing any technical glitch with Rank Math on your website.

![Error Log](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201037%20649'%3E%3C/svg%3E)

To paraphrase, the Status section gives you an overview of how Rank Math is functioning under the hood, and it is only useful when you want to peek under the hood. Otherwise, you can leave it be and enjoy Rank Math.

## 4  Import & Export

We have a guide dedicated to using the [extensive import and export options](https://rankmath.com/kb/import-export-settings/) in Rank Math. We have covered every single option you see in the tab, and we guide you every step of the way, so none of your previous data gets lost during the transfer.

And, that’s it! We hope the tutorial was helpful in understanding the features available in Rank Math Status & Tools. If you still have absolutely any questions, please [feel free to reach our support team directly from here](https://rankmath.com/support/), and we’re always here to help.

			

			 

			
	
		
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

		

										
			
- [How to Fix the Japanese Keyword Hack in WordPress](https://rankmath.com/kb/fix-japanese-keyword-hack/)

										
			
- [How to Disable Directory Listing in WordPress](https://rankmath.com/kb/disable-directory-listing/)

										
			
- [How Rank Math Prevents Duplicate Content Issues in a WooCommerce Store](https://rankmath.com/kb/woocommerce-duplicate-content-issues/)

										
			
- [How to Fix Indexing Issues in Google Search Console](https://rankmath.com/kb/fix-google-indexing-issues/)

										
			
- [How to Resolve Wordfence Warning for update-1.0.42.php?](https://rankmath.com/kb/fix-wordfence-warning/)

										
			
- [Why GSC Shows “No Referring Sitemaps Detected”](https://rankmath.com/kb/no-referring-sitemaps-detected/)