# How to Enhance Sharing in Slack

> **Category:** Miscellaneous
> **Source:** https://rankmath.com/kb/slack-enhanced-sharing/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Enhance Sharing in Slack

			
			

	

Slack is a well-known messaging platform for workplace communication and communities, as they let you connect from anywhere across the world to share messages, links, files, and more.

As more businesses and communities are moving towards Slack for communication, it is a great opportunity for marketers to grab a chance to stand out from the crowd, and Rank Math takes you a step ahead by enhancing your website’s link previews with additional information, just like the one shown below.

![Slack Sharing example](https://rankmath.com/wp-content/uploads/2021/12/Rank-Math-Enhanced-sharing-on-Slack.png)

So in this knowledgebase article, we’ll walk you through how you can take advantage of the Slack Enhanced Sharing feature with Rank Math.

## Table of Contents

- [Enhanced Sharing in Slack](#enhanced-sharing)

- [Configuring Slack Enhanced Sharing](#configuration)

- [Why Slack Is Not Showing Link Preview?](#no-link-preview)

## 1  Enhanced Sharing in Slack

Slack, by default, generates a preview for the website links with the available OpenGraph tags found on the page, and here is how it looks by default when we share a post.

![Slack Sharing example](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20720%20478'%3E%3C/svg%3E)

While the vast majority of links shared on Slack will have more or less the same format, you can enhance your previews with additional data to drive more clicks.

With the Slack Enhanced Sharing feature in Rank Math being enabled, your link previews will now include additional metadata from the post. And here is how the same post would look if Slack Enhanced Sharing is enabled.

![Slack Sharing meta data](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20720%20370'%3E%3C/svg%3E)

You can notice the above link preview included useful metadata such as **Written By** and **Time to read**. To ensure the added metadata is more relevant, Rank Math adds different metadata for different types of URLs like:

- **Posts and other Post types:** Written by, Time to read

- **Pages**: Time to read

- **Author pages**: Name, Posts (count)

- **Easy Digital Downloads**: Price

- **WooCommerce Products**: Price, Availability

- **Categories, Tags, and other Taxonomy Terms**: Items (count)

This way, you can ensure your links stand out while sharing on Slack and benefit from the increased visibility and clicks.

## 2  Configuring Slack Enhanced Sharing

The Slack Enhanced Sharing feature in Rank Math is enabled by default and requires no additional configuration from your end.

But if you prefer to change the settings (enable/disable) for certain types of pages on your website or to run A/B tests, then you can always do that from the Titles and Meta settings of Rank Math with the following steps.

### 2.1  Navigate to Titles & Meta Settings

Start by heading over to **Rank Math SEO → Titles & Meta Settings** inside your WordPress admin area. Here you can find various tabs for configuring the [Titles and Meta settings](https://rankmath.com/kb/titles-and-meta/) for individual post types and taxonomies. Choose the tab that you want to change the setting for.

![Titles and Meta settings for Posts and Taxonomies](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20900%20373'%3E%3C/svg%3E)

### 2.2  Enable/Disable Slack Enhanced Sharing

As you scroll down, you can find the Slack Enhanced Sharing option, which you can toggle to enable/disable according to your site’s content and preference. If this option is unavailable for you, then ensure that you’re using Rank Math in the [advanced mode](https://rankmath.com/kb/advanced-mode/).

![Slack Enhanced Sharing option](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201500%20291'%3E%3C/svg%3E)

### 2.3  Save Changes

Finally, click the **Save Changes** button at the bottom of the page to reflect the changes.

![Save Changes button](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20813%20122'%3E%3C/svg%3E)

Now you can also open the page’s source code to see if Rank Math has added the additional OpenGraph tags for Slack Enhanced Sharing, as shown below.

![Twitter data and label](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201168%20280'%3E%3C/svg%3E)

If you are able to see these additional OpenGraph tags, then you can start sharing your website links in Slack to see the enhancement for link previews.

## 3  Why Slack Is Not Showing Link Preview?

For some reason, if you’re unable to see the link previews when sharing your website links in Slack, then the following steps will help you investigate and fix the issue.

### 3.1  Link Belongs to Private Page

When you share a link to a private page or password-protected page in a Slack channel or conversation, then Slack’s access to your page is limited. As a result, Slack would not be able to retrieve the HTML contents of the page to generate a link preview.

### 3.2  Recently Posted in Your Workspace

Next, check if the link you’ve shared is recently(_last 60 minutes_) shared by someone else in the same conversation. If that’s the case, Slack will not include a preview for the link once again to keep the conversation clutter-free.

### 3.3  Message Contains More Than 5 Links

In the same way, if your message includes more than 5 links, then generating previews for the collection of links will make the conversation less interactive for users, as they need to keep scrolling through the messages.

Hence Slack would limit the maximum number of link previews to 5.

![Link previews are hidden for the messages with more than 5 links](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201526%20385'%3E%3C/svg%3E)

### 3.4  http:// Was Not Included

It is possible that you might have shared the link without adding `http://` or `https://` in front of the URL. Although such links work absolutely fine in leading users to the page, Slack will not attempt to generate link previews for such URLs.

To fix this, simply add `http://` or `https://` in front of the URL, as shown below.

![Use http or https in links](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20720%20370'%3E%3C/svg%3E)

### 3.5  Link Previews Turned off in Slack

If the above cases do not seem relevant to you, then the last thing you might want to do is to check if the previews are enabled for your Slack profile. You can check this on your Slack desktop by clicking on the profile picture in the top right of the screen and choosing **Preferences** from the menu options.

In the popup that appears on the screen, choose **Messages & Media** from the left sidebar. Now under the **Inline media & links section**, ensure the boxes next to **Show images and files from linked websites** and **Show text previews of linked websites** are checked.

If the above option(s) are left unchecked, then select it, as shown below. From now on, you should be able to see the previews for the links you share on Slack.

![Enable Slack options for link preview](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201586%201388'%3E%3C/svg%3E)

And, that’s it! If you still have absolutely any questions on using the Slack Enhanced Sharing feature in Rank Math, please feel free to [reach our support team directly from here](https://rankmath.com/support/), and we’re always here to help.

			

			 

			
	
		
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