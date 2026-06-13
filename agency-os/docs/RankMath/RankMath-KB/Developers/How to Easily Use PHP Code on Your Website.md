# How to Easily Use PHP Code on Your Website

> **Category:** Developers
> **Source:** https://rankmath.com/kb/how-to-add-php-code-to-wordpress-post-or-page/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Easily Use PHP Code on Your Website

			
			

	

Adding a new piece of code to your site is not something that most website owners do on a daily basis. The majority of website owners typically modify theme files to create the desired effect.

In this knowledgebase article, we’re going to walk you through how to easily use the PHP code on your WordPress website.

## Table of Contents

- [The Problem With Editing Your Theme’s functions.php](#problem-with-editing-functions-php)

- [Solution: Use the Code Snippets Plugin](#use-code-snippets)

- [How to Make Changes in functions.php File?](#make-changes-in-functions-php)

## 1  The Problem With Editing Your Theme’s functions.php

One of the most important files you need to master is the [functions.php](https://developer.wordpress.org/themes/basics/theme-functions/) file if you’re an aspiring WordPress developer. Also, if you’re either developing or modifying a theme, you need to know how to get the most out of your functions.php file.

Editing the functions.php file may seem easy to experienced users, but it can be quite tedious and intimidating for newbies. They may face some pitfalls while inserting the PHP code in the functions.php file. The most common ones are as follows:

### 1.1  Not Update Proof

The main problem with editing functions.php file is it not being updated proof unless used in the child theme.

### 1.2  Difficult to Keep Track

When you tweak your functions.php file, it becomes difficult to keep track of all the changes made in the file.

### 1.3  Hard to Know Which Code Breaks the Functionality

A functions.php file can have numerous blocks of code used for many different purposes. Hence it becomes challenging to know which code breaks the functionality.

## 2  Solution: Use the Code Snippets Plugin

### 2.1  Install the Code Snippets Plugin

To begin with, install and activate the [code snippets](https://wordpress.org/plugins/code-snippets/) plugin by navigating to **WordPress Dashboard → Plugins**as shown below:

![Install and activate Code Snippets plugin](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201608%20970'%3E%3C/svg%3E)

### 2.2  Add the Snippet Code

Create a new snippet through the **Add New** page of the plugin. Each snippet has room for the code and a description to help you remember the code’s purpose.

You can add your snippet code by navigating to the **Snippets** section as shown below:

![Using the code snippets plugin](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%201852'%3E%3C/svg%3E)

As shown in the above image, add the title in the Title section. Once done, add the code snippet from our [filters page](https://rankmath.com/kb/filters-hooks-api-developer/) in the Code section, and add the description section.

You can also notice some settings are available on the same page, which will help you configure when and where the code snippet should appear in your functions.php. You can select from the given list options, such as Run snippet everywhere, only run in the administration area, only run on-site front-end, only run once.

Finally, when your snippet is ready, click the**Save Changes and Activate**button****to enable it. Alternatively, you can save it until you feel it’s ready to go live.

### 2.3  Manage the Snippets

You can manage your snippets from the **All Snippets** section. This allows you to see the status instantly and either activate or deactivate them.

![Manage the Snippets](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20406'%3E%3C/svg%3E)

Adding code snippets to your WordPress website with the help of this plugin is extremely safe. Being able to easily see which snippets are active on your website and having a way to add the snippet without directly editing the functions.php file yourself can save you many problems down the road.

Let’s now have a close look at how to make changes to your `functions.php` file.

## 3  How to Make Changes in `functions.php` File?

Note: We recommend you use [child themes](https://kinsta.com/blog/wordpress-child-theme/) to completely revamp your site without having to modify any core or parent theme files. Making a coding mistake in your functions.php file can lead to other WordPress errors, such as a [White Screen of Death](https://mythemeshop.com/blog/fix-wordpress-white-screen-death-error/). Hence, If you decide to edit your functions.php file, please use extreme caution to avoid the website’s adverse effects.

## 3.1  Navigate to the Theme File Editor

To begin with, navigate to the **Theme File Editor**, which is located under **WordPress Dashboard → Appearance** (for Classic Theme) as shown below:

![Navigate to Theme File Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20900%20359'%3E%3C/svg%3E)

In the case of Block Themes, the Theme File Editor is available at **WordPress Dashboard → Tools → Theme File Editor**.

## 3.2  Edit Your `functions.php` File

On the right-hand side of the screen, you can see a list of all the theme files. These differ depending on which theme you use, but one of the top options should be Theme Functions, i.e., **functions.php** file. Click on the file to open it in the editor as shown below:

![Edit functions.php file](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%201287'%3E%3C/svg%3E)

You can then make changes to your file and once done click on **Update File.**

That’s it! We hope the tutorial helped you add PHP code to your WordPress website. If you have any questions or doubts about using the PHP code, please feel free to contact our [support team](https://rankmath.com/support/), we’re always more than happy to help.

			

			 

			
	
		
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

		

										
			
- [How to Use Rank Math MCP Tools](https://rankmath.com/kb/mcp-tools/)

										
			
- [Why We’re Moving Rank Math Modules to React (And What It Means for You)](https://rankmath.com/kb/react-migration/)

										
			
- [How to Customize Breadcrumbs in Rank Math](https://rankmath.com/kb/customize-breadcrumbs-in-rank-math/)

										
			
- [Rank Math SEO Filters and Hooks for Developers](https://rankmath.com/kb/filters-hooks-api-developer/)

										
			
- [How to Make Your Theme Rank Math Compatible](https://rankmath.com/kb/make-theme-rank-math-compatible/)

										
			
- [How to Enable Headless CMS Support in Rank Math?](https://rankmath.com/kb/headless-cms-support/)