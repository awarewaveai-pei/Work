# How to Fix “Either ‘name’ or ‘item.name’ should be specified” Error

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/how-to-fix-either-name-or-item-name-should-be-specified-error/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Fix “Either ‘name’ or ‘item.name’ should be specified” Error

			
			

	

Sometimes, you might have noticed “**Either ‘name’ or ‘item.name’ should be specified**” error in Google Search Console. In this knowledgebase article, we’ll walk you through how to fix this error easily at your end.

## Table of Contents

- [What Does the Error Mean?](#breadcrumb-schema-error)

- [How Rank Math Deals With This Error](#rank-math-solution)

- [Fix the Error With a Page Title](#fixing-with-page-title)

- [Fix the Error With a Breadcrumb Title](#fixing-with-breadcrumb-title)

- [Using Code Snippet to Alter the Breadcrumb Title in Bulk](#snippet-code-to-alter-in-bulk)

## 1  What Does the Error Mean?

This error is mainly related to Breadcrumb Schema and indicates that a name/item name in the Breadcrumb Schema could be missing. So if your post/category or any element in your Breadcrumb does not have a title, it is likely, you’ll be seeing this error.

You’ll see this error while testing Schema using Google’s Rich Result Testing tool or in your Google Search Console(_when you’ve connected your website_).

## 2  How Rank Math Deals With This Error

Rank Math has been built to handle scenarios where these errors would appear. Instead of adding an element to the Breadcrumbs Schema without item name, Rank Math simply ignores the missing element, altogether, hence you wouldn’t see this error in most cases.

But that said, if you leave the title of the post as well as the breadcrumb title blank, then Rank Math has got no data to add, and likely the case, where you would see this error.

Here are some solutions to get rid of this error.

## 3  Fix the Error With a Page Title

So if your post/page is missing a title, the easiest way to fix this error is to add one.

### 3.1  Open the Post/Page

Open the Post/Page that does not have a title by clicking the **Edit** option in the Post screen.

![Edit posts without title](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201484%20478'%3E%3C/svg%3E)

### 3.2  Add a Title

In the WordPress editor, enter a title for your post.

![Add title for post in Gutenberg Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201138%20282'%3E%3C/svg%3E)

### 3.3  Update/Publish the Post

Once you’ve added the title, update the post, or in case, if this is a new post, simply publish it.

## 4  Fix the Error With a Breadcrumb Title

If for some reason, a title could not be added (_like a custom post that does not use titles_), then you can always add a Breadcrumb Title using the Advanced tab in Rank Math Meta Box. The Advanced tab in Rank Math is available only if you’re using the [Advanced Mode](https://rankmath.com/kb/advanced-mode/) of Rank Math.

### 4.1  Edit the Post/Page

To add a breadcrumb title, open the post/page with this error, by clicking the **Edit** option.

![Edit the post or page without title](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201484%20478'%3E%3C/svg%3E)

### 4.2  Open Rank Math in Gutenberg Sidebar

In the Gutenberg Editor, click the **Rank Math SEO** icon in the top-right corner of the screen. Alternatively, you can click the three vertical dots and choose **Rank Math** from the Plugins section.

![Open Rank Math Meta Box in Gutenberg Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201030%20758'%3E%3C/svg%3E)

### 4.3  Navigate to the Advanced Tab

In the Rank Math Meta Box that appears on the screen, click the **Advanced** tab.

![navigate to the Advanced tab](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201110%20982'%3E%3C/svg%3E)

### 4.4  Add Breadcrumb Title

Under the Advanced tab, you will find the option to add **Breadcrumb Title**.

![Add Breadcrumb title in Rank Math Meta Box](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20924%20225'%3E%3C/svg%3E)

### 4.5  Update Your Post or Page

Once you’ve added the Breadcrumb Title, click the Update button. Or, if it is a new post, simply click Publish.

## 5  Using Code Snippet to Alter the Breadcrumb Title in Bulk

If you’ve numerous posts on your website, then practically adding title/breadcrumb title with the above methods will be more time-consuming and tedious. To get this rid of this error from posts in bulk, you can choose to use a [filter that would allow changing the breadcrumb title](https://rankmath.com/kb/filters-hooks-api-developer/#change-remove-breadcrumb-items).

### 5.1  Navigate to Theme File Editor

Navigate to **WordPress Dashboard → Appearance → Theme File Editor** (for Classic Theme) or **WordPress Dashboard → Tools → Theme File Editor** (for Block Theme).

![Navigate toTheme File Editor from Appearances](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20793%20516'%3E%3C/svg%3E)

Now from the list of files shown on the right side of the screen, choose [**rank-math.php**](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file).

![Open rank-math.php in from Theme file Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20992%20655'%3E%3C/svg%3E)

### 5.2  Add Code Snippet

In the code editor available in the middle of the screen, enter the following code snippet. Make sure to replace “Example” in the below snippet with a title that is relevant to your website.

All the posts on your website that do not have a title would use this breadcrumb title. This filter adds the breadcrumb title dynamically on the front-end, and hence you wouldn’t find it in the Advanced tab of Rank Math’s Meta Box.

You can also extend this filter to use a post meta instead of the same title we’re using below.

```
/**
 * Filter Allow changing or removing the Breadcrumb items
 * Set a custom breadcrumb title if the post does not have any title
 *
 * @param array       $crumbs The crumbs array.
 * @param Breadcrumbs $this   Current breadcrumb object.
 */
add_filter(
	'rank_math/frontend/breadcrumb/items',
	function ( $crumbs, $class ) {
		// Check if we are viewing single posts and the posts have a title.
		if ( is_singular( 'post' ) && empty( trim( get_the_title() ) ) ) {
				$new_breadcrumb_title = 'Example'; // Change the title relevant to your site.
				// The last element in the $crumbs array is the post's
				// breadcrumb title, so we have to update it.
				$crumbs[ count( $crumbs ) - 1 ][0] = $new_breadcrumb_title;
		}
		// And return the breadcrumbs.
		return $crumbs;
	},
	10,
	2
);
```

### 5.3  Update File

Once you’ve added the code snippet, click the **Update File** button at the bottom of the screen to reflect the changes.

![Add code snippet to set custom breadcrumb title in Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201100%20659'%3E%3C/svg%3E)

Now you can confirm if the error has been fixed by testing the page’s source code using Schema Testing looks like [Google’s Rich Results Testing Tool](https://search.google.com/test/rich-results).

And, that’s it! We hope the tutorial was helpful in fixing the error. If you’re still facing this issue, please feel free to [reach our support team directly from here](https://rankmath.com/support/), and we’re always here to help.

			

			 

			
	
		
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