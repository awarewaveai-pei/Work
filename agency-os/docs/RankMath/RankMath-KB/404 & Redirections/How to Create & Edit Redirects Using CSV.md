# How to Create & Edit Redirects Using CSV

> **Category:** 404 & Redirections
> **Source:** https://rankmath.com/kb/how-to-manage-redirects-via-csv/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Create & Edit Redirects Using CSV

			
			

	

Rank Math allows you to [import redirections](https://rankmath.com/kb/import-redirects/) in multiple ways, but using CSV files for importing redirections can be helpful when you need to create/edit/delete redirections at a scale or if you’d like to collaborate with a team in managing the redirections of your website.

**Note:** This feature is available only in the PRO version of Rank Math. If you haven’t already subscribed, you can choose a [plan of your choice from here](https://rankmath.com/pricing/).

In this knowledgebase article, we will show how Rank Math PRO users can make use of the CSV Import & Export feature to create or edit redirects at scale. If you haven’t installed Rank Math PRO yet, you can [get started from here](https://rankmath.com/pricing/).

## Table of Contents

- [Creating CSV with Redirection Rules](#creating-csv)

- [Importing CSV](#importing-csv)

- [Multiple Source URLs](#multiple-source-urls)

- [Editing Existing Redirects](#editing-existing-redirects)

- [Editing Redirects at Scale](#editing-redirects-at-scale)

- [Deleting Existing Redirects](#deleting-existing-redirects)

## 1  Creating CSV With Redirection Rules

To use this Import & Export CSV feature of Rank Math for creating redirections, we’ll need to first get started with creating the CSV. You can create a CSV by following the exact steps given below.

### 1.1  Open Spreadsheet

To create a CSV file, you can open a Spreadsheet editor of your choice. We recommend using [Google Sheets](https://rankmath.com/wp-content/uploads/sample-redirections.csv) if you wish to collaborate with your team.

### 1.2  Adding Columns

To help Rank Math understand the data you’re referring to with CSV, you’ll need to create a header row (which is the first row) with the following column names: `id`, `source`, `matching`, `destination`, `type`, `category`, `status` and `ignore`.

![Create CSV for importing redirects](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201826%20544'%3E%3C/svg%3E)

The order of the columns does not matter, but for Rank Math to create a new redirection from CSV, it should have at least the `source` and `destination` column.

### 1.3  Adding Values for Columns

Under each designated column you can add only a specific set of values such as:

- **id** – You can add the ID of the redirection under this column to edit an existing redirection. If no ID is used, Rank Math will create a new redirection.

- **source** – Enter the URL or URL(s) from where you want your visitors to be redirected from.

- **matching** – Add the matching type here to let Rank Math know how the pattern in the source column should be matched with. The accepted values are `exact`, `contains`, `start`, `end` and `regex`.

- **destination** – Enter the URL where you want your visitors to be taken to after the redirection

- **type** – Enter the redirection type under this column. The accepted values are `301`, `302`, `307,` `410` and `451`. Rank Math, by default, considers the status to be `301`.

- **category** – You can enter a category for your redirection under this column. Adding a value to this column is optional. If you add a Redirection category under this column that you haven’t already created on your website, then a new Redirection category will be created.

- **status** – The accepted values are `active` and `inactive`. If you don’t include the status column, Rank Math, by default, considers the status as active.

- **ignore** – The accepted value must either be empty, or it should be `case`.

Please note that the column headers are case-sensitive, so ensure they are lowercase. Here is an example of a filled spreadsheet.

![csv example](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201255%20183'%3E%3C/svg%3E)

### 1.4  Saving Spreadsheet as CSV

Once you’ve added the redirection rules, save the spreadsheet as a CSV file to your computer.

## 2  Importing CSV

After creating the CSV file, you can follow the below steps to upload the CSV file back to Rank Math for creating new redirects on your website.

### 2.1  Navigate to Redirections

Head over to **Rank Math SEO →** **Redirections** inside your WordPress admin area. If you’re unable to find Redirections under the Rank Math menu, then you’ll need to enable the **Redirections** module under **Rank Math SEO → Dashboard**.

![Navigate to Redirections Manager in Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20644%20744'%3E%3C/svg%3E)

### 2.2  Choose Import & Export

In the Redirections page, click the **Import & Export** option available at the top of the screen.

![Choose Import & Export in Redirections](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201946%20468'%3E%3C/svg%3E)

### 2.3  Upload Your CSV File

Under the **Import** tab, click the **Choose File** button to upload the CSV file you’ve created.

![Choose CSV file to upload](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201708%20654'%3E%3C/svg%3E)

### 2.4  Import Redirects from CSV

Now click the **Import CSV** button, and in the confirmation prompt, click **OK**. Rank Math will now start to create redirections from the imported CSV file, and it takes a few minutes to complete depending upon the size of the file.

![Importing CSV to create Redirections](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201708%20644'%3E%3C/svg%3E)

Once the CSV import is complete, you’ll see a success message with the number of new redirections created from the imported CSV file.

![CSV import success message](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201702%20534'%3E%3C/svg%3E)

In case, if you miss adding or updating the source or destination in the `.csv` file, you will get an error message to add the **missing one or more required columns**.

![Missing one or more required columns](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20851%20155'%3E%3C/svg%3E)

## 3  Multiple Source URLs

Rank Math supports adding multiple URLs in the **Source** field. You can add multiple sources as separate rows in the database, and when importing, they will be automatically grouped in a single redirection with multiple sources.

For instance, here is an example of a filled spreadsheet.

![csv sample](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201296%20371'%3E%3C/svg%3E)

You can import the CSV in the Import tab of Rank Math’s Redirection Manager, and your redirections will be imported.

![redirection manager](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202554%201282'%3E%3C/svg%3E)

You can download the sample CSV file from below:

[Download CSV File](https://rankmath.com/wp-content/uploads/sample-redirections.csv)

## 4  Editing Existing Redirects

Apart from creating new redirects using CSV, you can also use this feature to edit the existing redirects. In your CSV file, enter the ID of your existing redirection under the `id` column and enter the redirection rule you want to update with. To find the ID of your redirection, click the **Edit** option available under your redirection.

![Edit a redirection](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201403%20358'%3E%3C/svg%3E)

Now while you’re on the Edit screen, you can find the URL of the page on the address bar and it would look something like this.

`https://rankmath.local/wp-admin/admin.php?page=rank-math-redirections&redirection=43&...`

From the URL, you can notice a number available after the query parameter `redirection`, and it is the ID of the redirection. So in this example, 43 is the redirection ID, and it would be different for each redirection. You should use this redirection ID in the CSV to edit the existing redirection.

## 5  Editing Redirects at Scale

The previous method of editing existing redirection could be useful only in limited cases, as it becomes tedious to find the redirection ID if you’ve too many existing redirects to edit.

The easiest way to edit existing redirects at scale is by exporting them in the CSV format, making the changes, and importing them back to Rank Math. This can be done exactly as shown below.

### 5.1  Navigate to Redirections Import & Export

At first, head over to **WordPress Dashboard → Rank Math SEO → Redirections → Import & Export**.

![Navigate to Redirections Import & Export](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201997%201164'%3E%3C/svg%3E)

### 5.2  Export CSV

Now click the **Export** tab, and you’ll find different ways to export your redirections. It also includes an option to export redirections as CSV. Click the **Export CSV** button. Now all your redirections will be exported to your computer.

![Export redirections as CSV](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201665%20920'%3E%3C/svg%3E)

### 5.3  Edit CSV

Now open the CSV file in your spreadsheet editor. From the list of redirections, you can make the changes you need. Once you’ve made the changes, save the CSV file.

![Modified Redirection data in CSV](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201492%20260'%3E%3C/svg%3E)

### 5.4  Import CSV

Now click the **Import** tab and upload the CSV file you’ve edited. Next, click the **Import CSV** button and choose **OK** in the confirmation prompt.

![Import edited CSV](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201694%20622'%3E%3C/svg%3E)

Now you can check the redirection you’ve modified with CSV in the edit screen to confirm if the changes have been reflected.

![Redirection data updated](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201676%20944'%3E%3C/svg%3E)

## 6  Deleting Existing Redirects

Similar to creating new redirections and editing existing redirections, you can also delete existing redirections using CSV. To do so,

### 6.1  Export Existing Redirects

Export your redirections by navigating to **Rank Math SEO → Redirections → Import & Export** and choosing the **Export CSV** option under the **Export** tab.

![Export existing redirections at CSV](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201665%20920'%3E%3C/svg%3E)

### 6.2  Adding DELETE

To delete an existing redirect, add the `DELETE` value under the `destination` column against the redirection you wanted to delete, as shown below.

![Deleting redirections using CSV](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201512%20208'%3E%3C/svg%3E)

**Note:** The value `DELETE` is case sensitive and hence should be used in the same way.

### 6.3  Importing CSV

Now, save the edited CSV file to your computer and upload it in the **Import** tab. Next, click the **Import CSV** button and choose Ok in the confirmation prompt to allow Rank Math to delete the redirections marked with the `DELETE` value in the CSV file.

Once the redirections are deleted, a success message is shown with the number of redirections deleted. You can also check your **Redirections Manager** to see if Rank Math has deleted the redirection rules.

![Redirections deleted using CSV in Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201694%20594'%3E%3C/svg%3E)

And, that’s it! We hope the article was helpful in using the Import & Export CSV feature of Rank Math to manage your redirections. If you’ve absolutely any questions on using CSV for creating/editing/deleting redirects with Rank Math, please free to [reach our support team directly from here](https://rankmath.com/support/) — we’re always here to help.

			

			 

			
	
		
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