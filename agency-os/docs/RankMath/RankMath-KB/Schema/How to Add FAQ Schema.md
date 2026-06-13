# How to Add FAQ Schema

> **Category:** Schema
> **Source:** https://rankmath.com/kb/faq-schema-block/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Add FAQ Schema

			
			

	

FAQs, or **F**requently **A**sked **Q**uestions, is one of the many Schema types out there. Google used to display it as a rich snippet directly in search results. Here is how it used to look:

![FAQ rich result example](https://rankmath.com/wp-content/uploads/2021/07/FAQ-rich-result-example.png)

However, Google has since deprecated it and no longer displays it in search results. That said, it is still worthwhile to add them to your posts and pages, as they improve user experience and may help AI platforms and systems to understand your content and pull accurate answers from it.

In this knowledgebase article, we’re going to demonstrate how you can add FAQ Schema to your posts using Rank Math quickly and easily.

## Table of Contents

- [Adding FAQ Blocks in Rank Math](#adding-faq-blocks-in-rank-math)

- [FAQ Block Settings](#faq-block-settings)

- [Previewing The FAQ Schema](#previewing-the-faq-schema)

- [Importing Existing FAQs from Yoast](#importing-existing-faqs-from-yoast)

- [Adding FAQ Schema With Rank Math’s Advanced Schema Generator](#schema-generator)

- [Nesting The FAQ Schema](#nesting-the-faq-schema)

- [Removing the Schema](#remove-the-schema)

- [Some Questions About Rank Math FAQ Blocks](#some-questions-about-rank-math-faq-blocks)

- [Important Changes with FAQ Rich Results](#faq-rich-results-changes)

- [Learning All About FAQ Blocks](#learning-all-about-faq-blocks)

## 1  Adding FAQ Blocks in Rank Math

Adding FAQ Schema to your posts is a piece of cake with Rank Math. Start off by opening a new or existing post with the Block Editor.

Rank Math adds a custom block, called **FAQ by Rank Math**, to the Block Editor. You can search for the block, or scroll to find it in the Blocks menu. Click to add it to the post. If you don’t see this block, then ensure that you’ve enabled the Schema module under **WordPress Dashboard → Rank Math SEO**.

![Adding FAQ block](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201254%20688'%3E%3C/svg%3E)

Here is how the FAQ Block will look on the screen for you.

![FAQ block](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201429%20659'%3E%3C/svg%3E)

From here, adding any number of FAQs to your post is easy. Type the question in the question field; answer in the Answer field. Add an image to the question if you prefer, and add more FAQs if you want. Here is an example.

![Adding question and answer to FAQ block](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201423%20867'%3E%3C/svg%3E)

To add another FAQ, click the **Add New FAQ** button and fill the question and answer fields again.

![Adding multiple questions in FAQ block](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201392%201359'%3E%3C/svg%3E)

To delete a specific question, click the Trash icon on the top right of the question. You can also temporarily hide or disable a question by clicking the **eye icon**. This is quite useful when you’re testing multiple questions and don’t want to keep adding the same questions again.

![Delete or hide question in FAQ block](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201452%201375'%3E%3C/svg%3E)

You can also easily rearrange the FAQ questions, as shown below, with the up and down buttons available against each question. The option to rearrange questions is available only in Rank Math PRO.

![Rearrange FAQ questions](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20850%20626'%3E%3C/svg%3E)

Rank Math’s [Content AI](https://rankmath.com/kb/how-to-use-content-ai/) allows you to write frequently asked questions (FAQs) with just one-click. So, if you have enabled Content AI, then click on the AI icon in the FAQ block, and let **Content AI generate the answers**for you.

![Add FAQ using Content AI](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201956%201246'%3E%3C/svg%3E)

## 2  FAQ Block Settings

Since the FAQ Schema is added as a block, it has all the block-related customizations that you’d expect from any other block, plus some additional options that you’ll find only in Rank Math. When the FAQ Block is active, you’ll see the block settings in the sidebar.

![FAQ block options](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20468%20622'%3E%3C/svg%3E)

There are several settings available for the FAQ Block, and here is a brief explanation for each of them.

- **List Style**: Here, you can toggle the list style of the FAQs. The options are _none_, _unordered list_, or _ordered list_.

- **Title Wrapper**: Here, you can select the heading wrapper that will be used for the FAQ questions. For example, if you select _H2_ (default), the questions will appear as an H2 in your post.

- **Image Size**: Here, you can select the image size that will appear with the FAQs. You can choose between _thumbnail_, _medium_, _large_, and_full-size_.

All the styling options mentioned above are **exclusively available with Rank Math.** No other FAQ Schema plugin offers such customization and flexibility.

### CSS Options

You can also style the FAQ Schema with custom CSS using the FAQ Block options. Here is what each of the settings is used for:

- **Title Wrapper CSS Classes**: Enter the CSS class(es) that you want to apply to the questions of the FAQ

- **Content Wrapper CSS Classes**: Enter the CSS class(es) that you want to apply to the answers of the FAQ

- **List CSS Classes**: Enter the CSS class(es) that you want to apply to the list that contains all the FAQs

## 3  Previewing The FAQ Schema

Once you’ve added all the FAQs for the FAQ Schema, you can publish or preview your posts in WordPress, and the appropriate FAQ Schema code will be added to the post by Rank Math. On the frontend, the questions will appear as any other content on your page, but on the backend, the appropriate markup will be applied.

**Here is an example of how the FAQ questions look on the page.**

![Rank Math FAQ front-end](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201563%20632'%3E%3C/svg%3E)

## 4  Importing Existing FAQs from Yoast

If you’ve moved from **Yoast SEO to Rank Math** and used the [initial setup process](https://rankmath.com/kb/how-to-setup/), then your work is already done as Rank Math imports and _converts all of Yoast’s FAQ Blocks to Rank Math during the import process itself._

In case you did not use the initial setup process or started using Rank Math from version v1.0.38 or before, then you will need to convert Yoast FAQ Blocks to Rank Math FAQ Blocks manually. The process just takes a few clicks, and it converts all of the Yoast Blocks to Rank Math Blocks in one go. Here is the process you need to follow:

Head over to **Rank Math SEO → Status & Tools**. From the tabs, navigate to **Database Tools**. If the Database Tools tab is unavailable for you, then make sure you’ve switched to the [Advanced Mode](https://rankmath.com/kb/advanced-mode/) in Rank Math.

![Rank Math Database Tools](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202438%201071'%3E%3C/svg%3E)

From the list of tools, you can scroll down a bit to find the option to convert your Yoast FAQ Blocks (_the option will be available only if Rank Math has detected any Yoast FAQ blocks on your site_).

![Yoast Block Converter](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201694%20273'%3E%3C/svg%3E)

As you click the **Convert Blocks** button, Rank Math will get to work, and start converting your existing FAQ Blocks to Rank Math.

The process may take some time depending on the number of posts that you used FAQ Schema on, so stay patient and do not navigate away from the page until the process is complete.

Once the process is complete, you should see a confirmation message on top of the screen, which should also tell you the number of posts that Rank Math converted.

![Success notification for block conversion](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201835%20356'%3E%3C/svg%3E)

If you open up any of your posts now, you will see that Yoast FAQ Blocks will have been **replaced by Rank Math FAQ Blocks**.

### Converting Yoast Blocks to Rank Math Blocks Individually

It is possible to convert individual FAQ Blocks from Yoast to Rank Math. However, the method requires that both Yoast SEO and Rank Math be installed and activated on your website. For obvious reasons, we do not recommend it, but we wanted to mention that the option exists.

To convert individual FAQ Blocks, head over to the post or page with the FAQ Block, and then select the Block. You should see some buttons appear on top of the Block, which is a sign that the Block is highlighted.

Hover over the first button from the list. Click the button to see the options to change the Block to another Block. Click the **FAQ By Rank Math** Block when you see it. And instantly, the Block will be converted to Rank Math’s FAQ Block.

![Transforming Yoast FAQ block to Rank Math FAQ block](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20730%20596'%3E%3C/svg%3E)

Please remember that this option is included for special cases only, and we highly [discourage you from using two SEO plugins at the same time](https://rankmath.com/kb/keep-only-one-seo-plugin-active/). It is recommended that you use the other methods that we’ve discussed to convert FAQ Blocks.

## 5  Adding FAQ Schema With Rank Math’s Advanced Schema Generator [PRO](https://rankmath.com/pricing/)

Rank Math’s advanced Schema generator provides a user-friendly interface where you can directly add your questions and answers. Once done, Rank Math will generate and embed the Schema markup for you. In this section, we will walk you through the steps to add the FAQ Schema to your page using Rank Math.

### 5.1  Edit Your Post or Page

To add the **FAQ Schema Type**, first head to the edit page for that post, by clicking **Edit**as shown below:

![click on edit post](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20539'%3E%3C/svg%3E)

### 5.2  Open Rank Math in the Gutenberg Sidebar or the Classic Editor

In Gutenberg, click on the Rank Math SEO icon that displays alongside this post/page’s SEO score to open the SEO settings for this page.

Or alternatively, click the three vertical dots in the top right-hand corner of the edit page and select Rank Math in the **Plugins**section – as shown below:

![Click on Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20614%20764'%3E%3C/svg%3E)

Click on the **Schema tab** and then click on **Schema Generator.**

![Click on Schema Generator](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20686%20514'%3E%3C/svg%3E)

In the **Classic editor**, navigate to the Rank Math SEO metabox and select the **Schema tab**. Next, click **Schema Generator**, as shown below.

![Schema Generator in Classic editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201936%20480'%3E%3C/svg%3E)

### 5.3  Open Rank Math’s Schema Builder

Click on **Use** to open the Schema Builder.

![Use FAQ Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201316%20881'%3E%3C/svg%3E)

The Schema Builder will show up with the options as shown below:

![FAQ Schema Builder](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201240%20650'%3E%3C/svg%3E)

Now, let’s have a closer look at each of the available options.

### 5.4  FAQ Schema Type Setup & Available Options

The Rank Math FAQ Schema type settings include several options that let you configure how your questions and answers are structured. In this section, we will cover each available option and what it does.

#### a  Name

Enter the name of the FAQ here.

![Enter the name of the FAQ](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201178%20156'%3E%3C/svg%3E)

#### b  FAQ Shortcode

Copy and paste the shortcode in the content to display the FAQ questions on the front end for the readers.

![Copy Paste the shortcode](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201182%20250'%3E%3C/svg%3E)

In the **Classic editor**, your FAQ Schema type will only be visible on your site when you paste the shortcode into the post editor, as shown below.

![Add FAQ shortcode in Classic editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201929%201234'%3E%3C/svg%3E)

#### c  Questions

Enter the details of the Questions by clicking on **Add Property Group.**The following fields will then appear:

![Fill in the details of the Questions](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201160%201060'%3E%3C/svg%3E)

You can add in the information for a particular question, then click the **Add Property Group** link to add another group. You can then fill in the information in that question as well.

Click on **Save for this Post** once you have made the changes. Now update the existing post/page as you generally would do after making a change or click on **Publish**(if this is a newly created post/page).

**Note:**If you’ve added FAQ Schema using Rank Math’s Advanced Schema Generator, this gives you the ability to manually add the questions to your content however you wish (as long as the content matches what is present in your Schema) without using the FAQ Schema Block.

### Using the FAQ Block in Gutenberg

The benefit of the Schema Generator option is that it allows the FAQ Schema to be used with Classic Editor, Elementor, or any other Page Builder, for that matter, while the FAQ Block only works on Gutenberg.

In the Gutenberg editor, click on the FAQ by Rank Math to use the FAQ Schema.

![Adding FAQ block in Gutenberg editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20928%20455'%3E%3C/svg%3E)

You can then add questions to the FAQ by clicking on **Add New FAQ.**

![Multiple questions in FAQ block](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20826'%3E%3C/svg%3E)

And, that’s it! Once you’re done making any changes to the [FAQ Schema](https://rankmath.com/blog/faq-schema/) for this page, simply update the page as you normally would after making a change, or click **Publish**if this is a newly created page. You can then check your Schema with the help of the [Schema Markup Validator](https://validator.schema.org/).

### **Using the FAQ Schema in Classic Editor**

In the Classic editor, navigate to the Rank Math SEO metabox and click **Schema** → **Schema Generator**, as shown below.

![navigate to the Schema Generator](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201936%20480'%3E%3C/svg%3E)

In the Schema Generator, click on **Use** to select the **FAQ** Schema.

![Select FAQ Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201314%20884'%3E%3C/svg%3E)

Next in the Schema Builder, you can add questions and answers to the FAQ Schema by clicking the **Add Property Group**. Once you’ve added the questions and answers, click **Save for this Post** to save the Schema.

![Add questions to the FAQ Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201312%201306'%3E%3C/svg%3E)

To use the FAQ Schema, return to the Rank Math metabox and click the **Edit icon**of the FAQ Schema, as shown below.

![click Edit icon to edit FAQ Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201932%20686'%3E%3C/svg%3E)

Copy the **SHORTCODE** in the Schema Builder.

![copy the Shortcode](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201304%20742'%3E%3C/svg%3E)

Next, paste the SHORTCODE in the post editor.

![paste the shortcode](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201942%201230'%3E%3C/svg%3E)

After adding the shortcode, the questions and answers in the FAQ Schema will display on your site, as shown below.

![FAQ Schema added](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202002%201072'%3E%3C/svg%3E)

## 6  Nesting the FAQ Schema

One of the best practices in implementing structured data includes connecting different Schemas in a page without leaving them isolated. By nesting and connecting Schema Markup, we offer more meaningful information to search engines so that they can better reflect the page’s actual content.

Thankfully, Rank Math does this nesting different Schemas automatically so that you can focus more on the content. Rank Math can now nest FAQ Schema inside an Article or Product or any CreativeWork Schema. With this nesting, you can tell search engines that the FAQ is about the primary topic you discussed in the article or about the product you reviewed on the page and not about your own website/organization in general.

For instance, if you’re adding the **F**requently **A**sked **Q**uestions about specific software, be sure to add both the [Software Schema](https://rankmath.com/kb/software-schema/) and the FAQ Block to the post/page. Rank Math will automatically nest the FAQ Schema as ‘**subjectOf**‘ inside the Software Schema, conveying search engines that the FAQ page is about the software.

To check the nesting, click the preview icon next to the Schema Markup you’ve added to the page.

![Preview Schema Markup in Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20658%20698'%3E%3C/svg%3E)

And now, you can check the JSON-LD code for the nested Schema Markup, which will look like this.

![Example for FAQ Schema being nested inside Software Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201686%201449'%3E%3C/svg%3E)

And then,****update/publish the page for the nested Schema Markup to be added to your page. You can then check your Schema with the help of the [Schema Markup Validator tool](https://validator.schema.org/).

**Note:**You may notice duplicate FAQ Schema on the Code Validation tab. The duplicated code is not included in your frontend Schema output and will not affect your SEO.

## 7  Removing the Schema

In case you want to add the Rank Math FAQ Block but without adding the Schema Markup, then you can easily do so with a filter.

Head over to your theme’s [rank-math.php](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file) file and add the below code snippet to remove the FAQ Schema data.

```
remove_filter( 'rank_math/schema/block/faq-block', [ RankMath\Schema\Block_FAQ::get(), 'add_graph' ] );
```

## 8  Some Questions About Rank Math FAQ Blocks

Here are some commonly asked questions about Rank Math FAQ Blocks.

### Can you add FAQ Blocks using the Classic editor in WordPress?

Unfortunately, that is not possible. You may add all the FAQs to the post using the Block editor and then switch to the Classic editor. Or, add the content you were planning to add with the classic editor using the Classic Block. Optionally, you can add a FAQ Schema to your post and paste its shortcode in your content.

### Will the FAQ Schema implementation remain intact if I switch editors (classic to block) multiple times?

Yes. The FAQ Schema will work just fine.

### How do I verify if the FAQ Schema is added correctly?

You may use the [Schema Markup Validator tool](https://validator.schema.org/) to test the implementation of the FAQ Schema. However, you don’t have to do it as we’ve tested Rank Math extensively for bugs.

### Do the FAQs increase traffic?

There is no guarantee that adding FAQs to your post will increase your traffic. It used to display a rich snippet directly in search results, but Google has since deprecated this feature. However, it can still contribute by improving user experience and helping AI platforms better understand and surface your content.

### I’ve added FAQs to my page, but they don’t show up on Google. Why?

This is because Google deprecated the FAQ Schema in 2023 and ended support for it in 2026. This means your FAQ rich results will not appear in Google search results.

### Can I add more than 1 FAQ Block per post?

It is good practice to only use 1 FAQ block per page. But we understand that not all users are aware of this limitation. To make sure all our users implement the FAQ Schema correctly, we designed the FAQ Block so that, even if you create more than one FAQ Block, they are combined to create a single block in the code. So, yes, you can create more than one FAQ Block, **but only with Rank Math**.

### I want to learn more about FAQ Schema, where can I find more information?

We’ve put together a comprehensive guide about FAQ Schema, which covers all you need to know about it. You can read it by [clicking this link](https://rankmath.com/blog/faq-schema/).

## 9  Important Changes with FAQ Rich Results

Google reduced support for the FAQ Schema in 2023 and ended support for it in 2026. It no longer displays it in its search results, and the Google Rich Results Test tool, which tests Google-supported Schema, has also removed the FAQ Schema report.

## 10  Learning All About FAQ Schema

Now that you’ve learned about how to add FAQ Schema to your website with Rank Math, and even import your existing FAQ Blocks from Yoast, now it is time to add FAQ Schema to all your posts (where it makes sense). But, before you do that, we’d recommend that you learn all about FAQs, the benefits, the limitations, and the best practices.

**We’ve put together a [helpful guide on FAQ Schema](https://rankmath.com/blog/faq-Schema/) that will help answer all these and more.**

### Conclusion

With Rank Math’s FAQ Block, adding the appropriate FAQ Schema to your blog posts is now effortless. So anytime you write a post on your website that could be made better with some FAQs, use Rank Math to add the appropriate Schema Markup quickly and easily.

			

			 

			
	
		
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