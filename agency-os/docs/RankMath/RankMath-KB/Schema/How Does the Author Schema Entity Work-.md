# How Does the Author Schema Entity Work?

> **Category:** Schema
> **Source:** https://rankmath.com/kb/author-schema-entity/

---

Search For
		
		
		
		Search       
		
	
										

	
		

			
# How Does the Author Schema Entity Work?

			
			

	

Rank Math automatically adds the Author Schema Entity to your blog posts, and in this knowledgebase article, we’ll cover the importance of adding the **Author Schema** Markup and how you can customize them for your website.

## Importance of Author Schema

Google follows the [E-E-A-T](https://developers.google.com/search/blog/2022/12/google-raters-guidelines-e-e-a-t) guidelines (Experience, Expertise, Authoritativeness, and Trustworthiness) to evaluate the quality of your page’s content for various search queries. The [E-E-A-T signals](https://rankmath.com/blog/eeat-optimization/) consider not only the authority of the website but also the content creators.

You can establish the authority of the content creators on your website by displaying author boxes with reference links and social media links that would help search engines to connect the author with high-quality authority signals.

Adding an Author Schema Markup makes it further easier for search engines to connect the dots. Rank Math helps you win this area by automatically adding an Author Schema Entity to your blog posts.

## Customizing Author Schema Entity

The Author Schema Entity being added by Rank Math will look like this.

![Rank Math Author Schema Entity example](https://rankmath.com/wp-content/uploads/2021/04/Rank-Math-Author-Schema-Entity-example.jpg)

Rank Math lets you control the following data that is displayed inside the Author Schema entity:

## `worksFor`

The `worksFor` property displays the organization that the author currently works for. To change the Organization info you’ve added to Rank Math, head over to **WordPress Dashboard → Rank Math SEO → Titles & Meta → Local SEO**.

![Rank Math Titles and Meta - Local SEO](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%202380%201288'%3E%3C/svg%3E)

There are several options available on this page to add your organization info, and we’ve got a detailed article on [our Local SEO settings](https://rankmath.com/kb/local-seo/) for you to customize.

## `sameAs`

To add the `sameAs` property for the Author entity, the author should update his user profile by adding the social media links or the website link and include Additional profile URLs.

![Author contact info in Users Profile page](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201790%201078'%3E%3C/svg%3E)

The `sameAs` property can help search engines distinguish the author from others who share the same name and check for the credentials.

For instance, if you have a content creator named Joe, search engines can’t distinguish your author from several others who share the same name. The `sameAs` property helps search engines connect with the author’s social media profiles and relevant external signals to distinguish your content creator and evaluate as per the  E-E-A-T guidelines.

### `description`

Rank Math adds the `description` property for the author, if you’ve set the meta description for the author with Rank Math Snippet Editor on the author page.

To edit the snippet, navigate to **WordPress Dashboard → Users** and open the author profile you wanted to edit. Scroll down to find the Rank Math SEO box. Choose **Edit Snippet**.

![Rank Math Snippet editor in the Author page.](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201746%20888'%3E%3C/svg%3E)

Add in the **Description** field, add the description for your author that you wanted to be added in the Author Schema Entity.

![Rank Math author page description](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201723%201262'%3E%3C/svg%3E)

Click the **Update User** button at the end of the page to save the changes.

## Removing `worksFor` from Author Schema Entity

However, if your blog allows guest authors to contribute to your website, then mentioning `worksFor` property with your organization info makes it irrelevant, and you can always remove the `worksFor` property for your guest authors from the Author Schema by using the following filter.

```
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

When you [use the above filter](https://rankmath.com/kb/wordpress-hooks-actions-filters/), replace the `$author_id` values with your guest author’s user ID. You can identify the user ID when you navigate **WordPress Dashboard → Users** and open the author page. The user ID can be found in the URL of the page, as shown in the image below.

![User Id in URL](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20885%2065'%3E%3C/svg%3E)

And, that’s it! If you’ve absolutely any questions, feel free to [reach our support team](https://support.rankmath.com/) — we’re always more than happy to help.

			

			 

			
	
		
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

		

										
			
- [How to Convert Time Duration to ISO 8601 Format](https://rankmath.com/kb/iso-8601-format/)

										
			
- [How to Get a YouTube API Key](https://rankmath.com/kb/how-to-get-a-youtube-api-key/)

										
			
- [How to Add Merchant Return and Shipping Policy in WooCommerce?](https://rankmath.com/kb/merchant-return-and-shipping-policy/)

										
			
- [What is WebSite Schema and How Do You Implement It?](https://rankmath.com/kb/website-schema/)

										
			
- [How to Implement sameAs Schema on Your Website](https://rankmath.com/kb/sameas-schema/)

										
			
- [How to Implement Author SEO on Your Website to Boost E-E-A-T](https://rankmath.com/kb/author-seo/)