# Nofollow vs. Dofollow Links: Understanding SEO Impact

> **Category:** Miscellaneous
> **Source:** https://rankmath.com/kb/nofollow-vs-dofollow/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Nofollow vs. Dofollow Links: Understanding SEO Impact

			
			

	

[Link building](https://rankmath.com/blog/link-building/) is crucial for Search Engine Optimization (SEO). It serves as a vote of confidence from other sites that your content is reputable and valuable.

However, not all links are created equal. There are two main types of links: Nofollow and Dofollow.

Understanding their impact on [SEO](https://rankmath.com/blog/best-seo-practices/) is crucial.

In this knowledgebase article, we’ll explore the nuances of Nofollow and Dofollow links, their impact on SEO, and best practices for leveraging each type effectively.

## 1  How Links Work on Websites

Before delving into the specifics of dofollow and nofollow links, it’s essential to understand how adding links works on websites.

Links are the fundamental building blocks of the World Wide Web, allowing users to navigate from one web page to another.

You can add a link to your website by embedding a hyperlink within the HTML code of your webpage. This hyperlink holds two key parts: the destination URL (web address) and the clickable anchor text users see.

For example, if you wanted to link to the Rank Math website, the HTML code would look something like this:

`<a href="https://rankmath.com/">Rank Math</a>`

In this example, `https://rankmath.com/` is the URL, and **Rank Math** is the anchor text.

Once a link is added to a web page, search engine crawlers (like Googlebot) can follow and analyze these links as they crawl the internet.

## 2  What is a Nofollow Link?

A nofollow link is an HTML link with the rel=”nofollow” attribute attached. This attribute instructs [search engine crawlers](https://rankmath.com/blog/how-search-engine-indexing-works/) not to follow or pass any [link equity](https://rankmath.com/seo-glossary/link-equity/) (ranking power) from the linking page to the linked page.

Example: `<a href="https://example.com" rel="nofollow">Anchor Text</a>`

The `rel="nofollow"` attribute signals to search engines like Google to disregard that particular link when evaluating and ranking websites. Nofollow links do not contribute to a site’s authority or search rankings.

Google introduced nofollow links 2005 to combat comment spam and paid link schemes manipulating search results.

## 3  What is a Dofollow Link?

A dofollow link, also known as a follow link, is the default type of link that search engines crawl and follow.

In HTML, a dofollow link has no special attributes and appears like this:

`<a href="https://example.com">Example Anchor Text</a>`

When a website links to another using a dofollow link, it endorses the linked content, signaling to search engines that the destination site is valuable and relevant.

This endorsement, or vote of confidence, contributes to the linked website’s authority and can positively impact its rankings.

However, not all dofollow links carry equal weight. Search engines evaluate various factors when determining a dofollow link’s value, including

- **Source Authority:** Links from high-authority, reputable sites carry more weight than low-quality or spammy sources.

- **Relevance:**Links from sites in the same or related industries are generally more valuable than unrelated sources.

- **Anchor Text:** The visible, clickable link text can provide context and relevance signals.

- **Link Placement:**Links in the main content area are typically more valuable than those in the sidebar, footer, or less prominent placements.

## 4  When to Use Nofollow Links

Here are the common scenarios for using nofollow links:

### 4.1  Sponsored or Paid Links

If you receive compensation for including a link on your site, mark it as nofollow. This adheres to [Google’s guidelines](https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links) and prevents potential penalties for manipulative link schemes.

### 4.2  User-Generated Content

Use nofollow along with `ugc` attribute for links in comments, forums, and other user-generated areas. This helps deter spammers from gaming the system to boost rankings.

### 4.3  Untrusted or Low-Quality Sources

If linking to an untrustworthy or low-quality website, use nofollow to signal you don’t necessarily endorse or vouch for that site.

### 4.4  Login/Registration Pages

It’s best practice to nofollow links leading to login, registration, or account areas, as these typically lack valuable content for search crawlers.

### 4.5  Affiliate or Partnership Links

For affiliate or partner links where you earn referral commissions, use nofollow along with sponsored attribute to comply with search engine guidelines regarding paid links.

## 5  When to Use Dofollow Links

Here are the common scenarios for using dofollow links:

### 5.1  Linking to High-Quality, Relevant Content

Use dofollow links when linking to valuable, trustworthy, and relevant third-party content for your readers. This signals to search engines you endorse and vouch for the quality of the linked material.

### 5.2  Internal Links

Links between pages on your own website should always be dofollow. This helps search engines understand your [site’s structure](https://rankmath.com/blog/site-structure/) and hierarchy while passing link equity.

### **5.3  Authoritative Sources**

When citing or referencing reputable, authoritative sources like government websites or respected publications, use dofollow links to reinforce the credibility of your content.

### 5.4  Business Partners or Affiliates

For trusted business partners or affiliates where you’re not directly compensated for the link, dofollow is generally acceptable if the linked content is relevant and high-quality.

### 5.5  Natural Editorial Links

High-quality, naturally earned editorial links from other sites, representing a genuine endorsement based on your content’s merits, should be dofollow.

## 6  What’s the Difference Between Nofollow and Dofollow Links?

Dofollow links are the standard links that allow search engines to crawl and pass link equity (ranking power) to the linked page.

Conversely, nofollow links instruct search engines not to follow the link or transfer any link equity.

![Dofollow VS. Nofollow links: What's the difference?](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202240%201260'%3E%3C/svg%3E)

It’s important to note that adding the nofollow or dofollow attribute is controlled by the website owner, not the search engines themselves.

## 7  Benefits of Nofollow and Dofollow Links in SEO

While nofollow and dofollow links have distinct impacts on search engine optimization (SEO), both can offer specific benefits when used correctly.

### 7.1  Benefits of Nofollow Links for SEO

Here are the benefits of nofollow links for SEO:

- **Increased Brand Awareness and Exposure:**While nofollow links don’t directly impact rankings, they can increase brand visibility and drive referral traffic.

- **Potential Dofollow Link Acquisition:**Participating in communities and platforms that allow nofollow links can establish relationships leading to future dofollow opportunities.

- **Compliance with Guidelines:** Using nofollow for sponsored content, user-generated comments, and untrusted sources demonstrates adherence to search engine guidelines, avoiding potential penalties.

- **Crawl Budget Optimization:**Using Nofollow for low-value or irrelevant pages helps search engines prioritize crawling your most important content.

- **Advertising Disclosures:** Nofollow links disclose sponsored or paid links, promoting transparency and trust.

### 7.2  Benefits of Dofollow Links for SEO

Here are the benefits of dofollow links for SEO:

- **Increased Link Equity and Authority:** Quality dofollow links from authoritative, relevant sites pass significant link equity, boosting perceived authority in search engines’ eyes.

- **Better Search Rankings:**Accumulating valuable dofollow links helps improve rankings for relevant keywords and queries.

- **Improved Crawlability and Indexation:**Dofollow links aid search crawlers in discovering new pages, leading to better content indexation and exposure.

- **Referral Traffic:**Dofollow links can drive targeted referral traffic from reputable sources, increasing visibility and potential conversions.

## 8  Best Practices to Attract Dofollow Links to Your Website

Obtaining quality dofollow links can be challenging. Here are some best practices:

- Create high-quality, valuable content for your audience, like blog posts, videos, or infographics.

- Reach out for guest posting or content collaboration opportunities with other websites in your industry.

- Create free, useful resources or tools, such as AI, that publications will link to naturally.

- Use social media to promote your content and engage your audience.

- Participate in online communities, providing helpful advice to establish authority.

- Monitor and disavow any low-quality or spammy backlinks that could harm your search engine rankings.

- You can monitor for broken links on other sites and offer your content as a replacement.

- Contribute to link roundups or resource pages within your niche to gain dofollow links.

## 9  How to Add Nofollow Links in WordPress

You can easily add a nofollow link directly from the WordPress post/page editor or automate the nofollow attribute to apply to all your external links. For detailed step-by-step instructions on how to do this, [refer to our guide here](https://rankmath.com/kb/should-you-nofollow-external-links/).

Additionally, when using the Rank Math SEO plugin, you can add or exclude certain domains from being affected by the nofollow attribute applied across your website content. Our guide explaining this process[can be found here](https://rankmath.com/kb/nofollow-specific-external-links/).

## 10  How to Identify Nofollow Links

The most straightforward way to check if a link is nofollow is to inspect the HTML source code.

To do this, go to the webpage, right-click the link, and select the **Inspect** option from the context menu to access the browser’s developer tools.

![click Inspect](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201310%20567'%3E%3C/svg%3E)

Look for `rel="nofollow"` within the link’s `<a>` tag in the HTML. If that attribute is present, the link has a nofollow value, as shown below.

![link with a nofollow value](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201108%20460'%3E%3C/svg%3E)

That’s it! We’ve successfully covered the differences between nofollow and dofollow links. You now know which type to use when adding links to your website.

If you still have any questions regarding nofollow and dofollow links, please feel free to [reach out to our support team directly from here](https://rankmath.com/support/). We’re always happy to help.

			

			 

			
	
		
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