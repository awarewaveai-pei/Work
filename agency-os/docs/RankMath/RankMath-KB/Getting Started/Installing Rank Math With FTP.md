# Installing Rank Math With FTP

> **Category:** Getting Started
> **Source:** https://rankmath.com/kb/installing-with-ftp/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Installing Rank Math With FTP

			
			

	

FTP is a very popular choice for uploading files to web servers. It’s not the only file transfer technology, but it does the job well and is easy to use.

There are many FTP clients out there, and they all have different interfaces and workflows. Behind the scenes, they all do the same thing.

For this tutorial, we’re using the most popular FTP client – Filezilla. You can follow along with your preferred FTP app, but some of the details will be different.

## Here’s what we’re going to do:

- [Find the WordPress installation folder](#find-wordpress-installation-directory)

- [Unzip the Rank Math plugin zip file](#unzipping-rank-math-zip-file)

- [Log on to the server with an FTP client](#log-on-to-server)

- [Navigate to the plugins folder](#navigate-to-plugins-folder)

- [Upload the Rank Math folder](#upload-rank-math-folder)

It’s a pretty straightforward process because WordPress is designed to be simple. WordPress will recognize it if the plugin is saved in the right directory.

## 1  Find the WordPress Installation Directory

This is where things get a little tricky. Web servers are flexible beasts, and they can be configured in many ways. Usually, it’s the hosting company that configures your web server.

WordPress is normally installed inside the top level of the “document root” – this is the directory that holds your site’s web content.

Your server has many directories to store other types of files – configuration files, executable programs, logs, and other random things. They’re not in the document root, so they aren’t visible over the web.

The simplest type of website is a static one-page, HTML-only site. **These sites only have a single file** – it’s usually called “_index.html_”, and it’s stored directly inside the domain root.

Single-page static sites aren’t very powerful – and WordPress is a mighty CMS (Content Management System). It’s made up of hundreds of files in dozens of directories.

Unlike a static site, these files are not served directly to people reading your site. WordPress files are executable – they contain code. The web server reads them, and PHP executes them to build your website.

As we mentioned, WordPress is made of many files. Luckily, you don’t need to understand all of them (or any of them) to install a plugin.

**You just need to know how to locate the plugin folder.**

We said that WordPress is usually installed in the document root. Sometimes, a WordPress installation is put into a sub-folder. For instance, if you added WordPress to an existing site, you may have decided to install it into a “/blog/” directory.

So, if the “document root” was “_/var/www/_”, the WordPress file would be “_/var/www/blog_”.

“/var/www” is a fairly common document root, by the way. It’s the default location for Ubuntu servers. But that doesn’t mean that every Ubuntu server uses that location. The web server can be configured to use almost any directory in the machine’s filesystem – and it can use a different one for each domain name.

If you have multiple domains on your server, you probably have multiple “document roots.” Each site has to keep its content separate; the normal way to do that is with a different document root for each domain name.

The important question is – where is the domain root for my WordPress installation?

It would be great if we could give you a simple path to cut and paste, but it may not be right for your server.

Most web hosts use cPanel – if your host uses it, you’re in luck. cPanel uses a predictable path for “add-on domains” (extra domain names that you add to your account). They follow this pattern:

_public_html/**domain-name**/_

For instance, if your add-on domain is “example.com”, the document root would be:

_public_html/**example.com**/_

Other hosting panels use different conventions. Fortunately, you can usually find the installation path inside your hosting account’s admin panel.

Usually, the information is listed together with the domain name – click on the section that says “manage domains” or something similar.

If you can’t find the document root, check out your hosting company’s knowledge base. And if that doesn’t help, reach out to their support team.

The next hurdle is accessing the directory through FTP. You need to use an FTP account with permission to access the WordPress installation folder. FTP accounts can be set up to only access certain areas of the filesystem (for security).

Usually, your hosting service comes with a pre-built FTP account that can access all your directories and files.

That’s great, but it’s a good idea to use a different FTP account for each site. It prevents accidents – you can’t accidentally edit files from the wrong site. And, if you ever share the FTP account (with a freelancer or employee), they can only access the files they’re supposed to be working with.

In fact, you would ideally create an FTP account for each person, and remove it when they have finished working.

Just make sure you use the right FTP account when you log on!

## 2  Unzipping Rank Math’s Zip File

As we mentioned, you’ll need to unzip the plugin zip before you can start uploading it to your server.

To unzip the plugin file, you can use any utility that supports zipping and unzipping zip files. There are plenty of them out there, but we recommend 7-zip for Windows users as it’s free and open-source. Mac users can use [Keka](https://www.keka.io/en/).

Once you have the appropriate utility installed, select the plugin zip file and open the context menu. Select the “Extract” or “Extract Here” option from the context menu.

![unzip Rank Math's zip folder](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20717%20498'%3E%3C/svg%3E)

You’ll see that a new folder will be created just along the zip file. You’ll need to copy that folder to your server to install Rank Math.

![Extracted Rank Math folder](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20472%20186'%3E%3C/svg%3E)

## 3  Log on to Server

Let’s walk through the process of logging onto a server using FTP. First, you must collect the information we need – the FTP credentials (username and password), the FTP server address, and the document root directory.

And the directory we’re interested in is:
/var/www/public_html/www/

Naturally, you should use more secure usernames and passwords in real life! But these are fine for an example.

Let’s fire up Filezilla and log on!

By the way, if you don’t have Filezilla, you can download it for free from the [project’s site](https://filezilla-project.org/). It’s available on all platforms, and it doesn’t install any malware or ads.

We’re going to use the quick-connect feature. This is a quick and easy way to connect to an FTP server in Filezilla. It’s fast, but the server details and user credentials are deleted when you close Filezilla.

![FileZilla](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202158%201348'%3E%3C/svg%3E)

If you need to use Filezilla often, you can save the log-on details in the application as a remote site. We’ll skip that step in this tutorial.

Here you can see the Quick connect bar at the top of the window. We’ve filled in all the details, and the password is hidden.

Next, we click on the button labeled “**Quickconnect**.” Watch what happens in the log panel just below the Quickconnect bar:

![Quickconnect FTP](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201800%20366'%3E%3C/svg%3E)

FTP is a text-based protocol – Filezilla adds a graphical interface that makes it easier to visualize what’s happening on the server. The log panel contains a complete transcript of the conversation between your PC and the server.

You can see that we connected to the server with our username and password. Next, Filezilla retrieved the directory listing.

![Filezilla connect to server](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201044%20256'%3E%3C/svg%3E)

You can see the listing in the panel below (on the right):

![listing panel](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202242%20782'%3E%3C/svg%3E)

The panel at the top displays the directory tree for our current path (/ – the filesystem root).

You may see a different root depending on how your server is set up. It could be your user account’s home folder or even the web root.

The lower panel shows a detailed listing of the contents of the current path.

## 4 Navigate to the Plugins Folder

We need to navigate to the WordPress installation folder. If you recall, in most cases, it is “/var/www/public_html/.” Again, your server might be set up differently, as ours is. See the path to our public_html directory in the image below.

![public_html directory](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20883%20806'%3E%3C/svg%3E)

We could paste that address directly in the field at the top of the panel or click on the directories to navigate to the directory we want.

![WordPress core files](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20883%20445'%3E%3C/svg%3E)

Here are the WordPress core files that make your WordPress site work. There are several PHP files, other odds and ends, and three important directories.

“wp-admin” is the home of your admin panel – we don’t want to touch anything in here.

“wp-includes” contains files that WordPress uses throughout the site. Again, we shouldn’t tamper with these files.

“**wp-content**” is the directory we need. It’s the place where WordPress stores code from the user – such as themes, plugins, and other code.

The plugins go inside “wp-content/plugins”:

![WordPress plugins folder](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201058%20826'%3E%3C/svg%3E)

As you can see, there are a couple of plugins already installed. That’s normal in a new WordPress installation. Each directory contains a single plugin – we need to upload the unzipped directory for RankMath.

While you could upload the zipped archive, you would need to unzip it on the server side before WordPress could use it. FTP doesn’t have any built-in way to unzip folders, so you’d have to use another application running on the server – like SSH or your hosting admin panel.

**Unzipping the archive on your PC and uploading the folder to the server is a little less efficient than transferring a zip file – but it’s a simpler process and won’t take long.**

## 5  Upload the Rank Math Folder

To upload the plugin, we need to open the containing folder in the file panel on the left. This panel displays files from our PC:

![Upload Rank Math folder](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201106%20682'%3E%3C/svg%3E)

We’ve opened the directory that contains the unzipped RankMath directory – it’s highlighted in the screenshot above.

All we need to do is drag the folder to the right panel (the server files). Filezilla will transfer all the files and directories to the server in the background.

We can watch the progress in the log panel near the screen’s top or the progress bar at the bottom. It only takes a few moments (even on a slow connection, it shouldn’t take more than a minute or two).

![Rank Math folder uploaded to WordPress Plugins directory](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202254%20571'%3E%3C/svg%3E)

Here you can see that the RankMath folder has been transferred. Since the folder is arranged in the standard plugin way, WordPress will recognize it instantly.

The plugin is now installed – but it isn’t active yet. You still need to activate it through the wp-admin panel.

Log into your WordPress dashboard and navigate to**Plugins → Installed Plugins**.

![Installed Plugins in WordPress](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20645%20191'%3E%3C/svg%3E)

You’ll see Rank Math in the plugin list. Click the **Activate** button to activate Rank Math.

![Activate Rank Math SEO plugin](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20313'%3E%3C/svg%3E)

And that’s it! You’ve installed and activated Rank Math on your website. Now you can follow the [Setup Wizard](https://rankmath.com/kb/how-to-setup/) and configure your website’s SEO settings. If you still have any questions about installing and getting Rank Math running on your website, [feel free to reach our support team](https://support.rankmath.com/) — as we’re always here to help.

			

			 

			
	
		
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