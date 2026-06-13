# How to Add a Filter/Hook to Your Website

> **Category:** Developers
> **Source:** https://rankmath.com/kb/wordpress-hooks-actions-filters/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Add a Filter/Hook to Your Website

			
			

	

Filters and hooks are functions that can be added to your WordPress website allowing developers to make any changes to default WordPress functionality. Rank Math also offers various [filters and hooks for developers](https://rankmath.com/kb/filters-hooks-api-developer/) making it incredibly easy to interact and modify how Rank Math works…

In this tutorial, we’ll show you the different ways to add a filter/hook to your website.

## Table of Contents

- [Using Code Snippets Plugin](#code-snippets-plugin)

- [Adding Code to rank-math.php File](#rank-math-php-file)

- [Adding Code to Your Theme’s functions.php File](#functions-php-file)

## 1  Using Code Snippets Plugin

The first method is by using a plugin called Code Snippets. Using this plugin, you can add custom snippets to your website’s functions.php file.

### 1.1  Install Code Snippets Plugin

To get started, you need to install the [Code Snippets plugin](https://wordpress.org/plugins/code-snippets/) on your website. Head over to your WordPress dashboard and navigate to **Plugins → Add New → Code Snippets**. Install the plugin and activate it.

![Install code snippets plugin](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201280%20413'%3E%3C/svg%3E)

### 1.2  Adding New Code Snippet

To add a new filter/hook, navigate to **WordPress Dashboard → Snippets → Add New.**

![Add new snippet](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20648%20223'%3E%3C/svg%3E)

### 1.3  Adding Title and Code

Enter a title for your snippet and then add the filter/hook in the code editor.

![Creating new code snippet](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201113%20454'%3E%3C/svg%3E)

### 1.4  Choose the Settings

You can also notice some settings available on the same page, which will help you configure when and where the code snippet should appear in your functions.php.

![Code snippets settings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202046%20124'%3E%3C/svg%3E)

#### Run Snippet Everywhere

If you want this filter/hook to run all the pages (both front-end and back-end) of your website, choose **Run Snippet Everywhere**.

#### Only Run in Administration area

When you choose **Only run in administration area**, the filter/hook will run only in the WordPress admin area and will not run in the front-end of your website.

#### Only Run on Site front-End

If you wish to run this filter/hook only on your website’s front-end and not anywhere in the WordPress admin area, choose this option.

#### Only Run Once

If you wish to use your filter/hook to update a setting or activate a cron job or anything else that needs to be done only once, then choose this setting.

#### Priority

The default priority of this filter/hook will be 10. You can use the priority when you have multiple filters for a specific hook and need to prioritize which runs ahead/behind.

### 1.5  Description and Tags (Optional)

Although adding a description and tags for your code snippet is optional, it is a good practice to have them, in case, if another developer wants to make some changes to your code, it would be easy to understand the purpose of the code.

![Enter description and tag for the code snippet](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201118%20372'%3E%3C/svg%3E)

### 1.6  Save Changes and Activate

By clicking **Save Changes and Activate**, the code filter/hook will be saved and activated — that would immediately reflect in your website’s functions.php file. However, if you decide to save changes but not to implement them, then click **Save Changes**.

![Save changes and activate](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201000%20209'%3E%3C/svg%3E)

### 1.7  Removing a Filter/Hook

Adding or removing a filter/hook is easy — just navigate to **WordPress Dashboard → Snippets → All Snippets** and toggle the code snippet to add or remove it from the functions.php file.

![Enable or disable code snippet](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201280%20534'%3E%3C/svg%3E)

## 2  Adding Code to rank-math.php File

The second method would be to add the code to rank-math.php. We recommend adding filter/hook to rank-math.php file over functions.php file for a number of reasons.

Before you add a code snippet to rank-math.php, you’ll need to create the file first inside your child theme. You can easily do this with an FTP or cPanel File Manager.

### 2.1  Create rank-math.php File

If you’re using FTP, navigate to your theme’s folder (/wp-content/themes/theme-name/) and then create a new file named rank-math.php, as shown below.

![Create rank-math.php file with FTP](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201280%20800'%3E%3C/svg%3E)

In case if you’re using cPanel, then you can use their File Manager to create your new file named rank-math.php inside your theme folder (/wp-content/themes/theme-name/) as shown below.

![Create rank-math.php file in cPanel File Manager](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201280%20712'%3E%3C/svg%3E)

### 2.2  Open Theme File Editor

Once you’ve created the Rank Math file in your theme folder, you can edit the file by navigating to **Appearance → Theme File Editor** (for Classic Theme) or **Tools → Theme File Editor** (for Block Theme) in your WordPress Admin area. The right side of your screen lists all the theme files and templates.

![Theme File Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20793%20516'%3E%3C/svg%3E)

The files being shown here would vary depending upon the theme you’re using on your website. You can access the rank-math.php file you had created in the previous step from the list of files.

![Choose rank-math.php file in child theme](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20975%20561'%3E%3C/svg%3E)

### 2.3  Add the Code Snippet

You’d be able to see the code editor available in the middle of your screen, and here is where you will add the filter/hook.

![Add filter/hook to rank-math.php file](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201112%20671'%3E%3C/svg%3E)

### 2.4  Save Changes

Once you’ve added the filter/hook, click the **Update File** button at the bottom of the screen to save your changes.

![Save changes to rank-math.php file](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201117%20674'%3E%3C/svg%3E)

In case if you’ve accidentally made any mistake that would crash your site, then the theme file editor will throw an error without saving the file so that you can fix them immediately. Once you’ve successfully updated the file, you can check your site for changes/configurations intended with the filter/hook.

## 3  Adding Code to Your Theme’s functions.php File

The third way would be to add a filter/hook to your theme’s functions.php file directly using the Theme File Editor.

**Caution**: We recommend you use a child theme and edit the functions.php of your child theme instead of the parent theme, as you would lose the modified code and changes done when you update your theme, which might cause some adverse effects on your website.

### 3.1  Navigate to Theme File Editor

To edit your theme’s functions.php navigate to **WordPress Dashboard → Appearance → Theme File Editor** (for Classic Theme) or **WordPress Dashboard → Tools → Theme File Editor** (for Block Theme)

![Theme File Editor under Appearance section](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20793%20516'%3E%3C/svg%3E)

### 3.2  Edit Your functions.php File

Choose the **functions.php** file from the right sidebar that lists down all the files in your child theme. Add your new filter/hook to the file content and click **Update File** for the changes to take effect.

![editing functions.php from Theme File Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20988%20631'%3E%3C/svg%3E)

And, that’s it! We hope this tutorial was helpful in adding filters and hooks to your WordPress site, and if you have any questions on using Rank Math’s filters and hooks, feel free to [reach our support team](https://rankmath.com/support/) – we’re always more than happy to help.

			

			 

			
	
		
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