# Rank Math SEO Filters and Hooks for Developers

> **Category:** Developers
> **Source:** https://rankmath.com/kb/filters-hooks-api-developer/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# Rank Math SEO Filters and Hooks for Developers

			
			

	

We have incorporated various hooks and filters in the Rank Math SEO plugin that developers can use to interact with data output by Rank Math. You can control Rank Math data from within your themes/plugins. Before going through the different filters and hooks that Rank Math offers, we’d discuss how to add them to your website.

## Adding Filters and Hooks in rank-math.php

We recommend adding these filters to `wp-content/themes/theme-name/rank-math.php` as it involves benefits like:

### 1  Flexibility in Switching Themes

When you add code snippets to your theme’s functions.php, you run the risk of losing all your customizations added while switching themes, and it would be really tedious to identify all Rank Math code snippets used and add the same to your new theme.

By adding all Rank Math SEO code snippets in a separate file, you’ll have the flexibility to switch themes. All you’ve to do is download a copy of your rank-math.php file from your old theme and upload it to your new theme folder. Then, all your Rank Math customizations will work the same way as before.

### 2  Code Runs Only with the Plugin

When you add a filter to your theme’s functions.php, the code runs on your website even when the Rank Math plugin is not active. But when added to the rank-math.php file, the code runs only when the Rank Math plugin is active, as the plugin includes the file. This practice will help you ensure that your site runs as fast as possible.

### 3  Ensures All Rank Math Functions Work

Some filters like the one involving customizing OpenGraph need to be wrapped in the `wp_head` hook. There are many reasons why they may not perform as intended when added to functions.php, and to work as expected, they need to be added to rank-math.php.

To keep things less complicated, we recommend adding all the Rank Math functions to rank-math.php instead of adding them to your theme’s functions.php.

## How to Add Code Snippets to rank-math.php?

To start adding code snippets to rank-math.php, you’ll need to create the file first. You can easily do this with an FTP or cPanel File Manager.

### 1  Create rank-math.php File

If you’re using FTP, navigate to your theme’s folder (/wp-content/themes/theme-name/) and then create a new file named rank-math.php as shown below:

