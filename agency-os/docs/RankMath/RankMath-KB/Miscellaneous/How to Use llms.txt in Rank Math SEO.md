# How to Use llms.txt in Rank Math SEO

> **Category:** Miscellaneous
> **Source:** https://rankmath.com/kb/llms-txt/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Use llms.txt in Rank Math SEO

			
			

	

AI chatbots, such as ChatGPT and Gemini, are transforming the way people find information online. But they don’t work like traditional search engines.

Search engines crawl your entire website on a regular basis. AI chatbots, on the other hand, only scan limited sections of your site in real time when someone asks a question. This means they can easily miss key details, especially if your site is large or frequently updated.

That’s where the `llms.txt` file comes in. For AI assistants that support it, this file helps them understand your site better, which can result in more accurate answers.

**Note:** The `llms.txt` is currently a proposal and not an official standard. While it can help AI assistants better understand your site, its adoption across platforms is still limited.

In this knowledgebase guide, we’ll walk you through how to enable the `llms.txt` feature in Rank Math and adjust the settings to fit your needs.

![How to Create an llms.txt File for Your Website](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201280%20720'%3E%3C/svg%3E)
__

## 1  What is llms.txt?

`llms.txt` is a lightweight, human-readable file placed at the root of your website (`like yourdomain.com/llms.txt`). It’s written in Markdown format (**.md**), so it’s simple to edit and structure clearly.

Unlike [`robots.txt`](https://rankmath.com/seo-glossary/robots-txt/), which tells search engines what to crawl or ignore, `llms.txt` is designed to guide AI models such as ChatGPT, Claude, or Gemini if the platform reads it. This guidance can help them reference your key content more accurately.

These tools don’t crawl your whole site like Google does; they scan small parts of it in real time to generate answers. And that often means they miss important content, misunderstand context, or pull outdated information.

That’s where `llms.txt` helps. It gives you a way to _guide_ these AI models to the content that matters most.

A typical `llms.txt` file includes:

- A short intro or summary about your site

- A curated list of URLs pointing to your best content, including help docs, product pages, blog posts, and other content that reflects your brand

- Optional notes or context to help AI understand the value of those pages

- Clean formatting that skips navigation clutter, sidebars, or ads

So when an AI platform that supports llms.txt answers questions using your site, it follows the curated version you provide, directing it straight to your most valuable content. This increases your chances of being [cited properly](https://rankmath.com/kb/indexing-in-chatgpt-search/), represented accurately, and discovered by users in AI-powered results.

## 2  How to Enable llms.txt in Rank Math

To use the llms.txt feature, first make sure you’ve installed and [set up the Rank Math SEO plugin](https://rankmath.com/kb/how-to-setup/) on your WordPress site. Once that’s done, follow these simple steps:

### 2.1  Enable the LLMS Txt Module

Go to **Rank Math SEO → Dashboard** inside your WordPress admin area. Scroll down until you find the **LLMS Txt**module, then click the toggle to enable it, as shown below.

**Tip:** If you don’t see the module, make sure you’re [using the latest version](https://rankmath.com/kb/update-rank-math-manually/) of Rank Math.

![Enable the LLMS Txt module in Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201387%20522'%3E%3C/svg%3E)

### 2.2  Configure the LLMS Txt Settings

Once enabled, click the **Settings** icon on the llms.txt module, or go to: **Rank Math SEO → General Settings → Edit llms.txt.**

Here, you can fully customize the appearance of your file and determine what content is included. By default, the file will be empty until you configure it.

![Edit the LLMS txt settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201342%201399'%3E%3C/svg%3E)

#### Select Post Types

Choose the post types you want to include in your llms.txt file, like **Posts** or **Pages**. Rank Math will then list each item’s title, URL, and a short description (intro text).

**Note:** Posts that are set to noindex will be excluded from the llms.txt file.

![Select Post Types](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201125%20240'%3E%3C/svg%3E)

#### Select Taxonomies

This allows you to include **taxonomies,** such as Categories or Tags. If you select **Categories**, for example, it will list each category name along with its URL in the llms.txt file.

![Select Taxonomies](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201107%20285'%3E%3C/svg%3E)

#### Posts/Terms Limit

You can set the maximum number of posts or taxonomy terms to include. The default is **100**, but you can adjust this to suit your needs.

![Posts/Terms Limit](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201149%20200'%3E%3C/svg%3E)

#### Additional Content

Need to add extra links or text manually? Use this field to insert any custom content you want added to the file. You can add each one on a different line.

![Additional Content](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201108%20334'%3E%3C/svg%3E)

Once you’re done configuring everything, click**Save Changes** at the bottom of the page to store your settings.

![Save Changes](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201184%20170'%3E%3C/svg%3E)

### 2.3  Preview Your llms.txt File

After saving, you can preview how your llms.txt file looks by clicking the preview link at the top of the **Edit llms.txt** tab, as shown below.

![The llms txt file link](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20369'%3E%3C/svg%3E)

It will take you to a live version of your file, usually at: `https://yoursite.com/llms.txt`

You’ll be able to view the full content you’ve configured. This is helpful for verifying that everything looks correct. And this is how it looks:

![how the llms.txt file looks like](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201399%20666'%3E%3C/svg%3E)

And that’s it. We hope you’ve been able to set up your `llms.txt` on your site with Rank Math. If you’ve any doubts or need any assistance with Rank Math, please don’t hesitate to [reach out to our support team](https://rankmath.com/support/). We are available 24/7, 365 days a year.

			

			 

			
	
		
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