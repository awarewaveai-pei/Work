# How to Make Your Theme Rank Math Compatible

> **Category:** Developers
> **Source:** https://rankmath.com/kb/make-theme-rank-math-compatible/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Make Your Theme Rank Math Compatible

			
			

	

WordPress theme authors can offer native compatibility for Rank Math and deliver a search engine optimized theme for users or customers.

SEO is an ever-important subject, and there is no escaping the fact that **organic traffic is very cost-effective and long-lasting** than any other form of traffic. That is why websites that rely more on organic traffic create a growing business.

Website owners know that SEO is important, and that is why they will always **choose an SEO-friendly theme over a generic theme** that only concentrates on the design.

Creating an SEO-friendly theme does not have to be exhausting. Rank Math has made it extremely simple for theme authors to concentrate on design and options while **we handle the nitty-gritty of SEO**.

By making your theme compatible with Rank Math, you are ensuring that you stand out from the crowd by handing off the SEO stuff to the **fastest-growing SEO plugin for WordPress**. We offer a ton of features for free, and a compatible theme would make the value proposition a no-brainer for your prospective users/customers.

We’ve curated a list of WordPress themes that come with native compatibility for Rank Math, and you can [find them here](https://rankmath.com/compatible/themes/).

If you’re are a WordPress theme author/developer, in this knowledgebase article, we’ll discuss all the features and filters available to help you make your WordPress theme compatible with Rank Math.

## Table of Contents

- [Dedicated rank-math.php File](#rank-math-php-file)

- [Theme Support for Breadcrumbs](#breadcrumbs-theme-support)

- [Content Analysis API](#content-analysis-api)

- [Filters Available to Integrate with Your Theme](#available-filters)

- [Final Words — Achieve Rank Math Compatibility](#final-words)

## 1  Dedicated rank-math.php File

Rank Math has got dedicated API that lets you extend the functionality/customize according to your theme. We’ll cover a number of useful filters and hooks shortly in this article. You can add these filters in a dedicated rank-math.php file at the root of your theme folder.

We recommend adding them to this dedicated file so that we can ensure all these added functions run exactly when they are needed. When the user installs the Rank Math plugin on their website, we will look for the presence of the rank-math.php file in the active theme’s folder and execute the code. So you don’t need to run all these functions when the plugin is not installed and can avoid any conflict with other plugins installed on the user’s website.

Here is a [sample rank-math.php](https://github.com/rankmath/seo-by-rank-math/blob/eea089f0afe7f476d1f9dadc1a9f75377373d282/rank-math.php) file for your reference.

## 2  Theme Support for Breadcrumbs

Rank Math includes a feature that allows users to add breadcrumbs and the corresponding Breadcrumb Schema. Having said that, if your WordPress theme also includes breadcrumbs, then there are chances for conflicts when users activate the Rank Math feature.

To prevent such conflicts, Rank Math allows theme authors to register theme support for Rank Math breadcrumbs.

To register theme support for Rank Math breadcrumbs, add the following code to your [rank-math.php](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file) file. Alternatively, you can attach it to the hook `after_setup_theme`.

```
/**
 * Register theme support for Rank Math breadcrumbs
 */
add_theme_support( 'rank-math-breadcrumbs' );
```

Once you’ve registered the theme support, you can add the following piece of code where you want to display Rank Math breadcrumbs when available.

```
/**
 * Use the following code in your theme template files to display breadcrumbs:
 */
<?php if (function_exists('rank_math_the_breadcrumbs')) rank_math_the_breadcrumbs(); ?>
```

When a theme comes with native support for our breadcrumbs feature, end-users don’t have to make changes to their theme’s files to get the breadcrumbs to show up on the front-end, as the theme already includes the code. It also means that users will not be able to disable the breadcrumbs function under **WordPress Dashboard → Rank Math SEO → General Settings → Breadcrumbs**.

![Enable breadcrumbs feature with theme support](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202032%20720'%3E%3C/svg%3E)

Only the option to enable/disable the breadcrumbs function will not be available for users. At the same time, they can still take advantage of all the other editing options that Rank Math offers for breadcrumbs. Here is the list of [breadcrumbs options](https://rankmath.com/kb/breadcrumbs/#breadcrumbs-options) that Rank Math users can take advantage of.

## 3  Content Analysis API

Rank Math has a lot of content analysis tests where we go through the content added using posts/pages/CPTs and assign a [score out of 100 to the content](https://rankmath.com/kb/score-100-in-tests/). By default, we can read the content added using WP editor, ACF, or any of the [supported page builders](https://rankmath.com/compatibility/?s=page+builder&post_type=rm_compatible).

When your theme uses shortcodes and custom fields, you can let Rank Math know more about it to include them as a part of the content analysis.

This helps us offer more relevant suggestions for users to optimize their posts for search engines. We have a dedicated [knowledgebase article on our content analysis API](https://rankmath.com/kb/content-analysis-api/) to integrate your custom fields and other data to analyze with Rank Math.

## 4  Filters Available to Integrate with Your Theme

As we mentioned earlier, we’ve filters and hooks for developers to extend the feature / customize them according to their product. Let us look at some of the filters that would be more useful for theme authors to implement and offer users better control over Rank Math.

### 4.1  To Change the Focus Keyword Limit

Rank Math by default allows users to add up to **5 focus keywords per post**. If you wish to increase or decrease the maximum number of focus keywords that can be added in the single post or page editor, then you can use this filter.

**Note:** Rank Math PRO users can already add [unlimited focus keywords](https://rankmath.com/kb/what-is-a-focus-keyword/), and this filter will not restrict the number of keywords for PRO users.

```
/**
 * Change the Focus Keyword Limit
 */
add_filter( 'rank_math/focus_keyword/maxtags', function() {
    return 10; // Number of Focus Keywords. 
});
```

### 4.2  To Add/Update/Remove Content Analysis Test

You can extend the following filter to add a new test or update an existing test. You can also remove specific tests. This is especially helpful if some of the content analysis tests do not apply to content or CPTs that your theme adds. For example, a testimonial CPT usually has limited content, and so it makes little sense to check for the presence of a Table of Contents or whether or not the content comprises a certain number of words. In this case, you would ideally disable the [contentHasTOC](https://rankmath.com/kb/score-100-in-tests/#table-of-contents) and [lengthContent](https://rankmath.com/kb/score-100-in-tests/#overall-content-length) test among others.

```
/**
 * Allow developers to modify the test or score.
 *
 * @param array  $tests Array of tests with score
 * @param string $type  Object type. Can be post, user or term.
 */
add_filter( 'rank_math/researches/tests', function( $tests, $type ) {
 return $tests;
}, 10, 2 );
```

The object `$type` could be post, user, or term.

Here is the complete list of tests available in the array `$tests`. You can add or update the tests, and for removing any tests, you can simply unset the test [as shown in this tutorial](https://rankmath.com/kb/disable-seo-content-tests/).

| contentHasTOC | keywordInContent | linksHasInternal |
|---|---|---|
| contentHasShortParagraphs | keywordInSubheadings | linksHasExternals |
| contentHasAssets | keywordInImageAlt | linksNotAllExternals |
| keywordInTitle | keywordDensity | titleStartWithKeyword |
| keywordInMetaDescription | keywordNotUsed | titleSentiment |
| keywordInPermalink | lengthContent | titleHasPowerWords |
| keywordIn10Percent | lengthPermalink | titleHasNumber |
| isReviewEnabled | hasContentAI | hasProductSchema |

You can also unset multiple tests with this filter, as shown below.

```
add_filter( 'rank_math/researches/tests', function( $tests, $type ) {
	unset(
		$tests['titleHasNumber'],
		$tests['contentHasTOC'],
		$tests['titleSentiment'],
		$tests['titleHasPowerWords']
	);
    return $tests;
}, 10, 2 );
```

### 4.3  Add Default Value for General Settings During Plugin Installation

This filter lets you set the default values for [Rank Math General Settings](https://rankmath.com/kb/general-settings/) when users install Rank Math on their website. By preconfiguring SEO settings, you can ensure **your themes are SEO-ready** and your customers can get started in no time. You can refer to the options and [default values here](https://github.com/rankmath/seo-by-rank-math/blob/eea089f0afe7f476d1f9dadc1a9f75377373d282/includes/class-installer.php#L319).

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

Here is a quick example to use the filter for setting default values in General Settings.

```
add_filter('rank_math/settings/defaults/general', function ($settings) {
	$settings['strip_category_base']     = 'on';
	$settings['nofollow_external_links'] = 'on';
	$settings['nofollow_image_links']    = 'on';
	return $settings;
});
```

### 4.4  Add Default Value for SEO Titles & Meta Settings During Plugin Installation

Similar to the previous filter, you can set up the default values for [Titles & Meta Settings](https://rankmath.com/kb/titles-and-meta/) when Rank Math is installed. If your theme registers custom post types for implementing some of your features, then you can preconfigure SEO Titles & Meta settings with this filter. Refer to the [options and default values here](https://github.com/rankmath/seo-by-rank-math/blob/eea089f0afe7f476d1f9dadc1a9f75377373d282/includes/class-installer.php#L381).

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

The following example gives you a glimpse of using this filter to set default values for SEO Titles & Meta settings.

```
add_filter('rank_math/settings/defaults/titles', function ($settings) {
	$settings['noindex_empty_taxonomies'] = 'on';
	$settings['capitalize_titles'] = 'on';
	$settings['url_author_base'] = 'members';
	return $settings;
});
```

To change the defaults for your custom post types, use the filter as shown below:

```
add_filter('rank_math/settings/defaults/titles', function ($settings) {
	$post_type                                       = 'post'; // Change post type
	$settings['pt_' . $post_type . '_title']       	 = '%title% %sep% %sitename%';
	$settings['pt_' . $post_type . '_description']   = '%excerpt%';
	$settings['pt_' . $post_type . '_robots']        = ['index'];
	$settings['pt_' . $post_type . '_custom_robots'] = 'on';
	return $settings;
});
```

### 4.5  Add Default Value for Sitemap Settings During Plugin Installation

This filter lets you configure the default values for [Sitemap Settings](https://rankmath.com/kb/configure-sitemaps/) when Rank Math is installed by the user. Refer to the options and [default values here](https://github.com/rankmath/seo-by-rank-math/blob/eea089f0afe7f476d1f9dadc1a9f75377373d282/includes/class-installer.php#L374).

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

For setting the default values for Sitemap settings, use the filter as shown below.

```
add_filter('rank_math/settings/defaults/sitemap', function ($settings) {
	$settings['items_per_page'] = '300';
	$settings['include_images'] = 'off';
	$settings['ping_search_engines'] = 'off';
	return $settings;
});
```

You can also extend this filter to set defaults for including/excluding your custom post types from the sitemap.

```
add_filter('rank_math/settings/defaults/sitemap', function ($settings) {
	$post_type = 'post'; // change your post type here.
	$settings['pt_' . $post_type . '_sitemap']     = 'on';
	return $settings;
});
```

### 4.6  To Change the Author Base

This filter allows developers to change the URL base for author archives.

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

Please note, when the author base is configured to use this filter, the [Author Base](https://rankmath.com/kb/titles-and-meta/#author-base) set by the users under **Rank Math SEO → Titles & Meta → Authors** will not have any effect.

Let’s say if the theme showcases the team members (_holding different roles_) of an organization, then it would be more relevant to set the base to `member` instead of `author` with the following code snippet.

```
add_filter('rank_math/author_base', function ($base) {
	$base = 'member'; // Change the author base.
	return $base;
});
```

### 4.7  To Change the Address Part Format

This filter lets you change the address part format for Rank Math’s [Local SEO contact shortcode](https://rankmath.com/kb/local-seo/#contact-info-shortcode).

This shortcode will let users add their business contact info anywhere inside their website with the details configured at **Rank Math SEO → Titles & Meta →** **Local SEO**.

```
/**
 * Allow developer to change the address part format.
 *
 * @param string $parts_format String format how to output address part.
 */
add_filter( 'rank_math/shortcode/contact/address_parts_format', function ($format) {
    $format = '<span class="contact-address-%1$s">%2$s</span>'; // Default value
    return $format;
});
```

- `%1$s` is a placeholder for address tags in [Address Format](https://rankmath.com/kb/local-seo/#address-format). Available tags are: `{address}`, `{locality}`, `{region}`, `{postalcode}`, `{country}`, `{gps}`.

- `%2$s` is a placeholder that adds the value for corresponding address tags.

For instance, if you want to redesign the address part of the contact info with your custom CSS class, then use the following code snippet.

```
add_filter( 'rank_math/shortcode/contact/address_parts_format', function ($format) {
    $format = '<span class="custom-%1$s">%2$s</span>'; // Change the class
    return $format;
});
```

Now you’ll be able to change the styling with CSS classes such as `.custom-address`, `.custom-locality`, `.custom-region`, etc.

### 4.8  To Set Default Schema Type for the Post Type

This filter lets you set a default [Schema type](https://rankmath.com/kb/titles-and-meta/#rich-snippet-type) for each post type under **Rank Math SEO → Titles & Meta** settings. You can either set it to `none` for no Schema type or alternatively use one of the built-in Schema types of Rank Math.

Here is the complete list of accepted Schema type values in the free version.

| article | music | video |
|---|---|---|
| book | product | person |
| course | recipe | service |
| event | restaurant | software |
| jobposting |  |  |

And for the PRO version:

| dataset | FactCheck | movie |
|---|---|---|

```
/**
 * Allow developer to default Schema type (Snippet type) by post type.
 *
 * @param string $type      Snippet Type.
 * @param string $post_type Post type name.
 *
 */
add_filter( 'rank_math/settings/snippet/type', function( $type, $post_type ) {
 return $type;
}, 10, 2 );
```

For instance, if you’re looking to add the Course Schema type for a custom post type `online_course`, then we can easily do that with the following code snippet.

```
add_filter('rank_math/settings/snippet/type', function ($type, $post_type) {
    if ('online_course' === $post_type) {
        $type = 'course'; // Schema type.
    }
    return $type;
}, 10, 2);
```

**Note:** This filter only adds a default value, and users can override this option under **Rank Math SEO → Titles & Meta** settings.

### 4.9  To Update Variables

Rank Math offers [variables](https://rankmath.com/kb/variables-in-seo-title-description/), which is nothing but a placeholder for post data. Users can take advantage of these variables in the Titles & Meta settings, Schema, and other meta tags instead of the actual value, and Rank Math would dynamically replace the variable with the value in the front-end.

And if you wish to alter the existing variables according to your theme, then you can make use of this filter. It allows you to modify the `name`, `description`, `variable` and `example`.

```
/**
 * Filter to update variables
 */
add_filter( 'rank_math/vars/replacements', function( $vars ) {
 return $vars;
});
```

For instance, if your theme is designed for a hotel website, then instead of offering a generic title and description for the variable `%sitename%`, you can choose to modify it relating to the name of their hotel. You can achieve it with the following code snippet. Please note the variable here will still remain as `%sitename%`, but the Rank Math drop-down shows the name, description, and example exactly as we’ve configured.

```
add_filter( 'rank_math/vars/replacements', function ($vars) {
    $vars['sitename']['name']        = 'Hotel Name';
    $vars['sitename']['description'] = 'Name of the Hotel';
    $vars['sitename']['example']     = 'Beverly Hills Hotel';
    return $vars;
});
```

### 4.10  Add Extra Variables to the Rank Math Dropdown in Titles & Meta Settings

While the previous filter lets you make any changes to the existing variables, the current filter allows you to add additional variables that would appear in the Rank Math Titles & Meta settings drop-down as well as in the [Meta Box Snippet Editor](https://rankmath.com/kb/general-tab/#what-variables-are-supported). This way, you can add your theme custom fields data to variables, so your users can easily make use of them in Rank Math fields.

```
/**
 * Action: 'rank_math/vars/register_extra_replacements' - Allows adding extra variables.
 */
add_action('rank_math/vars/register_extra_replacements', function() {
		rank_math_register_var_replacement(
			'custom_variable_slug',
			array(
				'name'        => esc_html__( 'Custom variable name.', 'rank-math' ),
				'description' => esc_html__( 'Custom variable description.', 'rank-math' ),
				'variable'    => 'custom_variable_slug',
				'example'     => 'custom_variable_callback()',
			),
			'custom_variable_callback'
		);
	}
);
```

For instance, if you want to offer a variable that would display the taxonomy term count in the front-end, then you can use the following code snippet. This code snippet will allow users to make use of `%term_count%` variable in their Titles and Meta settings.

```
/**
 * Action: 'rank_math/vars/register_extra_replacements' - Allows adding extra variables.
 * Snippet to register variable that will return the number of posts in the current term
 */
add_action('rank_math/vars/register_extra_replacements', function () {
    rank_math_register_var_replacement(
        'term_count',
        array(
            'name'        => esc_html__('Term Count', 'rank-math'),
            'description' => esc_html__('Number of posts in the current term', 'rank-math'),
            'variable'    => 'term_count',
            'example'     => term_count_callback(),
        ),
        'term_count_callback'
    );
});
function term_count_callback()
{
    $term = get_queried_object();
    return isset($term) ? $term->count : null;
}
```

### 4.11  To Change Title Separator `%sep%`

This filter lets you set a [default separator](https://rankmath.com/kb/general-settings/#separator-character) that is used in the title tags. Users will also be able to use the variable `%sep%` to include the separator in meta tags or Schema fields.

```
/**
 * Filter to change Separator %sep%.
 */
add_filter('rank_math/settings/title_separator', function( $sep ) {
		return $sep;
	}
);
```

**Note:** If the separator character is set using this filter, then it will override the Separator Character set by users under **Rank Math SEO →** **Titles & Meta → Global Meta**.

Let’s say you want to change the separator only on pages, then the following code snippet can be used.

```
add_filter( 'rank_math/settings/title_separator', function ($sep) {
    if (is_singular('page')) {
        $sep = '->';
    }

    return $sep;
});
```

### 4.12  Google Analytics – Track Certain User Role Even If Exclude Logged-In Users Option Is ON

Rank Math can install analytics code when a user [connects their Google Account with Rank Math](https://rankmath.com/kb/connect-your-google-account/). In addition to that, users can choose to [Exclude logged-in users](https://rankmath.com/kb/general-settings/#exclude-logged-in-users) from tracking, to prevent internal traffic from reflecting in Google Analytics data.

But that said, if your theme involves membership features where customers and members are allowed to log in, then traffic from these users will be ignored. This filter will let you override this behaviour as you can unset specific user roles from being ignored.

```
/**
 * Filter to track user roles in GA even if Exclude Logged-in Users option is ON
 */
add_filter('rank_math/analytics/gtag_exclude_loggedin_roles', function( $roles ) {
		unset( $roles['customer'] ); // Track logged in customers.
		return $roles;
	}
);
```

### 4.13  To Exclude Post Type from the Sitemap

This filter lets you exclude post types from being added to the Rank Math Sitemap.

**Note:** This filter will override the [Include in Sitemap](https://rankmath.com/kb/configure-sitemaps/#include-in-sitemap) option available under **Rank Math SEO**→**Sitemap Settings → Post Types**.

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

For example, if you want to exclude a custom post type `orders` created by your theme from the sitemap, then you can use the following code snippet.

```
add_filter( 'rank_math/sitemap/exclude_post_type', function ($exclude, $type) {
    if ('orders' === $type) {
        $exclude = true;
    }
    return $exclude;
}, 10, 2);
```

### 4.14  To Exclude Taxonomy from Sitemap

Similar to the previous filter, the current filter allows developers to exclude tags, categories, and other custom taxonomies from Sitemap.

**Note:** This filter will override the [Include in Sitemap](https://rankmath.com/kb/configure-sitemaps/#include-in-sitemap-8) option available under **Rank Math SEO → Sitemap Settings → Taxonomies**.

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

To exclude a custom taxonomy you’ve created from the XML sitemap, let’s say, `labels` , then this filter can be used as shown below.

```
add_filter( 'rank_math/sitemap/exclude_taxonomy', function( $exclude, $type ){
    if ('labels' === $type) {
        $exclude = true;
    }
	return $exclude;
}, 10, 2 );
```

### 4.15  To Change the Breadcrumb Settings

As we mentioned earlier in this article, themes can register support for Rank Math breadcrumbs and integrate our breadcrumbs feature without conflicting with the theme’s native breadcrumbs feature.

Having said that, you can customize some of the [breadcrumb settings](https://rankmath.com/kb/general-settings/#breadcrumbs) using this filter.

**Note:** The filter will override the options selected by the user under **Rank Math SEO → General Settings → Breadcrumbs**.

```
/**
 * Filter to change breadcrumb settings.
 *
 * @param  array $settings Breadcrumb Settings.
 * @return array $setting.
 */
add_filter(
	'rank_math/frontend/breadcrumb/settings',
	function ($settings) {
		$settings = array(
			'home'            => false, // Show Homepage Link.
			'separator'       => '',    // Separator Character.
			'remove_title'    => false, // Hide Post Title.
			'hide_tax_name'   => false, // Hide Taxonomy Name.
			'show_ancestors'  => false, // Show Category(s).
			'show_blog'       => false, // Show Blog Page.
			'show_pagination' => true,
		);
		return $settings;
	}
);
```

### 4.16  To Change Breadcrumb Strings

While the previous filter was focused on breadcrumb settings, the current filter is focused on [breadcrumb strings](https://rankmath.com/kb/general-settings/#breadcrumbs) and allows you to customize them according to your theme.

**Note:** The filter will override the options selected by the user under **Rank Math SEO → General Settings → Breadcrumbs**.

```
/**
 * Filter to change breadcrumb strings.
 *
 * @param  array $settings Breadcrumb Strings.
 * @return array $strings.
 */
add_filter('rank_math/frontend/breadcrumb/strings', function ($strings) {
	$strings = array(
		'prefix'         => '', // Prefix Breadcrumb.
		'home'           => '', // Homepage label.
		'home_link'      => '', // Homepage Link.
		'error404'       => '', // 404 label.
		'archive_format' => '', // Archive Format.
		'search_format'  => '', // Search Results Format.
	);
	return $strings;
});
```

### 4.17  To Change Breadcrumb Args

This filter allows you to change the breadcrumb arguments and allows you to change the breadcrumb appearance on the front-end.

**Note:** These are not available as options for users to change inside Rank Math breadcrumb settings.

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

So, if you want to add a CSS class, say `custom-css` to Rank Math breadcrumbs, then use the following code snippet.

```
add_filter( 'rank_math/frontend/breadcrumb/args', function( $args ) {
	$args['wrap_before'] = '<nav class="rank-math-breadcrumb custom-css"><p>';
	return $args;
});
```

### 4.18  To Change the Breadcrumb HTML

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

By default, the last item of the Rank Math breadcrumbs will not be linked. If you want to include a link to the last item, then this filter can be customized as follows:

```
add_filter( 'rank_math/frontend/breadcrumb/html', function( $html, $crumbs, $class ) {
	$html = str_replace('<span class="last">'.get_the_title().'</span>', '<a href="'.get_the_permalink().'">'.get_the_title().'</a>', $html);
	return $html;
}, 10, 3);
```

### 4.19  To Change the Primary Term Output of the Breadcrumbs Class

You can make use of this filter to [change the primary term](https://rankmath.com/kb/how-to-choose-a-primary-category/) output of the breadcrumbs class dynamically on the front-end.

```
/**
 * Filter to change the primary term output of the breadcrumbs class.
 *
 * @param WP_Term $current_term Primary term.
 * @param array   $terms        Terms attached to the current post.
 */
add_filter( 'rank_math/frontend/breadcrumb/main_term', function( $current_term, $terms ) {
	return $current_term;
}, 10, 2 );
```

In case, if you want to change the casing of your primary term, let’s say the first word of the term is to be capitalized, irrespective of how the user sets it, you can extend this filter to achieve that.

```
add_filter('rank_math/frontend/breadcrumb/main_term', function ($current_term, $terms) {
    $current_term->name = ucfirst($current_term->name);
    return ($current_term);
}, 10, 2);
```

### 4.20  To Change/Remove Breadcrumb Items

This filter allows developers to make any changes or remove any breadcrumb items dynamically on the front-end.

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

The `$crumbs` here is an array of all the breadcrumb items on a specific page. For each breadcrumb item, it would store its name, URL, and if this breadcrumb item should be hidden in Schema or not.

Here is an example of `$crumbs` that shows the content of the array:

```
Array
(
    [0] => Array
        (
            [0] => Home
            [1] => https://rankmath.local
            [hide_in_schema] => false
        )

    [1] => Array
        (
            [0] => Uncategorized
            [1] => https://rankmath.local/uncategorized/
            [hide_in_schema] => false
        )

    [2] => Array
        (
            [0] => Sample Page
            [1] => https://rankmath.local/sample-page/
            [hide_in_schema] => false
        )

)
```

You can consider using this filter to change or remove any specific breadcrumb items. For instance, we would try to remove the default WordPress category ‘Uncategorized’ from the breadcrumb items by using the code as shown below.

```
add_filter('rank_math/frontend/breadcrumb/items', function ($crumbs, $class) {
    $key = array_search('Uncategorized', array_column($crumbs, '0'), true);
    if (isset($key)) {
        unset($crumbs[$key]);
        $crumbs = array_values($crumbs);
    }
    return $crumbs;
}, 10, 2);
```

**Note:** When you change/remove the breadcrumb item with this filter, the changes will also reflect in the Breadcrumb Schema.

### 4.21  To Change/Remove Breadcrumb Items from Breadcrumb Snippet

While the previous filter lets you make changes/remove items from the breadcrumbs, the current filter lets you make changes _only_ to the Breadcrumb Schema.

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

Here is an example of `$entity` that shows the content of the array.

```
Array
(
    [@type] => BreadcrumbList
    [@id] => https://rankmath.local/sample-page/#breadcrumb
    [itemListElement] => Array
        (
            [0] => Array
                (
                    [@type] => ListItem
                    [position] => 1
                    [item] => Array
                        (
                            [@id] => https://rankmath.local
                            [name] => Home
                        )

                )

            [1] => Array
                (
                    [@type] => ListItem
                    [position] => 2
                    [item] => Array
                        (
                            [@id] => https://rankmath.local/uncategorized/
                            [name] => Uncategorized
                        )

                )

            [2] => Array
                (
                    [@type] => ListItem
                    [position] => 3
                    [item] => Array
                        (
                            [@id] => https://rankmath.local/sample-page/
                            [name] => Sample Page
                        )

                )

        )

)
```

### 4.22  To Change Robots Data

You can use this filter to change robots meta added by Rank Math dynamically on the front-end. The variable `$robots` contains all the meta robots directives that are configured to be added to the page.

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

Let’s say if you want posts from preset categories like `uncategorized` to be set with `noindex` and `nofollow`, then the code snippet will look like:

```
add_filter('rank_math/frontend/robots', function ($robots) {
    global $post;

    $postInCategory = false;
    foreach ((get_the_category()) as $category) {
        if ($category->name == 'uncategorized') {
            $postInCategory = true;
            break;
        }
    }

    if ($postInCategory == true) {
        $robots['index']  = 'noindex';
        $robots['follow'] = 'nofollow';
    }

    return $robots;
});
```

### 4.23  To Change OpenGraph Type ( og:type )

You can use this filter to change the OpenGraph type for the specific page on the front-end.

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

The available `og:type` values are:

| article | music.song | video.movie |
|---|---|---|
| book | music.album | video.episode |
| profile | music.playlist | video.tv_show |
| website | music.radio_station | video.other |

By default, the `og:type` value is set to an article, but if you want your custom post type, let’s say songs to be set with the `og:type`, then this can be added as shown below.

```
add_filter('rank_math/opengraph/type', function ($type) {
    if (is_singular('songs')) {
        $type = 'music.song';
        return $type;
    }
});
```

### 4.24  To Change Specific Social Meta Tags

By using this filter, you can change specific social meta tags dynamically on the front-end. To make use of this filter, you will need to replace `{$network}` and `$og_property` of the hook with relevant values.

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

For instance, if your theme includes an option to get open graph titles for posts, then you can add them to Rank Math. In this case, we’re targeting `og:title` tag for Facebook network, so replace:

- `{$network}` – the network here is `facebook`

- `$og_property` – the OpenGraph property here is `og_title` (_The colon has to be replaced with an underscore_)

And the code snippet would look like

```
add_filter('rank_math/opengraph/facebook/og_title', function ($content) {
    if (is_singular('post')) {
        $content = get_post_meta(get_the_ID(), 'custom_og_title', true); // Replace with your post meta.
        return $content;
    }
});
```

Similarly, if you want to remove an Open Graph tag added by Rank Math, let’s say, you wish to remove the post category being added to the `article:section` tag, the following code snippet will allow you to remove it.

```
add_filter('rank_math/opengraph/facebook/article_section', function ($content) {
    if (is_singular('post')) {
        $content = '';
        return $content;
    }
});
```

### 4.25  To Extend JSON-Ld Data

The current filter lets you extend the JSON-LD Schema data of Rank Math, allowing you to add/update/remove Schema properties relevant to your theme and users. It is possible that you can even build a new Schema that isn’t part of our built-in Schema types and combine it with Rank Math’s Schema output.

Rank Math’s PRO users will be able to make similar changes to the Schema using our [Advanced Schema Editor](https://rankmath.com/kb/rich-snippets/#advanced-schema-editor-pro) and [Custom Schema Builder](https://rankmath.com/kb/schema-generator/), right within the WordPress dashboard, without requiring the use of this filter.

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

For instance, If your theme includes options that would allow users to submit their social media profiles and you wish to include them in Schema, then you can consider using the following filter. But please note, Google does not honor them anymore and can automatically identify social media profiles.

```
add_filter( 'rank_math/json_ld', function( $data, $jsonld ) {
    if ( isset( $data['publisher'] ) ) {
        $data['publisher']['sameAs'] = [
            // Replace these profiles with the user profiles
            'https://www.instagram.com/example',
            'https://www.facebook.com/example',
            'https://www.facebook.com/groups/example',
            'https://www.youtube.com/channel/example',
            'https://linkedin.com/example'
        ];
    }
    return $data;
}, 99, 2 );;
```

### 4.26  To Change the Review Display Location

As per [Google’s guidelines](https://developers.google.com/search/docs/advanced/structured-data/sd-policies#content), the Schema data added to the page should also be available for the readers in the page’s visible content. This is essential for becoming eligible for rich results like review ratings. Hence Rank Math allows you to add this review data to the front-end, and you can set its location to either top, bottom, both, or custom.

When the [display location](https://rankmath.com/kb/rich-snippets/#review-location) is set to custom, users will be provided with a shortcode to include the data anywhere inside their content.

```
/**
 * Filter to change the review display location
 *
 * @param string $location top, bottom, both or custom.
 */
add_filter( 'rank_math/snippet/review/location', function( $location , $taxonomy ) {
	return $location;
});
```

For instance, if you wish to set the review display location to be always at the bottom of the page, then use this code snippet:

```
add_filter( 'rank_math/snippet/review/location', function( $location) {
    $location = 'bottom';
	return $location;
});
```

### 4.27  To Change the Review Editor’s Choice Text

The review data added by Rank Math in the page’s visible content include star ratings. These star ratings appear when the user has set a rating value on applicable Schema types.

In the page’s visible content, these star ratings appear with the label **Editor’s Choice**. This filter lets you change this label to a more relevant one according to your theme.

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

Let’s say if this is for a movie review site, then you can customize the text to be something like ‘Movie Rating’ with the following code snippet.

```
add_filter( 'rank_math/review/text', function( $text ) {
    $text = 'Movie Rating';
	return $text;
});
```

### 4.28  To Change the Review Snippet HTML

If you wish to customize the appearance of the review data added by Rank Math in the page’s visible content, then you can make use of this filter, as it gives you access to the HTML of the review snippet.

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

For instance, if you’re looking to add a custom CSS class to review snippet, this filter can be extended as shown below.

```
add_filter('rank_math/snippet/html', function ($html) {
	$html = preg_replace('/rank-math-review-data/', 'rank-math-review-data custom-css', $html, 1);
	return $html;
});
```

### 4.29  To Change Post’s Front-End Schema Data

This filter allows you to make any changes to the post’s front-end Schema data. Make sure to replace `{$schema}` in the hook with the Schema name.

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

If your theme includes a feature to collect ratings from the audience, then you can incorporate these values into the Product Review Schema by extending this filter.

```
add_filter( 'rank_math/snippet/rich_snippet_product_entity', function($entity) {
    $score = get_post_meta(get_the_ID(), 'your_custom_field', true); // Replace post meta
    $entity['review']['reviewRating']['ratingValue'] = $score; 
    return $entity;
});
```

### 4.30  To Remove Schema Data from Posts

You can use this filter to remove Schema data from posts. Make sure to replace `{$schema_type}` in the hook with the Schema name.

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

For example, if you want to remove Article Schema from posts of a specific category, let’s say, the category slug is `landing-pages`, then the code snippet can be used this way.

```
add_filter( "rank_math/snippet/rich_snippet_article", function( $value, $parts, $data ) {
  $postCategories = get_the_category();
  if(!empty($postCategories)) {
     if($postCategories[0]->slug != "landing-pages") {
    	 return false;
     }
  }
}, 10, 3 );
```

### 4.31  To Change HTML Output for the Front End SEO Score Function

Rank Math allows users to [display SEO scores](https://rankmath.com/kb/general-settings/#show-seo-score) in the front-end and showcase how well the post is optimized for the search engine. This filter will allow you to change the HTML output of this SEO score so that you can customize it according to your theme design. You can refer to the [arguments available here](https://github.com/rankmath/seo-by-rank-math/blob/b3c895e131e77b39d9fc3c97c70815a795374f34/includes/class-frontend-seo-score.php#L122).

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

Let’s say, you want to add a custom CSS class to the front-end SEO score function and want to customize the appearance then you can use the following code snippet, which would add a CSS class `custom-css` to the SEO score feature on the front-end.

```
add_filter('rank_math/frontend/seo_score/html', function ($html, $args, $score) {
	$html = preg_replace('/rank-math-seo-score/', 'rank-math-seo-score custom-css', $html, 1);
	return $html;
}, 10, 3);
```

### 4.32  To Change the Backlink Inside the Front End SEO Score Output

Rank Math users can choose to [include a nofollow backlink](https://rankmath.com/kb/general-settings/#support-us-with-a-link) in the front-end SEO Score output. This filter gives you access to the HTML of this backlink.

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

Let’s say you want the backlink to be set to Google and to show the text “Powered By Google”, you would do the following:

```
add_filter('rank_math/frontend/seo_score/backlink', function ($backlink) {
	return '<a href="https://google.com">Google</a>';
});
```

### 4.33  Filter to Add Plugins to the Table of Content List

Rank Math looks for the presence of the Table of Contents as a part of [content readability analysis](https://rankmath.com/kb/score-100-in-tests/#content-readability). Since there isn’t a definite way to identify the presence of TOC in HTML, Rank Math looks for the presence of the Table of Contents plugin instead.

Having said that, if your theme offers Table of Contents as an add-on plugin, then you can use the below filter to locate the plugin file so that Rank Math can detect the plugin.

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

Alternatively, if the theme offers native support for Table of Contents, then you can use the following filter to disable the Table of Contents test altogether.

```
/**
 * Filter to disable the table of contents test
 */
add_filter( 'rank_math/researches/tests', function( $tests, $type ) {
    unset(
        $tests['contentHasTOC'],
    );
    return $tests;
}, 10, 2 );
```

## 5  Final Words — Achieve Rank Math Compatibility

And, that’s it! When your theme makes use of the above-listed filters for extending Rank Math’s features, you can ensure your theme’s compatibility with Rank Math. For more filters and hooks, we recommend going through our [extensive knowledgebase article](https://rankmath.com/kb/filters-hooks-api-developer/).

Once you have added compatibility for Rank Math in your WordPress theme, [submit it to us](https://rankmath.com/contact/) and we will get it added to our [list of compatible products](https://rankmath.com/compatible/themes/).

If you still have absolutely any questions or need our help, please feel free to reach our [support team directly from here](https://rankmath.com/support/), and our support expert will be more than happy to help you out.

			

			 

			
	
		
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

										
			
- [How to Enable Headless CMS Support in Rank Math?](https://rankmath.com/kb/headless-cms-support/)

										
			
- [How to Skip Rank Math Registration for Development Purposes](https://rankmath.com/kb/skip-rank-math-registration/)