![Creating rank-math.php file with FTP](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201280%20800'%3E%3C/svg%3E)

If you’re using cPanel, then you can use their File Manager to create your new file named rank-math.php inside your theme folder (/wp-content/themes/theme-name/) as shown below.

![Create rank-math.php file with cPanel Manager](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201280%20712'%3E%3C/svg%3E)

### 2  Navigate to Theme File Editor

Once you’ve created the Rank Math file in your theme folder, you can edit the file by navigating to **Appearance → Theme File Editor** (for Classic Theme) or **Tools → Theme File Editor** (for Block Theme) in your WordPress admin area.

![Navigate to Theme File Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20900%20359'%3E%3C/svg%3E)

The right side of your screen lists all the theme files and templates. The files being shown here would vary depending upon the theme you’re using on your website. You can access the rank-math.php file you had created in the previous step from the list of files.

![Open rank-math.php in from Theme file Editor](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20992%20655'%3E%3C/svg%3E)

### 3  Adding your Code

You’d be able to see the code editor available in the middle of your screen, and here is where you can add the code snippets (which we would discuss in this article shortly).

![Use Rank Math filters and hooks](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201105%20625'%3E%3C/svg%3E)

### 4  Saving Changes

Once you’ve added the code snippet, click the **Update File** button at the bottom of the screen to save your changes.

![rank-math.php update file](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20887%20429'%3E%3C/svg%3E)

While adding your code snippet, if you’ve accidentally made any mistake that would crash your site, then the theme file editor will throw an error without saving the file so that you can fix them immediately. Once you’ve successfully updated the file, you can check your site for changes/configurations intended with the filter/hook.

Now that we’ve understood how to use the rank-math.php file, we’ll look at the different filters and hooks available for you to use.

## Table Of Contents

- [Admin](#settings)

- [Settings](#settings)

- [Sitemap](#sitemap)

- [Podcast](#podcast)

- [Frontend](#breadcrumbs)

- [Breadcrumbs](#breadcrumbs)

- [Meta Data](#metadata)

- [OpenGraph](#opengraph)

- [Rich Snippets](#richsnippets)

- [SEO Score](#seo-score)

- [Redirections](#redirections)

- [AI Link Genius](#ai-link-genius)

- [Gutenberg](#gutenberg)

- [Elementor](#elementor)

- [Divi](#divi)

- [Misc](#misc)

## Settings

### 1. Filter to change the Rank Math Metabox priority.

Use this filter to change the Rank Math metabox priority to low, so it appears after other metaboxes like ACF fields.

```
/**
 * Change the Rank Math Metabox Priority
 *
 * @param array $priority Metabox Priority.
 */
add_filter( 'rank_math/metabox/priority', function( $priority ) {
 return 'low';
});
```

### 2. Filter to change the Focus Keyword Limit

Use this filter to increase or decrease the number of maximum focus keywords that can be added to the single post or page editor.

```
/**
 * Change the Focus Keyword Limit
 */
add_filter( 'rank_math/focus_keyword/maxtags', function() {
    return 10; // Number of Focus Keywords. 
});
```

### 3. Filter to add/remove section into the General Settings option panel.

This filter allows you to add or remove a section from the general settings options panel of the Rank Math plugin.

```
/**
 * Allow developers to add new section into general setting option panel.
 *
 * @param array $tabs
 */
add_filter( 'rank_math/settings/general', function( $tabs) {
	unset( $tabs['htaccess'] ); // Unsets Edit .htaccess tab.
	return $tabs;
});
```

### 4. Filter to add/remove section into the Title Settings option panel.

You can add or remove a custom section to or from the Title Settings option panel with this setting.

```
/**
 * Allow developers to add new section into general setting option panel.
 *
 * @param array $tabs
 */
add_filter( 'rank_math/settings/title', function( $tabs) {
 return $tabs;
});
```

### 5. Filter to allow developers to add option fields to check against update. And if updated, flush the rewrite rules

```
/**
 * Allow developers to add option fields to check against updatation.
 * And if updated flush the rewrite rules.
 *
 * @param array $flush_fields Array of fields id for which we need to flush.
 */
add_filter( 'rank_math/flush_fields', function( $fields) {
 return $fields;
});
```

### 6. Filter to allow developers to add new tabs into the options panel.

```
/**
 * Allow developers to add new tabs into option panel.
 *
 * The dynamic part of hook is, page name without 'rank-math-' prefix.
 *
 * @param array $tabs
 */
add_filter( "rank_math/admin/options/{$filter}_tabs", function( $tabs ) {
 return $tabs;
});
```

### 7. Filter to add/update/remove Content Analysis test.

This filter allows you to add/update/remove content analysis tests. For removing any test, you can simply unset the test [as shown in this tutorial](https://rankmath.com/kb/disable-seo-content-tests/).

```
/**
 * Allow developers to modify the test.
 *
 * @param array  $tests Array of tests
 * @param string $type  Object type. Can be post, user or term.
 */
add_filter( 'rank_math/researches/tests', function( $tests, $type ) {
 return $tests;
}, 10, 2 );
```

Similarly, if you want to disable any of the Content AI Research tests, then use the filter below.

```
/**
 * Allow developers to modify the Content AI tests.
 *
 * @param array  $tests Array of tests
 */
add_filter( 'rank_math/content_ai/research_tests', function( $tests) {
 return $tests;
});
```

### 8. Filter to change a number of items to import per run. Used when importing data from other plugins

```
/**
 * Number of items to import per run.
 *
 * @param int $items_per_page Default 100.
 */
add_filter( 'rank_math/importers/items_per_page', function( $items_per_page ) {
 return $items_per_page;
});
```

### 9. Filter to add/remove the item from the Admin Bar node.

Add or remove an item from the WordPress admin-bar menu that Rank Math adds to the front-end of your WordPress website.

```
/**
 * Add item to Rank Math admin bar node.
 *
 * @param array $items Array of nodes for Rank Math menu.
 */
add_filter( 'rank_math/admin_bar/items', function( $items ) {
 return $items;
});
```

### 10. Add Default value for General Settings during plugin installation.

Set a default value for general settings when Rank Math is installed on a WP website. Refer to the options and [default values here](https://github.com/rankmath/seo-by-rank-math/blob/eea089f0afe7f476d1f9dadc1a9f75377373d282/includes/class-installer.php#L319).

```
/**
 * Add defaults for general options.
 *
 * @param array $settings Array of settings and its values.
 */
add_filter( 'rank_math/settings/defaults/general', function( $settings ) {
 return $settings;
});
```

### 11. Add Default value for Title Settings during plugin installation.

Use this filter to set default values for SEO Title and Meta settings when Rank Math is installed on a website. Refer to the [options and default values here](https://github.com/rankmath/seo-by-rank-math/blob/eea089f0afe7f476d1f9dadc1a9f75377373d282/includes/class-installer.php#L381).

```
/**
 * Add defaults for title options.
 *
 * @param array $settings Array of settings and its values.
 */
add_filter( 'rank_math/settings/defaults/titles', function( $settings ) {
 return $settings;
});
```

### 12. Add Default value for Sitemap Settings during plugin installation.

Use the filter to set default values for sitemap settings. Refer to the options and [default values here](https://github.com/rankmath/seo-by-rank-math/blob/eea089f0afe7f476d1f9dadc1a9f75377373d282/includes/class-installer.php#L374).

```
/**
 * Add defaults for Sitemap options.
 *
 * @param array $settings Array of settings and its values.
 */
add_filter( 'rank_math/settings/defaults/sitemap', function( $settings ) {
 return $settings;
});
```

### 13. Allow developers to add/remove/change Modules.

Use this filter to modify or remove any existing modules available in Rank Math SEO plugin. You can also add any custom modules through this filter.

```
/**
 * Filters the array of modules available to be activated.
 *
 * @param array $modules Array of available modules.
 */
add_filter( 'rank_math/modules', function( $modules ) {
 return $modules;
});
```

### 14. Filter to change the Author base.

Use this filter to change the URL base for author archives. When the author base is configured to use this filter, the [Author Base](https://rankmath.com/kb/titles-and-meta/#author-base) set by the users under **Rank Math SEO → Titles & Meta → Authors** will not have any effect.

```
/**
 * Allow developers to change the author base.
 *
 * @param string $base The author base.
 */
add_filter( 'rank_math/author_base', function( $base ) {
 return $base;
});
```

### 15. Filter to change the address part format.

This filter lets you change the address part format for Rank Math’s [Local SEO contact shortcode](https://rankmath.com/kb/local-seo/#contact-info-shortcode).

```
/**
 * Allow developer to change the address part format.
 *
 * @param string $parts_format String format  how to output address part.
 */
add_filter( 'rank_math/shortcode/contact/address_parts_format', function( $format ) {
 return $format;
});
```

### 16. Filter to change the args in the locations query

This filter allows you to change the query arguments to retrieve locations when you use [Location shortcode](https://rankmath.com/kb/location-data-shortcode/) and [Local Business Block](https://rankmath.com/kb/local-business-block/) in Rank Math.

```
/**
 * Filter to change Locations query args.
 *
 * @param  array $args Arguments to retrieve locations.
 * @return array $args.
 */
add_filter( 'rank_math/location_args', function( $args ) {
	// Add your code here to change the args.
	return $args;
} );
```

### 17. Filter to change Post type icons in the options panel.

Use this filter to update the icons for post types, such as posts, pages, products, etc, in Titles & Meta settings as well as Sitemap settings. For each post type, you can assign a CSS class to specify the desired icon. You can also use this filter to define the default icon for any new post type.

```
/**
 * Allow developer to change post types icons.
 *
 * @param array $icons Array of available icons.
 */
add_filter( 'rank_math/post_type_icons', function( $icons ) {
 return $icons;
});
```

### 18. Filter to change Taxonomy icons in the options panel.

Use this filter to update the icons for taxonomies, such as categories, tags, etc, in Titles & Meta settings as well as Sitemap settings. For each taxonomy, you can assign a CSS class to specify the desired icon. You can also use this filter to define the default icon for any new taxonomy.

```
/**
 * Allow developer to change taxonomies icons.
 *
 * @param array $icons Array of available icons.
 */
add_filter( 'rank_math/taxonomy_icons', function( $icons ) {
 return $icons;
});
```

### 19. Filter to enable/disable overlay icon option in Social Tab in Post Settings.

```
/**
 * Allow developer to enable/disable overlay icon option in Post Settings.
 *
 * @param string $value   Default is set to off.
 * @param string $service Can be faceboo or twitter.
 *
 */
add_filter( 'rank_math/metabox/social/overlay_icon', function( $value, $service ) {
 return $value;
}, 10, 2 );
```

### 20. Filter to enable/disable Link Suggestion Metabox for the particular post type.

```
/**
 * Allow developer to enable/disable Link Suggestion Metabox for specific post type.
 *
 * @param string $default   Default is set to on.
 * @param string $post_type Post type name.
 *
 */
add_filter( 'rank_math/settings/titles/link_suggestions', function( $default, $post_type ) {
 return $default;
}, 10, 2 );
```

### 21. Filter to set default Snippet type for the post type.

Use this filter to set a default [Schema type](https://rankmath.com/kb/titles-and-meta/#rich-snippet-type) for each post type under **Rank Math SEO → Titles & Meta** settings.

```
/**
 * Allow developer to default Snippet type by post type.
 *
 * @param string $type      Snippet Type.
 * @param string $post_type Post type name.
 *
 */
add_filter( 'rank_math/settings/snippet/type', function( $type, $post_type ) {
 return $default;
}, 10, 2 );
```

### 22. Filter to set default Snippet Article type for the post type.

```
/**
 * Allow developer to default Snippet Article type by post type.
 *
 * @param string $type      Article Type.
 * @param string $post_type Post type name.
 *
 */
add_filter( 'rank_math/settings/snippet/article_type', function( $type, $post_type ) {
 return $type;
}, 10, 2 );
```

### 23. Filter to add custom variable replacements.

Use this filter to modify `name`, `description`, `variable` and `example` of existing Rank Math variables.

```
/**
 * Filter to add custom variables
 */
add_filter( 'rank_math/vars/replacements', function( $vars ) {
 return $vars;
});
```

### 24.  Add Extra Variables to the Rank Math Dropdown in Title & Meta Settings

This filter allows you to add additional variables that would appear in the Rank Math Titles & Meta settings drop-down as well as in the [Meta Box Snippet Editor](https://rankmath.com/kb/general-tab/#what-variables-are-supported).

```
/**
 * Action: 'rank_math/vars/register_extra_replacements' - Allows adding extra variables.
 */add_action( 'rank_math/vars/register_extra_replacements', function(){
 rank_math_register_var_replacement(
 'custom_variable_slug',
 [
 'name'        => esc_html__( 'Custom variable name.', 'rank-math' ),
 'description' => esc_html__( 'Custom variable description.', 'rank-math' ),
 'variable'    => 'custom_variable_slug',
 'example'     => 'custom_variable_callback()',
 ],
 'custom_variable_callback'
 );
});
```

### 25. Filter to show/hide SEO Metabox.

```
/**
 * Filter to show/hide SEO Metabox.
 */
add_filter( 'rank_math/metabox/add_seo_metabox', function( $default ) {
 return $default;
});
```

### 26. Filter to change Separator %sep%.

This filter lets you set a [default separator](https://rankmath.com/kb/general-settings/#separator-character) that is used in the title tags. If the separator character is set using this filter, then it will override the Separator Character set by users under **Rank Math SEO → Titles & Meta → Global Meta**.

```
/**
 * Filter to change Separator %sep%.
 */
add_filter( 'rank_math/settings/title_separator', function( $sep ) {
 return $sep;
});
```

### 27. Filter to turn off auto-update notification emails.

This filter enables you to disable the auto-update notification emails from Rank Math. However, please note, disabling this email notification would not prevent auto-updates on your site.

```
/**
 * Filter to turn off auto-update notification emails.
 */
add_filter( 'rank_math/auto_update_send_email', '__return_false' );
```

### 28. Filter to edit the auto-update notification emails.

```
/**
 * Filter to edit the auto-update notification emails.
 */
add_filter( 'rank_math/auto_update_email', function( $email, $version, $plugin_upgrader_obj ) {
  $email['to_address'] = '[email protected]';
  $email['body'] = "Rank Math has been updated to version {$version}.";
  return $email;
});
```

### 29. Add Custom Power Words for Analysis

```
/**
 * Filter to add custom Power Words
 */
add_filter( 'rank_math/metabox/power_words', function( $words ){
	$new_words = [
		'test-word1',
		'test-word2',
		'test-word3',
	];
	return array_merge( $words, $new_words );
});
```

### 30. Filter to change default Settings Mode(Easy or Advanced)

```
/**
 * Filter to change default Settings Mode(Easy or Advanced)
 */
add_filter( 'rank_math/setup_mode', function( $mode ) {
    return $mode;
});
```

### 31. Filters to change the CSV separator character in the CSV Importer file

```
/**
 * Filter to change the CSV separator character in the CSV Importer file
 */
add_filter( 'rank_math/csv_import/separator', function( $separator ) {
    return ';';
} );
```

### 32. Hide the Email Reporting Options

```
/**
 * Filter to hide the Email Reporting Options
 */
add_filter( 'rank_math/analytics/hide_email_report_options', '__return_true' );
```

### 33. Use the admin email ID for Email Reporting

```
add_filter( 'rank_math/analytics/email_report_parameters', function( $data ) {
    $data['to'] = get_option( 'admin_email' );
	return $data;
} );
```

### 34. Change the Email SEO Report Button URL

```
add_filter( 'rank_math/analytics/email_report_variables', function( $vars ) {
	$vars['report_url'] = "https:://newlogin-url.com";
	return $vars;
} );
```

### 35. Google Analytics – Track certain user role even if Exclude Logged-In users option is ON

This filter overrides the [Exclude logged-in users](https://rankmath.com/kb/general-settings/#exclude-logged-in-users) feature and lets you unset specific user roles from being ignored.

```
add_filter(
	'rank_math/analytics/gtag_exclude_loggedin_roles',
	function( $roles ) {
		unset( $roles['customer'] ); // Track logged in customers.
		return $roles;
	}
);
```

### 36. Filter to change the Post Meta Table limit

```
/**
 * Filter to change the Post Meta Table Limit
 */
add_filter('rank_math/seo_analysis/postmeta_table_limit', function ( $limit ) {
		return 500000;
	}
);
```

### 37. Filter to allow line breaks in FAQ and HowTo Schema blocks

```
/**
 * Filter: Allow developers to preserve line breaks.
 *
 * @param bool   $return If set, this will convert all remaining line breaks after paragraphing.
 * @param string $block  Block name.
 */
add_filter( 'rank_math/block/preserve_line_breaks', '__return_false' );
```

### 38. Filter to Disable Domain Checking functionality

This filter bypasses the check for any mismatch in the Site Address and WordPress URL in the settings that can cause issues with activation on some setups.

```
/**
 * Filter whether we need to check for URL mismatch or not.
 */
add_filter( 'rank_math/registration/do_url_check', '__return_false' );
```

### 39. Filter to Disable Sensitive Data Encryption

```
/**
 * Filter to disable sensitive data encryption
 */
add_filter( 'rank_math/admin/sensitive_data_encryption', '__return_false' );
```

### 40. Filter to Disable Focus Keyword Suggestions from Google

```
/**
 * Filter to Disable Keyword Suggestions from Google
 */
add_filter( 'rank_math/metabox/values', function( $args = [] ) {
    $args['autoSuggestKeywords'] = false;
    return $args;
} );
```

### 41. Filter to Modify the Redirection data before updating a Redirection

```
/**
 * Filter to modify the redirection data before updating a redirection.
 * Pass a false value to skip the update and create a new redirection instead.
 *
 * @param array|false $data Redirection data.
 */
add_filter('rank_math/admin/csv_import_redirection_update', function ($exist, $data) {
    return $data;
}, 10, 2);
```

### 42. Filter to exclude post types from Analytics Index

Once you’ve made changes to the existing Analytics Index using this filter, be sure to [rebuild the index](https://rankmath.com/kb/rank-math-status-and-tools/#rebuild-index-for-analytics) by heading over to **WordPress Dashboard → Rank Math SEO →** **Status & Tools → Database Tools → Rebuild Index**.

```
/**
 * Filter to exclude post types from Analytics Index.
 */
add_filter( 'rank_math/analytics/post_types', function( $post_types = [] ) {
    $excludes = [
        'page',
    ];

    return array_diff_key( $post_types, array_flip( $excludes ) );
});
```

### 43. Filter to change IndexNow API Key location

```
/**
 * Filter to change the location of the IndexNow key file.
 * 
 * @param string $location Location.
 */
add_filter( 'rank_math/instant_indexing/indexnow_key_location', function($location) {
	$location = 'https://yourdomain.com/' . \RankMath\Helper::get_settings( 'instant_indexing.indexnow_api_key' ) . '.txt'; //change your API Key location
	return $location;
} );
```

### 44. Filter to change the IndexNow API Key

```
/**
 * Filter to change the API key.
 *
 * @param string $api_key API key.
 */
add_filter( 'rank_math/instant_indexing/indexnow_key', function($api_key) {
	return $api_key;
} );
```

### 45. Filter to disable restrictions on updating PRO version before Free version

```
/**
 * Filter to remove restrictions in updating PRO version before the Free version
 */
add_filter( 'rank_math/updates/remove_restrictions', '__return_true' );
```

### 46. Filter to disable Rich Text Editor in a specific taxonomy

```
/**
 * Filter to disable Rich Text editor in specific taxonomy.
 *
 * @param string $disable      Whether to disable the Rich Text editor.
 * @param string $taxonomy Taxonomy name.
 */
add_filter( 'rank_math/admin/disable_rich_editor', function( $disable, $taxonomy ) {
	return true;
}, 10, 2 );
```

### 47. Filter to change Local SEO shortcode content

```
/**
 * Filter to change the Local SEO shortcode output.
 * 
 * @param string $html The HTML output of the shortcode.
 */
add_filter('rank_math/contact_info/html', function($html){
	return $html;
});
```

### 48. Filter to disable rewriting Front base for Locations CPT

```
/**
 * Filter to disable rewriting Front base for Locations CPT.
 */
add_filter( 'rank_math/locations/front', '__return_false'  );
```

### 49. Filter to remove SEO filters from posts

```
/**
 * Filter to remove SEO Filters from Posts.
 *
 * @param array $options    SEO Filter options.
 * @param string $post_type Post type.
 *
 * @param array/bool Filtered options
 */
add_filter( 'rank_math/manage_posts/seo_filter_options', '__return_false' );
```

### 50. Filter to Remove Lock Modified Date option

```
/**
 * Filter to remove the lock modified date option
 */
add_filter( 'rank_math/lock_modified_date', '__return_false' );
```

### 51. Filter to Enable Rank Math GTIN Field

```
/**
 * Filter to enable Rank Math GTIN field.
 */
add_filter( 'rank_math/woocommerce/add_gtin_field', '__return_true' );
```

### 52. Filter to Disable Search Intent Analysis Feature

```
/**
 * Filter to disable Search Intent Analysis feature.
 */
add_filter( 'rank_math/determine_search_intent', '__return_false' );
```

## Sitemap

### 1. Filter to change the Sitemap URL Base

```
/**
 * Filter to change the Sitemap URL Base
 *
 * @param string $base New URL Base
 */
add_filter( 'rank_math/sitemap/base_url', function( $base ){
	return 'search-sitemaps/';
}, 10, 1 );
```

### 2. Filter to change the Sitemap Cache directory.

```
/**
 * Filter XML sitemap cache directory.
 *
 * @param string $unsigned Default cache directory
 */
add_filter( 'rank_math/sitemap/cache_directory', function( $directory) {
	return $directory;
});
```

### 3. Filter to enable/disable Sitemap caching.

```
/**
 * Filter if XML sitemap transient cache is enabled.
 *
 * @param boolean $unsigned Enable cache or not, defaults to true
 */
add_filter( 'rank_math/sitemap/enable_caching', '__return_true');
```

### 4. Filter to change Sitemap caching mode.

```
/**
 * Filter to change sitemap caching mode
 * 
 * @param string $mode  Cache mode "file" or "db".
 */
add_filter( 'rank_math/sitemap/cache_mode', function( $mode ) {
	return $mode;
} );
```

### 5. Filter to exclude post type from the Sitemap.

This filter will override the [Include in Sitemap](https://rankmath.com/kb/configure-sitemaps/#include-in-sitemap) option available under **Rank Math SEO → Sitemap Settings → Post Types**.

```
/**
 * Filter decision if post type is excluded from the XML sitemap.
 *
 * @param bool   $exclude Default false.
 * @param string $type    Post type name.
 */
add_filter( 'rank_math/sitemap/exclude_post_type', function( $exclude, $type ){
	return $exclude;
}, 10, 2 );
```

### 6. Filter sitemap item before it gets added to the sitemap.

```
/**
 * Filter URL entry before it gets added to the sitemap.
 *
 * @param array  $url  Array of URL parts.
 * @param string $type URL type. Can be user, post or term.
 * @param object $object Data object for the URL.
 */
add_filter( 'rank_math/sitemap/entry', function( $url, $type, $object ){
	return $url;
}, 10, 3 );
```

### 7. Filter to change/remove archive url, plugin uses in the XML Sitemap.

```
/**
 * Filter the URL Rank Math SEO uses in the XML sitemap for this post type archive.
 *
 * @param string $archive_url The URL of this archive
 * @param string $post_type   The post type this archive is for.
 */
add_filter( 'rank_math/sitemap/post_type_archive_link', function( $archive_url, $post_type ){
	return $archive_url;
}, 10, 2 );
```

### 8. Filter to change/remove Post URL, plugin uses in the sitemap.

```
/**
 * Filter the URL Rank Math SEO uses in the XML sitemap.
 *
 * Note that only absolute local URLs are allowed as the check after this removes external URLs.
 *
 * @param string $url  URL to use in the XML sitemap
 * @param object $post Post object for the URL.
 */
add_filter( 'rank_math/sitemap/xml_post_url', function( $url, $post){
	return $url;
}, 10, 2 );
```

### 9. Filter to exclude taxonomy from Sitemap.

This filter will override the [Include in Sitemap](https://rankmath.com/kb/configure-sitemaps/#include-in-sitemap-8) option available under **Rank Math SEO →** **Sitemap Settings → Taxonomies**.

```
/**
 * Filter decision if taxonomy is excluded from the XML sitemap.
 *
 * @param bool   $exclude Default false.
 * @param string $type    Taxonomy name.
 */
add_filter( 'rank_math/sitemap/exclude_taxonomy', function( $exclude, $type ){
	return $exclude;
}, 10, 2 );
```

### 10. Filter to exclude empty terms from Sitemap.

```
/**
 * Filter the setting of excluding empty terms from the XML sitemap.
 *
 * @param boolean $exclude        Defaults to true.
 * @param array   $taxonomy_names Array of names for the taxonomies being processed.
 */
add_filter( 'rank_math/sitemap/exclude_empty_terms', function( $exclude , $taxonomy_names ){
	return $exclude;
}, 10, 2 );
```

### 11. Filter to remove/change images included for the post in XML sitemap.

```
/**
 * Filter images to be included for the post in XML sitemap.
 *
 * @param array $images  Array of image items.
 * @param int   $post_id ID of the post.
 */
add_filter( 'rank_math/sitemap/urlimages', function( $images, $post_id ){
	return $images;
}, 10, 2);
```

### 12. Filter to Remove Sitemap credit.

```
/**
 * Filter to remove sitemap credit.
 *
 * @param boolean Defaults to false.
 */
add_filter( 'rank_math/sitemap/remove_credit', '__return_true');
```

### 13. Filter to Add Extra URLs in the Sitemap

```
/**
 Filter to add extra URLs to the XML sitemap by type.
 *
 Only runs for the first page, not on all.
 *
 @param string $content String content to add, defaults to empty.
 */
add_action( 'rank_math/sitemap/{$type}_content', function() {
return '<url>
<loc>https://rankmath.com/some-custom-url/</loc>
<lastmod>2020-06-10T20:20:20+00:00</lastmod>
</url>';
});
```

Replace `{$type}` with either `post` or `page` depending on if you want the URL to be included in the post or page sitemap – respectively.

### 14. Filter to add Locations KML file in the Sitemap

The below filter enables you to add the Locations KML file to your sitemap. But please note, the KML file will be added only if you have [added your business geocoordinates](https://rankmath.com/kb/kml-sitemap/#add-kml-for-local-business) in Rank Math’s Local SEO settings.

```
/**
 * Filter to add Locations KML file in the sitemap
 */
add_filter( 'rank_math/sitemap/locations', '__return_true' );
```

### 15. Filter to Add CDN Image URLs in the Sitemap

```
/**
 * Filter to Add CDN Image URLs in the Sitemap
 *
 * @param string $src  Image URL.
 * @param object $post Post object.
 */
add_filter( 'rank_math/sitemap/xml_img_src', function( $src, $post ){
	$src = str_replace( 'http://domain.com', 'https://cdn.domain.com', $src );
	return $src;
}, 10, 2);
```

### 16. Filter to detect third party sitemap URL in the Search Console

```
/**
 * Filter to detect Sitemap URL in the Search Console if you are using different plugin for sitemap.
 */
add_filter( 'rank_math/sitemap/sitemap_index_uri', function() { return 'sitemap.xml'; } );
```

### 17. Filter to change user query arguments for the sitemap listing

```
/**
 * Filter to change user query arguments for the sitemap listing
 */
add_filter( 'rank_math/sitemap/author/query', function( $args ) {
	$args['role__not_in'] = 'subscriber'; return $args;
} );
```

### 18. Filter to add `noindex` URLs in the Sitemap

```
/**
* Filter to add `noindex` URLs in the Sitemap
*
* @param bool $value Whether to include noindex terms in Sitemap.
* @param string $type Object Type.
*
* @return boolean
*/
add_filter( 'rank_math/sitemap/include_noindex', function( $value, $type ) {
	return true;
}, 10, 2 );
```

### 19. Filter to add external Sitemap to the Rank Math Sitemap

```
add_filter( 'rank_math/sitemap/index', function( $xml ) {
	$xml .= '
		<sitemap>
			<loc>http://example.com/new-sitemap.xml</loc>
			<lastmod>2020-09-14T20:34:15+00:00</lastmod>
		</sitemap>';
		return $xml;
}, 11 );
```

### 20. Filter to add content in the new sitemap

```
/**
 * Filter to add links in the new Sitemap.
 */
add_filter( 'rank_math/sitemap/{$type}/content', function() {
	return '
		<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
			<url>
				<loc>http://example.com/new-sitemap-post/</loc>
				<lastmod>2020-09-14T20:34:15+00:00</lastmod>
			</url>
		</urlset>';
} );
```

### 21. Filter the sitemap HTTP headers

```
/**
 * Filter the sitemap HTTP headers.
 *
 * @param array $headers HTTP headers.
 * @param bool  $is_xsl Whether these headers are for XSL.
 */
add_filter( 'rank_math/sitemap/http_headers', function( $headers ) {
	if ( '/locations.kml' !== $_SERVER['REQUEST_URI'] ) {
		return $headers;
	}
	unset( $headers['X-Robots-Tag'] );
	return $headers;
} );
```

### 22. Change the post content before passing it to the Image Parser

```
/**
 * Filter: 'rank_math/sitemap/content_before_parse_html_images' - Filters the post content
 * before it is parsed for images.
 *
 * @param string $content The raw/unprocessed post content.
 * @param int    $post_id The current Post ID.
 */
add_filter( 'rank_math/sitemap/content_before_parse_html_images', function( $content, $post_id ) {
    // Process content..
    return $content;
}, 10, 2 );
```

### 23. Filter to change the sort order in the HTML Sitemap

```
/**
 * Filter: 'rank_math/sitemap/html_sitemap/sort_items' - Allow changing the sort order of the HTML sitemap.
 *
 * @var array $sort {
 *    @type string $field The field to sort by.
 *    @type string $order The sort order.
 * }
 * @var string $type     The item type.
 * @var string $name     The post type/taxonomy name.
 */
add_filter('rank_math/sitemap/html_sitemap/sort_items', function ($sort, $type, $name) {
    return $sort;
}, 10, 3);
```

### 24. Filter to change the post statuses to be included in the HTML Sitemap

```
/**
 * Filter: 'rank_math/sitemap/html_sitemap_post_statuses' - Allow changing the post statuses that should be included in the HTML sitemap.
 *
 * @var array  $statuses Post statuses.
 * @var string $post_type Post type name.
 */
add_filter('rank_math/sitemap/html_sitemap_post_statuses', function ($statuses, $post_type) {
    return $statuses;
}, 10, 2);
```

### 25. Filter to change the post types to be included in the HTML Sitemap

```
/**
 * Filter: 'rank_math/sitemap/html_sitemap_post_types' - Allow changing the post types to be included in the HTML sitemap.
 *
 * @var array $post_types The post types to be included in the HTML sitemap.
 */
add_filter('rank_math/sitemap/html_sitemap_post_types', function ($post_types) {
    return $post_types;
}, 10, 1);
```

### 26. Filter to change the taxonomies to be included in the HTML Sitemap

```
/**
 * Filter: 'rank_math/sitemap/html_sitemap_taxonomies' - Allow changing the taxonomies to be included in the HTML sitemap.
 *
 * @var array $taxonomies The taxonomies to be included in the HTML sitemap.
 */
add_filter('rank_math/sitemap/html_sitemap_taxonomies', function ($taxonomies) {
    return $taxonomies;
}, 10, 1);
```

### 27. Filter to remove the HTML Sitemap tab from Sitemap Settings

```
/**
 * Filter to remove HTML sitemap tab from the Sitemap settings.
 *
 * @param array $tabs
 */
add_filter( 'rank_math/settings/sitemap', function( $tabs) {
	if ( isset( $tabs['html_sitemap'] ) ) {
		unset( $tabs['html_sitemap'] );
	}

	return $tabs;
});
```

### 28. Filter to change video content and thumbnail location

In the below filter, replace `{$prop}` with `thumbnail_loc` to change the thumbnail location and `content_loc` to change the content location

```
/**
 * Filter the video content and thumbnail location:
 * - rank_math/sitemap/video/thumbnail_loc
 * - rank_math/sitemap/video/content_loc
 */
add_filter("rank_math/sitemap/video/{$prop}", function ($loc) {
	return $loc;
});
```

### 29. Filter to remove the Last Modified Column from Sitemap Index

```
/**
 * Filter to remove lastmod from sitemap index
 */
add_filter( 'rank_math/sitemap/index/entry', function( $index, $type ) {
    if ( isset( $index['lastmod'] ) ) {
		unset( $index['lastmod'] );
	}
	return $index;
}, 10, 2 );
```

To remove the Last Modified columns from specific sitemaps in the index, the filter can be used as

```
/**
 * Filter to remove lastmod from sitemap
 */
add_filter( 'rank_math/sitemap/index/entry', function( $index, $type ) {
    if ( 'term' === $type ) {
        return $index;
    }

    if ( isset( $index['lastmod'] ) ) {
		unset( $index['lastmod'] );
	}
	return $index;
}, 10, 2 );
```

**Note:** Please be sure to flush the sitemap cache as shown [in this tutorial](https://rankmath.com/kb/sitemap-404-error/#sitemap-cache) for these changes to reflect on the front end.

### 30. Filter to modify the post object added to the Sitemap

```
/**
 * Filter the post object before it gets added to the sitemap.
 * This allows you to add custom properties to the post object,
 * or replace it entirely.
 * 
 * @param object $post Post object.
 */
add_filter('rank_math/sitemap/post_object', function($post){
    return $post;
});
```

### 31. Filter to modify the Sitemap Index slug

```
/**
 * Filter: 'rank_math/sitemap/index_slug' - Modify the sitemap index slug.
 *
 * @param string $slug Sitemap index slug.
 *
 * @return string
 */
add_filter( 'rank_math/sitemap/index/slug', function($slug) {
	return $slug;
});
```

**Note:** If you have updated the Sitemap Index slug using the above filter, then head over to **Settings → Permalinks** in your WordPress dashboard and click the **Save Changes** button for the changes to reflect.

### 32. Filter to change Sitemap Slug

```
/**
 * Filter the slug of the author sitemap.
 *
 * @param string $slug Slug of the author sitemap.
 */
add_filter( 'rank_math/sitemap/author/slug', function($slug){
	return 'author'; //Change this to your preferred slug.
});
```

Similarly, the bellow filters can be used for changing the slug of video sitemap and news sitemap.

```
add_filter( 'rank_math/sitemap/video/slug', function( $slug ) {
    return 'video'; //Change this slug.
});

add_filter( 'rank_math/sitemap/news/slug', function( $slug ) {
    return 'news'; //Change this slug.
});
```

### 33. Filter to modify the value of `<news:language>` in News Sitemap

```
/**
 * Filter: 'rank_math/sitemap/news/language' - Allow changing the news language based on the entity.
 *
 * @param string $lang   Language code.
 * @param array  $entity Array of parts that make up this entry.
 */
add_filter( 'rank_math/sitemap/news/language', function( $lang, $entity ) {
	return $lang;
}, 10, 2 );
```

### 34. Filter to change the content passed to the Auto-Detect Video Parser

```
/**
 * Filter to change the content passed to the Video Parser.
 *
 * @param string $content Post Content.
 * @param object $post    Post Object.
 *
 * @return string Content.
 */
add_filter('rank_math/video/parser_content', function( $content, $post ) {
	return $content;
}, 10, 2);
```

### 35. Filter to exclude products with specific stock status from Sitemap [PRO](https://rankmath.com/pricing/)

Use this filter to select the stock status of products you want to be included in your sitemap. You can also exclude specific stock statuses, such as “Out of Stock” products.

**Note:** This filter is available only for Rank Math PRO users.

```
**
 * Filter to exclude specific stock status from sitemap
 */
add_filter( 'rank_math/woocommerce/stock_status', function( $statuses ) {
    return [ 'instock', 'onbackorder' ]; // outofstock is excluded
});
```

### 36. Filter to add a WHERE clause to the HTML Sitemap query

```
/**
 * Filter to add a WHERE clause for the HTML sitemap get_posts(type, post_parent[] ) query.
 *
 * @param string $where      SQL WHERE query, defaults to an empty string.
 * @param array  $post_type  The Post type.
 */
add_filter('rank_math/html_sitemap/get_posts/where',function($where, $post_type){
    return $where;
});
```

### 37. Filter to add a JOIN clause to the HTML Sitemap query

```
/**
 * Filter to add a JOIN clause for the HTML get_posts(type, post_parent[]) query.
 *
 * @param string $join       SQL join clause, defaults to an empty string.
 * @param array  $post_type  The Post type.
 */
add_filter('rank_math/html_sitemap/get_posts/join',function($join, $post_type){
    return $join;
});
```

### 38. Filter to Increase the Post Limit in HTML Sitemap

```
/**
 * Filter to increase the post limit for HTML sitemap
 *
 * @param int $post_limit post limit
 */
add_filter( 'rank_math/sitemap/html_sitemap_post_limit', function( $post_limit) {
	return 1000; // Default limit set to 1000 posts
});
```

### 39. Filter to Exclude Posts with Canonical URLs in the Sitemap

By default, posts with custom canonical URLs (especially external ones) are _included_ in the sitemap **post count query** but are later _excluded_ from the **sitemap output**.

When this filter is enabled (`true`), it **excludes posts with any custom canonical URL** (including self-referencing ones) from the **post count query** itself, preventing empty sitemap pages.

Please use this filter only if you’re seeing 404 sitemap pages and use external canonical URLs.

```
/**
 * Filter to exclude posts with canonical URLs from the sitemap.
 *
 * @param bool         $exclude Whether to exclude posts with canonical URLs.
 * @param array|string $post_types The post types being queried.
 */
add_filter( 'rank_math/sitemap/exlude_posts_with_canonical_urls', function( $exclude, $post_types ) {
	return true;
}, 10, 2 );
```

### 40. Filter to decide strict term exclusion for news sitemap

```
/**
 * Filter whether to use strict term exclusion for the news sitemap.
 *
 * @param bool   $strict Whether to use strict exclusion. Default true.
 * @param string $key    Taxonomy key being processed.
 * @param array  $terms  Excluded terms grouped by taxonomy.
 */
add_filter( 'rank_math/sitemap/news/use_all_terms_for_exclude_check', function( $strict, $key, $terms ) {
	return $strict;
}, 10, 3 );
```

## Podcast

### 1. **Filter to prevent adding podcast data to the WP feeds.**

```
/**
 * Filter to prevent adding podcast data in the WP feeds.
 */
add_filter( 'rank_math/podcast/enhance_all_feeds', '__return_false' );
```

### 2. **Filter to remove the Podcast feed namespace.**

```
/**
 * Filter to remove the Podcast feed namespace.
 */
add_filter( 'rank_math/rss/add_podcasts_namespace', '__return_false' );
```

### 3. **Filter to modify the Hub URLs.**

```
/**
 * Filter to modify the hub URLs.
 * 
 * @param array $urls The HUB URLs.
 */
add_filter( 'rank_mathpodcast/hub_urls', function( $urls ) {
	return $urls
} );
```

### 4. **Filter to prevent Rank Math from automatically publishing feed to Pubhubsubbub.**

```
/**
 * Filter to prevent Rank Math from automatically publishing feed to Pubhubsubbub.
 * 
 * @param array $urls The HUB URLs.
 */
add_filter( 'rank_math/podcast/hub_urls', '__return_false' );
```

### 5. **Filter to change the User-agent used to publish the feed to Pubhubsubbub.**

```
/**
 * Filter to change the User-agent used to publish the feed to Pubhubsubbub.
 * 
 * @param string $user_agent The user agent.
 */
add_filter( 'rank_math/podcast/useragent', function( $user_agent ) {
	return $user_agent;
} );
```

### 6. Filter to Change the Title of the Podcast Episode

```
/**
 * Filter: 'rank_math/schema/podcast_episode_title' - Allow changing the title of the podcast episode. Pass false to disable.
 *
 * @var string $episode_title The title of the podcast episode.
 *
 * @param WP_Post $post   The post object.
 * @param array   $schema The schema array.
 */
add_filter('rank_math/schema/podcast_episode_title', function( $episode_title, $post, $schema ) {
	return $episode_title;
}, 10, 3);
```

### 7. Filter to change the number of Podcast Episodes in the RSS Feed

```
/**
 * Filter to change the podcast feed arguments
 */
add_filter( 'rank_math/podcast_args', function( $args = [] ) {
    $args[ 'posts_per_page' ] = 5;
    return $args;
} );
```

### 8. Filter to modify Podcast RSS feed permalink

```
/**
 * Filter to modify the permalink of Podcast RSS feed.
 * 
 * @pram string $podcast Podcast RSS feed slug.
 */
add_filter( 'rank_math/podcast/feed', function( $podcast ) {
    return 'new-podcast';
});
```

**Note:** Once you have modified the Podcast feed slug using the above filter, head over to **Settings → Permalinks** in your WordPress dashboard and click the **Save Changes** button for the changes to reflect.

## Breadcrumbs

### 1. Filter to change the Breadcrumb Settings.

The filter will override the [breadcrumb options](https://rankmath.com/kb/general-settings/#breadcrumbs) selected by the user under **Rank Math SEO → General Settings → Breadcrumbs**.

```
/**
 * Filter to change breadcrumb settings.
 *
 * @param  array $settings Breadcrumb Settings.
 * @return array $setting.
 */
add_filter( 'rank_math/frontend/breadcrumb/settings', function( $settings ) {
	$settings = array(
		'home'           => true,
		'separator'      => '',
		'remove_title'   => '',
		'hide_tax_name'  => '',
		'show_ancestors' => '',
	);
	return $settings;
});
```

### 2. Filter to change Breadcrumb Strings.

The filter will override the breadcrumbs strings selected by the user under **Rank Math SEO →** **General Settings → Breadcrumbs**.

```
/**
 * Filter to change breadcrumb strings.
 *
 * @param  array $settings Breadcrumb Strings.
 * @return array $strings.
 */
add_filter( 'rank_math/frontend/breadcrumb/strings', function( $strings ) {
	$strings = array(
		'prefix'         => '',
		'home'           => '',
		'error404'       => '',
		'archive_format' => '',
		'search_format'  => '',
	);
	return $strings;
});
```

### 3. Filter to change Breadcrumb args.

This filter allows you to change the breadcrumb arguments and the breadcrumb appearance on the front-end as well.

```
/**
 * Filter to change breadcrumb args.
 *
 * @param  array $args Breadcrumb args.
 * @return array $args.
 */
add_filter( 'rank_math/frontend/breadcrumb/args', function( $args ) {
	$args = array(
		'delimiter'   => '&nbsp;/&nbsp;',
		'wrap_before' => '<nav class="rank-math-breadcrumb"><p>',
		'wrap_after'  => '</p></nav>',
		'before'      => '',
		'after'       => '',
	);
	return $args;
});
```

### 4. Filter to change the Breadcrumb HTML.

This filter allows you to make any changes to the Breadcrumb HTML on the front-end.

```
/**
 * Filter to change breadcrumb html.
 *
 * @param  html  $html Breadcrumb html.
 * @param  array $crumbs Breadcrumb items
 * @param  class $class Breadcrumb class
 * @return html  $html.
 */
add_filter( 'rank_math/frontend/breadcrumb/html', function( $html, $crumbs, $class ) {
	// theme_breadcrumb_function();
	return $html;
}, 10, 3);
```

### 5. Filter to change the primary term output of the breadcrumbs class.

You can use this filter to [change the primary term](https://rankmath.com/kb/how-to-choose-a-primary-category/) output of the breadcrumbs class dynamically on the front-end.

```
/**
 * Filter to change the primary term output of the breadcrumbs class.
 *
 * @param WP_Term $term  Primary term.
 * @param array   $terms Terms attached to the current post.
 */
add_filter( 'rank_math/frontend/breadcrumb/main_term', function( $current_term, $terms ) {
	return $current_term;
}, 10, 2 );
```

### 6. Filter to change/remove breadcrumb items.

This filter allows developers to make any changes or remove any breadcrumb items dynamically on the front-end. When you change/remove the breadcrumb item with this filter, the changes will also reflect in the Breadcrumb Schema.

```
/**
 * Allow changing or removing the Breadcrumb items
 *
 * @param array       $crumbs The crumbs array.
 * @param Breadcrumbs $this   Current breadcrumb object.
 */
add_filter( 'rank_math/frontend/breadcrumb/items', function( $crumbs, $class ) {
	return $crumbs;
}, 10, 2);
```

### 7. Filter to change/remove breadcrumb items from Breadcrumb Snippet.

The changes made using this filter will affect _only_ the Breadcrumb Schema.

```
/**
 * Allow changing Breadcrumb elements in BreadcrumbList snippet
 *
 * @param array $entity Breadcrumb entity
 */
add_filter( 'rank_math/snippet/breadcrumb', function( $entity ) {
	return $entity;
});
```

## Meta Data

### 1. Filter to change the Title.

```
/**
 * Filter to change the page title.
 * 
 * @param string $title
 */
add_filter( 'rank_math/frontend/title', function( $title ) {
	return $title;
});
```

### 2. The code to move the title inside the Rank Math’s meta box

```
/**
 * Code to move title inside the Rank Math's meta
 * 
 * @param string $title
 */
add_action( 'init', function() {
    add_action( 'rank_math/head', '_block_template_render_title_tag' );
});

add_action( 'wp_before_include_template', function() {
    remove_action( 'wp_head', '_block_template_render_title_tag', 1 );
});
```

### 3. Filter to change the meta description.

```
/**
 * Allow changing the meta description sentence from within the theme.
 *
 * @param string $description The description sentence.
 */
add_filter( 'rank_math/frontend/description', function( $description ) {
	return $description;
});
```

### 4. Use the Description from Global Setting, if the description is missing in the Post metabox:

```
/**
 * Use the Description from Global Setting, if the description is missing in the Post metabox
 */
add_action( 'rank_math/frontend/description', function( $description ) {
 global $post;
 $desc = RankMath\Post::get_meta( 'description', $post->ID );

 if ( ! $desc ) {
 $desc = RankMath\Helper::get_settings( "titles.pt_{$post->post_type}_description" );
 if ( $desc ) {
 return RankMath\Helper::replace_vars( $desc, $post );
 }
 }

 return $description;
});
```

### 5. Filter to change robots data.

Use this filter to change robots meta added by Rank Math dynamically on the front-end.

```
/**
 * Allows filtering of the robots meta data.
 *
 * @param array $robots The meta robots directives.
 */
add_filter( 'rank_math/frontend/robots', function( $robots ) {
	return $robots;
});
```

### 6. Filter to change Canonical URL.

```
/**
 * Allow changing of the canonical URL.
 *
 * @param string $canonical The canonical URL.
 */
add_filter( 'rank_math/frontend/canonical', function( $canonical ) {
	return $canonical;
});
```

### 7. Filter to remove plugin credit notice added to the page source.

```
/**
 * Filter to remove the plugin credit notice added to the source.
 *
 */
add_filter( 'rank_math/frontend/remove_credit_notice', '__return_true' );
```

### 8. Filter to disable adjacent links ( next/prev ).

```
/**
 * Allows developers to handle rel="next" / rel="prev" by themselves.
 *
 * @param bool $links_generated Whether or not to handle rel="next" / rel="prev" links.
 */
add_filter( 'rank_math/frontend/disable_adjacent_rel_links', '__return_true' );
```

### 9. Filter to change adjacent link output.

```
/**
 * Allow the changing of link rel output by Rank Math.
 *
 * @param string $link The full `<link` element.
 * $rel can be next or prev
 */
add_filter( "rank_math/frontend/{$rel}_rel_link", function( $link ) {
 return $link;
});
```

### 10. Filter to add the Keywords meta tag

```
/**
 * Add <meta name="keywords" content="focus keywords">.
 */
add_filter( 'rank_math/frontend/show_keywords', '__return_true');
```

### 11. Filter to change the meta keywords

```
/**
 * Allow changing the meta keywords from the default Focus Keywords.
 *
 * @param string $keywords Keywords.
 */
add_filter( 'rank_math/frontend/keywords', function( $keywords ) {
 return $keywords;
});
```

### 12. Filter to Allow Shortcodes in the Meta Data

```
/**
 * Allow shortcodes in the Meta Data.
 */
add_filter( 'rank_math/paper/auto_generated_description/apply_shortcode', '__return_true' );
```

### 13. Filter to allow shortcodes in the Product Schema description

```
/**
* Filter to allow shortcodes in the Product schema description.
*/
add_filter( 'rank_math/product_description/apply_shortcode', '__return_true' );
```

## OpenGraph

### 1. Filter to change OpenGraph Type ( og:type ).

Use this filter to change the OpenGraph type for the specific page on the front-end.

```
/**
 * Allows theme developers to change the OpenGraph type of the page.
 *
 * @param string $type The OpenGraph type string.
 */
add_filter( 'rank_math/opengraph/type', function( $type ) {
	return $type;
});
```

### 2. Filter to change OpenGraph URL ( og:url ).

```
/**
 * Allows the output of the canonical URL as OpenGraph URL, consolidating likes and shares.
 *
 * @link https://developers.facebook.com/docs/reference/opengraph/object-type/article/
 * @param $url Canonical URL
 */
add_filter( 'rank_math/opengraph/url', function( $url ) {
	return $url;
});
```

### 3. Filter to remove Twitter tags from page output.

```
/**
 * Allows changing the Twitter Card type as output in the Twitter card.
 *
 * @param string $type
 */
add_filter( 'rank_math/opengraph/twitter_card', '__return_false' );
```

### 4. Filter to change OpenGraph Image.

```
/**
 * Allows developers to change the OpenGraph image within theme.
 *
 * The dynamic part of the hook name. $network, is the network slug. Can be facebook or twitter.
 *
 * @param string $attachment_url The image we are about to add.
 */
add_filter( "rank_math/opengraph/{$network}/image", function( $attachment_url ) {
	return $attachment_url;
});
```

### 5. Filter to allow developers to add additional images.

```
/**
 * Allows developers to add images to the OpenGraph tags within the theme.
 *
 * The dynamic part of the hook name. $network, is the network slug. Can be facebook or twitter.
 *
 * @param Image The current object.
 */
add_filter( 'rank_math/opengraph/{$network}/add_additional_images', function( $image ) {
	return $image;
});
```

### 6. Filter to prevent setting default image in OpenGraph.

```
/**
 * Passing a truthy value to the filter will effectively short-circuit the
 * set default image process.
 *
 * @param bool $return Short-circuit return value. Either false or true.
 */
add_filter( 'rank_math/opengraph/pre_set_default_image', '__return_true' );
```

### 7. Filter to prevent setting image from content when image is not added in OpenGraph.

```
/**
 * Passing a truthy value to the filter will effectively short-circuit the
 * set content image process.
 *
 * @param bool $return  Short-circuit return value. Either false or true.
 * @param int  $post_id Post ID for the current post.
 */
add_filter( 'rank_math/opengraph/pre_set_content_image', function( $return, $post_id ) {
	return $return; // Set to true if you don't want to set image from Content.
});
```

### 8. Filter to determine image size to show in og:image, twitter:image.

```
/**
 * Determines which image sizes we'll loop through to get an appropriate image.
 *
 * @param unsigned array - The array of image sizes to loop through. Default array( 'full', 'large', 'medium_large' )
 */
add_filter( 'rank_math/opengraph/image_sizes', function( $sizes ) {
	return $sizes;
});
```

### 9. Filter to change specific social meta tags.

This filter lets you change specific social meta tags dynamically on the front-end.

```
/**
 * Allow developers to change the content of specific social meta tags.
 *
 * The dynamic part of the hook name. $network, is the network slug
 * and $og_property, is the property which we are outputting.
 *
 * @param string $content The content of the property.
 */
add_filter( "rank_math/opengraph/{$network}/$og_property", function( $content ) {
	return $content;
});
```

### 10. Filter to change twitter card type.

```
/**
 * Allow changing the Twitter Card type as output in the Twitter card.
 *
 * @param string $type
 */
add_filter( 'rank_math/opengraph/twitter/card_type', function( $type ) {
	return $type;
});
```

### 11. A Hook to remove OpenGraph tags.

```
/**
 * Hook to remove og:tags
 */
add_action( 'rank_math/head', function() {
	remove_all_actions( 'rank_math/opengraph/facebook' );
	remove_all_actions( 'rank_math/opengraph/twitter' );
});
```

### 12. Prevent the Output of the Price

```
/**
 * Allow developers to prevent the output of the price in the OpenGraph tags.
 *
 * @param bool unsigned Defaults to true.
 */
add_filter( 'rank_math/woocommerce/og_price', '__return_false' );
```

Use this filter to remove the `product:price:amount` & `product:price:currency` meta tags.

### 13. Change Text to Calculate the Time to Read

```
/**
 * Filter: Change the text to calculate the time to read.
 * 
 * @param string $content The content of the post.
 */
add_filter('rank_math/frontend/time_to_read_content', function ($post_content) {
    return wp_strip_all_tags($post_content);
});
```

### 14. Change the Words Per Minute to Calculate the Time to Read

```
/**
 * Filter: Change the words per minute to calculate the time to read.
 */
add_filter( 'rank_math/frontend/time_to_read_wpm', function(){
    return 200; //Words Per Minute
} );
```

### 15. Filter to Allow CDN Path in the Overlay Image

```
/**
 * Filter: 'rank_math/social/create_overlay_image' - Change the create_overlay_image arguments.
 */
add_filter('rank_math/social/create_overlay_image', function ($args) {
	return $args;
}, 10, 1);
```

## Rich Snippets

### 1. Code to remove json+ld data

```
/**
 * Code to remove json+ld data
 * 
 */
add_action( 'rank_math/head', function() {
	global $wp_filter;
	if ( isset( $wp_filter["rank_math/json_ld"] ) ) {
		unset( $wp_filter["rank_math/json_ld"] );
	}
});
```

### 2. Filter to extend json+ld data

```
/**
 * Collect data to output in JSON-LD.
 *
 * @param array  $unsigned An array of data to output in json-ld.
 * @param JsonLD $unsigned JsonLD instance.
 */
add_filter( 'rank_math/json_ld', function( $data, $jsonld ) {
	return [];
}, 99, 2);
```

### 3. Filter to remove BreadcrumbList Schema

```
/**
 * Allow developer to disable the breadcrumb json-ld output.
 *
 * @param bool $unsigned Default: true
 */
add_filter( 'rank_math/json_ld/breadcrumbs_enabled', '__return_false' );
```

### 4. Filter to remove CollectionPage Schema on Taxonomy Pages

```
/**
 * Allow developers to remove snippet data from Taxonomies.
 *
 * @param bool $unsigned Default: false
 * @param string $unsigned Taxonomy Name
 */
add_filter( 'rank_math/snippet/remove_taxonomy_data', function( $value, $taxonomy ) {
	return $value; // true or false
}, 10, 2);
```

### 5. Filter to disable the Review Display on the frontend

```
/**
 * Filter: Allow disabling the review display.
 *
 * @param bool $return true to disable.
 */
add_filter( 'rank_math/snippet/review/hide_data', '__return_true' );
```

### 6. Filter to change the Review Display location

```
/**
 * Filter to change the review display location
 *
 * @param string $location top, bottom, both or custom.
 */
add_filter( 'rank_math/snippet/review/location', function( $location, $taxonomy ) {
	return $location;
});
```

### 7. Filter to change the Review Editor’s choice text

```
/**
 * Filter to change review editor's choice text
 *
 * @param string $text Default Editor's choice.
 */
add_filter( 'rank_math/review/text', function( $text ) {
	return $text;
});
```

### 8. Filter to change the Review Snippet HTML

```
/**
 * Filter to change review snippet HTML
 *
 * @param string $html.
 */
add_filter( 'rank_math/snippet/html', function( $html ) {
	return $html;
});
```

### 9. Filter to remove Schema Data from Posts

```
/**
 * Filter to remove Schema Data from Posts.
 * Replace $schema_type with schema name like article, review, etc.
 * @param bool  $value true/false Default false
 * @param array $parts Post Data
 * @param array $data  Schema Data
 * 
 * @return bool
 */
add_filter( "rank_math/snippet/rich_snippet_{$schema_type}", function( $value, $parts, $data ) {
 return true;
}, 10, 3 );
```

### 10. Filter to change Post’s Front-end Schema data

```
/**
 * Filter to change the schema data.
 * Replace $schema_type with schema name like article, review, etc.
 * @param array $entity Snippet Data
 * @return array
 */
add_filter( "rank_math/snippet/rich_snippet_{$schema}_entity", function( $entity ) {
 return $entity;
});
```

### 11. Add Brand Name for Products

```
/**
 * Filter to add Brand Name for Products.
 *
 * @param array $entity Snippet Data
 * @return array
 */
add_filter( 'rank_math/snippet/rich_snippet_product_entity', function( $entity ) {
    $entity['brand']['@type'] = 'Brand';    
    $entity['brand']['name'] = 'Rank Math';
    return $entity;
});
```

### 12. Filter to remove `worksFor` property from the Post Author Schema

This filter is helpful when you have guest writers.

```
add_filter( 'rank_math/json_ld', function( $data, $jsonld ) {
    if ( ! isset( $data['ProfilePage'] ) ) {
        return $data;
    }
    global $post;
    $author_id = is_singular() ? $post->post_author : get_the_author_meta( 'ID' );
    if ( in_array( intval( $author_id ), [ 1, 2, 3 ], true ) ) {     unset($data['ProfilePage']['worksFor']); }
    return $data;
}, 99, 2);
```

### 13. Filter to Change the Shortcode Content

```
/**
 * Filter to change the rank_math_rich_snippet shortcode content.
 *
 * @param string $shortcode_html
 */
add_filter( 'rank_math/snippet/html', function( $shortcode_html ) {
	return $shortcode_html;
} );
```

### 14. Filter to remove `worksFor` from the Author Entity

If the post author is not working for your company or is a guest author, then use this filter to remove `worksFor` attribute from the Author entity.

```
/**
 * Filter to remove worksFor from the Author Entity.
 */
add_filter( 'rank_math/json_ld', function( $data, $jsonld ) {
    if ( ! isset( $data['ProfilePage'] ) ) {
        return $data;
    }
    global $post;
    $author_id = is_singular() ? $post->post_author : get_the_author_meta( 'ID' );
    if ( in_array( $author_id, [ 1, 2, 3 ], true ) ) {
        unset($data['ProfilePage']['worksFor']);
    }
    return $data;
}, 99, 2);
```

### 15. Filter to change the Attachment title of the video thumbnail

```
/**
 * Filter the attachment title of the video thumbnail.
 *
 * @param string $attachment_title The attachment title of the video thumbnail.
 * @param array  $data             The video data.
 * @param object $post             The post object.
 */
add_filter('rank_math/schema/video_thumbnail_attachment_title', function ($attachment_title, $data, $post) {
    return $attachment_title;
}, 10, 3 );
```

### 16. Filter to change the Filename of the video thumbnail

```
/**
 * Filter the filename of the video thumbnail.
 *
 * @param string $filename The filename of the video thumbnail.
 * @param array  $data     The video data.
 * @param object $post     The post object.
 */
add_filter('rank_math/schema/video_thumbnail_filename', function ($filename, $data, $post) {
    return $filename;
}, 10, 3 );
```

### 17. Filter to change the Pros and Cons labels

```
/**
 * Filter: Allow changing the Pros & Cons labels.
 *
 * @param array $labels {
 *  @type string $pros Pros label.
 *  @type string $cons Cons label.
 * }
 */
add_filter( 'rank_math/schema/review_notes_labels', function( $labels ) {
	return $labels;
});
```

### 18. Filter to change the nested blocks to be parsed

```
/**
 * Filter: 'rank_math/schema/nested_blocks' - Allows filtering for nested blocks.
 *
 * @param array $data  Array of JSON-LD data.
 * @param array $block The block.
 */
add_filter('rank_math/schema/nested_blocks', function( $nested ) {
    return $nested;
});
```

### 19. Filter to change the content of Rank Math Blocks

Ensure that you change the `$block` variable in the below filter to specific blocks to `howto`, `faq`, etc

```
**
 * Filter to change the output of Rank Math Block.
 *
 * @param string $output        Output of the Block.
 * @param array  $block_content Original block content before it is escaped.
 * @param array  $attributes    Attributes of the Block.
 */
add_filter( 'rank_math/schema/block/$block/content', function ( $output, $block_content, $attributes ) {
	return $output;
}, 10, 3 );
```

Here’s how to use the filter for TOC Block.

```
/**
 * Filter to change the output of TOC Block.
 *
 * @param string $output        Output of the TOC Block.
 * @param string $block_content Unescaped Block content.
 * @param array  $attributes    Attributes of the HowTo Schema Block.
 */
add_filter( 'rank_math/schema/block/toc/content', function ( $output, $block_content, $attributes ) {
	return $output;
}, 10, 3 );
```

### 20. Filter to Disable SearchAction Schema

```
/**
 * Filter to disable SearchAction Schema
 *
 */
add_filter( 'rank_math/json_ld/disable_search', '__return_true' );
```

### 21. Filter to Remove Global Schema Entities

```
/**
 * Filter to remove the Global Schema Entities.
 *
 * @param   string  $value    The original Global Schema Entities.
 * @return  string            The filtered Global Schema Entities.
 */
add_filter( 'rank_math/schema/add_global_entities', function( $value ) {
	
    if ( is_singular() ) {
		return false;
	}

	return $value;
} );
```

## SEO Score

### 1. Filter to change parameters for the Front End SEO Score output.

```
/**
 * Filter to change parameters for the Front End SEO Score output.
 * Available parameters are: 'template', 'backlink', 'post_id', 'class'.
 *
 * @param array $args Parameters array.
 * @return array
 */
add_filter( "rank_math/frontend/seo_score/args", function( $args ) {
 return $args;
});
```

### 2. Filter to change HTML output for the Front End SEO Score function.

```
/**
 * Filter to change HTML output for the Front End SEO Score function.
 *
 * @param string $html HTML output.
 * @param array $args Function parameters.
 * @param string $score calculated SEO score.
 * @return string
 */
add_filter( "rank_math/frontend/seo_score/html", function( $html, $args, $score ) {
 return $html;
}, 10, 3);
```

### 3. Filter to change the backlink inside the Front End SEO Score output.

```
/**
 * Filter to change the backlink inside the Front End SEO Score output.
 *
 * @param string $backlink Backlink HTML.
 * @return string
 */
add_filter( "rank_math/frontend/seo_score/backlink", function( $backlink ) {
 return $backlink;
});
```

### 4. Filter to hide SEO score

```
/**
 * Filter to hide SEO Score
 */
add_filter( 'rank_math/show_score', '__return_false' );
```

## Redirections

### 1. Change number of redirections to process at once

```
/**
 * Allow developers to change number of redirections to process at once.
 *
 * @param int $number
 */
add_filter( 'rank_math/redirections/pastedContent', function( $number ) {
	return $number;
});
```

### 2. Filter to disable appending the query string in the redirection URL

```
/**
 * Disable appending the query string in the redirection URL.
 *
 * @param bool 	$value 		Enable or disable appending the query string.
 * @param array $matched	Matched redirection.
 */
add_filter( 'rank_math/redirection/add_query_string', function($value, $matched) {
	return false;
}, 10, 2 );
```

### 3. Filter to disable custom product redirection

Use this filter to disable custom product redirection when the option [Remove base](https://rankmath.com/kb/general-settings/#remove-base) or [Remove category base](https://rankmath.com/kb/general-settings/#remove-category-base) is enabled for WooCommerce products.

```
/**
 * Filter to disable custom product redirection.
 */
add_filter( 'rank_math/woocommerce/product_redirection', '__return_false' );
```

### 4. Filter to strip leading slashes for Regex redirections

```
/**
 * Filter to strip leading slashes for Regex redirections
 */
add_filter( 'rank_math/redirection/get_clean_pattern', function( $cleaned, $pattern, $comparison ) {
	if ( $comparison === 'regex' ) {
		$cleaned = '@' . stripslashes( ltrim( $pattern, '/' ) ) . '@';
	}
	return $cleaned;
}, 10, 3 );
```

## AI Link Genius

### 1. Filter to Enable or Disable the Keyword Maps Autolinking Globally

```
/**
 * Allow developers to enable or disable the Keyword Maps auto-linking feature globally.
 *
 * @param bool $enabled Whether auto-linking is enabled. Default true.
 *
 */
add_filter( 'rank_math/link_genius/auto_link_enabled', function( $enabled ) {
    return $enabled;
} );
```

### 2. Filter to Select Post Types for Keyword Maps Autolinking

```
/**
 * Allow developers to filter which post types support Keyword Maps auto-linking.
 * By default, all publicly accessible post types are included.
 *
 * @param array $post_types Array of post type slugs that support keyword maps.
 *
 */
add_filter( 'rank_math/keyword_maps/supported_post_types', function( $post_types ) {
    return $post_types;
} );
```

### 3. Filter to Choose Gutenberg Blocks for Automatic Link Insertion

```
/**
 * Allow developers to control which Gutenberg block types allow automatic link insertion.
 *
 * @param array $safe_block_types Array of block type names. Default: [ 'core/paragraph', 'core/heading' ].
 *                                Must use exact parse_blocks() format, e.g. 'core/paragraph' not 'paragraph'.
 *
 */
add_filter( 'rank_math/link_genius/keyword_maps/safe_block_types', function( $safe_block_types ) {
    return $safe_block_types;
} );
```

### 4. Filter to Enable to Disable Link Audit Status check for a post

```
/**
 * Allow developers to enable or disable Link Audit status checking on post save.
 *
 * @param bool  $should_queue      Whether to queue links for status checking. Default true.
 * @param int   $post_id           ID of the post being saved.
 * @param array $link_data_for_queue Array of link data that would be queued.
 *
 */
add_filter( 'rank_math/link_genius/queue_links_on_save', function( $should_queue, $post_id, $link_data_for_queue ) {
    return $should_queue;
}, 10, 3 );
```

### 5. Filter to Change the HTTP Request Timeout Duration

```
/**
 * Allow developers to change the HTTP request timeout for the Link Status Crawler.
 *
 * @param int $timeout Timeout in seconds per URL check. Default 5.
 *
 */
add_filter( 'rank_math/link_genius/crawler_request_timeout', function( $timeout ) {
    return $timeout;
} );
```

### 6. Filter to change the number of items processed per background job

This filter allows developers to change the number of items processed per background job for any Link Genius background operation. Replace `{$operation}` with the specific operation name from the table below.

| {$operation} | Unit Processed | Default | Section |
|---|---|---|---|
| preview | links | 100 | Bulk Update |
| bulk_delete | posts | 10 | Bulk Update |
| bulk_delete_fetch | links | 1000 | Bulk Update |
| bulk_mark_safe | links | 50 | Bulk Update |
| bulk_mark_safe_fetch | links | 1000 | Bulk Update |
| bulk_restore | posts | 10 | Bulk Update |
| regenerate | posts | 200 | Regeneration |
| export | records | 5000 | Export |

```
/**
 * Allow developers to change the chunk size for a Link Genius background operation.
 *
 * @param int $chunk_size Number of items (posts or links depending on operation) to process per job.
 *
 */
add_filter( 'rank_math/link_genius/{$operation}_chunk_size', function( $chunk_size ) {
    return $chunk_size;
} );
```

**Note:** The `fetch` variants (`bulk_delete_fetch`, `bulk_mark_safe_fetch`) control how many links are loaded from the database per cursor iteration. Larger values reduce query count but increase memory usage.

### 7. Filter to change the maximum number of records exported synchronously

This filter would allow developers to change the maximum number of records exported synchronously (without background processing). Exports exceeding this limit are processed in the background.

```
/**
 * Allow developers to change the maximum number of records for immediate (synchronous) export.
 *
 * @param int $limit Maximum number of records for immediate export. Default 1000.
 *
 */
add_filter( 'rank_math/link_genius/export_limit', function( $limit ) {
    return $limit;
} );
```

### 8. Filter to change the maximum number of candidate posts for AI Link Suggestions

This filter would allow developers to change the maximum number of candidate posts considered when building the similarity pool for AI link suggestions.

```
/**
 * Allow developers to change the maximum number of candidate posts in the AI link suggestions pool.
 *
 * @param int $target_limit Maximum number of candidate posts. Default 100.
 *
 */
add_filter( 'rank_math/ai_link_suggestions/target_limit', function( $target_limit ) {
    return $target_limit;
} );
```

### 9. Filter to change the maximum number of top-ranked candidates for AI Link Suggestions

This filter would allow developers to change the maximum number of top-ranked candidates kept for AI refinement during link suggestion processing.

```
/**
 * Allow developers to change the number of top candidates passed to AI refinement for link suggestions.
 *
 * @param int $top_limit Maximum number of top candidates to keep. Default 20.
 *
 */
add_filter( 'rank_math/ai_link_suggestions/top_candidates_limit', function( $top_limit ) {
    return $top_limit;
} );
```

### 10. Filter to Modify the Related Posts Results

```
/**
 * Allow developers to modify the Related Posts results before they are returned.
 *
 * @param array $results  Array of related post results.
 * @param int   $post_id  ID of the source post.
 * @param array $args     Arguments used to fetch results.
 *
 */
add_filter( 'rank_math/content_ai/related_posts/results', function( $results, $post_id, $args ) {
    return $results;
}, 10, 3 );
```

### 11. Filter to change the maximum character length of post content for Related Posts Comparison

This filter would allow developers to change the maximum character length of post content used for Related Posts similarity comparison.

```
/**
 * Allow developers to change the maximum text length used for Related Posts similarity comparison.
 *
 * @param int $max_len  Maximum number of characters. Default 20000.
 * @param int $post_id  ID of the post being compared.
 *
 */
add_filter( 'rank_math/content_ai/related_posts/target_text_max_length', function( $max_len, $post_id ) {
    return $max_len;
}, 10, 2 );
```

### 12. Filter to Modify the Final HTML Output of Related Posts Gutenberg Block

```
/**
 * Allow developers to modify the Related Posts block HTML output.
 *
 * @param string $output     Rendered HTML output of the block.
 * @param array  $items      Array of related post items.
 * @param array  $attributes Block attributes from the editor.
 *
 */
add_filter( 'rank_math/content_ai/related_posts/block_output', function( $output, $items, $attributes ) {
    return $output;
}, 10, 3 );
```

### 13. Filter to Modify the Final HTML Output of the `[rank_math_related_posts]` shortcode

```
/**
 * Allow developers to modify the Related Posts shortcode HTML output.
 *
 * @param string $output Rendered HTML output of the shortcode.
 * @param array  $items  Array of related post items.
 * @param array  $atts   Shortcode attributes.
 *
 */
add_filter( 'rank_math/content_ai/related_posts/shortcode_output', function( $output, $items, $atts ) {
    return $output;
}, 10, 3 );
```

## Gutenberg

### 1. Filter to disable Rank Math Integration from the Gutenberg Sidebar

Use this filter to remove Rank Math integration from the Gutenberg Sidebar and add old meta boxes below the content area.

```
/**
 * Disable Gutenberg Sidebar Integration
 */
add_filter( 'rank_math/gutenberg/enabled', '__return_false' );
```

### 2. Filter to add meta keys for enqueueing data in the Gutenberg

```
/**
 * Filter to add meta keys for enqueueing data in the Gutenberg
 */
add_filter( 'rank_math/metabox/{$type}/meta_keys', function( $keys ) {
	$keys['facebookTitle'] = 'facebook_title';
	return $args;
} );
```

When using this meta key, please prefix it with `rank_math_`

### 3. Filter to add metadata for enqueueing for Gutenberg use

```
/**
 * Filter to add metadata for enqueueing for Gutenberg use
 */
add_filter( 'rank_math/metabox/{$type}/values', function( $values, $screen ) {
	$object_id   = $screen->get_object_id();
	$object_type = $screen->get_object_type();
	$values['videoSitemap'] = [
		'robots'       => $screen->get_meta( $object_type, $object_id, 'rank_math_news_sitemap_robots' ),
		'genres'       => $screen->get_meta( $object_type, $object_id, 'rank_math_news_sitemap_genres' ),
		'keywords'     => $screen->get_meta( $object_type, $object_id, 'rank_math_news_sitemap_keywords' ),
		'stockTickers' => $screen->get_meta( $object_type, $object_id, 'rank_math_news_sitemap_stock_tickers' ),
	];
	return $values;
} );
```

`$type` can be post, term, and user.

## Elementor

### 1. Filter to remove SEO Tab in Elementor Editor

```
/**
 * Filter to hide SEO Tab in the Elementor Editor.
 */
add_filter( 'rank_math/elementor/add_seo_tab', '__return_false' );
```

## Divi

### 1. Filter to remove SEO Tab in Divi Editor

```
/**
 * Filter to hide SEO Tab in the Divi Editor.
 */
add_filter( 'rank_math/divi/add_seo_tab', '__return_false' );
```

## Misc

### 1. Filter to change redirect_url of Redirect attachment to its parent post

```
/**
 * Redirect the attachment to its parent post.
 *
 * @param string $redirect URL as calculated for redirection.
 */
add_filter( 'rank_math/frontend/attachment/redirect_url', function( $redirect ) {
	return $redirect;
});
```

### 2. Filter to remove the nofollow rel tag from RSS links

```
/**
 * Let developers determine hether or not to add rel="nofollow" to the links added by Rank Math to the RSS feed. This defaults to true.
 *
 * @param bool $unsigned To allow or not to follow the links in RSS feed, defaults to true.
 */
		add_filter( 'rank_math/frontend/rss/nofollow_links', '__return_false' );
```

### 3. Filter to allow RSS footer to be dynamically shown/hidden in an RSS feed item

```
/**
 * Show or hide the RSS footer dynamically.
 *
 * @param bool   $show_embed Whether RSS footer should be shown or not.
 * @param string $context    Indicated the context of the RSS content - whether 'full' or 'excerpt'.
 */
add_filter( 'rank_math/frontend/rss/include_footer', function( $bool, $context) {
	return $bool;
});
```

### 4. Filter to add/remove content before RSS feed item.

```
/**
 * Filter code to change content before RSS feed item
 *
 * @param string $content The content set in Settings.
 */
add_filter( 'rank_math/frontend/rss/before_content', function( $content ) {
	return $content ;
});
```

### 5. Filter to add/remove content after RSS feed item.

```
/**
 * Filter code to change content after RSS feed item
 *
 * @param string $content The content set in Settings.
 */
add_filter( 'rank_math/frontend/rss/after_content', function( $content ) {
	return $content ;
});
```

### 6. Filter to remove rel=”noopener” from external links.

```
/**
 * Filter code to remove noopener rel from external links.
 */
add_filter( 'rank_math/noopener', '__return_false');
```

### 7. Filter to disable primary term feature.

```
/**
 * Filter to allow disabling of the primary term feature.
 *
 * @param bool $return True to disable.
 */
add_filter( 'rank_math/admin/disable_primary_term', '__return_true' );
```

### 8. Filter to remove `?replytocom` query parameters from URLs

```
/**
 * Filter: 'rank_math_remove_reply_to_com' - Allow or disable the Rank Math feature that removes `?replytocom` 
 * query parameters from URLs.
 * @param bool $return True to remove, false not to remove.
 */
add_filter( 'rank_math/frontend/remove_reply_to_com', '__return_false');
```

### 9. Filter to remove Blog Snippet on homepage

```
/**
 * Filter: Remove/modify schema data.
 *
 * @param array $return Array of json-ld data.
 */
add_filter( 'rank_math/json_ld', function( $data, $json ) {
	if ( is_home() && isset( $data['Blog'] ) ) { // Remove Blog Snippet from homepage.
		unset( $data['Blog'] );
	}
	return $data;
}, 10, 2 );
```

### 10. Filter to prevent Rank Math from changing admin_footer_text

```
/**
 * Filter: Prevent Rank Math from changing admin_footer_text.
 */
add_action( 'rank_math/whitelabel', '__return_true');
```

### 11. Remove noopener attribute based on a domain

```
/**
 * Filter to add/remove noopener attribute based on a domain.
 * 
 * @param string $domain The domain in question.
 * 
 * @return boolean
 */
add_filter( 'rank_math/noopener/domain', function( $domain ) {
	$exclude = [
		'github.com',
		'google.com',
	];

	if ( in_array( $domain, $exclude ) ) {
		return false;
	}

	return true;
});
```

### 12. Remove `target_blank` attribute based on domain

```
/**
 * Filter to add/remove target_blank attribute based on a domain.
 * 
 * @param string $domain The domain in question.
 * 
 * @return boolean
 */
add_filter( 'rank_math/target_blank/domain', function( $domain ) {
	$exclude = [
		'github.com',
		'google.com',
	];

	if ( in_array( $domain, $exclude ) ) {
		return false;
	}

	return true;
});
```

### 13. Remove everything related to Rank Math from Database

```
/**
 * Filter to remove Rank Math data from the database
 */
add_filter( 'rank_math_clear_data_on_uninstall', '__return_true' );
```

- Add above code in the theme’s `functions.php` file (the above code will not work in the `rank-math.php` file)

- Deactivate and delete the Rank Math plugin

### 14. Filter to customize the Search URL for Sitelinks Searchbox

```
/**
 * Allows filtering of the search URL.
 *
 * @param string $search_url The search URL for this site with a `{search_term_string}` variable.
 */
add_filter( 'rank_math/json_ld/search_url',  function( $url ) {
    return $url;
});
```

### 15. Filter to add plugins to the Table of Contents List

```
/**
 * Filter to add plugins to the TOC list.
 *
 * @param array TOC plugins.
 */
add_filter( 'rank_math/researches/toc_plugins', function( $toc_plugins ) {
       $toc_plugins['plugin-directory/plugin-filename.php'] = 'Plugin Name';
    return $toc_plugins;
});
```

### 16. Filter to remove `rank-math-link` class from the frontend content links

```
/**
 * Filter to remove `rank-math-link` class from the frontend content links
 */
add_filter( 'rank_math/link/remove_class', '__return_true' );
```

### 17. Filter to hide Analytics Stats Bar from the frontend

```
/**
 * Filter to hide Analytics Stats bar from the frontend
 */
add_filter( 'rank_math/analytics/frontend_stats', '__return_false' );
```

### 18. Filter to create Analytics debug log

```
/**
 * Filter to create Analytics debug.log file
 */
add_filter( 'rank_math/analytics/log_response', '__return_true' );
```

### 19. Filter to modify the content passed to the Link Counter

```
/**
 * Filter to modify the content passed to the Link Counter.
 *
 * @param string $content Post content.
 * @param int    $post_id Post ID.
 */
add_filter( 'rank_math/links/content', function ( $content, $post_id) {
	return $content;
}, 10, 2 );
```

### 20. Filter to prevent Link Counter from processing the post

```
/**
 * Filter to prevent processing the post.
 *
 * @param boolean $value Whether to process the post.
 * @param WP_POST $post  The Post object.
 */
add_filter( 'rank_math/links/process_post', function( $value, $post ) {
    return false;
}, 10, 2 );
```

### 21. Filter to allow editing robots.txt & htaccess data

This filter lets you allow/disallow editing robots.txt and htaccess from Rank Math General Settings regardless of the value set for the `DISALLOW_FILE_EDIT` and `DISALLOW_FILE_MODS`.

```
/**
 * Allow editing the robots.txt & htaccess data.
 *
 * @param bool Can edit the robots & htacess data.
 */

add_filter( 'rank_math/can_edit_file', '__return_true' );
```

### 22. Filter to remove nofollow tag from specific external links

**Note:** This filter works only for nofollow tags added [using Rank Math](https://rankmath.com/kb/nofollow-specific-external-links/) or not for manually added tags.

```
/**
 * Allow developers to remove nofollow tag from specific external links
 *
 * @param $add_no_follow bool Should add no follow attribute.
 * @param string $href The URL string for the external link.
 */
add_filter('rank_math/nofollow/url', function ( $add_no_follow, $href ) {
    if ( $href === 'https://wordpress.org/gutenberg/') { // maybe in_array compare
        return false;
    }
    return $add_no_follow;
}, 10, 2);
```

### 23. Filter to disable cache used in the plugin

```
/**
 * Filter to disable cache used in the plugin.
 */
add_filter( 'rank_math/cache/enabled', '__return_false' );
```

### 24. Filter to Modify Rank Math JSON data

```
/**
 * Filter to modify Rank Math JSON data.
 */
add_filter( 'rank_math/json_data', function( $data ) {
	$data['testing'] = wp_create_nonce( 'rank-math' );
	return $data;
} );
```

### 25. Filter to update the hook used for monitoring 404 pages

If you’re using plugins like Elementor or others to create custom 404 templates, then use this filter to update the hook accordingly to enable Rank Math to monitor these custom 404 pages.

```
/**
 * Filter to update the hook used for monitoring 404 pages
 */
add_filter( 'rank_math/404_monitor/hook', function($hook ){
    return 'template_redirect'; //change to your preferred hook
});
```

### 26. Filter to exclude a specific post from llms.txt file

```
/**
 * Filter to Exclude a Specifc Post from llms.txt file
 *
 * @param  array $args  WP_Query arguments
 */
add_filter( 'rank_math/llms_txt/posts_query_args', function( $args ) {
	$args['post__not_in'] = [ 1 ]; // Excludes the post with ID 1
	return $args;
} );
```

### 27. Filter to update the list of posts to be included in the llms.txt file

```
/**
 * Filter to Update the list of posts to be included in llms.txt file
 *
 * @param  array $posts Posts array
 * @param  array $args  WP_Query arguments
 */
add_filter( 'rank_math/llms_txt/posts', function( $posts, $args ) {
   return $posts;
}, 10, 2 );
```

### 28. Filter to update the list of terms to be included in the llms.txt file

```
/**
 * Filter to Update the list of terms to be included in llms.txt file
 *
 * @param  array $terms Terms array
 * @param  array $args  WP_Query arguments
 */
add_filter( 'rank_math/llms_txt/terms', function( $terms, $args ) {
   return $terms;
}, 10, 2 );
```

### 29. Filter to edit the additional content in the llms.txt file

```
/**
* Filter the additional content to be included in llms.txt file
*
* @param string $extra Extra content
*/
add_filter( 'rank_math/llms_txt/extra_content', function( $extra) {
   return $extra;
});
```

And, that’s it! We hope the article was helpful in taking advantage of the various filters and hooks available with Rank Math. If you’ve any questions or need any help in using these filters, please feel free to get in touch with our [support team directly from here](https://rankmath.com/support/), and we’re always here to help.

			

			 

			
	
		
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

										
			
- [How to Make Your Theme Rank Math Compatible](https://rankmath.com/kb/make-theme-rank-math-compatible/)

										
			
- [How to Enable Headless CMS Support in Rank Math?](https://rankmath.com/kb/headless-cms-support/)

										
			
- [How to Skip Rank Math Registration for Development Purposes](https://rankmath.com/kb/skip-rank-math-registration/)