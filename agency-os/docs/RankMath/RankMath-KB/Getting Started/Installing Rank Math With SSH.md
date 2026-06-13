# Installing Rank Math With SSH

> **Category:** Getting Started
> **Source:** https://rankmath.com/kb/installing-with-ssh/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Installing Rank Math With SSH

			
			

	

SSH is a pretty big topic, so if you aren’t familiar with it, this isn’t the best place to learn. Basically, you’re running a command panel on the server – it’s just like plugging a keyboard and monitor into your box. In a nutshell, SSH is a secure way to run command line programs on a server over a network.

The command line may look like a relic from the early days of computers, but it’s actually a very efficient way to get work done. Instead of navigating through menus and clicking on dozens of icons, you just type a short command, and the server does what you want.

SSH gives you a lot of power to perform complex tasks or jobs that would otherwise be time-consuming. Of course, installing plugins isn’t a complex or lengthy process.

**WordPress does such a good job of simplifying plugin installation**, so most people will never have to resort to SSH. But it does have its advantages for power users – if you usually manage your server with SSH, it’s a natural workflow.

That’s all fine and well if you’re a command-line expert – if not, it’s a potentially terrifying experience! The command line can delete entire directory trees in the blink of an eye, and there’s no undo command.

## There Are 4 Steps to Installing a Plugin Through SSH:

- [Log in to the server using your SSH client (eg PuTTY on windows)](#login-to-server)

- [Navigate to the plugins folder for your WordPress site](#navigate-to-wordpress-plugin-folder)

- [Download the plugin’s zip file with wget](#download-plugin-file)

- [Unzip the plugin (and remove the original zip file to save disk space)](#unzip-the-plugin)

Alternatively, you can use the [WP-CLI](https://wp-cli.org/) tool to install the plugin from your download URL.

Let us show you the basics of using SSH and installing WordPress plugins. Note that the process is slightly different depending on what operating system you’re using. Windows users will have to download a separate tool (PuTTY) to use SSH, while macOS and Linux can use their command line.

### What You’ll Need

No matter if you’re using Windows or Mac, you’ll need the following things to use SSH.

- Your Server Address

- Username

- Password

- Port

Your server name will be either your domain name or your IP address. If you don’t know the other 3 pieces of information, you’ll need to contact your hosting provider.

## 1  Log in to the Server Using Your SSH Client

Once you have the details, [download PuTTY](https://www.chiark.greenend.org.uk/~sgtatham/putty/latest.html) and install it on your computer. macOS and Linux users can skip this step.

Once PuTTY is installed, open it and use the credentials to log into your server.

![Putty configuration](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20466%20448'%3E%3C/svg%3E)

A terminal like a window will appear on the screen. You can now run commands on your server using SSH just as you can on your computer.

## 2  Navigate to the Plugins Folder for Your WordPress Site

Next, you’ll need to navigate to your WordPress Plugins folder. WordPress saves its plugins in the **plugins** folder under **wp-content** directory on your server. For example, here is what the plugins directory might look like **`/home/username/public_html/wp-content/plugins/`**

Depending on where you logged into your server, you might have to navigate using the **cd** command. Here are some quick tips.

- **cd “directory”** – Go into the directory with the name “directory”

- **cd..** – Go to the parent directory

It might look confusing, but these are really basic commands to navigate.

## 3  Download the Plugin’s Zip File with `wget`

Once you’re in the plugin’s directory, you’ll use the **`wget`** command to download the plugin zip file to your server. The syntax for the `wget` command is simple.

`wget "plugin zip URL"`

As you see, you’ll need the plugin download link to use wget. To find the download link, head over to the [Rank Math SEO plugin page](https://wordpress.org/plugins/seo-by-rank-math/) in the WordPress Plugin Repository. On the plugin page, you’ll see a download button on the right. Right-click on the **Download** button and copy the link address.

![Copy link address to download Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%201425'%3E%3C/svg%3E)

## 4  Unzip the Plugin

Execute the wget command with the URL on your server.

Then you’ll need to use the **gunzip** command to extract the plugin files onto your server. The syntax of the **gunzip** command is simple too.

`gunzip "filename"`

Next, you’ll need to remove the zip file using the **rm** command. The syntax for the rm command is the same as gunzip.

`rm "filename"`

Here is how the whole interaction would appear on the screen.

```
[yourserver@host /home/yourserver/public_html/wp-content/plugins/] : wget http://downloads.wordpress.org/plugin/rank-math.0.9.3.zip

[yourserver@host /home/yourserver/public_html/wp-content/plugins/] : gunzip rank-math.0.9.3.zip

[yourserver@host /home/yourserver/public_html/wp-content/plugins/] : rm rank-math.0.9.3.zip
```

Once this process is complete, all you have to do is activate it. Navigate to your WordPress dashboard and navigate to **Plugins →** **Installed Plugins**.

![Installed plugin in WordPress](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20645%20191'%3E%3C/svg%3E)

You’ll find Rank Math in the list of your installed plugins. Click the **Activate** button to activate Rank Math and finish the installation.

![Activate Rank Math SEO plugin](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20313'%3E%3C/svg%3E)

That’s it! You’ve successfully installed Rank Math using SSH.

Please remember that is always some level of risk when using SSH on your server, but if you follow the process exactly as we mentioned, the risk is eliminated. Also, use this method as a last resort. The [direct file upload method](https://rankmath.com/kb/installing-through-the-admin-panel/) and the [FTP method](https://rankmath.com/kb/manually-install-rank-math-via-ftp/) are much easier to use. If you need assistance, you can always [contact Rank Math support](https://rankmath.com/support/) or your hosting support for help.

			

			 

			
	
		
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