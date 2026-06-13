# How to Use Regex Redirects in Rank Math

> **Category:** 404 & Redirections
> **Source:** https://rankmath.com/kb/how-to-use-regex-redirects/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Use Regex Redirects in Rank Math

			
			

	

As you’re aware, redirects enable you to forward one URL to another. It’s a smart way to send users and search engines to a different URL while preserving your search engine rankings for a particular page.

When visitors request previously available content on your site, but maybe since it has been moved, you want them to be redirected to your content’s new location and not get a 404 error.

Additionally, search engines must understand whether content has moved and whether that move is temporary or permanent.

Giving visitors and search engines the right signals for your website improves user experience and is essential to your SEO performance.

Regex—short for regular expression—is a valuable shorthand, extremely useful for setting up large numbers of redirects.

Imagine how massive it would be if you had to individually create separate redirects for hundreds of URLs. Like any language, you need to familiarize yourself with the basics.

![How to Create Regex Redirects Using Rank Math](https://img.youtube.com/vi/DYmxKiuEAZU/maxresdefault.jpg)
__

In this knowledgebase article, we’ll walk you through how to use regex redirects in Rank Math. Before using regex redirects in Rank Math, let’s first understand what a regex redirect is.

    
## Table Of Contents

    

        
- [What is a Regex Redirect?](#what-is-a-regex-redirect)
        
- [How to Add Regex Redirects in Rank Math](#how-to-add-regex-redirects)
- [Examples of Regex Redirects](#examples)

- [Redirect URLs with Diacritic Characters](#redirect-urls-with-diacritic-characters)

- [Redirect AMP URLs to Standard URLs](#redirect-amp-urls-to-standard-urls)

- [Redirect URLs with /blog/ and .html Extensions](#redirect-urls-with-blog-and-html-extensions)

- [Redirect URLs with a Date, URL Slug, and .html to the URL Slug](#redirect-urls-with-date-slug-and-html-extension)

- [Redirect Multiple URL Slugs with a Constant to a Single URL](#redirect-url-slugs-with-a-constant)

- [Redirect Every URL in a Subdirectory to a Specific URL](#redirect--urls-in-a-subdirectory)

- [Add Additional Text to a URL](#add-additional-text-to-urls)

    

## 1  What is a Regex Redirect?

A Regex or a [Regular Expression](http://en.wikipedia.org/wiki/Regular_expression) is nothing but a set of characters that helps find a pattern within a piece of text. It allows matching any number of URLs dynamically without even knowing what the URLs might be.

In the case of standard redirects, you can specify a source and a destination URL. A single source points to a single destination, but there may be situations where you’d want to redirect more than one source to a destination. This is when regex redirect comes into the picture and can match multiple source URLs and redirect them to the destination.

These are some of the common characters that are used in Regex Redirects:

| Character | Interpretation | Example |
|---|---|---|
| * | Zero or more occurrences of the preceding element. | ab*cd matches “acd”, “abcd”, “abbcd”, “abbbcd”, and so on. |
| ? | Zero or one occurrence of the preceding element. | abc? matches “abc” and “ab” |
| + | One or more occurrences of the preceding element. | ab+cd matches “abcd”, “abbcd”, “abbbcd”, and so on, but not “acd”. |

## 2  How to Add Regex Redirects in Rank Math

[Setting up a redirection](https://rankmath.com/kb/setting-up-redirections/) has always been easy in Rank Math, thanks to its powerful Redirection Manager. With the help of Rank Math, you can manage your website’s redirections with the superhero-like powers bestowed in a complete Redirection Manager. Not only this, but it’s much easier to redirect large numbers of similar URLs with the help of its regex redirects option.

**Note**: Make sure you’ve [installed **Rank Math**](https://rankmath.com/kb/how-to-setup/) and activated the Redirection module from **WordPress Dashboard →** **Rank Math SEO**.

### 2.1  Navigate to Redirections

To add a regex redirect, navigate to**Redirections** from Rank Math’s dashboard as shown below:

![Rank Math-Redirections](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20318%20836'%3E%3C/svg%3E)

### 2.2  Add a New Redirection

Add a new redirection from **Redirections → Add New** as shown below:

![Add New Redirection](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202068%201142'%3E%3C/svg%3E)

### 2.3  Add Regex Redirect

Add your source URLs and select the matching option as **Regex** from the drop-down list. Add your destination URL, and make sure you activate the redirect. Click on **Add Redirection** to add the regex redirect.

![Add regex redirect](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201682%202189'%3E%3C/svg%3E)

And that’s it! Your regex redirect will then be added.

## 3  Examples of Regex Redirects

Let’s take a look at some of the examples that will help you to understand regex redirects in a better way.

![Examples of regex redirects](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201697%20705'%3E%3C/svg%3E)

### 3.1  Redirect URLs with Diacritic Characters

If you want to get rid of the diacritic character and redirect all links with `/ferñs/` to new `/ferns/`, you’ll have to add the following in your source and destination URLs:

```
Source URLs: /ferñs/(.*)
Destination URL: /ferns/$1
```

### 3.2  Redirect AMP URLs to Standard URLs

If you’ve used [AMP on your website](https://rankmath.com/kb/using-amp-with-rankmath/) and later decided not to use it, you can redirect all AMP URLs back to the regular URLs. To achieve that, add the following to your source and destination URLs:

```
Source URLs: /(.*)/amp
Destination URL: /$1
```

### 3.3  Redirect URLs with /blog/ and .html Extensions

If you want to get rid of .html pages that have the `/blog/` prefix and redirect all the posts in the directory, you’ll need to add the following in your source and destination URLs:

```
Source URLs:  /blog/(.*?)\.html
Destination URL:  /$1/
```

And the final result will be as `http://yourdomain.com/blog/your-post-name.html` → `https://yourdomain.com/your-post-name/`

### 3.4  Redirect URLs with a Date, URL Slug, and .html to the URL Slug

To redirect a URL containing a date (year and month), URL slug, and a .html file extension to just the URL slug, use the regex below:

```
Source URLs: /([0-9]{4})/([0-9]{2})/(.*).html 
Destination URL: https://yourdomain.com/$3
```

For example, this regex will redirect a URL like `yourdomain.com/2026/01/collections.html` to `yourdomain.com/collections`.

![Sample of a regex to redirect a URL with a year, month, and .html to only the URL slug](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20697'%3E%3C/svg%3E)

### 3.5  Redirect Multiple URL Slugs with a Constant to a Single URL

To redirect multiple URL slugs containing a constant, such as a generic word or a business or brand name to a single URL, use the regex below. Remember to replace `product` with your constant.

```
Source URLs: product-(.*)
Destination URL: https://yourdomain.com/yoga-equipment
```

For example, this regex will redirect URLs like `yourdomain.com/product-yoga-mat` and `yourdomain.com/product-exercise-block` to `yourdomain.com/yoga-equipment`.

![Sample of a regex to redirect multiple URL Slugs with a constant to a single URL](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20699'%3E%3C/svg%3E)

### 3.6  Redirect Every URL in a Subdirectory to a Specific URL

To redirect every URL in a subdirectory to a specific URL, use the regex redirect below. Make sure to replace `yoga` with your subdirectory name.

```
Source URLs: ^yoga/(.*)
Destination URL: https://yourdomain.com/shop/
```

For example, this regex will redirect URLs like `yourdomain.com/yoga/mats` and `yourdomain.com/yoga/blankets` to a new URL, such as `yourdomain.com/shop/`.

![Sample of a regex to redirect a subdirectory and pages to a new URL](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20706'%3E%3C/svg%3E)

### 3.7  Add Additional Text to a URL

To redirect URLs containing words and numbers to a new URL with an additional word, use the regex below. Make sure to replace `for` in the destination URL with the new word.

```
Source URLs: /([a-zA-Z0-9-]+[^-r])-([0-9]+)
Destination URL: /$1-for-$2/
```

If the URLs retain the subdirectory, use the regex redirect below. Make sure to change `blog` to your subdirectory name.

```
Source URLs: /blog/([a-zA-Z0-9-]+[^-r])-([0-9]+)
Match: Regex 
Destination URL: /blog/$1-for-$2/
```

For example, the regex without a subdirectory will redirect a URL like `yourdomain.com/health-tips-2026` to `yourdomain.com/health-tips-for-2026`.

![Sample of a regex to add additional text to a URL](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20695'%3E%3C/svg%3E)

Meanwhile, the regex with a subdirectory will redirect a URL like `yourdomain.com/blog/health-tips-2026` to `yourdomain.com/blog/health-tips-for-2026`.

![Sample of a regex to add additional text to a URL with a subcategory](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20697'%3E%3C/svg%3E)

You can also check some of our other [supported regexes](https://rankmath.com/kb/solving-redirection-issues-using-rank-math-seo/) and have a better understanding of regex redirects. Also, you can experiment with a pattern and tune it to match exactly what you want with the [regular expression 101](https://regex101.com/) tools.

Rank Math’s redirect manager fully supports Regex, using which you can create the most complex redirects with ease. However, if you still have any questions about using regex redirects in Rank Math, please feel free to contact our [support team](https://rankmath.com/support/).

			

			 

			
	
		
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