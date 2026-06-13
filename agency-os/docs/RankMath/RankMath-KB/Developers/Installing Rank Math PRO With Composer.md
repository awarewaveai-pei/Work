# Installing Rank Math PRO With Composer

> **Category:** Developers
> **Source:** https://rankmath.com/kb/install-rank-math-pro-with-composer/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Installing Rank Math PRO With Composer

			
			

	

You can also install [Rank Math PRO](https://rankmath.com/pricing/) with the help of [Composer](https://getcomposer.org/) – a dependency manager for PHP. In this tutorial, we’ll walk you through the process of installing Rank Math PRO with Composer.

## What is Composer?

Composer is a PHP dependency manager that lets you manage (installing/removing) all the libraries your PHP project depends upon. By default, Composer uses a repository called Packagist to download and install the packages (or libraries) you need for your project, just like we use the WordPress repository to install WordPress plugins and themes for our websites.

You can use the Composer for installing and managing WordPress plugins and themes and even the WordPress core itself. However, Composer cannot install plugins and themes directly from the official WordPress repository, and hence we use WPackagist. It is a PHP repository that mirrors all the plugins and themes available in the WordPress repository into a Composer repository and makes them readily available for Composer to install.

For this tutorial, we assume that you’ve already got Composer installed on your WordPress site, if not, you can [follow this tutorial](https://www.smashingmagazine.com/2019/03/composer-wordpress/) or check with your hosting company to get it installed.

## How to Install Rank Math PRO With Composer?

To install Rank Math PRO on your WordPress website with Composer, you will need:

- Rank Math PRO membership

- Username

- API Key

- Private Login Link to download Rank Math

### 1  Purchase a License

To get started, you will need a [Rank Math PRO license](https://rankmath.com/pricing/).

### 2  Copy Your Username

Login to your Rank Math Dashboard and navigate to the [Account details section](https://rankmath.com/my-account/edit-account/).

![Rank Math account details section](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201288%20770'%3E%3C/svg%3E)

In your Account details section, you can find your Rank Math username. Copy your username.

![Copy Rank Math username](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201828%201238'%3E%3C/svg%3E)

### 3  Copy Your API key

You can scroll down a bit to find your unique API key for your Rank Math account on the same page. Copy this API key, as we’ll need it in the next step.

**Note:** The API Key field will be visible only after you’ve activated the PRO license on at least one website.

![Copy Rank Math API Key](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20861%20490'%3E%3C/svg%3E)

### 4  Generate Private Login Link

Now, we’ll generate your private login link. Replace_**[USERNAME]**_ and _**[API-KEY]**_ in the following URL with the username and API key you’ve copied in the previous steps:

```
https://rankmath.com/download/510590/?username=[USERNAME]&api_key=[API-KEY]
```

For example – in the following format:

```
https://rankmath.com/download/510590/?username=testcomposer&api_key=29d4f7d643804e96512114d420b76693
```

You can use the private login link we’ve generated in this step to install Rank Math PRO with Composer.

**Note:** The private login link and API Token are unique to your account. They can be used to log in to your account directly. **Do not share it with anyone.**

### 5  Install Rank Math SEO Free and PRO With Composer

You will use the composer.json file available at your site’s root directory to inform Composer of all the packages (including the plugins and themes) your project needs.

For example, the following code snippet from composer.json can be used for installing Rank Math.

```
{
    "require": {
    "wpackagist-plugin/seo-by-rank-math":"*",
    "rankmath/seo-by-rank-math-pro": "*"
},
"repositories": [
    {
        "type": "composer",
        "url": "https://wpackagist.org"
    },
    {
        "type": "package",
        "package": {
            "name": "rankmath/seo-by-rank-math-pro",
            "type": "wordpress-plugin",
            "version": "2.7.0",
              "dist": {
                "type": "zip",
                "url": "https://rankmath.com/download/510590/?username=testcomposer&api_key=29d4f7d643804e96512114d420b76693"
            },
            "require": {
                "composer/installers": "*"
            }
        }
    }
],
"extra": {
    "installer-paths": {
        "wp-content/plugins/{$name}/": ["type:wordpress-plugin"]
    }
}
}
```

You can notice that the above code snippet installs both the Rank Math SEO Free and PRO versions. To keep Rank Math plugins robust and lightweight, we’ve built Rank Math PRO on top of the free version. Therefore, you’ll need **both the plugins to be installed and activated** at the same time for Rank Math PRO to work.

Once you’ve added the code snippet to your composer.json file, you can use the `composer install` or `composer update` command to install Rank Math plugins on your website.

**Note:**In order to update the PRO plugin, people need to delete the composer.lock file and update the version number in the JSON file.

### 6  Activate Rank Math License

Once you’ve installed Rank Math plugins, navigate to **Plugins → Installed Plugins** in your WordPress admin area. You can notice Rank Math SEO and Rank Math SEO PRO have been installed on your website from the list of installed plugins.

Select the plugins, choose **Activate** from the drop-down list and click **Apply** button.

![Activate Rank Math plugins](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20813'%3E%3C/svg%3E)

Once the plugin is activated, click the **Activate Now** button in the notification.

![Activate Rank Math license](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20998'%3E%3C/svg%3E)

You’ll be prompted to connect your Rank Math account to activate your License. Click **OK**.

![Activate Rank Math PRO license confirmation](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201150%20744'%3E%3C/svg%3E)

Your Rank Math PRO account will now be activated on your website.

![Rank Math PRO license connected](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201104%20448'%3E%3C/svg%3E)

Once you’ve activated your Rank Math license, we recommend [using the setup wizard](https://rankmath.com/kb/how-to-setup/) to configure the SEO settings for your website.

And, that’s it! We hope the tutorial was helpful in installing Rank Math PRO on your website with Composer. If you have any trouble using your API key & Composer to install Rank Math, feel free to [reach out to our support team](https://rankmath.com/support/) using the email address associated with your Rank Math PRO account, and we’d be more than happy to help.

			

			 

			
	
		
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