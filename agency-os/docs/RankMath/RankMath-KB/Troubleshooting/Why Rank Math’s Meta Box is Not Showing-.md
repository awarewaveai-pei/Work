# Why Rank Math’s Meta Box is Not Showing?

> **Category:** Troubleshooting
> **Source:** https://rankmath.com/kb/why-rank-math-meta-box-is-not-showing/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Why Rank Math’s Meta Box is Not Showing?

			
			

	

Let’s consider a scenario: You’re working on a post and decide to optimize it with Rank Math. Then you notice Rank Math’s Meta Box is not showing even though the plugin is active on your site. Nothing is more frustrating than having your workflow interrupted. Agree?

**Rank Math’s Meta Box helps you optimize your content. You can find it on the same page where you write all your content on the post-editing screen.**

But what if it isn’t there? How can you get it back?

Thankfully, there are some simple steps that you can take to fix this problem and get your meta box working correctly again. In this knowledgebase article, we’ll show you why Rank Math’s Meta Box is not showing and also quick ways to get it back again.

    
## Table Of Contents

    

     
            
                
- [Why Rank Math’s Meta Box is Not Showing?](#meta-box-not-showing)
                
- [How to Enable Rank Math’s Meta Box](#how-to-enable-rank-math-meta-box)
                
- [Why Rank Math’s Meta Box May Not Show in the Classic Editor?](#why-meta-box-not-showing-classic-editor)
                
- [How to Setup the SEO Meta Box if You Have Multiple Meta Boxes](#setup-meta-box-multiple-meta-boxes)
               
           
        
    

## 1  Why Rank Math’s Meta Box is Not Showing?

Rank Math enables the SEO Meta Box by default. It only goes missing if someone disables it.

Additionally, the SEO Meta Box may be visible on some content editors while missing in others. This is entirely normal.

Rank Math allows you to enable or disable the Meta Box on individual post types and taxonomies. So you can enable the Meta Box in, let’s say, Categories while you disable it in Tags.

## 2  How to Enable Rank Math’s Meta Box

### 2.1  Navigate to Titles & Meta Settings

At first, navigate to **Rank Math SEO →** **Titles & Meta** from your WordPress dashboard.

![Navigate to Titles and Meta Settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20648%20750'%3E%3C/svg%3E)

### 2.2  Select the Post Type/Taxonomy

In the **Titles & Meta**settings, you’ll find a list of post types and taxonomies on the left-hand side, as shown below. Choose the post type/taxonomy where you wish to add the missing Meta Box.

![Select Post Type/ Taxonomy](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202205%202064'%3E%3C/svg%3E)

For example, we want the Meta Box in our page editor, so we select **Pages**.

![We selected pages](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202010%201332'%3E%3C/svg%3E)

### 2.3  Enable Add SEO Controls

Scroll down a bit, locate the **Add SEO Controls** option, and enable it, as shown below.

![Enable Add SEO Controls option](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201502%20248'%3E%3C/svg%3E)

### 2.4  Run a Quick Check on the Post Type/Taxonomy

You can now check any content in the post type or taxonomy for which you just enabled the Meta Box. In this example, we navigated to a page.

If you use the **Block Editor**, you’ll see the Rank Math SEO icon at the top-right corner, as shown below.

![Rank Math SEO icon in the Block editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20583'%3E%3C/svg%3E)

When you click the Rank Math icon, Rank Math’s SEO Meta Box is visible.

![Rank Math's Meta box in Block Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202550%201092'%3E%3C/svg%3E)

If you use the **Classic Editor**, you need to scroll down a bit, and then you’ll find the Meta Box, as shown below.

![Rank Math Meta Box in Classic Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201922%201297'%3E%3C/svg%3E)

## 3  Why Rank Math’s Meta Box May Not Show in the Classic Editor?

If you use the **Classic Editor**, the Meta Box may not appear even after enabling Add SEO Controls. In this case, click on the **Screen Options** at the top-right of your screen.

![click on Screen options](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202554%20553'%3E%3C/svg%3E)

Check the **Rank Math SEO** checkbox, as shown below.

![Select Rank Math SEO checkbox](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202548%20712'%3E%3C/svg%3E)

You can now see the SEO Meta Box in the Classic editor.

Sometimes this issue could be due to your browser cache. You can [clear your browser cache](https://rankmath.com/blog/clear-cache-in-wordpress/#clear-browser-cache) and try again. If that doesn’t work, you can temporarily use incognito mode or switch to another browser.

## 4  How to Setup the SEO Meta Box if You Have Multiple Meta Boxes

If you have multiple Meta Boxes, as is usually the case when you use [advanced custom fields (ACF)](https://rankmath.com/kb/advanced-custom-fields/), you’ll need to add the below filter to WordPress so that Rank Math knows your most important Meta Boxes. You can refer to our dedicated tutorial on [how to add a filter/hook to your website](https://rankmath.com/kb/wordpress-hooks-actions-filters/).

```
/**
 * Change the Rank Math Metabox Priority
 *
 * @param array $priority Metabox Priority.
 */
add_filter( 'rank_math/metabox/priority', function( $priority ) {
 return 'low';
});
```

As said before, Rank Math’s Meta Box allows you to [optimize your content for SEO](https://rankmath.com/kb/score-100-in-tests/). Hence you must enable it to get the most out of the hard work you put into creating your content. If you don’t want other users to tamper with your settings anymore, check out this knowledgebase article on using Rank Math’s [Role Manager](https://rankmath.com/kb/role-manager/) to control the features available to other users.

If you still have questions regarding Rank Math’s Meta Box – you’re always more than welcome to [contact our dedicated support team](https://rankmath.com/support/). We’re available 24/7, 365 days a year…

			

			 

			
	
		
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