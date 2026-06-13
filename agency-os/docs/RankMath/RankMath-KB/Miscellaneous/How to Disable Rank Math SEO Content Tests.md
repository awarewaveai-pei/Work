# How to Disable Rank Math SEO Content Tests

> **Category:** Miscellaneous
> **Source:** https://rankmath.com/kb/disable-seo-content-tests/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How to Disable Rank Math SEO Content Tests

			
			

	

If you feel that certain tests or suggestions that Rank Math offers aren’t relevant to the specific type of content you publish, you’re in luck because Rank Math makes it extremely easy to disable certain tests.

In this knowledgebase article, we’ll walk you through how to disable specific Rank Math SEO & Content AI content suggestions & tests.

  
## Table of Contents

  

    
- [Before Disabling the Content Tests & Suggestions](#before-disabling-tests)
    
- [How to Disable Rank Math SEO Content Tests](#disable-rank-math-tests)
      

        
- [Remove the Number in Title Test](#number-in-title)
        
- [Disable the Table of Contents Test](#toc-test)
        
- [Disable the Short Paragraphs Test](#short-paragraph)
        
- [Disable the Assets Test](#assets-test)
        
- [Disable the Keyword in Title Test](#keyword-in-title)
        
- [Disable the Keyword in Meta Description Test](#keyword-in-meta-description)
        
- [Disable the Keyword in Permalink Test](#keyword-in-permalink)
        
- [Disable the Keyword in 10 Percent Test](#keyword-in-10percent)
        
- [Disable the Keyword in Content Test](#keyword-in-content)
        
- [Disable the Keyword in Subheadings Test](#keyword-in-subheadings)
        
- [Disable the Keyword in Image Alt Test](#keyword-in-image-alt)
        
- [Disable the Keyword Density Test](#keyword-density)
        
- [Disable the Keyword Not Used Test](#keyword-not-used)
        
- [Disable the Length of the Content Test](#length-of-the-content)
        
- [Disable the Length of Permalink Test](#length-of-permalink)
        
- [Disable the Internal Links Test](#internal-links)
        
- [Disable the External Links Test](#external-links)
        
- [Disable the External Dofollow Link Test](#external-dofollow-link)
        
- [Disable the Title Starts With Keyword Test](#title-start-with-keyword)
        
- [Disable the Title Sentiment Test](#title-sentiment)
        
- [Disable the Title Has Power Words Test](#title-has-power-words)
        
- [Disable Content AI Test](#content-ai-test)
        
- [Disable Review Test](#review-test)
        
- [Disable Product Schema Test](#product-schema-test)
        
- [Disable Multiple Tests](#multiple-tests)
    
- [How to Disable the Content AI Research Tests](#content-ai-research-tests)
      

        
- [Disable Word Count Test](#word-count-test)
        
- [Disable Link Count Test](#link-count-test)
        
- [Disable Heading Count Test](#heading-count-test)
        
- [Disable Media Count Test](#media-count-test)
        
- [Disable All Content AI Research Tests](#all-research-tests)
  

## 1  Before Disabling the Content Tests & Suggestions

Before you disable any specific on-page SEO tests that Rank Math runs, you should add the respective filter to your website’s [rank-math.php](https://rankmath.com/kb/wordpress-hooks-actions-filters/#rank-math-php-file) file.

To add a filter, head over to **Appearance → Theme File Editor** (for Classic Theme) or **Tools → Theme File Editor** (for Block Theme) inside your WordPress admin area.

![Theme File Editor under Appearance section](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20793%20516'%3E%3C/svg%3E)

Now, from the list of files shown on the right side of the screen, choose the **rank-math.php** file. Add the code snippet in the code editor available in the middle of the screen, and then click the **Update File** button.

![Adding code to disable Rank Math tests](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20980%20571'%3E%3C/svg%3E)

Now that we’re clear on how to add the code snippet to your website, let us discuss the various filters available to disable Rank Math and Content AI Research tests.

## 2  How to Disable Rank Math SEO Content Tests

To disable the Rank Math on-page SEO tests and suggestions, use the following filters:

### 2.1  Remove the Number in Title Test

Remove the [number in the title test](https://rankmath.com/kb/score-100-in-tests/#number-in-title) with the following code:

```
/**
 * Filter to disable Number in Title test
 */
add_filter('rank_math/researches/tests', function ($tests, $type) {
	unset($tests['titleHasNumber']);
	return $tests;
}, 10, 2 );
```

### 2.2  Disable the Table of Contents Test

Disable the [table of content’s test](https://rankmath.com/kb/score-100-in-tests/#table-of-contents) with the following code:

```
/**
 * Filter to disable Table of Content test
 */
add_filter('rank_math/researches/tests', function ($tests, $type) {
	unset($tests['contentHasTOC']);
	return $tests;
}, 10, 2 );
```

### 2.3  Disable the Short Paragraph’s Test

Disable the [short paragraph’s test](https://rankmath.com/kb/score-100-in-tests/#use-of-short-paragraphs) with the following code:

```
/**
 * Filter to disable Short Paragraph test
 */
add_filter('rank_math/researches/tests', function ($tests, $type) {
	unset($tests['contentHasShortParagraphs']);
	return $tests;
}, 10, 2 );
```

### 2.4  Disable the Assets Test

Disable the [assets test](https://rankmath.com/kb/score-100-in-tests/#use-of-media-in-your-posts) with the following code:

```
/**
 * Filter to disable Assets test
 */
add_filter('rank_math/researches/tests', function ($tests, $type) {
	unset($tests['contentHasAssets']);
	return $tests;
}, 10, 2 );
```

### 2.5  Disable the Keyword in Title Test

Disable the [keyword in the title test](https://rankmath.com/kb/score-100-in-tests/#focus-keyword-in-the-seo-title-primary-focus-keyword-only) with the following code:

```
/**
 * Filter to disable Keyword in Title test
 */
add_filter('rank_math/researches/tests', function ($tests, $type) {
	unset($tests['keywordInTitle']);
	return $tests;
}, 10, 2 );
```

### 2.6  Disable the Keyword in Meta Description Test

Disable the [keyword in the meta description test](https://rankmath.com/kb/score-100-in-tests/#focus-keyword-in-the-meta-description-primary-focus-keyword-only) with the following code:

```
/**
 * Filter to disable Keyword in Meta Description test
 */
add_filter('rank_math/researches/tests', function ($tests, $type) {
	unset($tests['keywordInMetaDescription']);
	return $tests;
}, 10, 2 );
```

### 2.7  Disable the Keyword in Permalink Test

Disable the [keyword in the permalink test](https://rankmath.com/kb/score-100-in-tests/#focus-keyword-in-the-url-primary-focus-keyword-only) with the following code:

```
/**
 * Filter to disable Keyword in Permalink test
 */
add_filter('rank_math/researches/tests', function ($tests, $type) {
	unset($tests['keywordInPermalink']);
	return $tests;
}, 10, 2 );
```

### 2.8  Disable the Keyword in 10 Percent Test

Disable the [keyword in the first 10 percent of the content test](https://rankmath.com/kb/score-100-in-tests/#focus-keyword-at-the-beginning-of-the-content) with the following code:

```
/**
 * Filter to disable Keyword in First ten percent of Content test
 */
add_filter('rank_math/researches/tests', function ($tests, $type) {
	unset($tests['keywordIn10Percent']);
	return $tests;
}, 10, 2 );
```

### 2.9  Disable the Keyword in Content Test

Disable the [keyword in the content test](https://rankmath.com/kb/score-100-in-tests/#focus-keyword-in-the-content-runs-of-all-focus-keywords) with the following code:

```
/**
 * Filter to disable Keyword in Content test
 */
add_filter('rank_math/researches/tests', function ($tests, $type) {
	unset($tests['keywordInContent']);
	return $tests;
}, 10, 2 );
```

### 2.10  Disable the Keyword in Subheadings Test

Disable the [keyword in the subheadings test](https://rankmath.com/kb/score-100-in-tests/#focus-keyword-in-subheading-primary-and-secondary-focus-keywords) with the following code:

```
/**
 * Filter to disable Keyword in Subheadings test
 */
add_filter('rank_math/researches/tests', function ($tests, $type) {
	unset($tests['keywordInSubheadings']);
	return $tests;
}, 10, 2 );
```

### 2.11  Disable the Keyword in Image Alt Test

Disable the [keyword in the Image Alt test](https://rankmath.com/kb/score-100-in-tests/#focus-keyword-in-image-alt-attributes-primary-focus-keyword-only) with the following code:

```
/**
 * Filter to disable Keyword in Image Alt test
 */
add_filter('rank_math/researches/tests', function ($tests, $type) {
	unset($tests['keywordInImageAlt']);
	return $tests;
}, 10, 2 );
```

### 2.12  Disable the Keyword Density Test

Disable the [keyword density test](https://rankmath.com/kb/score-100-in-tests/#keyword-density-primary-and-secondary-focus-keywords) with the following code:

```
/**
 * Filter to disable Keyword Density test
 */
add_filter('rank_math/researches/tests', function ($tests, $type) {
	unset($tests['keywordDensity']);
	return $tests;
}, 10, 2 );
```

### 2.13  Disable the Keyword Not Used Test

Disable the [keyword not used](https://rankmath.com/kb/score-100-in-tests/#focus-keyword-uniqueness-primary-focus-keyword-only) test with the following code:

```
/**
 * Filter to disable Keyword not used before test
 */
add_filter('rank_math/researches/tests', function ($tests, $type) {
	unset($tests['keywordNotUsed']);
	return $tests;
}, 10, 2 );
```

### 2.14  Disable the Length of the Content Test

Disable the [length of the content](https://rankmath.com/kb/score-100-in-tests/#overall-content-length) test with the following code:

```
/**
 * Filter to disable length of the content test
 */
add_filter('rank_math/researches/tests', function ($tests, $type) {
	unset($tests['lengthContent']);
	return $tests;
}, 10, 2 );
```

### 2.15  Disable the Length of Permalink Test

Disable the [length of the permalink](https://rankmath.com/kb/score-100-in-tests/#url-length) test with the following code:

```
/**
 * Filter to disable length of the permalink test
 */
add_filter('rank_math/researches/tests', function ($tests, $type) {
	unset($tests['lengthPermalink']);
	return $tests;
}, 10, 2 );
```

### 2.16  Disable the Internal Links Test

Disable the [internal links test](https://rankmath.com/kb/score-100-in-tests/#linking-to-internal-resources) with the following code:

```
/**
 * Filter to disable Internal Links test
 */
add_filter('rank_math/researches/tests', function ($tests, $type) {
	unset($tests['linksHasInternal']);
	return $tests;
}, 10, 2 );
```

### 2.17  Disable the External Links Test

Disable the [external links test](https://rankmath.com/kb/score-100-in-tests/#linking-to-external-sources) with the following code:

```
/**
 * Filter to disable External Links test
 */
add_filter('rank_math/researches/tests', function ($tests, $type) {
	unset($tests['linksHasExternals']);
	return $tests;
}, 10, 2 );
```

### 2.18  Disable the External Dofollow Link Test

Disable the [external dofollow link test](https://rankmath.com/kb/score-100-in-tests/#linking-to-external-content-with-a-followed-link) with the following code:

```
/**
 * Filter to disable External Dofollow Link test
 */
add_filter('rank_math/researches/tests', function ($tests, $type) {
	unset($tests['linksNotAllExternals']);
	return $tests;
}, 10, 2 );
```

### 2.19  Disable the Title Start with Keyword Test

Disable the [title start with keyword test](https://rankmath.com/kb/score-100-in-tests/#focus-keyword-at-the-beginning-of-the-seo-title-only-for-primary-keyword) with the following code:

```
/**
 * Filter to disable Title starts with Keyword test
 */
add_filter('rank_math/researches/tests', function ($tests, $type) {
	unset($tests['titleStartWithKeyword']);
	return $tests;
}, 10, 2 );
```

### 2.20  Disable the Title Sentiment Test

Disable the [title sentiment test](https://rankmath.com/kb/score-100-in-tests/#sentiment-in-a-title) with the following code:

```
/**
 * Filter to disable Title Sentiment test
 */
add_filter('rank_math/researches/tests', function ($tests, $type) {
	unset($tests['titleSentiment']);
	return $tests;
}, 10, 2 );
```

### 2.21  Disable Title has Power Words Test

Disable the [title has power words test](https://rankmath.com/kb/score-100-in-tests/#use-of-power-word-in-title) with the following code:

```
/**
 * Filter to disable Title has Power Words test
 */
add_filter('rank_math/researches/tests', function ($tests, $type) {
	unset($tests['titleHasPowerWords']);
	return $tests;
}, 10, 2 );
```

### 2.22  Disable Content AI Test

Disable the [content AI test](https://rankmath.com/kb/score-100-in-tests/#used-content-ai) with the following code:

```
/**
 * Filter to disable Content AI test.
 */
add_filter('rank_math/researches/tests', function ($tests, $type) {
	unset($tests['hasContentAI']);
	return $tests;
}, 10, 2);
```

### 2.23  Disable Review Test

**Note:** This is available only for WooCommerce products and Easy Digital Downloads.

You can disable the [review test](https://rankmath.com/kb/content-analysis-tests-for-product-pages/#customer-reviews) in the SEO content test, as shown below.

```
/**
 * Filter to disable review test in SEO Contest tests
 */
add_filter('rank_math/researches/tests', function ($tests, $type) {
	unset($tests['isReviewEnabled']);
	return $tests;
}, 10, 2);
```

### 2.24  Disable Product Schema Test

**Note:** This is available only for WooCommerce products and Easy Digital Downloads.

You can disable the [Product Schema test](https://rankmath.com/kb/content-analysis-tests-for-product-pages/#use-product-schema) with the following code.

```
/**
 * Filter to disable Product Schema test
 */
add_filter('rank_math/researches/tests', function ($tests, $type) {
	unset($tests['hasProductSchema']);
	return $tests;
}, 10, 2);
```

### 2.25  Disable Multiple Tests

You can disable multiple tests like this:

```
/**
 * Filter to disable multiple SEO Contest tests
 */
add_filter('rank_math/researches/tests', function ($tests, $type) {
	unset(
		$tests['titleHasNumber'],
		$tests['contentHasTOC'],
		$tests['titleSentiment'],
		$tests['titleHasPowerWords']
	);
	return $tests;
}, 10, 2);
```

## 3  How to Disable the Content AI Research Tests

Rank Math’s Content AI includes four [built-in research tests](https://rankmath.com/kb/how-to-use-content-ai/?utm_source=Plugin&utm_medium=Sidebar%20KB%20Icon&utm_campaign=WP#research-keywords): `wordCount`, `linkCount`, `headingCount`, and `mediaCount`. If you’d like to disable one or more of these tests, you can use the following filters.

### 3.1  Disable Word Count Test

To remove the **WORD COUNT** test, use this filter:

```
/**
 * Allow developers to modify the Content AI tests.
 *
 * @param array  $tests Array of tests
 */
add_filter( 'rank_math/content_ai/research_tests', function( $tests ) {
    // Remove 'wordCount' and reindex the array
    return array_values( array_filter( $tests, function( $test ) {
        return $test !== 'wordCount';
    } ) );
} );
```

### 3.2  Disable Link Count Test

To remove the **LINK COUNT** test, use this filter:

```
/**
 * Allow developers to modify the Content AI tests.
 *
 * @param array  $tests Array of tests
 */
add_filter( 'rank_math/content_ai/research_tests', function( $tests ) {
    // Remove 'linkCount' and reindex the array
    return array_values( array_filter( $tests, function( $test ) {
        return $test !== 'linkCount';
    } ) );
} );
```

### 3.3  Disable Heading Count Test

To remove the **HEADING COUNT** test, use this filter:

```
/**
 * Allow developers to modify the Content AI tests.
 *
 * @param array  $tests Array of tests
 */
add_filter( 'rank_math/content_ai/research_tests', function( $tests ) {
    // Remove 'headingCount' and reindex the array
    return array_values( array_filter( $tests, function( $test ) {
        return $test !== 'headingCount';
    } ) );
} );
```

### 3.4  Disable Media Count Test

To remove the **MEDIA COUNT** test, use this filter:

```
/**
 * Allow developers to modify the Content AI tests.
 *
 * @param array  $tests Array of tests
 */
add_filter( 'rank_math/content_ai/research_tests', function( $tests ) {
    // Remove 'mediaCount' and reindex the array
    return array_values( array_filter( $tests, function( $test ) {
        return $test !== 'mediaCount';
    } ) );
} );
```

### 3.5  Disable All Content AI Research Tests

To disable **all four Content AI Research tests at once**, use this filter:

```
/**
 * Allow developers to modify the Content AI tests.
 *
 * @param array  $tests Array of tests
 */
add_filter( 'rank_math/content_ai/research_tests', function( $tests ) {
    // Remove 'wordCount', 'linkCount', 'headingCount', and 'mediaCount' from the array
    return array_values( array_filter( $tests, function( $test ) {
        return ! in_array( $test, [ 'wordCount', 'linkCount', 'headingCount', 'mediaCount' ], true );
    } ) );
} );
```

And, that’s it! If you still have any questions, you’re always more than welcome to [contact our dedicated support team](https://rankmath.com/support/), who are available 24/7, 365 days a year, to help you.

			

			 

			
	
		
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

		

										
			
- [How to Share Credentials Using the Rank Math Vault](https://rankmath.com/kb/how-to-use-vault/)

										
			
- [How to Create an AI Traffic Report in Google Analytics 4](https://rankmath.com/kb/create-ai-traffic-report/)

										
			
- [How to Disable Rank Math Meta Box from the Right Sidebar](https://rankmath.com/kb/disable-rank-math-meta-box/)

										
			
- [Migrating The Rank Math Support from Forum to Zendesk](https://rankmath.com/kb/support-migration-to-zendesk/)

										
			
- [How to Customize RSS Feed in WordPress](https://rankmath.com/kb/customize-rss-feed/)

										
			
- [How to Add Twitter Cards to WordPress](https://rankmath.com/kb/how-to-add-twitter-cards/)