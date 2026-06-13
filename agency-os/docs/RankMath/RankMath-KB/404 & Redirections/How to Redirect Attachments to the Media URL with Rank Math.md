# How to Redirect Attachments to the Media URL with Rank Math

> **Category:** 404 & Redirections
> **Source:** https://rankmath.com/kb/redirect-attachments-to-the-media-url/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Redirect Attachments to the Media URL with Rank Math

			
			

	

In this knowledgebase article, we’re going to walk through the steps on how to redirect attachments to the media URL using Rank Math.

## Why You Should Redirect WordPress Attachments?

The major reason for you to redirect the WordPress attachments is that it has a huge impact on your [SEO](https://mythemeshop.com/blog/blogging-seo/). Some of the reasons are:

- It’s possible that the search engines might start bringing in more traffic to the attachment pages instead of your original post.

- Most of the time, the attachment page seems to be out of context, and a visitor may not be able to understand it. As a result, they will simply close the link and move away, resulting in an increased bounce rate.

- It’s also quite possible that Google might index all of the available image files and treat them as duplicate content.

- There could be instances where media added to a restricted page could be indexed on search engines with their attachment URLs. In this case, any unverified user might get access to the media of the page by simply clicking through the URL without the password.

## How to Redirect Attachments to the Media URL Using Rank Math?

Rank Math offers an option to redirect attachments to the parent posts, but you can further use a filter to redirect these attachments to the media URL instead of the parent posts. Before using the filter, you’ll need to enable the **Redirect Attachments** option.

### 1  Enable Redirect Attachments

To get started, you can navigate to **Rank Math SEO → General Settings → Links** inside your WordPress dashboard and then enable the **Redirect Attachments** option. If the Redirect Attachments option is unavailable for you, then make sure you’ve [switched to the Advanced Mode](https://rankmath.com/kb/switch-from-easy-to-advanced-mode/) in Rank Math.

Click the **Save Changes** button at the bottom of the page.

![Redirect Attachments with Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201535%20230'%3E%3C/svg%3E)

### 2  Add the Code Snippet

Now, you can add the following code snippet either to your theme’s [rank-math.php](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file) file. We recommend adding the code to the rank-math.php file, and if you haven’t already created this file in your theme’s folder, you can [follow this tutorial](https://rankmath.com/kb/filters-hooks-api-developer/#how-to-add-code-snippets-to-rank-math-php).

To add the code snippet, navigate to **Appearance → Theme File Editor** (for a Classic Theme) or **Tools → Theme File Editor** (for a Block Theme) inside your WordPress admin area.

![Navigate to Theme File Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20900%20359'%3E%3C/svg%3E)

From the list of files shown on the right of your screen, choose rank-math.php and add the code in the code editor.

```
/**
 * Redirect Attachments to media URL
 */
add_filter('rank_math/frontend/attachment/redirect_url', function ($redirect, $post) {
    return $post->guid;
}, 10, 2);
```

Now, click the **Update File** button for the changes to reflect.

![Add the code snippet to rank-math.php file](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201114%20661'%3E%3C/svg%3E)

## Examples of Redirect Attachments

Now all your attachment pages should redirect to the actual media URL. Let’s look at some of the examples to understand this in a better way.

### 1  PDF File

From the below example, you can notice how the attachment URL`http://test.local/my-trip-to-new-york/newyork-2/`, and the file URL `http://test.local/wp-content/uploads/2021/02/newyork.pdf`.

![pdf Redirection](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%201195'%3E%3C/svg%3E)

Now users landing on the attachment page will be redirected to the file `http://test.local/wp-content/uploads/2021/02/newyork.pdf`

### 2  MP3 File

In the below example, you can notice the attachment URL and the file URL for an mp3 audio. When users access the attachment page, they will be redirected to the file URL.

![MP3 File redirect](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%201052'%3E%3C/svg%3E)

### 3  Image Attachment

Similarly, for an image attachment, you can notice the attachment URL is `http://test.local/about-page/` and the file URL is `http://test.local/wp-content/uploads/2021/02/about-page.jpg`. When visitors land on the attachment URL, they’ll be redirected to the image file URL now.

![Image Attachment redirect](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20960'%3E%3C/svg%3E)

And, that’s it! We hope you’ve managed to redirect attachments to the media URL – and if you still have any questions, please free to [reach our support team](https://rankmath.com/support/), we’re always more than happy to help.

			

			 

			
	
		
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

		

										
			
- [How to Track and Fix 404 Errors from ChatGPT](https://rankmath.com/kb/fix-404-errors-from-chatgpt/)

										
			
- [How to Trace Your Website’s URL Redirects](https://rankmath.com/kb/trace-url-redirects/)

										
			
- [How to Set 410 Status Code in Bulk for WordPress](https://rankmath.com/kb/set-410-status-in-bulk/)

										
			
- [301 vs 302 Redirect: Which One Should You Use?](https://rankmath.com/kb/301-vs-302-redirect/)

										
			
- [How to fix ‘The Redirection you are trying to create may cause infinite loops’?](https://rankmath.com/kb/fix-infinite-loop-error/)

										
			
- [How to Set Up Redirections](https://rankmath.com/kb/setting-up-redirections/)