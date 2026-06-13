# Migrating from Yoast SEO to Rank Math SEO

> **Category:** Getting Started
> **Source:** https://rankmath.com/kb/yoast-seo-migration/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Migrating from Yoast SEO to Rank Math SEO

			
			

	

Migrating from other SEO plugins is easier with Rank Math, and we ensure that your data gets migrated carefully so that you don’t lose anything in this process and don’t have to set up all meta tags for your posts once again from scratch.

![Migrating from Yoast SEO to Rank Math SEO](https://img.youtube.com/vi/brSZTiDItuM/maxresdefault.jpg)
__

In this knowledgebase article, we’ll discuss how you can import the data from Yoast SEO into Rank Math SEO.

## Table of Contents

- [Using Rank Math Setup Wizard](#setup-wizard)

- [Using Rank Math Import & Export](#import-and-export)

- [Import FAQ & HowTo Schema Blocks with Yoast Block Converter](#yoast-block-converter)

- [Importing FAQ & HowTo Schema Blocks Manually](#import-yoast-blocks-manually)

**Note**: We recommend [backing up your site](https://rankmath.com/blog/backup-wordpress-site/) before you begin the migration process.

## 1  Using Rank Math Setup Wizard

You can import data from the Yoast SEO plugin to the Rank Math SEO plugin right away with our Setup Wizard by following the exact steps shown below.

### 1.1  Open Rank Math Setup Wizard

Rank Math Setup Wizard gets initiated automatically when you install Rank Math for the first time. If it doesn’t start on its own, you can always start it from **WordPress Dashboard → Rank Math SEO → Dashboard → Setup Wizard**.

![setup wizard](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201568%20926'%3E%3C/svg%3E)

The Rank Math Setup Wizard will look like this:

![Rank Math Setup Wizard](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201280%201111'%3E%3C/svg%3E)

### 1.2  Deactivate Yoast SEO Plugin

As you scroll down, you can find Rank Math checking for any compatibility issues on your website. When you click **More**, you can find any conflicting SEO plugins installed on your website.

![Deactivate Yoast SEO Plugin in Rank Math Setup Wizard](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201738%20273'%3E%3C/svg%3E)

If the Yoast SEO plugin is installed on your website, you can safely deactivate it here, and we would import the data from the Yoast SEO to Rank Math SEO plugin in the next step of the Setup Wizard. If you’ve deactivated the plugin, you can click **Start Wizard** to proceed to the next step.

### 1.3  Import Data from Yoast SEO

In the next step, you can find the input data available from the Yoast plugin to be imported to Rank Math.

![Input data available from Yoast ](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201920%201366'%3E%3C/svg%3E)

Click the **Start Import** button and wait until the process gets completed. You can also choose to recalculate SEO scores along with. However, please note, **this method will only update the SEO score of posts set as N/A**.

![Importing data from Yoast SEO to Rank Math completed](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201498%20706'%3E%3C/svg%3E)

When the import is complete, you can see the status **100% completed** in the progress bar. For further steps to configure all SEO settings available in the Rank Math Setup Wizard, [you can refer to our detailed tutorial](https://rankmath.com/kb/how-to-setup/).

**Note:**If the Setup Wizard returns an error, you should import your Yoast settings using the **Import & Export**feature****mentioned below in Section 2. However, uncheck the **Calculate SEO Scores** option. After importing your settings, refer to this [knowledgebase article](https://rankmath.com/kb/rank-math-status-and-tools/#recalculate-seo-score-for-posts) to recalculate your SEO scores.

## 2  Using Rank Math Import & Export

If you’ve skipped or missed out importing data from the Yoast SEO plugin during the Setup Wizard, no issues — you can always import them with the Rank Math Import & Export feature.

### 2.1  Open Import & Export

To access the Import & Export feature of Rank Math, navigate to **Rank Math SEO → Status & Tools** as shown below:

![Rank Math Status and Tools](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20618%20740'%3E%3C/svg%3E)

From the Status & Tools page, click on **Import & Export** tab.

![Click on Import & Export tab](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202124%20552'%3E%3C/svg%3E)

### 2.2  Choose Data to Import

Scroll down a bit, and you’ll find the **Other Plugins** section, which is designed for importing your SEO settings & data from other plugins before switching to Rank Math SEO. Under the Yoast SEO tab here, choose all the data that you want to import to Rank Math.

![Other Plugins](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202154%201120'%3E%3C/svg%3E)

### 2.3  Import Data

Click the **Import** button. Once you click on Import, a small message will be displayed on the screen that asks for your confirmation to import the settings. Click on **OK**.

![Confirmation to import data from Yoast SEO plguin](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20872%20191'%3E%3C/svg%3E)

Rank Math will then start to import within seconds, and all your data will be successfully imported to Rank Math SEO.

## 3  Importing FAQ and HowTo Schema Blocks with Yoast Block Converter

If you’ve used Yoast Blocks inside your content, then you can make use of the Yoast Block Converter option with Rank Math to convert the Yoast FAQ and HowTo Blocks to Rank Math’s Blocks for further use.

### 3.1  Open Database Tools

In order to do so, head over to **WordPress Dashboard →** **Rank Math SEO → Status & Tools → Database Tools**. If the Database Tools tab is unavailable on your website, then ensure that you’ve [switched to the Advanced Mode](https://rankmath.com/kb/switch-from-easy-to-advanced-mode/) in Rank Math.

![Access Rank Math Database Tools](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202046%201270'%3E%3C/svg%3E)

### 3.2  Use Yoast Block Converter

From the list of tools available here, look for Yoast Block Converter. Click on the **Convert Blocks** button.

![Yoast Block Converter](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202048%20910'%3E%3C/svg%3E)

You’ll see a confirmation prompt with a warning that the action is irreversible. Click **OK,** and when Rank Math converts all the Yoast Blocks to Rank Math Blocks, you’ll see a success notice. You can read through our detailed guides on how to use the [FAQ](https://rankmath.com/kb/faq-schema-block/) and [HowTo Blocks](https://rankmath.com/blog/howto-schema/) with Rank Math.

## 4  Importing FAQ and HowTo Schema Blocks from Yoast Manually

The Yoast Block Converter option we discussed earlier lets you import all the FAQ and HowTo Schema Blocks from Yoast in one go, and we **recommend you to use the same**. But, in special cases where you want to review each Yoast Block and change them manually to Rank Math Blocks, you can follow this method.

However, this method requires both Yoast SEO and Rank Math to be installed and activated on your website. To convert the individual FAQ Block/HowTo Block, head over to the post or page with the Block and highlight the Block. You should see some buttons appear on top of the Block, which is a sign that the Block is highlighted.

Hover over the first button from the list that lets you transform the existing block. Click the button, and you should see options to change the Yoast Block to Rank Math Block.

Click the **FAQ By Rank Math** Block (or **HowTo By Rank Math** if it is a HowTo Block), and instantly, the Block will be converted to Rank Math’s Block, as shown below.

![Transform Yoast FAQ Block to Rank Math FAQ Block](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20942%20673'%3E%3C/svg%3E)

Please remember that this option is included for special cases only, and we highly [discourage you from using two SEO plugins simultaneously](https://rankmath.com/kb/keep-only-one-seo-plugin-active/). We recommend using the other methods that we’ve discussed to convert your Yoast blocks to Rank Math blocks.

And, that’s it! We believe that the process of importing blocks and settings from the Yoast SEO plugin to [Rank Math](https://rankmath.com/kb/how-to-setup/) is much simpler than what any other plugin offers today. And if you still have any questions on importing data from other SEO plugins, feel free to reach our [support team directly from here](https://rankmath.com/support/), and we’re always here to help.

			

			 

			
	
		
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