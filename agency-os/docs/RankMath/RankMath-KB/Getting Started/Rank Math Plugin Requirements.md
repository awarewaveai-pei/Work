# Rank Math Plugin Requirements

> **Category:** Getting Started
> **Source:** https://rankmath.com/kb/requirements/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Rank Math Plugin Requirements

			
			

	

Before you set up Rank Math, it’s good to check if your server is compatible with Rank Math or not. While most websites will never have a compatibility issue with Rank Math, it’s better to be safe than sorry.

There are various technical requirements that your website should qualify for Rank Math to function correctly. When you [install Rank Math](https://rankmath.com/kb/installing-through-the-admin-panel/) for the first time, the Setup Wizard will be initiated automatically and run through compatibility checks.

![Rank Math plugin requirements in Setup Wizard](https://rankmath.com/wp-content/uploads/2022/05/Rank-Math-compatibility-check.png)

If your website and server are configured correctly to use Rank Math — enjoy using Rank Math. However, if your website is under the weather, please continue reading through our technical requirements to ensure your server or web hosting provider is able to meet the following requirements.

**TL;DR**

- The lowest PHP version supported by Rank Math is 7.4**,** the most recent stable PHP version is recommended.

- Rank Math supports WordPress 6.3 and up and recommends updating to the latest version.

- Rank Math needs some PHP modules installed on your server to add extra abilities to the PHP programming language.

- If your website uses other SEO plugins, you can safely deactivate the plugin and import the plugin data to Rank Math.

## Table of Contents

- [PHP Version](#php)

- [WordPress Version](#wordpress)

- [PHP Modules](#php-modules)

- [Conflicting Plugins](#plugin-conflicts)

## 1  PHP Version

Rank Math needs a fairly modern version of PHP to work. It doesn’t have to be the bleeding edge latest release, but a very old version won’t cut it.

The lowest supported PHP version is now 7.4. Even [WordPress themselves](https://wordpress.org/about/requirements/) recommends that you use PHP 7.4 at least.

![WordPress recommended PHP version](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201261%20682'%3E%3C/svg%3E)

You can even find a notification inside your WordPress dashboard recommending you to update PHP.

![WordPress PHP update recommended version](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201102%20539'%3E%3C/svg%3E)

The reasons we are asking you to update rather than support an older version are many.

At first, older PHP versions are [no longer supported](https://www.php.net/supported-versions.php) by the PHP development team – they’ve stopped working on security fixes and performance tweaks. It’s a relic of the past – so if you’re still using it, it’s time to [update your PHP version](https://rankmath.com/blog/update-php-version-in-wordpress/).

Later versions of PHP are more secure and can run faster. They are designed for very high performance, even under heavy traffic loads — and you can easily double the performance of your website by switching to a more stable PHP release.

**To fix**: If you don’t know how to update, the easiest way to achieve that is to ask your hosting company.

**Pro Tip:** [Kinsta](https://kinsta.com/) is a WordPress host that supports the latest PHP versions on its platform, and makes it easy for users to access PHP settings and enable automatic PHP updates.

## 2  WordPress Version

Keeping your WordPress installation up-to-date allows you to enjoy the latest plugins and performance optimizations. It’s also extremely important from a security angle. In fact, outdated WordPress sites are hacked every day, so make sure you update your site regularly!

If you have an out-of-date WordPress version, you’ll have to update it before continuing with setting up Rank Math, as the lowest version we support is 6.3. However, we recommend you update to the latest version of WordPress.

Fortunately, it’s effortless to update WordPress through the wp-admin panel.

**To fix**: It’s a simple one-click process to update WordPress, and it’s the first option you’ll see when you log on to the dashboard, whenever a new update is available. Click **Please update now** to initiate the installation of the update.

![Update WordPress to the latest version](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201567%20837'%3E%3C/svg%3E)

If you want to check for an update manually, navigate to **Dashboard -> Updates.**

![Updates in WordPress dashboard](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201000%20153'%3E%3C/svg%3E)

On the WordPress Updates page on your screen, click the **Update Now** button and wait until the update is completed.

![Update WordPress manually](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201100%20686'%3E%3C/svg%3E)

## 3  PHP Modules

Besides an up-to-date WordPress installation, the other requirements are PHP modules. Just as WordPress can have additional functionality via the use of plugins, even PHP can have additional functionality using PHP modules. While most of the required modules should already be installed on your server by your hosting company, it doesn’t hurt to be sure.

If your server is missing any required PHP modules, you’ll see a message like this:

![Missing PHP modules](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20733%20150'%3E%3C/svg%3E)

As we mentioned, PHP modules add extra abilities to the PHP programming language – such as the ability to process XML files or images efficiently.

If you’re using a dedicated server, it’s usually quite easy to install new PHP modules. But if you’re on shared hosting, you probably won’t be able to add these modules on your own.

**To Fix**: You’ll need to contact your hosting company’s support team and ask them to activate them for you. Just copy the missing modules’ names into an email or chat message and explain that you need them activated on your account.

## 4  Conflicting Plugins

Some plugins are known to conflict with Rank Math. This includes other SEO plugins that do similar tasks as Rank Math. Imagine how confusing it would be if you had two or three plugins asking you for the same info every time you published a post!

Rank Math will check for any known conflicts. If it finds any, it will display them like this:

![Rank Math setup wizard - conflicting plugins](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20834%20133'%3E%3C/svg%3E)

**To fix**: You can disable the offending plugin by clicking the “**Deactivate Plugin**” button. The deactivate button doesn’t delete anything from your server – it just switches the plugin off.

The good news is that Rank Math has a built-in feature to import your SEO settings from the most popular SEO plugins like [Yoast SEO](https://rankmath.com/kb/yoast-seo-migration/), [AIO SEO Pack](https://rankmath.com/kb/all-in-one-seo-pack-migration/), and more. That means you can safely disable other SEO plugins without worrying about your website’s SEO.

You can import all the settings and data from other plugins in the next step. So, for now, we encourage you to disable any conflicting plugins to avoid issues.

And if your server meets our Rank Math plugin requirements, you’re ready to move on to the next step! Click the “**Start Wizard**” button. If you’re still finding any issues with setting up Rank Math plugin on your website, please feel free to reach [our support team](https://rankmath.com/support/) — as we’re always more than happy to help.

			

			 

			
	
		
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