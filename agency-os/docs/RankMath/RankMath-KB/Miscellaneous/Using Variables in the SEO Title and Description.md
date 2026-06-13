# Using Variables in the SEO Title and Description

> **Category:** Miscellaneous
> **Source:** https://rankmath.com/kb/variables-in-seo-title-description/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Using Variables in the SEO Title and Description

			
			

	

Rank Math supports variables, and you can take advantage of this to create dynamic titles and descriptions or a mix of both static and dynamic text. Variables are nothing but containers that point to a specific value, already available in your post or page. So by referring to these existing values, you can save your time, as you don’t have to add/update the title and description manually every time when the value is changed — Rank Math would do that automatically for you.

In this knowledgebase article, we’ll walk you through how to use variables in Rank Math, and we’ll discuss all the variables that Rank Math offers.

## Using Variables in Rank Math

Rank Math’s Meta Box lets you add your page’s SEO title and description. We have added the Meta Box on the same page where you write your content—in the post-editing screen.

If you’re using Classic Editor, you’ll have to scroll down a bit to reach the Meta Box. If you’re using the Block Editor, Rank Math’s Meta Box can be accessed by clicking the Rank Math SEO icon on the top-right corner of the page.

![Click Rank Math SEO icon in the Gutenberg Editor](https://rankmath.com/wp-content/uploads/2021/08/Click-Rank-Math-SEO-icon-in-Gutenberg-Editor-1.jpg)

The first tab in Rank Math’s Meta Box is the General tab. In the **General** tab, click the **Edit Snippet** to open the **Preview Snippet Editor** dialog box.

![Choose Edit Snippet in General tab](https://rankmath.com/wp-content/uploads/2021/01/edit-snippet.jpg)

The Title and Description fields in the Snippet Editor support variables, and you can access these variables by clicking the down arrow in the right corner of the field.

![Variables available for SEO Title](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20612%20470'%3E%3C/svg%3E)

Apart from the Title and Description, you can use variables extensively in the Schema Generator and Schema Templates.

## What Variables Are Supported

Now, let’s closely look at each of the variables present in the General tab.

### 1  Separator Character

`%sep%` will add a separator to your Title and Description. It will use the Separator Character you’ve set under **Rank Math SEO →** **Titles & Meta → Global Meta → Separator Character**.

In the below image, you can notice the separator is being set with a pipe**[ | ]**. You can choose one of the available separators or set a custom one in the last field.

![separator-settings-rank-math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201341%202560'%3E%3C/svg%3E)

### 2  Search Query

Search Query `%search_query%` will be available only on the search result pages. The variable will set the search query of the current page. You can set the title for the search results page in Rank Math under **General Settings → Titles & Meta →** **Search Results Title**.

![Search Results Title - Rank Math Titles & Meta](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201500%20384'%3E%3C/svg%3E)

### 3  Counter

`%count(varname)%` will add a counter for the variable, and it starts at 1. Replace varname with your Rank Math variable for which you wish to set the counter for, and then every time when the counter variable is used on the page, the counter value will increment by 1.

For example, if you’re setting the default ALT text for the images in your post with the post title and a counter, then you can use the following format.

`%title% %count(title)%`

### 4  File Name

File Name `%filename%` variable will display the name of your attachment file. The variable can be used only in the fields related to the attachments. For example, ALT text, title, caption, and description of your images.

### 5  Site Title

The Site Title `%sitename%` variable will display the name of the website you’ve configured under **WordPress Dashboard → Settings → General → Site Title**.

![Site Title in WordPress settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202044%201062'%3E%3C/svg%3E)

### 6  Site Description

The Site Description `%sitedesc%` variable will display the description of your site configured under **WordPress Dashboard → Settings → General → Tagline**.

![Site Description](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202044%201062'%3E%3C/svg%3E)

### 7  Current Date

By using the Current Date `%currentdate%` variable, you can display the current date in your title and description.

![Current date variable example](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201552%20442'%3E%3C/svg%3E)

### 8  Current Day

The Current Day `%currentday%` variable can be used for displaying the current day of the month in the title and description.

![current day](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201500%20419'%3E%3C/svg%3E)

### 9  Current Month

The Current Month `%currentmonth%` variable will display the current month.

![Current month variable example](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201500%20433'%3E%3C/svg%3E)

### 10  Current Year

The Current Year `%currentyear%` variable will display the current year as shown below.

![Current year variable example](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201540%20458'%3E%3C/svg%3E)

### 11  Current Time

The Current Time `%currenttime%` variable will display the current server time.

![Current time variable example](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201500%20441'%3E%3C/svg%3E)

### 12  Current Time Advanced

Rank Math allows you to set the Current server time with a custom formatting pattern with the help of `%currenttime(F jS, Y)%` variable.

You can refer to the [WordPress documentation](https://wordpress.org/support/article/formatting-date-and-time/) to come up with the format string to use in your variable.

### 13  Organization Name

The `%org_name%` variable will retrieve the name of the organization you’ve added in the [Local SEO settings](https://rankmath.com/kb/local-seo/).

If you haven’t already configured, you can set the Organization name by navigating to **WordPress Dashboard →** **Rank Math SEO → Titles & Meta → Local SEO → Person/Organization Name**. If this section is unavailable on your website, ensure that you’ve enabled the **Local SEO & Knowledge Graph** module in the Rank Math Dashboard.

![Organization name in Local SEO Titles & Meta settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201772%20782'%3E%3C/svg%3E)

### 14  Organization Logo

Organization Logo `%org_logo%` variable will add your organization’s logo if you’ve configured it under **Rank Math SEO → Local SEO → Logo**.

![Organization Logo - Local SEO settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201538%201086'%3E%3C/svg%3E)

### 15  Organization URL

Organization URL `%org_url%` variable will add the Organization URL you’ve configured under **Rank Math SEO → General Settings →** **Local SEO → URL**.

![URL in Local SEO settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201546%20258'%3E%3C/svg%3E)

### 16  Post Title

`%title%` variable will display the title of the current post or page.

### 17  Post Title of Parent Page

`%parent_title%` variable will display the title of the parent page of the current post or page.

### 18  Post Excerpt

Post Excerpt will show the excerpt of the current post. Also, this variable `%excerpt%`  will be auto-generated if there is no post excerpt available.

However, the Post Excerpt variable `%excerpt_only%` will show the excerpt of the current post without any auto-generation. So if your current post does not have an excerpt, then `%excerpt_only%` will not return any value.

### 19  Post URL

`%url%` variable will display the URL of the current post or page.

### 20  Post Thumbnail

`%post_thumbnail%` variable will show the current post thumbnail (featured image).

### 21  Date Published

Date Published `%date%` variable will show the date on which you’ve published the current post or page.

`%date(F, jS, Y)%` variable publishes the date with the custom formatting pattern. You can refer to the [WordPress documentation](https://wordpress.org/support/article/formatting-date-and-time/) to come up with the format string to use in your variable.

### 22  Date Modified

`%modified%` variable will show the last modified date of the current post or page.

`%modified(F, jS, Y)%` variable will show the modified date with a custom formatting pattern. You can refer to the [WordPress documentation](https://wordpress.org/support/article/formatting-date-and-time/) to come up with the format string to use in your variable.

### 23  Post Category

`%category%` variable will display the category of the current post or the current category on the category archives.

### 24  Post Categories

`%categories%` will display a comma-separated list of categories that are associated with the current post.

### 25  Categories (Advanced)

`%categories(limit=3 & separator = | & exclude= 12, 23)%` variable will show the list of categories of the current post along with the customization options. You can include only the essential parameters in the variable for customizing the output, and here are the parameters you can make use of:

- **Limit**: To set the maximum number of categories to display

- **Separator**: To set the character to separate categories in the output

- **Exclude**: Enter the ID of the categories to be excluded

### 26  Post Tag

`%tag%` variable will display the post tag of the current post or the current tag on the tag archives.

### 27  Post Tags

`%tags%` variable will display the comma-separated list of tags that are associated with the current post.

### 28  Tags (Advanced)

`%tags(limit=3 & separator = | & exclude= 12, 23)%` will output the list of tags associated with the current post with customization options. You can include only the essential parameters in the variable, and here are the parameters you can make use of:

- **Limit**: To set the maximum number of tags to display

- **Separator**: To set the character to separate tags in the output

- **Exclude**: Enter the ID of the tags to be excluded

### 29  Current Term

Current Term `%term%` variable displays the name of the current term on taxonomy archive pages.

### 30  Term Description

`%term_description%` variable will display the current term description on the taxonomy archive pages.

### 31  Custom Term (Advanced)

`%customterm(taxonomy-name)%` will display the name of the custom term in your title. Replace the `taxonomy-name` in the variable with your taxonomy name.

In this way, you can also add the post format title by using the variable `%customterm(post_format)%`.

### 32  Custom Term Description

`%customterm_desc(taxonomy-name)%` displays the custom term description. Replace the `taxonomy-name` in the variable with your taxonomy name.

### 33  Author ID

`%userid%` variable will display the user ID of the current post or a page. The user ID of the author is the same as the one that is seen in the URL of the Edit User.

![User id in WordPress](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201000%20330'%3E%3C/svg%3E)

### 34  Post Author

Post author `%name%` will display the author name of the current post, page, or the author archive.

### 35  Author Description

`%user_description%` variable will display the biographical info of the author of the current post, page, or the author archive. The Biographical Info of the author is set by opening the **Edit User** from the **Users** menu in WordPress.

![biographical info](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202068%20496'%3E%3C/svg%3E)

### 36  Post ID

`%id%` displays the ID of the current post or the page. The post ID is the same as the one that you can see in the URL of the edit screen of the post/page.

![Post ID](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201095%20240'%3E%3C/svg%3E)

### 37  Focus Keyword

With the focus keyword variable `%focuskw%`, you can set the focus keyword of the current post or page in the title and description. In case if the post or page uses multiple focus keywords, then this variable would return only the primary focus keyword, which is indicated by a star, as shown below.

![focus keyword](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201000%20696'%3E%3C/svg%3E)

### 38  Focus Keywords

The `%keywords%` variable will display a comma-separated list of all the focus keywords of the current post or page.

### 39  Custom Field (Advanced)

`%customfield(field-name)%` shows the custom field value in the title of your post. Replace the `field-name` with the name of your custom field.

### 40  Page

`%page%` will help you to display the page numbers but will be displayed only on pages 2 and above.

For instance, if you’re on the third page of the archive, which contains 5 pages, then the `%page%` variable on the third page would display,

_Page 3 Of 5_

### 41  Page Number

`%pagenumber%` will display the current page number.

### 42  Max Page

`%pagetotal%` variable will display the total number of pages.

### 43  Post Type Name Singular

`%pt_single%` will display the singular name of the current post type. E.g. _post, page, product, etc_.

### 44  Post Type Name Plural

`%pt_plural%` will display the plural name of the current post type. E.g. _posts, pages, products, etc_.

### 45  Random Word [PRO](https://rankmath.com/pricing/)

`%randomword(word1|word2|word3)%` variable will show the random word chosen from the list `(word1|word2|word3)`. You can add any number of words to this list.

`%randomword_np(word1|word2|word3)%` will show a _different_ word from the list in random, every time the page is loaded.

**Note:** If you’re running an automated blog, then you can take advantage of the random word variable to [use Spintax in your meta title and description](https://rankmath.com/kb/spintax/).

### 46  Group Name

`%group_name%` will display the name of the current BuddyPress group. This variable is available to use only if your website uses BuddyPress.

### 47  Group Description

`%group_desc%` will display the description of the current BuddyPress group. This variable is available to use only if your website uses BuddyPress.

### 48  Product’s Price

`%wc_price%` variable will display the price of the current WooCommerce product. You can set the price in your WooCommerce product page by navigating to the **General** tab of the **Product data** section. In case if you have an active sale running, then Rank Math will consider the **Sale price** for this variable, else the **Regular price** will be used.

![WooCommerce Product price](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201930%20748'%3E%3C/svg%3E)

### 49  Product’s SKU

`%wc_sku%` variable will display the **S**tock **K**eeping **U**nit (SKU) of the current WooCommerce product. The SKU can be added to the WooCommerce product page by navigating to the Inventory tab under the **Product data** section, as shown below.

![WooCommerce product SKU](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201928%20746'%3E%3C/svg%3E)

### 50  Product’s Short Description

`%wc_shortdesc%` variable will display a short description of the current WooCommerce product. To edit the Product short description, open the WooCommerce product page and then edit the **Product short description** field.

![Product short description](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201622%20786'%3E%3C/svg%3E)

### 51  Product’s Brand

`%wc_brand%` variable will display the brand of the current WooCommerce product. Rank Math lets you set the brand names to WooCommerce taxonomies or a [custom brand name](https://rankmath.com/kb/woocommerce-custom-brand-schema/), if all your products belong to the same brand. To do so, navigate to **Rank Math SEO → General Settings → WooCommerce** and choose an option for **Select Brand**.

If you choose custom, another option would appear below to let you add a custom brand name.

![Select Brand - WooCommerce settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20762%20186'%3E%3C/svg%3E)

### 52  Image Alt [PRO](https://rankmath.com/pricing/)

The `%imagealt%` variable will display the alt text set for the current image.

![Image Alt](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20611'%3E%3C/svg%3E)

### 53  Image Title [PRO](https://rankmath.com/pricing/)

The `%imagetitle%` variable can be used to display the title of the current image.

![Image Title](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201366%20580'%3E%3C/svg%3E)

## How to Add Custom Variables?

In addition to the above listed variables, Rank Math enables you to create your own variables and use them inside SEO and Meta fields of Rank Math. To create a new custom variable, follow the below steps.

### 1  Navigate to Theme Editor

Start by heading over to **WordPress Dashboard → Appearance → Theme File Editor (Classic Theme)** or head over to **WordPress Dashboard → Tools → Theme File Editor** in case of a **Block Theme**.

![Navigate to Theme File Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20900%20359'%3E%3C/svg%3E)

### 2  Add Code Snippet

Now in the Theme File Editor, choose the [rank-math.php](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file) file from the list of files shown in the right side of the screen.

![Choose rank-math.php file](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201112%20671'%3E%3C/svg%3E)

Then in the code area that appears in the middle of the screen, add the below code snippet. You can edit the code snippet to use them according to your requirements. Please note, you should also add the callback function.

```
/**
 * Action: 'rank_math/vars/register_extra_replacements' - Allows adding extra variables.
 */
add_action('rank_math/vars/register_extra_replacements', function () {
	rank_math_register_var_replacement(
		'custom_variable_slug',
		array(
			'name'        => esc_html__('Custom variable name.', 'rank-math'),
			'description' => esc_html__('Custom variable description.', 'rank-math'),
			'variable'    => 'custom_variable_slug',
			'example'     => 'custom_variable_callback()',
		),
		'custom_variable_callback'
	);
});
```

Here is an example of an use-case of this action hook that would return the number of posts in the chosen taxonomy term when used in the taxonomy pages.

```
/**
 * Action: 'rank_math/vars/register_extra_replacements' - Allows adding extra variables.
 * Snippet to register variable that will return the number of posts in the current term
 */
add_action('rank_math/vars/register_extra_replacements', function () {
    rank_math_register_var_replacement(
        'term_count',
        [
            'name'        => esc_html__('Term Count', 'rank-math'),
            'description' => esc_html__('Number of posts in the current term', 'rank-math'),
            'variable'    => 'term_count',
            'example'     => term_count_callback(),
        ],
        'term_count_callback'
    );
});
function term_count_callback()
{
    $term = get_queried_object();
    return isset($term) ? $term->count : null;
}
```

### 3  Update the File

Once you’ve added the code snippet in the code editor, click the **Update File** button as shown below.

![Term count variable](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201116%20670'%3E%3C/svg%3E)

You can use these variables in the [global settings for Titles & Meta](https://rankmath.com/kb/titles-and-meta/) as well if you do not wish to use them on individual posts/pages/products every time you create new content.

And, that’s it! We hope the article was helpful in understanding the variables available in Rank Math. In fact, you can take advantage of our [filter to create variables](https://rankmath.com/kb/filters-hooks-api-developer/#add-custom-variable) of your choice and use them inside your posts. If you still have absolutely any questions on using Rank Math, please feel free to [reach our support team directly from here](https://rankmath.com/support/), and we’re always here to help.

			

			 

			
	
		
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

		

										
			
- [How to Share Credentials Using the Rank Math Vault](https://rankmath.com/kb/how-to-use-vault/)

										
			
- [How to Create an AI Traffic Report in Google Analytics 4](https://rankmath.com/kb/create-ai-traffic-report/)

										
			
- [How to Disable Rank Math Meta Box from the Right Sidebar](https://rankmath.com/kb/disable-rank-math-meta-box/)

										
			
- [Migrating The Rank Math Support from Forum to Zendesk](https://rankmath.com/kb/support-migration-to-zendesk/)

										
			
- [How to Customize RSS Feed in WordPress](https://rankmath.com/kb/customize-rss-feed/)

										
			
- [How to Add Twitter Cards to WordPress](https://rankmath.com/kb/how-to-add-twitter-cards/)