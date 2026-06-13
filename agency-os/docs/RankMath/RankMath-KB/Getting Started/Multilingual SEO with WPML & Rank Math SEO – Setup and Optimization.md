# Multilingual SEO with WPML & Rank Math SEO – Setup and Optimization

> **Category:** Getting Started
> **Source:** https://rankmath.com/kb/multilingual-seo-wpml/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Multilingual SEO with WPML & Rank Math SEO – Setup and Optimization

			
			

	

There are almost 7,000 languages in the world, and English is just one of them. So, depending on the purpose of your site and your target audience, only considering audiences that speak English could be an oversight.

The potential target market is huge, and with a multilingual website, you can make your website more accessible to other markets.

Fortunately, [Rank Math SEO](https://rankmath.com/wordpress/plugin/seo-suite/) makes it very easy for you to optimize your content for your multilingual website. It does this by working in conjunction with [WPML](https://rankmath.com/compatibility/wpml/) – a popular WordPress Multilingual Plugin.

Rank Math SEO and WPML work hand-in-hand to offer you customization, optimization, and translation of your content. With these two plugins, you will have fully translated and fully optimized content that will please your non-English and English speakers alike (or any language speaker, for that matter).

Let’s see how you can use Rank Math SEO and WPML to translate and optimize your content.

## Table Of Contents

- [What is WPML? An Introduction & Overview](#introduction)

- [Getting Started](#getting-started)

- [Translating the General SEO](#translating-general-seo)

- [Translating Titles & Meta Texts](#translating-meta)
- [Translating On-Page Text](#translating-content)

- [Creating Sitemaps for Other Languages](#sitemaps)

- [Localizing the Plugin Text](#plugin-text)

- [Multilingual Websites and Duplicate Text](#duplicate-content)

- [Solutions to the Most Common Problems](#common-problems)

- [Conclusion](#conclusion)

## 1  What is WPML? An Introduction & Overview

By default, WordPress supports only one language at a time. But if you want to use multiple languages on a site to attract a different demographic, then [WPML](https://wpml.org) is the right choice for you.

WPML(WordPress Multilingual Plugin) helps to make your website multilingual, and you can create content in many different languages. The interface is extremely easy to use for managing the translations. Not only this, but it also adds language switching options for your visitors. With WPML, search engines easily understand your site’s structure and drive the right traffic to the right languages.

Let us now look how you can create a multilingual WordPress website without any hassle.

## 2  Getting Started

First things first, make sure you have the latest version of Rank Math SEO and WPML installed on your WordPress Website. And the good news is that Rank Math is now integrated with the WPML SEO glue plugin. This “glue” plugin allows for easier translation of your SEO content using WPML. You can download it from your WPML account’s [Downloads page](https://wpml.org/account/downloads/) or by visiting the Plugins section of your site’s admin to have a seamless multilingual workflow.

You can install Rank Math and WPML both from__**WordPress Dashboard → Plugins → Add New**.

First, search for the **Rank Math** plugin and install it:

![Install Rank Math](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201400%20692'%3E%3C/svg%3E)

Then, activate it from the same page.

After that, install the WPML plugin by going to **WordPress Dashboard → Plugins →** **Add New**_._ Point it to where you have downloaded your WMPL files and activate the plugin after it is done uploading.

![Install WPML](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%20984'%3E%3C/svg%3E)

Once you are done installing both plugins, it is time to do some translations.

## 3  Translating the General SEO

Certain strings are added to your images and breadcrumbs automatically by Rank Math SEO. These strings are added in English by default, but you can change them to any language easily.

Head over to **WordPress Dashboard → WPML → String Translation**.

Choose `admin_texts_rank-math-options-general` from the dropdown.

![string translation](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%201006'%3E%3C/svg%3E)

Then, proceed to change the strings to any number of languages you like.

Take a note of the “Name” column. It gives you an idea of where the String is coming from.

For example, `[rank-math-options-general]breadcrumbs_home_label` the string is the text for the “Home” string in Breadcrumbs.

![Breadcrumbs Translation](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202182%20960'%3E%3C/svg%3E)

Likewise, all other strings adjacent to `breadcrumbs` the column belong to the Breadcrumbs, and you can change those as required.

## 4  Translating Titles & Meta Texts

Rank Math SEO offers you plenty of options to customize your title and descriptions. You can automate the title and meta description process with various variables we offer. You can use a combination of hard-coded texts along with variables to generate a unique meta title or description automatically for your posts, pages, products, or CPTs.

For such hard-coded texts, you can translate them into other languages using WPML, and the process is very easy to follow.

Head over to **WordPress Dashboard → WPML → String Translation**

Then, choose `admin_texts_rank-math-options-titles` from the `Search` field option.

![Translate Title Strings](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202560%201453'%3E%3C/svg%3E)

Once you identify the string you want to translate, click the “+” sign next to it. A new dialog box pops up, and you can add your translation here.

![Strings into another language](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202082%20640'%3E%3C/svg%3E)

**Note:** Translate the static text only as translating the variable text will break the secondary language pages. For example, the Spanish translation for “Static Text %title% %sep% %sitename%” will be “Texto estático %title% %sep% %sitename%”

## 5  Translating On-Page Text

Let’s talk about translating the nitty-gritty of your website – that is, the post or page content itself.

It is extremely easy with Rank Math SEO + WPML. Simply go to **WPML**→ **Translation Dashboard** and select the content you want to translate.

![Translation dashbaord](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201164%20714'%3E%3C/svg%3E)

Next, scroll down to Step 2 to choose your translation method: translate manually, automatically using AI, or with translation services.

For new sites, Private Translation Cloud (PTC) is the default engine. If you’re currently using a different engine and want better translations, go to **WPML → Settings** and select **PTC** under the AI translation section.

Before you send the content for automatic translation, WPML shows you how many credits you’ll spend and their cost in euros.

![Select Translate automatically option](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201168%20594'%3E%3C/svg%3E)

Finally, click the **Translate** button to begin translating. If you’re using PTC, that’s it — you don’t need to do anything else. With other engines or human translators, it’s best to review translations before publishing.

To do this, go to **WPML**→ **Translations** and click your recent translation job. Review your translations, and when ready, click **Complete Translation**.

![Review translations](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%200%200'%3E%3C/svg%3E)

## 6  Creating Sitemaps for Other Languages

Rank Math automatically creates a sitemap of all your posts. And, your translated posts/pages are no different.

A link to each translated post/page is automatically added to your sitemap index available at `domain.com/sitemap_index.xml`

WPML adds `hreflang` to the translated pages so Google can figure out that a particular page is a translated version of another page on your website.

If you submitted the main sitemap index to Google or other search engines, you do not need to make any changes, and the translated pages will be automatically picked by the search engines from your sitemap.

## 7  Localizing the Plugin Text

If you want to use the plugin in your local language, you only need to download the language from **WordPress Dashboard → Updates.**

Rank Math displays the translated version of posts and categories in the Sitemap. If you choose other language URL formats, WPML will take care of it by [creating **hreflang** tags](https://wpml.org/documentation/support/adding-hreflang-wordpress/) and the search engines know the default language of the page’s content and also the translation which is available in different languages.

## 8  Multilingual Websites and Duplicate Text

A translated piece of your original content is considered to be a unique piece of content by Google and other search engines. So, you do not need to worry about causing duplicate content issues when translating your website into multiple languages.

WPML adds a `hreflang` tag to your translated pages which makes it easier for Google to understand and classify your translated content.

Rank Math SEO adds a proper canonical tag to each translated post/page to ensure Google and other search engines know where the original piece of content is located.

## 9  Solutions to the Most Common Problems

Let us now look at some of the solutions to the problems that are faced by our users while using WPML.

### 9.1  Rank Math SEO Adds Incorrect Entries for Translated Homepages in the Sitemap

This is one of the common issues faced by the users where incorrect entries are added for the secondary homepage in the sitemap ‘/page_sitemap.xml’

For example, if your default homepage has the slug’ homepage’ and the translations are ‘homepage-fr’, ‘homepage-it’, then the sitemap shows:
https://www.yourwebsite.com/ (which is correct)
https://www.yourwebsite.com/fr/homepage-fr (incorrect as it should be https://www.yourwebsite.com/fr/)
https://www.yourwebsite.com/it/homepage-it (incorrect as it should be https://www.yourwebsite.com/it/)

If you’re facing this issue, then please add the following piece of code anywhere in your theme’s [rank-math.php](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file) file:

```
if ( 'page' === get_option( 'show_on_front' ) ) {
    add_filter( 'rank_math/sitemap/entry', 'compsupp_5514_filter_sitemap_home_page_entry', 10, 3 );
}
function compsupp_5514_filter_sitemap_home_page_entry( $url, $type, $post ) {
    global $sitepress;
    static $wpml_home_urls = null;
    static $frontpage_translations = null;
    static $default_frontpage_id = null;
    if ( ! $wpml_home_urls ) {
        $active_languages = $sitepress->get_active_languages();
        $wpml_home_urls   = [];
        foreach ( $active_languages as $code => $language ) {
            $wpml_home_urls[ $code ] = $sitepress->language_url( $code );
        }
        $default_frontpage_id   = get_option( 'page_on_front' );
        $frontpage_trid         = $sitepress->get_element_trid( $default_frontpage_id, 'post_page' );
        $frontpage_translations = array_map( \WPML\FP\Obj::prop( 'element_id' ), $sitepress->get_element_translations( $frontpage_trid, 'post_page' ) );
    }
    if ( in_array( $post->ID, $frontpage_translations ) && $post->ID !== $default_frontpage_id  ) {
        $language_code = array_search( $post->ID, $frontpage_translations );
        $url['loc']    = $wpml_home_urls[ $language_code ];
    }
    return $url;
}
```

**Note: We recommend that please take a [backup](https://rankmath.com/blog/backup-wordpress-site/) of your website’s file and database before making any changes to the code.**

### 9.2  Rank Math SEO + WooCommerce Missing “Shop” Breadcrumbs

The **Shop** breadcrumb is missing on the users WooCommerce pages with WPML enabled. This occurs only in secondary languages where the slug for **Shop** has been translated.

If you’re facing this issue, please add the following piece of code anywhere in the rank-math.php file:

```
// Fixes missing "Shop" breadcrumb in WPML translated store pages.
if( function_exists( 'icl_object_id' ) ) {
    add_filter( 'rank_math/frontend/breadcrumb/items', 'wpmlsupp_8672_fix_wc_store_breadcrumbs', 10, 2 );
}
function wpmlsupp_8672_fix_wc_store_breadcrumbs( $crumbs, $class ) {
    if ( is_product() || is_product_category() || is_product_tag() ){
        $current_language = apply_filters( 'wpml_current_language', NULL );
        $default_language = apply_filters( 'wpml_default_language', NULL );
        if ($current_language !== $default_language) {
            $shop_page_id = wc_get_page_id( 'shop' );
            $shop_page    = get_post( $shop_page_id );
             
            $store_crumb = array (
                '0' => get_the_title( $shop_page ),
                '1' => get_permalink( $shop_page ),
                'hide_in_schema' => ""
            );
            array_splice( $crumbs, 1, 0, array( $store_crumb ) );
        }
    }
    return $crumbs;
}
```

### 9.3  How to Translate the Meta Description or Titles of Rank Math Plugin

WPML creates a new post for each language, and WPML handles the translation of all the custom fields. You can manage which fields to translate from the WPML Settings.

The WPML prevents updating the post-meta fields when set to Translate instead of Copy once, i.e., copying the field value from the original post only once. In addition, when it is set to Translate, the WPML plugin doesn’t allow changing the post meta value from the translated posts.

In this case, you can head over to WPML Settings and change the Custom fields translation to Copy once from the Settings as shown below:

![Custom Fields Translation](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202358%202126'%3E%3C/svg%3E)

Click **Save** to save the changes.

## 10  Conclusion

Rank Math and WPML make it extremely easy to create multi-language websites with ease. They do so without the hassle of manually dealing with various issues that are usually a part of creating multilingual websites.

This is yet another reason WordPress is the best content management system – it truly takes the hassle out of creating multilingual websites with the help of WPML to handle the translations and Rank Math SEO to handle the optimization/proper technical SEO for international websites so you can focus your business. If you’ve absolutely any questions, please feel to get in touch with our support team [directly from here](https://rankmath.com/support/), and we’re always here to help you.

			

			 

			
	
		
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