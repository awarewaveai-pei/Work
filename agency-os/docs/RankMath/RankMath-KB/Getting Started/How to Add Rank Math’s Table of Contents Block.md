# How to Add Rank Math’s Table of Contents Block

> **Category:** Getting Started
> **Source:** https://rankmath.com/kb/table-of-contents-block/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Add Rank Math’s Table of Contents Block

			
			

	

Have you ever stopped reading an article because it was too long, you got bored, or you couldn’t find the section you were looking for? This might not have happened if the author had included a table of contents.

Agree?

But you need not worry. We’re always looking for ways to make your work easier. One of the tools that can help you improve the [readability of an article](https://rankmath.com/kb/table-of-contents/) is a table of contents located at the top of the page.

Rank Math makes it extremely simple to add a Table of Contents block to your article without hassle. In this knowledgebase article, we’ll show you how to create a TOC block using Rank Math.

![How to Add a Table of Contents For Your Articles](https://img.youtube.com/vi/N2SHiY6pBwg/maxresdefault.jpg)
__

**Note:** Rank Math’s Table of Contents Block is available only for the **Block Editor**. If you’re using Classic Editor or other page builders like Elementor, Divi, we recommend checking [other compatible TOC plugins listed here](https://rankmath.com/kb/table-of-contents/).

  
## Table Of Contents

  

    
- [Add TOC Block Using Rank Math](#add-toc-using-rank-math)
    
- [Customizing Table of Contents Block](#toc-block-options)
    
- [Table of Contents Block Settings](#toc-block-settings)
    
- [Table of Contents Block Global Settings](#global-settings)
    
- [Create a Reusable Table of Contents Block](#reusable-table-of-contents)
    
- [Convert Table of Contents Blocks from Yoast / AIOSEO to Rank Math](#convert-toc-block-yoast-aiseo)
    
- [Common Table of Contents Issues and Their Fixes](#table-of-contents-issues-and-fixes)
    
- [Frequently Asked Questions](#faq)
  

## 1  Add TOC Block Using Rank Math

We’ll now discuss how to add a TOC block using Rank Math.

### 1.1  Install and Activate Rank Math

First, [install and activate](https://rankmath.com/kb/installing-through-the-admin-panel/) the Rank Math plugin on your site. We recommend using Rank Math as it saves you time by automatically generating the table of contents based on your headings and making it completely customizable with editable links.

Upon activation, you’ll need to configure the plugin using the Rank Math setup wizard. For detailed instructions, see our guide on correctly [setting up Rank Math](https://rankmath.com/kb/how-to-setup/) for WordPress.

Once you’ve installed and configured the plugin, adding a TOC block using Rank Math is a pretty simple process.

**Note:**To use the TOC block, please ensure you’ve [enabled the Schema module](https://rankmath.com/kb/rich-snippets/#enabling-schema).

### 1.2  Adding Table of Contents Block

Navigate to your post/page editing screen where you wish to add the table of contents. In the post-editing screen, click the **‘+ ‘** icon and locate the **Table of Contents by Rank Math** block.

![Reset all Dimensions setting](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202434%20888'%3E%3C/svg%3E)

Once you’ve added the Table of Contents by Rank Math block, add a title for your table of contents. Next, Rank Math will automatically generate TOC from the post’s content.

![Reset all Dimensions setting](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201448%20784'%3E%3C/svg%3E)

The plugin automatically **identifies the headings on the page**and adds them to your table of contents, linking to the corresponding sections within your post or page. If you use different heading tags (say H2 and H3), lower-level headings will be indented to show the structure of your content.

For instance, if you start with an H2 Heading block and then add an H3 to H5 below it, these will get incrementally nested and added as sub-headings, as shown below.

![Headings in Table of Contents Block](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201342%20722'%3E%3C/svg%3E)

Rank Math automatically includes the `SiteNavigationElement` Schema for the headings added to the Table of Contents block. This applies only to the Table of Contents block by Rank Math and not to all the Table of Contents plugins.

![Automatically added SiteNavigationElement](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%201129'%3E%3C/svg%3E)

## 2  Customizing Table of Contents Block

Rank Math’s Table of Contents Block includes several options to help you customize the table of contents to suit your needs. Let’s discuss them in detail.

### 2.1  Edit Headings in TOC Block

Our Table of Contents block is also **completely editable.** For instance, if the heading in the article is too long, you can consider having a trimmed version in the Table of Contents block by directly editing it in the Table of Contents block, as shown below.

![Editable Table of Contents](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20500%20420'%3E%3C/svg%3E)

### 2.2  Hide Headings in TOC Block

You can click the **eye icon** next to the headings if you wish to hide a certain heading.

![Hide the headings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201524%20782'%3E%3C/svg%3E)

### 2.3  Automatic Anchor Links for Headings

WordPress provides a useful filter that is recommended for automatically generating [anchor texts](https://rankmath.com/seo-glossary/anchor-text/). You can implement it with the following code:

```
add_filter(
    'block_editor_settings_all',
    static function( $settings ) {
        $settings['generateAnchors'] = true;
        return $settings;
    }
);
```

**Rank Math’s Table of Contents (TOC) block will only generate heading anchors if this filter is not applied.** We highly recommend using this filter for better control over anchor generation.

If you wish to change the anchor links, you can always do so by clicking on the **Link** icon, as shown below.

![change anchor links](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201510%20782'%3E%3C/svg%3E)

But please note if you’ve already set your own anchor link, then we don’t change it.

When visitors click a link in the table of contents, they’ll be immediately navigated to that particular heading in the post or page. This allows users to jump to the section they’re most interested in without wasting time.

![Anchor link preview](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201440%20664'%3E%3C/svg%3E)

### 2.4  Alignment

The Align option sets the alignment for the table of contents. Available options are: None, align left, align center, align right, wide width, and full width.

![Changing alignment in TOC block](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201378%20948'%3E%3C/svg%3E)

### 2.5  List Style

The List option lets you choose a list style for your table of contents. You can choose a bulleted or numbered list style for your table of contents or choose none if you do not want to set any list style.

![Changing List style in TOC block](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201059%20531'%3E%3C/svg%3E)

## 3  Table of Contents Block Settings

When you select the Table of Contents block, the following settings appear in the **Block** section, as shown below.

![Block settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20534%20604'%3E%3C/svg%3E)

Let’s discuss each one of them in detail.

### 3.1  Title Wrapper

This setting sets the HTML tag you want to use for the title. Available options are H2-H6, P, and DIV.

![Title Wrapper](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20664%20634'%3E%3C/svg%3E)

### 3.2  Exclude Headings

This setting lets you choose the heading tags you don’t wish to include in the TOC block. Available options are Heading H1-Heading H6.

Exclude Headings is also available under the Global settings, discussed in the later section. You may see that some of these options might have already been checked based on what you’ve configured under the Global settings.

![Exclude headings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20590%20356'%3E%3C/svg%3E)

### 3.3  Color

This setting in the Styles tab lets you choose the color for the text and background.

![Styles tab](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20712%201166'%3E%3C/svg%3E)

You can either select from your theme colors or any other specific color of your choice or add a gradient.

For instance, you can set the **Text** color, as shown below.

![Add text color](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202420%20982'%3E%3C/svg%3E)

You can set **Background** color, as shown below.

![Change background color](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202558%201218'%3E%3C/svg%3E)

If you wish to customize the background color further, click on the control points that control the color on the left and right and add the Hexadecimal code of the color, as shown below. You can also adjust the angle of the color as per your preference.

![Add color control points](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%201240'%3E%3C/svg%3E)

You can set the color of the link, as shown below. To do so, click the **Link** section, and set the color of the link, as shown below.

![Set the color of the link](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202546%201198'%3E%3C/svg%3E)

If the Link color option is not available, then it’s probably due to your theme not supporting the feature. You can try using the default themes or contact the [theme developer](https://developer.wordpress.org/block-editor/how-to-guides/themes/theme-support/#link-color-control) to further add the feature.

If you wish to remove the Text, Background, or Link color settings from your Table of Contents, click the **Color options** (three dots) and the **RESET** option to remove a particular setting, as shown below.

![Remove a particular color setting.](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201168%20384'%3E%3C/svg%3E)

If you wish to reset all the Color settings, click the **Reset** **all** option, as shown below.

![Reset all color settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20762%20660'%3E%3C/svg%3E)

### 3.4  Typography

This setting in the Styles tab lets you change the font size and line height. You can choose from the available sizes, such as Small, Medium, Large, Extra Large, and XXL. You can use the up and down arrows to increase or decrease the line height.

![Typography settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202428%20596'%3E%3C/svg%3E)

You can also set a specific value by clicking the slider icon and also change the units, as shown below. The choices are pixels, em, or rem.

![set a specific size](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20616%20422'%3E%3C/svg%3E)

To remove the Font size setting, click on the **Typography options** (three dots) and then click **RESET**, as shown below.

![Remove the Font size setting](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20696%20752'%3E%3C/svg%3E)

To reset all the Typography settings, click the **Reset all**option, and all your Typography settings will reset.

![Reset all Typography settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20696%20752'%3E%3C/svg%3E)

### 3.5  Dimensions

This setting in the Styles tab lets you add padding and margin to your Table of Contents. Padding is the area between an element’s border and its content, whereas a margin is the area around an element’s border. In other words, the padding controls the spaces inside the block, and the margin controls the spacing outside it.

To add Padding and Margin, click the****three dots sign and select the dimension you want to change.

![Dimension settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20690%20482'%3E%3C/svg%3E)

You can then change the padding and the margin for your Table of Contents, as shown below.

![Set Dimensions](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202530%20752'%3E%3C/svg%3E)

To set a custom padding and margin, click the slider icon and set a specific value. You can choose a unit from the available options.

![set custom dimensions](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202434%20742'%3E%3C/svg%3E)

If you wish to add padding and margins at various locations, such as the Top, Right, Bottom, and Left of your Table of Contents, click on the **Padding options/Margin options** sign, as shown below.

![Set Padding and Margin on all sides](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202336%20836'%3E%3C/svg%3E)

Set padding and margin as per your preference. You can also set a specific value to the padding and margins by clicking the slider icon.

![Set Padding and Margin](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202364%20658'%3E%3C/svg%3E)

To reset all the Dimensions settings, click the **Reset all**option. Doing so will reset all your Dimensions settings.

![Reset all Dimensions setting](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20668%20480'%3E%3C/svg%3E)

### 3.6  Advanced CSS Classes

This setting lets you customize the appearance of the TOC block by using CSS classes. You can also directly customize the CSS of the Rank Math Table of Contents block sitewide by adding CSS rules for `#rank-math-toc`.

![Advanced CSS classes](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20598%20292'%3E%3C/svg%3E)

## 4  Table of Contents Block Global Settings

To customize the TOC Block settings, navigate to **Rank Math SEO → General Settings → Blocks**, as shown below. The Blocks settings are available only when you enable the [Schema (Structured data) module](https://rankmath.com/blog/schema-markup/).

![Customize TOC Block settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202364%201224'%3E%3C/svg%3E)

**You can customize the following TOC options from here:**

### 4.1  Table of Contents Title

Add the default title for your Table of Contents. But that said, you can always override this default title on a post level.

Table of Contents Title option is visible in the Advanced version of Rank Math. If you don’t see this option, ensure that you’re using [Advanced Mode](https://rankmath.com/kb/advanced-mode/#switch-advanced-mode) of Rank Math.

![Table of Contents Title](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201516%20254'%3E%3C/svg%3E)

### 4.2  Table of Contents List style

Choose the default list style from the drop-down menu. Available options are None, Numbered, and Unordered.

![Table of Contents List style](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201304%20261'%3E%3C/svg%3E)

### 4.3  Table of Contents Exclude Headings

Select the headings you wish to exclude from the Table of Contents.

![Table of Contents Exclude Headings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201514%20718'%3E%3C/svg%3E)

Once you’ve made changes, click the**Save Changes** button to save your settings.

## 5  Create a Reusable Table of Contents Block

Once you’ve created and configured the Tables of Contents block, you can save the customized Table of Contents block as a Reusable Block.

The Reusable block allows you to save any content block and reuse them in other posts and pages on your website. Hence, you don’t have to style them every time, saving you time.

To save your Table of Contents as a Reusable block, select the Table of Contents and click on the **Create pattern/reusable block**, as shown below.

![Create Reusable TOC Block](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201662%20894'%3E%3C/svg%3E)

Next, add a name to your Reusable block and click the **Create** button.

![Add a name to Reusable block](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201562%201044'%3E%3C/svg%3E)

And that’s it! You can now reuse your Table of Contents block in other posts and pages, as shown below.

![Reusable TOC block created](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201440%20510'%3E%3C/svg%3E)

## 6  Convert Table of Contents Blocks from Yoast / AIOSEO to Rank Math

If you’ve existing Table of Contents blocks from Yoast/[AIOSEO](https://rankmath.com/alternative-for-aio-seo/), and decide to migrate to Rank Math SEO, the plugin handles it in a breeze.

When you set up Rank Math for the very first time using the Setup Wizard, Rank Math can automatically import these blocks.

![Imported Table of Contents block](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201584%20876'%3E%3C/svg%3E)

If you’re yet to import these blocks from AIOSEO/Yoast SEO, you can always do that by navigating to  **Rank Math SEO →** **Status & Tools → Database Tools.**Here you’ll see **Yoast Block Converter**for Yoast SEO (or **AIOSEO Block Converter** for AIOSEO).

![AIOSEO convert block](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202028%20254'%3E%3C/svg%3E)

Click on the **Convert Blocks** button, click **OK** on the confirmation message, and the block will automatically be converted to Rank Math’s Table of Contents.

![click Ok in the confirmation message](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20866%20220'%3E%3C/svg%3E)

## 7  Common Table of Contents Issues and Their Fixes

- [The Table of Contents Does Not Display](#table-of-contents-does-not-display)

- [The Table of Content Block Cannot Detect My Headings](#table-of-contents-cannot-detect-my-headings)

- [How to Make the Table of Contents Block Collapsible](#make-the-table-of-contents-collapsible)

### 7.1  The Table of Contents Does Not Display

If you cannot add the Table of Contents block to your posts and pages, or the Table of Contents block was added but doesn’t reflect in your SEO score, one of your plugins may conflict with Rank Math. You can refer to this guide to [diagnose plugin conflicts](https://rankmath.com/kb/check-plugin-conflicts/).

### 7.2  The Table of Content Block Cannot Detect My Headings

If your headings are missing from the Table of Contents block, click on the block and navigate to **Settings**, as shown below.

![Open TOC settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202542%201126'%3E%3C/svg%3E)

Next, head to **Block → Settings → EXCLUDE HEADINGS**and confirm you have not excluded any heading from appearing in the table.

![Exclude Headings in TOC settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202542%201210'%3E%3C/svg%3E)

**Note:**Our team has identified a bug that may cause higher-level headings to disappear when you add a lower-level heading to your content before a higher-level one. We are working on this and will resolve it in a future update. In the meantime, you can [monitor our changelog here](https://rankmath.com/changelog/).

### 7.3  How to Make the Table of Contents Block Collapsible

The Table of Contents by Rank Math block does not collapse by default. You can make it collapsible by adding the below filter to your [rank-math.php](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file) file. You can refer to this guide on [adding filters to your site](https://rankmath.com/kb/wordpress-hooks-actions-filters/).

```
/**
 * Convert Rank Math FAQ Block Into Accordion
 */
function turn_rm_toc_collapsable() {
    ?>
    <script>
        jQuery(document).ready(function() {
            var tocItems = jQuery("div.wp-block-rank-math-toc-block");
            tocItems.bind("click", function(event) {
                var nav = jQuery(this).find("nav");
                if (nav.css("overflow") == "hidden") {
                    nav.css("overflow", "visible");
                    nav.css("max-height", "100vh");
                } else {
                    nav.css("overflow", "hidden");
                    nav.css("max-height", "0");
                }
            });
        });
 
    </script>
    <?php
}
add_action( 'wp_footer', 'turn_rm_toc_collapsable' );
```

Once done, add the below CSS code to your theme’s style.css file.

```
.wp-block-rank-math-toc-block {
	position:relative;
}

.wp-block-rank-math-toc-block h2 {
    background: #f1f2f6;
    padding: 10px 12px 10px 18px;
    cursor: pointer;
    font-size: 18px !important;
    font-weight: normal !important;
    position:relative;
    margin-bottom: 0;
}
.wp-block-rank-math-toc-block h2:before {
	display:inline-block;
	content: "";
        width: 0;
	height: 0;
	border-style: solid;
	border-width: 6px 0 6px 12px;
	border-color: transparent transparent transparent #000000;
	margin-right: 8px;
}

.wp-block-rank-math-toc-block nav{
	padding: 10px 10px 0px 10px;
	max-height: 0;
	overflow:hidden;
}
.wp-block-rank-math-toc-block input:checked+h2~nav {
	max-height: 100vh;
	overflow:visible;
}
```

## 8  Frequently Asked Questions

### Is There a Filter Available to Modify the Table of Contents?

No, there is currently no way to modify the table of contents via filters. You can [refer this](https://rankmath.com/kb/table-of-contents-block/#customizing-toc-block) to customize the Table of Contents block.

### How to Fix ‘Add Heading Blocks to This Page to Generate the Table of Contents’ Error?

Rank Math’s Table of Contents block will display an error message ‘Add Heading blocks to this page to generate the Table of Contents’ if your article has no headings. You can resolve this by adding one or more headings to your article.

### Can I Add Multiple Rank Math TOC Blocks to My Content?

You can add only one Rank Math TOC block per article. Once done, the Rank Math TOC block will be disabled, and you cannot add another one to the content.

## 9  Conclusion

A table of contents improves your [SEO](https://rankmath.com/blog/seo-tips/) and makes it easier for your readers to navigate your content, allowing them to read exactly what they want. Following this step-by-step guide, you can add a Table of Contents by Rank Math to your WordPress posts and pages.

If you still have questions regarding the Tables of Contents – you’re always more than welcome to [contact our dedicated support team](https://rankmath.com/support/). We’re available 24/7, 365 days a year…

			

			 

			
	
		
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

		

										
			
- [How to Download & Install WP Rocket from Rank Math Website?](https://rankmath.com/kb/how-to-install-wp-rocket/)

										
			
- [How to Add Multiple Keywords in WordPress](https://rankmath.com/kb/how-to-add-multiple-keywords/)

										
			
- [How to Install the Imagify Plugin via Rank Math PRO](https://rankmath.com/kb/install-imagify-plugin/)

										
			
- [How to Build SEO Report for Your Website](https://rankmath.com/kb/seo-report/)

										
			
- [How to Connect/Disconnect Your Website From Rank Math](https://rankmath.com/kb/how-to-connect-or-disconnect-rank-math/)

										
			
- [Installing the Rank Math Plugin for the First Time](https://rankmath.com/kb/installation/)