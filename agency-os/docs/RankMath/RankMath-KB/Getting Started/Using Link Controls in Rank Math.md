# Using Link Controls in Rank Math

> **Category:** Getting Started
> **Source:** https://rankmath.com/kb/link-controls/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Using Link Controls in Rank Math

			
			

	

Links controls are available in your WordPress Editor by default, but Rank Math has powered it with more useful options. So with the link controls, you can now add rel attributes to specific links inside the content without having to make any changes to the HTML code by yourself.

In this knowledgebase article, we’ll show you how to use the link control options available in Rank Math.

## Table of Contents

- [How to Use Link Controls in Block Editor?](#block-editor)

- [How to Use Link Controls in Classic Editor?](#classic-editor)

- [Available Link Controls](#available-link-controls)

- [Open in New Tab](#open-in-new-tab)

- [Set to Nofollow](#nofollow)

- [Set to Sponsored](#sponsored)

- [Set to About](#about)

- [Set to Mentions](#mentions)

- [User Generated Content (UGC)](#ugc)

## 1  How to Use Link Controls in Block Editor?

The Link Controls are available to use as soon as you [install Rank Math](https://rankmath.com/kb/installing-through-the-admin-panel/), and you don’t need to enable any specific modules. To enable or disable link attributes in Block Editor, follow the exact steps we’ve discussed below.

### 1.1  Edit the Post or Page

Start by opening the post or page that you want to edit in the WordPress editor screen.

![Edit the post or page](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201438%20637'%3E%3C/svg%3E)

### 1.2  Open the Link Controls

To add a new link, copy the URL to your device’s clipboard. Then select the text that you wish to link in the Editor.

Now click the link icon from the block’s toolbar that appears on the Gutenberg editor.

![Choose the link from Block Toolbar](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20321'%3E%3C/svg%3E)

Here you can add your link in the **URL** field, and press Enter to add the link. To open the link controls, click the **Edit** icon.

![click Edit icon](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201222%20450'%3E%3C/svg%3E)

This will open a box below your link; click the **Advanced**option**.**You’ll see a number of link control options.

![Link control options](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201196%201006'%3E%3C/svg%3E)

### 1.3  Enable/Disable Attributes

From the link controls, you can select to enable or disable specific options, as shown below. We’ll also cover what these options do shortly in this article. Once you’ve enabled a specific option, click the **Save** button.

![Enable or disable link controls](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201270%20986'%3E%3C/svg%3E)

### 1.4  Save the Post or Page

Once you’ve added the essential link attributes, don’t forget to update the post, or in case if this is a new post, hit the **Publish** button.

## 2  How to Use Link Controls in Classic Editor?

While the previous steps were specific to Block Editor, the following steps will guide you on how to add link controls in the Classic Editor, which is quite similar.

### 2.1  Open the Link Controls

Start by opening the post or page that you want to edit with the Classic Editor. In the Content area that appears in the middle of the screen, select the text you want to link and click on the **Insert/Edit Link** icon from the Classic Editor toolbar.

![Click Link from the Classic Editor toolbar](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20886%20222'%3E%3C/svg%3E)

In the URL field that appears, you can add the link and click the gear icon to open the link options.

![URL field and link options in Classic Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20962%20243'%3E%3C/svg%3E)

### 2.2  Enable or Disable Attributes

You can find the various link control options in the popup that appears on the screen. You can select or unselect these checkboxes to enable or disable these attributes.

![Link controls in Classic Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20992%201189'%3E%3C/svg%3E)

### 2.3  Update Link

Once you have made the changes to the link controls, click the **Update** button at the bottom of the popup.

![Update link options in Classic Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20990%201187'%3E%3C/svg%3E)

### 2.4  Save Post

Finally, update the post or click the **Publish** button in case if this is a new post.

## 3  Available Link Controls

Now that you’re aware of how to use the link controls, let us look at the various link control options available and what they do.

### 3.1  Open in New Tab

The first option, **Open in new Tab**, is self-explanatory. It enables the link to open in a new tab when a reader clicks the link on the front end.

![Open link in new tab](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201090%201002'%3E%3C/svg%3E)

Once you enable this option, the attribute `target=_blank` will be added to the link.

![Target blank added to the link](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201220%20244'%3E%3C/svg%3E)

This option is available in WordPress by default, and Rank Math does not make any changes to it. However, to save your time from manually configuring this option for all external links, Rank Math includes a global setting ([Open External Links in New Tab/Window](https://rankmath.com/kb/general-settings/#open-external-links-in-new-tab)).

But please note that when you enable the global setting, it is applied dynamically and does not change the content stored on your site. So, all the external links will be set to open in a new tab, irrespective of whether you’ve enabled/disabled the link control for individual links.

### 3.2  Set to Nofollow

The second option, **Set to nofollow**, allows you to add the nofollow attribute to specific links right from the WordPress Editor.

![Set to nofollow](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201162%20999'%3E%3C/svg%3E)

Google introduced the nofollow attribute to let publishers communicate they don’t endorse the link, and hence the page rank should not be passed to the linked website. You can consider using the nofollow attribute to unapproved links inside the contributor’s content.

So when you choose the **Set to nofollow** option, the nofollow attribute will be added to the link.

![Nofollow attribute added to link](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201108%20244'%3E%3C/svg%3E)

As you might have already noticed, Rank Math has got a few different options in [General Settings](https://rankmath.com/kb/general-settings/) to handle nofollow links. The global settings apply nofollow dynamically when the condition is met, in spite of your link control configuration for individual links.

**Caution**: Adding a nofollow attribute to internal links is not recommended unless you have a specific purpose. When internal links are nofollowed, crawlers take them as a cue and don’t crawl them, which is a bad behavior. If your pages end up not being crawled, then they will not have the opportunity to rank in search results, and you could lose potential traffic.

### 3.3  Set to Sponsored

The sponsored attribute is a relatively new attribute introduced by Google when compared to the nofollow attribute. Google encourages publishers to disclose their paid links (sponsored links) with this attribute. Although the sponsored attribute works the same way as that of nofollow, it hints to Google the monetary nature of the link. Google has also communicated publishers to [use the sponsored attribute for affiliate links](https://developers.google.com/search/blog/2021/07/link-tagging-and-link-spam-update#affiliate-links).

Having said that, if your site is already using the nofollow attribute for affiliate links, then you don’t need to make the changes all throughout your website. But if this is a relatively new site, then it’s worth implementing the changes to communicate the nature of the link effectively to the search engine.

> nofollow is still fine but we'd love if people could help us with more precise link qualification

— Gary 鯨理／경리 Illyes (so official, trust me) (@methode) [July 26, 2021](https://twitter.com/methode/status/1419693320599638020?ref_src=twsrc%5Etfw)

The toggle for **Set to sponsored**lets you configure that exactly.

![Set to sponsored](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201270%20992'%3E%3C/svg%3E)

When you enable the option, Rank Math will include a `sponsored` rel attribute to the link, as shown below.

![Sponsored rel tag added](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201238%20244'%3E%3C/svg%3E)

### 3.4  Set to About [PRO](https://rankmath.com/pricing/)

Unlike the previous options, this option will let you set a Schema attribute and not a rel attribute. When a link is set with the data Schema attribute for about, Rank Math will also mark the link with the About Schema.

The About Schema is used to communicate what the main topic of the article is about. This is more accurate when you’re marking up links from informational sources such as Wikipedia, so Google could better relate the entity being described with your content as well.

![Set to about in link controls](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201080%201002'%3E%3C/svg%3E)

Once you enable the **Set to about** option on the front end, you can find the data Schema attribute being added to the link to indicate the link is being marked with the About Schema.

![Data Schema attribute about added to the link](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201108%20244'%3E%3C/svg%3E)

You can also check the page with Schema Testing tools like [Google’s Rich Results Testing tool](https://search.google.com/test/rich-results) or [Schema Validator](https://validator.schema.org/) to check the added Schema. Here is the snippet showing the About Schema added.

![About Schema being added](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201026%20388'%3E%3C/svg%3E)

### 3.5  Set to Mentions [PRO](https://rankmath.com/pricing/)

When you enable the Set to mentions option, the link will be marked up with Mentions Schema, which is similar to the About Schema that we’ve just discussed.

It is worth noting that the About Schema is used for describing the main topic of the page, while the Mentions Schema is used for describing any related topic which could be mentioned on the page and not necessarily be the main topic of the page.

For more details on the usage of the About and Mentions Schema, you can also [refer to its dedicated KB](https://rankmath.com/kb/about-and-mentions-schema/).

![Set to mentions from link controls](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201030%20982'%3E%3C/svg%3E)

Once you set the link to Mentions Schema, you can find the data Schema attribute added to the link in the front end.

![Data Schema attribute mentions added to link](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201108%20244'%3E%3C/svg%3E)

And here is a snippet that shows how the Mentions Schema is used.

![Mentions Schema](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201116%20388'%3E%3C/svg%3E)

### 3.6  User Generated Content (UGC)

In addition to the above-discussed attributes, Rank Math adds the ugc (User Generated Content) attribute automatically to all the links in the comments.

Although there is no ranking benefit in adding the ugc attribute, it helps Google understand that the link was added by someone outside the publisher’s control and hence shall not be trusted.

There is no specific option to configure this, Rank Math automatically adds this attribute to the links in the comments. But in case, if you want to disable this setting, you can make use of [this filter](https://rankmath.com/kb/stop-adding-relugc-to-links-in-comments/). Here is how the links in the comments would look like.

![Ugc attribute for links in comment](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201260%20208'%3E%3C/svg%3E)

As you can notice from the above image, the link also includes the nofollow attribute. Since version 5.3, WordPress automatically adds nofollow and ugc to links in the comments. WordPress adds both nofollow and ugc, considering the search engines that might support only the nofollow attribute. Hence WordPress includes both nofollow and ugc.

For some reason, if the ugc attribute is not added by WordPress, then Rank Math will add them for you, so you can rest assured spammers cannot pass on your site’s link juice to third-party websites through comment links.

And that’s it! We hope the article helped you understand the various link controls of Rank Math to add rel and data Schema attributes. If you still have absolutely any questions about using link controls, please feel free to [reach our support team directly from here](https://rankmath.com/support/), and we’re always here to help.

			

			 

			
	
		
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