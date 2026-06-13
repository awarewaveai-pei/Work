# How to Turn Rank Math FAQ Block into an Accordion

> **Category:** Schema
> **Source:** https://rankmath.com/kb/turn-faq-block-into-accordion/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Turn Rank Math FAQ Block into an Accordion

			
			

	

Rank Math has a built-in FAQ block for adding FAQs anywhere inside your content, and better yet, the corresponding FAQ Schema gets added automatically, so you don’t have to worry about that. The FAQ Block already includes customization options like adding CSS classes and other styling options, giving a whole range of possibilities to style and customize the FAQ to suit your website theme or layout.

For instance, if you’re looking to convert this FAQ Block into an accordion — yes, of course, you can convert the FAQ Block to an accordion with some of the methods we would discuss in this knowledgebase tutorial.

## Convert Rank Math FAQ Block to Accordion

To begin with, we’ve created a sample FAQ Block using Rank Math, and as we go through the various methods, we’ll look at how the styling changes.

![FAQ Block](https://rankmath.com/wp-content/uploads/2021/09/Rank-Math-FAQ-block-example.jpg)

### 1  Using Code Snippet

We can make use of jQuery and CSS rules to convert FAQ Block into an accordion. You can add the following chunk of code to your website theme’s [rank-math.php](https://rankmath.com/kb/filters-hooks-api-developer/#how-to-add-code-snippets-to-rank-math-php).

Alternatively, you can add only the jQuery function to your website’s JavaScript file.

```
/**
 * Convert Rank Math FAQ Block Into Accordion
 */
function turn_rm_faq_to_accordion() {
	?>
	<script>
		jQuery(document).ready(function() {
			var faqBlock = jQuery("div#rank-math-faq");
			var faqItems = faqBlock.find("div.rank-math-list-item");
			faqItems.bind("click", function(event) {
				var answer = jQuery(this).find("div.rank-math-answer");
				if (answer.css("overflow") == "hidden") {
					answer.css("overflow", "visible");
					answer.css("max-height", "100vh");
				} else {
					answer.css("overflow", "hidden");
					answer.css("max-height", "0");
				}
			});
		});
	</script>
	<?php
}
add_action( 'wp_footer', 'turn_rm_faq_to_accordion' );
```

Then add the following CSS rules to your theme’s style.css file or use the **Additional CSS** option available under **Appearance → Customize** inside your WordPress admin area.

```
#rank-math-faq .rank-math-list-item{
	position:relative;
}
#rank-math-faq .rank-math-list-item input{
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 41px;
    opacity: 0;
    cursor: pointer;
    z-index:999;
}
#rank-math-faq .rank-math-list-item h3 {
    background: #f1f2f6;
    padding: 10px 12px 10px 18px;
    cursor: pointer;
    font-size: 18px !important;
    font-weight: normal !important;
    position:relative;
    margin-bottom: 0;
}
#rank-math-faq .rank-math-list-item h3:before {
	display:inline-block;
	content: "";
    width: 0;
	height: 0;
	border-style: solid;
	border-width: 6px 0 6px 12px;
	border-color: transparent transparent transparent #000000;
	margin-right: 8px;
}
#rank-math-faq .rank-math-list-item input:checked+h3:before {
	-webkit-transform:rotate(90deg);
	-ms-transform:rotate(90deg);
	transform:rotate(90deg);
}
#rank-math-faq .rank-math-answer{
	padding: 10px 10px 0px 10px;
	max-height: 0;
	overflow:hidden;
}
#rank-math-faq .rank-math-list-item input:checked+h3~.rank-math-answer {
	max-height: 100vh;
	overflow:visible;
}
```

Now that we’ve added the code, our FAQ Block gets converted to an accordion, and here’s how it looks like.

![Convert Rank Math FAQ block to Accordion using CSS and jQuery](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20662%20412'%3E%3C/svg%3E)

### 2  Using Code Snippet (Another Version)

We’ve got another version of the accordion with the code provided by [Silvan Hagen](https://gist.github.com/neverything/93546eabd9d7399ab80b2f12630cd695). Add the following code snippet to your website’s [rank-math.php](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file) file. Instead, you can add only the jQuery function to your website’s JavaScript file.

```
/**
 * Convert Rank Math FAQ Block Into Accordion
 */
function turn_rm_faq_to_accordion() {
	?>
<script>
(function ($) {

	var rankMath = {
		accordion: function () {
			$('.rank-math-block').find('.rank-math-answer').hide();
			$('.rank-math-block').find('.rank-math-question').click(function () {  
				//Expand or collapse this panel
				$(this).nextAll('.rank-math-answer').eq(0).slideToggle('fast', function () {
					if ($(this).hasClass('collapse')) {
						$(this).removeClass('collapse');
					}
					else {
						$(this).addClass('collapse');
					}
				});
				//Hide the other panels
				$(".rank-math-answer").not($(this).nextAll('.rank-math-answer').eq(0)).slideUp('fast');
			});

			$('.rank-math-block .rank-math-question').click(function () {
				$('.rank-math-block .rank-math-question').not($(this)).removeClass('collapse');
				if ($(this).hasClass('collapse')) {
					$(this).removeClass('collapse');
				}
				else {
					$(this).addClass('collapse');
				}
			});
		}
	};

	rankMath.accordion();

})(jQuery);
</script>
	<?php
}
add_action( 'wp_footer', 'turn_rm_faq_to_accordion' );
```

Add then add the following CSS rules to your theme’s style.css file.

```
#rank-math-faq .rank-math-list-item {
    margin-bottom: 1em;
    margin-top: 1em;
    border-bottom: 1px solid #fff;
}

.rank-math-question {
    cursor: pointer;
    position: relative;
    display: block;
    padding-right: 1em;
    margin-right: 1em;
    font-weight: 300;
    margin-top: 30px;
}

.rank-math-question:after {
    position: absolute;
    right: 5px;
    top: 0;
    content: "\2715";
    transform: rotate(-45deg);
    transition: all 150ms ease-in-out;
}

.rank-math-question.collapse:after {
    transform: rotate(0deg);
}

.rank-math-question:hover {
    opacity: 0.8;
}
```

Now the FAQ Block looks like the one we’ve shown below.

![Convert Rank Math FAQ to accordion - Silvan Hagen](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20672%20382'%3E%3C/svg%3E)

### 3  Using WordPress Plugin

If you prefer the easy way of converting our FAQ Block into an accordion, you can simply use a WordPress plugin. Install and activate the **Turn Rank Math FAQ Block To Accordion** plugin using the WordPress admin panel by navigating to WordPress **Dashboard → Plugins → Add New**, as shown below.

![Install Turn Rank Math FAQ Block to Accordion](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201280%20584'%3E%3C/svg%3E)

Once the plugin is activated on your website, no further configurations are required from your end. All your existing Rank Math FAQs will be automatically converted to an accordion in the front-end.

And here is how the FAQ Block we’ve created earlier looks like.

![FAQ Block Accordion](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20670%20394'%3E%3C/svg%3E)

Apart from the above methods, if you use Elementor page builder, you can easily add Rank Math’s FAQ Schema to Elementor’s accordion widget, and we’ve got an extensive [tutorial to help you with it](https://rankmath.com/kb/faq-schema-elementor/#num-2-add-faq-schema-to-your-elementor-accordion-pro).

And, that’s it! We hope the tutorial helped you turn your Rank Math FAQ Block into Accordion. But please note, the styling might vary on your website depending upon the theme and plugins installed on your website.

While these are just basic ideas, you can feel free to extend the code and customize it as you prefer. If you’ve any questions about using our FAQ Block, please feel free to [reach our support team directly from here](https://rankmath.com/support/), and we’re always here to help.

			

			 

			
	
		
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