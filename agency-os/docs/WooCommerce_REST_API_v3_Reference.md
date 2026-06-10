# WooCommerce REST API v3 — Complete Reference

> Source: https://developer.woocommerce.com/docs/apis/rest-api/v3/

## Table of Contents

1. [API Reference](#api-reference)
2. [Coupons](#coupons)
3. [Customers](#customers)
4. [Orders](#orders)
5. [Order Actions](#order-actions)
6. [Order Notes](#order-notes)
7. [Order Refunds](#order-refunds)
8. [Products](#products)
9. [Product Variations](#product-variations)
10. [Product Attributes](#product-attributes)
11. [Product Attribute Terms](#product-attribute-terms)
12. [Product Categories](#product-categories)
13. [Product Custom Fields](#product-custom-fields)
14. [Product Shipping Classes](#product-shipping-classes)
15. [Product Tags](#product-tags)
16. [Product Reviews](#product-reviews)
17. [Reports](#reports)
18. [Refunds](#refunds)
19. [Taxes](#taxes)
20. [Tax Classes](#tax-classes)
21. [Webhooks](#webhooks)
22. [Settings](#settings)
23. [Setting Options](#setting-options)
24. [Payment Gateways](#payment-gateways)
25. [Shipping Zones](#shipping-zones)
26. [Shipping Zone Locations](#shipping-zone-locations)
27. [Shipping Zone Methods](#shipping-zone-methods)
28. [Shipping Methods](#shipping-methods)
29. [System Status](#system-status)
30. [System Status Tools](#system-status-tools)
31. [Data](#data)

---



---

<a name="api-reference"></a>

By default, the API provides information about all available endpoints on the site. Authentication is not required to access the API index.


```
GET /wp-json/wc/v3
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3
```

```
WooCommerce.get( '' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('')); ?>
```

```
print(wcapi.get("").json())
```

```
woocommerce.get("").parsed_response
```

```
{	"namespace": "wc/v3",	"routes": {		"/wc/v3": {			"namespace": "wc/v3",			"methods": [ "GET" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"namespace": {							"required": false,							"default": "wc/v3"						},						"context": {							"required": false,							"default": "view"						}					}				}			],			"_links": {				"self": "https://example.com/wp-json/wc/v3"			}		},		"/wc/v3/coupons": {			"namespace": "wc/v3",			"methods": [ "GET", "POST" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						},						"page": {							"required": false,							"default": 1,							"description": "Current page of the collection.",							"type": "integer"						},						"per_page": {							"required": false,							"default": 10,							"description": "Maximum number of items to be returned in result set.",							"type": "integer"						},						"search": {							"required": false,							"description": "Limit results to those matching a string.",							"type": "string"						},						"after": {							"required": false,							"description": "Limit response to resources published after a given ISO8601 compliant date.",							"type": "string"						},						"before": {							"required": false,							"description": "Limit response to resources published before a given ISO8601 compliant date.",							"type": "string"						},						"exclude": {							"required": false,							"default": [],							"description": "Ensure result set excludes specific IDs.",							"type": "array",							"items": {								"type": "integer"							}						},						"include": {							"required": false,							"default": [],							"description": "Limit result set to specific ids.",							"type": "array",							"items": {								"type": "integer"							}						},						"offset": {							"required": false,							"description": "Offset the result set by a specific number of items.",							"type": "integer"						},						"order": {							"required": false,							"default": "desc",							"enum": [ "asc", "desc" ],							"description": "Order sort attribute ascending or descending.",							"type": "string"						},						"orderby": {							"required": false,							"default": "date",							"enum": [								"date",								"id",								"include",								"title",								"slug"							],							"description": "Sort collection by object attribute.",							"type": "string"						},						"code": {							"required": false,							"description": "Limit result set to resources with a specific code.",							"type": "string"						}					}				},				{					"methods": [ "POST" ],					"args": {						"code": {							"required": true,							"description": "Coupon code.",							"type": "string"						},						"amount": {							"required": false,							"description": "The amount of discount. Should always be numeric, even if setting a percentage.",							"type": "string"						},						"discount_type": {							"required": false,							"default": "fixed_cart",							"enum": [								"percent",								"fixed_cart",								"fixed_product"							],							"description": "Determines the type of discount that will be applied.",							"type": "string"						},						"description": {							"required": false,							"description": "Coupon description.",							"type": "string"						},						"date_expires": {							"required": false,							"description": "The date the coupon expires, in the site's timezone.",							"type": "string"						},						"date_expires_gmt": {							"required": false,							"description": "The date the coupon expires, as GMT.",							"type": "string"						},						"individual_use": {							"required": false,							"default": false,							"description": "If true, the coupon can only be used individually. Other applied coupons will be removed from the cart.",							"type": "boolean"						},						"product_ids": {							"required": false,							"description": "List of product IDs the coupon can be used on.",							"type": "array",							"items": {								"type": "integer"							}						},						"excluded_product_ids": {							"required": false,							"description": "List of product IDs the coupon cannot be used on.",							"type": "array",							"items": {								"type": "integer"							}						},						"usage_limit": {							"required": false,							"description": "How many times the coupon can be used in total.",							"type": "integer"						},						"usage_limit_per_user": {							"required": false,							"description": "How many times the coupon can be used per customer.",							"type": "integer"						},						"limit_usage_to_x_items": {							"required": false,							"description": "Max number of items in the cart the coupon can be applied to.",							"type": "integer"						},						"free_shipping": {							"required": false,							"default": false,							"description": "If true and if the free shipping method requires a coupon, this coupon will enable free shipping.",							"type": "boolean"						},						"product_categories": {							"required": false,							"description": "List of category IDs the coupon applies to.",							"type": "array",							"items": {								"type": "integer"							}						},						"excluded_product_categories": {							"required": false,							"description": "List of category IDs the coupon does not apply to.",							"type": "array",							"items": {								"type": "integer"							}						},						"exclude_sale_items": {							"required": false,							"default": false,							"description": "If true, this coupon will not be applied to items that have sale prices.",							"type": "boolean"						},						"minimum_amount": {							"required": false,							"description": "Minimum order amount that needs to be in the cart before coupon applies.",							"type": "string"						},						"maximum_amount": {							"required": false,							"description": "Maximum order amount allowed when using the coupon.",							"type": "string"						},						"email_restrictions": {							"required": false,							"description": "List of email addresses that can use this coupon.",							"type": "array",							"items": {								"type": "string"							}						},						"meta_data": {							"required": false,							"description": "Meta data.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Meta ID.",										"type": "integer",										"context": [ "view", "edit" ],										"readonly": true									},									"key": {										"description": "Meta key.",										"type": "string",										"context": [ "view", "edit" ]									},									"value": {										"description": "Meta value.",										"type": "string",										"context": [ "view", "edit" ]									}								}							}						}					}				}			],			"_links": {				"self": "https://example.com/wp-json/wc/v3/coupons"			}		},		"/wc/v3/coupons/(?P<id>[\\d]+)": {			"namespace": "wc/v3",			"methods": [ "GET", "POST", "PUT", "PATCH", "DELETE" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						}					}				},				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"code": {							"required": false,							"description": "Coupon code.",							"type": "string"						},						"amount": {							"required": false,							"description": "The amount of discount. Should always be numeric, even if setting a percentage.",							"type": "string"						},						"discount_type": {							"required": false,							"enum": [								"percent",								"fixed_cart",								"fixed_product"							],							"description": "Determines the type of discount that will be applied.",							"type": "string"						},						"description": {							"required": false,							"description": "Coupon description.",							"type": "string"						},						"date_expires": {							"required": false,							"description": "The date the coupon expires, in the site's timezone.",							"type": "string"						},						"date_expires_gmt": {							"required": false,							"description": "The date the coupon expires, as GMT.",							"type": "string"						},						"individual_use": {							"required": false,							"description": "If true, the coupon can only be used individually. Other applied coupons will be removed from the cart.",							"type": "boolean"						},						"product_ids": {							"required": false,							"description": "List of product IDs the coupon can be used on.",							"type": "array",							"items": {								"type": "integer"							}						},						"excluded_product_ids": {							"required": false,							"description": "List of product IDs the coupon cannot be used on.",							"type": "array",							"items": {								"type": "integer"							}						},						"usage_limit": {							"required": false,							"description": "How many times the coupon can be used in total.",							"type": "integer"						},						"usage_limit_per_user": {							"required": false,							"description": "How many times the coupon can be used per customer.",							"type": "integer"						},						"limit_usage_to_x_items": {							"required": false,							"description": "Max number of items in the cart the coupon can be applied to.",							"type": "integer"						},						"free_shipping": {							"required": false,							"description": "If true and if the free shipping method requires a coupon, this coupon will enable free shipping.",							"type": "boolean"						},						"product_categories": {							"required": false,							"description": "List of category IDs the coupon applies to.",							"type": "array",							"items": {								"type": "integer"							}						},						"excluded_product_categories": {							"required": false,							"description": "List of category IDs the coupon does not apply to.",							"type": "array",							"items": {								"type": "integer"							}						},						"exclude_sale_items": {							"required": false,							"description": "If true, this coupon will not be applied to items that have sale prices.",							"type": "boolean"						},						"minimum_amount": {							"required": false,							"description": "Minimum order amount that needs to be in the cart before coupon applies.",							"type": "string"						},						"maximum_amount": {							"required": false,							"description": "Maximum order amount allowed when using the coupon.",							"type": "string"						},						"email_restrictions": {							"required": false,							"description": "List of email addresses that can use this coupon.",							"type": "array",							"items": {								"type": "string"							}						},						"meta_data": {							"required": false,							"description": "Meta data.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Meta ID.",										"type": "integer",										"context": [ "view", "edit" ],										"readonly": true									},									"key": {										"description": "Meta key.",										"type": "string",										"context": [ "view", "edit" ]									},									"value": {										"description": "Meta value.",										"type": "string",										"context": [ "view", "edit" ]									}								}							}						}					}				},				{					"methods": [ "DELETE" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"force": {							"required": false,							"default": false,							"description": "Whether to bypass trash and force deletion.",							"type": "boolean"						}					}				}			]		},		"/wc/v3/coupons/batch": {			"namespace": "wc/v3",			"methods": [ "POST", "PUT", "PATCH" ],			"endpoints": [				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"code": {							"required": false,							"description": "Coupon code.",							"type": "string"						},						"amount": {							"required": false,							"description": "The amount of discount. Should always be numeric, even if setting a percentage.",							"type": "string"						},						"discount_type": {							"required": false,							"enum": [								"percent",								"fixed_cart",								"fixed_product"							],							"description": "Determines the type of discount that will be applied.",							"type": "string"						},						"description": {							"required": false,							"description": "Coupon description.",							"type": "string"						},						"date_expires": {							"required": false,							"description": "The date the coupon expires, in the site's timezone.",							"type": "string"						},						"date_expires_gmt": {							"required": false,							"description": "The date the coupon expires, as GMT.",							"type": "string"						},						"individual_use": {							"required": false,							"description": "If true, the coupon can only be used individually. Other applied coupons will be removed from the cart.",							"type": "boolean"						},						"product_ids": {							"required": false,							"description": "List of product IDs the coupon can be used on.",							"type": "array",							"items": {								"type": "integer"							}						},						"excluded_product_ids": {							"required": false,							"description": "List of product IDs the coupon cannot be used on.",							"type": "array",							"items": {								"type": "integer"							}						},						"usage_limit": {							"required": false,							"description": "How many times the coupon can be used in total.",							"type": "integer"						},						"usage_limit_per_user": {							"required": false,							"description": "How many times the coupon can be used per customer.",							"type": "integer"						},						"limit_usage_to_x_items": {							"required": false,							"description": "Max number of items in the cart the coupon can be applied to.",							"type": "integer"						},						"free_shipping": {							"required": false,							"description": "If true and if the free shipping method requires a coupon, this coupon will enable free shipping.",							"type": "boolean"						},						"product_categories": {							"required": false,							"description": "List of category IDs the coupon applies to.",							"type": "array",							"items": {								"type": "integer"							}						},						"excluded_product_categories": {							"required": false,							"description": "List of category IDs the coupon does not apply to.",							"type": "array",							"items": {								"type": "integer"							}						},						"exclude_sale_items": {							"required": false,							"description": "If true, this coupon will not be applied to items that have sale prices.",							"type": "boolean"						},						"minimum_amount": {							"required": false,							"description": "Minimum order amount that needs to be in the cart before coupon applies.",							"type": "string"						},						"maximum_amount": {							"required": false,							"description": "Maximum order amount allowed when using the coupon.",							"type": "string"						},						"email_restrictions": {							"required": false,							"description": "List of email addresses that can use this coupon.",							"type": "array",							"items": {								"type": "string"							}						},						"meta_data": {							"required": false,							"description": "Meta data.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Meta ID.",										"type": "integer",										"context": [ "view", "edit" ],										"readonly": true									},									"key": {										"description": "Meta key.",										"type": "string",										"context": [ "view", "edit" ]									},									"value": {										"description": "Meta value.",										"type": "string",										"context": [ "view", "edit" ]									}								}							}						}					}				}			],			"_links": {				"self": "https://example.com/wp-json/wc/v3/coupons/batch"			}		},		"/wc/v3/customers/(?P<customer_id>[\\d]+)/downloads": {			"namespace": "wc/v3",			"methods": [ "GET" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"customer_id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"context": {							"required": false,							"default": "view",							"enum": [ "view" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						}					}				}			]		},		"/wc/v3/customers": {			"namespace": "wc/v3",			"methods": [ "GET", "POST" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						},						"page": {							"required": false,							"default": 1,							"description": "Current page of the collection.",							"type": "integer"						},						"per_page": {							"required": false,							"default": 10,							"description": "Maximum number of items to be returned in result set.",							"type": "integer"						},						"search": {							"required": false,							"description": "Limit results to those matching a string.",							"type": "string"						},						"exclude": {							"required": false,							"default": [],							"description": "Ensure result set excludes specific IDs.",							"type": "array",							"items": {								"type": "integer"							}						},						"include": {							"required": false,							"default": [],							"description": "Limit result set to specific IDs.",							"type": "array",							"items": {								"type": "integer"							}						},						"offset": {							"required": false,							"description": "Offset the result set by a specific number of items.",							"type": "integer"						},						"order": {							"required": false,							"default": "asc",							"enum": [ "asc", "desc" ],							"description": "Order sort attribute ascending or descending.",							"type": "string"						},						"orderby": {							"required": false,							"default": "name",							"enum": [								"id",								"include",								"name",								"registered_date"							],							"description": "Sort collection by object attribute.",							"type": "string"						},						"email": {							"required": false,							"description": "Limit result set to resources with a specific email.",							"type": "string"						},						"role": {							"required": false,							"default": "customer",							"enum": [								"all",								"administrator",								"editor",								"author",								"contributor",								"subscriber",								"customer",								"shop_manager"							],							"description": "Limit result set to resources with a specific role.",							"type": "string"						}					}				},				{					"methods": [ "POST" ],					"args": {						"email": {							"required": true,							"description": "New user email address.",							"type": "string"						},						"first_name": {							"required": false,							"description": "Customer first name.",							"type": "string"						},						"last_name": {							"required": false,							"description": "Customer last name.",							"type": "string"						},						"username": {							"required": false,							"description": "New user username.",							"type": "string"						},						"password": {							"required": false,							"description": "New user password.",							"type": "string"						},						"billing": {							"required": false,							"description": "List of billing address data.",							"type": "object"						},						"shipping": {							"required": false,							"description": "List of shipping address data.",							"type": "object"						},						"meta_data": {							"required": false,							"description": "Meta data.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Meta ID.",										"type": "integer",										"context": [ "view", "edit" ],										"readonly": true									},									"key": {										"description": "Meta key.",										"type": "string",										"context": [ "view", "edit" ]									},									"value": {										"description": "Meta value.",										"type": "string",										"context": [ "view", "edit" ]									}								}							}						}					}				}			],			"_links": {				"self": "https://example.com/wp-json/wc/v3/customers"			}		},		"/wc/v3/customers/(?P<id>[\\d]+)": {			"namespace": "wc/v3",			"methods": [ "GET", "POST", "PUT", "PATCH", "DELETE" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						}					}				},				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"email": {							"required": false,							"description": "The email address for the customer.",							"type": "string"						},						"first_name": {							"required": false,							"description": "Customer first name.",							"type": "string"						},						"last_name": {							"required": false,							"description": "Customer last name.",							"type": "string"						},						"username": {							"required": false,							"description": "Customer login name.",							"type": "string"						},						"password": {							"required": false,							"description": "Customer password.",							"type": "string"						},						"billing": {							"required": false,							"description": "List of billing address data.",							"type": "object"						},						"shipping": {							"required": false,							"description": "List of shipping address data.",							"type": "object"						},						"meta_data": {							"required": false,							"description": "Meta data.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Meta ID.",										"type": "integer",										"context": [ "view", "edit" ],										"readonly": true									},									"key": {										"description": "Meta key.",										"type": "string",										"context": [ "view", "edit" ]									},									"value": {										"description": "Meta value.",										"type": "string",										"context": [ "view", "edit" ]									}								}							}						}					}				},				{					"methods": [ "DELETE" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"force": {							"required": false,							"default": false,							"description": "Required to be true, as resource does not support trashing.",							"type": "boolean"						},						"reassign": {							"required": false,							"default": 0,							"description": "ID to reassign posts to.",							"type": "integer"						}					}				}			]		},		"/wc/v3/customers/batch": {			"namespace": "wc/v3",			"methods": [ "POST", "PUT", "PATCH" ],			"endpoints": [				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"email": {							"required": false,							"description": "The email address for the customer.",							"type": "string"						},						"first_name": {							"required": false,							"description": "Customer first name.",							"type": "string"						},						"last_name": {							"required": false,							"description": "Customer last name.",							"type": "string"						},						"username": {							"required": false,							"description": "Customer login name.",							"type": "string"						},						"password": {							"required": false,							"description": "Customer password.",							"type": "string"						},						"billing": {							"required": false,							"description": "List of billing address data.",							"type": "object"						},						"shipping": {							"required": false,							"description": "List of shipping address data.",							"type": "object"						},						"meta_data": {							"required": false,							"description": "Meta data.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Meta ID.",										"type": "integer",										"context": [ "view", "edit" ],										"readonly": true									},									"key": {										"description": "Meta key.",										"type": "string",										"context": [ "view", "edit" ]									},									"value": {										"description": "Meta value.",										"type": "string",										"context": [ "view", "edit" ]									}								}							}						}					}				}			],			"_links": {				"self": "https://example.com/wp-json/wc/v3/customers/batch"			}		},		"/wc/v3/orders/(?P<order_id>[\\d]+)/notes": {			"namespace": "wc/v3",			"methods": [ "GET", "POST" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"order_id": {							"required": false,							"description": "The order ID.",							"type": "integer"						},						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						},						"type": {							"required": false,							"default": "any",							"enum": [ "any", "customer", "internal" ],							"description": "Limit result to customers or internal notes.",							"type": "string"						}					}				},				{					"methods": [ "POST" ],					"args": {						"order_id": {							"required": false,							"description": "The order ID.",							"type": "integer"						},						"note": {							"required": true,							"description": "Order note content.",							"type": "string"						},						"customer_note": {							"required": false,							"default": false,							"description": "If true, the note will be shown to customers and they will be notified. If false, the note will be for admin reference only.",							"type": "boolean"						}					}				}			]		},		"/wc/v3/orders/(?P<order_id>[\\d]+)/notes/(?P<id>[\\d]+)": {			"namespace": "wc/v3",			"methods": [ "GET", "DELETE" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"order_id": {							"required": false,							"description": "The order ID.",							"type": "integer"						},						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						}					}				},				{					"methods": [ "DELETE" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"order_id": {							"required": false,							"description": "The order ID.",							"type": "integer"						},						"force": {							"required": false,							"default": false,							"description": "Required to be true, as resource does not support trashing.",							"type": "boolean"						}					}				}			]		},		"/wc/v3/orders/(?P<order_id>[\\d]+)/refunds": {			"namespace": "wc/v3",			"methods": [ "GET", "POST" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"order_id": {							"required": false,							"description": "The order ID.",							"type": "integer"						},						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						},						"page": {							"required": false,							"default": 1,							"description": "Current page of the collection.",							"type": "integer"						},						"per_page": {							"required": false,							"default": 10,							"description": "Maximum number of items to be returned in result set.",							"type": "integer"						},						"search": {							"required": false,							"description": "Limit results to those matching a string.",							"type": "string"						},						"after": {							"required": false,							"description": "Limit response to resources published after a given ISO8601 compliant date.",							"type": "string"						},						"before": {							"required": false,							"description": "Limit response to resources published before a given ISO8601 compliant date.",							"type": "string"						},						"exclude": {							"required": false,							"default": [],							"description": "Ensure result set excludes specific IDs.",							"type": "array",							"items": {								"type": "integer"							}						},						"include": {							"required": false,							"default": [],							"description": "Limit result set to specific ids.",							"type": "array",							"items": {								"type": "integer"							}						},						"offset": {							"required": false,							"description": "Offset the result set by a specific number of items.",							"type": "integer"						},						"order": {							"required": false,							"default": "desc",							"enum": [ "asc", "desc" ],							"description": "Order sort attribute ascending or descending.",							"type": "string"						},						"orderby": {							"required": false,							"default": "date",							"enum": [								"date",								"id",								"include",								"title",								"slug"							],							"description": "Sort collection by object attribute.",							"type": "string"						},						"parent": {							"required": false,							"default": [],							"description": "Limit result set to those of particular parent IDs.",							"type": "array",							"items": {								"type": "integer"							}						},						"parent_exclude": {							"required": false,							"default": [],							"description": "Limit result set to all items except those of a particular parent ID.",							"type": "array",							"items": {								"type": "integer"							}						},						"dp": {							"required": false,							"default": 2,							"description": "Number of decimal points to use in each resource.",							"type": "integer"						}					}				},				{					"methods": [ "POST" ],					"args": {						"order_id": {							"required": false,							"description": "The order ID.",							"type": "integer"						},						"amount": {							"required": false,							"description": "Refund amount.",							"type": "string"						},						"reason": {							"required": false,							"description": "Reason for refund.",							"type": "string"						},						"refunded_by": {							"required": false,							"description": "User ID of user who created the refund.",							"type": "integer"						},						"meta_data": {							"required": false,							"description": "Meta data.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Meta ID.",										"type": "integer",										"context": [ "view", "edit" ],										"readonly": true									},									"key": {										"description": "Meta key.",										"type": "string",										"context": [ "view", "edit" ]									},									"value": {										"description": "Meta value.",										"type": "string",										"context": [ "view", "edit" ]									}								}							}						},						"line_items": {							"required": false,							"description": "Line items data.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Item ID.",										"type": "integer",										"context": [ "view", "edit" ],										"readonly": true									},									"name": {										"description": "Product name.",										"type": "string",										"context": [ "view", "edit" ]									},									"product_id": {										"description": "Product ID.",										"type": "integer",										"context": [ "view", "edit" ]									},									"variation_id": {										"description": "Variation ID, if applicable.",										"type": "integer",										"context": [ "view", "edit" ]									},									"quantity": {										"description": "Quantity ordered.",										"type": "integer",										"context": [ "view", "edit" ]									},									"tax_class": {										"description": "Tax class of product.",										"type": "integer",										"context": [ "view", "edit" ]									},									"subtotal": {										"description": "Line subtotal (before discounts).",										"type": "string",										"context": [ "view", "edit" ]									},									"subtotal_tax": {										"description": "Line subtotal tax (before discounts).",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"total": {										"description": "Line total (after discounts).",										"type": "string",										"context": [ "view", "edit" ]									},									"total_tax": {										"description": "Line total tax (after discounts).",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"taxes": {										"description": "Line taxes.",										"type": "array",										"context": [ "view", "edit" ],										"readonly": true,										"items": {											"type": "object",											"properties": {												"id": {													"description": "Tax rate ID.",													"type": "integer",													"context": [														"view",														"edit"													]												},												"total": {													"description": "Tax total.",													"type": "string",													"context": [														"view",														"edit"													]												},												"subtotal": {													"description": "Tax subtotal.",													"type": "string",													"context": [														"view",														"edit"													]												}											}										}									},									"meta_data": {										"description": "Meta data.",										"type": "array",										"context": [ "view", "edit" ],										"items": {											"type": "object",											"properties": {												"id": {													"description": "Meta ID.",													"type": "integer",													"context": [														"view",														"edit"													],													"readonly": true												},												"key": {													"description": "Meta key.",													"type": "string",													"context": [														"view",														"edit"													]												},												"value": {													"description": "Meta value.",													"type": "string",													"context": [														"view",														"edit"													]												}											}										}									},									"sku": {										"description": "Product SKU.",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"price": {										"description": "Product price.",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									}								}							}						},						"api_refund": {							"required": false,							"default": true,							"description": "When true, the payment gateway API is used to generate the refund.",							"type": "boolean"						}					}				}			]		},		"/wc/v3/orders/(?P<order_id>[\\d]+)/refunds/(?P<id>[\\d]+)": {			"namespace": "wc/v3",			"methods": [ "GET", "DELETE" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"order_id": {							"required": false,							"description": "The order ID.",							"type": "integer"						},						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						}					}				},				{					"methods": [ "DELETE" ],					"args": {						"order_id": {							"required": false,							"description": "The order ID.",							"type": "integer"						},						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"force": {							"required": false,							"default": true,							"description": "Required to be true, as resource does not support trashing.",							"type": "boolean"						}					}				}			]		},		"/wc/v3/orders": {			"namespace": "wc/v3",			"methods": [ "GET", "POST" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						},						"page": {							"required": false,							"default": 1,							"description": "Current page of the collection.",							"type": "integer"						},						"per_page": {							"required": false,							"default": 10,							"description": "Maximum number of items to be returned in result set.",							"type": "integer"						},						"search": {							"required": false,							"description": "Limit results to those matching a string.",							"type": "string"						},						"after": {							"required": false,							"description": "Limit response to resources published after a given ISO8601 compliant date.",							"type": "string"						},						"before": {							"required": false,							"description": "Limit response to resources published before a given ISO8601 compliant date.",							"type": "string"						},						"exclude": {							"required": false,							"default": [],							"description": "Ensure result set excludes specific IDs.",							"type": "array",							"items": {								"type": "integer"							}						},						"include": {							"required": false,							"default": [],							"description": "Limit result set to specific ids.",							"type": "array",							"items": {								"type": "integer"							}						},						"offset": {							"required": false,							"description": "Offset the result set by a specific number of items.",							"type": "integer"						},						"order": {							"required": false,							"default": "desc",							"enum": [ "asc", "desc" ],							"description": "Order sort attribute ascending or descending.",							"type": "string"						},						"orderby": {							"required": false,							"default": "date",							"enum": [								"date",								"id",								"include",								"title",								"slug"							],							"description": "Sort collection by object attribute.",							"type": "string"						},						"parent": {							"required": false,							"default": [],							"description": "Limit result set to those of particular parent IDs.",							"type": "array",							"items": {								"type": "integer"							}						},						"parent_exclude": {							"required": false,							"default": [],							"description": "Limit result set to all items except those of a particular parent ID.",							"type": "array",							"items": {								"type": "integer"							}						},						"status": {							"required": false,							"default": "any",							"enum": [								"any",								"pending",								"processing",								"on-hold",								"completed",								"cancelled",								"refunded",								"failed"							],							"description": "Limit result set to orders assigned a specific status.",							"type": "string"						},						"customer": {							"required": false,							"description": "Limit result set to orders assigned a specific customer.",							"type": "integer"						},						"product": {							"required": false,							"description": "Limit result set to orders assigned a specific product.",							"type": "integer"						},						"dp": {							"required": false,							"default": 2,							"description": "Number of decimal points to use in each resource.",							"type": "integer"						}					}				},				{					"methods": [ "POST" ],					"args": {						"parent_id": {							"required": false,							"description": "Parent order ID.",							"type": "integer"						},						"status": {							"required": false,							"default": "pending",							"enum": [								"pending",								"processing",								"on-hold",								"completed",								"cancelled",								"refunded",								"failed"							],							"description": "Order status.",							"type": "string"						},						"currency": {							"required": false,							"default": "USD",							"enum": [								"AED",								"AFN",								"ALL",								"AMD",								"ANG",								"AOA",								"ARS",								"AUD",								"AWG",								"AZN",								"BAM",								"BBD",								"BDT",								"BGN",								"BHD",								"BIF",								"BMD",								"BND",								"BOB",								"BRL",								"BSD",								"BTC",								"BTN",								"BWP",								"BYR",								"BZD",								"CAD",								"CDF",								"CHF",								"CLP",								"CNY",								"COP",								"CRC",								"CUC",								"CUP",								"CVE",								"CZK",								"DJF",								"DKK",								"DOP",								"DZD",								"EGP",								"ERN",								"ETB",								"EUR",								"FJD",								"FKP",								"GBP",								"GEL",								"GGP",								"GHS",								"GIP",								"GMD",								"GNF",								"GTQ",								"GYD",								"HKD",								"HNL",								"HRK",								"HTG",								"HUF",								"IDR",								"ILS",								"IMP",								"INR",								"IQD",								"IRR",								"IRT",								"ISK",								"JEP",								"JMD",								"JOD",								"JPY",								"KES",								"KGS",								"KHR",								"KMF",								"KPW",								"KRW",								"KWD",								"KYD",								"KZT",								"LAK",								"LBP",								"LKR",								"LRD",								"LSL",								"LYD",								"MAD",								"MDL",								"MGA",								"MKD",								"MMK",								"MNT",								"MOP",								"MRO",								"MUR",								"MVR",								"MWK",								"MXN",								"MYR",								"MZN",								"NAD",								"NGN",								"NIO",								"NOK",								"NPR",								"NZD",								"OMR",								"PAB",								"PEN",								"PGK",								"PHP",								"PKR",								"PLN",								"PRB",								"PYG",								"QAR",								"RON",								"RSD",								"RUB",								"RWF",								"SAR",								"SBD",								"SCR",								"SDG",								"SEK",								"SGD",								"SHP",								"SLL",								"SOS",								"SRD",								"SSP",								"STD",								"SYP",								"SZL",								"THB",								"TJS",								"TMT",								"TND",								"TOP",								"TRY",								"TTD",								"TWD",								"TZS",								"UAH",								"UGX",								"USD",								"UYU",								"UZS",								"VEF",								"VND",								"VUV",								"WST",								"XAF",								"XCD",								"XOF",								"XPF",								"YER",								"ZAR",								"ZMW"							],							"description": "Currency the order was created with, in ISO format.",							"type": "string"						},						"customer_id": {							"required": false,							"default": 0,							"description": "User ID who owns the order. 0 for guests.",							"type": "integer"						},						"customer_note": {							"required": false,							"description": "Note left by customer during checkout.",							"type": "string"						},						"billing": {							"required": false,							"description": "Billing address.",							"type": "object"						},						"shipping": {							"required": false,							"description": "Shipping address.",							"type": "object"						},						"payment_method": {							"required": false,							"description": "Payment method ID.",							"type": "string"						},						"payment_method_title": {							"required": false,							"description": "Payment method title.",							"type": "string"						},						"transaction_id": {							"required": false,							"description": "Unique transaction ID.",							"type": "string"						},						"meta_data": {							"required": false,							"description": "Meta data.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Meta ID.",										"type": "integer",										"context": [ "view", "edit" ],										"readonly": true									},									"key": {										"description": "Meta key.",										"type": "string",										"context": [ "view", "edit" ]									},									"value": {										"description": "Meta value.",										"type": "string",										"context": [ "view", "edit" ]									}								}							}						},						"line_items": {							"required": false,							"description": "Line items data.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Item ID.",										"type": "integer",										"context": [ "view", "edit" ],										"readonly": true									},									"name": {										"description": "Product name.",										"type": "string",										"context": [ "view", "edit" ]									},									"product_id": {										"description": "Product ID.",										"type": "integer",										"context": [ "view", "edit" ]									},									"variation_id": {										"description": "Variation ID, if applicable.",										"type": "integer",										"context": [ "view", "edit" ]									},									"quantity": {										"description": "Quantity ordered.",										"type": "integer",										"context": [ "view", "edit" ]									},									"tax_class": {										"description": "Tax class of product.",										"type": "integer",										"context": [ "view", "edit" ]									},									"subtotal": {										"description": "Line subtotal (before discounts).",										"type": "string",										"context": [ "view", "edit" ]									},									"subtotal_tax": {										"description": "Line subtotal tax (before discounts).",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"total": {										"description": "Line total (after discounts).",										"type": "string",										"context": [ "view", "edit" ]									},									"total_tax": {										"description": "Line total tax (after discounts).",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"taxes": {										"description": "Line taxes.",										"type": "array",										"context": [ "view", "edit" ],										"readonly": true,										"items": {											"type": "object",											"properties": {												"id": {													"description": "Tax rate ID.",													"type": "integer",													"context": [														"view",														"edit"													]												},												"total": {													"description": "Tax total.",													"type": "string",													"context": [														"view",														"edit"													]												},												"subtotal": {													"description": "Tax subtotal.",													"type": "string",													"context": [														"view",														"edit"													]												}											}										}									},									"meta_data": {										"description": "Meta data.",										"type": "array",										"context": [ "view", "edit" ],										"items": {											"type": "object",											"properties": {												"id": {													"description": "Meta ID.",													"type": "integer",													"context": [														"view",														"edit"													],													"readonly": true												},												"key": {													"description": "Meta key.",													"type": "string",													"context": [														"view",														"edit"													]												},												"value": {													"description": "Meta value.",													"type": "string",													"context": [														"view",														"edit"													]												}											}										}									},									"sku": {										"description": "Product SKU.",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"price": {										"description": "Product price.",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									}								}							}						},						"shipping_lines": {							"required": false,							"description": "Shipping lines data.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Item ID.",										"type": "integer",										"context": [ "view", "edit" ],										"readonly": true									},									"method_title": {										"description": "Shipping method name.",										"type": "string",										"context": [ "view", "edit" ]									},									"method_id": {										"description": "Shipping method ID.",										"type": "string",										"context": [ "view", "edit" ]									},									"total": {										"description": "Line total (after discounts).",										"type": "string",										"context": [ "view", "edit" ]									},									"total_tax": {										"description": "Line total tax (after discounts).",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"taxes": {										"description": "Line taxes.",										"type": "array",										"context": [ "view", "edit" ],										"readonly": true,										"items": {											"type": "object",											"properties": {												"id": {													"description": "Tax rate ID.",													"type": "integer",													"context": [														"view",														"edit"													],													"readonly": true												},												"total": {													"description": "Tax total.",													"type": "string",													"context": [														"view",														"edit"													],													"readonly": true												}											}										}									},									"meta_data": {										"description": "Meta data.",										"type": "array",										"context": [ "view", "edit" ],										"items": {											"type": "object",											"properties": {												"id": {													"description": "Meta ID.",													"type": "integer",													"context": [														"view",														"edit"													],													"readonly": true												},												"key": {													"description": "Meta key.",													"type": "string",													"context": [														"view",														"edit"													]												},												"value": {													"description": "Meta value.",													"type": "string",													"context": [														"view",														"edit"													]												}											}										}									}								}							}						},						"fee_lines": {							"required": false,							"description": "Fee lines data.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Item ID.",										"type": "integer",										"context": [ "view", "edit" ],										"readonly": true									},									"name": {										"description": "Fee name.",										"type": "string",										"context": [ "view", "edit" ]									},									"tax_class": {										"description": "Tax class of fee.",										"type": "string",										"context": [ "view", "edit" ]									},									"tax_status": {										"description": "Tax status of fee.",										"type": "string",										"context": [ "view", "edit" ],										"enum": [ "taxable", "none" ]									},									"total": {										"description": "Line total (after discounts).",										"type": "string",										"context": [ "view", "edit" ]									},									"total_tax": {										"description": "Line total tax (after discounts).",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"taxes": {										"description": "Line taxes.",										"type": "array",										"context": [ "view", "edit" ],										"readonly": true,										"items": {											"type": "object",											"properties": {												"id": {													"description": "Tax rate ID.",													"type": "integer",													"context": [														"view",														"edit"													],													"readonly": true												},												"total": {													"description": "Tax total.",													"type": "string",													"context": [														"view",														"edit"													],													"readonly": true												},												"subtotal": {													"description": "Tax subtotal.",													"type": "string",													"context": [														"view",														"edit"													],													"readonly": true												}											}										}									},									"meta_data": {										"description": "Meta data.",										"type": "array",										"context": [ "view", "edit" ],										"items": {											"type": "object",											"properties": {												"id": {													"description": "Meta ID.",													"type": "integer",													"context": [														"view",														"edit"													],													"readonly": true												},												"key": {													"description": "Meta key.",													"type": "string",													"context": [														"view",														"edit"													]												},												"value": {													"description": "Meta value.",													"type": "string",													"context": [														"view",														"edit"													]												}											}										}									}								}							}						},						"coupon_lines": {							"required": false,							"description": "Coupons line data.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Item ID.",										"type": "integer",										"context": [ "view", "edit" ],										"readonly": true									},									"code": {										"description": "Coupon code.",										"type": "string",										"context": [ "view", "edit" ]									},									"discount": {										"description": "Discount total.",										"type": "string",										"context": [ "view", "edit" ]									},									"discount_tax": {										"description": "Discount total tax.",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"meta_data": {										"description": "Meta data.",										"type": "array",										"context": [ "view", "edit" ],										"items": {											"type": "object",											"properties": {												"id": {													"description": "Meta ID.",													"type": "integer",													"context": [														"view",														"edit"													],													"readonly": true												},												"key": {													"description": "Meta key.",													"type": "string",													"context": [														"view",														"edit"													]												},												"value": {													"description": "Meta value.",													"type": "string",													"context": [														"view",														"edit"													]												}											}										}									}								}							}						},						"set_paid": {							"required": false,							"default": false,							"description": "Define if the order is paid. It will set the status to processing and reduce stock items.",							"type": "boolean"						}					}				}			],			"_links": {				"self": "https://example.com/wp-json/wc/v3/orders"			}		},		"/wc/v3/orders/(?P<id>[\\d]+)": {			"namespace": "wc/v3",			"methods": [ "GET", "POST", "PUT", "PATCH", "DELETE" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						}					}				},				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"parent_id": {							"required": false,							"description": "Parent order ID.",							"type": "integer"						},						"status": {							"required": false,							"enum": [								"pending",								"processing",								"on-hold",								"completed",								"cancelled",								"refunded",								"failed"							],							"description": "Order status.",							"type": "string"						},						"currency": {							"required": false,							"enum": [								"AED",								"AFN",								"ALL",								"AMD",								"ANG",								"AOA",								"ARS",								"AUD",								"AWG",								"AZN",								"BAM",								"BBD",								"BDT",								"BGN",								"BHD",								"BIF",								"BMD",								"BND",								"BOB",								"BRL",								"BSD",								"BTC",								"BTN",								"BWP",								"BYR",								"BZD",								"CAD",								"CDF",								"CHF",								"CLP",								"CNY",								"COP",								"CRC",								"CUC",								"CUP",								"CVE",								"CZK",								"DJF",								"DKK",								"DOP",								"DZD",								"EGP",								"ERN",								"ETB",								"EUR",								"FJD",								"FKP",								"GBP",								"GEL",								"GGP",								"GHS",								"GIP",								"GMD",								"GNF",								"GTQ",								"GYD",								"HKD",								"HNL",								"HRK",								"HTG",								"HUF",								"IDR",								"ILS",								"IMP",								"INR",								"IQD",								"IRR",								"IRT",								"ISK",								"JEP",								"JMD",								"JOD",								"JPY",								"KES",								"KGS",								"KHR",								"KMF",								"KPW",								"KRW",								"KWD",								"KYD",								"KZT",								"LAK",								"LBP",								"LKR",								"LRD",								"LSL",								"LYD",								"MAD",								"MDL",								"MGA",								"MKD",								"MMK",								"MNT",								"MOP",								"MRO",								"MUR",								"MVR",								"MWK",								"MXN",								"MYR",								"MZN",								"NAD",								"NGN",								"NIO",								"NOK",								"NPR",								"NZD",								"OMR",								"PAB",								"PEN",								"PGK",								"PHP",								"PKR",								"PLN",								"PRB",								"PYG",								"QAR",								"RON",								"RSD",								"RUB",								"RWF",								"SAR",								"SBD",								"SCR",								"SDG",								"SEK",								"SGD",								"SHP",								"SLL",								"SOS",								"SRD",								"SSP",								"STD",								"SYP",								"SZL",								"THB",								"TJS",								"TMT",								"TND",								"TOP",								"TRY",								"TTD",								"TWD",								"TZS",								"UAH",								"UGX",								"USD",								"UYU",								"UZS",								"VEF",								"VND",								"VUV",								"WST",								"XAF",								"XCD",								"XOF",								"XPF",								"YER",								"ZAR",								"ZMW"							],							"description": "Currency the order was created with, in ISO format.",							"type": "string"						},						"customer_id": {							"required": false,							"description": "User ID who owns the order. 0 for guests.",							"type": "integer"						},						"customer_note": {							"required": false,							"description": "Note left by customer during checkout.",							"type": "string"						},						"billing": {							"required": false,							"description": "Billing address.",							"type": "object"						},						"shipping": {							"required": false,							"description": "Shipping address.",							"type": "object"						},						"payment_method": {							"required": false,							"description": "Payment method ID.",							"type": "string"						},						"payment_method_title": {							"required": false,							"description": "Payment method title.",							"type": "string"						},						"transaction_id": {							"required": false,							"description": "Unique transaction ID.",							"type": "string"						},						"meta_data": {							"required": false,							"description": "Meta data.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Meta ID.",										"type": "integer",										"context": [ "view", "edit" ],										"readonly": true									},									"key": {										"description": "Meta key.",										"type": "string",										"context": [ "view", "edit" ]									},									"value": {										"description": "Meta value.",										"type": "string",										"context": [ "view", "edit" ]									}								}							}						},						"line_items": {							"required": false,							"description": "Line items data.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Item ID.",										"type": "integer",										"context": [ "view", "edit" ],										"readonly": true									},									"name": {										"description": "Product name.",										"type": "string",										"context": [ "view", "edit" ]									},									"product_id": {										"description": "Product ID.",										"type": "integer",										"context": [ "view", "edit" ]									},									"variation_id": {										"description": "Variation ID, if applicable.",										"type": "integer",										"context": [ "view", "edit" ]									},									"quantity": {										"description": "Quantity ordered.",										"type": "integer",										"context": [ "view", "edit" ]									},									"tax_class": {										"description": "Tax class of product.",										"type": "integer",										"context": [ "view", "edit" ]									},									"subtotal": {										"description": "Line subtotal (before discounts).",										"type": "string",										"context": [ "view", "edit" ]									},									"subtotal_tax": {										"description": "Line subtotal tax (before discounts).",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"total": {										"description": "Line total (after discounts).",										"type": "string",										"context": [ "view", "edit" ]									},									"total_tax": {										"description": "Line total tax (after discounts).",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"taxes": {										"description": "Line taxes.",										"type": "array",										"context": [ "view", "edit" ],										"readonly": true,										"items": {											"type": "object",											"properties": {												"id": {													"description": "Tax rate ID.",													"type": "integer",													"context": [														"view",														"edit"													]												},												"total": {													"description": "Tax total.",													"type": "string",													"context": [														"view",														"edit"													]												},												"subtotal": {													"description": "Tax subtotal.",													"type": "string",													"context": [														"view",														"edit"													]												}											}										}									},									"meta_data": {										"description": "Meta data.",										"type": "array",										"context": [ "view", "edit" ],										"items": {											"type": "object",											"properties": {												"id": {													"description": "Meta ID.",													"type": "integer",													"context": [														"view",														"edit"													],													"readonly": true												},												"key": {													"description": "Meta key.",													"type": "string",													"context": [														"view",														"edit"													]												},												"value": {													"description": "Meta value.",													"type": "string",													"context": [														"view",														"edit"													]												}											}										}									},									"sku": {										"description": "Product SKU.",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"price": {										"description": "Product price.",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									}								}							}						},						"shipping_lines": {							"required": false,							"description": "Shipping lines data.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Item ID.",										"type": "integer",										"context": [ "view", "edit" ],										"readonly": true									},									"method_title": {										"description": "Shipping method name.",										"type": "string",										"context": [ "view", "edit" ]									},									"method_id": {										"description": "Shipping method ID.",										"type": "string",										"context": [ "view", "edit" ]									},									"total": {										"description": "Line total (after discounts).",										"type": "string",										"context": [ "view", "edit" ]									},									"total_tax": {										"description": "Line total tax (after discounts).",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"taxes": {										"description": "Line taxes.",										"type": "array",										"context": [ "view", "edit" ],										"readonly": true,										"items": {											"type": "object",											"properties": {												"id": {													"description": "Tax rate ID.",													"type": "integer",													"context": [														"view",														"edit"													],													"readonly": true												},												"total": {													"description": "Tax total.",													"type": "string",													"context": [														"view",														"edit"													],													"readonly": true												}											}										}									},									"meta_data": {										"description": "Meta data.",										"type": "array",										"context": [ "view", "edit" ],										"items": {											"type": "object",											"properties": {												"id": {													"description": "Meta ID.",													"type": "integer",													"context": [														"view",														"edit"													],													"readonly": true												},												"key": {													"description": "Meta key.",													"type": "string",													"context": [														"view",														"edit"													]												},												"value": {													"description": "Meta value.",													"type": "string",													"context": [														"view",														"edit"													]												}											}										}									}								}							}						},						"fee_lines": {							"required": false,							"description": "Fee lines data.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Item ID.",										"type": "integer",										"context": [ "view", "edit" ],										"readonly": true									},									"name": {										"description": "Fee name.",										"type": "string",										"context": [ "view", "edit" ]									},									"tax_class": {										"description": "Tax class of fee.",										"type": "string",										"context": [ "view", "edit" ]									},									"tax_status": {										"description": "Tax status of fee.",										"type": "string",										"context": [ "view", "edit" ],										"enum": [ "taxable", "none" ]									},									"total": {										"description": "Line total (after discounts).",										"type": "string",										"context": [ "view", "edit" ]									},									"total_tax": {										"description": "Line total tax (after discounts).",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"taxes": {										"description": "Line taxes.",										"type": "array",										"context": [ "view", "edit" ],										"readonly": true,										"items": {											"type": "object",											"properties": {												"id": {													"description": "Tax rate ID.",													"type": "integer",													"context": [														"view",														"edit"													],													"readonly": true												},												"total": {													"description": "Tax total.",													"type": "string",													"context": [														"view",														"edit"													],													"readonly": true												},												"subtotal": {													"description": "Tax subtotal.",													"type": "string",													"context": [														"view",														"edit"													],													"readonly": true												}											}										}									},									"meta_data": {										"description": "Meta data.",										"type": "array",										"context": [ "view", "edit" ],										"items": {											"type": "object",											"properties": {												"id": {													"description": "Meta ID.",													"type": "integer",													"context": [														"view",														"edit"													],													"readonly": true												},												"key": {													"description": "Meta key.",													"type": "string",													"context": [														"view",														"edit"													]												},												"value": {													"description": "Meta value.",													"type": "string",													"context": [														"view",														"edit"													]												}											}										}									}								}							}						},						"coupon_lines": {							"required": false,							"description": "Coupons line data.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Item ID.",										"type": "integer",										"context": [ "view", "edit" ],										"readonly": true									},									"code": {										"description": "Coupon code.",										"type": "string",										"context": [ "view", "edit" ]									},									"discount": {										"description": "Discount total.",										"type": "string",										"context": [ "view", "edit" ]									},									"discount_tax": {										"description": "Discount total tax.",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"meta_data": {										"description": "Meta data.",										"type": "array",										"context": [ "view", "edit" ],										"items": {											"type": "object",											"properties": {												"id": {													"description": "Meta ID.",													"type": "integer",													"context": [														"view",														"edit"													],													"readonly": true												},												"key": {													"description": "Meta key.",													"type": "string",													"context": [														"view",														"edit"													]												},												"value": {													"description": "Meta value.",													"type": "string",													"context": [														"view",														"edit"													]												}											}										}									}								}							}						},						"set_paid": {							"required": false,							"description": "Define if the order is paid. It will set the status to processing and reduce stock items.",							"type": "boolean"						}					}				},				{					"methods": [ "DELETE" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"force": {							"required": false,							"default": false,							"description": "Whether to bypass trash and force deletion.",							"type": "boolean"						}					}				}			]		},		"/wc/v3/orders/batch": {			"namespace": "wc/v3",			"methods": [ "POST", "PUT", "PATCH" ],			"endpoints": [				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"parent_id": {							"required": false,							"description": "Parent order ID.",							"type": "integer"						},						"status": {							"required": false,							"enum": [								"pending",								"processing",								"on-hold",								"completed",								"cancelled",								"refunded",								"failed"							],							"description": "Order status.",							"type": "string"						},						"currency": {							"required": false,							"enum": [								"AED",								"AFN",								"ALL",								"AMD",								"ANG",								"AOA",								"ARS",								"AUD",								"AWG",								"AZN",								"BAM",								"BBD",								"BDT",								"BGN",								"BHD",								"BIF",								"BMD",								"BND",								"BOB",								"BRL",								"BSD",								"BTC",								"BTN",								"BWP",								"BYR",								"BZD",								"CAD",								"CDF",								"CHF",								"CLP",								"CNY",								"COP",								"CRC",								"CUC",								"CUP",								"CVE",								"CZK",								"DJF",								"DKK",								"DOP",								"DZD",								"EGP",								"ERN",								"ETB",								"EUR",								"FJD",								"FKP",								"GBP",								"GEL",								"GGP",								"GHS",								"GIP",								"GMD",								"GNF",								"GTQ",								"GYD",								"HKD",								"HNL",								"HRK",								"HTG",								"HUF",								"IDR",								"ILS",								"IMP",								"INR",								"IQD",								"IRR",								"IRT",								"ISK",								"JEP",								"JMD",								"JOD",								"JPY",								"KES",								"KGS",								"KHR",								"KMF",								"KPW",								"KRW",								"KWD",								"KYD",								"KZT",								"LAK",								"LBP",								"LKR",								"LRD",								"LSL",								"LYD",								"MAD",								"MDL",								"MGA",								"MKD",								"MMK",								"MNT",								"MOP",								"MRO",								"MUR",								"MVR",								"MWK",								"MXN",								"MYR",								"MZN",								"NAD",								"NGN",								"NIO",								"NOK",								"NPR",								"NZD",								"OMR",								"PAB",								"PEN",								"PGK",								"PHP",								"PKR",								"PLN",								"PRB",								"PYG",								"QAR",								"RON",								"RSD",								"RUB",								"RWF",								"SAR",								"SBD",								"SCR",								"SDG",								"SEK",								"SGD",								"SHP",								"SLL",								"SOS",								"SRD",								"SSP",								"STD",								"SYP",								"SZL",								"THB",								"TJS",								"TMT",								"TND",								"TOP",								"TRY",								"TTD",								"TWD",								"TZS",								"UAH",								"UGX",								"USD",								"UYU",								"UZS",								"VEF",								"VND",								"VUV",								"WST",								"XAF",								"XCD",								"XOF",								"XPF",								"YER",								"ZAR",								"ZMW"							],							"description": "Currency the order was created with, in ISO format.",							"type": "string"						},						"customer_id": {							"required": false,							"description": "User ID who owns the order. 0 for guests.",							"type": "integer"						},						"customer_note": {							"required": false,							"description": "Note left by customer during checkout.",							"type": "string"						},						"billing": {							"required": false,							"description": "Billing address.",							"type": "object"						},						"shipping": {							"required": false,							"description": "Shipping address.",							"type": "object"						},						"payment_method": {							"required": false,							"description": "Payment method ID.",							"type": "string"						},						"payment_method_title": {							"required": false,							"description": "Payment method title.",							"type": "string"						},						"transaction_id": {							"required": false,							"description": "Unique transaction ID.",							"type": "string"						},						"meta_data": {							"required": false,							"description": "Meta data.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Meta ID.",										"type": "integer",										"context": [ "view", "edit" ],										"readonly": true									},									"key": {										"description": "Meta key.",										"type": "string",										"context": [ "view", "edit" ]									},									"value": {										"description": "Meta value.",										"type": "string",										"context": [ "view", "edit" ]									}								}							}						},						"line_items": {							"required": false,							"description": "Line items data.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Item ID.",										"type": "integer",										"context": [ "view", "edit" ],										"readonly": true									},									"name": {										"description": "Product name.",										"type": "string",										"context": [ "view", "edit" ]									},									"product_id": {										"description": "Product ID.",										"type": "integer",										"context": [ "view", "edit" ]									},									"variation_id": {										"description": "Variation ID, if applicable.",										"type": "integer",										"context": [ "view", "edit" ]									},									"quantity": {										"description": "Quantity ordered.",										"type": "integer",										"context": [ "view", "edit" ]									},									"tax_class": {										"description": "Tax class of product.",										"type": "integer",										"context": [ "view", "edit" ]									},									"subtotal": {										"description": "Line subtotal (before discounts).",										"type": "string",										"context": [ "view", "edit" ]									},									"subtotal_tax": {										"description": "Line subtotal tax (before discounts).",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"total": {										"description": "Line total (after discounts).",										"type": "string",										"context": [ "view", "edit" ]									},									"total_tax": {										"description": "Line total tax (after discounts).",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"taxes": {										"description": "Line taxes.",										"type": "array",										"context": [ "view", "edit" ],										"readonly": true,										"items": {											"type": "object",											"properties": {												"id": {													"description": "Tax rate ID.",													"type": "integer",													"context": [														"view",														"edit"													]												},												"total": {													"description": "Tax total.",													"type": "string",													"context": [														"view",														"edit"													]												},												"subtotal": {													"description": "Tax subtotal.",													"type": "string",													"context": [														"view",														"edit"													]												}											}										}									},									"meta_data": {										"description": "Meta data.",										"type": "array",										"context": [ "view", "edit" ],										"items": {											"type": "object",											"properties": {												"id": {													"description": "Meta ID.",													"type": "integer",													"context": [														"view",														"edit"													],													"readonly": true												},												"key": {													"description": "Meta key.",													"type": "string",													"context": [														"view",														"edit"													]												},												"value": {													"description": "Meta value.",													"type": "string",													"context": [														"view",														"edit"													]												}											}										}									},									"sku": {										"description": "Product SKU.",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"price": {										"description": "Product price.",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									}								}							}						},						"shipping_lines": {							"required": false,							"description": "Shipping lines data.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Item ID.",										"type": "integer",										"context": [ "view", "edit" ],										"readonly": true									},									"method_title": {										"description": "Shipping method name.",										"type": "string",										"context": [ "view", "edit" ]									},									"method_id": {										"description": "Shipping method ID.",										"type": "string",										"context": [ "view", "edit" ]									},									"total": {										"description": "Line total (after discounts).",										"type": "string",										"context": [ "view", "edit" ]									},									"total_tax": {										"description": "Line total tax (after discounts).",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"taxes": {										"description": "Line taxes.",										"type": "array",										"context": [ "view", "edit" ],										"readonly": true,										"items": {											"type": "object",											"properties": {												"id": {													"description": "Tax rate ID.",													"type": "integer",													"context": [														"view",														"edit"													],													"readonly": true												},												"total": {													"description": "Tax total.",													"type": "string",													"context": [														"view",														"edit"													],													"readonly": true												}											}										}									},									"meta_data": {										"description": "Meta data.",										"type": "array",										"context": [ "view", "edit" ],										"items": {											"type": "object",											"properties": {												"id": {													"description": "Meta ID.",													"type": "integer",													"context": [														"view",														"edit"													],													"readonly": true												},												"key": {													"description": "Meta key.",													"type": "string",													"context": [														"view",														"edit"													]												},												"value": {													"description": "Meta value.",													"type": "string",													"context": [														"view",														"edit"													]												}											}										}									}								}							}						},						"fee_lines": {							"required": false,							"description": "Fee lines data.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Item ID.",										"type": "integer",										"context": [ "view", "edit" ],										"readonly": true									},									"name": {										"description": "Fee name.",										"type": "string",										"context": [ "view", "edit" ]									},									"tax_class": {										"description": "Tax class of fee.",										"type": "string",										"context": [ "view", "edit" ]									},									"tax_status": {										"description": "Tax status of fee.",										"type": "string",										"context": [ "view", "edit" ],										"enum": [ "taxable", "none" ]									},									"total": {										"description": "Line total (after discounts).",										"type": "string",										"context": [ "view", "edit" ]									},									"total_tax": {										"description": "Line total tax (after discounts).",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"taxes": {										"description": "Line taxes.",										"type": "array",										"context": [ "view", "edit" ],										"readonly": true,										"items": {											"type": "object",											"properties": {												"id": {													"description": "Tax rate ID.",													"type": "integer",													"context": [														"view",														"edit"													],													"readonly": true												},												"total": {													"description": "Tax total.",													"type": "string",													"context": [														"view",														"edit"													],													"readonly": true												},												"subtotal": {													"description": "Tax subtotal.",													"type": "string",													"context": [														"view",														"edit"													],													"readonly": true												}											}										}									},									"meta_data": {										"description": "Meta data.",										"type": "array",										"context": [ "view", "edit" ],										"items": {											"type": "object",											"properties": {												"id": {													"description": "Meta ID.",													"type": "integer",													"context": [														"view",														"edit"													],													"readonly": true												},												"key": {													"description": "Meta key.",													"type": "string",													"context": [														"view",														"edit"													]												},												"value": {													"description": "Meta value.",													"type": "string",													"context": [														"view",														"edit"													]												}											}										}									}								}							}						},						"coupon_lines": {							"required": false,							"description": "Coupons line data.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Item ID.",										"type": "integer",										"context": [ "view", "edit" ],										"readonly": true									},									"code": {										"description": "Coupon code.",										"type": "string",										"context": [ "view", "edit" ]									},									"discount": {										"description": "Discount total.",										"type": "string",										"context": [ "view", "edit" ]									},									"discount_tax": {										"description": "Discount total tax.",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"meta_data": {										"description": "Meta data.",										"type": "array",										"context": [ "view", "edit" ],										"items": {											"type": "object",											"properties": {												"id": {													"description": "Meta ID.",													"type": "integer",													"context": [														"view",														"edit"													],													"readonly": true												},												"key": {													"description": "Meta key.",													"type": "string",													"context": [														"view",														"edit"													]												},												"value": {													"description": "Meta value.",													"type": "string",													"context": [														"view",														"edit"													]												}											}										}									}								}							}						},						"set_paid": {							"required": false,							"description": "Define if the order is paid. It will set the status to processing and reduce stock items.",							"type": "boolean"						}					}				}			],			"_links": {				"self": "https://example.com/wp-json/wc/v3/orders/batch"			}		},		"/wc/v3/products/attributes/(?P<attribute_id>[\\d]+)/terms": {			"namespace": "wc/v3",			"methods": [ "GET", "POST" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"attribute_id": {							"required": false,							"description": "Unique identifier for the attribute of the terms.",							"type": "integer"						},						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						},						"page": {							"required": false,							"default": 1,							"description": "Current page of the collection.",							"type": "integer"						},						"per_page": {							"required": false,							"default": 10,							"description": "Maximum number of items to be returned in result set.",							"type": "integer"						},						"search": {							"required": false,							"description": "Limit results to those matching a string.",							"type": "string"						},						"exclude": {							"required": false,							"default": [],							"description": "Ensure result set excludes specific ids.",							"type": "array",							"items": {								"type": "integer"							}						},						"include": {							"required": false,							"default": [],							"description": "Limit result set to specific ids.",							"type": "array",							"items": {								"type": "integer"							}						},						"order": {							"required": false,							"default": "asc",							"enum": [ "asc", "desc" ],							"description": "Order sort attribute ascending or descending.",							"type": "string"						},						"orderby": {							"required": false,							"default": "name",							"enum": [								"id",								"include",								"name",								"slug",								"term_group",								"description",								"count"							],							"description": "Sort collection by resource attribute.",							"type": "string"						},						"hide_empty": {							"required": false,							"default": false,							"description": "Whether to hide resources not assigned to any products.",							"type": "boolean"						},						"parent": {							"required": false,							"description": "Limit result set to resources assigned to a specific parent.",							"type": "integer"						},						"product": {							"required": false,							"description": "Limit result set to resources assigned to a specific product.",							"type": "integer"						},						"slug": {							"required": false,							"description": "Limit result set to resources with a specific slug.",							"type": "string"						}					}				},				{					"methods": [ "POST" ],					"args": {						"attribute_id": {							"required": false,							"description": "Unique identifier for the attribute of the terms.",							"type": "integer"						},						"name": {							"required": true,							"description": "Name for the resource.",							"type": "string"						},						"slug": {							"required": false,							"description": "An alphanumeric identifier for the resource unique to its type.",							"type": "string"						},						"description": {							"required": false,							"description": "HTML description of the resource.",							"type": "string"						},						"menu_order": {							"required": false,							"description": "Menu order, used to custom sort the resource.",							"type": "integer"						}					}				}			]		},		"/wc/v3/products/attributes/(?P<attribute_id>[\\d]+)/terms/(?P<id>[\\d]+)": {			"namespace": "wc/v3",			"methods": [ "GET", "POST", "PUT", "PATCH", "DELETE" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"attribute_id": {							"required": false,							"description": "Unique identifier for the attribute of the terms.",							"type": "integer"						},						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						}					}				},				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"attribute_id": {							"required": false,							"description": "Unique identifier for the attribute of the terms.",							"type": "integer"						},						"name": {							"required": false,							"description": "Term name.",							"type": "string"						},						"slug": {							"required": false,							"description": "An alphanumeric identifier for the resource unique to its type.",							"type": "string"						},						"description": {							"required": false,							"description": "HTML description of the resource.",							"type": "string"						},						"menu_order": {							"required": false,							"description": "Menu order, used to custom sort the resource.",							"type": "integer"						}					}				},				{					"methods": [ "DELETE" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"attribute_id": {							"required": false,							"description": "Unique identifier for the attribute of the terms.",							"type": "integer"						},						"force": {							"required": false,							"default": false,							"description": "Required to be true, as resource does not support trashing.",							"type": "boolean"						}					}				}			]		},		"/wc/v3/products/attributes/(?P<attribute_id>[\\d]+)/terms/batch": {			"namespace": "wc/v3",			"methods": [ "POST", "PUT", "PATCH" ],			"endpoints": [				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"attribute_id": {							"required": false,							"description": "Unique identifier for the attribute of the terms.",							"type": "integer"						},						"name": {							"required": false,							"description": "Term name.",							"type": "string"						},						"slug": {							"required": false,							"description": "An alphanumeric identifier for the resource unique to its type.",							"type": "string"						},						"description": {							"required": false,							"description": "HTML description of the resource.",							"type": "string"						},						"menu_order": {							"required": false,							"description": "Menu order, used to custom sort the resource.",							"type": "integer"						}					}				}			]		},		"/wc/v3/products/attributes": {			"namespace": "wc/v3",			"methods": [ "GET", "POST" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						}					}				},				{					"methods": [ "POST" ],					"args": {						"name": {							"required": true,							"description": "Name for the resource.",							"type": "string"						},						"slug": {							"required": false,							"description": "An alphanumeric identifier for the resource unique to its type.",							"type": "string"						},						"type": {							"required": false,							"default": "select",							"enum": [ "select", "text" ],							"description": "Type of attribute.",							"type": "string"						},						"order_by": {							"required": false,							"default": "menu_order",							"enum": [ "menu_order", "name", "name_num", "id" ],							"description": "Default sort order.",							"type": "string"						},						"has_archives": {							"required": false,							"default": false,							"description": "Enable/Disable attribute archives.",							"type": "boolean"						}					}				}			],			"_links": {				"self": "https://example.com/wp-json/wc/v3/products/attributes"			}		},		"/wc/v3/products/attributes/(?P<id>[\\d]+)": {			"namespace": "wc/v3",			"methods": [ "GET", "POST", "PUT", "PATCH", "DELETE" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						}					}				},				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"name": {							"required": false,							"description": "Attribute name.",							"type": "string"						},						"slug": {							"required": false,							"description": "An alphanumeric identifier for the resource unique to its type.",							"type": "string"						},						"type": {							"required": false,							"enum": [ "select", "text" ],							"description": "Type of attribute.",							"type": "string"						},						"order_by": {							"required": false,							"enum": [ "menu_order", "name", "name_num", "id" ],							"description": "Default sort order.",							"type": "string"						},						"has_archives": {							"required": false,							"description": "Enable/Disable attribute archives.",							"type": "boolean"						}					}				},				{					"methods": [ "DELETE" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"force": {							"required": false,							"default": true,							"description": "Required to be true, as resource does not support trashing.",							"type": "boolean"						}					}				}			]		},		"/wc/v3/products/attributes/batch": {			"namespace": "wc/v3",			"methods": [ "POST", "PUT", "PATCH" ],			"endpoints": [				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"name": {							"required": false,							"description": "Attribute name.",							"type": "string"						},						"slug": {							"required": false,							"description": "An alphanumeric identifier for the resource unique to its type.",							"type": "string"						},						"type": {							"required": false,							"enum": [ "select", "text" ],							"description": "Type of attribute.",							"type": "string"						},						"order_by": {							"required": false,							"enum": [ "menu_order", "name", "name_num", "id" ],							"description": "Default sort order.",							"type": "string"						},						"has_archives": {							"required": false,							"description": "Enable/Disable attribute archives.",							"type": "boolean"						}					}				}			],			"_links": {				"self": "https://example.com/wp-json/wc/v3/products/attributes/batch"			}		},		"/wc/v3/products/categories": {			"namespace": "wc/v3",			"methods": [ "GET", "POST" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						},						"page": {							"required": false,							"default": 1,							"description": "Current page of the collection.",							"type": "integer"						},						"per_page": {							"required": false,							"default": 10,							"description": "Maximum number of items to be returned in result set.",							"type": "integer"						},						"search": {							"required": false,							"description": "Limit results to those matching a string.",							"type": "string"						},						"exclude": {							"required": false,							"default": [],							"description": "Ensure result set excludes specific ids.",							"type": "array",							"items": {								"type": "integer"							}						},						"include": {							"required": false,							"default": [],							"description": "Limit result set to specific ids.",							"type": "array",							"items": {								"type": "integer"							}						},						"order": {							"required": false,							"default": "asc",							"enum": [ "asc", "desc" ],							"description": "Order sort attribute ascending or descending.",							"type": "string"						},						"orderby": {							"required": false,							"default": "name",							"enum": [								"id",								"include",								"name",								"slug",								"term_group",								"description",								"count"							],							"description": "Sort collection by resource attribute.",							"type": "string"						},						"hide_empty": {							"required": false,							"default": false,							"description": "Whether to hide resources not assigned to any products.",							"type": "boolean"						},						"parent": {							"required": false,							"description": "Limit result set to resources assigned to a specific parent.",							"type": "integer"						},						"product": {							"required": false,							"description": "Limit result set to resources assigned to a specific product.",							"type": "integer"						},						"slug": {							"required": false,							"description": "Limit result set to resources with a specific slug.",							"type": "string"						}					}				},				{					"methods": [ "POST" ],					"args": {						"name": {							"required": true,							"description": "Name for the resource.",							"type": "string"						},						"slug": {							"required": false,							"description": "An alphanumeric identifier for the resource unique to its type.",							"type": "string"						},						"parent": {							"required": false,							"description": "The ID for the parent of the resource.",							"type": "integer"						},						"description": {							"required": false,							"description": "HTML description of the resource.",							"type": "string"						},						"display": {							"required": false,							"default": "default",							"enum": [								"default",								"products",								"subcategories",								"both"							],							"description": "Category archive display type.",							"type": "string"						},						"image": {							"required": false,							"description": "Image data.",							"type": "object"						},						"menu_order": {							"required": false,							"description": "Menu order, used to custom sort the resource.",							"type": "integer"						}					}				}			],			"_links": {				"self": "https://example.com/wp-json/wc/v3/products/categories"			}		},		"/wc/v3/products/categories/(?P<id>[\\d]+)": {			"namespace": "wc/v3",			"methods": [ "GET", "POST", "PUT", "PATCH", "DELETE" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						}					}				},				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"name": {							"required": false,							"description": "Category name.",							"type": "string"						},						"slug": {							"required": false,							"description": "An alphanumeric identifier for the resource unique to its type.",							"type": "string"						},						"parent": {							"required": false,							"description": "The ID for the parent of the resource.",							"type": "integer"						},						"description": {							"required": false,							"description": "HTML description of the resource.",							"type": "string"						},						"display": {							"required": false,							"enum": [								"default",								"products",								"subcategories",								"both"							],							"description": "Category archive display type.",							"type": "string"						},						"image": {							"required": false,							"description": "Image data.",							"type": "object"						},						"menu_order": {							"required": false,							"description": "Menu order, used to custom sort the resource.",							"type": "integer"						}					}				},				{					"methods": [ "DELETE" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"force": {							"required": false,							"default": false,							"description": "Required to be true, as resource does not support trashing.",							"type": "boolean"						}					}				}			]		},		"/wc/v3/products/categories/batch": {			"namespace": "wc/v3",			"methods": [ "POST", "PUT", "PATCH" ],			"endpoints": [				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"name": {							"required": false,							"description": "Category name.",							"type": "string"						},						"slug": {							"required": false,							"description": "An alphanumeric identifier for the resource unique to its type.",							"type": "string"						},						"parent": {							"required": false,							"description": "The ID for the parent of the resource.",							"type": "integer"						},						"description": {							"required": false,							"description": "HTML description of the resource.",							"type": "string"						},						"display": {							"required": false,							"enum": [								"default",								"products",								"subcategories",								"both"							],							"description": "Category archive display type.",							"type": "string"						},						"image": {							"required": false,							"description": "Image data.",							"type": "object"						},						"menu_order": {							"required": false,							"description": "Menu order, used to custom sort the resource.",							"type": "integer"						}					}				}			],			"_links": {				"self": "https://example.com/wp-json/wc/v3/products/categories/batch"			}		},		"/wc/v3/products/(?P<product_id>[\\d]+)/reviews": {			"namespace": "wc/v3",			"methods": [ "GET", "POST" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"product_id": {							"required": false,							"description": "Unique identifier for the variable product.",							"type": "integer"						},						"id": {							"required": false,							"description": "Unique identifier for the variation.",							"type": "integer"						},						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						}					}				},				{					"methods": [ "POST" ],					"args": {						"product_id": {							"required": false,							"description": "Unique identifier for the variable product.",							"type": "integer"						},						"id": {							"required": false,							"description": "Unique identifier for the variation.",							"type": "integer"						},						"review": {							"required": true,							"description": "Review content.",							"type": "string"						},						"date_created": {							"required": false,							"description": "The date the review was created, in the site's timezone.",							"type": "date-time"						},						"date_created_gmt": {							"required": false,							"description": "The date the review was created, as GMT.",							"type": "date-time"						},						"rating": {							"required": false,							"description": "Review rating (0 to 5).",							"type": "integer"						},						"name": {							"required": true,							"description": "Name of the reviewer.",							"type": "string"						},						"email": {							"required": true,							"description": "Email of the reviewer.",							"type": "string"						}					}				}			]		},		"/wc/v3/products/(?P<product_id>[\\d]+)/reviews/(?P<id>[\\d]+)": {			"namespace": "wc/v3",			"methods": [ "GET", "POST", "PUT", "PATCH", "DELETE" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"product_id": {							"required": false,							"description": "Unique identifier for the variable product.",							"type": "integer"						},						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						}					}				},				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"product_id": {							"required": false,							"description": "Unique identifier for the variable product.",							"type": "integer"						},						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"review": {							"required": false,							"description": "The content of the review.",							"type": "string"						},						"date_created": {							"required": false,							"description": "The date the review was created, in the site's timezone.",							"type": "date-time"						},						"date_created_gmt": {							"required": false,							"description": "The date the review was created, as GMT.",							"type": "date-time"						},						"rating": {							"required": false,							"description": "Review rating (0 to 5).",							"type": "integer"						},						"name": {							"required": false,							"description": "Reviewer name.",							"type": "string"						},						"email": {							"required": false,							"description": "Reviewer email.",							"type": "string"						}					}				},				{					"methods": [ "DELETE" ],					"args": {						"product_id": {							"required": false,							"description": "Unique identifier for the variable product.",							"type": "integer"						},						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"force": {							"required": false,							"default": false,							"description": "Whether to bypass trash and force deletion.",							"type": "boolean"						}					}				}			]		},		"/wc/v3/products/(?P<product_id>[\\d]+)/reviews/batch": {			"namespace": "wc/v3",			"methods": [ "POST", "PUT", "PATCH" ],			"endpoints": [				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"product_id": {							"required": false,							"description": "Unique identifier for the variable product.",							"type": "integer"						},						"review": {							"required": false,							"description": "The content of the review.",							"type": "string"						},						"date_created": {							"required": false,							"description": "The date the review was created, in the site's timezone.",							"type": "date-time"						},						"date_created_gmt": {							"required": false,							"description": "The date the review was created, as GMT.",							"type": "date-time"						},						"rating": {							"required": false,							"description": "Review rating (0 to 5).",							"type": "integer"						},						"name": {							"required": false,							"description": "Reviewer name.",							"type": "string"						},						"email": {							"required": false,							"description": "Reviewer email.",							"type": "string"						}					}				}			]		},		"/wc/v3/products/shipping_classes": {			"namespace": "wc/v3",			"methods": [ "GET", "POST" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						},						"page": {							"required": false,							"default": 1,							"description": "Current page of the collection.",							"type": "integer"						},						"per_page": {							"required": false,							"default": 10,							"description": "Maximum number of items to be returned in result set.",							"type": "integer"						},						"search": {							"required": false,							"description": "Limit results to those matching a string.",							"type": "string"						},						"exclude": {							"required": false,							"default": [],							"description": "Ensure result set excludes specific ids.",							"type": "array",							"items": {								"type": "integer"							}						},						"include": {							"required": false,							"default": [],							"description": "Limit result set to specific ids.",							"type": "array",							"items": {								"type": "integer"							}						},						"offset": {							"required": false,							"description": "Offset the result set by a specific number of items.",							"type": "integer"						},						"order": {							"required": false,							"default": "asc",							"enum": [ "asc", "desc" ],							"description": "Order sort attribute ascending or descending.",							"type": "string"						},						"orderby": {							"required": false,							"default": "name",							"enum": [								"id",								"include",								"name",								"slug",								"term_group",								"description",								"count"							],							"description": "Sort collection by resource attribute.",							"type": "string"						},						"hide_empty": {							"required": false,							"default": false,							"description": "Whether to hide resources not assigned to any products.",							"type": "boolean"						},						"product": {							"required": false,							"description": "Limit result set to resources assigned to a specific product.",							"type": "integer"						},						"slug": {							"required": false,							"description": "Limit result set to resources with a specific slug.",							"type": "string"						}					}				},				{					"methods": [ "POST" ],					"args": {						"name": {							"required": true,							"description": "Name for the resource.",							"type": "string"						},						"slug": {							"required": false,							"description": "An alphanumeric identifier for the resource unique to its type.",							"type": "string"						},						"description": {							"required": false,							"description": "HTML description of the resource.",							"type": "string"						}					}				}			],			"_links": {				"self": "https://example.com/wp-json/wc/v3/products/shipping_classes"			}		},		"/wc/v3/products/shipping_classes/(?P<id>[\\d]+)": {			"namespace": "wc/v3",			"methods": [ "GET", "POST", "PUT", "PATCH", "DELETE" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						}					}				},				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"name": {							"required": false,							"description": "Shipping class name.",							"type": "string"						},						"slug": {							"required": false,							"description": "An alphanumeric identifier for the resource unique to its type.",							"type": "string"						},						"description": {							"required": false,							"description": "HTML description of the resource.",							"type": "string"						}					}				},				{					"methods": [ "DELETE" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"force": {							"required": false,							"default": false,							"description": "Required to be true, as resource does not support trashing.",							"type": "boolean"						}					}				}			]		},		"/wc/v3/products/shipping_classes/batch": {			"namespace": "wc/v3",			"methods": [ "POST", "PUT", "PATCH" ],			"endpoints": [				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"name": {							"required": false,							"description": "Shipping class name.",							"type": "string"						},						"slug": {							"required": false,							"description": "An alphanumeric identifier for the resource unique to its type.",							"type": "string"						},						"description": {							"required": false,							"description": "HTML description of the resource.",							"type": "string"						}					}				}			],			"_links": {				"self": "https://example.com/wp-json/wc/v3/products/shipping_classes/batch"			}		},		"/wc/v3/products/tags": {			"namespace": "wc/v3",			"methods": [ "GET", "POST" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						},						"page": {							"required": false,							"default": 1,							"description": "Current page of the collection.",							"type": "integer"						},						"per_page": {							"required": false,							"default": 10,							"description": "Maximum number of items to be returned in result set.",							"type": "integer"						},						"search": {							"required": false,							"description": "Limit results to those matching a string.",							"type": "string"						},						"exclude": {							"required": false,							"default": [],							"description": "Ensure result set excludes specific ids.",							"type": "array",							"items": {								"type": "integer"							}						},						"include": {							"required": false,							"default": [],							"description": "Limit result set to specific ids.",							"type": "array",							"items": {								"type": "integer"							}						},						"offset": {							"required": false,							"description": "Offset the result set by a specific number of items.",							"type": "integer"						},						"order": {							"required": false,							"default": "asc",							"enum": [ "asc", "desc" ],							"description": "Order sort attribute ascending or descending.",							"type": "string"						},						"orderby": {							"required": false,							"default": "name",							"enum": [								"id",								"include",								"name",								"slug",								"term_group",								"description",								"count"							],							"description": "Sort collection by resource attribute.",							"type": "string"						},						"hide_empty": {							"required": false,							"default": false,							"description": "Whether to hide resources not assigned to any products.",							"type": "boolean"						},						"product": {							"required": false,							"description": "Limit result set to resources assigned to a specific product.",							"type": "integer"						},						"slug": {							"required": false,							"description": "Limit result set to resources with a specific slug.",							"type": "string"						}					}				},				{					"methods": [ "POST" ],					"args": {						"name": {							"required": true,							"description": "Name for the resource.",							"type": "string"						},						"slug": {							"required": false,							"description": "An alphanumeric identifier for the resource unique to its type.",							"type": "string"						},						"description": {							"required": false,							"description": "HTML description of the resource.",							"type": "string"						}					}				}			],			"_links": {				"self": "https://example.com/wp-json/wc/v3/products/tags"			}		},		"/wc/v3/products/tags/(?P<id>[\\d]+)": {			"namespace": "wc/v3",			"methods": [ "GET", "POST", "PUT", "PATCH", "DELETE" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						}					}				},				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"name": {							"required": false,							"description": "Tag name.",							"type": "string"						},						"slug": {							"required": false,							"description": "An alphanumeric identifier for the resource unique to its type.",							"type": "string"						},						"description": {							"required": false,							"description": "HTML description of the resource.",							"type": "string"						}					}				},				{					"methods": [ "DELETE" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"force": {							"required": false,							"default": false,							"description": "Required to be true, as resource does not support trashing.",							"type": "boolean"						}					}				}			]		},		"/wc/v3/products/tags/batch": {			"namespace": "wc/v3",			"methods": [ "POST", "PUT", "PATCH" ],			"endpoints": [				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"name": {							"required": false,							"description": "Tag name.",							"type": "string"						},						"slug": {							"required": false,							"description": "An alphanumeric identifier for the resource unique to its type.",							"type": "string"						},						"description": {							"required": false,							"description": "HTML description of the resource.",							"type": "string"						}					}				}			],			"_links": {				"self": "https://example.com/wp-json/wc/v3/products/tags/batch"			}		},		"/wc/v3/products": {			"namespace": "wc/v3",			"methods": [ "GET", "POST" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						},						"page": {							"required": false,							"default": 1,							"description": "Current page of the collection.",							"type": "integer"						},						"per_page": {							"required": false,							"default": 10,							"description": "Maximum number of items to be returned in result set.",							"type": "integer"						},						"search": {							"required": false,							"description": "Limit results to those matching a string.",							"type": "string"						},						"after": {							"required": false,							"description": "Limit response to resources published after a given ISO8601 compliant date.",							"type": "string"						},						"before": {							"required": false,							"description": "Limit response to resources published before a given ISO8601 compliant date.",							"type": "string"						},						"exclude": {							"required": false,							"default": [],							"description": "Ensure result set excludes specific IDs.",							"type": "array",							"items": {								"type": "integer"							}						},						"include": {							"required": false,							"default": [],							"description": "Limit result set to specific ids.",							"type": "array",							"items": {								"type": "integer"							}						},						"offset": {							"required": false,							"description": "Offset the result set by a specific number of items.",							"type": "integer"						},						"order": {							"required": false,							"default": "desc",							"enum": [ "asc", "desc" ],							"description": "Order sort attribute ascending or descending.",							"type": "string"						},						"orderby": {							"required": false,							"default": "date",							"enum": [								"date",								"id",								"include",								"title",								"slug",								"price",								"popularity",								"rating"							],							"description": "Sort collection by object attribute.",							"type": "string"						},						"parent": {							"required": false,							"default": [],							"description": "Limit result set to those of particular parent IDs.",							"type": "array",							"items": {								"type": "integer"							}						},						"parent_exclude": {							"required": false,							"default": [],							"description": "Limit result set to all items except those of a particular parent ID.",							"type": "array",							"items": {								"type": "integer"							}						},						"slug": {							"required": false,							"description": "Limit result set to products with a specific slug.",							"type": "string"						},						"status": {							"required": false,							"default": "any",							"enum": [								"any",								"draft",								"pending",								"private",								"publish"							],							"description": "Limit result set to products assigned a specific status.",							"type": "string"						},						"type": {							"required": false,							"enum": [								"simple",								"grouped",								"external",								"variable"							],							"description": "Limit result set to products assigned a specific type.",							"type": "string"						},						"sku": {							"required": false,							"description": "Limit result set to products with a specific SKU.",							"type": "string"						},						"featured": {							"required": false,							"description": "Limit result set to featured products.",							"type": "boolean"						},						"category": {							"required": false,							"description": "Limit result set to products assigned a specific category ID.",							"type": "string"						},						"tag": {							"required": false,							"description": "Limit result set to products assigned a specific tag ID.",							"type": "string"						},						"shipping_class": {							"required": false,							"description": "Limit result set to products assigned a specific shipping class ID.",							"type": "string"						},						"attribute": {							"required": false,							"description": "Limit result set to products with a specific attribute.",							"type": "string"						},						"attribute_term": {							"required": false,							"description": "Limit result set to products with a specific attribute term ID (required an assigned attribute).",							"type": "string"						},						"tax_class": {							"required": false,							"enum": [ "standard", "reduced-rate", "zero-rate" ],							"description": "Limit result set to products with a specific tax class.",							"type": "string"						},						"in_stock": {							"required": false,							"description": "Limit result set to products in stock or out of stock.",							"type": "boolean"						},						"on_sale": {							"required": false,							"description": "Limit result set to products on sale.",							"type": "boolean"						},						"min_price": {							"required": false,							"description": "Limit result set to products based on a minimum price.",							"type": "string"						},						"max_price": {							"required": false,							"description": "Limit result set to products based on a maximum price.",							"type": "string"						}					}				},				{					"methods": [ "POST" ],					"args": {						"name": {							"required": false,							"description": "Product name.",							"type": "string"						},						"slug": {							"required": false,							"description": "Product slug.",							"type": "string"						},						"type": {							"required": false,							"default": "simple",							"enum": [								"simple",								"grouped",								"external",								"variable"							],							"description": "Product type.",							"type": "string"						},						"status": {							"required": false,							"default": "publish",							"enum": [								"draft",								"pending",								"private",								"publish"							],							"description": "Product status (post status).",							"type": "string"						},						"featured": {							"required": false,							"default": false,							"description": "Featured product.",							"type": "boolean"						},						"catalog_visibility": {							"required": false,							"default": "visible",							"enum": [								"visible",								"catalog",								"search",								"hidden"							],							"description": "Catalog visibility.",							"type": "string"						},						"description": {							"required": false,							"description": "Product description.",							"type": "string"						},						"short_description": {							"required": false,							"description": "Product short description.",							"type": "string"						},						"sku": {							"required": false,							"description": "Unique identifier.",							"type": "string"						},						"regular_price": {							"required": false,							"description": "Product regular price.",							"type": "string"						},						"sale_price": {							"required": false,							"description": "Product sale price.",							"type": "string"						},						"date_on_sale_from": {							"required": false,							"description": "Start date of sale price, in the site's timezone.",							"type": "date-time"						},						"date_on_sale_from_gmt": {							"required": false,							"description": "Start date of sale price, as GMT.",							"type": "date-time"						},						"date_on_sale_to": {							"required": false,							"description": "End date of sale price, in the site's timezone.",							"type": "date-time"						},						"date_on_sale_to_gmt": {							"required": false,							"description": "End date of sale price, in the site's timezone.",							"type": "date-time"						},						"virtual": {							"required": false,							"default": false,							"description": "If the product is virtual.",							"type": "boolean"						},						"downloadable": {							"required": false,							"default": false,							"description": "If the product is downloadable.",							"type": "boolean"						},						"downloads": {							"required": false,							"description": "List of downloadable files.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "File ID.",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"name": {										"description": "File name.",										"type": "string",										"context": [ "view", "edit" ]									},									"file": {										"description": "File URL.",										"type": "string",										"context": [ "view", "edit" ]									}								}							}						},						"download_limit": {							"required": false,							"default": -1,							"description": "Number of times downloadable files can be downloaded after purchase.",							"type": "integer"						},						"download_expiry": {							"required": false,							"default": -1,							"description": "Number of days until access to downloadable files expires.",							"type": "integer"						},						"external_url": {							"required": false,							"description": "Product external URL. Only for external products.",							"type": "string"						},						"button_text": {							"required": false,							"description": "Product external button text. Only for external products.",							"type": "string"						},						"tax_status": {							"required": false,							"default": "taxable",							"enum": [ "taxable", "shipping", "none" ],							"description": "Tax status.",							"type": "string"						},						"tax_class": {							"required": false,							"description": "Tax class.",							"type": "string"						},						"manage_stock": {							"required": false,							"default": false,							"description": "Stock management at product level.",							"type": "boolean"						},						"stock_quantity": {							"required": false,							"description": "Stock quantity.",							"type": "integer"						},						"in_stock": {							"required": false,							"default": true,							"description": "Controls whether or not the product is listed as \"in stock\" or \"out of stock\" on the frontend.",							"type": "boolean"						},						"backorders": {							"required": false,							"default": "no",							"enum": [ "no", "notify", "yes" ],							"description": "If managing stock, this controls if backorders are allowed.",							"type": "string"						},						"sold_individually": {							"required": false,							"default": false,							"description": "Allow one item to be bought in a single order.",							"type": "boolean"						},						"weight": {							"required": false,							"description": "Product weight (kg).",							"type": "string"						},						"dimensions": {							"required": false,							"description": "Product dimensions.",							"type": "object"						},						"shipping_class": {							"required": false,							"description": "Shipping class slug.",							"type": "string"						},						"reviews_allowed": {							"required": false,							"default": true,							"description": "Allow reviews.",							"type": "boolean"						},						"upsell_ids": {							"required": false,							"description": "List of up-sell products IDs.",							"type": "array",							"items": {								"type": "integer"							}						},						"cross_sell_ids": {							"required": false,							"description": "List of cross-sell products IDs.",							"type": "array",							"items": {								"type": "integer"							}						},						"parent_id": {							"required": false,							"description": "Product parent ID.",							"type": "integer"						},						"purchase_note": {							"required": false,							"description": "Optional note to send the customer after purchase.",							"type": "string"						},						"categories": {							"required": false,							"description": "List of categories.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Category ID.",										"type": "integer",										"context": [ "view", "edit" ]									},									"name": {										"description": "Category name.",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"slug": {										"description": "Category slug.",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									}								}							}						},						"tags": {							"required": false,							"description": "List of tags.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Tag ID.",										"type": "integer",										"context": [ "view", "edit" ]									},									"name": {										"description": "Tag name.",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"slug": {										"description": "Tag slug.",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									}								}							}						},						"images": {							"required": false,							"description": "List of images.",							"type": "object",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Image ID.",										"type": "integer",										"context": [ "view", "edit" ]									},									"date_created": {										"description": "The date the image was created, in the site's timezone.",										"type": "date-time",										"context": [ "view", "edit" ],										"readonly": true									},									"date_created_gmt": {										"description": "The date the image was created, as GMT.",										"type": "date-time",										"context": [ "view", "edit" ],										"readonly": true									},									"date_modified": {										"description": "The date the image was last modified, in the site's timezone.",										"type": "date-time",										"context": [ "view", "edit" ],										"readonly": true									},									"date_modified_gmt": {										"description": "The date the image was last modified, as GMT.",										"type": "date-time",										"context": [ "view", "edit" ],										"readonly": true									},									"src": {										"description": "Image URL.",										"type": "string",										"format": "uri",										"context": [ "view", "edit" ]									},									"name": {										"description": "Image name.",										"type": "string",										"context": [ "view", "edit" ]									},									"alt": {										"description": "Image alternative text.",										"type": "string",										"context": [ "view", "edit" ]									},									"position": {										"description": "Image position. 0 means that the image is featured.",										"type": "integer",										"context": [ "view", "edit" ]									}								}							}						},						"attributes": {							"required": false,							"description": "List of attributes.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Attribute ID.",										"type": "integer",										"context": [ "view", "edit" ]									},									"name": {										"description": "Attribute name.",										"type": "string",										"context": [ "view", "edit" ]									},									"position": {										"description": "Attribute position.",										"type": "integer",										"context": [ "view", "edit" ]									},									"visible": {										"description": "Define if the attribute is visible on the \"Additional information\" tab in the product's page.",										"type": "boolean",										"default": false,										"context": [ "view", "edit" ]									},									"variation": {										"description": "Define if the attribute can be used as variation.",										"type": "boolean",										"default": false,										"context": [ "view", "edit" ]									},									"options": {										"description": "List of available term names of the attribute.",										"type": "array",										"context": [ "view", "edit" ]									}								}							}						},						"default_attributes": {							"required": false,							"description": "Defaults variation attributes.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Attribute ID.",										"type": "integer",										"context": [ "view", "edit" ]									},									"name": {										"description": "Attribute name.",										"type": "string",										"context": [ "view", "edit" ]									},									"option": {										"description": "Selected attribute term name.",										"type": "string",										"context": [ "view", "edit" ]									}								}							}						},						"menu_order": {							"required": false,							"description": "Menu order, used to custom sort products.",							"type": "integer"						},						"meta_data": {							"required": false,							"description": "Meta data.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Meta ID.",										"type": "integer",										"context": [ "view", "edit" ],										"readonly": true									},									"key": {										"description": "Meta key.",										"type": "string",										"context": [ "view", "edit" ]									},									"value": {										"description": "Meta value.",										"type": "string",										"context": [ "view", "edit" ]									}								}							}						}					}				}			],			"_links": {				"self": "https://example.com/wp-json/wc/v3/products"			}		},		"/wc/v3/products/(?P<id>[\\d]+)": {			"namespace": "wc/v3",			"methods": [ "GET", "POST", "PUT", "PATCH", "DELETE" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						}					}				},				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"name": {							"required": false,							"description": "Product name.",							"type": "string"						},						"slug": {							"required": false,							"description": "Product slug.",							"type": "string"						},						"type": {							"required": false,							"enum": [								"simple",								"grouped",								"external",								"variable"							],							"description": "Product type.",							"type": "string"						},						"status": {							"required": false,							"enum": [								"draft",								"pending",								"private",								"publish"							],							"description": "Product status (post status).",							"type": "string"						},						"featured": {							"required": false,							"description": "Featured product.",							"type": "boolean"						},						"catalog_visibility": {							"required": false,							"enum": [								"visible",								"catalog",								"search",								"hidden"							],							"description": "Catalog visibility.",							"type": "string"						},						"description": {							"required": false,							"description": "Product description.",							"type": "string"						},						"short_description": {							"required": false,							"description": "Product short description.",							"type": "string"						},						"sku": {							"required": false,							"description": "Unique identifier.",							"type": "string"						},						"regular_price": {							"required": false,							"description": "Product regular price.",							"type": "string"						},						"sale_price": {							"required": false,							"description": "Product sale price.",							"type": "string"						},						"date_on_sale_from": {							"required": false,							"description": "Start date of sale price, in the site's timezone.",							"type": "date-time"						},						"date_on_sale_from_gmt": {							"required": false,							"description": "Start date of sale price, as GMT.",							"type": "date-time"						},						"date_on_sale_to": {							"required": false,							"description": "End date of sale price, in the site's timezone.",							"type": "date-time"						},						"date_on_sale_to_gmt": {							"required": false,							"description": "End date of sale price, in the site's timezone.",							"type": "date-time"						},						"virtual": {							"required": false,							"description": "If the product is virtual.",							"type": "boolean"						},						"downloadable": {							"required": false,							"description": "If the product is downloadable.",							"type": "boolean"						},						"downloads": {							"required": false,							"description": "List of downloadable files.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "File ID.",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"name": {										"description": "File name.",										"type": "string",										"context": [ "view", "edit" ]									},									"file": {										"description": "File URL.",										"type": "string",										"context": [ "view", "edit" ]									}								}							}						},						"download_limit": {							"required": false,							"description": "Number of times downloadable files can be downloaded after purchase.",							"type": "integer"						},						"download_expiry": {							"required": false,							"description": "Number of days until access to downloadable files expires.",							"type": "integer"						},						"external_url": {							"required": false,							"description": "Product external URL. Only for external products.",							"type": "string"						},						"button_text": {							"required": false,							"description": "Product external button text. Only for external products.",							"type": "string"						},						"tax_status": {							"required": false,							"enum": [ "taxable", "shipping", "none" ],							"description": "Tax status.",							"type": "string"						},						"tax_class": {							"required": false,							"description": "Tax class.",							"type": "string"						},						"manage_stock": {							"required": false,							"description": "Stock management at product level.",							"type": "boolean"						},						"stock_quantity": {							"required": false,							"description": "Stock quantity.",							"type": "integer"						},						"in_stock": {							"required": false,							"description": "Controls whether or not the product is listed as \"in stock\" or \"out of stock\" on the frontend.",							"type": "boolean"						},						"backorders": {							"required": false,							"enum": [ "no", "notify", "yes" ],							"description": "If managing stock, this controls if backorders are allowed.",							"type": "string"						},						"sold_individually": {							"required": false,							"description": "Allow one item to be bought in a single order.",							"type": "boolean"						},						"weight": {							"required": false,							"description": "Product weight (kg).",							"type": "string"						},						"dimensions": {							"required": false,							"description": "Product dimensions.",							"type": "object"						},						"shipping_class": {							"required": false,							"description": "Shipping class slug.",							"type": "string"						},						"reviews_allowed": {							"required": false,							"description": "Allow reviews.",							"type": "boolean"						},						"upsell_ids": {							"required": false,							"description": "List of up-sell products IDs.",							"type": "array",							"items": {								"type": "integer"							}						},						"cross_sell_ids": {							"required": false,							"description": "List of cross-sell products IDs.",							"type": "array",							"items": {								"type": "integer"							}						},						"parent_id": {							"required": false,							"description": "Product parent ID.",							"type": "integer"						},						"purchase_note": {							"required": false,							"description": "Optional note to send the customer after purchase.",							"type": "string"						},						"categories": {							"required": false,							"description": "List of categories.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Category ID.",										"type": "integer",										"context": [ "view", "edit" ]									},									"name": {										"description": "Category name.",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"slug": {										"description": "Category slug.",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									}								}							}						},						"tags": {							"required": false,							"description": "List of tags.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Tag ID.",										"type": "integer",										"context": [ "view", "edit" ]									},									"name": {										"description": "Tag name.",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"slug": {										"description": "Tag slug.",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									}								}							}						},						"images": {							"required": false,							"description": "List of images.",							"type": "object",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Image ID.",										"type": "integer",										"context": [ "view", "edit" ]									},									"date_created": {										"description": "The date the image was created, in the site's timezone.",										"type": "date-time",										"context": [ "view", "edit" ],										"readonly": true									},									"date_created_gmt": {										"description": "The date the image was created, as GMT.",										"type": "date-time",										"context": [ "view", "edit" ],										"readonly": true									},									"date_modified": {										"description": "The date the image was last modified, in the site's timezone.",										"type": "date-time",										"context": [ "view", "edit" ],										"readonly": true									},									"date_modified_gmt": {										"description": "The date the image was last modified, as GMT.",										"type": "date-time",										"context": [ "view", "edit" ],										"readonly": true									},									"src": {										"description": "Image URL.",										"type": "string",										"format": "uri",										"context": [ "view", "edit" ]									},									"name": {										"description": "Image name.",										"type": "string",										"context": [ "view", "edit" ]									},									"alt": {										"description": "Image alternative text.",										"type": "string",										"context": [ "view", "edit" ]									},									"position": {										"description": "Image position. 0 means that the image is featured.",										"type": "integer",										"context": [ "view", "edit" ]									}								}							}						},						"attributes": {							"required": false,							"description": "List of attributes.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Attribute ID.",										"type": "integer",										"context": [ "view", "edit" ]									},									"name": {										"description": "Attribute name.",										"type": "string",										"context": [ "view", "edit" ]									},									"position": {										"description": "Attribute position.",										"type": "integer",										"context": [ "view", "edit" ]									},									"visible": {										"description": "Define if the attribute is visible on the \"Additional information\" tab in the product's page.",										"type": "boolean",										"default": false,										"context": [ "view", "edit" ]									},									"variation": {										"description": "Define if the attribute can be used as variation.",										"type": "boolean",										"default": false,										"context": [ "view", "edit" ]									},									"options": {										"description": "List of available term names of the attribute.",										"type": "array",										"context": [ "view", "edit" ]									}								}							}						},						"default_attributes": {							"required": false,							"description": "Defaults variation attributes.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Attribute ID.",										"type": "integer",										"context": [ "view", "edit" ]									},									"name": {										"description": "Attribute name.",										"type": "string",										"context": [ "view", "edit" ]									},									"option": {										"description": "Selected attribute term name.",										"type": "string",										"context": [ "view", "edit" ]									}								}							}						},						"menu_order": {							"required": false,							"description": "Menu order, used to custom sort products.",							"type": "integer"						},						"meta_data": {							"required": false,							"description": "Meta data.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Meta ID.",										"type": "integer",										"context": [ "view", "edit" ],										"readonly": true									},									"key": {										"description": "Meta key.",										"type": "string",										"context": [ "view", "edit" ]									},									"value": {										"description": "Meta value.",										"type": "string",										"context": [ "view", "edit" ]									}								}							}						}					}				},				{					"methods": [ "DELETE" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"force": {							"required": false,							"default": false,							"description": "Whether to bypass trash and force deletion.",							"type": "boolean"						}					}				}			]		},		"/wc/v3/products/batch": {			"namespace": "wc/v3",			"methods": [ "POST", "PUT", "PATCH" ],			"endpoints": [				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"name": {							"required": false,							"description": "Product name.",							"type": "string"						},						"slug": {							"required": false,							"description": "Product slug.",							"type": "string"						},						"type": {							"required": false,							"enum": [								"simple",								"grouped",								"external",								"variable"							],							"description": "Product type.",							"type": "string"						},						"status": {							"required": false,							"enum": [								"draft",								"pending",								"private",								"publish"							],							"description": "Product status (post status).",							"type": "string"						},						"featured": {							"required": false,							"description": "Featured product.",							"type": "boolean"						},						"catalog_visibility": {							"required": false,							"enum": [								"visible",								"catalog",								"search",								"hidden"							],							"description": "Catalog visibility.",							"type": "string"						},						"description": {							"required": false,							"description": "Product description.",							"type": "string"						},						"short_description": {							"required": false,							"description": "Product short description.",							"type": "string"						},						"sku": {							"required": false,							"description": "Unique identifier.",							"type": "string"						},						"regular_price": {							"required": false,							"description": "Product regular price.",							"type": "string"						},						"sale_price": {							"required": false,							"description": "Product sale price.",							"type": "string"						},						"date_on_sale_from": {							"required": false,							"description": "Start date of sale price, in the site's timezone.",							"type": "date-time"						},						"date_on_sale_from_gmt": {							"required": false,							"description": "Start date of sale price, as GMT.",							"type": "date-time"						},						"date_on_sale_to": {							"required": false,							"description": "End date of sale price, in the site's timezone.",							"type": "date-time"						},						"date_on_sale_to_gmt": {							"required": false,							"description": "End date of sale price, in the site's timezone.",							"type": "date-time"						},						"virtual": {							"required": false,							"description": "If the product is virtual.",							"type": "boolean"						},						"downloadable": {							"required": false,							"description": "If the product is downloadable.",							"type": "boolean"						},						"downloads": {							"required": false,							"description": "List of downloadable files.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "File ID.",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"name": {										"description": "File name.",										"type": "string",										"context": [ "view", "edit" ]									},									"file": {										"description": "File URL.",										"type": "string",										"context": [ "view", "edit" ]									}								}							}						},						"download_limit": {							"required": false,							"description": "Number of times downloadable files can be downloaded after purchase.",							"type": "integer"						},						"download_expiry": {							"required": false,							"description": "Number of days until access to downloadable files expires.",							"type": "integer"						},						"external_url": {							"required": false,							"description": "Product external URL. Only for external products.",							"type": "string"						},						"button_text": {							"required": false,							"description": "Product external button text. Only for external products.",							"type": "string"						},						"tax_status": {							"required": false,							"enum": [ "taxable", "shipping", "none" ],							"description": "Tax status.",							"type": "string"						},						"tax_class": {							"required": false,							"description": "Tax class.",							"type": "string"						},						"manage_stock": {							"required": false,							"description": "Stock management at product level.",							"type": "boolean"						},						"stock_quantity": {							"required": false,							"description": "Stock quantity.",							"type": "integer"						},						"in_stock": {							"required": false,							"description": "Controls whether or not the product is listed as \"in stock\" or \"out of stock\" on the frontend.",							"type": "boolean"						},						"backorders": {							"required": false,							"enum": [ "no", "notify", "yes" ],							"description": "If managing stock, this controls if backorders are allowed.",							"type": "string"						},						"sold_individually": {							"required": false,							"description": "Allow one item to be bought in a single order.",							"type": "boolean"						},						"weight": {							"required": false,							"description": "Product weight (kg).",							"type": "string"						},						"dimensions": {							"required": false,							"description": "Product dimensions.",							"type": "object"						},						"shipping_class": {							"required": false,							"description": "Shipping class slug.",							"type": "string"						},						"reviews_allowed": {							"required": false,							"description": "Allow reviews.",							"type": "boolean"						},						"upsell_ids": {							"required": false,							"description": "List of up-sell products IDs.",							"type": "array",							"items": {								"type": "integer"							}						},						"cross_sell_ids": {							"required": false,							"description": "List of cross-sell products IDs.",							"type": "array",							"items": {								"type": "integer"							}						},						"parent_id": {							"required": false,							"description": "Product parent ID.",							"type": "integer"						},						"purchase_note": {							"required": false,							"description": "Optional note to send the customer after purchase.",							"type": "string"						},						"categories": {							"required": false,							"description": "List of categories.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Category ID.",										"type": "integer",										"context": [ "view", "edit" ]									},									"name": {										"description": "Category name.",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"slug": {										"description": "Category slug.",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									}								}							}						},						"tags": {							"required": false,							"description": "List of tags.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Tag ID.",										"type": "integer",										"context": [ "view", "edit" ]									},									"name": {										"description": "Tag name.",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"slug": {										"description": "Tag slug.",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									}								}							}						},						"images": {							"required": false,							"description": "List of images.",							"type": "object",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Image ID.",										"type": "integer",										"context": [ "view", "edit" ]									},									"date_created": {										"description": "The date the image was created, in the site's timezone.",										"type": "date-time",										"context": [ "view", "edit" ],										"readonly": true									},									"date_created_gmt": {										"description": "The date the image was created, as GMT.",										"type": "date-time",										"context": [ "view", "edit" ],										"readonly": true									},									"date_modified": {										"description": "The date the image was last modified, in the site's timezone.",										"type": "date-time",										"context": [ "view", "edit" ],										"readonly": true									},									"date_modified_gmt": {										"description": "The date the image was last modified, as GMT.",										"type": "date-time",										"context": [ "view", "edit" ],										"readonly": true									},									"src": {										"description": "Image URL.",										"type": "string",										"format": "uri",										"context": [ "view", "edit" ]									},									"name": {										"description": "Image name.",										"type": "string",										"context": [ "view", "edit" ]									},									"alt": {										"description": "Image alternative text.",										"type": "string",										"context": [ "view", "edit" ]									},									"position": {										"description": "Image position. 0 means that the image is featured.",										"type": "integer",										"context": [ "view", "edit" ]									}								}							}						},						"attributes": {							"required": false,							"description": "List of attributes.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Attribute ID.",										"type": "integer",										"context": [ "view", "edit" ]									},									"name": {										"description": "Attribute name.",										"type": "string",										"context": [ "view", "edit" ]									},									"position": {										"description": "Attribute position.",										"type": "integer",										"context": [ "view", "edit" ]									},									"visible": {										"description": "Define if the attribute is visible on the \"Additional information\" tab in the product's page.",										"type": "boolean",										"default": false,										"context": [ "view", "edit" ]									},									"variation": {										"description": "Define if the attribute can be used as variation.",										"type": "boolean",										"default": false,										"context": [ "view", "edit" ]									},									"options": {										"description": "List of available term names of the attribute.",										"type": "array",										"context": [ "view", "edit" ]									}								}							}						},						"default_attributes": {							"required": false,							"description": "Defaults variation attributes.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Attribute ID.",										"type": "integer",										"context": [ "view", "edit" ]									},									"name": {										"description": "Attribute name.",										"type": "string",										"context": [ "view", "edit" ]									},									"option": {										"description": "Selected attribute term name.",										"type": "string",										"context": [ "view", "edit" ]									}								}							}						},						"menu_order": {							"required": false,							"description": "Menu order, used to custom sort products.",							"type": "integer"						},						"meta_data": {							"required": false,							"description": "Meta data.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Meta ID.",										"type": "integer",										"context": [ "view", "edit" ],										"readonly": true									},									"key": {										"description": "Meta key.",										"type": "string",										"context": [ "view", "edit" ]									},									"value": {										"description": "Meta value.",										"type": "string",										"context": [ "view", "edit" ]									}								}							}						}					}				}			],			"_links": {				"self": "https://example.com/wp-json/wc/v3/products/batch"			}		},		"/wc/v3/products/(?P<product_id>[\\d]+)/variations": {			"namespace": "wc/v3",			"methods": [ "GET", "POST" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"product_id": {							"required": false,							"description": "Unique identifier for the variable product.",							"type": "integer"						},						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						},						"page": {							"required": false,							"default": 1,							"description": "Current page of the collection.",							"type": "integer"						},						"per_page": {							"required": false,							"default": 10,							"description": "Maximum number of items to be returned in result set.",							"type": "integer"						},						"search": {							"required": false,							"description": "Limit results to those matching a string.",							"type": "string"						},						"after": {							"required": false,							"description": "Limit response to resources published after a given ISO8601 compliant date.",							"type": "string"						},						"before": {							"required": false,							"description": "Limit response to resources published before a given ISO8601 compliant date.",							"type": "string"						},						"exclude": {							"required": false,							"default": [],							"description": "Ensure result set excludes specific IDs.",							"type": "array",							"items": {								"type": "integer"							}						},						"include": {							"required": false,							"default": [],							"description": "Limit result set to specific ids.",							"type": "array",							"items": {								"type": "integer"							}						},						"offset": {							"required": false,							"description": "Offset the result set by a specific number of items.",							"type": "integer"						},						"order": {							"required": false,							"default": "desc",							"enum": [ "asc", "desc" ],							"description": "Order sort attribute ascending or descending.",							"type": "string"						},						"orderby": {							"required": false,							"default": "date",							"enum": [								"date",								"id",								"include",								"title",								"slug"							],							"description": "Sort collection by object attribute.",							"type": "string"						},						"parent": {							"required": false,							"default": [],							"description": "Limit result set to those of particular parent IDs.",							"type": "array",							"items": {								"type": "integer"							}						},						"parent_exclude": {							"required": false,							"default": [],							"description": "Limit result set to all items except those of a particular parent ID.",							"type": "array",							"items": {								"type": "integer"							}						},						"slug": {							"required": false,							"description": "Limit result set to products with a specific slug.",							"type": "string"						},						"status": {							"required": false,							"default": "any",							"enum": [								"any",								"draft",								"pending",								"private",								"publish"							],							"description": "Limit result set to products assigned a specific status.",							"type": "string"						},						"type": {							"required": false,							"enum": [								"simple",								"grouped",								"external",								"variable"							],							"description": "Limit result set to products assigned a specific type.",							"type": "string"						},						"sku": {							"required": false,							"description": "Limit result set to products with a specific SKU.",							"type": "string"						},						"featured": {							"required": false,							"description": "Limit result set to featured products.",							"type": "boolean"						},						"category": {							"required": false,							"description": "Limit result set to products assigned a specific category ID.",							"type": "string"						},						"tag": {							"required": false,							"description": "Limit result set to products assigned a specific tag ID.",							"type": "string"						},						"shipping_class": {							"required": false,							"description": "Limit result set to products assigned a specific shipping class ID.",							"type": "string"						},						"attribute": {							"required": false,							"description": "Limit result set to products with a specific attribute.",							"type": "string"						},						"attribute_term": {							"required": false,							"description": "Limit result set to products with a specific attribute term ID (required an assigned attribute).",							"type": "string"						},						"tax_class": {							"required": false,							"enum": [ "standard", "reduced-rate", "zero-rate" ],							"description": "Limit result set to products with a specific tax class.",							"type": "string"						},						"in_stock": {							"required": false,							"description": "Limit result set to products in stock or out of stock.",							"type": "boolean"						},						"on_sale": {							"required": false,							"description": "Limit result set to products on sale.",							"type": "boolean"						},						"min_price": {							"required": false,							"description": "Limit result set to products based on a minimum price.",							"type": "string"						},						"max_price": {							"required": false,							"description": "Limit result set to products based on a maximum price.",							"type": "string"						}					}				},				{					"methods": [ "POST" ],					"args": {						"product_id": {							"required": false,							"description": "Unique identifier for the variable product.",							"type": "integer"						},						"description": {							"required": false,							"description": "Variation description.",							"type": "string"						},						"sku": {							"required": false,							"description": "Unique identifier.",							"type": "string"						},						"regular_price": {							"required": false,							"description": "Variation regular price.",							"type": "string"						},						"sale_price": {							"required": false,							"description": "Variation sale price.",							"type": "string"						},						"date_on_sale_from": {							"required": false,							"description": "Start date of sale price, in the site's timezone.",							"type": "date-time"						},						"date_on_sale_from_gmt": {							"required": false,							"description": "Start date of sale price, as GMT.",							"type": "date-time"						},						"date_on_sale_to": {							"required": false,							"description": "End date of sale price, in the site's timezone.",							"type": "date-time"						},						"date_on_sale_to_gmt": {							"required": false,							"description": "End date of sale price, in the site's timezone.",							"type": "date-time"						},						"visible": {							"required": false,							"default": true,							"description": "Define if the attribute is visible on the \"Additional information\" tab in the product's page.",							"type": "boolean"						},						"virtual": {							"required": false,							"default": false,							"description": "If the variation is virtual.",							"type": "boolean"						},						"downloadable": {							"required": false,							"default": false,							"description": "If the variation is downloadable.",							"type": "boolean"						},						"downloads": {							"required": false,							"description": "List of downloadable files.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "File ID.",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"name": {										"description": "File name.",										"type": "string",										"context": [ "view", "edit" ]									},									"file": {										"description": "File URL.",										"type": "string",										"context": [ "view", "edit" ]									}								}							}						},						"download_limit": {							"required": false,							"default": -1,							"description": "Number of times downloadable files can be downloaded after purchase.",							"type": "integer"						},						"download_expiry": {							"required": false,							"default": -1,							"description": "Number of days until access to downloadable files expires.",							"type": "integer"						},						"tax_status": {							"required": false,							"default": "taxable",							"enum": [ "taxable", "shipping", "none" ],							"description": "Tax status.",							"type": "string"						},						"tax_class": {							"required": false,							"description": "Tax class.",							"type": "string"						},						"manage_stock": {							"required": false,							"default": false,							"description": "Stock management at variation level.",							"type": [ "boolean", "string" ]						},						"stock_quantity": {							"required": false,							"description": "Stock quantity.",							"type": "integer"						},						"in_stock": {							"required": false,							"default": true,							"description": "Controls whether or not the variation is listed as \"in stock\" or \"out of stock\" on the frontend.",							"type": "boolean"						},						"backorders": {							"required": false,							"default": "no",							"enum": [ "no", "notify", "yes" ],							"description": "If managing stock, this controls if backorders are allowed.",							"type": "string"						},						"weight": {							"required": false,							"description": "Variation weight (kg).",							"type": "string"						},						"dimensions": {							"required": false,							"description": "Variation dimensions.",							"type": "object"						},						"shipping_class": {							"required": false,							"description": "Shipping class slug.",							"type": "string"						},						"image": {							"required": false,							"description": "Variation image data.",							"type": "object"						},						"gallery_image_ids": {							"required": false,							"description": "Variation gallery image IDs, excluding the featured image (which is set via \"image\").",							"type": "array",							"items": {								"type": "integer",								"minimum": 1							}						},						"attributes": {							"required": false,							"description": "List of attributes.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Attribute ID.",										"type": "integer",										"context": [ "view", "edit" ]									},									"name": {										"description": "Attribute name.",										"type": "string",										"context": [ "view", "edit" ]									},									"option": {										"description": "Selected attribute term name.",										"type": "string",										"context": [ "view", "edit" ]									}								}							}						},						"menu_order": {							"required": false,							"description": "Menu order, used to custom sort products.",							"type": "integer"						},						"meta_data": {							"required": false,							"description": "Meta data.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Meta ID.",										"type": "integer",										"context": [ "view", "edit" ],										"readonly": true									},									"key": {										"description": "Meta key.",										"type": "string",										"context": [ "view", "edit" ]									},									"value": {										"description": "Meta value.",										"type": "string",										"context": [ "view", "edit" ]									}								}							}						}					}				}			]		},		"/wc/v3/products/(?P<product_id>[\\d]+)/variations/(?P<id>[\\d]+)": {			"namespace": "wc/v3",			"methods": [ "GET", "POST", "PUT", "PATCH", "DELETE" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"product_id": {							"required": false,							"description": "Unique identifier for the variable product.",							"type": "integer"						},						"id": {							"required": false,							"description": "Unique identifier for the variation.",							"type": "integer"						},						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						}					}				},				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"product_id": {							"required": false,							"description": "Unique identifier for the variable product.",							"type": "integer"						},						"id": {							"required": false,							"description": "Unique identifier for the variation.",							"type": "integer"						},						"description": {							"required": false,							"description": "Variation description.",							"type": "string"						},						"sku": {							"required": false,							"description": "Unique identifier.",							"type": "string"						},						"regular_price": {							"required": false,							"description": "Variation regular price.",							"type": "string"						},						"sale_price": {							"required": false,							"description": "Variation sale price.",							"type": "string"						},						"date_on_sale_from": {							"required": false,							"description": "Start date of sale price, in the site's timezone.",							"type": "date-time"						},						"date_on_sale_from_gmt": {							"required": false,							"description": "Start date of sale price, as GMT.",							"type": "date-time"						},						"date_on_sale_to": {							"required": false,							"description": "End date of sale price, in the site's timezone.",							"type": "date-time"						},						"date_on_sale_to_gmt": {							"required": false,							"description": "End date of sale price, in the site's timezone.",							"type": "date-time"						},						"visible": {							"required": false,							"description": "Define if the attribute is visible on the \"Additional information\" tab in the product's page.",							"type": "boolean"						},						"virtual": {							"required": false,							"description": "If the variation is virtual.",							"type": "boolean"						},						"downloadable": {							"required": false,							"description": "If the variation is downloadable.",							"type": "boolean"						},						"downloads": {							"required": false,							"description": "List of downloadable files.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "File ID.",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"name": {										"description": "File name.",										"type": "string",										"context": [ "view", "edit" ]									},									"file": {										"description": "File URL.",										"type": "string",										"context": [ "view", "edit" ]									}								}							}						},						"download_limit": {							"required": false,							"description": "Number of times downloadable files can be downloaded after purchase.",							"type": "integer"						},						"download_expiry": {							"required": false,							"description": "Number of days until access to downloadable files expires.",							"type": "integer"						},						"tax_status": {							"required": false,							"enum": [ "taxable", "shipping", "none" ],							"description": "Tax status.",							"type": "string"						},						"tax_class": {							"required": false,							"description": "Tax class.",							"type": "string"						},						"manage_stock": {							"required": false,							"description": "Stock management at variation level.",							"type": [ "boolean", "string" ]						},						"stock_quantity": {							"required": false,							"description": "Stock quantity.",							"type": "integer"						},						"in_stock": {							"required": false,							"description": "Controls whether or not the variation is listed as \"in stock\" or \"out of stock\" on the frontend.",							"type": "boolean"						},						"backorders": {							"required": false,							"enum": [ "no", "notify", "yes" ],							"description": "If managing stock, this controls if backorders are allowed.",							"type": "string"						},						"weight": {							"required": false,							"description": "Variation weight (kg).",							"type": "string"						},						"dimensions": {							"required": false,							"description": "Variation dimensions.",							"type": "object"						},						"shipping_class": {							"required": false,							"description": "Shipping class slug.",							"type": "string"						},						"image": {							"required": false,							"description": "Variation image data.",							"type": "object"						},						"gallery_image_ids": {							"required": false,							"description": "Variation gallery image IDs, excluding the featured image (which is set via \"image\").",							"type": "array",							"items": {								"type": "integer",								"minimum": 1							}						},						"attributes": {							"required": false,							"description": "List of attributes.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Attribute ID.",										"type": "integer",										"context": [ "view", "edit" ]									},									"name": {										"description": "Attribute name.",										"type": "string",										"context": [ "view", "edit" ]									},									"option": {										"description": "Selected attribute term name.",										"type": "string",										"context": [ "view", "edit" ]									}								}							}						},						"menu_order": {							"required": false,							"description": "Menu order, used to custom sort products.",							"type": "integer"						},						"meta_data": {							"required": false,							"description": "Meta data.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Meta ID.",										"type": "integer",										"context": [ "view", "edit" ],										"readonly": true									},									"key": {										"description": "Meta key.",										"type": "string",										"context": [ "view", "edit" ]									},									"value": {										"description": "Meta value.",										"type": "string",										"context": [ "view", "edit" ]									}								}							}						}					}				},				{					"methods": [ "DELETE" ],					"args": {						"product_id": {							"required": false,							"description": "Unique identifier for the variable product.",							"type": "integer"						},						"id": {							"required": false,							"description": "Unique identifier for the variation.",							"type": "integer"						},						"force": {							"required": false,							"default": false,							"description": "Whether to bypass trash and force deletion.",							"type": "boolean"						}					}				}			]		},		"/wc/v3/products/(?P<product_id>[\\d]+)/variations/batch": {			"namespace": "wc/v3",			"methods": [ "POST", "PUT", "PATCH" ],			"endpoints": [				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"product_id": {							"required": false,							"description": "Unique identifier for the variable product.",							"type": "integer"						},						"description": {							"required": false,							"description": "Variation description.",							"type": "string"						},						"sku": {							"required": false,							"description": "Unique identifier.",							"type": "string"						},						"regular_price": {							"required": false,							"description": "Variation regular price.",							"type": "string"						},						"sale_price": {							"required": false,							"description": "Variation sale price.",							"type": "string"						},						"date_on_sale_from": {							"required": false,							"description": "Start date of sale price, in the site's timezone.",							"type": "date-time"						},						"date_on_sale_from_gmt": {							"required": false,							"description": "Start date of sale price, as GMT.",							"type": "date-time"						},						"date_on_sale_to": {							"required": false,							"description": "End date of sale price, in the site's timezone.",							"type": "date-time"						},						"date_on_sale_to_gmt": {							"required": false,							"description": "End date of sale price, in the site's timezone.",							"type": "date-time"						},						"visible": {							"required": false,							"description": "Define if the attribute is visible on the \"Additional information\" tab in the product's page.",							"type": "boolean"						},						"virtual": {							"required": false,							"description": "If the variation is virtual.",							"type": "boolean"						},						"downloadable": {							"required": false,							"description": "If the variation is downloadable.",							"type": "boolean"						},						"downloads": {							"required": false,							"description": "List of downloadable files.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "File ID.",										"type": "string",										"context": [ "view", "edit" ],										"readonly": true									},									"name": {										"description": "File name.",										"type": "string",										"context": [ "view", "edit" ]									},									"file": {										"description": "File URL.",										"type": "string",										"context": [ "view", "edit" ]									}								}							}						},						"download_limit": {							"required": false,							"description": "Number of times downloadable files can be downloaded after purchase.",							"type": "integer"						},						"download_expiry": {							"required": false,							"description": "Number of days until access to downloadable files expires.",							"type": "integer"						},						"tax_status": {							"required": false,							"enum": [ "taxable", "shipping", "none" ],							"description": "Tax status.",							"type": "string"						},						"tax_class": {							"required": false,							"description": "Tax class.",							"type": "string"						},						"manage_stock": {							"required": false,							"description": "Stock management at variation level.",							"type": [ "boolean", "string" ]						},						"stock_quantity": {							"required": false,							"description": "Stock quantity.",							"type": "integer"						},						"in_stock": {							"required": false,							"description": "Controls whether or not the variation is listed as \"in stock\" or \"out of stock\" on the frontend.",							"type": "boolean"						},						"backorders": {							"required": false,							"enum": [ "no", "notify", "yes" ],							"description": "If managing stock, this controls if backorders are allowed.",							"type": "string"						},						"weight": {							"required": false,							"description": "Variation weight (kg).",							"type": "string"						},						"dimensions": {							"required": false,							"description": "Variation dimensions.",							"type": "object"						},						"shipping_class": {							"required": false,							"description": "Shipping class slug.",							"type": "string"						},						"image": {							"required": false,							"description": "Variation image data.",							"type": "object"						},						"gallery_image_ids": {							"required": false,							"description": "Variation gallery image IDs, excluding the featured image (which is set via \"image\").",							"type": "array",							"items": {								"type": "integer",								"minimum": 1							}						},						"attributes": {							"required": false,							"description": "List of attributes.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Attribute ID.",										"type": "integer",										"context": [ "view", "edit" ]									},									"name": {										"description": "Attribute name.",										"type": "string",										"context": [ "view", "edit" ]									},									"option": {										"description": "Selected attribute term name.",										"type": "string",										"context": [ "view", "edit" ]									}								}							}						},						"menu_order": {							"required": false,							"description": "Menu order, used to custom sort products.",							"type": "integer"						},						"meta_data": {							"required": false,							"description": "Meta data.",							"type": "array",							"items": {								"type": "object",								"properties": {									"id": {										"description": "Meta ID.",										"type": "integer",										"context": [ "view", "edit" ],										"readonly": true									},									"key": {										"description": "Meta key.",										"type": "string",										"context": [ "view", "edit" ]									},									"value": {										"description": "Meta value.",										"type": "string",										"context": [ "view", "edit" ]									}								}							}						}					}				}			]		},		"/wc/v3/reports/sales": {			"namespace": "wc/v3",			"methods": [ "GET" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"context": {							"required": false,							"default": "view",							"enum": [ "view" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						},						"period": {							"required": false,							"enum": [ "week", "month", "last_month", "year" ],							"description": "Report period.",							"type": "string"						},						"date_min": {							"required": false,							"description": "Return sales for a specific start date, the date need to be in the YYYY-MM-DD format.",							"type": "string"						},						"date_max": {							"required": false,							"description": "Return sales for a specific end date, the date need to be in the YYYY-MM-DD format.",							"type": "string"						}					}				}			],			"_links": {				"self": "https://example.com/wp-json/wc/v3/reports/sales"			}		},		"/wc/v3/reports/top_sellers": {			"namespace": "wc/v3",			"methods": [ "GET" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"context": {							"required": false,							"default": "view",							"enum": [ "view" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						},						"period": {							"required": false,							"enum": [ "week", "month", "last_month", "year" ],							"description": "Report period.",							"type": "string"						},						"date_min": {							"required": false,							"description": "Return sales for a specific start date, the date need to be in the YYYY-MM-DD format.",							"type": "string"						},						"date_max": {							"required": false,							"description": "Return sales for a specific end date, the date need to be in the YYYY-MM-DD format.",							"type": "string"						}					}				}			],			"_links": {				"self": "https://example.com/wp-json/wc/v3/reports/top_sellers"			}		},		"/wc/v3/reports": {			"namespace": "wc/v3",			"methods": [ "GET" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"context": {							"required": false,							"default": "view",							"enum": [ "view" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						}					}				}			],			"_links": {				"self": "https://example.com/wp-json/wc/v3/reports"			}		},		"/wc/v3/settings": {			"namespace": "wc/v3",			"methods": [ "GET" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": []				}			],			"_links": {				"self": "https://example.com/wp-json/wc/v3/settings"			}		},		"/wc/v3/settings/(?P<group_id>[\\w-]+)": {			"namespace": "wc/v3",			"methods": [ "GET" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"group": {							"required": false,							"description": "Settings group ID.",							"type": "string"						}					}				}			]		},		"/wc/v3/settings/(?P<group_id>[\\w-]+)/batch": {			"namespace": "wc/v3",			"methods": [ "POST", "PUT", "PATCH" ],			"endpoints": [				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"group": {							"required": false,							"description": "Settings group ID.",							"type": "string"						},						"value": {							"required": false,							"description": "Setting value.",							"type": "mixed"						}					}				}			]		},		"/wc/v3/settings/(?P<group_id>[\\w-]+)/(?P<id>[\\w-]+)": {			"namespace": "wc/v3",			"methods": [ "GET", "POST", "PUT", "PATCH" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"group": {							"required": false,							"description": "Settings group ID.",							"type": "string"						},						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "string"						}					}				},				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"group": {							"required": false,							"description": "Settings group ID.",							"type": "string"						},						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "string"						},						"value": {							"required": false,							"description": "Setting value.",							"type": "mixed"						}					}				}			]		},		"/wc/v3/shipping/zones": {			"namespace": "wc/v3",			"methods": [ "GET", "POST" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": []				},				{					"methods": [ "POST" ],					"args": {						"name": {							"required": true,							"description": "Shipping zone name.",							"type": "string"						},						"order": {							"required": false,							"description": "Shipping zone order.",							"type": "integer"						}					}				}			],			"_links": {				"self": "https://example.com/wp-json/wc/v3/shipping/zones"			}		},		"/wc/v3/shipping/zones/(?P<id>[\\d-]+)": {			"namespace": "wc/v3",			"methods": [ "GET", "POST", "PUT", "PATCH", "DELETE" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"id": {							"required": false,							"description": "Unique ID for the resource.",							"type": "integer"						}					}				},				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"id": {							"required": false,							"description": "Unique ID for the resource.",							"type": "integer"						},						"name": {							"required": false,							"description": "Shipping zone name.",							"type": "string"						},						"order": {							"required": false,							"description": "Shipping zone order.",							"type": "integer"						}					}				},				{					"methods": [ "DELETE" ],					"args": {						"id": {							"required": false,							"description": "Unique ID for the resource.",							"type": "integer"						},						"force": {							"required": false,							"default": false,							"description": "Whether to bypass trash and force deletion.",							"type": "boolean"						}					}				}			]		},		"/wc/v3/shipping/zones/(?P<id>[\\d-]+)/locations": {			"namespace": "wc/v3",			"methods": [ "GET", "POST", "PUT", "PATCH" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"id": {							"required": false,							"description": "Unique ID for the resource.",							"type": "integer"						}					}				},				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"id": {							"required": false,							"description": "Unique ID for the resource.",							"type": "integer"						},						"code": {							"required": false,							"description": "Shipping zone location code.",							"type": "string"						},						"type": {							"required": false,							"enum": [								"postcode",								"state",								"country",								"continent"							],							"description": "Shipping zone location type.",							"type": "string"						}					}				}			]		},		"/wc/v3/shipping/zones/(?P<zone_id>[\\d-]+)/methods": {			"namespace": "wc/v3",			"methods": [ "GET", "POST" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"zone_id": {							"required": false,							"description": "Unique ID for the zone.",							"type": "integer"						}					}				},				{					"methods": [ "POST" ],					"args": {						"zone_id": {							"required": false,							"description": "Unique ID for the zone.",							"type": "integer"						},						"order": {							"required": false,							"description": "Shipping method sort order.",							"type": "integer"						},						"enabled": {							"required": false,							"description": "Shipping method enabled status.",							"type": "boolean"						},						"settings": {							"required": false,							"description": "Shipping method settings.",							"type": "object"						},						"method_id": {							"required": true,							"description": "Shipping method ID."						}					}				}			]		},		"/wc/v3/shipping/zones/(?P<zone_id>[\\d-]+)/methods/(?P<instance_id>[\\d-]+)": {			"namespace": "wc/v3",			"methods": [ "GET", "POST", "PUT", "PATCH", "DELETE" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"zone_id": {							"required": false,							"description": "Unique ID for the zone.",							"type": "integer"						},						"instance_id": {							"required": false,							"description": "Unique ID for the instance.",							"type": "integer"						}					}				},				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"zone_id": {							"required": false,							"description": "Unique ID for the zone.",							"type": "integer"						},						"instance_id": {							"required": false,							"description": "Unique ID for the instance.",							"type": "integer"						},						"order": {							"required": false,							"description": "Shipping method sort order.",							"type": "integer"						},						"enabled": {							"required": false,							"description": "Shipping method enabled status.",							"type": "boolean"						},						"settings": {							"required": false,							"description": "Shipping method settings.",							"type": "object"						}					}				},				{					"methods": [ "DELETE" ],					"args": {						"zone_id": {							"required": false,							"description": "Unique ID for the zone.",							"type": "integer"						},						"instance_id": {							"required": false,							"description": "Unique ID for the instance.",							"type": "integer"						},						"force": {							"required": false,							"default": false,							"description": "Whether to bypass trash and force deletion.",							"type": "boolean"						}					}				}			]		},		"/wc/v3/taxes/classes": {			"namespace": "wc/v3",			"methods": [ "GET", "POST" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						}					}				},				{					"methods": [ "POST" ],					"args": {						"name": {							"required": true,							"description": "Tax class name.",							"type": "string"						}					}				}			],			"_links": {				"self": "https://example.com/wp-json/wc/v3/taxes/classes"			}		},		"/wc/v3/taxes/classes/(?P<slug>\\w[\\w\\s\\-]*)": {			"namespace": "wc/v3",			"methods": [ "DELETE" ],			"endpoints": [				{					"methods": [ "DELETE" ],					"args": {						"slug": {							"required": false,							"description": "Unique slug for the resource.",							"type": "string"						},						"force": {							"required": false,							"default": false,							"description": "Required to be true, as resource does not support trashing.",							"type": "boolean"						}					}				}			]		},		"/wc/v3/taxes": {			"namespace": "wc/v3",			"methods": [ "GET", "POST" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						},						"page": {							"required": false,							"default": 1,							"description": "Current page of the collection.",							"type": "integer"						},						"per_page": {							"required": false,							"default": 10,							"description": "Maximum number of items to be returned in result set.",							"type": "integer"						},						"search": {							"required": false,							"description": "Limit results to those matching a string.",							"type": "string"						},						"exclude": {							"required": false,							"default": [],							"description": "Ensure result set excludes specific IDs.",							"type": "array",							"items": {								"type": "integer"							}						},						"include": {							"required": false,							"default": [],							"description": "Limit result set to specific IDs.",							"type": "array",							"items": {								"type": "integer"							}						},						"offset": {							"required": false,							"description": "Offset the result set by a specific number of items.",							"type": "integer"						},						"order": {							"required": false,							"default": "asc",							"enum": [ "asc", "desc" ],							"description": "Order sort attribute ascending or descending.",							"type": "string"						},						"orderby": {							"required": false,							"default": "order",							"enum": [ "id", "order" ],							"description": "Sort collection by object attribute.",							"type": "string"						},						"class": {							"required": false,							"enum": [ "standard", "reduced-rate", "zero-rate" ],							"description": "Sort by tax class.",							"type": "string"						}					}				},				{					"methods": [ "POST" ],					"args": {						"country": {							"required": false,							"description": "Country ISO 3166 code.",							"type": "string"						},						"state": {							"required": false,							"description": "State code.",							"type": "string"						},						"postcode": {							"required": false,							"description": "Postcode / ZIP.",							"type": "string"						},						"city": {							"required": false,							"description": "City name.",							"type": "string"						},						"rate": {							"required": false,							"description": "Tax rate.",							"type": "string"						},						"name": {							"required": false,							"description": "Tax rate name.",							"type": "string"						},						"priority": {							"required": false,							"default": 1,							"description": "Tax priority.",							"type": "integer"						},						"compound": {							"required": false,							"default": false,							"description": "Whether or not this is a compound rate.",							"type": "boolean"						},						"shipping": {							"required": false,							"default": true,							"description": "Whether or not this tax rate also gets applied to shipping.",							"type": "boolean"						},						"order": {							"required": false,							"description": "Indicates the order that will appear in queries.",							"type": "integer"						},						"class": {							"required": false,							"default": "standard",							"enum": [ "standard", "reduced-rate", "zero-rate" ],							"description": "Tax class.",							"type": "string"						}					}				}			],			"_links": {				"self": "https://example.com/wp-json/wc/v3/taxes"			}		},		"/wc/v3/taxes/(?P<id>[\\d]+)": {			"namespace": "wc/v3",			"methods": [ "GET", "POST", "PUT", "PATCH", "DELETE" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						}					}				},				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"country": {							"required": false,							"description": "Country ISO 3166 code.",							"type": "string"						},						"state": {							"required": false,							"description": "State code.",							"type": "string"						},						"postcode": {							"required": false,							"description": "Postcode / ZIP.",							"type": "string"						},						"city": {							"required": false,							"description": "City name.",							"type": "string"						},						"rate": {							"required": false,							"description": "Tax rate.",							"type": "string"						},						"name": {							"required": false,							"description": "Tax rate name.",							"type": "string"						},						"priority": {							"required": false,							"description": "Tax priority.",							"type": "integer"						},						"compound": {							"required": false,							"description": "Whether or not this is a compound rate.",							"type": "boolean"						},						"shipping": {							"required": false,							"description": "Whether or not this tax rate also gets applied to shipping.",							"type": "boolean"						},						"order": {							"required": false,							"description": "Indicates the order that will appear in queries.",							"type": "integer"						},						"class": {							"required": false,							"enum": [ "standard", "reduced-rate", "zero-rate" ],							"description": "Tax class.",							"type": "string"						}					}				},				{					"methods": [ "DELETE" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"force": {							"required": false,							"default": false,							"description": "Required to be true, as resource does not support trashing.",							"type": "boolean"						}					}				}			]		},		"/wc/v3/taxes/batch": {			"namespace": "wc/v3",			"methods": [ "POST", "PUT", "PATCH" ],			"endpoints": [				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"country": {							"required": false,							"description": "Country ISO 3166 code.",							"type": "string"						},						"state": {							"required": false,							"description": "State code.",							"type": "string"						},						"postcode": {							"required": false,							"description": "Postcode / ZIP.",							"type": "string"						},						"city": {							"required": false,							"description": "City name.",							"type": "string"						},						"rate": {							"required": false,							"description": "Tax rate.",							"type": "string"						},						"name": {							"required": false,							"description": "Tax rate name.",							"type": "string"						},						"priority": {							"required": false,							"description": "Tax priority.",							"type": "integer"						},						"compound": {							"required": false,							"description": "Whether or not this is a compound rate.",							"type": "boolean"						},						"shipping": {							"required": false,							"description": "Whether or not this tax rate also gets applied to shipping.",							"type": "boolean"						},						"order": {							"required": false,							"description": "Indicates the order that will appear in queries.",							"type": "integer"						},						"class": {							"required": false,							"enum": [ "standard", "reduced-rate", "zero-rate" ],							"description": "Tax class.",							"type": "string"						}					}				}			],			"_links": {				"self": "https://example.com/wp-json/wc/v3/taxes/batch"			}		},		"/wc/v3/webhooks/(?P<webhook_id>[\\d]+)/deliveries": {			"namespace": "wc/v3",			"methods": [ "GET" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"webhook_id": {							"required": false,							"description": "Unique identifier for the webhook.",							"type": "integer"						},						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						}					}				}			]		},		"/wc/v3/webhooks/(?P<webhook_id>[\\d]+)/deliveries/(?P<id>[\\d]+)": {			"namespace": "wc/v3",			"methods": [ "GET" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"webhook_id": {							"required": false,							"description": "Unique identifier for the webhook.",							"type": "integer"						},						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						}					}				}			]		},		"/wc/v3/webhooks": {			"namespace": "wc/v3",			"methods": [ "GET", "POST" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						},						"page": {							"required": false,							"default": 1,							"description": "Current page of the collection.",							"type": "integer"						},						"per_page": {							"required": false,							"default": 10,							"description": "Maximum number of items to be returned in result set.",							"type": "integer"						},						"search": {							"required": false,							"description": "Limit results to those matching a string.",							"type": "string"						},						"after": {							"required": false,							"description": "Limit response to resources published after a given ISO8601 compliant date.",							"type": "string"						},						"before": {							"required": false,							"description": "Limit response to resources published before a given ISO8601 compliant date.",							"type": "string"						},						"exclude": {							"required": false,							"default": [],							"description": "Ensure result set excludes specific IDs.",							"type": "array",							"items": {								"type": "integer"							}						},						"include": {							"required": false,							"default": [],							"description": "Limit result set to specific ids.",							"type": "array",							"items": {								"type": "integer"							}						},						"offset": {							"required": false,							"description": "Offset the result set by a specific number of items.",							"type": "integer"						},						"order": {							"required": false,							"default": "desc",							"enum": [ "asc", "desc" ],							"description": "Order sort attribute ascending or descending.",							"type": "string"						},						"orderby": {							"required": false,							"default": "date",							"enum": [								"date",								"id",								"include",								"title",								"slug"							],							"description": "Sort collection by object attribute.",							"type": "string"						},						"status": {							"required": false,							"default": "all",							"enum": [ "all", "active", "paused", "disabled" ],							"description": "Limit result set to webhooks assigned a specific status.",							"type": "string"						}					}				},				{					"methods": [ "POST" ],					"args": {						"name": {							"required": false,							"description": "A friendly name for the webhook.",							"type": "string"						},						"status": {							"required": false,							"default": "active",							"enum": [ "active", "paused", "disabled" ],							"description": "Webhook status.",							"type": "string"						},						"topic": {							"required": true,							"description": "Webhook topic.",							"type": "string"						},						"secret": {							"required": true,							"description": "Webhook secret.",							"type": "string"						},						"delivery_url": {							"required": true,							"description": "Webhook delivery URL.",							"type": "string"						}					}				}			],			"_links": {				"self": "https://example.com/wp-json/wc/v3/webhooks"			}		},		"/wc/v3/webhooks/(?P<id>[\\d]+)": {			"namespace": "wc/v3",			"methods": [ "GET", "POST", "PUT", "PATCH", "DELETE" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						}					}				},				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"name": {							"required": false,							"description": "A friendly name for the webhook.",							"type": "string"						},						"status": {							"required": false,							"enum": [ "active", "paused", "disabled" ],							"description": "Webhook status.",							"type": "string"						},						"topic": {							"required": false,							"description": "Webhook topic.",							"type": "string"						},						"secret": {							"required": false,							"description": "Secret key used to generate a hash of the delivered webhook and provided in the request headers. This will default is a MD5 hash from the current user's ID|username if not provided.",							"type": "string"						}					}				},				{					"methods": [ "DELETE" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "integer"						},						"force": {							"required": false,							"default": false,							"description": "Required to be true, as resource does not support trashing.",							"type": "boolean"						}					}				}			]		},		"/wc/v3/webhooks/batch": {			"namespace": "wc/v3",			"methods": [ "POST", "PUT", "PATCH" ],			"endpoints": [				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"name": {							"required": false,							"description": "A friendly name for the webhook.",							"type": "string"						},						"status": {							"required": false,							"enum": [ "active", "paused", "disabled" ],							"description": "Webhook status.",							"type": "string"						},						"topic": {							"required": false,							"description": "Webhook topic.",							"type": "string"						},						"secret": {							"required": false,							"description": "Secret key used to generate a hash of the delivered webhook and provided in the request headers. This will default is a MD5 hash from the current user's ID|username if not provided.",							"type": "string"						}					}				}			],			"_links": {				"self": "https://example.com/wp-json/wc/v3/webhooks/batch"			}		},		"/wc/v3/system_status": {			"namespace": "wc/v3",			"methods": [ "GET" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"context": {							"required": false,							"default": "view",							"enum": [ "view" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						}					}				}			],			"_links": {				"self": "https://example.com/wp-json/wc/v3/system_status"			}		},		"/wc/v3/system_status/tools": {			"namespace": "wc/v3",			"methods": [ "GET" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						}					}				}			],			"_links": {				"self": "https://example.com/wp-json/wc/v3/system_status/tools"			}		},		"/wc/v3/system_status/tools/(?P<id>[\\w-]+)": {			"namespace": "wc/v3",			"methods": [ "GET", "POST", "PUT", "PATCH" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "string"						}					}				},				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"id": {							"required": false,							"description": "A unique identifier for the tool.",							"type": "string"						},						"name": {							"required": false,							"description": "Tool name.",							"type": "string"						},						"action": {							"required": false,							"description": "What running the tool will do.",							"type": "string"						},						"description": {							"required": false,							"description": "Tool description.",							"type": "string"						},						"success": {							"required": false,							"description": "Did the tool run successfully?",							"type": "boolean"						},						"message": {							"required": false,							"description": "Tool return message.",							"type": "string"						}					}				}			]		},		"/wc/v3/shipping_methods": {			"namespace": "wc/v3",			"methods": [ "GET" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"context": {							"required": false,							"default": "view",							"enum": [ "view" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						}					}				}			],			"_links": {				"self": "https://example.com/wp-json/wc/v3/shipping_methods"			}		},		"/wc/v3/shipping_methods/(?P<id>[\\w-]+)": {			"namespace": "wc/v3",			"methods": [ "GET" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "string"						},						"context": {							"required": false,							"default": "view",							"enum": [ "view" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						}					}				}			]		},		"/wc/v3/payment_gateways": {			"namespace": "wc/v3",			"methods": [ "GET" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						}					}				}			],			"_links": {				"self": "https://example.com/wp-json/wc/v3/payment_gateways"			}		},		"/wc/v3/payment_gateways/(?P<id>[\\w-]+)": {			"namespace": "wc/v3",			"methods": [ "GET", "POST", "PUT", "PATCH" ],			"endpoints": [				{					"methods": [ "GET" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "string"						},						"context": {							"required": false,							"default": "view",							"enum": [ "view", "edit" ],							"description": "Scope under which the request is made; determines fields present in response.",							"type": "string"						}					}				},				{					"methods": [ "POST", "PUT", "PATCH" ],					"args": {						"id": {							"required": false,							"description": "Unique identifier for the resource.",							"type": "string"						},						"title": {							"required": false,							"description": "Payment gateway title on checkout.",							"type": "string"						},						"description": {							"required": false,							"description": "Payment gateway description on checkout.",							"type": "string"						},						"order": {							"required": false,							"description": "Payment gateway sort order.",							"type": "integer"						},						"enabled": {							"required": false,							"description": "Payment gateway enabled status.",							"type": "boolean"						},						"settings": {							"required": false,							"description": "Payment gateway settings.",							"type": "object"						}					}				}			]		}	},	"_links": {		"up": [			{				"href": "https://example.com/wp-json/"			}		]	}}
```

---

<a name="coupons"></a>

The coupons API allows you to create, view, update, and delete individual, or a batch, of coupon codes.


## Coupon properties[​](/docs/apis/rest-api/v3/coupons#coupon-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Unique identifier for the object. READ-ONLY |
| code | string | Coupon code. MANDATORY |
| amount | string | The amount of discount. Should always be numeric, even if setting a percentage. |
| date_created | date-time | The date the coupon was created, in the site's timezone. READ-ONLY |
| date_created_gmt | date-time | The date the coupon was created, as GMT. READ-ONLY |
| date_modified | date-time | The date the coupon was last modified, in the site's timezone. READ-ONLY |
| date_modified_gmt | date-time | The date the coupon was last modified, as GMT. READ-ONLY |
| discount_type | string | Determines the type of discount that will be applied. Options: percent, fixed_cart and fixed_product. Default is fixed_cart. |
| description | string | Coupon description. |
| date_expires | string | The date the coupon expires, in the site's timezone. |
| date_expires_gmt | string | The date the coupon expires, as GMT. |
| usage_count | integer | Number of times the coupon has been used already. READ-ONLY |
| individual_use | boolean | If true, the coupon can only be used individually. Other applied coupons will be removed from the cart. Default is false. |
| product_ids | array | List of product IDs the coupon can be used on. |
| excluded_product_ids | array | List of product IDs the coupon cannot be used on. |
| usage_limit | integer | How many times the coupon can be used in total. |
| usage_limit_per_user | integer | How many times the coupon can be used per customer. |
| limit_usage_to_x_items | integer | Max number of items in the cart the coupon can be applied to. |
| free_shipping | boolean | If true and if the free shipping method requires a coupon, this coupon will enable free shipping. Default is false. |
| product_categories | array | List of category IDs the coupon applies to. |
| excluded_product_categories | array | List of category IDs the coupon does not apply to. |
| exclude_sale_items | boolean | If true, this coupon will not be applied to items that have sale prices. Default is false. |
| minimum_amount | string | Minimum order amount that needs to be in the cart before coupon applies. |
| maximum_amount | string | Maximum order amount allowed when using the coupon. |
| email_restrictions | array | List of email addresses that can use this coupon. |
| used_by | array | List of user IDs (or guest email addresses) that have used the coupon. READ-ONLY |
| meta_data | array | Meta data. See Coupon - Meta data properties |


### Coupon - Meta data properties[​](/docs/apis/rest-api/v3/coupons#coupon---meta-data-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Meta ID. READ-ONLY |
| key | string | Meta key. |
| value | string | Meta value. |


## Create a coupon[​](/docs/apis/rest-api/v3/coupons#create-a-coupon)


This API helps you to create a new coupon.


```
POST /wp-json/wc/v3/coupons
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/coupons \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "code": "10off",  "discount_type": "percent",  "amount": "10",  "individual_use": true,  "exclude_sale_items": true,  "minimum_amount": "100.00"}'
```

```
const data = {	code: '10off',	discount_type: 'percent',	amount: '10',	individual_use: true,	exclude_sale_items: true,	minimum_amount: '100.00',};WooCommerce.post( 'coupons', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'code' => '10off',    'discount_type' => 'percent',    'amount' => '10',    'individual_use' => true,    'exclude_sale_items' => true,    'minimum_amount' => '100.00'];print_r($woocommerce->post('coupons', $data));?>
```

```
data = {    "code": "10off",    "discount_type": "percent",    "amount": "10",    "individual_use": True,    "exclude_sale_items": True,    "minimum_amount": "100.00"}print(wcapi.post("coupons", data).json())
```

```
data = {  code: "10off",  discount_type: "percent",  amount: "10",  individual_use: true,  exclude_sale_items: true,  minimum_amount: "100.00"}woocommerce.post("coupons", data).parsed_response
```

```
{	"id": 719,	"code": "10off",	"amount": "10.00",	"date_created": "2017-03-21T15:23:00",	"date_created_gmt": "2017-03-21T18:23:00",	"date_modified": "2017-03-21T15:23:00",	"date_modified_gmt": "2017-03-21T18:23:00",	"discount_type": "percent",	"description": "",	"date_expires": null,	"date_expires_gmt": null,	"usage_count": 0,	"individual_use": true,	"product_ids": [],	"excluded_product_ids": [],	"usage_limit": null,	"usage_limit_per_user": null,	"limit_usage_to_x_items": null,	"free_shipping": false,	"product_categories": [],	"excluded_product_categories": [],	"exclude_sale_items": true,	"minimum_amount": "100.00",	"maximum_amount": "0.00",	"email_restrictions": [],	"used_by": [],	"meta_data": [],	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/coupons/719"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/coupons"			}		]	}}
```


## Retrieve a coupon[​](/docs/apis/rest-api/v3/coupons#retrieve-a-coupon)


This API lets you retrieve and view a specific coupon by ID.


```
GET /wp-json/wc/v3/coupons/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/coupons/719 \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'coupons/719' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('coupons/719')); ?>
```

```
print(wcapi.get("coupons/719").json())
```

```
woocommerce.get("coupons/719").parsed_response
```

```
{	"id": 719,	"code": "10off",	"amount": "10.00",	"date_created": "2017-03-21T15:23:00",	"date_created_gmt": "2017-03-21T18:23:00",	"date_modified": "2017-03-21T15:23:00",	"date_modified_gmt": "2017-03-21T18:23:00",	"discount_type": "percent",	"description": "",	"date_expires": null,	"date_expires_gmt": null,	"usage_count": 0,	"individual_use": true,	"product_ids": [],	"excluded_product_ids": [],	"usage_limit": null,	"usage_limit_per_user": null,	"limit_usage_to_x_items": null,	"free_shipping": false,	"product_categories": [],	"excluded_product_categories": [],	"exclude_sale_items": true,	"minimum_amount": "100.00",	"maximum_amount": "0.00",	"email_restrictions": [],	"used_by": [],	"meta_data": [],	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/coupons/719"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/coupons"			}		]	}}
```


## List all coupons[​](/docs/apis/rest-api/v3/coupons#list-all-coupons)


This API helps you to list all the coupons that have been created.


```
GET /wp-json/wc/v3/coupons
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/coupons \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'coupons' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('coupons')); ?>
```

```
print(wcapi.get("coupons").json())
```

```
woocommerce.get("coupons").parsed_response
```

```
[	{		"id": 720,		"code": "free shipping",		"amount": "0.00",		"date_created": "2017-03-21T15:25:02",		"date_created_gmt": "2017-03-21T18:25:02",		"date_modified": "2017-03-21T15:25:02",		"date_modified_gmt": "2017-03-21T18:25:02",		"discount_type": "fixed_cart",		"description": "",		"date_expires": null,		"date_expires_gmt": null,		"usage_count": 0,		"individual_use": true,		"product_ids": [],		"excluded_product_ids": [],		"usage_limit": null,		"usage_limit_per_user": null,		"limit_usage_to_x_items": null,		"free_shipping": true,		"product_categories": [],		"excluded_product_categories": [],		"exclude_sale_items": false,		"minimum_amount": "0.00",		"maximum_amount": "0.00",		"email_restrictions": [],		"used_by": [],		"meta_data": [],		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/coupons/720"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/coupons"				}			]		}	},	{		"id": 719,		"code": "10off",		"amount": "10.00",		"date_created": "2017-03-21T15:23:00",		"date_created_gmt": "2017-03-21T18:23:00",		"date_modified": "2017-03-21T15:23:00",		"date_modified_gmt": "2017-03-21T18:23:00",		"discount_type": "percent",		"description": "",		"date_expires": null,		"date_expires_gmt": null,		"usage_count": 0,		"individual_use": true,		"product_ids": [],		"excluded_product_ids": [],		"usage_limit": null,		"usage_limit_per_user": null,		"limit_usage_to_x_items": null,		"free_shipping": false,		"product_categories": [],		"excluded_product_categories": [],		"exclude_sale_items": true,		"minimum_amount": "100.00",		"maximum_amount": "0.00",		"email_restrictions": [],		"used_by": [],		"meta_data": [],		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/coupons/719"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/coupons"				}			]		}	}]
```


#### Available parameters[​](/docs/apis/rest-api/v3/coupons#available-parameters)


| Parameter | Type | Description |
| --- | --- | --- |
| context | string | Scope under which the request is made; determines fields present in response. Options: view and edit. Default is view. |
| page | integer | Current page of the collection. Default is 1. |
| per_page | integer | Maximum number of items to be returned in result set. Default is 10. |
| search | string | Limit results to those matching a string. |
| after | string | Limit response to resources published after a given ISO8601 compliant date. |
| before | string | Limit response to resources published before a given ISO8601 compliant date. |
| modified_after | string | Limit response to resources modified after a given ISO8601 compliant date. |
| modified_before | string | Limit response to resources modified after a given ISO8601 compliant date. |
| dates_are_gmt | boolean | Whether to interpret dates as GMT when limiting response by published or modified date. |
| exclude | array | Ensure result set excludes specific IDs. |
| include | array | Limit result set to specific ids. |
| offset | integer | Offset the result set by a specific number of items. |
| order | string | Order sort attribute ascending or descending. Options: asc and desc. Default is desc. |
| orderby | string | Sort collection by object attribute. Options: date, modified, id, include, title and slug. Default is date. |
| code | string | Limit result set to resources with a specific code. |


## Update a coupon[​](/docs/apis/rest-api/v3/coupons#update-a-coupon)


This API lets you make changes to a coupon.


```
PUT /wp-json/wc/v3/coupons/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X PUT https://example.com/wp-json/wc/v3/coupons/719 \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "amount": "5"}'
```

```
const data = {	amount: '5',};WooCommerce.put( 'coupons/719', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'amount' => '5'];print_r($woocommerce->put('coupons/719', $data));?>
```

```
data = {    "amount": "5"}print(wcapi.put("coupons/719", data).json())
```

```
data = {  amount: "5"}woocommerce.put("coupons/719", data).parsed_response
```

```
{	"id": 719,	"code": "10off",	"amount": "5.00",	"date_created": "2017-03-21T15:23:00",	"date_created_gmt": "2017-03-21T18:23:00",	"date_modified": "2017-03-21T15:26:16",	"date_modified_gmt": "2017-03-21T18:26:16",	"discount_type": "percent",	"description": "",	"date_expires": null,	"date_expires_gmt": null,	"usage_count": 0,	"individual_use": true,	"product_ids": [],	"excluded_product_ids": [],	"usage_limit": null,	"usage_limit_per_user": null,	"limit_usage_to_x_items": null,	"free_shipping": false,	"product_categories": [],	"excluded_product_categories": [],	"exclude_sale_items": true,	"minimum_amount": "100.00",	"maximum_amount": "0.00",	"email_restrictions": [],	"used_by": [],	"meta_data": [],	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/coupons/719"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/coupons"			}		]	}}
```


## Delete a coupon[​](/docs/apis/rest-api/v3/coupons#delete-a-coupon)


This API helps you delete a coupon.


```
DELETE /wp-json/wc/v3/coupons/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X DELETE https://example.com/wp-json/wc/v3/coupons/719?force=true \	-u consumer_key:consumer_secret
```

```
WooCommerce.delete( 'coupons/719', {	force: true,} )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->delete('coupons/719', ['force' => true])); ?>
```

```
print(wcapi.delete("coupons/719", params={"force": True}).json())
```

```
woocommerce.delete("coupons/719", force: true).parsed_response
```

```
{	"id": 719,	"code": "10off",	"amount": "5.00",	"date_created": "2017-03-21T15:23:00",	"date_created_gmt": "2017-03-21T18:23:00",	"date_modified": "2017-03-21T15:26:16",	"date_modified_gmt": "2017-03-21T18:26:16",	"discount_type": "percent",	"description": "",	"date_expires": null,	"date_expires_gmt": null,	"usage_count": 0,	"individual_use": true,	"product_ids": [],	"excluded_product_ids": [],	"usage_limit": null,	"usage_limit_per_user": null,	"limit_usage_to_x_items": null,	"free_shipping": false,	"product_categories": [],	"excluded_product_categories": [],	"exclude_sale_items": true,	"minimum_amount": "100.00",	"maximum_amount": "0.00",	"email_restrictions": [],	"used_by": [],	"meta_data": [],	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/coupons/719"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/coupons"			}		]	}}
```


#### Available parameters[​](/docs/apis/rest-api/v3/coupons#available-parameters-1)


| Parameter | Type | Description |
| --- | --- | --- |
| force | string | Use true whether to permanently delete the coupon, Default is false. |


## Batch update coupons[​](/docs/apis/rest-api/v3/coupons#batch-update-coupons)


This API helps you to batch create, update and delete multiple coupons.

note
Note: By default it's limited to up to 100 objects to be created, updated or
deleted.


```
POST /wp-json/wc/v3/coupons/batch
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/coupons/batch \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "create": [    {      "code": "20off",      "discount_type": "percent",      "amount": "20",      "individual_use": true,      "exclude_sale_items": true,      "minimum_amount": "100.00"    },    {      "code": "30off",      "discount_type": "percent",      "amount": "30",      "individual_use": true,      "exclude_sale_items": true,      "minimum_amount": "100.00"    }  ],  "update": [    {      "id": 719,      "minimum_amount": "50.00"    }  ],  "delete": [    720  ]}'
```

```
const data = {	create: [		{			code: '20off',			discount_type: 'percent',			amount: '20',			individual_use: true,			exclude_sale_items: true,			minimum_amount: '100.00',		},		{			code: '30off',			discount_type: 'percent',			amount: '30',			individual_use: true,			exclude_sale_items: true,			minimum_amount: '100.00',		},	],	update: [		{			id: 719,			minimum_amount: '50.00',		},	],	delete: [ 720 ],};WooCommerce.post( 'coupons/batch', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'create' => [        [            'code' => '20off',            'discount_type' => 'percent',            'amount' => '20',            'individual_use' => true,            'exclude_sale_items' => true,            'minimum_amount' => '100.00'        ],        [            'code' => '30off',            'discount_type' => 'percent',            'amount' => '30',            'individual_use' => true,            'exclude_sale_items' => true,            'minimum_amount' => '100.00'        ]    ],    'update' => [        [            'id' => 719,            'minimum_amount' => '50.00'        ]    ],    'delete' => [        720    ]];print_r($woocommerce->post('coupons/batch', $data));?>
```

```
data = {    "create": [        {            "code": "20off",            "discount_type": "percent",            "amount": "20",            "individual_use": True,            "exclude_sale_items": True,            "minimum_amount": "100.00"        },        {            "code": "30off",            "discount_type": "percent",            "amount": "30",            "individual_use": True,            "exclude_sale_items": True,            "minimum_amount": "100.00"        }    ],    "update": [        {            "id": 719,            "minimum_amount": "50.00"        }    ],    "delete": [        720    ]}print(wcapi.post("coupons/batch", data).json())
```

```
data = {  create: [    {      code: "20off",      discount_type: "percent",      amount: "20",      individual_use: true,      exclude_sale_items: true,      minimum_amount: "100.00"    },    {      code: "30off",      discount_type: "percent",      amount: "30",      individual_use: true,      exclude_sale_items: true,      minimum_amount: "100.00"    }  ],  update: [    {      id: 719,      minimum_amount: "50.00"    }  ],  delete: [    720  ]}woocommerce.post("coupons/batch", data).parsed_response
```

```
{	"create": [		{			"id": 721,			"code": "20off",			"amount": "20.00",			"date_created": "2017-03-21T15:27:29",			"date_created_gmt": "2017-03-21T18:27:29",			"date_modified": "2017-03-21T15:27:29",			"date_modified_gmt": "2017-03-21T18:27:29",			"discount_type": "percent",			"description": "",			"date_expires": null,			"date_expires_gmt": null,			"usage_count": 0,			"individual_use": true,			"product_ids": [],			"excluded_product_ids": [],			"usage_limit": null,			"usage_limit_per_user": null,			"limit_usage_to_x_items": null,			"free_shipping": false,			"product_categories": [],			"excluded_product_categories": [],			"exclude_sale_items": true,			"minimum_amount": "100.00",			"maximum_amount": "0.00",			"email_restrictions": [],			"used_by": [],			"meta_data": [],			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/coupons/721"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/coupons"					}				]			}		},		{			"id": 722,			"code": "30off",			"amount": "30.00",			"date_created": "2017-03-21T15:27:31",			"date_created_gmt": "2017-03-21T18:27:31",			"date_modified": "2017-03-21T15:27:31",			"date_modified_gmt": "2017-03-21T18:27:31",			"discount_type": "percent",			"description": "",			"date_expires": null,			"date_expires_gmt": null,			"usage_count": 0,			"individual_use": true,			"product_ids": [],			"excluded_product_ids": [],			"usage_limit": null,			"usage_limit_per_user": null,			"limit_usage_to_x_items": null,			"free_shipping": false,			"product_categories": [],			"excluded_product_categories": [],			"exclude_sale_items": true,			"minimum_amount": "100.00",			"maximum_amount": "0.00",			"email_restrictions": [],			"used_by": [],			"meta_data": [],			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/coupons/722"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/coupons"					}				]			}		}	],	"update": [		{			"id": 719,			"code": "10off",			"amount": "5.00",			"date_created": "2017-03-21T15:23:00",			"date_created_gmt": "2017-03-21T18:23:00",			"date_modified": "2017-03-21T15:27:32",			"date_modified_gmt": "2017-03-21T18:27:32",			"discount_type": "percent",			"description": "",			"date_expires": null,			"date_expires_gmt": null,			"usage_count": 0,			"individual_use": true,			"product_ids": [],			"excluded_product_ids": [],			"usage_limit": null,			"usage_limit_per_user": null,			"limit_usage_to_x_items": null,			"free_shipping": false,			"product_categories": [],			"excluded_product_categories": [],			"exclude_sale_items": true,			"minimum_amount": "50.00",			"maximum_amount": "0.00",			"email_restrictions": [],			"used_by": [],			"meta_data": [],			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/coupons/719"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/coupons"					}				]			}		}	],	"delete": [		{			"id": 720,			"code": "free shipping",			"amount": "0.00",			"date_created": "2017-03-21T15:25:02",			"date_created_gmt": "2017-03-21T18:25:02",			"date_modified": "2017-03-21T15:25:02",			"date_modified_gmt": "2017-03-21T18:25:02",			"discount_type": "fixed_cart",			"description": "",			"date_expires": null,			"date_expires_gmt": null,			"usage_count": 0,			"individual_use": true,			"product_ids": [],			"excluded_product_ids": [],			"usage_limit": null,			"usage_limit_per_user": null,			"limit_usage_to_x_items": null,			"free_shipping": true,			"product_categories": [],			"excluded_product_categories": [],			"exclude_sale_items": false,			"minimum_amount": "0.00",			"maximum_amount": "0.00",			"email_restrictions": [],			"used_by": [],			"meta_data": [],			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/coupons/720"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/coupons"					}				]			}		}	]}
```

---

<a name="customers"></a>

The customer API allows you to create, view, update, and delete individual, or a batch, of customers.


## Customer properties[​](/docs/apis/rest-api/v3/customers#customer-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Unique identifier for the resource. READ-ONLY |
| date_created | date-time | The date the customer was created, in the site's timezone. READ-ONLY |
| date_created_gmt | date-time | The date the customer was created, as GMT. READ-ONLY |
| date_modified | date-time | The date the customer was last modified, in the site's timezone. READ-ONLY |
| date_modified_gmt | date-time | The date the customer was last modified, as GMT. READ-ONLY |
| email | string | The email address for the customer. MANDATORY |
| first_name | string | Customer first name. |
| last_name | string | Customer last name. |
| role | string | Customer role. READ-ONLY |
| username | string | Customer login name. |
| password | string | Customer password. WRITE-ONLY |
| billing | object | List of billing address data. See Customer - Billing properties |
| shipping | object | List of shipping address data. See Customer - Shipping properties |
| is_paying_customer | bool | Is the customer a paying customer? READ-ONLY |
| avatar_url | string | Avatar URL. READ-ONLY |
| meta_data | array | Meta data. See Customer - Meta data properties |


### Customer - Billing properties[​](/docs/apis/rest-api/v3/customers#customer---billing-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| first_name | string | First name. |
| last_name | string | Last name. |
| company | string | Company name. |
| address_1 | string | Address line 1 |
| address_2 | string | Address line 2 |
| city | string | City name. |
| state | string | ISO code or name of the state, province or district. |
| postcode | string | Postal code. |
| country | string | ISO code of the country. |
| email | string | Email address. |
| phone | string | Phone number. |


### Customer - Shipping properties[​](/docs/apis/rest-api/v3/customers#customer---shipping-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| first_name | string | First name. |
| last_name | string | Last name. |
| company | string | Company name. |
| address_1 | string | Address line 1 |
| address_2 | string | Address line 2 |
| city | string | City name. |
| state | string | ISO code or name of the state, province or district. |
| postcode | string | Postal code. |
| country | string | ISO code of the country. |


### Customer - Meta data properties[​](/docs/apis/rest-api/v3/customers#customer---meta-data-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Meta ID. READ-ONLY |
| key | string | Meta key. |
| value | string | Meta value. |


## Create a customer[​](/docs/apis/rest-api/v3/customers#create-a-customer)


This API helps you to create a new customer.


```
POST /wp-json/wc/v3/customers
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/customers \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "email": "john.doe@example.com",  "first_name": "John",  "last_name": "Doe",  "username": "john.doe",  "billing": {    "first_name": "John",    "last_name": "Doe",    "company": "",    "address_1": "969 Market",    "address_2": "",    "city": "San Francisco",    "state": "CA",    "postcode": "94103",    "country": "US",    "email": "john.doe@example.com",    "phone": "(555) 555-5555"  },  "shipping": {    "first_name": "John",    "last_name": "Doe",    "company": "",    "address_1": "969 Market",    "address_2": "",    "city": "San Francisco",    "state": "CA",    "postcode": "94103",    "country": "US"  }}'
```

```
const data = {	email: 'john.doe@example.com',	first_name: 'John',	last_name: 'Doe',	username: 'john.doe',	billing: {		first_name: 'John',		last_name: 'Doe',		company: '',		address_1: '969 Market',		address_2: '',		city: 'San Francisco',		state: 'CA',		postcode: '94103',		country: 'US',		email: 'john.doe@example.com',		phone: '(555) 555-5555',	},	shipping: {		first_name: 'John',		last_name: 'Doe',		company: '',		address_1: '969 Market',		address_2: '',		city: 'San Francisco',		state: 'CA',		postcode: '94103',		country: 'US',	},};WooCommerce.post( 'customers', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'email' => 'john.doe@example.com',    'first_name' => 'John',    'last_name' => 'Doe',    'username' => 'john.doe',    'billing' => [        'first_name' => 'John',        'last_name' => 'Doe',        'company' => '',        'address_1' => '969 Market',        'address_2' => '',        'city' => 'San Francisco',        'state' => 'CA',        'postcode' => '94103',        'country' => 'US',        'email' => 'john.doe@example.com',        'phone' => '(555) 555-5555'    ],    'shipping' => [        'first_name' => 'John',        'last_name' => 'Doe',        'company' => '',        'address_1' => '969 Market',        'address_2' => '',        'city' => 'San Francisco',        'state' => 'CA',        'postcode' => '94103',        'country' => 'US'    ]];print_r($woocommerce->post('customers', $data));?>
```

```
data = {    "email": "john.doe@example.com",    "first_name": "John",    "last_name": "Doe",    "username": "john.doe",    "billing": {        "first_name": "John",        "last_name": "Doe",        "company": "",        "address_1": "969 Market",        "address_2": "",        "city": "San Francisco",        "state": "CA",        "postcode": "94103",        "country": "US",        "email": "john.doe@example.com",        "phone": "(555) 555-5555"    },    "shipping": {        "first_name": "John",        "last_name": "Doe",        "company": "",        "address_1": "969 Market",        "address_2": "",        "city": "San Francisco",        "state": "CA",        "postcode": "94103",        "country": "US"    }}print(wcapi.post("customers", data).json())
```

```
data = {  email: "john.doe@example.com",  first_name: "John",  last_name: "Doe",  username: "john.doe",  billing: {    first_name: "John",    last_name: "Doe",    company: "",    address_1: "969 Market",    address_2: "",    city: "San Francisco",    state: "CA",    postcode: "94103",    country: "US",    email: "john.doe@example.com",    phone: "(555) 555-5555"  },  shipping: {    first_name: "John",    last_name: "Doe",    company: "",    address_1: "969 Market",    address_2: "",    city: "San Francisco",    state: "CA",    postcode: "94103",    country: "US"  }}woocommerce.post("customers", data).parsed_response
```

```
{	"id": 25,	"date_created": "2017-03-21T16:09:28",	"date_created_gmt": "2017-03-21T19:09:28",	"date_modified": "2017-03-21T16:09:30",	"date_modified_gmt": "2017-03-21T19:09:30",	"email": "john.doe@example.com",	"first_name": "John",	"last_name": "Doe",	"role": "customer",	"username": "john.doe",	"billing": {		"first_name": "John",		"last_name": "Doe",		"company": "",		"address_1": "969 Market",		"address_2": "",		"city": "San Francisco",		"state": "CA",		"postcode": "94103",		"country": "US",		"email": "john.doe@example.com",		"phone": "(555) 555-5555"	},	"shipping": {		"first_name": "John",		"last_name": "Doe",		"company": "",		"address_1": "969 Market",		"address_2": "",		"city": "San Francisco",		"state": "CA",		"postcode": "94103",		"country": "US"	},	"is_paying_customer": false,	"avatar_url": "https://secure.gravatar.com/avatar/8eb1b522f60d11fa897de1dc6351b7e8?s=96",	"meta_data": [],	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/customers/25"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/customers"			}		]	}}
```


## Retrieve a customer[​](/docs/apis/rest-api/v3/customers#retrieve-a-customer)


This API lets you retrieve and view a specific customer by ID.


```
GET /wp-json/wc/v3/customers/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/customers/25 \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'customers/25' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('customers/25')); ?>
```

```
print(wcapi.get("customers/25").json())
```

```
woocommerce.get("customers/25").parsed_response
```

```
{	"id": 25,	"date_created": "2017-03-21T16:09:28",	"date_created_gmt": "2017-03-21T19:09:28",	"date_modified": "2017-03-21T16:09:30",	"date_modified_gmt": "2017-03-21T19:09:30",	"email": "john.doe@example.com",	"first_name": "John",	"last_name": "Doe",	"role": "customer",	"username": "john.doe",	"billing": {		"first_name": "John",		"last_name": "Doe",		"company": "",		"address_1": "969 Market",		"address_2": "",		"city": "San Francisco",		"state": "CA",		"postcode": "94103",		"country": "US",		"email": "john.doe@example.com",		"phone": "(555) 555-5555"	},	"shipping": {		"first_name": "John",		"last_name": "Doe",		"company": "",		"address_1": "969 Market",		"address_2": "",		"city": "San Francisco",		"state": "CA",		"postcode": "94103",		"country": "US"	},	"is_paying_customer": false,	"avatar_url": "https://secure.gravatar.com/avatar/8eb1b522f60d11fa897de1dc6351b7e8?s=96",	"meta_data": [],	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/customers/25"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/customers"			}		]	}}
```


## List all customers[​](/docs/apis/rest-api/v3/customers#list-all-customers)


This API helps you to view all the customers.


```
GET /wp-json/wc/v3/customers
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/customers \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'customers' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('customers')); ?>
```

```
print(wcapi.get("customers").json())
```

```
woocommerce.get("customers").parsed_response
```

```
[	{		"id": 26,		"date_created": "2017-03-21T16:11:14",		"date_created_gmt": "2017-03-21T19:11:14",		"date_modified": "2017-03-21T16:11:16",		"date_modified_gmt": "2017-03-21T19:11:16",		"email": "joao.silva@example.com",		"first_name": "João",		"last_name": "Silva",		"role": "customer",		"username": "joao.silva",		"billing": {			"first_name": "João",			"last_name": "Silva",			"company": "",			"address_1": "Av. Brasil, 432",			"address_2": "",			"city": "Rio de Janeiro",			"state": "RJ",			"postcode": "12345-000",			"country": "BR",			"email": "joao.silva@example.com",			"phone": "(55) 5555-5555"		},		"shipping": {			"first_name": "João",			"last_name": "Silva",			"company": "",			"address_1": "Av. Brasil, 432",			"address_2": "",			"city": "Rio de Janeiro",			"state": "RJ",			"postcode": "12345-000",			"country": "BR"		},		"is_paying_customer": false,		"avatar_url": "https://secure.gravatar.com/avatar/be7b5febff88a2d947c3289e90cdf017?s=96",		"meta_data": [],		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/customers/26"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/customers"				}			]		}	},	{		"id": 25,		"date_created": "2017-03-21T16:09:28",		"date_created_gmt": "2017-03-21T19:09:28",		"date_modified": "2017-03-21T16:09:30",		"date_modified_gmt": "2017-03-21T19:09:30",		"email": "john.doe@example.com",		"first_name": "John",		"last_name": "Doe",		"role": "customer",		"username": "john.doe",		"billing": {			"first_name": "John",			"last_name": "Doe",			"company": "",			"address_1": "969 Market",			"address_2": "",			"city": "San Francisco",			"state": "CA",			"postcode": "94103",			"country": "US",			"email": "john.doe@example.com",			"phone": "(555) 555-5555"		},		"shipping": {			"first_name": "John",			"last_name": "Doe",			"company": "",			"address_1": "969 Market",			"address_2": "",			"city": "San Francisco",			"state": "CA",			"postcode": "94103",			"country": "US"		},		"is_paying_customer": false,		"avatar_url": "https://secure.gravatar.com/avatar/8eb1b522f60d11fa897de1dc6351b7e8?s=96",		"meta_data": [],		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/customers/25"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/customers"				}			]		}	}]
```


#### Available parameters[​](/docs/apis/rest-api/v3/customers#available-parameters)


| Parameter | Type | Description |
| --- | --- | --- |
| context | string | Scope under which the request is made; determines fields present in response. Options: view and edit. Default is view. |
| page | integer | Current page of the collection. Default is 1. |
| per_page | integer | Maximum number of items to be returned in result set. Default is 10. |
| search | string | Limit results to those matching a string. |
| exclude | array | Ensure result set excludes specific IDs. |
| include | array | Limit result set to specific IDs. |
| offset | integer | Offset the result set by a specific number of items. |
| order | string | Order sort attribute ascending or descending. Options: asc and desc. Default is asc. |
| orderby | string | Sort collection by object attribute. Options: id, include, name and registered_date. Default is name. |
| email | string | Limit result set to resources with a specific email. |
| role | string | Limit result set to resources with a specific role. Options: all, administrator, editor, author, contributor, subscriber, customer and shop_manager. Default is customer. |


## Update a customer[​](/docs/apis/rest-api/v3/customers#update-a-customer)


This API lets you make changes to a customer.


```
PUT /wp-json/wc/v3/customers/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X PUT https://example.com/wp-json/wc/v3/customers/25 \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "first_name": "James",  "billing": {    "first_name": "James"  },  "shipping": {    "first_name": "James"  }}'
```

```
const data = {	first_name: 'James',	billing: {		first_name: 'James',	},	shipping: {		first_name: 'James',	},};WooCommerce.put( 'customers/25', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'first_name' => 'James',    'billing' => [        'first_name' => 'James'    ],    'shipping' => [        'first_name' => 'James'    ]];print_r($woocommerce->put('customers/25', $data));?>
```

```
data = {    "first_name": "James",    "billing": {        "first_name": "James"    },    "shipping": {        "first_name": "James"    }}print(wcapi.put("customers/25", data).json())
```

```
data = {  first_name: "James",  billing: {    first_name: "James"  },  shipping: {    first_name: "James"  }}woocommerce.put("customers/25", data).parsed_response
```

```
{	"id": 25,	"date_created": "2017-03-21T16:09:28",	"date_created_gmt": "2017-03-21T19:09:28",	"date_modified": "2017-03-21T16:12:28",	"date_modified_gmt": "2017-03-21T19:12:28",	"email": "john.doe@example.com",	"first_name": "James",	"last_name": "Doe",	"role": "customer",	"username": "john.doe",	"billing": {		"first_name": "James",		"last_name": "Doe",		"company": "",		"address_1": "969 Market",		"address_2": "",		"city": "San Francisco",		"state": "CA",		"postcode": "94103",		"country": "US",		"email": "john.doe@example.com",		"phone": "(555) 555-5555"	},	"shipping": {		"first_name": "James",		"last_name": "Doe",		"company": "",		"address_1": "969 Market",		"address_2": "",		"city": "San Francisco",		"state": "CA",		"postcode": "94103",		"country": "US"	},	"is_paying_customer": false,	"avatar_url": "https://secure.gravatar.com/avatar/8eb1b522f60d11fa897de1dc6351b7e8?s=96",	"meta_data": [],	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/customers/25"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/customers"			}		]	}}
```


## Delete a customer[​](/docs/apis/rest-api/v3/customers#delete-a-customer)


This API helps you delete a customer.


```
DELETE /wp-json/wc/v3/customers/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X DELETE https://example.com/wp-json/wc/v3/customers/25?force=true \	-u consumer_key:consumer_secret
```

```
WooCommerce.delete( 'customers/25', {	force: true,} )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->delete('customers/25', ['force' => true])); ?>
```

```
print(wcapi.delete("customers/25", params={"force": True}).json())
```

```
woocommerce.delete("customers/25", force: true).parsed_response
```

```
{	"id": 25,	"date_created": "2017-03-21T16:09:28",	"date_created_gmt": "2017-03-21T19:09:28",	"date_modified": "2017-03-21T16:12:28",	"date_modified_gmt": "2017-03-21T19:12:28",	"email": "john.doe@example.com",	"first_name": "James",	"last_name": "Doe",	"role": "customer",	"username": "john.doe",	"billing": {		"first_name": "James",		"last_name": "Doe",		"company": "",		"address_1": "969 Market",		"address_2": "",		"city": "San Francisco",		"state": "CA",		"postcode": "94103",		"country": "US",		"email": "john.doe@example.com",		"phone": "(555) 555-5555"	},	"shipping": {		"first_name": "James",		"last_name": "Doe",		"company": "",		"address_1": "969 Market",		"address_2": "",		"city": "San Francisco",		"state": "CA",		"postcode": "94103",		"country": "US"	},	"is_paying_customer": false,	"avatar_url": "https://secure.gravatar.com/avatar/8eb1b522f60d11fa897de1dc6351b7e8?s=96",	"meta_data": [],	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/customers/25"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/customers"			}		]	}}
```


#### Available parameters[​](/docs/apis/rest-api/v3/customers#available-parameters-1)


| Parameter | Type | Description |
| --- | --- | --- |
| force | string | Required to be true, as resource does not support trashing. |
| reassign | integer | User ID to reassign posts to. |


## Batch update customers[​](/docs/apis/rest-api/v3/customers#batch-update-customers)


This API helps you to batch create, update and delete multiple customers.

note
Note: By default it's limited to up to 100 objects to be created, updated or
deleted.


```
POST /wp-json/wc/v3/customers/batch
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/customers/batch \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "create": [    {      "email": "john.doe2@example.com",      "first_name": "John",      "last_name": "Doe",      "username": "john.doe2",      "billing": {        "first_name": "John",        "last_name": "Doe",        "company": "",        "address_1": "969 Market",        "address_2": "",        "city": "San Francisco",        "state": "CA",        "postcode": "94103",        "country": "US",        "email": "john.doe@example.com",        "phone": "(555) 555-5555"      },      "shipping": {        "first_name": "John",        "last_name": "Doe",        "company": "",        "address_1": "969 Market",        "address_2": "",        "city": "San Francisco",        "state": "CA",        "postcode": "94103",        "country": "US"      }    },    {      "email": "joao.silva2@example.com",      "first_name": "João",      "last_name": "Silva",      "username": "joao.silva2",      "billing": {        "first_name": "João",        "last_name": "Silva",        "company": "",        "address_1": "Av. Brasil, 432",        "address_2": "",        "city": "Rio de Janeiro",        "state": "RJ",        "postcode": "12345-000",        "country": "BR",        "email": "joao.silva@example.com",        "phone": "(55) 5555-5555"      },      "shipping": {        "first_name": "João",        "last_name": "Silva",        "company": "",        "address_1": "Av. Brasil, 432",        "address_2": "",        "city": "Rio de Janeiro",        "state": "RJ",        "postcode": "12345-000",        "country": "BR"      }    }  ],  "update": [    {      "id": 26,      "billing": {        "phone": "(11) 1111-1111"      }    }  ],  "delete": [    25  ]}'
```

```
const data = {	create: [		{			email: 'john.doe2@example.com',			first_name: 'John',			last_name: 'Doe',			username: 'john.doe2',			billing: {				first_name: 'John',				last_name: 'Doe',				company: '',				address_1: '969 Market',				address_2: '',				city: 'San Francisco',				state: 'CA',				postcode: '94103',				country: 'US',				email: 'john.doe@example.com',				phone: '(555) 555-5555',			},			shipping: {				first_name: 'John',				last_name: 'Doe',				company: '',				address_1: '969 Market',				address_2: '',				city: 'San Francisco',				state: 'CA',				postcode: '94103',				country: 'US',			},		},		{			email: 'joao.silva2@example.com',			first_name: 'João',			last_name: 'Silva',			username: 'joao.silva2',			billing: {				first_name: 'João',				last_name: 'Silva',				company: '',				address_1: 'Av. Brasil, 432',				address_2: '',				city: 'Rio de Janeiro',				state: 'RJ',				postcode: '12345-000',				country: 'BR',				email: 'joao.silva@example.com',				phone: '(55) 5555-5555',			},			shipping: {				first_name: 'João',				last_name: 'Silva',				company: '',				address_1: 'Av. Brasil, 432',				address_2: '',				city: 'Rio de Janeiro',				state: 'RJ',				postcode: '12345-000',				country: 'BR',			},		},	],	update: [		{			id: 26,			billing: {				phone: '(11) 1111-1111',			},		},	],	delete: [ 11 ],};WooCommerce.post( 'customers/batch', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'create' => [        [            'email' => 'john.doe2@example.com',            'first_name' => 'John',            'last_name' => 'Doe',            'username' => 'john.doe2',            'billing' => [                'first_name' => 'John',                'last_name' => 'Doe',                'company' => '',                'address_1' => '969 Market',                'address_2' => '',                'city' => 'San Francisco',                'state' => 'CA',                'postcode' => '94103',                'country' => 'US',                'email' => 'john.doe@example.com',                'phone' => '(555) 555-5555'            ],            'shipping' => [                'first_name' => 'John',                'last_name' => 'Doe',                'company' => '',                'address_1' => '969 Market',                'address_2' => '',                'city' => 'San Francisco',                'state' => 'CA',                'postcode' => '94103',                'country' => 'US'            ]        ],        [            'email' => 'joao.silva2@example.com',            'first_name' => 'João',            'last_name' => 'Silva',            'username' => 'joao.silva2',            'billing' => [                'first_name' => 'João',                'last_name' => 'Silva',                'company' => '',                'address_1' => 'Av. Brasil, 432',                'address_2' => '',                'city' => 'Rio de Janeiro',                'state' => 'RJ',                'postcode' => '12345-000',                'country' => 'BR',                'email' => 'joao.silva@example.com',                'phone' => '(55) 5555-5555'            ],            'shipping' => [                'first_name' => 'João',                'last_name' => 'Silva',                'company' => '',                'address_1' => 'Av. Brasil, 432',                'address_2' => '',                'city' => 'Rio de Janeiro',                'state' => 'RJ',                'postcode' => '12345-000',                'country' => 'BR'            ]        ]    ],    'update' => [        [            'id' => 26,            'billing' => [                'phone' => '(11) 1111-1111'            ]        ]    ],    'delete' => [        25    ]];print_r($woocommerce->post('customers/batch', $data));?>
```

```
data = {    "create": [        {            "email": "john.doe2@example.com",            "first_name": "John",            "last_name": "Doe",            "username": "john.doe2",            "billing": {                "first_name": "John",                "last_name": "Doe",                "company": "",                "address_1": "969 Market",                "address_2": "",                "city": "San Francisco",                "state": "CA",                "postcode": "94103",                "country": "US",                "email": "john.doe@example.com",                "phone": "(555) 555-5555"            },            "shipping": {                "first_name": "John",                "last_name": "Doe",                "company": "",                "address_1": "969 Market",                "address_2": "",                "city": "San Francisco",                "state": "CA",                "postcode": "94103",                "country": "US"            }        },        {            "email": "joao.silva2@example.com",            "first_name": "João",            "last_name": "Silva",            "username": "joao.silva2",            "billing": {                "first_name": "João",                "last_name": "Silva",                "company": "",                "address_1": "Av. Brasil, 432",                "address_2": "",                "city": "Rio de Janeiro",                "state": "RJ",                "postcode": "12345-000",                "country": "BR",                "email": "joao.silva@example.com",                "phone": "(55) 5555-5555"            },            "shipping": {                "first_name": "João",                "last_name": "Silva",                "company": "",                "address_1": "Av. Brasil, 432",                "address_2": "",                "city": "Rio de Janeiro",                "state": "RJ",                "postcode": "12345-000",                "country": "BR"            }        }    ],    "update": [        {            "id": 26,            "billing": {                "phone": "(11) 1111-1111"            }        }    ],    "delete": [        25    ]}print(wcapi.post("customers/batch", data).json())
```

```
data = {  create: [    {      email: "john.doe2@example.com",      first_name: "John",      last_name: "Doe",      username: "john.doe2",      billing: {        first_name: "John",        last_name: "Doe",        company: "",        address_1: "969 Market",        address_2: "",        city: "San Francisco",        state: "CA",        postcode: "94103",        country: "US",        email: "john.doe@example.com",        phone: "(555) 555-5555"      },      shipping: {        first_name: "John",        last_name: "Doe",        company: "",        address_1: "969 Market",        address_2: "",        city: "San Francisco",        state: "CA",        postcode: "94103",        country: "US"      }    },    {      email: "joao.silva2@example.com",      first_name: "João",      last_name: "Silva",      username: "joao.silva2",      billing: {        first_name: "João",        last_name: "Silva",        company: "",        address_1: "Av. Brasil, 432",        address_2: "",        city: "Rio de Janeiro",        state: "RJ",        postcode: "12345-000",        country: "BR",        email: "joao.silva@example.com",        phone: "(55) 5555-5555"      },      shipping: {        first_name: "João",        last_name: "Silva",        company: "",        address_1: "Av. Brasil, 432",        address_2: "",        city: "Rio de Janeiro",        state: "RJ",        postcode: "12345-000",        country: "BR"      }    }  ],  update: [    {      id: 26,      billing: {        phone: "(11) 1111-1111"      }    }  ],  delete: [    25  ]}woocommerce.post("customers/batch", data).parsed_response
```

```
{	"create": [		{			"id": 27,			"date_created": "2017-03-21T16:13:58",			"date_created_gmt": "2017-03-21T19:13:58",			"date_modified": "2017-03-21T16:13:59",			"date_modified_gmt": "2017-03-21T19:13:59",			"email": "john.doe2@example.com",			"first_name": "John",			"last_name": "Doe",			"role": "customer",			"username": "john.doe2",			"billing": {				"first_name": "John",				"last_name": "Doe",				"company": "",				"address_1": "969 Market",				"address_2": "",				"city": "San Francisco",				"state": "CA",				"postcode": "94103",				"country": "US",				"email": "john.doe@example.com",				"phone": "(555) 555-5555"			},			"shipping": {				"first_name": "John",				"last_name": "Doe",				"company": "",				"address_1": "969 Market",				"address_2": "",				"city": "San Francisco",				"state": "CA",				"postcode": "94103",				"country": "US"			},			"is_paying_customer": false,			"avatar_url": "https://secure.gravatar.com/avatar/6ad0b094bac53a85bb282ccdb3958279?s=96",			"meta_data": [],			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/customers/27"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/customers"					}				]			}		},		{			"id": 28,			"date_created": "2017-03-21T16:14:00",			"date_created_gmt": "2017-03-21T19:14:00",			"date_modified": "2017-03-21T16:14:01",			"date_modified_gmt": "2017-03-21T19:14:01",			"email": "joao.silva2@example.com",			"first_name": "João",			"last_name": "Silva",			"role": "customer",			"username": "joao.silva2",			"billing": {				"first_name": "João",				"last_name": "Silva",				"company": "",				"address_1": "Av. Brasil, 432",				"address_2": "",				"city": "Rio de Janeiro",				"state": "RJ",				"postcode": "12345-000",				"country": "BR",				"email": "joao.silva@example.com",				"phone": "(55) 5555-5555"			},			"shipping": {				"first_name": "João",				"last_name": "Silva",				"company": "",				"address_1": "Av. Brasil, 432",				"address_2": "",				"city": "Rio de Janeiro",				"state": "RJ",				"postcode": "12345-000",				"country": "BR"			},			"is_paying_customer": false,			"avatar_url": "https://secure.gravatar.com/avatar/ea9ad095f2970f27cbff07e7f5e99453?s=96",			"meta_data": [],			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/customers/28"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/customers"					}				]			}		}	],	"update": [		{			"id": 26,			"date_created": "2017-03-21T16:11:14",			"date_created_gmt": "2017-03-21T19:11:14",			"date_modified": "2017-03-21T16:14:03",			"date_modified_gmt": "2017-03-21T19:14:03",			"email": "joao.silva@example.com",			"first_name": "João",			"last_name": "Silva",			"role": "customer",			"username": "joao.silva",			"billing": {				"first_name": "João",				"last_name": "Silva",				"company": "",				"address_1": "Av. Brasil, 432",				"address_2": "",				"city": "Rio de Janeiro",				"state": "RJ",				"postcode": "12345-000",				"country": "BR",				"email": "joao.silva@example.com",				"phone": "(11) 1111-1111"			},			"shipping": {				"first_name": "João",				"last_name": "Silva",				"company": "",				"address_1": "Av. Brasil, 432",				"address_2": "",				"city": "Rio de Janeiro",				"state": "RJ",				"postcode": "12345-000",				"country": "BR"			},			"is_paying_customer": false,			"avatar_url": "https://secure.gravatar.com/avatar/be7b5febff88a2d947c3289e90cdf017?s=96",			"meta_data": [],			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/customers/26"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/customers"					}				]			}		}	],	"delete": [		{			"id": 25,			"date_created": "2017-03-21T16:09:28",			"date_created_gmt": "2017-03-21T19:09:28",			"date_modified": "2017-03-21T16:12:28",			"date_modified_gmt": "2017-03-21T19:12:28",			"email": "john.doe@example.com",			"first_name": "James",			"last_name": "Doe",			"role": "customer",			"username": "john.doe",			"billing": {				"first_name": "James",				"last_name": "Doe",				"company": "",				"address_1": "969 Market",				"address_2": "",				"city": "San Francisco",				"state": "CA",				"postcode": "94103",				"country": "US",				"email": "john.doe@example.com",				"phone": "(555) 555-5555"			},			"shipping": {				"first_name": "James",				"last_name": "Doe",				"company": "",				"address_1": "969 Market",				"address_2": "",				"city": "San Francisco",				"state": "CA",				"postcode": "94103",				"country": "US"			},			"is_paying_customer": false,			"avatar_url": "https://secure.gravatar.com/avatar/8eb1b522f60d11fa897de1dc6351b7e8?s=96",			"meta_data": [],			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/customers/25"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/customers"					}				]			}		}	]}
```


## Retrieve customer downloads[​](/docs/apis/rest-api/v3/customers#retrieve-customer-downloads)


This API lets you retrieve customer downloads permissions.


```
GET /wp-json/wc/v3/customers/<id>/downloads
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/customers/26/downloads \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'customers/26/downloads' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('customers/26/downloads')); ?>
```

```
print(wcapi.get("customers/26/downloads").json())
```

```
woocommerce.get("customers/26/downloads").parsed_response
```

```
[	{		"download_id": "91447fd1849316bbc89dfb7e986a6006",		"download_url": "https://example.com/?download_file=87&order=wc_order_58d17c18352&email=joao.silva%40example.com&key=91447fd1849316bbc89dfb7e986a6006",		"product_id": 87,		"product_name": "Woo Album #2",		"download_name": "Woo Album #2 &ndash; Song 2",		"order_id": 723,		"order_key": "wc_order_58d17c18352",		"downloads_remaining": "3",		"access_expires": "never",		"access_expires_gmt": "never",		"file": {			"name": "Song 2",			"file": "http://example.com/wp-content/uploads/woocommerce_uploads/2013/06/Song.mp3"		},		"_links": {			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/customers/26/downloads"				}			],			"product": [				{					"href": "https://example.com/wp-json/wc/v3/products/87"				}			],			"order": [				{					"href": "https://example.com/wp-json/wc/v3/orders/723"				}			]		}	}]
```


### Customer downloads properties[​](/docs/apis/rest-api/v3/customers#customer-downloads-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| download_id | string | Download ID (MD5). READ-ONLY |
| download_url | string | Download file URL. READ-ONLY |
| product_id | integer | Downloadable product ID. READ-ONLY |
| product_name | string | Product name. READ-ONLY |
| download_name | string | Downloadable file name. READ-ONLY |
| order_id | integer | Order ID. READ-ONLY |
| order_key | string | Order key. READ-ONLY |
| downloads_remaining | string | Number of downloads remaining. READ-ONLY |
| access_expires | string | The date when download access expires, in the site's timezone. READ-ONLY |
| access_expires_gmt | string | The date when download access expires, as GMT. READ-ONLY |
| file | object | File details. READ-ONLY See Customers downloads - File properties |


### Customer downloads - File properties[​](/docs/apis/rest-api/v3/customers#customer-downloads---file-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| name | string | File name. READ-ONLY |
| file | string | File URL. READ-ONLY |

---

<a name="orders"></a>

The orders API allows you to create, view, update, and delete individual, or a batch, of orders.


## Order properties[​](/docs/apis/rest-api/v3/orders#order-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Unique identifier for the resource. READ-ONLY |
| parent_id | integer | Parent order ID. |
| number | string | Order number. READ-ONLY |
| order_key | string | Order key. READ-ONLY |
| created_via | string | Shows where the order was created. It can only be set during order creation and cannot be modified afterward. |
| version | string | Version of WooCommerce which last updated the order. READ-ONLY |
| status | string | Order status. Options: pending, processing, on-hold, completed, cancelled, refunded, failed and trash. Default is pending. |
| currency | string | Currency the order was created with, in ISO format. Options: AED, AFN, ALL, AMD, ANG, AOA, ARS, AUD, AWG, AZN, BAM, BBD, BDT, BGN, BHD, BIF, BMD, BND, BOB, BRL, BSD, BTC, BTN, BWP, BYR, BZD, CAD, CDF, CHF, CLP, CNY, COP, CRC, CUC, CUP, CVE, CZK, DJF, DKK, DOP, DZD, EGP, ERN, ETB, EUR, FJD, FKP, GBP, GEL, GGP, GHS, GIP, GMD, GNF, GTQ, GYD, HKD, HNL, HRK, HTG, HUF, IDR, ILS, IMP, INR, IQD, IRR, IRT, ISK, JEP, JMD, JOD, JPY, KES, KGS, KHR, KMF, KPW, KRW, KWD, KYD, KZT, LAK, LBP, LKR, LRD, LSL, LYD, MAD, MDL, MGA, MKD, MMK, MNT, MOP, MRO, MUR, MVR, MWK, MXN, MYR, MZN, NAD, NGN, NIO, NOK, NPR, NZD, OMR, PAB, PEN, PGK, PHP, PKR, PLN, PRB, PYG, QAR, RON, RSD, RUB, RWF, SAR, SBD, SCR, SDG, SEK, SGD, SHP, SLL, SOS, SRD, SSP, STD, SYP, SZL, THB, TJS, TMT, TND, TOP, TRY, TTD, TWD, TZS, UAH, UGX, USD, UYU, UZS, VEF, VND, VUV, WST, XAF, XCD, XOF, XPF, YER, ZAR and ZMW. Default is USD. |
| date_created | date-time | The date the order was created, in the site's timezone. READ-ONLY |
| date_created_gmt | date-time | The date the order was created, as GMT. READ-ONLY |
| date_modified | date-time | The date the order was last modified, in the site's timezone. READ-ONLY |
| date_modified_gmt | date-time | The date the order was last modified, as GMT. READ-ONLY |
| discount_total | string | Total discount amount for the order. READ-ONLY |
| discount_tax | string | Total discount tax amount for the order. READ-ONLY |
| shipping_total | string | Total shipping amount for the order. READ-ONLY |
| shipping_tax | string | Total shipping tax amount for the order. READ-ONLY |
| cart_tax | string | Sum of line item taxes only. READ-ONLY |
| total | string | Grand total. READ-ONLY |
| total_tax | string | Sum of all taxes. READ-ONLY |
| prices_include_tax | boolean | True the prices included tax during checkout. READ-ONLY |
| customer_id | integer | User ID who owns the order. 0 for guests. Default is 0. |
| customer_ip_address | string | Customer's IP address. READ-ONLY |
| customer_user_agent | string | User agent of the customer. READ-ONLY |
| customer_note | string | Note left by customer during checkout. |
| billing | object | Billing address. See Order - Billing properties |
| shipping | object | Shipping address. See Order - Shipping properties |
| payment_method | string | Payment method ID. |
| payment_method_title | string | Payment method title. |
| transaction_id | string | Unique transaction ID. |
| date_paid | date-time | The date the order was paid, in the site's timezone. READ-ONLY |
| date_paid_gmt | date-time | The date the order was paid, as GMT. READ-ONLY |
| date_completed | date-time | The date the order was completed, in the site's timezone. READ-ONLY |
| date_completed_gmt | date-time | The date the order was completed, as GMT. READ-ONLY |
| cart_hash | string | MD5 hash of cart items to ensure orders are not modified. READ-ONLY |
| meta_data | array | Meta data. See Order - Meta data properties |
| line_items | array | Line items data. See Order - Line items properties |
| tax_lines | array | Tax lines data. See Order - Tax lines properties READ-ONLY |
| shipping_lines | array | Shipping lines data. See Order - Shipping lines properties |
| fee_lines | array | Fee lines data. See Order - Fee lines properties |
| coupon_lines | array | Coupons line data. See Order - Coupon lines properties |
| refunds | array | List of refunds. See Order - Refunds properties READ-ONLY |
| set_paid | boolean | Define if the order is paid. It will set the status to processing and reduce stock items. Default is false. WRITE-ONLY |


### Order - Billing properties[​](/docs/apis/rest-api/v3/orders#order---billing-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| first_name | string | First name. |
| last_name | string | Last name. |
| company | string | Company name. |
| address_1 | string | Address line 1 |
| address_2 | string | Address line 2 |
| city | string | City name. |
| state | string | ISO code or name of the state, province or district. |
| postcode | string | Postal code. |
| country | string | Country code in ISO 3166-1 alpha-2 format. |
| email | string | Email address. |
| phone | string | Phone number. |


### Order - Shipping properties[​](/docs/apis/rest-api/v3/orders#order---shipping-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| first_name | string | First name. |
| last_name | string | Last name. |
| company | string | Company name. |
| address_1 | string | Address line 1 |
| address_2 | string | Address line 2 |
| city | string | City name. |
| state | string | ISO code or name of the state, province or district. |
| postcode | string | Postal code. |
| country | string | Country code in ISO 3166-1 alpha-2 format. |


### Order - Meta data properties[​](/docs/apis/rest-api/v3/orders#order---meta-data-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Meta ID. READ-ONLY |
| key | string | Meta key. |
| value | string | Meta value. |


### Order - Line items properties[​](/docs/apis/rest-api/v3/orders#order---line-items-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Item ID. READ-ONLY |
| name | string | Product name. |
| product_id | integer | Product ID. |
| variation_id | integer | Variation ID, if applicable. |
| quantity | integer | Quantity ordered. |
| tax_class | string | Slug of the tax class of product. |
| subtotal | string | Line subtotal (before discounts). |
| subtotal_tax | string | Line subtotal tax (before discounts). READ-ONLY |
| total | string | Line total (after discounts). |
| total_tax | string | Line total tax (after discounts). READ-ONLY |
| taxes | array | Line taxes. See Order - Tax lines properties READ-ONLY |
| meta_data | array | Meta data. See Order - Meta data properties |
| sku | string | Product SKU. READ-ONLY |
| price | string | Product price. READ-ONLY |


### Order - Tax lines properties[​](/docs/apis/rest-api/v3/orders#order---tax-lines-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Item ID. READ-ONLY |
| rate_code | string | Tax rate code. READ-ONLY |
| rate_id | integer | Tax rate ID. READ-ONLY |
| label | string | Tax rate label. READ-ONLY |
| compound | boolean | Whether or not this is a compound tax rate. READ-ONLY |
| tax_total | string | Tax total (not including shipping taxes). READ-ONLY |
| shipping_tax_total | string | Shipping tax total. READ-ONLY |
| meta_data | array | Meta data. See Order - Meta data properties |


### Order - Shipping lines properties[​](/docs/apis/rest-api/v3/orders#order---shipping-lines-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Item ID. READ-ONLY |
| method_title | string | Shipping method name. |
| method_id | string | Shipping method ID. |
| total | string | Line total (after discounts). |
| total_tax | string | Line total tax (after discounts). READ-ONLY |
| taxes | array | Line taxes. See Order - Tax lines properties READ-ONLY |
| meta_data | array | Meta data. See Order - Meta data properties |


### Order - Fee lines properties[​](/docs/apis/rest-api/v3/orders#order---fee-lines-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Item ID. READ-ONLY |
| name | string | Fee name. |
| tax_class | string | Tax class of fee. |
| tax_status | string | Tax status of fee. Options: taxable and none. |
| total | string | Line total (after discounts). |
| total_tax | string | Line total tax (after discounts). READ-ONLY |
| taxes | array | Line taxes. See Order - Tax lines properties READ-ONLY |
| meta_data | array | Meta data. See Order - Meta data properties |


### Order - Coupon lines properties[​](/docs/apis/rest-api/v3/orders#order---coupon-lines-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Item ID. READ-ONLY |
| code | string | Coupon code. |
| discount | string | Discount total. READ-ONLY |
| discount_tax | string | Discount total tax. READ-ONLY |
| meta_data | array | Meta data. See Order - Meta data properties |


### Order - Refunds properties[​](/docs/apis/rest-api/v3/orders#order---refunds-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Refund ID. READ-ONLY |
| reason | string | Refund reason. READ-ONLY |
| total | string | Refund total. READ-ONLY |


## Create an order[​](/docs/apis/rest-api/v3/orders#create-an-order)


This API helps you to create a new order.


```
POST /wp-json/wc/v3/orders
```


> Example of create a paid order:


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/orders \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "payment_method": "bacs",  "payment_method_title": "Direct Bank Transfer",  "set_paid": true,  "billing": {    "first_name": "John",    "last_name": "Doe",    "address_1": "969 Market",    "address_2": "",    "city": "San Francisco",    "state": "CA",    "postcode": "94103",    "country": "US",    "email": "john.doe@example.com",    "phone": "(555) 555-5555"  },  "shipping": {    "first_name": "John",    "last_name": "Doe",    "address_1": "969 Market",    "address_2": "",    "city": "San Francisco",    "state": "CA",    "postcode": "94103",    "country": "US"  },  "line_items": [    {      "product_id": 93,      "quantity": 2    },    {      "product_id": 22,      "variation_id": 23,      "quantity": 1    }  ],  "shipping_lines": [    {      "method_id": "flat_rate",      "method_title": "Flat Rate",      "total": "10.00"    }  ]}'
```

```
const data = {	payment_method: 'bacs',	payment_method_title: 'Direct Bank Transfer',	set_paid: true,	billing: {		first_name: 'John',		last_name: 'Doe',		address_1: '969 Market',		address_2: '',		city: 'San Francisco',		state: 'CA',		postcode: '94103',		country: 'US',		email: 'john.doe@example.com',		phone: '(555) 555-5555',	},	shipping: {		first_name: 'John',		last_name: 'Doe',		address_1: '969 Market',		address_2: '',		city: 'San Francisco',		state: 'CA',		postcode: '94103',		country: 'US',	},	line_items: [		{			product_id: 93,			quantity: 2,		},		{			product_id: 22,			variation_id: 23,			quantity: 1,		},	],	shipping_lines: [		{			method_id: 'flat_rate',			method_title: 'Flat Rate',			total: '10.00',		},	],};WooCommerce.post( 'orders', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'payment_method' => 'bacs',    'payment_method_title' => 'Direct Bank Transfer',    'set_paid' => true,    'billing' => [        'first_name' => 'John',        'last_name' => 'Doe',        'address_1' => '969 Market',        'address_2' => '',        'city' => 'San Francisco',        'state' => 'CA',        'postcode' => '94103',        'country' => 'US',        'email' => 'john.doe@example.com',        'phone' => '(555) 555-5555'    ],    'shipping' => [        'first_name' => 'John',        'last_name' => 'Doe',        'address_1' => '969 Market',        'address_2' => '',        'city' => 'San Francisco',        'state' => 'CA',        'postcode' => '94103',        'country' => 'US'    ],    'line_items' => [        [            'product_id' => 93,            'quantity' => 2        ],        [            'product_id' => 22,            'variation_id' => 23,            'quantity' => 1        ]    ],    'shipping_lines' => [        [            'method_id' => 'flat_rate',            'method_title' => 'Flat Rate',            'total' => '10.00'        ]    ]];print_r($woocommerce->post('orders', $data));?>
```

```
data = {    "payment_method": "bacs",    "payment_method_title": "Direct Bank Transfer",    "set_paid": True,    "billing": {        "first_name": "John",        "last_name": "Doe",        "address_1": "969 Market",        "address_2": "",        "city": "San Francisco",        "state": "CA",        "postcode": "94103",        "country": "US",        "email": "john.doe@example.com",        "phone": "(555) 555-5555"    },    "shipping": {        "first_name": "John",        "last_name": "Doe",        "address_1": "969 Market",        "address_2": "",        "city": "San Francisco",        "state": "CA",        "postcode": "94103",        "country": "US"    },    "line_items": [        {            "product_id": 93,            "quantity": 2        },        {            "product_id": 22,            "variation_id": 23,            "quantity": 1        }    ],    "shipping_lines": [        {            "method_id": "flat_rate",            "method_title": "Flat Rate",            "total": "10.00"        }    ]}print(wcapi.post("orders", data).json())
```

```
data = {  payment_method: "bacs",  payment_method_title: "Direct Bank Transfer",  set_paid: true,  billing: {    first_name: "John",    last_name: "Doe",    address_1: "969 Market",    address_2: "",    city: "San Francisco",    state: "CA",    postcode: "94103",    country: "US",    email: "john.doe@example.com",    phone: "(555) 555-5555"  },  shipping: {    first_name: "John",    last_name: "Doe",    address_1: "969 Market",    address_2: "",    city: "San Francisco",    state: "CA",    postcode: "94103",    country: "US"  },  line_items: [    {      product_id: 93,      quantity: 2    },    {      product_id: 22,      variation_id: 23,      quantity: 1    }  ],  shipping_lines: [    {      method_id: "flat_rate",      method_title: "Flat Rate",      total: "10.00"    }  ]}woocommerce.post("orders", data).parsed_response
```

```
{	"id": 727,	"parent_id": 0,	"number": "727",	"order_key": "wc_order_58d2d042d1d",	"created_via": "rest-api",	"version": "3.0.0",	"status": "processing",	"currency": "USD",	"date_created": "2017-03-22T16:28:02",	"date_created_gmt": "2017-03-22T19:28:02",	"date_modified": "2017-03-22T16:28:08",	"date_modified_gmt": "2017-03-22T19:28:08",	"discount_total": "0.00",	"discount_tax": "0.00",	"shipping_total": "10.00",	"shipping_tax": "0.00",	"cart_tax": "1.35",	"total": "29.35",	"total_tax": "1.35",	"prices_include_tax": false,	"customer_id": 0,	"customer_ip_address": "",	"customer_user_agent": "",	"customer_note": "",	"billing": {		"first_name": "John",		"last_name": "Doe",		"company": "",		"address_1": "969 Market",		"address_2": "",		"city": "San Francisco",		"state": "CA",		"postcode": "94103",		"country": "US",		"email": "john.doe@example.com",		"phone": "(555) 555-5555"	},	"shipping": {		"first_name": "John",		"last_name": "Doe",		"company": "",		"address_1": "969 Market",		"address_2": "",		"city": "San Francisco",		"state": "CA",		"postcode": "94103",		"country": "US"	},	"payment_method": "bacs",	"payment_method_title": "Direct Bank Transfer",	"transaction_id": "",	"date_paid": "2017-03-22T16:28:08",	"date_paid_gmt": "2017-03-22T19:28:08",	"date_completed": null,	"date_completed_gmt": null,	"cart_hash": "",	"meta_data": [		{			"id": 13106,			"key": "_download_permissions_granted",			"value": "yes"		}	],	"line_items": [		{			"id": 315,			"name": "Woo Single #1",			"product_id": 93,			"variation_id": 0,			"quantity": 2,			"tax_class": "",			"subtotal": "6.00",			"subtotal_tax": "0.45",			"total": "6.00",			"total_tax": "0.45",			"taxes": [				{					"id": 75,					"total": "0.45",					"subtotal": "0.45"				}			],			"meta_data": [],			"sku": "",			"price": 3		},		{			"id": 316,			"name": "Ship Your Idea &ndash; Color: Black, Size: M Test",			"product_id": 22,			"variation_id": 23,			"quantity": 1,			"tax_class": "",			"subtotal": "12.00",			"subtotal_tax": "0.90",			"total": "12.00",			"total_tax": "0.90",			"taxes": [				{					"id": 75,					"total": "0.9",					"subtotal": "0.9"				}			],			"meta_data": [				{					"id": 2095,					"key": "pa_color",					"value": "black"				},				{					"id": 2096,					"key": "size",					"value": "M Test"				}			],			"sku": "Bar3",			"price": 12		}	],	"tax_lines": [		{			"id": 318,			"rate_code": "US-CA-STATE TAX",			"rate_id": 75,			"label": "State Tax",			"compound": false,			"tax_total": "1.35",			"shipping_tax_total": "0.00",			"meta_data": []		}	],	"shipping_lines": [		{			"id": 317,			"method_title": "Flat Rate",			"method_id": "flat_rate",			"total": "10.00",			"total_tax": "0.00",			"taxes": [],			"meta_data": []		}	],	"fee_lines": [],	"coupon_lines": [],	"refunds": [],	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/orders/727"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/orders"			}		]	}}
```


## Retrieve an order[​](/docs/apis/rest-api/v3/orders#retrieve-an-order)


This API lets you retrieve and view a specific order.


```
GET /wp-json/wc/v3/orders/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/orders/727 \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'orders/727' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('orders/727')); ?>
```

```
print(wcapi.get("orders/727").json())
```

```
woocommerce.get("orders/727").parsed_response
```

```
{	"id": 727,	"parent_id": 0,	"number": "727",	"order_key": "wc_order_58d2d042d1d",	"created_via": "rest-api",	"version": "3.0.0",	"status": "processing",	"currency": "USD",	"date_created": "2017-03-22T16:28:02",	"date_created_gmt": "2017-03-22T19:28:02",	"date_modified": "2017-03-22T16:28:08",	"date_modified_gmt": "2017-03-22T19:28:08",	"discount_total": "0.00",	"discount_tax": "0.00",	"shipping_total": "10.00",	"shipping_tax": "0.00",	"cart_tax": "1.35",	"total": "29.35",	"total_tax": "1.35",	"prices_include_tax": false,	"customer_id": 0,	"customer_ip_address": "",	"customer_user_agent": "",	"customer_note": "",	"billing": {		"first_name": "John",		"last_name": "Doe",		"company": "",		"address_1": "969 Market",		"address_2": "",		"city": "San Francisco",		"state": "CA",		"postcode": "94103",		"country": "US",		"email": "john.doe@example.com",		"phone": "(555) 555-5555"	},	"shipping": {		"first_name": "John",		"last_name": "Doe",		"company": "",		"address_1": "969 Market",		"address_2": "",		"city": "San Francisco",		"state": "CA",		"postcode": "94103",		"country": "US"	},	"payment_method": "bacs",	"payment_method_title": "Direct Bank Transfer",	"transaction_id": "",	"date_paid": "2017-03-22T16:28:08",	"date_paid_gmt": "2017-03-22T19:28:08",	"date_completed": null,	"date_completed_gmt": null,	"cart_hash": "",	"meta_data": [		{			"id": 13106,			"key": "_download_permissions_granted",			"value": "yes"		}	],	"line_items": [		{			"id": 315,			"name": "Woo Single #1",			"product_id": 93,			"variation_id": 0,			"quantity": 2,			"tax_class": "",			"subtotal": "6.00",			"subtotal_tax": "0.45",			"total": "6.00",			"total_tax": "0.45",			"taxes": [				{					"id": 75,					"total": "0.45",					"subtotal": "0.45"				}			],			"meta_data": [],			"sku": "",			"price": 3		},		{			"id": 316,			"name": "Ship Your Idea &ndash; Color: Black, Size: M Test",			"product_id": 22,			"variation_id": 23,			"quantity": 1,			"tax_class": "",			"subtotal": "12.00",			"subtotal_tax": "0.90",			"total": "12.00",			"total_tax": "0.90",			"taxes": [				{					"id": 75,					"total": "0.9",					"subtotal": "0.9"				}			],			"meta_data": [				{					"id": 2095,					"key": "pa_color",					"value": "black"				},				{					"id": 2096,					"key": "size",					"value": "M Test"				}			],			"sku": "Bar3",			"price": 12		}	],	"tax_lines": [		{			"id": 318,			"rate_code": "US-CA-STATE TAX",			"rate_id": 75,			"label": "State Tax",			"compound": false,			"tax_total": "1.35",			"shipping_tax_total": "0.00",			"meta_data": []		}	],	"shipping_lines": [		{			"id": 317,			"method_title": "Flat Rate",			"method_id": "flat_rate",			"total": "10.00",			"total_tax": "0.00",			"taxes": [],			"meta_data": []		}	],	"fee_lines": [],	"coupon_lines": [],	"refunds": [],	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/orders/727"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/orders"			}		]	}}
```


#### Available parameters[​](/docs/apis/rest-api/v3/orders#available-parameters)


| Parameter | Type | Description |
| --- | --- | --- |
| dp | string | Number of decimal points to use in each resource. |


## List all orders[​](/docs/apis/rest-api/v3/orders#list-all-orders)


This API helps you to view all the orders.


```
GET /wp-json/wc/v3/orders
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/orders \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'orders' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('orders')); ?>
```

```
print(wcapi.get("orders").json())
```

```
woocommerce.get("orders").parsed_response
```

```
[	{		"id": 727,		"parent_id": 0,		"number": "727",		"order_key": "wc_order_58d2d042d1d",		"created_via": "rest-api",		"version": "3.0.0",		"status": "processing",		"currency": "USD",		"date_created": "2017-03-22T16:28:02",		"date_created_gmt": "2017-03-22T19:28:02",		"date_modified": "2017-03-22T16:28:08",		"date_modified_gmt": "2017-03-22T19:28:08",		"discount_total": "0.00",		"discount_tax": "0.00",		"shipping_total": "10.00",		"shipping_tax": "0.00",		"cart_tax": "1.35",		"total": "29.35",		"total_tax": "1.35",		"prices_include_tax": false,		"customer_id": 0,		"customer_ip_address": "",		"customer_user_agent": "",		"customer_note": "",		"billing": {			"first_name": "John",			"last_name": "Doe",			"company": "",			"address_1": "969 Market",			"address_2": "",			"city": "San Francisco",			"state": "CA",			"postcode": "94103",			"country": "US",			"email": "john.doe@example.com",			"phone": "(555) 555-5555"		},		"shipping": {			"first_name": "John",			"last_name": "Doe",			"company": "",			"address_1": "969 Market",			"address_2": "",			"city": "San Francisco",			"state": "CA",			"postcode": "94103",			"country": "US"		},		"payment_method": "bacs",		"payment_method_title": "Direct Bank Transfer",		"transaction_id": "",		"date_paid": "2017-03-22T16:28:08",		"date_paid_gmt": "2017-03-22T19:28:08",		"date_completed": null,		"date_completed_gmt": null,		"cart_hash": "",		"meta_data": [			{				"id": 13106,				"key": "_download_permissions_granted",				"value": "yes"			},			{				"id": 13109,				"key": "_order_stock_reduced",				"value": "yes"			}		],		"line_items": [			{				"id": 315,				"name": "Woo Single #1",				"product_id": 93,				"variation_id": 0,				"quantity": 2,				"tax_class": "",				"subtotal": "6.00",				"subtotal_tax": "0.45",				"total": "6.00",				"total_tax": "0.45",				"taxes": [					{						"id": 75,						"total": "0.45",						"subtotal": "0.45"					}				],				"meta_data": [],				"sku": "",				"price": 3			},			{				"id": 316,				"name": "Ship Your Idea &ndash; Color: Black, Size: M Test",				"product_id": 22,				"variation_id": 23,				"quantity": 1,				"tax_class": "",				"subtotal": "12.00",				"subtotal_tax": "0.90",				"total": "12.00",				"total_tax": "0.90",				"taxes": [					{						"id": 75,						"total": "0.9",						"subtotal": "0.9"					}				],				"meta_data": [					{						"id": 2095,						"key": "pa_color",						"value": "black"					},					{						"id": 2096,						"key": "size",						"value": "M Test"					}				],				"sku": "Bar3",				"price": 12			}		],		"tax_lines": [			{				"id": 318,				"rate_code": "US-CA-STATE TAX",				"rate_id": 75,				"label": "State Tax",				"compound": false,				"tax_total": "1.35",				"shipping_tax_total": "0.00",				"meta_data": []			}		],		"shipping_lines": [			{				"id": 317,				"method_title": "Flat Rate",				"method_id": "flat_rate",				"total": "10.00",				"total_tax": "0.00",				"taxes": [],				"meta_data": []			}		],		"fee_lines": [],		"coupon_lines": [],		"refunds": [],		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/orders/727"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/orders"				}			],			"email_templates": [				{					"embeddable": true,					"href": "http://example.com/wp-json/wc/v3/orders/723/actions/email_templates"				}			]		}	},	{		"id": 723,		"parent_id": 0,		"number": "723",		"order_key": "wc_order_58d17c18352",		"created_via": "checkout",		"version": "3.0.0",		"status": "completed",		"currency": "USD",		"date_created": "2017-03-21T16:16:00",		"date_created_gmt": "2017-03-21T19:16:00",		"date_modified": "2017-03-21T16:54:51",		"date_modified_gmt": "2017-03-21T19:54:51",		"discount_total": "0.00",		"discount_tax": "0.00",		"shipping_total": "10.00",		"shipping_tax": "0.00",		"cart_tax": "0.00",		"total": "39.00",		"total_tax": "0.00",		"prices_include_tax": false,		"customer_id": 26,		"customer_ip_address": "127.0.0.1",		"customer_user_agent": "mozilla/5.0 (x11; ubuntu; linux x86_64; rv:52.0) gecko/20100101 firefox/52.0",		"customer_note": "",		"billing": {			"first_name": "João",			"last_name": "Silva",			"company": "",			"address_1": "Av. Brasil, 432",			"address_2": "",			"city": "Rio de Janeiro",			"state": "RJ",			"postcode": "12345-000",			"country": "BR",			"email": "joao.silva@example.com",			"phone": "(11) 1111-1111"		},		"shipping": {			"first_name": "João",			"last_name": "Silva",			"company": "",			"address_1": "Av. Brasil, 432",			"address_2": "",			"city": "Rio de Janeiro",			"state": "RJ",			"postcode": "12345-000",			"country": "BR"		},		"payment_method": "bacs",		"payment_method_title": "Direct bank transfer",		"transaction_id": "",		"date_paid": null,		"date_paid_gmt": null,		"date_completed": "2017-03-21T16:54:51",		"date_completed_gmt": "2017-03-21T19:54:51",		"cart_hash": "5040ce7273261e31d8bcf79f9be3d279",		"meta_data": [			{				"id": 13023,				"key": "_download_permissions_granted",				"value": "yes"			}		],		"line_items": [			{				"id": 311,				"name": "Woo Album #2",				"product_id": 87,				"variation_id": 0,				"quantity": 1,				"tax_class": "",				"subtotal": "9.00",				"subtotal_tax": "0.00",				"total": "9.00",				"total_tax": "0.00",				"taxes": [],				"meta_data": [],				"sku": "",				"price": 9			},			{				"id": 313,				"name": "Woo Ninja",				"product_id": 34,				"variation_id": 0,				"quantity": 1,				"tax_class": "",				"subtotal": "20.00",				"subtotal_tax": "0.00",				"total": "20.00",				"total_tax": "0.00",				"taxes": [],				"meta_data": [],				"sku": "",				"price": 20			}		],		"tax_lines": [],		"shipping_lines": [			{				"id": 312,				"method_title": "Flat rate",				"method_id": "flat_rate:25",				"total": "10.00",				"total_tax": "0.00",				"taxes": [],				"meta_data": [					{						"id": 2057,						"key": "Items",						"value": "Woo Album #2 &times; 1"					}				]			}		],		"fee_lines": [],		"coupon_lines": [],		"refunds": [			{				"id": 726,				"refund": "",				"total": "-10.00"			},			{				"id": 724,				"refund": "",				"total": "-9.00"			}		],		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/orders/723"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/orders"				}			],			"email_templates": [				{					"embeddable": true,					"href": "http://example.com/wp-json/wc/v3/orders/723/actions/email_templates"				}			],			"customer": [				{					"href": "https://example.com/wp-json/wc/v3/customers/26"				}			]		}	}]
```


#### Available parameters[​](/docs/apis/rest-api/v3/orders#available-parameters-1)


| Parameter | Type | Description |
| --- | --- | --- |
| context | string | Scope under which the request is made; determines fields present in response. Options: view and edit. Default is view. |
| page | integer | Current page of the collection. Default is 1. |
| per_page | integer | Maximum number of items to be returned in result set. Default is 10. |
| search | string | Limit results to those matching a string. |
| after | string | Limit response to resources published after a given ISO8601 compliant date. |
| before | string | Limit response to resources published before a given ISO8601 compliant date. |
| modified_after | string | Limit response to resources modified after a given ISO8601 compliant date. |
| modified_before | string | Limit response to resources modified after a given ISO8601 compliant date. |
| dates_are_gmt | boolean | Whether to interpret dates as GMT when limiting response by published or modified date. |
| exclude | array | Ensure result set excludes specific IDs. |
| include | array | Limit result set to specific ids. |
| offset | integer | Offset the result set by a specific number of items. |
| order | string | Order sort attribute ascending or descending. Options: asc and desc. Default is desc. |
| orderby | string | Sort collection by object attribute. Options: date, modified, id, include, title and slug. Default is date. |
| parent | array | Limit result set to those of particular parent IDs. |
| parent_exclude | array | Limit result set to all items except those of a particular parent ID. |
| status | array | Limit result set to orders assigned a specific status. Options: any, pending, processing, on-hold, completed, cancelled, refunded, failed and trash. Default is any. |
| customer | integer | Limit result set to orders assigned a specific customer. |
| product | integer | Limit result set to orders assigned a specific product. |
| dp | integer | Number of decimal points to use in each resource. Default is 2. |
| created_via | string | Limit result set to orders created via specific sources (e.g. checkout, store-api). Multiple options can be provided as a comma-separated list. |


## Update an Order[​](/docs/apis/rest-api/v3/orders#update-an-order)


This API lets you make changes to an order.


### HTTP Request[​](/docs/apis/rest-api/v3/orders#http-request)


```
PUT /wp-json/wc/v3/orders/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X PUT https://example.com/wp-json/wc/v3/orders/727 \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "status": "completed"}'
```

```
const data = {	status: 'completed',};WooCommerce.put( 'orders/727', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'status' => 'completed'];print_r($woocommerce->put('orders/727', $data));?>
```

```
data = {    "status": "completed"}print(wcapi.put("orders/727", data).json())
```

```
data = {  status: "completed"}woocommerce.put("orders/727", data).parsed_response
```

```
{	"id": 727,	"parent_id": 0,	"number": "727",	"order_key": "wc_order_58d2d042d1d",	"created_via": "rest-api",	"version": "3.0.0",	"status": "completed",	"currency": "USD",	"date_created": "2017-03-22T16:28:02",	"date_created_gmt": "2017-03-22T19:28:02",	"date_modified": "2017-03-22T16:30:35",	"date_modified_gmt": "2017-03-22T19:30:35",	"discount_total": "0.00",	"discount_tax": "0.00",	"shipping_total": "10.00",	"shipping_tax": "0.00",	"cart_tax": "1.35",	"total": "29.35",	"total_tax": "1.35",	"prices_include_tax": false,	"customer_id": 0,	"customer_ip_address": "",	"customer_user_agent": "",	"customer_note": "",	"billing": {		"first_name": "John",		"last_name": "Doe",		"company": "",		"address_1": "969 Market",		"address_2": "",		"city": "San Francisco",		"state": "CA",		"postcode": "94103",		"country": "US",		"email": "john.doe@example.com",		"phone": "(555) 555-5555"	},	"shipping": {		"first_name": "John",		"last_name": "Doe",		"company": "",		"address_1": "969 Market",		"address_2": "",		"city": "San Francisco",		"state": "CA",		"postcode": "94103",		"country": "US"	},	"payment_method": "bacs",	"payment_method_title": "Direct Bank Transfer",	"transaction_id": "",	"date_paid": "2017-03-22T16:28:08",	"date_paid_gmt": "2017-03-22T19:28:08",	"date_completed": "2017-03-22T16:30:35",	"date_completed_gmt": "2017-03-22T19:30:35",	"cart_hash": "",	"meta_data": [		{			"id": 13106,			"key": "_download_permissions_granted",			"value": "yes"		},		{			"id": 13109,			"key": "_order_stock_reduced",			"value": "yes"		}	],	"line_items": [		{			"id": 315,			"name": "Woo Single #1",			"product_id": 93,			"variation_id": 0,			"quantity": 2,			"tax_class": "",			"subtotal": "6.00",			"subtotal_tax": "0.45",			"total": "6.00",			"total_tax": "0.45",			"taxes": [				{					"id": 75,					"total": "0.45",					"subtotal": "0.45"				}			],			"meta_data": [],			"sku": "",			"price": 3		},		{			"id": 316,			"name": "Ship Your Idea &ndash; Color: Black, Size: M Test",			"product_id": 22,			"variation_id": 23,			"quantity": 1,			"tax_class": "",			"subtotal": "12.00",			"subtotal_tax": "0.90",			"total": "12.00",			"total_tax": "0.90",			"taxes": [				{					"id": 75,					"total": "0.9",					"subtotal": "0.9"				}			],			"meta_data": [				{					"id": 2095,					"key": "pa_color",					"value": "black"				},				{					"id": 2096,					"key": "size",					"value": "M Test"				}			],			"sku": "Bar3",			"price": 12		}	],	"tax_lines": [		{			"id": 318,			"rate_code": "US-CA-STATE TAX",			"rate_id": 75,			"label": "State Tax",			"compound": false,			"tax_total": "1.35",			"shipping_tax_total": "0.00",			"meta_data": []		}	],	"shipping_lines": [		{			"id": 317,			"method_title": "Flat Rate",			"method_id": "flat_rate",			"total": "10.00",			"total_tax": "0.00",			"taxes": [],			"meta_data": []		}	],	"fee_lines": [],	"coupon_lines": [],	"refunds": [],	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/orders/727"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/orders"			}		]	}}
```


## Delete an order[​](/docs/apis/rest-api/v3/orders#delete-an-order)


This API helps you delete an order.


```
DELETE /wp-json/wc/v3/orders/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X DELETE https://example.com/wp-json/wc/v3/orders/727?force=true \	-u consumer_key:consumer_secret
```

```
WooCommerce.delete( 'orders/727', {	force: true,} )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->delete('orders/727', ['force' => true])); ?>
```

```
print(wcapi.delete("orders/727", params={"force": True}).json())
```

```
woocommerce.delete("orders/727", force: true).parsed_response
```

```
{	"id": 727,	"parent_id": 0,	"number": "727",	"order_key": "wc_order_58d2d042d1d",	"created_via": "rest-api",	"version": "3.0.0",	"status": "completed",	"currency": "USD",	"date_created": "2017-03-22T16:28:02",	"date_created_gmt": "2017-03-22T19:28:02",	"date_modified": "2017-03-22T16:30:35",	"date_modified_gmt": "2017-03-22T19:30:35",	"discount_total": "0.00",	"discount_tax": "0.00",	"shipping_total": "10.00",	"shipping_tax": "0.00",	"cart_tax": "1.35",	"total": "29.35",	"total_tax": "1.35",	"prices_include_tax": false,	"customer_id": 0,	"customer_ip_address": "",	"customer_user_agent": "",	"customer_note": "",	"billing": {		"first_name": "John",		"last_name": "Doe",		"company": "",		"address_1": "969 Market",		"address_2": "",		"city": "San Francisco",		"state": "CA",		"postcode": "94103",		"country": "US",		"email": "john.doe@example.com",		"phone": "(555) 555-5555"	},	"shipping": {		"first_name": "John",		"last_name": "Doe",		"company": "",		"address_1": "969 Market",		"address_2": "",		"city": "San Francisco",		"state": "CA",		"postcode": "94103",		"country": "US"	},	"payment_method": "bacs",	"payment_method_title": "Direct Bank Transfer",	"transaction_id": "",	"date_paid": "2017-03-22T16:28:08",	"date_paid_gmt": "2017-03-22T19:28:08",	"date_completed": "2017-03-22T16:30:35",	"date_completed_gmt": "2017-03-22T19:30:35",	"cart_hash": "",	"meta_data": [		{			"id": 13106,			"key": "_download_permissions_granted",			"value": "yes"		},		{			"id": 13109,			"key": "_order_stock_reduced",			"value": "yes"		}	],	"line_items": [		{			"id": 315,			"name": "Woo Single #1",			"product_id": 93,			"variation_id": 0,			"quantity": 2,			"tax_class": "",			"subtotal": "6.00",			"subtotal_tax": "0.45",			"total": "6.00",			"total_tax": "0.45",			"taxes": [				{					"id": 75,					"total": "0.45",					"subtotal": "0.45"				}			],			"meta_data": [],			"sku": "",			"price": 3		},		{			"id": 316,			"name": "Ship Your Idea &ndash; Color: Black, Size: M Test",			"product_id": 22,			"variation_id": 23,			"quantity": 1,			"tax_class": "",			"subtotal": "12.00",			"subtotal_tax": "0.90",			"total": "12.00",			"total_tax": "0.90",			"taxes": [				{					"id": 75,					"total": "0.9",					"subtotal": "0.9"				}			],			"meta_data": [				{					"id": 2095,					"key": "pa_color",					"value": "black"				},				{					"id": 2096,					"key": "size",					"value": "M Test"				}			],			"sku": "Bar3",			"price": 12		}	],	"tax_lines": [		{			"id": 318,			"rate_code": "US-CA-STATE TAX",			"rate_id": 75,			"label": "State Tax",			"compound": false,			"tax_total": "1.35",			"shipping_tax_total": "0.00",			"meta_data": []		}	],	"shipping_lines": [		{			"id": 317,			"method_title": "Flat Rate",			"method_id": "flat_rate",			"total": "10.00",			"total_tax": "0.00",			"taxes": [],			"meta_data": []		}	],	"fee_lines": [],	"coupon_lines": [],	"refunds": [],	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/orders/727"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/orders"			}		]	}}
```


#### Available parameters[​](/docs/apis/rest-api/v3/orders#available-parameters-2)


| Parameter | Type | Description |
| --- | --- | --- |
| force | string | Use true whether to permanently delete the order, Default is false. |


## Batch update orders[​](/docs/apis/rest-api/v3/orders#batch-update-orders)


This API helps you to batch create, update and delete multiple orders.

note
Note: By default it's limited to up to 100 objects to be created, updated or
deleted.


```
POST /wp-json/wc/v3/orders/batch
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/orders/batch \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "create": [    {      "payment_method": "bacs",      "payment_method_title": "Direct Bank Transfer",      "billing": {        "first_name": "John",        "last_name": "Doe",        "address_1": "969 Market",        "address_2": "",        "city": "San Francisco",        "state": "CA",        "postcode": "94103",        "country": "US",        "email": "john.doe@example.com",        "phone": "(555) 555-5555"      },      "shipping": {        "first_name": "John",        "last_name": "Doe",        "address_1": "969 Market",        "address_2": "",        "city": "San Francisco",        "state": "CA",        "postcode": "94103",        "country": "US"      },      "line_items": [        {          "product_id": 79,          "quantity": 1        },        {          "product_id": 93,          "quantity": 1        },        {          "product_id": 22,          "variation_id": 23,          "quantity": 1        }      ],      "shipping_lines": [        {          "method_id": "flat_rate",          "method_title": "Flat Rate",          "total": "30.00"        }      ]    },    {      "payment_method": "bacs",      "payment_method_title": "Direct Bank Transfer",      "set_paid": true,      "billing": {        "first_name": "John",        "last_name": "Doe",        "address_1": "969 Market",        "address_2": "",        "city": "San Francisco",        "state": "CA",        "postcode": "94103",        "country": "US",        "email": "john.doe@example.com",        "phone": "(555) 555-5555"      },      "shipping": {        "first_name": "John",        "last_name": "Doe",        "address_1": "969 Market",        "address_2": "",        "city": "San Francisco",        "state": "CA",        "postcode": "94103",        "country": "US"      },      "line_items": [        {          "product_id": 22,          "variation_id": 23,          "quantity": 1        },        {          "product_id": 22,          "variation_id": 24,          "quantity": 1        }      ],      "shipping_lines": [        {          "method_id": "flat_rate",          "method_title": "Flat Rate",          "total": "20.00"        }      ]    }  ],  "update": [    {      "id": 727,      "shipping_methods": "Local Delivery"    }  ],  "delete": [    723  ]}'
```

```
const data = {	create: [		{			payment_method: 'bacs',			payment_method_title: 'Direct Bank Transfer',			billing: {				first_name: 'John',				last_name: 'Doe',				address_1: '969 Market',				address_2: '',				city: 'San Francisco',				state: 'CA',				postcode: '94103',				country: 'US',				email: 'john.doe@example.com',				phone: '(555) 555-5555',			},			shipping: {				first_name: 'John',				last_name: 'Doe',				address_1: '969 Market',				address_2: '',				city: 'San Francisco',				state: 'CA',				postcode: '94103',				country: 'US',			},			line_items: [				{					product_id: 79,					quantity: 1,				},				{					product_id: 93,					quantity: 1,				},				{					product_id: 22,					variation_id: 23,					quantity: 1,				},			],			shipping_lines: [				{					method_id: 'flat_rate',					method_title: 'Flat Rate',					total: '30.00',				},			],		},		{			payment_method: 'bacs',			payment_method_title: 'Direct Bank Transfer',			set_paid: true,			billing: {				first_name: 'John',				last_name: 'Doe',				address_1: '969 Market',				address_2: '',				city: 'San Francisco',				state: 'CA',				postcode: '94103',				country: 'US',				email: 'john.doe@example.com',				phone: '(555) 555-5555',			},			shipping: {				first_name: 'John',				last_name: 'Doe',				address_1: '969 Market',				address_2: '',				city: 'San Francisco',				state: 'CA',				postcode: '94103',				country: 'US',			},			line_items: [				{					product_id: 22,					variation_id: 23,					quantity: 1,				},				{					product_id: 22,					variation_id: 24,					quantity: 1,				},			],			shipping_lines: [				{					method_id: 'flat_rate',					method_title: 'Flat Rate',					total: '20.00',				},			],		},	],	update: [		{			id: 727,			shipping_methods: 'Local Delivery',		},	],	delete: [ 723 ],};WooCommerce.post( 'orders/batch', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'create' => [        [            'payment_method' => 'bacs',            'payment_method_title' => 'Direct Bank Transfer',            'billing' => [                'first_name' => 'John',                'last_name' => 'Doe',                'address_1' => '969 Market',                'address_2' => '',                'city' => 'San Francisco',                'state' => 'CA',                'postcode' => '94103',                'country' => 'US',                'email' => 'john.doe@example.com',                'phone' => '(555) 555-5555'            ],            'shipping' => [                'first_name' => 'John',                'last_name' => 'Doe',                'address_1' => '969 Market',                'address_2' => '',                'city' => 'San Francisco',                'state' => 'CA',                'postcode' => '94103',                'country' => 'US'            ],            'line_items' => [                [                    'product_id' => 79,                    'quantity' => 1                ],                [                    'product_id' => 93,                    'quantity' => 1                ],                [                    'product_id' => 22,                    'variation_id' => 23,                    'quantity' => 1                ]            ],            'shipping_lines' => [                [                    'method_id' => 'flat_rate',                    'method_title' => 'Flat Rate',                    'total' => '30.00'                ]            ]        ],        [            'payment_method' => 'bacs',            'payment_method_title' => 'Direct Bank Transfer',            'set_paid' => true,            'billing' => [                'first_name' => 'John',                'last_name' => 'Doe',                'address_1' => '969 Market',                'address_2' => '',                'city' => 'San Francisco',                'state' => 'CA',                'postcode' => '94103',                'country' => 'US',                'email' => 'john.doe@example.com',                'phone' => '(555) 555-5555'            ],            'shipping' => [                'first_name' => 'John',                'last_name' => 'Doe',                'address_1' => '969 Market',                'address_2' => '',                'city' => 'San Francisco',                'state' => 'CA',                'postcode' => '94103',                'country' => 'US'            ],            'line_items' => [                [                    'product_id' => 22,                    'variation_id' => 23,                    'quantity' => 1                ],                [                    'product_id' => 22,                    'variation_id' => 24,                    'quantity' => 1                ]            ],            'shipping_lines' => [                [                    'method_id' => 'flat_rate',                    'method_title' => 'Flat Rate',                    'total' => '20.00'                ]            ]        ]    ],    'update' => [        [            'id' => 727,            'shipping_methods' => 'Local Delivery'        ]    ],    'delete' => [        723    ]];print_r($woocommerce->post('orders/batch', $data));?>
```

```
data = {    "create": [        {            "payment_method": "bacs",            "payment_method_title": "Direct Bank Transfer",            "billing": {                "first_name": "John",                "last_name": "Doe",                "address_1": "969 Market",                "address_2": "",                "city": "San Francisco",                "state": "CA",                "postcode": "94103",                "country": "US",                "email": "john.doe@example.com",                "phone": "(555) 555-5555"            },            "shipping": {                "first_name": "John",                "last_name": "Doe",                "address_1": "969 Market",                "address_2": "",                "city": "San Francisco",                "state": "CA",                "postcode": "94103",                "country": "US"            },            "line_items": [                {                    "product_id": 79,                    "quantity": 1                },                {                    "product_id": 93,                    "quantity": 1                },                {                    "product_id": 22,                    "variation_id": 23,                    "quantity": 1                }            ],            "shipping_lines": [                {                    "method_id": "flat_rate",                    "method_title": "Flat Rate",                    "total": "30.00"                }            ]        },        {            "payment_method": "bacs",            "payment_method_title": "Direct Bank Transfer",            "set_paid": True,            "billing": {                "first_name": "John",                "last_name": "Doe",                "address_1": "969 Market",                "address_2": "",                "city": "San Francisco",                "state": "CA",                "postcode": "94103",                "country": "US",                "email": "john.doe@example.com",                "phone": "(555) 555-5555"            },            "shipping": {                "first_name": "John",                "last_name": "Doe",                "address_1": "969 Market",                "address_2": "",                "city": "San Francisco",                "state": "CA",                "postcode": "94103",                "country": "US"            },            "line_items": [                {                    "product_id": 22,                    "variation_id": 23,                    "quantity": 1                },                {                    "product_id": 22,                    "variation_id": 24,                    "quantity": 1                }            ],            "shipping_lines": [                {                    "method_id": "flat_rate",                    "method_title": "Flat Rate",                    "total": "20.00"                }            ]        }    ],    "update": [        {            "id": 727,            "shipping_methods": "Local Delivery"        }    ],    "delete": [        723    ]}print(wcapi.post("orders/batch", data).json())
```

```
data = {  create: [    {      payment_method: "bacs",      payment_method_title: "Direct Bank Transfer",      billing: {        first_name: "John",        last_name: "Doe",        address_1: "969 Market",        address_2: "",        city: "San Francisco",        state: "CA",        postcode: "94103",        country: "US",        email: "john.doe@example.com",        phone: "(555) 555-5555"      },      shipping: {        first_name: "John",        last_name: "Doe",        address_1: "969 Market",        address_2: "",        city: "San Francisco",        state: "CA",        postcode: "94103",        country: "US"      },      line_items: [        {          product_id: 79,          quantity: 1        },        {          product_id: 93,          quantity: 1        },        {          product_id: 22,          variation_id: 23,          quantity: 1        }      ],      shipping_lines: [        {          method_id: "flat_rate",          method_title: "Flat Rate",          total: "30.00"        }      ]    },    {      payment_method: "bacs",      payment_method_title: "Direct Bank Transfer",      set_paid: true,      billing: {        first_name: "John",        last_name: "Doe",        address_1: "969 Market",        address_2: "",        city: "San Francisco",        state: "CA",        postcode: "94103",        country: "US",        email: "john.doe@example.com",        phone: "(555) 555-5555"      },      shipping: {        first_name: "John",        last_name: "Doe",        address_1: "969 Market",        address_2: "",        city: "San Francisco",        state: "CA",        postcode: "94103",        country: "US"      },      line_items: [        {          product_id: 22,          variation_id: 23,          quantity: 1        },        {          product_id: 22,          variation_id: 24,          quantity: 1        }      ],      shipping_lines: [        {          method_id: "flat_rate",          method_title: "Flat Rate",          total: "20.00"        }      ]    }  ],  update: [    {      id: 727,      shipping_methods: "Local Delivery"    }  ],  delete: [    723  ]}woocommerce.post("orders/batch", data).parsed_response
```

```
{	"create": [		{			"id": 728,			"parent_id": 0,			"number": "728",			"order_key": "wc_order_58d2d18e580",			"created_via": "rest-api",			"version": "3.0.0",			"status": "pending",			"currency": "USD",			"date_created": "2017-03-22T16:33:34",			"date_created_gmt": "2017-03-22T19:33:34",			"date_modified": "2017-03-22T16:33:34",			"date_modified_gmt": "2017-03-22T19:33:34",			"discount_total": "0.00",			"discount_tax": "0.00",			"shipping_total": "30.00",			"shipping_tax": "0.00",			"cart_tax": "2.25",			"total": "62.25",			"total_tax": "2.25",			"prices_include_tax": false,			"customer_id": 0,			"customer_ip_address": "",			"customer_user_agent": "",			"customer_note": "",			"billing": {				"first_name": "John",				"last_name": "Doe",				"company": "",				"address_1": "969 Market",				"address_2": "",				"city": "San Francisco",				"state": "CA",				"postcode": "94103",				"country": "US",				"email": "john.doe@example.com",				"phone": "(555) 555-5555"			},			"shipping": {				"first_name": "John",				"last_name": "Doe",				"company": "",				"address_1": "969 Market",				"address_2": "",				"city": "San Francisco",				"state": "CA",				"postcode": "94103",				"country": "US"			},			"payment_method": "bacs",			"payment_method_title": "Direct Bank Transfer",			"transaction_id": "",			"date_paid": null,			"date_paid_gmt": null,			"date_completed": null,			"date_completed_gmt": null,			"cart_hash": "",			"meta_data": [],			"line_items": [				{					"id": 319,					"name": "Woo Logo",					"product_id": 79,					"variation_id": 0,					"quantity": 1,					"tax_class": "",					"subtotal": "15.00",					"subtotal_tax": "1.13",					"total": "15.00",					"total_tax": "1.13",					"taxes": [						{							"id": 75,							"total": "1.125",							"subtotal": "1.125"						}					],					"meta_data": [],					"sku": "",					"price": 15				},				{					"id": 320,					"name": "Woo Single #1",					"product_id": 93,					"variation_id": 0,					"quantity": 1,					"tax_class": "",					"subtotal": "3.00",					"subtotal_tax": "0.23",					"total": "3.00",					"total_tax": "0.23",					"taxes": [						{							"id": 75,							"total": "0.225",							"subtotal": "0.225"						}					],					"meta_data": [],					"sku": "",					"price": 3				},				{					"id": 321,					"name": "Ship Your Idea &ndash; Color: Black, Size: M Test",					"product_id": 22,					"variation_id": 23,					"quantity": 1,					"tax_class": "",					"subtotal": "12.00",					"subtotal_tax": "0.90",					"total": "12.00",					"total_tax": "0.90",					"taxes": [						{							"id": 75,							"total": "0.9",							"subtotal": "0.9"						}					],					"meta_data": [						{							"id": 2133,							"key": "pa_color",							"value": "black"						},						{							"id": 2134,							"key": "size",							"value": "M Test"						}					],					"sku": "Bar3",					"price": 12				}			],			"tax_lines": [				{					"id": 323,					"rate_code": "US-CA-STATE TAX",					"rate_id": 75,					"label": "State Tax",					"compound": false,					"tax_total": "2.25",					"shipping_tax_total": "0.00",					"meta_data": []				}			],			"shipping_lines": [				{					"id": 322,					"method_title": "Flat Rate",					"method_id": "flat_rate",					"total": "30.00",					"total_tax": "0.00",					"taxes": [],					"meta_data": []				}			],			"fee_lines": [],			"coupon_lines": [],			"refunds": [],			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/orders/728"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/orders"					}				]			}		},		{			"id": 729,			"parent_id": 0,			"number": "729",			"order_key": "wc_order_58d2d196171",			"created_via": "rest-api",			"version": "3.0.0",			"status": "processing",			"currency": "USD",			"date_created": "2017-03-22T16:33:42",			"date_created_gmt": "2017-03-22T19:33:42",			"date_modified": "2017-03-22T16:33:47",			"date_modified_gmt": "2017-03-22T19:33:47",			"discount_total": "0.00",			"discount_tax": "0.00",			"shipping_total": "20.00",			"shipping_tax": "0.00",			"cart_tax": "2.40",			"total": "54.40",			"total_tax": "2.40",			"prices_include_tax": false,			"customer_id": 0,			"customer_ip_address": "",			"customer_user_agent": "",			"customer_note": "",			"billing": {				"first_name": "John",				"last_name": "Doe",				"company": "",				"address_1": "969 Market",				"address_2": "",				"city": "San Francisco",				"state": "CA",				"postcode": "94103",				"country": "US",				"email": "john.doe@example.com",				"phone": "(555) 555-5555"			},			"shipping": {				"first_name": "John",				"last_name": "Doe",				"company": "",				"address_1": "969 Market",				"address_2": "",				"city": "San Francisco",				"state": "CA",				"postcode": "94103",				"country": "US"			},			"payment_method": "bacs",			"payment_method_title": "Direct Bank Transfer",			"transaction_id": "",			"date_paid": "2017-03-22T16:33:47",			"date_paid_gmt": "2017-03-22T19:33:47",			"date_completed": null,			"date_completed_gmt": null,			"cart_hash": "",			"meta_data": [				{					"id": 13198,					"key": "_download_permissions_granted",					"value": "yes"				}			],			"line_items": [				{					"id": 324,					"name": "Ship Your Idea &ndash; Color: Black, Size: M Test",					"product_id": 22,					"variation_id": 23,					"quantity": 1,					"tax_class": "",					"subtotal": "12.00",					"subtotal_tax": "0.90",					"total": "12.00",					"total_tax": "0.90",					"taxes": [						{							"id": 75,							"total": "0.9",							"subtotal": "0.9"						}					],					"meta_data": [						{							"id": 2153,							"key": "pa_color",							"value": "black"						},						{							"id": 2154,							"key": "size",							"value": "M Test"						}					],					"sku": "Bar3",					"price": 12				},				{					"id": 325,					"name": "Ship Your Idea &ndash; Color: Green, Size: S Test",					"product_id": 22,					"variation_id": 24,					"quantity": 1,					"tax_class": "",					"subtotal": "20.00",					"subtotal_tax": "1.50",					"total": "20.00",					"total_tax": "1.50",					"taxes": [						{							"id": 75,							"total": "1.5",							"subtotal": "1.5"						}					],					"meta_data": [						{							"id": 2164,							"key": "pa_color",							"value": "green"						},						{							"id": 2165,							"key": "size",							"value": "S Test"						}					],					"sku": "",					"price": 20				}			],			"tax_lines": [				{					"id": 327,					"rate_code": "US-CA-STATE TAX",					"rate_id": 75,					"label": "State Tax",					"compound": false,					"tax_total": "2.40",					"shipping_tax_total": "0.00",					"meta_data": []				}			],			"shipping_lines": [				{					"id": 326,					"method_title": "Flat Rate",					"method_id": "flat_rate",					"total": "20.00",					"total_tax": "0.00",					"taxes": [],					"meta_data": []				}			],			"fee_lines": [],			"coupon_lines": [],			"refunds": [],			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/orders/729"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/orders"					}				]			}		}	],	"update": [		{			"id": 727,			"parent_id": 0,			"number": "727",			"order_key": "wc_order_58d2d042d1d",			"created_via": "rest-api",			"version": "3.0.0",			"status": "completed",			"currency": "USD",			"date_created": "2017-03-22T16:28:02",			"date_created_gmt": "2017-03-22T19:28:02",			"date_modified": "2017-03-22T16:30:35",			"date_modified_gmt": "2017-03-22T19:30:35",			"discount_total": "0.00",			"discount_tax": "0.00",			"shipping_total": "10.00",			"shipping_tax": "0.00",			"cart_tax": "1.35",			"total": "29.35",			"total_tax": "1.35",			"prices_include_tax": false,			"customer_id": 0,			"customer_ip_address": "",			"customer_user_agent": "",			"customer_note": "",			"billing": {				"first_name": "John",				"last_name": "Doe",				"company": "",				"address_1": "969 Market",				"address_2": "",				"city": "San Francisco",				"state": "CA",				"postcode": "94103",				"country": "US",				"email": "john.doe@example.com",				"phone": "(555) 555-5555"			},			"shipping": {				"first_name": "John",				"last_name": "Doe",				"company": "",				"address_1": "969 Market",				"address_2": "",				"city": "San Francisco",				"state": "CA",				"postcode": "94103",				"country": "US"			},			"payment_method": "bacs",			"payment_method_title": "Direct Bank Transfer",			"transaction_id": "",			"date_paid": "2017-03-22T16:28:08",			"date_paid_gmt": "2017-03-22T19:28:08",			"date_completed": "2017-03-22T16:30:35",			"date_completed_gmt": "2017-03-22T19:30:35",			"cart_hash": "",			"meta_data": [				{					"id": 13106,					"key": "_download_permissions_granted",					"value": "yes"				},				{					"id": 13109,					"key": "_order_stock_reduced",					"value": "yes"				}			],			"line_items": [				{					"id": 315,					"name": "Woo Single #1",					"product_id": 93,					"variation_id": 0,					"quantity": 2,					"tax_class": "",					"subtotal": "6.00",					"subtotal_tax": "0.45",					"total": "6.00",					"total_tax": "0.45",					"taxes": [						{							"id": 75,							"total": "0.45",							"subtotal": "0.45"						}					],					"meta_data": [],					"sku": "",					"price": 3				},				{					"id": 316,					"name": "Ship Your Idea &ndash; Color: Black, Size: M Test",					"product_id": 22,					"variation_id": 23,					"quantity": 1,					"tax_class": "",					"subtotal": "12.00",					"subtotal_tax": "0.90",					"total": "12.00",					"total_tax": "0.90",					"taxes": [						{							"id": 75,							"total": "0.9",							"subtotal": "0.9"						}					],					"meta_data": [						{							"id": 2095,							"key": "pa_color",							"value": "black"						},						{							"id": 2096,							"key": "size",							"value": "M Test"						}					],					"sku": "Bar3",					"price": 12				}			],			"tax_lines": [				{					"id": 318,					"rate_code": "US-CA-STATE TAX",					"rate_id": 75,					"label": "State Tax",					"compound": false,					"tax_total": "1.35",					"shipping_tax_total": "0.00",					"meta_data": []				}			],			"shipping_lines": [				{					"id": 317,					"method_title": "Flat Rate",					"method_id": "flat_rate",					"total": "10.00",					"total_tax": "0.00",					"taxes": [],					"meta_data": []				}			],			"fee_lines": [],			"coupon_lines": [],			"refunds": [],			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/orders/727"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/orders"					}				]			}		}	],	"delete": [		{			"id": 723,			"parent_id": 0,			"number": "723",			"order_key": "wc_order_58d17c18352",			"created_via": "checkout",			"version": "3.0.0",			"status": "completed",			"currency": "USD",			"date_created": "2017-03-21T16:16:00",			"date_created_gmt": "2017-03-21T19:16:00",			"date_modified": "2017-03-21T16:54:51",			"date_modified_gmt": "2017-03-21T19:54:51",			"discount_total": "0.00",			"discount_tax": "0.00",			"shipping_total": "10.00",			"shipping_tax": "0.00",			"cart_tax": "0.00",			"total": "39.00",			"total_tax": "0.00",			"prices_include_tax": false,			"customer_id": 26,			"customer_ip_address": "127.0.0.1",			"customer_user_agent": "mozilla/5.0 (x11; ubuntu; linux x86_64; rv:52.0) gecko/20100101 firefox/52.0",			"customer_note": "",			"billing": {				"first_name": "João",				"last_name": "Silva",				"company": "",				"address_1": "Av. Brasil, 432",				"address_2": "",				"city": "Rio de Janeiro",				"state": "RJ",				"postcode": "12345-000",				"country": "BR",				"email": "joao.silva@example.com",				"phone": "(11) 1111-1111"			},			"shipping": {				"first_name": "João",				"last_name": "Silva",				"company": "",				"address_1": "Av. Brasil, 432",				"address_2": "",				"city": "Rio de Janeiro",				"state": "RJ",				"postcode": "12345-000",				"country": "BR"			},			"payment_method": "bacs",			"payment_method_title": "Direct bank transfer",			"transaction_id": "",			"date_paid": null,			"date_paid_gmt": null,			"date_completed": "2017-03-21T16:54:51",			"date_completed_gmt": "2017-03-21T19:54:51",			"cart_hash": "5040ce7273261e31d8bcf79f9be3d279",			"meta_data": [				{					"id": 13023,					"key": "_download_permissions_granted",					"value": "yes"				}			],			"line_items": [				{					"id": 311,					"name": "Woo Album #2",					"product_id": 87,					"variation_id": 0,					"quantity": 1,					"tax_class": "",					"subtotal": "9.00",					"subtotal_tax": "0.00",					"total": "9.00",					"total_tax": "0.00",					"taxes": [],					"meta_data": [],					"sku": "",					"price": 9				},				{					"id": 313,					"name": "Woo Ninja",					"product_id": 34,					"variation_id": 0,					"quantity": 1,					"tax_class": "",					"subtotal": "20.00",					"subtotal_tax": "0.00",					"total": "20.00",					"total_tax": "0.00",					"taxes": [],					"meta_data": [],					"sku": "",					"price": 20				}			],			"tax_lines": [],			"shipping_lines": [				{					"id": 312,					"method_title": "Flat rate",					"method_id": "flat_rate:25",					"total": "10.00",					"total_tax": "0.00",					"taxes": [],					"meta_data": [						{							"id": 2057,							"key": "Items",							"value": "Woo Album #2 &times; 1"						}					]				}			],			"fee_lines": [],			"coupon_lines": [],			"refunds": [				{					"id": 726,					"refund": "",					"total": "-10.00"				},				{					"id": 724,					"refund": "",					"total": "-9.00"				}			],			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/orders/723"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/orders"					}				],				"customer": [					{						"href": "https://example.com/wp-json/wc/v3/customers/26"					}				]			}		}	]}
```

---

<a name="order-actions"></a>

The order actions API allows you to perform specific actions with existing orders like you can from the Edit Order screen in the web app.


*Note: currently only some actions are available, other actions will be introduced at a later time.*


## Send order details to customer[​](/docs/apis/rest-api/v3/order-actions#send-order-details-to-customer)


This endpoint allows you to trigger an email to the customer with the details of their order. In case the order doesn't yet have a billing email set, you can specify an email recipient. However, if the order does have an existing billing email, this will return an error, unless you also specify that the existing email should be overwritten by using the `force_email_update` parameter.


```
POST /wp-json/wc/v3/orders/<id>/actions/send_order_details
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/orders/723/actions/send_order_details \	-u consumer_key:consumer_secret \	-d '{	  "email": "somebody@example.com",	  "force_email_update": true	}'
```

```
const data = {	email: 'somebody@example.com',	force_email_update: true,};WooCommerce.post( 'orders/723/actions/send_order_details', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'email' => 'somebody@example.com',    'force_email_update' => true,];print_r($woocommerce->post('orders/723/actions/send_order_details', $data));?>
```

```
data = {    "email": "somebody@example.com",    "force_email_update": true}print(wcapi.post("orders/723/actions/send_order_details", data).json())
```

```
data = {    "email": "somebody@example.com",    "force_email_update": true}woocommerce.post("orders/723/actions/send_order_details", data).parsed_response
```

```
{	"message": "Billing email updated to somebody@example.com. Order details sent to somebody@example.com, via REST API."}
```


```
{	"code": "woocommerce_rest_missing_email",	"message": "Order does not have an email address.",	"data": {		"status": 400	}}
```


## Send order notification email to customer[​](/docs/apis/rest-api/v3/order-actions#send-order-notification-email-to-customer)


This endpoint allows you to trigger an email to a customer about the status of their order. This is similar to the [`send_order_details`](/docs/apis/rest-api/v3/order-actions#send-order-details-to-customer) endpoint, but allows you to specify which email template to send, based on which email templates are relevant to the order. For example, an order that is on hold has the `customer_on_hold_order` template available. A completed order that also has a partial refund has both the `customer_completed_order` and `customer_refunded_order` templates available. Specifying the `customer_invoice` template is the same as using the `send_order_details` endpoint.


```
POST /wp-json/wc/v3/orders/<id>/actions/send_email
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/orders/723/actions/send_email \	-u consumer_key:consumer_secret \	-d '{	  "template_id": "customer_completed_order",	  "email": "somebody@example.com",	  "force_email_update": true	}'
```

```
const data = {	template_id: 'customer_completed_order',	email: 'somebody@example.com',	force_email_update: true,};WooCommerce.post( 'orders/723/actions/send_email', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'template_id' => 'customer_completed_order',    'email' => 'somebody@example.com',    'force_email_update' => true,];print_r($woocommerce->post('orders/723/actions/send_email', $data));?>
```

```
data = {    "template_id": "customer_completed_order",    "email": "somebody@example.com",    "force_email_update": true}print(wcapi.post("orders/723/actions/send_email", data).json())
```

```
data = {    "template_id": "customer_completed_order",    "email": "somebody@example.com",    "force_email_update": true}woocommerce.post("orders/723/actions/send_email", data).parsed_response
```

```
{	"message": "Billing email updated to somebody@example.com. Email template &quot;Completed order&quot; sent to somebody@example.com, via REST API."}
```


```
{	"code": "woocommerce_rest_invalid_email_template",	"message": "customer_completed_order is not a valid template for this order.",	"data": {		"status": 400	}}
```


## Get available email templates for an order[​](/docs/apis/rest-api/v3/order-actions#get-available-email-templates-for-an-order)


This endpoint allows you to retrieve a list of email templates that are available for the specified order. You can also get this data embedded in the response for the [`orders` endpoint](/docs/apis/rest-api/v3/orders/#list-all-orders).


```
GET /wp-json/wc/v3/orders/<id>/actions/email_templates
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X GET https://example.com/wp-json/wc/v3/orders/723/actions/email_templates \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'orders/723/actions/email_templates' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?phpprint_r($woocommerce->get('orders/723/actions/email_templates'));?>
```

```
print(wcapi.get("orders/723/actions/email_templates").json())
```

```
woocommerce.post("orders/723/actions/email_templates").parsed_response
```

```
[	{		"id": "customer_completed_order",		"title": "Completed order",		"description": "Order complete emails are sent to customers when their orders are marked completed and usually indicate that their orders have been shipped."	},	{		"id": "customer_invoice",		"title": "Order details",		"description": "Order detail emails can be sent to customers containing their order information and payment links."	}]
```

---

<a name="order-notes"></a>

The order notes API allows you to create, view, and delete individual order notes.

Order notes are added by administrators and programmatically to store data about an order, or order events.


## Order note properties[​](/docs/apis/rest-api/v3/order-notes#order-note-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Unique identifier for the resource. READ-ONLY |
| author | string | Order note author. READ-ONLY |
| date_created | date-time | The date the order note was created, in the site's timezone. READ-ONLY |
| date_created_gmt | date-time | The date the order note was created, as GMT. READ-ONLY |
| note | string | Order note content. MANDATORY |
| customer_note | boolean | If true, the note will be shown to customers and they will be notified. If false, the note will be for admin reference only. Default is false. |
| added_by_user | boolean | If true, this note will be attributed to the current user. If false, the note will be attributed to the system. Default is false. |


## Create an order note[​](/docs/apis/rest-api/v3/order-notes#create-an-order-note)


This API helps you to create a new note for an order.


```
POST /wp-json/wc/v3/orders/<id>/notes
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/orders/723/notes \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "note": "Order ok!!!"}'
```

```
const data = {	note: 'Order ok!!!',};WooCommerce.post( 'orders/723/notes', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'note' => 'Order ok!!!'];print_r($woocommerce->post('orders/723/notes', $data));?>
```

```
data = {    "note": "Order ok!!!"}print(wcapi.post("orders/723/notes", data).json())
```

```
data = {  note: "Order ok!!!"}woocommerce.post("orders/723/notes", data).parsed_response
```

```
{	"id": 281,	"author": "system",	"date_created": "2017-03-21T16:46:41",	"date_created_gmt": "2017-03-21T19:46:41",	"note": "Order ok!!!",	"customer_note": false,	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/orders/723/notes/281"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/orders/723/notes"			}		],		"up": [			{				"href": "https://example.com/wp-json/wc/v3/orders/723"			}		]	}}
```


## Retrieve an order note[​](/docs/apis/rest-api/v3/order-notes#retrieve-an-order-note)


This API lets you retrieve and view a specific note from an order.


```
GET /wp-json/wc/v3/orders/<id>/notes/<note_id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/orders/723/notes/281 \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'orders/723/notes/281' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('orders/723/notes/281')); ?>
```

```
print(wcapi.get("orders/723/notes/281").json())
```

```
woocommerce.get("orders/723/notes/281").parsed_response
```

```
{	"id": 281,	"author": "system",	"date_created": "2017-03-21T16:46:41",	"date_created_gmt": "2017-03-21T19:46:41",	"note": "Order ok!!!",	"customer_note": false,	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/orders/723/notes/281"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/orders/723/notes"			}		],		"up": [			{				"href": "https://example.com/wp-json/wc/v3/orders/723"			}		]	}}
```


## List all order notes[​](/docs/apis/rest-api/v3/order-notes#list-all-order-notes)


This API helps you to view all the notes from an order.


```
GET /wp-json/wc/v3/orders/<id>/notes
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/orders/723/notes \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'orders/723/notes' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('orders/723/notes')); ?>
```

```
print(wcapi.get("orders/723/notes").json())
```

```
woocommerce.get("orders/723/notes").parsed_response
```

```
[	{		"id": 281,		"author": "system",		"date_created": "2017-03-21T16:46:41",		"date_created_gmt": "2017-03-21T19:46:41",		"note": "Order ok!!!",		"customer_note": false,		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/orders/723/notes/281"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/orders/723/notes"				}			],			"up": [				{					"href": "https://example.com/wp-json/wc/v3/orders/723"				}			]		}	},	{		"id": 280,		"author": "system",		"date_created": "2017-03-21T16:16:58",		"date_created_gmt": "2017-03-21T19:16:58",		"note": "Order status changed from On hold to Completed.",		"customer_note": false,		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/orders/723/notes/280"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/orders/723/notes"				}			],			"up": [				{					"href": "https://example.com/wp-json/wc/v3/orders/723"				}			]		}	},	{		"id": 279,		"author": "system",		"date_created": "2017-03-21T16:16:46",		"date_created_gmt": "2017-03-21T19:16:46",		"note": "Awaiting BACS payment Order status changed from Pending payment to On hold.",		"customer_note": false,		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/orders/723/notes/279"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/orders/723/notes"				}			],			"up": [				{					"href": "https://example.com/wp-json/wc/v3/orders/723"				}			]		}	}]
```


#### Available parameters[​](/docs/apis/rest-api/v3/order-notes#available-parameters)


| Parameter | Type | Description |
| --- | --- | --- |
| context | string | Scope under which the request is made; determines fields present in response. Options: view and edit. Default is view. |
| type | string | Limit result to customers or internal notes. Options: any, customer and internal. Default is any. |


## Delete an order note[​](/docs/apis/rest-api/v3/order-notes#delete-an-order-note)


This API helps you delete an order note.


```
DELETE /wp-json/wc/v3/orders/<id>/notes/<note_id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X DELETE https://example.com/wp-json/wc/v3/orders/723/notes/281?force=true \	-u consumer_key:consumer_secret
```

```
WooCommerce.delete( 'orders/723/notes/281', {	force: true,} )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->delete('orders/723/notes/281', ['force' => true])); ?>
```

```
print(wcapi.delete("orders/723/notes/281", params={"force": True}).json())
```

```
woocommerce.delete("orders/723/notes/281", force: true).parsed_response
```

```
{	"id": 281,	"author": "system",	"date_created": "2017-03-21T16:46:41",	"date_created_gmt": "2017-03-21T19:46:41",	"note": "Order ok!!!",	"customer_note": false,	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/orders/723/notes/281"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/orders/723/notes"			}		],		"up": [			{				"href": "https://example.com/wp-json/wc/v3/orders/723"			}		]	}}
```


#### Available parameters[​](/docs/apis/rest-api/v3/order-notes#available-parameters-1)


| Parameter | Type | Description |
| --- | --- | --- |
| force | string | Required to be true, as resource does not support trashing. |

---

<a name="order-refunds"></a>

The order refunds API allows you to create, view, and delete individual refunds, based on an existing order.


## Order refund properties[​](/docs/apis/rest-api/v3/order-refunds#order-refund-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Unique identifier for the resource. READ-ONLY |
| date_created | date-time | The date the order refund was created, in the site's timezone. READ-ONLY |
| date_created_gmt | date-time | The date the order refund was created, as GMT. READ-ONLY |
| amount | string | Total refund amount. Optional. If this parameter is provided, it will take precedence over line item totals, even when total of line items does not matches with this amount. |
| reason | string | Reason for refund. |
| refunded_by | integer | User ID of user who created the refund. |
| refunded_payment | boolean | If the payment was refunded via the API. See api_refund. READ-ONLY |
| meta_data | array | Meta data. See Order refund - Meta data properties |
| line_items | array | Line items data. See Order refund - Line items properties |
| tax_lines | array | Tax lines data. See Order refund - Tax lines properties READ-ONLY |
| shipping_lines | array | Shipping lines data. See Order refund - Shipping lines properties |
| fee_lines | array | Fee lines data. See Order refund - Fee lines properties |
| api_refund | boolean | When true, the payment gateway API is used to generate the refund. Default is true. WRITE-ONLY |
| api_restock | boolean | When true, the selected line items are restocked Default is true. WRITE-ONLY |


### Order refund - Meta data properties[​](/docs/apis/rest-api/v3/order-refunds#order-refund---meta-data-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Meta ID. READ-ONLY |
| key | string | Meta key. |
| value | string | Meta value. |


### Order refund - Line items properties[​](/docs/apis/rest-api/v3/order-refunds#order-refund---line-items-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Item ID. READ-ONLY |
| name | string | Product name. |
| product_id | integer | Product ID. |
| variation_id | integer | Variation ID, if applicable. |
| quantity | integer | Quantity ordered. |
| tax_class | string | Tax class of product. |
| subtotal | string | Line subtotal (before discounts). |
| subtotal_tax | string | Line subtotal tax (before discounts). READ-ONLY |
| total | string | Line total (after discounts). |
| total_tax | string | Line total tax (after discounts). READ-ONLY |
| taxes | array | Line taxes. See Order refund line item - Taxes properties READ-ONLY |
| meta_data | array | Meta data. See Order refund - Meta data properties |
| sku | string | Product SKU. READ-ONLY |
| price | string | Product price. READ-ONLY |


#### Order refund line item - Taxes properties[​](/docs/apis/rest-api/v3/order-refunds#order-refund-line-item---taxes-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Tax rate ID. READ-ONLY |
| total | string | Tax total. READ-ONLY |
| subtotal | string | Tax subtotal. READ-ONLY |


### Order refund - Tax lines properties[​](/docs/apis/rest-api/v3/order-refunds#order-refund---tax-lines-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Item ID. READ-ONLY |
| rate_code | string | Tax rate code. READ-ONLY |
| rate_id | integer | Tax rate ID. READ-ONLY |
| label | string | Tax rate label. READ-ONLY |
| compound | boolean | Whether or not this is a compound tax rate. READ-ONLY |
| tax_total | string | Tax total (not including shipping taxes). READ-ONLY |
| shipping_tax_total | string | Shipping tax total. READ-ONLY |
| meta_data | array | Meta data. See Order refund - Meta data properties |


### Order refund - Shipping lines properties[​](/docs/apis/rest-api/v3/order-refunds#order-refund---shipping-lines-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Item ID. READ-ONLY |
| method_title | string | Shipping method name. |
| method_id | string | Shipping method ID. |
| total | string | Line total (after discounts). |
| total_tax | string | Line total tax (after discounts). READ-ONLY |
| taxes | array | Line taxes. See Order refund - Tax lines properties READ-ONLY |
| meta_data | array | Meta data. See Order refund - Meta data properties |


### Order refund - Fee lines properties[​](/docs/apis/rest-api/v3/order-refunds#order-refund---fee-lines-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Item ID. READ-ONLY |
| name | string | Fee name. |
| tax_class | string | Tax class of fee. |
| tax_status | string | Tax status of fee. Options: taxable and none. |
| total | string | Line total (after discounts). |
| total_tax | string | Line total tax (after discounts). READ-ONLY |
| taxes | array | Line taxes. See Order refund - Tax lines properties READ-ONLY |
| meta_data | array | Meta data. See Order refund - Meta data properties |


## Create a refund[​](/docs/apis/rest-api/v3/order-refunds#create-a-refund)


This API helps you to create a new refund for an order.


```
POST /wp-json/wc/v3/orders/<id>/refunds
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/orders/723/refunds \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "amount": "30",  "line_items": [    {      "id": "111",      "refund_total": 10,      "refund_tax": [        {          "id": "222",          "refund_total": 20        }      ]    }}'
```

```
const data = {	amount: '30',	line_items: [		{			id: '111',			refund_total: 10,			refund_tax: [				{					id: '222',					refund_total: 20,				},			],		},	],};WooCommerce.post( 'orders/723/refunds', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [     'amount' => '30',     'line_items' => [       [           'id' => '111',           'refund_total' => 10,           'refund_tax' => [              [                 'id' => '222',                 'amount' => 20              ]           ]       ]     ]];print_r($woocommerce->post('orders/723/refunds', $data));?>
```

```
data = {    "amount": "30",    "line_items": [      {         "id": "111",         "refund_total": 10,         "refund_tax": [           {             "id": "222",             "refund_total": 20           }         ]      }   ]}print(wcapi.post("orders/723/refunds", data).json())
```

```
data = {  amount: "30",  line_items: [    {       id: "111",       refund_total: 10,       refund_tax: [         {           id: "222",           refund_total: 20         }       ]    } ]}woocommerce.post("orders/723/refunds", data).parsed_response
```

```
{	"id": 726,	"date_created": "2017-03-21T17:07:11",	"date_created_gmt": "2017-03-21T20:07:11",	"amount": "10.00",	"reason": "",	"refunded_by": 1,	"refunded_payment": false,	"meta_data": [],	"line_items": [],	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/orders/723/refunds/726"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/orders/723/refunds"			}		],		"up": [			{				"href": "https://example.com/wp-json/wc/v3/orders/723"			}		]	}}
```


#### Line item parameters[​](/docs/apis/rest-api/v3/order-refunds#line-item-parameters)


| Parameter | Type | Description |
| --- | --- | --- |
| id | integer | The ID of the line item in the order. |
| refund_total | number | The amount to refund for this line item, excluding taxes. |
| refund_tax | array | Refunds for tax rates. See Refund tax parameters |


#### Refund tax parameters[​](/docs/apis/rest-api/v3/order-refunds#refund-tax-parameters)


| Parameter | Type | Description |
| --- | --- | --- |
| id | integer | The ID of the tax rate. |
| refund_total | number | The amount of tax to refund for this line item. |


## Retrieve a refund[​](/docs/apis/rest-api/v3/order-refunds#retrieve-a-refund)


This API lets you retrieve and view a specific refund from an order.


```
GET /wp-json/wc/v3/orders/<id>/refunds/<refund_id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/orders/723/refunds/726 \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'orders/723/refunds/726' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('orders/723/refunds/726')); ?>
```

```
print(wcapi.get("orders/723/refunds/726").json())
```

```
woocommerce.get("orders/723/refunds/726").parsed_response
```

```
{	"id": 726,	"date_created": "2017-03-21T17:07:11",	"date_created_gmt": "2017-03-21T20:07:11",	"amount": "10.00",	"reason": "",	"refunded_by": 1,	"refunded_payment": false,	"meta_data": [],	"line_items": [],	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/orders/723/refunds/726"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/orders/723/refunds"			}		],		"up": [			{				"href": "https://example.com/wp-json/wc/v3/orders/723"			}		]	}}
```


#### Available parameters[​](/docs/apis/rest-api/v3/order-refunds#available-parameters)


| Parameter | Type | Description |
| --- | --- | --- |
| dp | string | Number of decimal points to use in each resource. |


## List all refunds[​](/docs/apis/rest-api/v3/order-refunds#list-all-refunds)


This API helps you to view all the refunds from an order.


Note: To view a list of refunds from your store, regardless of order, check out the [refunds endpoint](/docs/apis/rest-api/v3/refunds/).


```
GET /wp-json/wc/v3/orders/<id>/refunds
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/orders/723/refunds \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'orders/723/refunds' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('orders/723/refunds')); ?>
```

```
print(wcapi.get("orders/723/refunds").json())
```

```
woocommerce.get("orders/723/refunds").parsed_response
```

```
[	{		"id": 726,		"date_created": "2017-03-21T17:07:11",		"date_created_gmt": "2017-03-21T20:07:11",		"amount": "10.00",		"reason": "",		"refunded_by": 1,		"refunded_payment": false,		"meta_data": [],		"line_items": [],		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/orders/723/refunds/726"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/orders/723/refunds"				}			],			"up": [				{					"href": "https://example.com/wp-json/wc/v3/orders/723"				}			]		}	},	{		"id": 724,		"date_created": "2017-03-21T16:55:37",		"date_created_gmt": "2017-03-21T19:55:37",		"amount": "9.00",		"reason": "",		"refunded_by": 1,		"refunded_payment": false,		"meta_data": [],		"line_items": [			{				"id": 314,				"name": "Woo Album #2",				"product_id": 87,				"variation_id": 0,				"quantity": -1,				"tax_class": "",				"subtotal": "-9.00",				"subtotal_tax": "0.00",				"total": "-9.00",				"total_tax": "0.00",				"taxes": [],				"meta_data": [					{						"id": 2076,						"key": "_refunded_item_id",						"value": "311"					}				],				"sku": "",				"price": -9			}		],		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/orders/723/refunds/724"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/orders/723/refunds"				}			],			"up": [				{					"href": "https://example.com/wp-json/wc/v3/orders/723"				}			]		}	}]
```


#### Available parameters[​](/docs/apis/rest-api/v3/order-refunds#available-parameters-1)


| Parameter | Type | Description |
| --- | --- | --- |
| context | string | Scope under which the request is made; determines fields present in response. Options: view and edit. Default is view. |
| page | integer | Current page of the collection. Default is 1. |
| per_page | integer | Maximum number of items to be returned in result set. Default is 10. |
| search | string | Limit results to those matching a string. |
| after | string | Limit response to resources published after a given ISO8601 compliant date. |
| before | string | Limit response to resources published before a given ISO8601 compliant date. |
| dates_are_gmt | boolean | Interpret after and before as UTC dates when true. |
| exclude | array | Ensure result set excludes specific IDs. |
| include | array | Limit result set to specific ids. |
| offset | integer | Offset the result set by a specific number of items. |
| order | string | Order sort attribute ascending or descending. Options: asc and desc. Default is desc. |
| orderby | string | Sort collection by object attribute. Options: date, modified, id, include, title and slug. Default is date. |
| parent | array | Limit result set to those of particular parent IDs. |
| parent_exclude | array | Limit result set to all items except those of a particular parent ID. |
| dp | integer | Number of decimal points to use in each resource. Default is 2. |


## Delete a refund[​](/docs/apis/rest-api/v3/order-refunds#delete-a-refund)


This API helps you delete an order refund.


```
DELETE /wp-json/wc/v3/orders/<id>/refunds/<refund_id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X DELETE https://example.com/wp-json/wc/v3/orders/723/refunds/726?force=true \	-u consumer_key:consumer_secret
```

```
WooCommerce.delete( 'orders/723/refunds/726', {	force: true,} )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->delete('orders/723/refunds/726', ['force' => true])); ?>
```

```
print(wcapi.delete("orders/723/refunds/726", params={"force": True}).json())
```

```
woocommerce.delete("orders/723/refunds/726", force: true).parsed_response
```

```
{	"id": 726,	"date_created": "2017-03-21T17:07:11",	"date_created_gmt": "2017-03-21T20:07:11",	"amount": "10.00",	"reason": "",	"refunded_by": 1,	"refunded_payment": false,	"meta_data": [],	"line_items": [],	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/orders/723/refunds/726"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/orders/723/refunds"			}		],		"up": [			{				"href": "https://example.com/wp-json/wc/v3/orders/723"			}		]	}}
```


#### Available parameters[​](/docs/apis/rest-api/v3/order-refunds#available-parameters-2)


| Parameter | Type | Description |
| --- | --- | --- |
| force | string | Required to be true, as resource does not support trashing. |

---

<a name="products"></a>

The products API allows you to create, view, update, and delete individual, or a batch, of products.


## Product properties[​](/docs/apis/rest-api/v3/products#product-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Unique identifier for the resource. READ-ONLY |
| name | string | Product name. |
| slug | string | Product slug. |
| permalink | string | Product URL. READ-ONLY |
| date_created | date-time | The date the product was created, in the site's timezone. READ-ONLY |
| date_created_gmt | date-time | The date the product was created, as GMT. READ-ONLY |
| date_modified | date-time | The date the product was last modified, in the site's timezone. READ-ONLY |
| date_modified_gmt | date-time | The date the product was last modified, as GMT. READ-ONLY |
| type | string | Product type. Options: simple, grouped, external and variable. Default is simple. |
| status | string | Product status (post status). Options: draft, pending, private and publish. Default is publish. |
| featured | boolean | Featured product. Default is false. |
| catalog_visibility | string | Catalog visibility. Options: visible, catalog, search and hidden. Default is visible. |
| description | string | Product description. |
| short_description | string | Product short description. |
| sku | string | Unique identifier. |
| global_unique_id | string | GTIN, UPC, EAN or ISBN - a unique identifier for each distinct product and service that can be purchased. |
| price | string | Current product price. READ-ONLY |
| regular_price | string | Product regular price. |
| sale_price | string | Product sale price. |
| date_on_sale_from | date-time | Start date of sale price, in the site's timezone. |
| date_on_sale_from_gmt | date-time | Start date of sale price, as GMT. |
| date_on_sale_to | date-time | End date of sale price, in the site's timezone. |
| date_on_sale_to_gmt | date-time | End date of sale price, as GMT. |
| price_html | string | Price formatted in HTML. READ-ONLY |
| on_sale | boolean | Shows if the product is on sale. READ-ONLY |
| purchasable | boolean | Shows if the product can be bought. READ-ONLY |
| total_sales | integer | Amount of sales. READ-ONLY |
| virtual | boolean | If the product is virtual. Default is false. |
| downloadable | boolean | If the product is downloadable. Default is false. |
| downloads | array | List of downloadable files. See Product - Downloads properties |
| download_limit | integer | Number of times downloadable files can be downloaded after purchase. Default is -1. |
| download_expiry | integer | Number of days until access to downloadable files expires. Default is -1. |
| external_url | string | Product external URL. Only for external products. |
| button_text | string | Product external button text. Only for external products. |
| tax_status | string | Tax status. Options: taxable, shipping and none. Default is taxable. |
| tax_class | string | Tax class. |
| manage_stock | boolean | Stock management at product level. Default is false. |
| stock_quantity | integer | Stock quantity. |
| stock_status | string | Controls the stock status of the product. Options: instock, outofstock, onbackorder. Default is instock. |
| backorders | string | If managing stock, this controls if backorders are allowed. Options: no, notify and yes. Default is no. |
| backorders_allowed | boolean | Shows if backorders are allowed. READ-ONLY |
| backordered | boolean | Shows if the product is on backordered. READ-ONLY |
| sold_individually | boolean | Allow one item to be bought in a single order. Default is false. |
| weight | string | Product weight. |
| dimensions | object | Product dimensions. See Product - Dimensions properties |
| shipping_required | boolean | Shows if the product need to be shipped. READ-ONLY |
| shipping_taxable | boolean | Shows whether or not the product shipping is taxable. READ-ONLY |
| shipping_class | string | Shipping class slug. |
| shipping_class_id | integer | Shipping class ID. READ-ONLY |
| reviews_allowed | boolean | Allow reviews. Default is true. |
| average_rating | string | Reviews average rating. READ-ONLY |
| rating_count | integer | Amount of reviews that the product have. READ-ONLY |
| related_ids | array | List of related products IDs. READ-ONLY |
| upsell_ids | array | List of up-sell products IDs. |
| cross_sell_ids | array | List of cross-sell products IDs. |
| parent_id | integer | Product parent ID. |
| purchase_note | string | Optional note to send the customer after purchase. |
| categories | array | List of categories. See Product - Categories properties |
| tags | array | List of tags. See Product - Tags properties |
| brands | array | List of product brands. See Brands Properties. In write-mode pass an array of brand objects with id property (uses wp_set_object_terms()) |
| images | array | List of images. See Product - Images properties |
| attributes | array | List of attributes. See Product - Attributes properties |
| default_attributes | array | Defaults variation attributes. See Product - Default attributes properties |
| variations | array | List of variations IDs. READ-ONLY |
| grouped_products | array | List of grouped products ID. |
| menu_order | integer | Menu order, used to custom sort products. |
| meta_data | array | Meta data. See Product - Meta data properties |


### Product - Downloads properties[​](/docs/apis/rest-api/v3/products#product---downloads-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | string | File ID. |
| name | string | File name. |
| file | string | File URL. |


### Product - Dimensions properties[​](/docs/apis/rest-api/v3/products#product---dimensions-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| length | string | Product length. |
| width | string | Product width. |
| height | string | Product height. |


### Product - Categories properties[​](/docs/apis/rest-api/v3/products#product---categories-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Category ID. |
| name | string | Category name. READ-ONLY |
| slug | string | Category slug. READ-ONLY |


### Product - Tags properties[​](/docs/apis/rest-api/v3/products#product---tags-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Tag ID. |
| name | string | Tag name. READ-ONLY |
| slug | string | Tag slug. READ-ONLY |


### Product - Images properties[​](/docs/apis/rest-api/v3/products#product---images-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | The attachment ID from the Media Library. |
| date_created | date-time | The date the image was created, in the site's timezone. READ-ONLY |
| date_created_gmt | date-time | The date the image was created, as GMT. READ-ONLY |
| date_modified | date-time | The date the image was last modified, in the site's timezone. READ-ONLY |
| date_modified_gmt | date-time | The date the image was last modified, as GMT. READ-ONLY |
| src | string | Image URL. |
| name | string | Image name. |
| alt | string | Image alternative text. |


### Brands Properties[​](/docs/apis/rest-api/v3/products#brands-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Brand ID REQUIRED FOR WRITE OPERATIONS |
| name | string | Brand name READ-ONLY |
| slug | string | Brand slug READ-ONLY |


### Product - Attributes properties[​](/docs/apis/rest-api/v3/products#product---attributes-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Attribute ID. |
| name | string | Attribute name. |
| position | integer | Attribute position. |
| visible | boolean | Define if the attribute is visible on the "Additional information" tab in the product's page. Default is false. |
| variation | boolean | Define if the attribute can be used as variation. Default is false. |
| options | array | List of available term names of the attribute. |


### Product - Default attributes properties[​](/docs/apis/rest-api/v3/products#product---default-attributes-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Attribute ID. |
| name | string | Attribute name. |
| option | string | Selected attribute term name. |


### Product - Meta data properties[​](/docs/apis/rest-api/v3/products#product---meta-data-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Meta ID. READ-ONLY |
| key | string | Meta key. |
| value | string | Meta value. |


## Create a product[​](/docs/apis/rest-api/v3/products#create-a-product)


This API helps you to create a new product.


```
POST /wp-json/wc/v3/products
```


> Example of how to create a `simple` product with one existing image and one new image:


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/products \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "name": "Premium Quality",  "type": "simple",  "regular_price": "21.99",  "description": "Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est. Mauris placerat eleifend leo.",  "short_description": "Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.",  "categories": [    {      "id": 9    },    {      "id": 14    }  ],  "images": [    {      "id": 42    },    {      "src": "http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_2_back.jpg"    }  ]}'
```

```
const data = {	name: 'Premium Quality',	type: 'simple',	regular_price: '21.99',	description:		'Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est. Mauris placerat eleifend leo.',	short_description:		'Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.',	categories: [		{			id: 9,		},		{			id: 14,		},	],	images: [		{			id: 42,		},		{			src: 'http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_2_back.jpg',		},	],};WooCommerce.post( 'products', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'name' => 'Premium Quality',    'type' => 'simple',    'regular_price' => '21.99',    'description' => 'Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est. Mauris placerat eleifend leo.',    'short_description' => 'Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.',    'categories' => [        [            'id' => 9        ],        [            'id' => 14        ]    ],    'images' => [        [            'id': 42        ],        [            'src' => 'http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_2_back.jpg'        ]    ]];print_r($woocommerce->post('products', $data));?>
```

```
data = {    "name": "Premium Quality",    "type": "simple",    "regular_price": "21.99",    "description": "Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est. Mauris placerat eleifend leo.",    "short_description": "Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.",    "categories": [        {            "id": 9        },        {            "id": 14        }    ],    "images": [        {            "id": 42        },        {            "src": "http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_2_back.jpg"        }    ]}print(wcapi.post("products", data).json())
```

```
data = {  name: "Premium Quality",  type: "simple",  regular_price: "21.99",  description: "Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est. Mauris placerat eleifend leo.",  short_description: "Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.",  categories: [    {      id: 9    },    {      id: 14    }  ],  images: [    {      id: 42    },    {      src: "http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_2_back.jpg",    }  ]}woocommerce.post("products", data).parsed_response
```

```
{	"id": 794,	"name": "Premium Quality",	"slug": "premium-quality-19",	"permalink": "https://example.com/product/premium-quality-19/",	"date_created": "2017-03-23T17:01:14",	"date_created_gmt": "2017-03-23T20:01:14",	"date_modified": "2017-03-23T17:01:14",	"date_modified_gmt": "2017-03-23T20:01:14",	"type": "simple",	"status": "publish",	"featured": false,	"catalog_visibility": "visible",	"description": "<p>Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est. Mauris placerat eleifend leo.</p>\n",	"short_description": "<p>Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.</p>\n",	"sku": "",	"price": "21.99",	"regular_price": "21.99",	"sale_price": "",	"date_on_sale_from": null,	"date_on_sale_from_gmt": null,	"date_on_sale_to": null,	"date_on_sale_to_gmt": null,	"price_html": "<span class=\"woocommerce-Price-amount amount\"><span class=\"woocommerce-Price-currencySymbol\">&#36;</span>21.99</span>",	"on_sale": false,	"purchasable": true,	"total_sales": 0,	"virtual": false,	"downloadable": false,	"downloads": [],	"download_limit": -1,	"download_expiry": -1,	"external_url": "",	"button_text": "",	"tax_status": "taxable",	"tax_class": "",	"manage_stock": false,	"stock_quantity": null,	"stock_status": "instock",	"backorders": "no",	"backorders_allowed": false,	"backordered": false,	"sold_individually": false,	"weight": "",	"dimensions": {		"length": "",		"width": "",		"height": ""	},	"shipping_required": true,	"shipping_taxable": true,	"shipping_class": "",	"shipping_class_id": 0,	"reviews_allowed": true,	"average_rating": "0.00",	"rating_count": 0,	"related_ids": [ 53, 40, 56, 479, 99 ],	"upsell_ids": [],	"cross_sell_ids": [],	"parent_id": 0,	"purchase_note": "",	"categories": [		{			"id": 9,			"name": "Clothing",			"slug": "clothing"		},		{			"id": 14,			"name": "T-shirts",			"slug": "t-shirts"		}	],	"tags": [],	"images": [		{			"id": 42,			"date_created": "2017-03-22T14:01:13",			"date_created_gmt": "2017-03-22T20:01:13",			"date_modified": "2017-03-22T14:01:13",			"date_modified_gmt": "2017-03-22T20:01:13",			"src": "https://example.com/wp-content/uploads/2017/03/T_2_front-4.jpg",			"name": "",			"alt": ""		},		{			"id": 793,			"date_created": "2017-03-23T14:01:14",			"date_created_gmt": "2017-03-23T20:01:14",			"date_modified": "2017-03-23T14:01:14",			"date_modified_gmt": "2017-03-23T20:01:14",			"src": "https://example.com/wp-content/uploads/2017/03/T_2_back-2.jpg",			"name": "",			"alt": ""		}	],	"attributes": [],	"default_attributes": [],	"variations": [],	"grouped_products": [],	"menu_order": 0,	"meta_data": [],	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/products/794"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/products"			}		]	}}
```


> Example of how to create a `variable` product with global and non-global attributes:


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/products \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "name": "Ship Your Idea",  "type": "variable",  "description": "Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est. Mauris placerat eleifend leo.",  "short_description": "Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.",  "categories": [    {      "id": 9    },    {      "id": 14    }  ],  "images": [    {      "src": "http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_4_front.jpg"    },    {      "src": "http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_4_back.jpg"    },    {      "src": "http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_3_front.jpg"    },    {      "src": "http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_3_back.jpg"    }  ],  "attributes": [    {      "id": 6,      "position": 0,      "visible": false,      "variation": true,      "options": [        "Black",        "Green"      ]    },    {      "name": "Size",      "position": 0,      "visible": true,      "variation": true,      "options": [        "S",        "M"      ]    }  ],  "default_attributes": [    {      "id": 6,      "option": "Black"    },    {      "name": "Size",      "option": "S"    }  ]}'
```

```
const data = {	name: 'Ship Your Idea',	type: 'variable',	description:		'Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est. Mauris placerat eleifend leo.',	short_description:		'Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.',	categories: [		{			id: 9,		},		{			id: 14,		},	],	images: [		{			src: 'http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_4_front.jpg',		},		{			src: 'http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_4_back.jpg',		},		{			src: 'http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_3_front.jpg',		},		{			src: 'http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_3_back.jpg',		},	],	attributes: [		{			id: 6,			position: 0,			visible: true,			variation: true,			options: [ 'Black', 'Green' ],		},		{			name: 'Size',			position: 0,			visible: false,			variation: true,			options: [ 'S', 'M' ],		},	],	default_attributes: [		{			id: 6,			option: 'Black',		},		{			name: 'Size',			option: 'S',		},	],};WooCommerce.post( 'products', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'name' => 'Ship Your Idea',    'type' => 'variable',    'description' => 'Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est. Mauris placerat eleifend leo.',    'short_description' => 'Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.',    'categories' => [        [            'id' => 9        ],        [            'id' => 14        ]    ],    'images' => [        [            'src' => 'http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_4_front.jpg'        ],        [            'src' => 'http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_4_back.jpg'        ],        [            'src' => 'http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_3_front.jpg'        ],        [            'src' => 'http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_3_back.jpg'        ]    ],    'attributes' => [        [            'id' => 6,            'position' => 0,            'visible' => false,            'variation' => true,            'options' => [                'Black',                'Green'            ]        ],        [            'name' => 'Size',            'position' => 0,            'visible' => true,            'variation' => true,            'options' => [                'S',                'M'            ]        ]    ],    'default_attributes' => [        [            'id' => 6,            'option' => 'Black'        ],        [            'name' => 'Size',            'option' => 'S'        ]    ]];print_r($woocommerce->post('products', $data));?>
```

```
data = {    "name": "Ship Your Idea",    "type": "variable",    "description": "Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est. Mauris placerat eleifend leo.",    "short_description": "Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.",    "categories": [        {            "id": 9        },        {            "id": 14        }    ],    "images": [        {            "src": "http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_4_front.jpg"        },        {            "src": "http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_4_back.jpg"        },        {            "src": "http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_3_front.jpg"        },        {            "src": "http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_3_back.jpg"        }    ],    "attributes": [        {            "id": 6,            "position": 0,            "visible": False,            "variation": True,            "options": [                "Black",                "Green"            ]        },        {            "name": "Size",            "position": 0,            "visible": True,            "variation": True,            "options": [                "S",                "M"            ]        }    ],    "default_attributes": [        {            "id": 6,            "option": "Black"        },        {            "name": "Size",            "option": "S"        }    ]}print(wcapi.post("products", data).json())
```

```
data = {  name: "Ship Your Idea",  type: "variable",  description: "Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est. Mauris placerat eleifend leo.",  short_description: "Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.",  categories: [    {      id: 9    },    {      id: 14    }  ],  images: [    {      src: "http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_4_front.jpg"    },    {      src: "http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_4_back.jpg"    },    {      src: "http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_3_front.jpg"    },    {      src: "http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_3_back.jpg"    }  ],  attributes: [    {      id: 6,      position: 0,      visible: false,      variation: true,      options: [        "Black",        "Green"      ]    },    {      name: "Size",      position: 0,      visible: true,      variation: true,      options: [        "S",        "M"      ]    }  ],  default_attributes: [    {      id: 6,      option: "Black"    },    {      name: "Size",      option: "S"    }  ]}woocommerce.post("products", data).parsed_response
```

```
{	"id": 799,	"name": "Ship Your Idea",	"slug": "ship-your-idea-22",	"permalink": "https://example.com/product/ship-your-idea-22/",	"date_created": "2017-03-23T17:03:12",	"date_created_gmt": "2017-03-23T20:03:12",	"date_modified": "2017-03-23T17:03:12",	"date_modified_gmt": "2017-03-23T20:03:12",	"type": "variable",	"status": "publish",	"featured": false,	"catalog_visibility": "visible",	"description": "<p>Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est. Mauris placerat eleifend leo.</p>\n",	"short_description": "<p>Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.</p>\n",	"sku": "",	"price": "",	"regular_price": "",	"sale_price": "",	"date_on_sale_from": null,	"date_on_sale_from_gmt": null,	"date_on_sale_to": null,	"date_on_sale_to_gmt": null,	"price_html": "",	"on_sale": false,	"purchasable": false,	"total_sales": 0,	"virtual": false,	"downloadable": false,	"downloads": [],	"download_limit": -1,	"download_expiry": -1,	"external_url": "",	"button_text": "",	"tax_status": "taxable",	"tax_class": "",	"manage_stock": false,	"stock_quantity": null,	"stock_status": "instock",	"backorders": "no",	"backorders_allowed": false,	"backordered": false,	"sold_individually": false,	"weight": "",	"dimensions": {		"length": "",		"width": "",		"height": ""	},	"shipping_required": true,	"shipping_taxable": true,	"shipping_class": "",	"shipping_class_id": 0,	"reviews_allowed": true,	"average_rating": "0.00",	"rating_count": 0,	"related_ids": [ 472, 387, 19, 53, 396 ],	"upsell_ids": [],	"cross_sell_ids": [],	"parent_id": 0,	"purchase_note": "",	"categories": [		{			"id": 9,			"name": "Clothing",			"slug": "clothing"		},		{			"id": 14,			"name": "T-shirts",			"slug": "t-shirts"		}	],	"tags": [],	"images": [		{			"id": 795,			"date_created": "2017-03-23T14:03:08",			"date_created_gmt": "2017-03-23T20:03:08",			"date_modified": "2017-03-23T14:03:08",			"date_modified_gmt": "2017-03-23T20:03:08",			"src": "https://example.com/wp-content/uploads/2017/03/T_4_front-11.jpg",			"name": "",			"alt": ""		},		{			"id": 796,			"date_created": "2017-03-23T14:03:09",			"date_created_gmt": "2017-03-23T20:03:09",			"date_modified": "2017-03-23T14:03:09",			"date_modified_gmt": "2017-03-23T20:03:09",			"src": "https://example.com/wp-content/uploads/2017/03/T_4_back-10.jpg",			"name": "",			"alt": ""		},		{			"id": 797,			"date_created": "2017-03-23T14:03:10",			"date_created_gmt": "2017-03-23T20:03:10",			"date_modified": "2017-03-23T14:03:10",			"date_modified_gmt": "2017-03-23T20:03:10",			"src": "https://example.com/wp-content/uploads/2017/03/T_3_front-10.jpg",			"name": "",			"alt": ""		},		{			"id": 798,			"date_created": "2017-03-23T14:03:11",			"date_created_gmt": "2017-03-23T20:03:11",			"date_modified": "2017-03-23T14:03:11",			"date_modified_gmt": "2017-03-23T20:03:11",			"src": "https://example.com/wp-content/uploads/2017/03/T_3_back-10.jpg",			"name": "",			"alt": ""		}	],	"attributes": [		{			"id": 6,			"name": "Color",			"position": 0,			"visible": false,			"variation": true,			"options": [ "Black", "Green" ]		},		{			"id": 0,			"name": "Size",			"position": 0,			"visible": true,			"variation": true,			"options": [ "S", "M" ]		}	],	"default_attributes": [		{			"id": 6,			"name": "Color",			"option": "black"		},		{			"id": 0,			"name": "Size",			"option": "S"		}	],	"variations": [],	"grouped_products": [],	"menu_order": 0,	"meta_data": [],	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/products/799"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/products"			}		]	}}
```


## Retrieve a product[​](/docs/apis/rest-api/v3/products#retrieve-a-product)


This API lets you retrieve and view a specific product by ID.


```
GET /wp-json/wc/v3/products/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/products/794 \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'products/794' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('products/794')); ?>
```

```
print(wcapi.get("products/794").json())
```

```
woocommerce.get("products/794").parsed_response
```

```
{	"id": 794,	"name": "Premium Quality",	"slug": "premium-quality-19",	"permalink": "https://example.com/product/premium-quality-19/",	"date_created": "2017-03-23T17:01:14",	"date_created_gmt": "2017-03-23T20:01:14",	"date_modified": "2017-03-23T17:01:14",	"date_modified_gmt": "2017-03-23T20:01:14",	"type": "simple",	"status": "publish",	"featured": false,	"catalog_visibility": "visible",	"description": "<p>Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est. Mauris placerat eleifend leo.</p>\n",	"short_description": "<p>Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.</p>\n",	"sku": "",	"price": "21.99",	"regular_price": "21.99",	"sale_price": "",	"date_on_sale_from": null,	"date_on_sale_from_gmt": null,	"date_on_sale_to": null,	"date_on_sale_to_gmt": null,	"price_html": "<span class=\"woocommerce-Price-amount amount\"><span class=\"woocommerce-Price-currencySymbol\">&#36;</span>21.99</span>",	"on_sale": false,	"purchasable": true,	"total_sales": 0,	"virtual": false,	"downloadable": false,	"downloads": [],	"download_limit": -1,	"download_expiry": -1,	"external_url": "",	"button_text": "",	"tax_status": "taxable",	"tax_class": "",	"manage_stock": false,	"stock_quantity": null,	"stock_status": "instock",	"backorders": "no",	"backorders_allowed": false,	"backordered": false,	"sold_individually": false,	"weight": "",	"dimensions": {		"length": "",		"width": "",		"height": ""	},	"shipping_required": true,	"shipping_taxable": true,	"shipping_class": "",	"shipping_class_id": 0,	"reviews_allowed": true,	"average_rating": "0.00",	"rating_count": 0,	"related_ids": [ 53, 40, 56, 479, 99 ],	"upsell_ids": [],	"cross_sell_ids": [],	"parent_id": 0,	"purchase_note": "",	"categories": [		{			"id": 9,			"name": "Clothing",			"slug": "clothing"		},		{			"id": 14,			"name": "T-shirts",			"slug": "t-shirts"		}	],	"tags": [],	"images": [		{			"id": 792,			"date_created": "2017-03-23T14:01:13",			"date_created_gmt": "2017-03-23T20:01:13",			"date_modified": "2017-03-23T14:01:13",			"date_modified_gmt": "2017-03-23T20:01:13",			"src": "https://example.com/wp-content/uploads/2017/03/T_2_front-4.jpg",			"name": "",			"alt": ""		},		{			"id": 793,			"date_created": "2017-03-23T14:01:14",			"date_created_gmt": "2017-03-23T20:01:14",			"date_modified": "2017-03-23T14:01:14",			"date_modified_gmt": "2017-03-23T20:01:14",			"src": "https://example.com/wp-content/uploads/2017/03/T_2_back-2.jpg",			"name": "",			"alt": ""		}	],	"attributes": [],	"default_attributes": [],	"variations": [],	"grouped_products": [],	"menu_order": 0,	"meta_data": [],	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/products/794"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/products"			}		]	}}
```


## List all products[​](/docs/apis/rest-api/v3/products#list-all-products)


This API helps you to view all the products.


```
GET /wp-json/wc/v3/products
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/products \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'products' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('products')); ?>
```

```
print(wcapi.get("products").json())
```

```
woocommerce.get("products").parsed_response
```

```
[	{		"id": 799,		"name": "Ship Your Idea",		"slug": "ship-your-idea-22",		"permalink": "https://example.com/product/ship-your-idea-22/",		"date_created": "2017-03-23T17:03:12",		"date_created_gmt": "2017-03-23T20:03:12",		"date_modified": "2017-03-23T17:03:12",		"date_modified_gmt": "2017-03-23T20:03:12",		"type": "variable",		"status": "publish",		"featured": false,		"catalog_visibility": "visible",		"description": "<p>Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est. Mauris placerat eleifend leo.</p>\n",		"short_description": "<p>Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.</p>\n",		"sku": "",		"price": "",		"regular_price": "",		"sale_price": "",		"date_on_sale_from": null,		"date_on_sale_from_gmt": null,		"date_on_sale_to": null,		"date_on_sale_to_gmt": null,		"price_html": "",		"on_sale": false,		"purchasable": false,		"total_sales": 0,		"virtual": false,		"downloadable": false,		"downloads": [],		"download_limit": -1,		"download_expiry": -1,		"external_url": "",		"button_text": "",		"tax_status": "taxable",		"tax_class": "",		"manage_stock": false,		"stock_quantity": null,		"stock_status": "instock",		"backorders": "no",		"backorders_allowed": false,		"backordered": false,		"sold_individually": false,		"weight": "",		"dimensions": {			"length": "",			"width": "",			"height": ""		},		"shipping_required": true,		"shipping_taxable": true,		"shipping_class": "",		"shipping_class_id": 0,		"reviews_allowed": true,		"average_rating": "0.00",		"rating_count": 0,		"related_ids": [ 31, 22, 369, 414, 56 ],		"upsell_ids": [],		"cross_sell_ids": [],		"parent_id": 0,		"purchase_note": "",		"categories": [			{				"id": 9,				"name": "Clothing",				"slug": "clothing"			},			{				"id": 14,				"name": "T-shirts",				"slug": "t-shirts"			}		],		"tags": [],		"images": [			{				"id": 795,				"date_created": "2017-03-23T14:03:08",				"date_created_gmt": "2017-03-23T20:03:08",				"date_modified": "2017-03-23T14:03:08",				"date_modified_gmt": "2017-03-23T20:03:08",				"src": "https://example.com/wp-content/uploads/2017/03/T_4_front-11.jpg",				"name": "",				"alt": ""			},			{				"id": 796,				"date_created": "2017-03-23T14:03:09",				"date_created_gmt": "2017-03-23T20:03:09",				"date_modified": "2017-03-23T14:03:09",				"date_modified_gmt": "2017-03-23T20:03:09",				"src": "https://example.com/wp-content/uploads/2017/03/T_4_back-10.jpg",				"name": "",				"alt": ""			},			{				"id": 797,				"date_created": "2017-03-23T14:03:10",				"date_created_gmt": "2017-03-23T20:03:10",				"date_modified": "2017-03-23T14:03:10",				"date_modified_gmt": "2017-03-23T20:03:10",				"src": "https://example.com/wp-content/uploads/2017/03/T_3_front-10.jpg",				"name": "",				"alt": ""			},			{				"id": 798,				"date_created": "2017-03-23T14:03:11",				"date_created_gmt": "2017-03-23T20:03:11",				"date_modified": "2017-03-23T14:03:11",				"date_modified_gmt": "2017-03-23T20:03:11",				"src": "https://example.com/wp-content/uploads/2017/03/T_3_back-10.jpg",				"name": "",				"alt": ""			}		],		"attributes": [			{				"id": 6,				"name": "Color",				"position": 0,				"visible": false,				"variation": true,				"options": [ "Black", "Green" ]			},			{				"id": 0,				"name": "Size",				"position": 0,				"visible": true,				"variation": true,				"options": [ "S", "M" ]			}		],		"default_attributes": [],		"variations": [],		"grouped_products": [],		"menu_order": 0,		"meta_data": [],		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/products/799"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/products"				}			]		}	},	{		"id": 794,		"name": "Premium Quality",		"slug": "premium-quality-19",		"permalink": "https://example.com/product/premium-quality-19/",		"date_created": "2017-03-23T17:01:14",		"date_created_gmt": "2017-03-23T20:01:14",		"date_modified": "2017-03-23T17:01:14",		"date_modified_gmt": "2017-03-23T20:01:14",		"type": "simple",		"status": "publish",		"featured": false,		"catalog_visibility": "visible",		"description": "<p>Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est. Mauris placerat eleifend leo.</p>\n",		"short_description": "<p>Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.</p>\n",		"sku": "",		"price": "21.99",		"regular_price": "21.99",		"sale_price": "",		"date_on_sale_from": null,		"date_on_sale_from_gmt": null,		"date_on_sale_to": null,		"date_on_sale_to_gmt": null,		"price_html": "<span class=\"woocommerce-Price-amount amount\"><span class=\"woocommerce-Price-currencySymbol\">&#36;</span>21.99</span>",		"on_sale": false,		"purchasable": true,		"total_sales": 0,		"virtual": false,		"downloadable": false,		"downloads": [],		"download_limit": -1,		"download_expiry": -1,		"external_url": "",		"button_text": "",		"tax_status": "taxable",		"tax_class": "",		"manage_stock": false,		"stock_quantity": null,		"stock_status": "instock",		"backorders": "no",		"backorders_allowed": false,		"backordered": false,		"sold_individually": false,		"weight": "",		"dimensions": {			"length": "",			"width": "",			"height": ""		},		"shipping_required": true,		"shipping_taxable": true,		"shipping_class": "",		"shipping_class_id": 0,		"reviews_allowed": true,		"average_rating": "0.00",		"rating_count": 0,		"related_ids": [ 463, 47, 31, 387, 458 ],		"upsell_ids": [],		"cross_sell_ids": [],		"parent_id": 0,		"purchase_note": "",		"categories": [			{				"id": 9,				"name": "Clothing",				"slug": "clothing"			},			{				"id": 14,				"name": "T-shirts",				"slug": "t-shirts"			}		],		"tags": [],		"images": [			{				"id": 792,				"date_created": "2017-03-23T14:01:13",				"date_created_gmt": "2017-03-23T20:01:13",				"date_modified": "2017-03-23T14:01:13",				"date_modified_gmt": "2017-03-23T20:01:13",				"src": "https://example.com/wp-content/uploads/2017/03/T_2_front-4.jpg",				"name": "",				"alt": ""			},			{				"id": 793,				"date_created": "2017-03-23T14:01:14",				"date_created_gmt": "2017-03-23T20:01:14",				"date_modified": "2017-03-23T14:01:14",				"date_modified_gmt": "2017-03-23T20:01:14",				"src": "https://example.com/wp-content/uploads/2017/03/T_2_back-2.jpg",				"name": "",				"alt": ""			}		],		"attributes": [],		"default_attributes": [			{				"id": 6,				"name": "Color",				"option": "black"			},			{				"id": 0,				"name": "Size",				"option": "S"			}		],		"variations": [],		"grouped_products": [],		"menu_order": 0,		"meta_data": [],		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/products/794"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/products"				}			]		}	}]
```


#### Available parameters[​](/docs/apis/rest-api/v3/products#available-parameters)


| Parameter | Type | Description |
| --- | --- | --- |
| context | string | Scope under which the request is made; determines fields present in response. Options: view and edit. Default is view. |
| page | integer | Current page of the collection. Default is 1. |
| per_page | integer | Maximum number of items to be returned in result set. Default is 10. |
| search | string | Limit results to those matching a string. |
| search_fields | array | Fields to search when used with search parameter. All search tokens must be found across any of the specified fields. Takes precedence over other search parameters. If empty, uses default search behavior. Options: name, sku, global_unique_id, description, and short_description. |
| after | string | Limit response to resources published after a given ISO8601 compliant date. |
| before | string | Limit response to resources published before a given ISO8601 compliant date. |
| modified_after | string | Limit response to resources modified after a given ISO8601 compliant date. |
| modified_before | string | Limit response to resources modified after a given ISO8601 compliant date. |
| dates_are_gmt | boolean | Whether to interpret dates as GMT when limiting response by published or modified date. |
| exclude | array | Ensure result set excludes specific IDs. |
| include | array | Limit result set to specific ids. |
| offset | integer | Offset the result set by a specific number of items. |
| order | string | Order sort attribute ascending or descending. Options: asc and desc. Default is desc. |
| orderby | string | Sort collection by object attribute. Options: date, modified, id, include, title, slug, price, popularity, rating, and menu_order. Default is date. |
| parent | array | Limit result set to those of particular parent IDs. |
| parent_exclude | array | Limit result set to all items except those of a particular parent ID. |
| slug | string | Limit result set to products with a specific slug. |
| status | string | Limit result set to products assigned a specific status. Options: any, draft, pending, private and publish. Default is any. |
| include_status | string | Limit result set to products with any of the specified statuses. Multiple statuses can be provided as a comma-separated list. Takes precedence over the status parameter. Options: any, future, trash, draft, pending, private, and publish. |
| exclude_status | string | Exclude products from result set with any of the specified statuses. Multiple statuses can be provided as a comma-separated list. Takes precedence over the include_status parameter. Options: future, trash, draft, pending, private, and publish. |
| type | string | Limit result set to products assigned a specific type. Options: simple, grouped, external and variable. |
| include_types | string | Limit result set to products with any of the types. Multiple statuses can be provided as a comma-separated list. Takes precedence over the type parameter. Options: simple, grouped, external and variable. |
| exclude_types | string | Exclude products from result set with any of the specified types. Multiple statuses can be provided as a comma-separated list. Takes precedence over the include_types parameter. Options: simple, grouped, external and variable. |
| sku | string | Limit result set to products with a specific SKU. |
| featured | boolean | Limit result set to featured products. |
| category | string | Limit result set to products assigned a specific category ID. |
| tag | string | Limit result set to products assigned a specific tag ID. |
| shipping_class | string | Limit result set to products assigned a specific shipping class ID. |
| attribute | string | Limit result set to products with a specific attribute. |
| attribute_term | string | Limit result set to products with a specific attribute term ID (required an assigned attribute). |
| tax_class | string | Limit result set to products with a specific tax class. Default options: standard, reduced-rate and zero-rate. |
| on_sale | boolean | Limit result set to products on sale. |
| min_price | string | Limit result set to products based on a minimum price. |
| max_price | string | Limit result set to products based on a maximum price. |
| stock_status | string | Limit result set to products with specified stock status. Options: instock, outofstock and onbackorder. |
| virtual | boolean | Limit result set to virtual products. |
| downloadable | boolean | Limit result set to downloadable products. |


## Duplicate product[​](/docs/apis/rest-api/v3/products#duplicate-product)


This API helps you to duplicate a product.


```
POST /wp-json/wc/v3/products/<product_id>/duplicate
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/products/<product_id>/duplicate \	-u consumer_key:consumer_secret
```

```
WooCommerce.post( 'products/2/duplicate' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->post('products/2/duplicate')); ?>
```

```
print(wcapi.post("products/2/duplicate").json())
```

```
woocommerce.post("products/2/duplicate").parsed_response
```

```
{	"id": 824,	"name": "Premium Quality (Copy)",	"slug": "",	"date_created": {		"date": "2024-05-30 19:16:39.000000",		"timezone_type": 1,		"timezone": "+00:00"	},	"date_modified": {		"date": "2024-03-08 15:03:19.000000",		"timezone_type": 1,		"timezone": "+00:00"	},	"status": "draft",	"featured": false,	"catalog_visibility": "visible",	"description": "",	"short_description": "",	"sku": "product-22-1",	"price": "",	"regular_price": "",	"sale_price": "",	"date_on_sale_from": null,	"date_on_sale_to": null,	"total_sales": 0,	"tax_status": "taxable",	"tax_class": "",	"manage_stock": false,	"stock_quantity": null,	"stock_status": "instock",	"backorders": "no",	"low_stock_amount": "",	"sold_individually": false,	"weight": "",	"length": "",	"width": "",	"height": "",	"upsell_ids": [],	"cross_sell_ids": [],	"parent_id": 0,	"reviews_allowed": true,	"purchase_note": "",	"attributes": [],	"default_attributes": [],	"menu_order": 0,	"post_password": "",	"virtual": false,	"downloadable": false,	"category_ids": [ 15 ],	"tag_ids": [],	"shipping_class_id": 0,	"downloads": [],	"image_id": "",	"gallery_image_ids": [],	"download_limit": -1,	"download_expiry": -1,	"rating_counts": [],	"average_rating": "0",	"review_count": 0,	"meta_data": []}
```


## Update a product[​](/docs/apis/rest-api/v3/products#update-a-product)


This API lets you make changes to a product.


```
PUT /wp-json/wc/v3/products/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X PUT https://example.com/wp-json/wc/v3/products/794 \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "regular_price": "24.54"}'
```

```
const data = {	regular_price: '24.54',};WooCommerce.put( 'products/794', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'regular_price' => '24.54'];print_r($woocommerce->put('products/794', $data));?>
```

```
data = {    "regular_price": "24.54"}print(wcapi.put("products/794", data).json())
```

```
data = {  regular_price: "24.54"}woocommerce.put("products/794", data).parsed_response
```

```
{	"id": 794,	"name": "Premium Quality",	"slug": "premium-quality-19",	"permalink": "https://example.com/product/premium-quality-19/",	"date_created": "2017-03-23T17:01:14",	"date_created_gmt": "2017-03-23T20:01:14",	"date_modified": "2017-03-23T17:01:14",	"date_modified_gmt": "2017-03-23T20:01:14",	"type": "simple",	"status": "publish",	"featured": false,	"catalog_visibility": "visible",	"description": "<p>Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est. Mauris placerat eleifend leo.</p>\n",	"short_description": "<p>Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.</p>\n",	"sku": "",	"price": "24.54",	"regular_price": "24.54",	"sale_price": "",	"date_on_sale_from": null,	"date_on_sale_from_gmt": null,	"date_on_sale_to": null,	"date_on_sale_to_gmt": null,	"price_html": "<span class=\"woocommerce-Price-amount amount\"><span class=\"woocommerce-Price-currencySymbol\">&#36;</span>24.54</span>",	"on_sale": false,	"purchasable": true,	"total_sales": 0,	"virtual": false,	"downloadable": false,	"downloads": [],	"download_limit": -1,	"download_expiry": -1,	"external_url": "",	"button_text": "",	"tax_status": "taxable",	"tax_class": "",	"manage_stock": false,	"stock_quantity": null,	"stock_status": "instock",	"backorders": "no",	"backorders_allowed": false,	"backordered": false,	"sold_individually": false,	"weight": "",	"dimensions": {		"length": "",		"width": "",		"height": ""	},	"shipping_required": true,	"shipping_taxable": true,	"shipping_class": "",	"shipping_class_id": 0,	"reviews_allowed": true,	"average_rating": "0.00",	"rating_count": 0,	"related_ids": [ 479, 387, 22, 463, 396 ],	"upsell_ids": [],	"cross_sell_ids": [],	"parent_id": 0,	"purchase_note": "",	"categories": [		{			"id": 9,			"name": "Clothing",			"slug": "clothing"		},		{			"id": 14,			"name": "T-shirts",			"slug": "t-shirts"		}	],	"tags": [],	"images": [		{			"id": 792,			"date_created": "2017-03-23T14:01:13",			"date_created_gmt": "2017-03-23T20:01:13",			"date_modified": "2017-03-23T14:01:13",			"date_modified_gmt": "2017-03-23T20:01:13",			"src": "https://example.com/wp-content/uploads/2017/03/T_2_front-4.jpg",			"name": "",			"alt": ""		},		{			"id": 793,			"date_created": "2017-03-23T14:01:14",			"date_created_gmt": "2017-03-23T20:01:14",			"date_modified": "2017-03-23T14:01:14",			"date_modified_gmt": "2017-03-23T20:01:14",			"src": "https://example.com/wp-content/uploads/2017/03/T_2_back-2.jpg",			"name": "",			"alt": ""		}	],	"attributes": [],	"default_attributes": [],	"variations": [],	"grouped_products": [],	"menu_order": 0,	"meta_data": [],	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/products/794"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/products"			}		]	}}
```


## Delete a product[​](/docs/apis/rest-api/v3/products#delete-a-product)


This API helps you delete a product.


```
DELETE /wp-json/wc/v3/products/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X DELETE https://example.com/wp-json/wc/v3/products/794?force=true \	-u consumer_key:consumer_secret
```

```
WooCommerce.delete( 'products/794', {	force: true,} )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->delete('products/794', ['force' => true])); ?>
```

```
print(wcapi.delete("products/794", params={"force": True}).json())
```

```
woocommerce.delete("products/794", force: true).parsed_response
```

```
{	"id": 794,	"name": "Premium Quality",	"slug": "premium-quality-19",	"permalink": "https://example.com/product/premium-quality-19/",	"date_created": "2017-03-23T17:01:14",	"date_created_gmt": "2017-03-23T20:01:14",	"date_modified": "2017-03-23T17:01:14",	"date_modified_gmt": "2017-03-23T20:01:14",	"type": "simple",	"status": "publish",	"featured": false,	"catalog_visibility": "visible",	"description": "<p>Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est. Mauris placerat eleifend leo.</p>\n",	"short_description": "<p>Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.</p>\n",	"sku": "",	"price": "24.54",	"regular_price": "24.54",	"sale_price": "",	"date_on_sale_from": null,	"date_on_sale_from_gmt": null,	"date_on_sale_to": null,	"date_on_sale_to_gmt": null,	"price_html": "<span class=\"woocommerce-Price-amount amount\"><span class=\"woocommerce-Price-currencySymbol\">&#36;</span>24.54</span>",	"on_sale": false,	"purchasable": true,	"total_sales": 0,	"virtual": false,	"downloadable": false,	"downloads": [],	"download_limit": -1,	"download_expiry": -1,	"external_url": "",	"button_text": "",	"tax_status": "taxable",	"tax_class": "",	"manage_stock": false,	"stock_quantity": null,	"stock_status": "instock",	"backorders": "no",	"backorders_allowed": false,	"backordered": false,	"sold_individually": false,	"weight": "",	"dimensions": {		"length": "",		"width": "",		"height": ""	},	"shipping_required": true,	"shipping_taxable": true,	"shipping_class": "",	"shipping_class_id": 0,	"reviews_allowed": true,	"average_rating": "0.00",	"rating_count": 0,	"related_ids": [ 479, 387, 22, 463, 396 ],	"upsell_ids": [],	"cross_sell_ids": [],	"parent_id": 0,	"purchase_note": "",	"categories": [		{			"id": 9,			"name": "Clothing",			"slug": "clothing"		},		{			"id": 14,			"name": "T-shirts",			"slug": "t-shirts"		}	],	"tags": [],	"images": [		{			"id": 792,			"date_created": "2017-03-23T14:01:13",			"date_created_gmt": "2017-03-23T20:01:13",			"date_modified": "2017-03-23T14:01:13",			"date_modified_gmt": "2017-03-23T20:01:13",			"src": "https://example.com/wp-content/uploads/2017/03/T_2_front-4.jpg",			"name": "",			"alt": ""		},		{			"id": 793,			"date_created": "2017-03-23T14:01:14",			"date_created_gmt": "2017-03-23T20:01:14",			"date_modified": "2017-03-23T14:01:14",			"date_modified_gmt": "2017-03-23T20:01:14",			"src": "https://example.com/wp-content/uploads/2017/03/T_2_back-2.jpg",			"name": "",			"alt": ""		}	],	"attributes": [],	"default_attributes": [],	"variations": [],	"grouped_products": [],	"menu_order": 0,	"meta_data": [],	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/products/794"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/products"			}		]	}}
```


#### Available parameters[​](/docs/apis/rest-api/v3/products#available-parameters-1)


| Parameter | Type | Description |
| --- | --- | --- |
| force | string | Use true whether to permanently delete the product, Default is false. |


## Batch update products[​](/docs/apis/rest-api/v3/products#batch-update-products)


This API helps you to batch create, update and delete multiple products.

note
Note: By default it's limited to up to 100 objects to be created, updated or
deleted.


```
POST /wp-json/wc/v3/products/batch
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/products/batch \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "create": [    {      "name": "Woo Single #1",      "type": "simple",      "regular_price": "21.99",      "virtual": true,      "downloadable": true,      "downloads": [        {          "name": "Woo Single",          "file": "http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/cd_4_angle.jpg"        }      ],      "categories": [        {          "id": 11        },        {          "id": 13        }      ],      "images": [        {          "src": "http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/cd_4_angle.jpg"        }      ]    },    {      "name": "New Premium Quality",      "type": "simple",      "regular_price": "21.99",      "description": "Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est. Mauris placerat eleifend leo.",      "short_description": "Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.",      "categories": [        {          "id": 9        },        {          "id": 14        }      ],      "images": [        {          "src": "http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_2_front.jpg"        },        {          "src": "http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_2_back.jpg"        }      ]    }  ],  "update": [    {      "id": 799,      "default_attributes": [        {          "id": 6,          "name": "Color",          "option": "Green"        },        {          "id": 0,          "name": "Size",          "option": "M"        }      ]    }  ],  "delete": [    794  ]}'
```

```
const data = {	create: [		{			name: 'Woo Single #1',			type: 'simple',			regular_price: '21.99',			virtual: true,			downloadable: true,			downloads: [				{					name: 'Woo Single',					file: 'http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/cd_4_angle.jpg',				},			],			categories: [				{					id: 11,				},				{					id: 13,				},			],			images: [				{					src: 'http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/cd_4_angle.jpg',				},			],		},		{			name: 'New Premium Quality',			type: 'simple',			regular_price: '21.99',			description:				'Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est. Mauris placerat eleifend leo.',			short_description:				'Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.',			categories: [				{					id: 9,				},				{					id: 14,				},			],			images: [				{					src: 'http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_2_front.jpg',				},				{					src: 'http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_2_back.jpg',				},			],		},	],	update: [		{			id: 799,			default_attributes: [				{					id: 6,					name: 'Color',					option: 'Green',				},				{					id: 0,					name: 'Size',					option: 'M',				},			],		},	],	delete: [ 794 ],};WooCommerce.post( 'products/batch', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'create' => [        [            'name' => 'Woo Single #1',            'type' => 'simple',            'regular_price' => '21.99',            'virtual' => true,            'downloadable' => true,            'downloads' => [                [                    'name' => 'Woo Single',                    'file' => 'http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/cd_4_angle.jpg'                ]            ],            'categories' => [                [                    'id' => 11                ],                [                    'id' => 13                ]            ],            'images' => [                [                    'src' => 'http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/cd_4_angle.jpg'                ]            ]        ],        [            'name' => 'New Premium Quality',            'type' => 'simple',            'regular_price' => '21.99',            'description' => 'Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est. Mauris placerat eleifend leo.',            'short_description' => 'Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.',            'categories' => [                [                    'id' => 9                ],                [                    'id' => 14                ]            ],            'images' => [                [                    'src' => 'http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_2_front.jpg'                ],                [                    'src' => 'http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_2_back.jpg'                ]            ]        ]    ],    'update' => [        [            'id' => 799,            'default_attributes' => [                [                    'id' => 6,                    'name' => 'Color',                    'option' => 'Green'                ],                [                    'id' => 0,                    'name' => 'Size',                    'option' => 'M'                ]            ]        ]    ],    'delete' => [        794    ]];print_r($woocommerce->post('products/batch', $data));?>
```

```
data = {    "create": [        {            "name": "Woo Single #1",            "type": "simple",            "regular_price": "21.99",            "virtual": True,            "downloadable": True,            "downloads": [                {                    "name": "Woo Single",                    "file": "http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/cd_4_angle.jpg"                }            ],            "categories": [                {                    "id": 11                },                {                    "id": 13                }            ],            "images": [                {                    "src": "http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/cd_4_angle.jpg"                }            ]        },        {            "name": "New Premium Quality",            "type": "simple",            "regular_price": "21.99",            "description": "Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est. Mauris placerat eleifend leo.",            "short_description": "Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.",            "categories": [                {                    "id": 9                },                {                    "id": 14                }            ],            "images": [                {                    "src": "http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_2_front.jpg"                },                {                    "src": "http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_2_back.jpg"                }            ]        }    ],    "update": [        {            "id": 799,            "default_attributes": [                {                    "id": 6,                    "name": "Color,                    "option": "Green"                },                {                    "id": 0,                    "name": "Size",                    "option": "M"                }            ]        }    ],    "delete": [        794    ]}print(wcapi.post("products/batch", data).json())
```

```
data = {  create: [    {      name: "Woo Single #1",      type: "simple",      regular_price: "21.99",      virtual: true,      downloadable: true,      downloads: [        {          name: "Woo Single",          file: "http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/cd_4_angle.jpg"        }      ],      categories: [        {          id: 11        },        {          id: 13        }      ],      images: [        {          src: "http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/cd_4_angle.jpg"        }      ]    },    {      name: "New Premium Quality",      type: "simple",      regular_price: "21.99",      description: "Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est. Mauris placerat eleifend leo.",      short_description: "Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.",      categories: [        {          id: 9        },        {          id: 14        }      ],      images: [        {          src: "http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_2_front.jpg"        },        {          src: "http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_2_back.jpg"        }      ]    }  ],  update: [    {      id: 799,      default_attributes: [        {          id: 6,          name: "Color,          option: "Green"        },        {          id: 0,          name: "Size",          option: "M"        }      ]    }  ],  delete: [    794  ]}woocommerce.post("products/batch", data).parsed_response
```

```
{	"create": [		{			"id": 801,			"name": "Woo Single #1",			"slug": "woo-single-1-4",			"permalink": "https://example.com/product/woo-single-1-4/",			"date_created": "2017-03-23T17:35:43",			"date_created_gmt": "2017-03-23T20:35:43",			"date_modified": "2017-03-23T17:35:43",			"date_modified_gmt": "2017-03-23T20:35:43",			"type": "simple",			"status": "publish",			"featured": false,			"catalog_visibility": "visible",			"description": "",			"short_description": "",			"sku": "",			"price": "21.99",			"regular_price": "21.99",			"sale_price": "",			"date_on_sale_from": null,			"date_on_sale_from_gmt": null,			"date_on_sale_to": null,			"date_on_sale_to_gmt": null,			"price_html": "<span class=\"woocommerce-Price-amount amount\"><span class=\"woocommerce-Price-currencySymbol\">&#36;</span>21.99</span>",			"on_sale": false,			"purchasable": true,			"total_sales": 0,			"virtual": true,			"downloadable": true,			"downloads": [				{					"id": 0,					"name": "Woo Single",					"file": "http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/cd_4_angle.jpg"				}			],			"download_limit": -1,			"download_expiry": -1,			"external_url": "",			"button_text": "",			"tax_status": "taxable",			"tax_class": "",			"manage_stock": false,			"stock_quantity": null,			"stock_status": "instock",			"backorders": "no",			"backorders_allowed": false,			"backordered": false,			"sold_individually": false,			"weight": "",			"dimensions": {				"length": "",				"width": "",				"height": ""			},			"shipping_required": false,			"shipping_taxable": true,			"shipping_class": "",			"shipping_class_id": 0,			"reviews_allowed": true,			"average_rating": "0.00",			"rating_count": 0,			"related_ids": [ 588, 87, 573, 96, 329 ],			"upsell_ids": [],			"cross_sell_ids": [],			"parent_id": 0,			"purchase_note": "",			"categories": [				{					"id": 11,					"name": "Music",					"slug": "music"				},				{					"id": 13,					"name": "Singles",					"slug": "singles"				}			],			"tags": [],			"images": [				{					"id": 800,					"date_created": "2017-03-23T14:35:43",					"date_created_gmt": "2017-03-23T20:35:43",					"date_modified": "2017-03-23T14:35:43",					"date_modified_gmt": "2017-03-23T20:35:43",					"src": "https://example.com/wp-content/uploads/2017/03/cd_4_angle.jpg",					"name": "",					"alt": ""				}			],			"attributes": [],			"default_attributes": [],			"variations": [],			"grouped_products": [],			"menu_order": 0,			"meta_data": [],			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/801"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products"					}				]			}		},		{			"id": 804,			"name": "New Premium Quality",			"slug": "new-premium-quality",			"permalink": "https://example.com/product/new-premium-quality/",			"date_created": "2017-03-23T17:35:48",			"date_created_gmt": "2017-03-23T20:35:48",			"date_modified": "2017-03-23T17:35:48",			"date_modified_gmt": "2017-03-23T20:35:48",			"type": "simple",			"status": "publish",			"featured": false,			"catalog_visibility": "visible",			"description": "<p>Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est. Mauris placerat eleifend leo.</p>\n",			"short_description": "<p>Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.</p>\n",			"sku": "",			"price": "21.99",			"regular_price": "21.99",			"sale_price": "",			"date_on_sale_from": null,			"date_on_sale_from_gmt": null,			"date_on_sale_to": null,			"date_on_sale_to_gmt": null,			"price_html": "<span class=\"woocommerce-Price-amount amount\"><span class=\"woocommerce-Price-currencySymbol\">&#36;</span>21.99</span>",			"on_sale": false,			"purchasable": true,			"total_sales": 0,			"virtual": false,			"downloadable": false,			"downloads": [],			"download_limit": -1,			"download_expiry": -1,			"external_url": "",			"button_text": "",			"tax_status": "taxable",			"tax_class": "",			"manage_stock": false,			"stock_quantity": null,			"stock_status": "instock",			"backorders": "no",			"backorders_allowed": false,			"backordered": false,			"sold_individually": false,			"weight": "",			"dimensions": {				"length": "",				"width": "",				"height": ""			},			"shipping_required": true,			"shipping_taxable": true,			"shipping_class": "",			"shipping_class_id": 0,			"reviews_allowed": true,			"average_rating": "0.00",			"rating_count": 0,			"related_ids": [ 458, 56, 99, 34, 378 ],			"upsell_ids": [],			"cross_sell_ids": [],			"parent_id": 0,			"purchase_note": "",			"categories": [				{					"id": 9,					"name": "Clothing",					"slug": "clothing"				},				{					"id": 14,					"name": "T-shirts",					"slug": "t-shirts"				}			],			"tags": [],			"images": [				{					"id": 802,					"date_created": "2017-03-23T14:35:47",					"date_created_gmt": "2017-03-23T20:35:47",					"date_modified": "2017-03-23T14:35:47",					"date_modified_gmt": "2017-03-23T20:35:47",					"src": "https://example.com/wp-content/uploads/2017/03/T_2_front-5.jpg",					"name": "",					"alt": ""				},				{					"id": 803,					"date_created": "2017-03-23T14:35:48",					"date_created_gmt": "2017-03-23T20:35:48",					"date_modified": "2017-03-23T14:35:48",					"date_modified_gmt": "2017-03-23T20:35:48",					"src": "https://example.com/wp-content/uploads/2017/03/T_2_back-3.jpg",					"name": "",					"alt": ""				}			],			"attributes": [],			"default_attributes": [],			"variations": [],			"grouped_products": [],			"menu_order": 0,			"meta_data": [],			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/804"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products"					}				]			}		}	],	"update": [		{			"id": 799,			"name": "Ship Your Idea",			"slug": "ship-your-idea-22",			"permalink": "https://example.com/product/ship-your-idea-22/",			"date_created": "2017-03-23T17:03:12",			"date_created_gmt": "2017-03-23T20:03:12",			"date_modified": "2017-03-23T17:03:12",			"date_modified_gmt": "2017-03-23T20:03:12",			"type": "variable",			"status": "publish",			"featured": false,			"catalog_visibility": "visible",			"description": "<p>Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est. Mauris placerat eleifend leo.</p>\n",			"short_description": "<p>Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.</p>\n",			"sku": "",			"price": "",			"regular_price": "",			"sale_price": "",			"date_on_sale_from": null,			"date_on_sale_from_gmt": null,			"date_on_sale_to": null,			"date_on_sale_to_gmt": null,			"price_html": "",			"on_sale": false,			"purchasable": false,			"total_sales": 0,			"virtual": false,			"downloadable": false,			"downloads": [],			"download_limit": -1,			"download_expiry": -1,			"external_url": "",			"button_text": "",			"tax_status": "taxable",			"tax_class": "",			"manage_stock": false,			"stock_quantity": null,			"stock_status": "instock",			"backorders": "no",			"backorders_allowed": false,			"backordered": false,			"sold_individually": false,			"weight": "",			"dimensions": {				"length": "",				"width": "",				"height": ""			},			"shipping_required": true,			"shipping_taxable": true,			"shipping_class": "",			"shipping_class_id": 0,			"reviews_allowed": true,			"average_rating": "0.00",			"rating_count": 0,			"related_ids": [ 414, 40, 34, 463, 15 ],			"upsell_ids": [],			"cross_sell_ids": [],			"parent_id": 0,			"purchase_note": "",			"categories": [				{					"id": 9,					"name": "Clothing",					"slug": "clothing"				},				{					"id": 14,					"name": "T-shirts",					"slug": "t-shirts"				}			],			"tags": [],			"images": [				{					"id": 795,					"date_created": "2017-03-23T14:03:08",					"date_created_gmt": "2017-03-23T20:03:08",					"date_modified": "2017-03-23T14:03:08",					"date_modified_gmt": "2017-03-23T20:03:08",					"src": "https://example.com/wp-content/uploads/2017/03/T_4_front-11.jpg",					"name": "",					"alt": ""				},				{					"id": 796,					"date_created": "2017-03-23T14:03:09",					"date_created_gmt": "2017-03-23T20:03:09",					"date_modified": "2017-03-23T14:03:09",					"date_modified_gmt": "2017-03-23T20:03:09",					"src": "https://example.com/wp-content/uploads/2017/03/T_4_back-10.jpg",					"name": "",					"alt": ""				},				{					"id": 797,					"date_created": "2017-03-23T14:03:10",					"date_created_gmt": "2017-03-23T20:03:10",					"date_modified": "2017-03-23T14:03:10",					"date_modified_gmt": "2017-03-23T20:03:10",					"src": "https://example.com/wp-content/uploads/2017/03/T_3_front-10.jpg",					"name": "",					"alt": ""				},				{					"id": 798,					"date_created": "2017-03-23T14:03:11",					"date_created_gmt": "2017-03-23T20:03:11",					"date_modified": "2017-03-23T14:03:11",					"date_modified_gmt": "2017-03-23T20:03:11",					"src": "https://example.com/wp-content/uploads/2017/03/T_3_back-10.jpg",					"name": "",					"alt": ""				}			],			"attributes": [				{					"id": 6,					"name": "Color",					"position": 0,					"visible": false,					"variation": true,					"options": [ "Black", "Green" ]				},				{					"id": 0,					"name": "Size",					"position": 0,					"visible": true,					"variation": true,					"options": [ "S", "M" ]				}			],			"default_attributes": [				{					"id": 6,					"name": "Color",					"option": "green"				},				{					"id": 0,					"name": "Size",					"option": "M"				}			],			"variations": [],			"grouped_products": [],			"menu_order": 0,			"meta_data": [],			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/799"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products"					}				]			}		}	],	"delete": [		{			"id": 794,			"name": "Premium Quality",			"slug": "premium-quality-19",			"permalink": "https://example.com/product/premium-quality-19/",			"date_created": "2017-03-23T17:01:14",			"date_created_gmt": "2017-03-23T20:01:14",			"date_modified": "2017-03-23T17:01:14",			"date_modified_gmt": "2017-03-23T20:01:14",			"type": "simple",			"status": "publish",			"featured": false,			"catalog_visibility": "visible",			"description": "<p>Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est. Mauris placerat eleifend leo.</p>\n",			"short_description": "<p>Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.</p>\n",			"sku": "",			"price": "24.54",			"regular_price": "24.54",			"sale_price": "",			"date_on_sale_from": null,			"date_on_sale_from_gmt": null,			"date_on_sale_to": null,			"date_on_sale_to_gmt": null,			"price_html": "<span class=\"woocommerce-Price-amount amount\"><span class=\"woocommerce-Price-currencySymbol\">&#36;</span>24.54</span>",			"on_sale": false,			"purchasable": true,			"total_sales": 0,			"virtual": false,			"downloadable": false,			"downloads": [],			"download_limit": -1,			"download_expiry": -1,			"external_url": "",			"button_text": "",			"tax_status": "taxable",			"tax_class": "",			"manage_stock": false,			"stock_quantity": null,			"stock_status": "instock",			"backorders": "no",			"backorders_allowed": false,			"backordered": false,			"sold_individually": false,			"weight": "",			"dimensions": {				"length": "",				"width": "",				"height": ""			},			"shipping_required": true,			"shipping_taxable": true,			"shipping_class": "",			"shipping_class_id": 0,			"reviews_allowed": true,			"average_rating": "0.00",			"rating_count": 0,			"related_ids": [ 369, 56, 378, 31, 22 ],			"upsell_ids": [],			"cross_sell_ids": [],			"parent_id": 0,			"purchase_note": "",			"categories": [				{					"id": 9,					"name": "Clothing",					"slug": "clothing"				},				{					"id": 14,					"name": "T-shirts",					"slug": "t-shirts"				}			],			"tags": [],			"images": [				{					"id": 792,					"date_created": "2017-03-23T14:01:13",					"date_created_gmt": "2017-03-23T20:01:13",					"date_modified": "2017-03-23T14:01:13",					"date_modified_gmt": "2017-03-23T20:01:13",					"src": "https://example.com/wp-content/uploads/2017/03/T_2_front-4.jpg",					"name": "",					"alt": ""				},				{					"id": 793,					"date_created": "2017-03-23T14:01:14",					"date_created_gmt": "2017-03-23T20:01:14",					"date_modified": "2017-03-23T14:01:14",					"date_modified_gmt": "2017-03-23T20:01:14",					"src": "https://example.com/wp-content/uploads/2017/03/T_2_back-2.jpg",					"name": "",					"alt": ""				}			],			"attributes": [],			"default_attributes": [],			"variations": [],			"grouped_products": [],			"menu_order": 0,			"meta_data": [],			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/794"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products"					}				]			}		}	]}
```

---

<a name="product-variations"></a>

The product variations API allows you to create, view, update, and delete individual, or a batch, of product variations.


## Product variation properties[​](/docs/apis/rest-api/v3/product-variations#product-variation-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Unique identifier for the resource. READ-ONLY |
| date_created | date-time | The date the variation was created, in the site's timezone. READ-ONLY |
| date_created_gmt | date-time | The date the variation was created, as GMT. READ-ONLY |
| date_modified | date-time | The date the variation was last modified, in the site's timezone. READ-ONLY |
| date_modified_gmt | date-time | The date the variation was last modified, as GMT. READ-ONLY |
| description | string | Variation description. |
| permalink | string | Variation URL. READ-ONLY |
| sku | string | Unique identifier. |
| global_unique_id | string | GTIN, UPC, EAN or ISBN. A global unique identifier for the variation. |
| price | string | Current variation price. READ-ONLY |
| regular_price | string | Variation regular price. |
| sale_price | string | Variation sale price. |
| date_on_sale_from | date-time | Start date of sale price, in the site's timezone. |
| date_on_sale_from_gmt | date-time | Start date of sale price, as GMT. |
| date_on_sale_to | date-time | End date of sale price, in the site's timezone. |
| date_on_sale_to_gmt | date-time | End date of sale price, as GMT. |
| on_sale | boolean | Shows if the variation is on sale. READ-ONLY |
| status | string | Variation status. Options: draft, pending, private and publish. Default is publish. |
| purchasable | boolean | Shows if the variation can be bought. READ-ONLY |
| virtual | boolean | If the variation is virtual. Default is false. |
| downloadable | boolean | If the variation is downloadable. Default is false. |
| downloads | array | List of downloadable files. See Product variation - Downloads properties |
| download_limit | integer | Number of times downloadable files can be downloaded after purchase. Default is -1. |
| download_expiry | integer | Number of days until access to downloadable files expires. Default is -1. |
| tax_status | string | Tax status. Options: taxable, shipping and none. Default is taxable. |
| tax_class | string | Tax class. |
| manage_stock | boolean, string | Stock management at variation level. Possible values are either a boolean or parent. Default is false. |
| stock_quantity | integer | Stock quantity. |
| stock_status | string | Controls the stock status of the product. Options: instock, outofstock, onbackorder. Default is instock. |
| backorders | string | If managing stock, this controls if backorders are allowed. Options: no, notify and yes. Default is no. |
| backorders_allowed | boolean | Shows if backorders are allowed. READ-ONLY |
| backordered | boolean | Shows if the variation is on backordered. READ-ONLY |
| weight | string | Variation weight. |
| dimensions | object | Variation dimensions. See Product variation - Dimensions properties |
| shipping_class | string | Shipping class slug. |
| shipping_class_id | string | Shipping class ID. READ-ONLY |
| image | object | Variation image data. See Product variation - Image properties |
| gallery_image_ids | array | Variation gallery image IDs, excluding the featured image (which is set via image). |
| attributes | array | List of attributes. See Product variation - Attributes properties |
| menu_order | integer | Menu order, used to custom sort products. |
| meta_data | array | Meta data. See Product variation - Meta data properties |


### Product variation - Downloads properties[​](/docs/apis/rest-api/v3/product-variations#product-variation---downloads-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | string | File ID. |
| name | string | File name. |
| file | string | File URL. |


### Product variation - Dimensions properties[​](/docs/apis/rest-api/v3/product-variations#product-variation---dimensions-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| length | string | Variation length. |
| width | string | Variation width. |
| height | string | Variation height. |


### Product variation - Image properties[​](/docs/apis/rest-api/v3/product-variations#product-variation---image-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Image ID. |
| date_created | date-time | The date the image was created, in the site's timezone. READ-ONLY |
| date_created_gmt | date-time | The date the image was created, as GMT. READ-ONLY |
| date_modified | date-time | The date the image was last modified, in the site's timezone. READ-ONLY |
| date_modified_gmt | date-time | The date the image was last modified, as GMT. READ-ONLY |
| src | string | Image URL. |
| name | string | Image name. |
| alt | string | Image alternative text. |


### Product variation - Attributes properties[​](/docs/apis/rest-api/v3/product-variations#product-variation---attributes-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Attribute ID. |
| name | string | Attribute name. |
| option | string | Selected attribute term name. |


### Product variation - Meta data properties[​](/docs/apis/rest-api/v3/product-variations#product-variation---meta-data-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Meta ID. READ-ONLY |
| key | string | Meta key. |
| value | string | Meta value. |


## Create a product variation[​](/docs/apis/rest-api/v3/product-variations#create-a-product-variation)


This API helps you to create a new product variation.


```
POST /wp-json/wc/v3/products/<product_id>/variations
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/products/22/variations \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "regular_price": "9.00",  "image": {    "id": 423  },  "attributes": [    {      "id": 6,      "option": "Black"    }  ]}'
```

```
const data = {	regular_price: '9.00',	image: {		id: 423,	},	attributes: [		{			id: 9,			option: 'Black',		},	],};WooCommerce.post( 'products/22/variations', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'regular_price' => '9.00',    'image' => [        'id' => 423    ],    'attributes' => [        [            'id' => 9,            'option' => 'Black'        ]    ]];print_r($woocommerce->post('products/22/variations', $data));?>
```

```
data = {    "regular_price": "9.00",    "image": {        "id": 423    },    "attributes": [        {            "id": 9,            "option": "Black"        }    ]}print(wcapi.post("products/22/variations", data).json())
```

```
data = {  regular_price: "9.00",  image: {    id: 423  },  attributes: [    {      id: 9,      option: "Black"    }  ]}woocommerce.post("products/22/variations", data).parsed_response
```

```
{	"id": 732,	"date_created": "2017-03-23T00:36:38",	"date_created_gmt": "2017-03-23T03:36:38",	"date_modified": "2017-03-23T00:36:38",	"date_modified_gmt": "2017-03-23T03:36:38",	"description": "",	"permalink": "https://example.com/product/ship-your-idea/?attribute_pa_color=black",	"sku": "",	"price": "9.00",	"regular_price": "9.00",	"sale_price": "",	"date_on_sale_from": null,	"date_on_sale_from_gmt": null,	"date_on_sale_to": null,	"date_on_sale_to_gmt": null,	"on_sale": false,	"status": true,	"purchasable": true,	"virtual": false,	"downloadable": false,	"downloads": [],	"download_limit": -1,	"download_expiry": -1,	"tax_status": "taxable",	"tax_class": "",	"manage_stock": false,	"stock_quantity": null,	"stock_status": "instock",	"backorders": "no",	"backorders_allowed": false,	"backordered": false,	"weight": "",	"dimensions": {		"length": "",		"width": "",		"height": ""	},	"shipping_class": "",	"shipping_class_id": 0,	"image": {		"id": 423,		"date_created": "2016-10-19T12:21:14",		"date_created_gmt": "2016-10-19T16:21:14",		"date_modified": "2016-10-19T12:21:14",		"date_modified_gmt": "2016-10-19T16:21:14",		"src": "https://example.com/wp-content/uploads/2016/10/T_4_front-12.jpg",		"name": "",		"alt": ""	},	"gallery_image_ids": [],	"attributes": [		{			"id": 6,			"name": "Color",			"option": "Black"		}	],	"menu_order": 0,	"meta_data": [],	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/products/22/variations/732"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/products/22/variations"			}		],		"up": [			{				"href": "https://example.com/wp-json/wc/v3/products/22"			}		]	}}
```


## Retrieve a product variation[​](/docs/apis/rest-api/v3/product-variations#retrieve-a-product-variation)


This API lets you retrieve and view a specific product variation by ID.


```
GET /wp-json/wc/v3/products/<product_id>/variations/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/products/22/variations/732 \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'products/22/variations/732' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('products/22/variations/732')); ?>
```

```
print(wcapi.get("products/22/variations/732").json())
```

```
woocommerce.get("products/22/variations/732").parsed_response
```

```
{	"id": 732,	"date_created": "2017-03-23T00:36:38",	"date_created_gmt": "2017-03-23T03:36:38",	"date_modified": "2017-03-23T00:36:38",	"date_modified_gmt": "2017-03-23T03:36:38",	"description": "",	"permalink": "https://example.com/product/ship-your-idea/?attribute_pa_color=black",	"sku": "",	"price": "9.00",	"regular_price": "9.00",	"sale_price": "",	"date_on_sale_from": null,	"date_on_sale_from_gmt": null,	"date_on_sale_to": null,	"date_on_sale_to_gmt": null,	"on_sale": false,	"status": "publish",	"purchasable": true,	"virtual": false,	"downloadable": false,	"downloads": [],	"download_limit": -1,	"download_expiry": -1,	"tax_status": "taxable",	"tax_class": "",	"manage_stock": false,	"stock_quantity": null,	"stock_status": "instock",	"backorders": "no",	"backorders_allowed": false,	"backordered": false,	"weight": "",	"dimensions": {		"length": "",		"width": "",		"height": ""	},	"shipping_class": "",	"shipping_class_id": 0,	"image": {		"id": 423,		"date_created": "2016-10-19T12:21:14",		"date_created_gmt": "2016-10-19T16:21:14",		"date_modified": "2016-10-19T12:21:14",		"date_modified_gmt": "2016-10-19T16:21:14",		"src": "https://example.com/wp-content/uploads/2016/10/T_4_front-12.jpg",		"name": "",		"alt": ""	},	"gallery_image_ids": [],	"attributes": [		{			"id": 6,			"name": "Color",			"option": "Black"		}	],	"menu_order": 0,	"meta_data": [],	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/products/22/variations/732"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/products/22/variations"			}		],		"up": [			{				"href": "https://example.com/wp-json/wc/v3/products/22"			}		]	}}
```


## List all product variations[​](/docs/apis/rest-api/v3/product-variations#list-all-product-variations)


This API helps you to view all the product variations.


```
GET /wp-json/wc/v3/products/<product_id>/variations
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/products/22/variations \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'products/22/variations' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('products/22/variations')); ?>
```

```
print(wcapi.get("products/22/variations").json())
```

```
woocommerce.get("products/22/variations").parsed_response
```

```
[	{		"id": 733,		"date_created": "2017-03-23T00:53:11",		"date_created_gmt": "2017-03-23T03:53:11",		"date_modified": "2017-03-23T00:53:11",		"date_modified_gmt": "2017-03-23T03:53:11",		"description": "",		"permalink": "https://example.com/product/ship-your-idea/?attribute_pa_color=green",		"sku": "",		"price": "9.00",		"regular_price": "9.00",		"sale_price": "",		"date_on_sale_from": null,		"date_on_sale_from_gmt": null,		"date_on_sale_to": null,		"date_on_sale_to_gmt": null,		"on_sale": false,		"status": "publish",		"purchasable": true,		"virtual": false,		"downloadable": false,		"downloads": [],		"download_limit": -1,		"download_expiry": -1,		"tax_status": "taxable",		"tax_class": "",		"manage_stock": false,		"stock_quantity": null,		"stock_status": "instock",		"backorders": "no",		"backorders_allowed": false,		"backordered": false,		"weight": "",		"dimensions": {			"length": "",			"width": "",			"height": ""		},		"shipping_class": "",		"shipping_class_id": 0,		"image": {			"id": 425,			"date_created": "2016-10-19T12:21:16",			"date_created_gmt": "2016-10-19T16:21:16",			"date_modified": "2016-10-19T12:21:16",			"date_modified_gmt": "2016-10-19T16:21:16",			"src": "https://example.com/wp-content/uploads/2016/10/T_3_front-12.jpg",			"name": "",			"alt": ""		},		"gallery_image_ids": [],		"attributes": [			{				"id": 6,				"name": "Color",				"option": "Green"			}		],		"menu_order": 0,		"meta_data": [],		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/products/22/variations/733"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/products/22/variations"				}			],			"up": [				{					"href": "https://example.com/wp-json/wc/v3/products/22"				}			]		}	},	{		"id": 732,		"date_created": "2017-03-23T00:36:38",		"date_created_gmt": "2017-03-23T03:36:38",		"date_modified": "2017-03-23T00:36:38",		"date_modified_gmt": "2017-03-23T03:36:38",		"description": "",		"permalink": "https://example.com/product/ship-your-idea/?attribute_pa_color=black",		"sku": "",		"price": "9.00",		"regular_price": "9.00",		"sale_price": "",		"date_on_sale_from": null,		"date_on_sale_from_gmt": null,		"date_on_sale_to": null,		"date_on_sale_to_gmt": null,		"on_sale": false,		"status": "publish",		"purchasable": true,		"virtual": false,		"downloadable": false,		"downloads": [],		"download_limit": -1,		"download_expiry": -1,		"tax_status": "taxable",		"tax_class": "",		"manage_stock": false,		"stock_quantity": null,		"stock_status": "instock",		"backorders": "no",		"backorders_allowed": false,		"backordered": false,		"weight": "",		"dimensions": {			"length": "",			"width": "",			"height": ""		},		"shipping_class": "",		"shipping_class_id": 0,		"image": {			"id": 423,			"date_created": "2016-10-19T12:21:14",			"date_created_gmt": "2016-10-19T16:21:14",			"date_modified": "2016-10-19T12:21:14",			"date_modified_gmt": "2016-10-19T16:21:14",			"src": "https://example.com/wp-content/uploads/2016/10/T_4_front-12.jpg",			"name": "",			"alt": ""		},		"gallery_image_ids": [],		"attributes": [			{				"id": 6,				"name": "Color",				"option": "Black"			}		],		"menu_order": 0,		"meta_data": [],		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/products/22/variations/732"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/products/22/variations"				}			],			"up": [				{					"href": "https://example.com/wp-json/wc/v3/products/22"				}			]		}	}]
```


#### Available parameters[​](/docs/apis/rest-api/v3/product-variations#available-parameters)


| Parameter | Type | Description |
| --- | --- | --- |
| context | string | Scope under which the request is made; determines fields present in response. Options: view and edit. Default is view. |
| page | integer | Current page of the collection. Default is 1. |
| per_page | integer | Maximum number of items to be returned in result set. Default is 10. |
| search | string | Limit results to those matching a string. |
| after | string | Limit response to resources published after a given ISO8601 compliant date. |
| before | string | Limit response to resources published before a given ISO8601 compliant date. |
| dates_are_gmt | boolean | Interpret after and before as UTC dates when true. |
| exclude | array | Ensure result set excludes specific IDs. |
| include | array | Limit result set to specific ids. |
| offset | integer | Offset the result set by a specific number of items. |
| order | string | Order sort attribute ascending or descending. Options: asc and desc. Default is desc. |
| orderby | string | Sort collection by object attribute. Options: date, modified, id, include, title and slug. Default is date. |
| parent | array | Limit result set to those of particular parent IDs. |
| parent_exclude | array | Limit result set to all items except those of a particular parent ID. |
| slug | string | Limit result set to products with a specific slug. |
| status | string | Limit result set to products assigned a specific status. Options: any, draft, pending, private and publish. Default is any. |
| include_status | string | Limit result set to product variations with any of the specified statuses. Multiple statuses can be provided as a comma-separated list. Takes precedence over the status parameter. Options: any, future, trash, draft, pending, private, and publish. |
| exclude_status | string | Exclude product variations from result set with any of the specified statuses. Multiple statuses can be provided as a comma-separated list. Takes precedence over the include_status parameter. Options: future, trash, draft, pending, private, and publish. |
| sku | string | Limit result set to products with a specific SKU. |
| tax_class | string | Limit result set to products with a specific tax class. Default options: standard, reduced-rate and zero-rate. |
| on_sale | boolean | Limit result set to products on sale. |
| min_price | string | Limit result set to products based on a minimum price. |
| max_price | string | Limit result set to products based on a maximum price. |
| stock_status | string | Limit result set to products with specified stock status. Options: instock, outofstock and onbackorder. |
| virtual | boolean | Limit result set to virtual product variations |
| downloadable | boolean | Limit result set to downloadable product variations. |


## Update a product variation[​](/docs/apis/rest-api/v3/product-variations#update-a-product-variation)


This API lets you make changes to a product variation.


```
PUT /wp-json/wc/v3/products/<product_id>/variations/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X PUT https://example.com/wp-json/wc/v3/products/22/variations/733 \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "regular_price": "10.00"}'
```

```
const data = {	regular_price: '10.00',};WooCommerce.put( 'products/22/variations/733', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'regular_price' => '10.00'];print_r($woocommerce->put('products/22/variations/733', $data));?>
```

```
data = {    "regular_price": "10.00"}print(wcapi.put("products/22/variations/733", data).json())
```

```
data = {  regular_price: "10.00"}woocommerce.put("products/22/variations/733", data).parsed_response
```

```
{	"id": 733,	"date_created": "2017-03-23T00:53:11",	"date_created_gmt": "2017-03-23T03:53:11",	"date_modified": "2017-03-23T00:53:11",	"date_modified_gmt": "2017-03-23T03:53:11",	"description": "",	"permalink": "https://example.com/product/ship-your-idea/?attribute_pa_color=green",	"sku": "",	"price": "10.00",	"regular_price": "10.00",	"sale_price": "",	"date_on_sale_from": null,	"date_on_sale_from_gmt": null,	"date_on_sale_to": null,	"date_on_sale_to_gmt": null,	"on_sale": false,	"status": "publish",	"purchasable": true,	"virtual": false,	"downloadable": false,	"downloads": [],	"download_limit": -1,	"download_expiry": -1,	"tax_status": "taxable",	"tax_class": "",	"manage_stock": false,	"stock_quantity": null,	"stock_status": "instock",	"backorders": "no",	"backorders_allowed": false,	"backordered": false,	"weight": "",	"dimensions": {		"length": "",		"width": "",		"height": ""	},	"shipping_class": "",	"shipping_class_id": 0,	"image": {		"id": 425,		"date_created": "2016-10-19T12:21:16",		"date_created_gmt": "2016-10-19T16:21:16",		"date_modified": "2016-10-19T12:21:16",		"date_modified_gmt": "2016-10-19T16:21:16",		"src": "https://example.com/wp-content/uploads/2016/10/T_3_front-12.jpg",		"name": "",		"alt": ""	},	"gallery_image_ids": [],	"attributes": [		{			"id": 6,			"name": "Color",			"option": "Green"		}	],	"menu_order": 0,	"meta_data": [],	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/products/22/variations/733"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/products/22/variations"			}		],		"up": [			{				"href": "https://example.com/wp-json/wc/v3/products/22"			}		]	}}
```


## Delete a product variation[​](/docs/apis/rest-api/v3/product-variations#delete-a-product-variation)


This API helps you delete a product variation.


```
DELETE /wp-json/wc/v3/products/<product_id>/variations/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X DELETE https://example.com/wp-json/wc/v3/products/22/variations/733?force=true \	-u consumer_key:consumer_secret
```

```
WooCommerce.delete( 'products/22/variations/733', {	force: true,} )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->delete('products/22/variations/733', ['force' => true])); ?>
```

```
print(wcapi.delete("products/22/variations/733", params={"force": True}).json())
```

```
woocommerce.delete("products/22/variations/733", force: true).parsed_response
```

```
{	"id": 733,	"date_created": "2017-03-23T00:53:11",	"date_created_gmt": "2017-03-23T03:53:11",	"date_modified": "2017-03-23T00:53:11",	"date_modified_gmt": "2017-03-23T03:53:11",	"description": "",	"permalink": "https://example.com/product/ship-your-idea/?attribute_pa_color=green",	"sku": "",	"price": "10.00",	"regular_price": "10.00",	"sale_price": "",	"date_on_sale_from": null,	"date_on_sale_from_gmt": null,	"date_on_sale_to": null,	"date_on_sale_to_gmt": null,	"on_sale": false,	"status": "publish",	"purchasable": true,	"virtual": false,	"downloadable": false,	"downloads": [],	"download_limit": -1,	"download_expiry": -1,	"tax_status": "taxable",	"tax_class": "",	"manage_stock": false,	"stock_quantity": null,	"stock_status": "instock",	"backorders": "no",	"backorders_allowed": false,	"backordered": false,	"weight": "",	"dimensions": {		"length": "",		"width": "",		"height": ""	},	"shipping_class": "",	"shipping_class_id": 0,	"image": {		"id": 425,		"date_created": "2016-10-19T12:21:16",		"date_created_gmt": "2016-10-19T16:21:16",		"date_modified": "2016-10-19T12:21:16",		"date_modified_gmt": "2016-10-19T16:21:16",		"src": "https://example.com/wp-content/uploads/2016/10/T_3_front-12.jpg",		"name": "",		"alt": ""	},	"gallery_image_ids": [],	"attributes": [		{			"id": 6,			"name": "Color",			"option": "Green"		}	],	"menu_order": 0,	"meta_data": [],	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/products/22/variations/733"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/products/22/variations"			}		],		"up": [			{				"href": "https://example.com/wp-json/wc/v3/products/22"			}		]	}}
```


#### Available parameters[​](/docs/apis/rest-api/v3/product-variations#available-parameters-1)


| Parameter | Type | Description |
| --- | --- | --- |
| force | string | Required to be true, as resource does not support trashing. |


## Batch update product variations[​](/docs/apis/rest-api/v3/product-variations#batch-update-product-variations)


This API helps you to batch create, update and delete multiple product variations.

note
Note: By default it's limited to up to 100 objects to be created, updated or
deleted.


```
POST /wp-json/wc/v3/products/<product_id>/variations/batch
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/products/22/variations/batch \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "create": [    {      "regular_price": "10.00",      "attributes": [        {          "id": 6,          "option": "Blue"        }      ]    },    {      "regular_price": "10.00",      "attributes": [        {          "id": 6,          "option": "White"        }      ]    }  ],  "update": [    {      "id": 733,      "regular_price": "10.00"    }  ],  "delete": [    732  ]}'
```

```
const data = {	create: [		{			regular_price: '10.00',			attributes: [				{					id: 6,					option: 'Blue',				},			],		},		{			regular_price: '10.00',			attributes: [				{					id: 6,					option: 'White',				},			],		},	],	update: [		{			id: 733,			regular_price: '10.00',		},	],	delete: [ 732 ],};WooCommerce.post( 'products/22/variations/batch', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'create' => [        [            'regular_price' => '10.00',            'attributes' => [                [                    'id' => 6,                    'option' => 'Blue'                ]            ]        ],        [            'regular_price' => '10.00',            'attributes' => [                [                    'id' => 6,                    'option' => 'White'                ]            ]        ]    ],    'update' => [        [            'id' => 733,            'regular_price' => '10.00'        ]    ],    'delete' => [        732    ]];print_r($woocommerce->post('products/22/variations/batch', $data));?>
```

```
data = {    "create": [        {            "regular_price": "10.00",            "attributes": [                {                    "id": 6,                    "option": "Blue"                }            ]        },        {            "regular_price": "10.00",            "attributes": [                {                    "id": 6,                    "option": "White"                }            ]        }    ],    "update": [        {            "id": 733,            "regular_price": "10.00"        }    ],    "delete": [        732    ]}print(wcapi.post("products/22/variations/batch", data).json())
```

```
data = {  create: [    {      regular_price: "10.00",      attributes: [        {          id: 6,          option: "Blue"        }      ]    },    {      regular_price: "10.00",      attributes: [        {          id: 6,          option: "White"        }      ]    }  ],  update: [    {      id: 733,      regular_price: "10.00"    }  ],  delete: [    732  ]}woocommerce.post("products/22/variations/batch", data).parsed_response
```

```
{	"create": [		{			"id": 735,			"date_created": "2017-03-23T01:19:37",			"date_created_gmt": "2017-03-23T04:19:37",			"date_modified": "2017-03-23T01:19:37",			"date_modified_gmt": "2017-03-23T04:19:37",			"description": "",			"permalink": "https://example.com/product/ship-your-idea/?attribute_pa_color=blue",			"sku": "",			"price": "10.00",			"regular_price": "10.00",			"sale_price": "",			"date_on_sale_from": null,			"date_on_sale_from_gmt": null,			"date_on_sale_to": null,			"date_on_sale_to_gmt": null,			"on_sale": false,			"status": "publish",			"purchasable": true,			"virtual": false,			"downloadable": false,			"downloads": [],			"download_limit": -1,			"download_expiry": -1,			"tax_status": "taxable",			"tax_class": "",			"manage_stock": false,			"stock_quantity": null,			"stock_status": "instock",			"backorders": "no",			"backorders_allowed": false,			"backordered": false,			"weight": "",			"dimensions": {				"length": "",				"width": "",				"height": ""			},			"shipping_class": "",			"shipping_class_id": 0,			"image": {				"id": 0,				"date_created": "2017-03-22T22:19:40",				"date_created_gmt": "2017-03-23T04:19:40",				"date_modified": "2017-03-22T22:19:40",				"date_modified_gmt": "2017-03-23T04:19:40",				"src": "https://example.com/wp-content/plugins/woocommerce/assets/images/placeholder.png",				"name": "Placeholder",				"alt": "Placeholder"			},			"gallery_image_ids": [],			"attributes": [				{					"id": 6,					"name": "Color",					"option": "Blue"				}			],			"menu_order": 0,			"meta_data": [],			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/22/variations/735"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products/22/variations"					}				],				"up": [					{						"href": "https://example.com/wp-json/wc/v3/products/22"					}				]			}		},		{			"id": 736,			"date_created": "2017-03-23T01:19:40",			"date_created_gmt": "2017-03-23T04:19:40",			"date_modified": "2017-03-23T01:19:40",			"date_modified_gmt": "2017-03-23T04:19:40",			"description": "",			"permalink": "https://example.com/product/ship-your-idea/?attribute_pa_color=white",			"sku": "",			"price": "10.00",			"regular_price": "10.00",			"sale_price": "",			"date_on_sale_from": null,			"date_on_sale_from_gmt": null,			"date_on_sale_to": null,			"date_on_sale_to_gmt": null,			"on_sale": false,			"status": "publish",			"purchasable": true,			"virtual": false,			"downloadable": false,			"downloads": [],			"download_limit": -1,			"download_expiry": -1,			"tax_status": "taxable",			"tax_class": "",			"manage_stock": false,			"stock_quantity": null,			"stock_status": "instock",			"backorders": "no",			"backorders_allowed": false,			"backordered": false,			"weight": "",			"dimensions": {				"length": "",				"width": "",				"height": ""			},			"shipping_class": "",			"shipping_class_id": 0,			"image": {				"id": 0,				"date_created": "2017-03-22T22:19:42",				"date_created_gmt": "2017-03-23T04:19:42",				"date_modified": "2017-03-22T22:19:42",				"date_modified_gmt": "2017-03-23T04:19:42",				"src": "https://example.com/wp-content/plugins/woocommerce/assets/images/placeholder.png",				"name": "Placeholder",				"alt": "Placeholder"			},			"gallery_image_ids": [],			"attributes": [				{					"id": 6,					"name": "Color",					"option": "White"				}			],			"menu_order": 0,			"meta_data": [],			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/22/variations/736"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products/22/variations"					}				],				"up": [					{						"href": "https://example.com/wp-json/wc/v3/products/22"					}				]			}		}	],	"update": [		{			"id": 733,			"date_created": "2017-03-23T00:53:11",			"date_created_gmt": "2017-03-23T03:53:11",			"date_modified": "2017-03-23T00:53:11",			"date_modified_gmt": "2017-03-23T03:53:11",			"description": "",			"permalink": "https://example.com/product/ship-your-idea/?attribute_pa_color=green",			"sku": "",			"price": "10.00",			"regular_price": "10.00",			"sale_price": "",			"date_on_sale_from": null,			"date_on_sale_from_gmt": null,			"date_on_sale_to": null,			"date_on_sale_to_gmt": null,			"on_sale": false,			"status": "publish",			"purchasable": true,			"virtual": false,			"downloadable": false,			"downloads": [],			"download_limit": -1,			"download_expiry": -1,			"tax_status": "taxable",			"tax_class": "",			"manage_stock": false,			"stock_quantity": null,			"stock_status": "instock",			"backorders": "no",			"backorders_allowed": false,			"backordered": false,			"weight": "",			"dimensions": {				"length": "",				"width": "",				"height": ""			},			"shipping_class": "",			"shipping_class_id": 0,			"image": {				"id": 425,				"date_created": "2016-10-19T12:21:16",				"date_created_gmt": "2016-10-19T16:21:16",				"date_modified": "2016-10-19T12:21:16",				"date_modified_gmt": "2016-10-19T16:21:16",				"src": "https://example.com/wp-content/uploads/2016/10/T_3_front-12.jpg",				"name": "",				"alt": ""			},			"gallery_image_ids": [],			"attributes": [				{					"id": 6,					"name": "Color",					"option": "Green"				}			],			"menu_order": 0,			"meta_data": [],			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/22/variations/733"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products/22/variations"					}				],				"up": [					{						"href": "https://example.com/wp-json/wc/v3/products/22"					}				]			}		}	],	"delete": [		{			"id": 732,			"date_created": "2017-03-23T00:36:38",			"date_created_gmt": "2017-03-23T03:36:38",			"date_modified": "2017-03-23T00:36:38",			"date_modified_gmt": "2017-03-23T03:36:38",			"description": "",			"permalink": "https://example.com/product/ship-your-idea/?attribute_pa_color=black",			"sku": "",			"price": "9.00",			"regular_price": "9.00",			"sale_price": "",			"date_on_sale_from": null,			"date_on_sale_from_gmt": null,			"date_on_sale_to": null,			"date_on_sale_to_gmt": null,			"on_sale": false,			"status": "publish",			"purchasable": true,			"virtual": false,			"downloadable": false,			"downloads": [],			"download_limit": -1,			"download_expiry": -1,			"tax_status": "taxable",			"tax_class": "",			"manage_stock": false,			"stock_quantity": null,			"stock_status": "instock",			"backorders": "no",			"backorders_allowed": false,			"backordered": false,			"weight": "",			"dimensions": {				"length": "",				"width": "",				"height": ""			},			"shipping_class": "",			"shipping_class_id": 0,			"image": {				"id": 423,				"date_created": "2016-10-19T12:21:14",				"date_created_gmt": "2016-10-19T16:21:14",				"date_modified": "2016-10-19T12:21:14",				"date_modified_gmt": "2016-10-19T16:21:14",				"src": "https://example.com/wp-content/uploads/2016/10/T_4_front-12.jpg",				"name": "",				"alt": ""			},			"gallery_image_ids": [],			"attributes": [				{					"id": 6,					"name": "Color",					"option": "Black"				}			],			"menu_order": 0,			"meta_data": [],			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/22/variations/732"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products/22/variations"					}				],				"up": [					{						"href": "https://example.com/wp-json/wc/v3/products/22"					}				]			}		}	]}
```

---

<a name="product-attributes"></a>

The product attributes API allows you to create, view, update, and delete individual, or a batch, of product attributes.


## Product attribute properties[​](/docs/apis/rest-api/v3/product-attributes#product-attribute-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Unique identifier for the resource. READ-ONLY |
| name | string | Attribute name. MANDATORY |
| slug | string | An alphanumeric identifier for the resource unique to its type. |
| type | string | Type of attribute. By default only select is supported. |
| order_by | string | Default sort order. Options: menu_order, name, name_num and id. Default is menu_order. |
| has_archives | boolean | Enable/Disable attribute archives. Default is false. |


## Create a product attribute[​](/docs/apis/rest-api/v3/product-attributes#create-a-product-attribute)


This API helps you to create a new product attribute.


```
POST /wp-json/wc/v3/products/attributes
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/products/attributes \    -u consumer_key:consumer_secret \    -H "Content-Type: application/json" \    -d '{  "name": "Color",  "slug": "pa_color",  "type": "select",  "order_by": "menu_order",  "has_archives": true}'
```

```
const data = {	name: 'Color',	slug: 'pa_color',	type: 'select',	order_by: 'menu_order',	has_archives: true,};WooCommerce.post( 'products/attributes', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'name' => 'Color',    'slug' => 'pa_color',    'type' => 'select',    'order_by' => 'menu_order',    'has_archives' => true];print_r($woocommerce->post('products/attributes', $data));?>
```

```
data = {    "name": "Color",    "slug": "pa_color",    "type": "select",    "order_by": "menu_order",    "has_archives": True}print(wcapi.post("products/attributes", data).json())
```

```
data = {  name: "Color",  slug: "pa_color",  type: "select",  order_by: "menu_order",  has_archives: true}woocommerce.post("products/attributes", data).parsed_response
```

```
{	"id": 1,	"name": "Color",	"slug": "pa_color",	"type": "select",	"order_by": "menu_order",	"has_archives": true,	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/products/attributes/6"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/products/attributes"			}		]	}}
```


## Retrieve a product attribute[​](/docs/apis/rest-api/v3/product-attributes#retrieve-a-product-attribute)


This API lets you retrieve and view a specific product attribute by ID.


```
GET /wp-json/wc/v3/products/attributes/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/products/attributes/1 \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'products/attributes/1' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('products/attributes/1')); ?>
```

```
print(wcapi.get("products/attributes/1").json())
```

```
woocommerce.get("products/attributes/1").parsed_response
```

```
{	"id": 1,	"name": "Color",	"slug": "pa_color",	"type": "select",	"order_by": "menu_order",	"has_archives": true,	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/products/attributes/6"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/products/attributes"			}		]	}}
```


## List all product attributes[​](/docs/apis/rest-api/v3/product-attributes#list-all-product-attributes)


This API helps you to view all the product attributes.


```
GET /wp-json/wc/v3/products/attributes
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/products/attributes \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'products/attributes' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('products/attributes')); ?>
```

```
print(wcapi.get("products/attributes").json())
```

```
woocommerce.get("products/attributes").parsed_response
```

```
[	{		"id": 1,		"name": "Color",		"slug": "pa_color",		"type": "select",		"order_by": "menu_order",		"has_archives": true,		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/products/attributes/6"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/products/attributes"				}			]		}	},	{		"id": 2,		"name": "Size",		"slug": "pa_size",		"type": "select",		"order_by": "menu_order",		"has_archives": false,		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/products/attributes/2"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/products/attributes"				}			]		}	}]
```


#### Available parameters[​](/docs/apis/rest-api/v3/product-attributes#available-parameters)


| Parameter | Type | Description |
| --- | --- | --- |
| context | string | Scope under which the request is made; determines fields present in response. Options: view and edit. Default is view. |


## Update a product attribute[​](/docs/apis/rest-api/v3/product-attributes#update-a-product-attribute)


This API lets you make changes to a product attribute.


```
PUT /wp-json/wc/v3/products/attributes/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X PUT https://example.com/wp-json/wc/v3/products/attributes/1 \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "order_by": "name"}'
```

```
const data = {	order_by: 'name',};WooCommerce.put( 'products/attributes/1', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'order_by' => 'name'];print_r($woocommerce->put('products/attributes/1', $data));?>
```

```
data = {    "order_by": "name"}print(wcapi.put("products/attributes/1", data).json())
```

```
data = {  order_by: "name"}woocommerce.put("products/attributes/1", data).parsed_response
```

```
{	"id": 1,	"name": "Color",	"slug": "pa_color",	"type": "select",	"order_by": "name",	"has_archives": true,	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/products/attributes/6"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/products/attributes"			}		]	}}
```


## Delete a product attribute[​](/docs/apis/rest-api/v3/product-attributes#delete-a-product-attribute)


This API helps you delete a product attribute.


```
DELETE /wp-json/wc/v3/products/attributes/<id>
```

warning
This also will delete all terms from the selected attribute.


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X DELETE https://example.com/wp-json/wc/v3/products/attributes/1?force=true \	-u consumer_key:consumer_secret
```

```
WooCommerce.delete( 'products/attributes/1', {	force: true,} )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->delete('products/attributes/1', ['force' => true])); ?>
```

```
print(wcapi.delete("products/attributes/1", params={"force": True}).json())
```

```
woocommerce.delete("products/attributes/1", force: true).parsed_response
```

```
{	"id": 1,	"name": "Color",	"slug": "pa_color",	"type": "select",	"order_by": "menu_order",	"has_archives": true,	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/products/attributes/6"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/products/attributes"			}		]	}}
```


#### Available parameters[​](/docs/apis/rest-api/v3/product-attributes#available-parameters-1)


| Parameter | Type | Description |
| --- | --- | --- |
| force | string | Required to be true, as resource does not support trashing. |


## Batch update product attributes[​](/docs/apis/rest-api/v3/product-attributes#batch-update-product-attributes)


This API helps you to batch create, update and delete multiple product attributes.

note
Note: By default it's limited to up to 100 objects to be created, updated or
deleted.


```
POST /wp-json/wc/v3/products/attributes/batch
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/products/attributes/batch \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "create": [    {      "name": "Brand"    },    {      "name": "Publisher"    }  ],  "update": [    {      "id": 2,      "order_by": "name"    }  ],  "delete": [    1  ]}'
```

```
const data = {	create: [		{			name: 'Brand',		},		{			name: 'Publisher',		},	],	update: [		{			id: 2,			order_by: 'name',		},	],	delete: [ 1 ],};WooCommerce.post( 'products/attributes/batch', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'create' => [        [            'name' => 'Brand'        ],        [            'name' => 'Publisher'        ]    ],    'update' => [        [            'id' => 2,            'order_by' => 'name'        ]    ],    'delete' => [        1    ]];print_r($woocommerce->post('products/attributes/batch', $data));?>
```

```
data = {    "create": [        {            "name": "Brand"        },        {            "name": "Publisher"        }    ],    "update": [        {            "id": 2,            "order_by": "name"        }    ],    "delete": [        1    ]}print(wcapi.post("products/attributes/batch", data).json())
```

```
data = {  create: [    {      name: "Round toe"    },    {      name: "Flat"    }  ],  update: [    {      id: 2,      order_by: "name"    }  ],  delete: [    1  ]}woocommerce.post("products/attributes/batch", data).parsed_response
```

```
{	"create": [		{			"id": 7,			"name": "Brand",			"slug": "pa_brand",			"type": "select",			"order_by": "menu_order",			"has_archives": false,			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/attributes/7"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products/attributes"					}				]			}		},		{			"id": 8,			"name": "Publisher",			"slug": "pa_publisher",			"type": "select",			"order_by": "menu_order",			"has_archives": false,			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/attributes/8"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products/attributes"					}				]			}		}	],	"update": [		{			"id": 2,			"name": "Size",			"slug": "pa_size",			"type": "select",			"order_by": "menu_order",			"has_archives": false,			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/attributes/2"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products/attributes"					}				]			}		}	],	"delete": [		{			"id": 1,			"name": "Color",			"slug": "pa_color",			"type": "select",			"order_by": "menu_order",			"has_archives": true,			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/attributes/6"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products/attributes"					}				]			}		}	]}
```

---

<a name="product-attribute-terms"></a>

The product attribute terms API allows you to create, view, update, and delete individual, or a batch, of attribute terms.


## Product attribute term properties[​](/docs/apis/rest-api/v3/product-attribute-terms#product-attribute-term-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Unique identifier for the resource. READ-ONLY |
| name | string | Term name. MANDATORY |
| slug | string | An alphanumeric identifier for the resource unique to its type. |
| description | string | HTML description of the resource. |
| menu_order | integer | Menu order, used to custom sort the resource. |
| count | integer | Number of published products for the resource. READ-ONLY |


## Create an attribute term[​](/docs/apis/rest-api/v3/product-attribute-terms#create-an-attribute-term)


This API helps you to create a new product attribute term.


```
POST /wp-json/wc/v3/products/attributes/<attribute_id>/terms
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/products/attributes/2/terms \    -u consumer_key:consumer_secret \    -H "Content-Type: application/json" \    -d '{  "name": "XXS"}'
```

```
const data = {	name: 'XXS',};WooCommerce.post( 'products/attributes/2/terms', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'name' => 'XXS'];print_r($woocommerce->post('products/attributes/2/terms', $data));?>
```

```
data = {    "name": "XXS"}print(wcapi.post("products/attributes/2/terms", data).json())
```

```
data = {  name: "XXS"}woocommerce.post("products/attributes/2/terms", data).parsed_response
```

```
{	"id": 23,	"name": "XXS",	"slug": "xxs",	"description": "",	"menu_order": 1,	"count": 1,	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/products/attributes/2/terms/23"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/products/attributes/2/terms"			}		]	}}
```


## Retrieve an attribute term[​](/docs/apis/rest-api/v3/product-attribute-terms#retrieve-an-attribute-term)


This API lets you retrieve a product attribute term by ID.


```
GET /wp-json/wc/v3/products/attributes/<attribute_id>/terms/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/products/attributes/2/terms/23 \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'products/attributes/2/terms/23' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('products/attributes/2/terms/23')); ?>
```

```
print(wcapi.get("products/attributes/2/terms/23").json())
```

```
woocommerce.get("products/attributes/2/terms/23").parsed_response
```

```
{	"id": 23,	"name": "XXS",	"slug": "xxs",	"description": "",	"menu_order": 1,	"count": 1,	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/products/attributes/2/terms/23"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/products/attributes/2/terms"			}		]	}}
```


## List all attribute terms[​](/docs/apis/rest-api/v3/product-attribute-terms#list-all-attribute-terms)


This API lets you retrieve all terms from a product attribute.


```
GET /wp-json/wc/v3/products/attributes/<attribute_id>/terms
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/products/attributes/2/terms \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'products/attributes/2/terms' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('products/attributes/2/terms')); ?>
```

```
print(wcapi.get("products/attributes/2/terms").json())
```

```
woocommerce.get("products/attributes/2/terms").parsed_response
```

```
[	{		"id": 23,		"name": "XXS",		"slug": "xxs",		"description": "",		"menu_order": 1,		"count": 1,		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/products/attributes/2/terms/23"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/products/attributes/2/terms"				}			]		}	},	{		"id": 22,		"name": "XS",		"slug": "xs",		"description": "",		"menu_order": 2,		"count": 1,		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/products/attributes/2/terms/22"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/products/attributes/2/terms"				}			]		}	},	{		"id": 17,		"name": "S",		"slug": "s",		"description": "",		"menu_order": 3,		"count": 1,		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/products/attributes/2/terms/17"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/products/attributes/2/terms"				}			]		}	},	{		"id": 18,		"name": "M",		"slug": "m",		"description": "",		"menu_order": 4,		"count": 1,		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/products/attributes/2/terms/18"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/products/attributes/2/terms"				}			]		}	},	{		"id": 19,		"name": "L",		"slug": "l",		"description": "",		"menu_order": 5,		"count": 1,		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/products/attributes/2/terms/19"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/products/attributes/2/terms"				}			]		}	},	{		"id": 20,		"name": "XL",		"slug": "xl",		"description": "",		"menu_order": 6,		"count": 1,		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/products/attributes/2/terms/20"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/products/attributes/2/terms"				}			]		}	},	{		"id": 21,		"name": "XXL",		"slug": "xxl",		"description": "",		"menu_order": 7,		"count": 1,		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/products/attributes/2/terms/21"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/products/attributes/2/terms"				}			]		}	}]
```


#### Available parameters[​](/docs/apis/rest-api/v3/product-attribute-terms#available-parameters)


| Parameter | Type | Description |
| --- | --- | --- |
| context | string | Scope under which the request is made; determines fields present in response. Options: view and edit. Default is view. |
| page | integer | Current page of the collection. Default is 1. |
| per_page | integer | Maximum number of items to be returned in result set. Default is 10. |
| search | string | Limit results to those matching a string. |
| exclude | array | Ensure result set excludes specific ids. |
| include | array | Limit result set to specific ids. |
| order | string | Order sort attribute ascending or descending. Options: asc and desc. Default is asc. |
| orderby | string | Sort collection by resource attribute. Options: id, include, name, slug, term_group, description and count. Default is name. |
| hide_empty | boolean | Whether to hide resources not assigned to any products. Default is false. |
| parent | integer | Limit result set to resources assigned to a specific parent. |
| product | integer | Limit result set to resources assigned to a specific product. |
| slug | string | Limit result set to resources with a specific slug. |


## Update an attribute term[​](/docs/apis/rest-api/v3/product-attribute-terms#update-an-attribute-term)


This API lets you make changes to a product attribute term.


```
PUT /wp-json/wc/v3/products/attributes/<attribute_id>/terms/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X PUT https://example.com/wp-json/wc/v3/products/attributes/2/terms/23 \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "name": "XXS"}'
```

```
const data = {	name: 'XXS',};WooCommerce.put( 'products/attributes/2/terms/23', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'name' => 'XXS'];print_r($woocommerce->put('products/attributes/2/terms/23', $data));?>
```

```
data = {    "name": "XXS"}print(wcapi.put("products/attributes/2/terms/23", data).json())
```

```
data = {  name: "XXS"}woocommerce.put("products/attributes/2/terms/23", data).parsed_response
```

```
{	"id": 23,	"name": "XXS",	"slug": "xxs",	"description": "",	"menu_order": 1,	"count": 1,	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/products/attributes/2/terms/23"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/products/attributes/2/terms"			}		]	}}
```


## Delete an attribute term[​](/docs/apis/rest-api/v3/product-attribute-terms#delete-an-attribute-term)


This API helps you delete a product attribute term.


```
DELETE /wp-json/wc/v3/products/attributes/<attribute_id>/terms/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X DELETE https://example.com/wp-json/wc/v3/products/attributes/2/terms/23?force=true \	-u consumer_key:consumer_secret
```

```
WooCommerce.delete( 'products/attributes/2/terms/23', {	force: true,} )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->delete('products/attributes/2/terms/23', ['force' => true])); ?>
```

```
print(wcapi.delete("products/attributes/2/terms/23", params={"force": True}).json())
```

```
woocommerce.delete("products/attributes/2/terms/23", force: true).parsed_response
```

```
{	"id": 23,	"name": "XXS",	"slug": "xxs",	"description": "",	"menu_order": 1,	"count": 1,	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/products/attributes/2/terms/23"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/products/attributes/2/terms"			}		]	}}
```


#### Available parameters[​](/docs/apis/rest-api/v3/product-attribute-terms#available-parameters-1)


| Parameter | Type | Description |
| --- | --- | --- |
| force | string | Required to be true, as resource does not support trashing. |


## Batch update attribute terms[​](/docs/apis/rest-api/v3/product-attribute-terms#batch-update-attribute-terms)


This API helps you to batch create, update and delete multiple product attribute terms.

note
Note: By default it's limited to up to 100 objects to be created, updated or
deleted.


```
POST /wp-json/wc/v3/products/attributes/<attribute_id>/terms/batch
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/products/attributes/<attribute_id>/terms/batch \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "create": [    {      "name": "XXS"    },    {      "name": "S"    }  ],  "update": [    {      "id": 19,      "menu_order": 6    }  ],  "delete": [    21,    20  ]}'
```

```
const data = {	create: [		{			name: 'XXS',		},		{			name: 'S',		},	],	update: [		{			id: 19,			menu_order: 6,		},	],	delete: [ 21, 20 ],};WooCommerce.post( 'products/attributes/2/terms/batch', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'create' => [        [            'name' => 'XXS'        ],        [            'name' => 'S'        ]    ],    'update' => [        [            'id' => 19,            'menu_order' => 6        ]    ],    'delete' => [        21,        20    ]];print_r($woocommerce->post('products/attributes/2/terms/batch', $data));?>
```

```
data = {    "create": [        {            "name": "XXS"        },        {            "name": "S"        }    ],    "update": [        {            "id": 19,            "menu_order": 6        }    ],    "delete": [        21,        20    ]}print(wcapi.post("products/attributes/2/terms/batch", data).json())
```

```
data = {  create: [    {      name: "XXS"    },    {      name: "S"    }  ],  update: [    {      id: 19,      menu_order: 6    }  ],  delete: [    21,    20  ]}woocommerce.post("products/attributes/2/terms/batch", data).parsed_response
```

```
{	"create": [		{			"id": 23,			"name": "XXS",			"slug": "xxs",			"description": "",			"menu_order": 1,			"count": 0,			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/attributes/2/terms/23"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products/attributes/2/terms"					}				]			}		},		{			"id": 17,			"name": "S",			"slug": "s",			"description": "",			"menu_order": 3,			"count": 0,			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/attributes/2/terms/17"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products/attributes/2/terms"					}				]			}		}	],	"update": [		{			"id": 19,			"name": "L",			"slug": "l",			"description": "",			"menu_order": 5,			"count": 1,			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/attributes/2/terms/19"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products/attributes/2/terms"					}				]			}		}	],	"delete": [		{			"id": 21,			"name": "XXL",			"slug": "xxl",			"description": "",			"menu_order": 7,			"count": 1,			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/attributes/2/terms/21"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products/attributes/2/terms"					}				]			}		},		{			"id": 20,			"name": "XL",			"slug": "xl",			"description": "",			"menu_order": 6,			"count": 1,			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/attributes/2/terms/20"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products/attributes/2/terms"					}				]			}		}	]}
```

---

<a name="product-categories"></a>

The product categories API allows you to create, view, update, and delete individual, or a batch, of categories.


## Product category properties[​](/docs/apis/rest-api/v3/product-categories#product-category-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Unique identifier for the resource. READ-ONLY |
| name | string | Category name. MANDATORY |
| slug | string | An alphanumeric identifier for the resource unique to its type. |
| parent | integer | The ID for the parent of the resource. |
| description | string | HTML description of the resource. |
| display | string | Category archive display type. Options: default, products, subcategories and both. Default is default. |
| image | object | Image data. See Product category - Image properties |
| menu_order | integer | Menu order, used to custom sort the resource. |
| count | integer | Number of published products for the resource. READ-ONLY |


### Product category - Image properties[​](/docs/apis/rest-api/v3/product-categories#product-category---image-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Image ID. |
| date_created | date-time | The date the image was created, in the site's timezone. READ-ONLY |
| date_created_gmt | date-time | The date the image was created, as GMT READ-ONLY |
| date_modified | date-time | The date the image was last modified, in the site's timezone. READ-ONLY |
| date_modified_gmt | date-time | The date the image was last modified, as GMT. READ-ONLY |
| src | string | Image URL. |
| name | string | Image name. |
| alt | string | Image alternative text. |


## Create a product category[​](/docs/apis/rest-api/v3/product-categories#create-a-product-category)


This API helps you to create a new product category.


```
POST /wp-json/wc/v3/products/categories
```


> Example of how to create a product category:


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/products/categories \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "name": "Clothing",  "image": {    "src": "http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_2_front.jpg"  }}'
```

```
const data = {	name: 'Clothing',	image: {		src: 'http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_2_front.jpg',	},};WooCommerce.post( 'products/categories', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    "name' => 'Clothing',    'image' => [        'src' => 'http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_2_front.jpg'    ]];print_r($woocommerce->post('products/categories', $data));?>
```

```
data = {    "name": "Clothing",    "image": {        "src": "http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_2_front.jpg"    }}print(wcapi.post("products/categories", data).json())
```

```
data = {  name: "Clothing",  image: {    src: "http://demo.woothemes.com/woocommerce/wp-content/uploads/sites/56/2013/06/T_2_front.jpg"  }}woocommerce.post("products/categories", data).parsed_response
```

```
{	"id": 9,	"name": "Clothing",	"slug": "clothing",	"parent": 0,	"description": "",	"display": "default",	"image": {		"id": 730,		"date_created": "2017-03-23T00:01:07",		"date_created_gmt": "2017-03-23T03:01:07",		"date_modified": "2017-03-23T00:01:07",		"date_modified_gmt": "2017-03-23T03:01:07",		"src": "https://example.com/wp-content/uploads/2017/03/T_2_front.jpg",		"name": "",		"alt": ""	},	"menu_order": 0,	"count": 36,	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/products/categories/9"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/products/categories"			}		]	}}
```


## Retrieve a product category[​](/docs/apis/rest-api/v3/product-categories#retrieve-a-product-category)


This API lets you retrieve a product category by ID.


```
GET /wp-json/wc/v3/products/categories/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/products/categories/9 \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'products/categories/9' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('products/categories/9')); ?>
```

```
print(wcapi.get("products/categories/9").json())
```

```
woocommerce.get("products/categories/9").parsed_response
```

```
{	"id": 9,	"name": "Clothing",	"slug": "clothing",	"parent": 0,	"description": "",	"display": "default",	"image": {		"id": 730,		"date_created": "2017-03-23T00:01:07",		"date_created_gmt": "2017-03-23T03:01:07",		"date_modified": "2017-03-23T00:01:07",		"date_modified_gmt": "2017-03-23T03:01:07",		"src": "https://example.com/wp-content/uploads/2017/03/T_2_front.jpg",		"name": "",		"alt": ""	},	"menu_order": 0,	"count": 36,	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/products/categories/9"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/products/categories"			}		]	}}
```


## List all product categories[​](/docs/apis/rest-api/v3/product-categories#list-all-product-categories)


This API lets you retrieve all product categories.


```
GET /wp-json/wc/v3/products/categories
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/products/categories \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'products/categories' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('products/categories')); ?>
```

```
print(wcapi.get("products/categories").json())
```

```
woocommerce.get("products/categories").parsed_response
```

```
[	{		"id": 15,		"name": "Albums",		"slug": "albums",		"parent": 11,		"description": "",		"display": "default",		"image": [],		"menu_order": 0,		"count": 4,		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/products/categories/15"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/products/categories"				}			],			"up": [				{					"href": "https://example.com/wp-json/wc/v3/products/categories/11"				}			]		}	},	{		"id": 9,		"name": "Clothing",		"slug": "clothing",		"parent": 0,		"description": "",		"display": "default",		"image": {			"id": 730,			"date_created": "2017-03-23T00:01:07",			"date_created_gmt": "2017-03-23T03:01:07",			"date_modified": "2017-03-23T00:01:07",			"date_modified_gmt": "2017-03-23T03:01:07",			"src": "https://example.com/wp-content/uploads/2017/03/T_2_front.jpg",			"name": "",			"alt": ""		},		"menu_order": 0,		"count": 36,		"_links": {			"self": [				{					"href": "https://example/wp-json/wc/v3/products/categories/9"				}			],			"collection": [				{					"href": "https://example/wp-json/wc/v3/products/categories"				}			]		}	},	{		"id": 10,		"name": "Hoodies",		"slug": "hoodies",		"parent": 9,		"description": "",		"display": "default",		"image": [],		"menu_order": 0,		"count": 6,		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/products/categories/10"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/products/categories"				}			],			"up": [				{					"href": "https://example.com/wp-json/wc/v3/products/categories/9"				}			]		}	},	{		"id": 11,		"name": "Music",		"slug": "music",		"parent": 0,		"description": "",		"display": "default",		"image": [],		"menu_order": 0,		"count": 7,		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/products/categories/11"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/products/categories"				}			]		}	},	{		"id": 12,		"name": "Posters",		"slug": "posters",		"parent": 0,		"description": "",		"display": "default",		"image": [],		"menu_order": 0,		"count": 5,		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/products/categories/12"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/products/categories"				}			]		}	},	{		"id": 13,		"name": "Singles",		"slug": "singles",		"parent": 11,		"description": "",		"display": "default",		"image": [],		"menu_order": 0,		"count": 3,		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/products/categories/13"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/products/categories"				}			],			"up": [				{					"href": "https://example.com/wp-json/wc/v3/products/categories/11"				}			]		}	},	{		"id": 14,		"name": "T-shirts",		"slug": "t-shirts",		"parent": 9,		"description": "",		"display": "default",		"image": [],		"menu_order": 0,		"count": 6,		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/products/categories/14"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/products/categories"				}			],			"up": [				{					"href": "https://example.com/wp-json/wc/v3/products/categories/9"				}			]		}	}]
```


#### Available parameters[​](/docs/apis/rest-api/v3/product-categories#available-parameters)


| Parameter | Type | Description |
| --- | --- | --- |
| context | string | Scope under which the request is made; determines fields present in response. Options: view and edit. Default is view. |
| page | integer | Current page of the collection. Default is 1. |
| per_page | integer | Maximum number of items to be returned in result set. Default is 10. |
| search | string | Limit results to those matching a string. |
| exclude | array | Ensure result set excludes specific ids. |
| include | array | Limit result set to specific ids. |
| order | string | Order sort attribute ascending or descending. Options: asc and desc. Default is asc. |
| orderby | string | Sort collection by resource attribute. Options: id, include, name, slug, term_group, description and count. Default is name. |
| hide_empty | boolean | Whether to hide resources not assigned to any products. Default is false. |
| parent | integer | Limit result set to resources assigned to a specific parent. |
| product | integer | Limit result set to resources assigned to a specific product. |
| slug | string | Limit result set to resources with a specific slug. |


## Update a product category[​](/docs/apis/rest-api/v3/product-categories#update-a-product-category)


This API lets you make changes to a product category.


```
PUT /wp-json/wc/v3/products/categories/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X PUT https://example.com/wp-json/wc/v3/products/categories/9 \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "description": "All kinds of clothes."}'
```

```
const data = {	description: 'All kinds of clothes.',};WooCommerce.put( 'products/categories/9', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'description' => 'All kinds of clothes.'];print_r($woocommerce->put('products/categories/9', $data));?>
```

```
data = {    "description": "All kinds of clothes."}print(wcapi.put("products/categories/9", data).json())
```

```
data = {  description: "All kinds of clothes."}woocommerce.put("products/categories/9", data).parsed_response
```

```
{	"id": 9,	"name": "Clothing",	"slug": "clothing",	"parent": 0,	"description": "All kinds of clothes.",	"display": "default",	"image": {		"id": 730,		"date_created": "2017-03-23T00:01:07",		"date_created_gmt": "2017-03-23T03:01:07",		"date_modified": "2017-03-23T00:01:07",		"date_modified_gmt": "2017-03-23T03:01:07",		"src": "https://example.com/wp-content/uploads/2017/03/T_2_front.jpg",		"name": "",		"alt": ""	},	"menu_order": 0,	"count": 36,	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/products/categories/9"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/products/categories"			}		]	}}
```


## Delete a product category[​](/docs/apis/rest-api/v3/product-categories#delete-a-product-category)


This API helps you delete a product category.


```
DELETE /wp-json/wc/v3/products/categories/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X DELETE https://example.com/wp-json/wc/v3/products/categories/9?force=true \	-u consumer_key:consumer_secret
```

```
WooCommerce.delete( 'products/categories/9', {	force: true,} )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->delete('products/categories/9', ['force' => true])); ?>
```

```
print(wcapi.delete("products/categories/9", params={"force": True}).json())
```

```
woocommerce.delete("products/categories/9", force: true).parsed_response
```

```
{	"id": 9,	"name": "Clothing",	"slug": "clothing",	"parent": 0,	"description": "All kinds of clothes.",	"display": "default",	"image": {		"id": 730,		"date_created": "2017-03-23T00:01:07",		"date_created_gmt": "2017-03-23T03:01:07",		"date_modified": "2017-03-23T00:01:07",		"date_modified_gmt": "2017-03-23T03:01:07",		"src": "https://example.com/wp-content/uploads/2017/03/T_2_front.jpg",		"name": "",		"alt": ""	},	"menu_order": 0,	"count": 36,	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/products/categories/9"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/products/categories"			}		]	}}
```


#### Available parameters[​](/docs/apis/rest-api/v3/product-categories#available-parameters-1)


| Parameter | Type | Description |
| --- | --- | --- |
| force | string | Required to be true, as resource does not support trashing. |


## Batch update product categories[​](/docs/apis/rest-api/v3/product-categories#batch-update-product-categories)


This API helps you to batch create, update and delete multiple product categories.

note
Note: By default it's limited to up to 100 objects to be created, updated or
deleted.


```
POST /wp-json/wc/v3/products/categories/batch
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/products/categories/batch \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "create": [    {      "name": "Albums"    },    {      "name": "Clothing"    }  ],  "update": [    {      "id": 10,      "description": "Nice hoodies"    }  ],  "delete": [    11,    12  ]}'
```

```
const data = {	create: [		{			name: 'Albums',		},		{			name: 'Clothing',		},	],	update: [		{			id: 10,			description: 'Nice hoodies',		},	],	delete: [ 11, 12 ],};WooCommerce.post( 'products/categories/batch', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'create' => [        [            'name' => 'Albums'        ],        [            'name' => 'Clothing'        ]    ],    'update' => [        [            'id' => 10,            'description' => 'Nice hoodies'        ]    ],    'delete' => [        11,        12    ]];print_r($woocommerce->post('products/categories/batch', $data));?>
```

```
data = {    "create": [        {            "name": "Albums"        },        {            "name": "Clothing"        }    ],    "update": [        {            "id": 10,            "description": "Nice hoodies"        }    ],    "delete": [        11,        12    ]}print(wcapi.post("products/categories/batch", data).json())
```

```
data = {  create: [    {      name: "Albums"    },    {      name: "Clothing"    }  ],  update: [    {      id: 10,      description: "Nice hoodies"    }  ],  delete: [    11,    12  ]}woocommerce.post("products/categories/batch", data).parsed_response
```

```
{	"create": [		{			"id": 15,			"name": "Albums",			"slug": "albums",			"parent": 11,			"description": "",			"display": "default",			"image": [],			"menu_order": 0,			"count": 0,			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/categories/15"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products/categories"					}				],				"up": [					{						"href": "https://example.com/wp-json/wc/v3/products/categories/11"					}				]			}		},		{			"id": 9,			"name": "Clothing",			"slug": "clothing",			"parent": 0,			"description": "",			"display": "default",			"image": [],			"menu_order": 0,			"count": 0,			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/categories/9"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products/categories"					}				]			}		}	],	"update": [		{			"id": 10,			"name": "Hoodies",			"slug": "hoodies",			"parent": 9,			"description": "Nice hoodies",			"display": "default",			"image": [],			"menu_order": 0,			"count": 6,			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/categories/10"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products/categories"					}				],				"up": [					{						"href": "https://example.com/wp-json/wc/v3/products/categories/9"					}				]			}		}	],	"delete": [		{			"id": 11,			"name": "Music",			"slug": "music",			"parent": 0,			"description": "",			"display": "default",			"image": [],			"menu_order": 0,			"count": 7,			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/categories/11"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products/categories"					}				]			}		},		{			"id": 12,			"name": "Posters",			"slug": "posters",			"parent": 0,			"description": "",			"display": "default",			"image": [],			"menu_order": 0,			"count": 5,			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/categories/12"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products/categories"					}				]			}		}	]}
```

---

<a name="product-custom-fields"></a>

The product custom fields API allows you to view the custom field names that have been recorded.


## Custom fields available parameters[​](/docs/apis/rest-api/v3/product-custom-fields#custom-fields-available-parameters)


| Parameter | Type | Description |
| --- | --- | --- |
| context | string | Scope under which the request is made; determines fields present in response. Options: view and edit. Default is view. |
| page | integer | Current page of the collection. Default is 1. |
| per_page | integer | Maximum number of items to be returned in result set. Default is 10. |
| search | string | Limit results to those matching a string. |
| order | string | Order sort attribute ascending or descending. Options: asc and desc. Default is desc. |


## Retrieve product custom field names[​](/docs/apis/rest-api/v3/product-custom-fields#retrieve-product-custom-field-names)


This API lets you retrieve filtered custom field names.


```
GET /wp-json/wc/v3/products/custom-fields/names
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/products/custom-fields/names \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'products/custom-fields/names' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('products/custom-fields/names')); ?>
```

```
print(wcapi.get("products/custom-fields/names").json())
```

```
woocommerce.get("products/custom-fields/names").parsed_response
```

```
[	"Custom field 1",	"Custom field 2",	"Custom field 3",	"Custom field 4"]
```

---

<a name="product-shipping-classes"></a>

The product shipping class API allows you to create, view, update, and delete individual, or a batch, of shipping classes.


## Product shipping class properties[​](/docs/apis/rest-api/v3/product-shipping-classes#product-shipping-class-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Unique identifier for the resource. READ-ONLY |
| name | string | Shipping class name. MANDATORY |
| slug | string | An alphanumeric identifier for the resource unique to its type. |
| description | string | HTML description of the resource. |
| count | integer | Number of published products for the resource. READ-ONLY |


## Create a shipping class[​](/docs/apis/rest-api/v3/product-shipping-classes#create-a-shipping-class)


This API helps you to create a new product shipping class.


```
POST /wp-json/wc/v3/products/shipping_classes
```


> Example of how to create a product shipping class:


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/products/shipping_classes \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "name": "Priority"}'
```

```
const data = {	name: 'Priority',};WooCommerce.post( 'products/shipping_classes', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'name' => 'Priority'];print_r($woocommerce->post('products/shipping_classes', $data));?>
```

```
data = {    "name": "Priority"}print(wcapi.post("products/shipping_classes", data).json())
```

```
data = {  name: "Priority"}woocommerce.post("products/shipping_classes", data).parsed_response
```

```
{	"id": 32,	"name": "Priority",	"slug": "priority",	"description": "",	"count": 0,	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/products/shipping_classes/32"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/products/shipping_classes"			}		]	}}
```


## Retrieve a shipping class[​](/docs/apis/rest-api/v3/product-shipping-classes#retrieve-a-shipping-class)


This API lets you retrieve a product shipping class by ID.


```
GET /wp-json/wc/v3/products/shipping_classes/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/products/shipping_classes/32 \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'products/shipping_classes/32' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('products/shipping_classes/32')); ?>
```

```
print(wcapi.get("products/shipping_classes/32").json())
```

```
woocommerce.get("products/shipping_classes/32").parsed_response
```

```
{	"id": 32,	"name": "Priority",	"slug": "priority",	"description": "",	"count": 0,	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/products/shipping_classes/32"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/products/shipping_classes"			}		]	}}
```


## List all shipping classes[​](/docs/apis/rest-api/v3/product-shipping-classes#list-all-shipping-classes)


This API lets you retrieve all product shipping classes.


```
GET /wp-json/wc/v3/products/shipping_classes
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/products/shipping_classes \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'products/shipping_classes' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('products/shipping_classes')); ?>
```

```
print(wcapi.get("products/shipping_classes").json())
```

```
woocommerce.get("products/shipping_classes").parsed_response
```

```
[	{		"id": 33,		"name": "Express",		"slug": "express",		"description": "",		"count": 0,		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/products/shipping_classes/33"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/products/shipping_classes"				}			]		}	},	{		"id": 32,		"name": "Priority",		"slug": "priority",		"description": "",		"count": 0,		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/products/shipping_classes/32"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/products/shipping_classes"				}			]		}	}]
```


#### Available parameters[​](/docs/apis/rest-api/v3/product-shipping-classes#available-parameters)


| Parameter | Type | Description |
| --- | --- | --- |
| context | string | Scope under which the request is made; determines fields present in response. Options: view and edit. Default is view. |
| page | integer | Current page of the collection. Default is 1. |
| per_page | integer | Maximum number of items to be returned in result set. Default is 10. |
| search | string | Limit results to those matching a string. |
| exclude | array | Ensure result set excludes specific ids. |
| include | array | Limit result set to specific ids. |
| offset | integer | Offset the result set by a specific number of items. |
| order | string | Order sort attribute ascending or descending. Options: asc and desc. Default is asc. |
| orderby | string | Sort collection by resource attribute. Options: id, include, name, slug, term_group, description and count. Default is name. |
| hide_empty | boolean | Whether to hide resources not assigned to any products. Default is false. |
| product | integer | Limit result set to resources assigned to a specific product. |
| slug | string | Limit result set to resources with a specific slug. |


## Update a shipping class[​](/docs/apis/rest-api/v3/product-shipping-classes#update-a-shipping-class)


This API lets you make changes to a product shipping class.


```
PUT /wp-json/wc/v3/products/shipping_classes/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X PUT https://example.com/wp-json/wc/v3/products/shipping_classes/32 \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "description": "Priority mail."}'
```

```
const data = {	description: 'Priority mail.',};WooCommerce.put( 'products/shipping_classes/32', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'description' => 'Priority mail.'];print_r($woocommerce->put('products/shipping_classes/32', $data));?>
```

```
data = {    "description": "Priority mail."}print(wcapi.put("products/shipping_classes/32", data).json())
```

```
data = {  description: "Priority mail."}woocommerce.put("products/shipping_classes/32", data).parsed_response
```

```
{	"id": 32,	"name": "Priority",	"slug": "priority",	"description": "Priority mail.",	"count": 0,	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/products/shipping_classes/32"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/products/shipping_classes"			}		]	}}
```


## Delete a shipping class[​](/docs/apis/rest-api/v3/product-shipping-classes#delete-a-shipping-class)


This API helps you delete a product shipping class.


```
DELETE /wp-json/wc/v3/products/shipping_classes/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X DELETE https://example.com/wp-json/wc/v3/products/shipping_classes/32?force=true \	-u consumer_key:consumer_secret
```

```
WooCommerce.delete( 'products/shipping_classes/32', {	force: true,} )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->delete('products/shipping_classes/32', ['force' => true])); ?>
```

```
print(wcapi.delete("products/shipping_classes/32", params={"force": True}).json())
```

```
woocommerce.delete("products/shipping_classes/32", force: true).parsed_response
```

```
{	"id": 32,	"name": "Priority",	"slug": "priority",	"description": "Priority mail.",	"count": 0,	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/products/shipping_classes/32"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/products/shipping_classes"			}		]	}}
```


#### Available parameters[​](/docs/apis/rest-api/v3/product-shipping-classes#available-parameters-1)


| Parameter | Type | Description |
| --- | --- | --- |
| force | string | Required to be true, as resource does not support trashing. |


## Batch update shipping classes[​](/docs/apis/rest-api/v3/product-shipping-classes#batch-update-shipping-classes)


This API helps you to batch create, update and delete multiple product shipping classes.

note
Note: By default it's limited to up to 100 objects to be created, updated or
deleted.


```
POST /wp-json/wc/v3/products/shipping_classes/batch
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/products/shipping_classes/batch \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "create": [    {      "name": "Small items"    },    {      "name": "Large items"    }  ],  "update": [    {      "id": 33,      "description": "Express shipping"    }  ],  "delete": [    32  ]}'
```

```
const data = {	create: [		{			name: 'Small items',		},		{			name: 'Large items',		},	],	update: [		{			id: 33,			description: 'Express shipping',		},	],	delete: [ 32 ],};WooCommerce.post( 'products/shipping_classes/batch', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'create' => [        [            'name' => 'Small items'        ],        [            'name' => 'Large items'        ]    ],    'update' => [        [            'id' => 33,            'description' => 'Express shipping'        ]    ],    'delete' => [        32    ]];print_r($woocommerce->post('products/shipping_classes/batch', $data));?>
```

```
data = {    "create": [        {            "name": "Small items"        },        {            "name": "Large items"        }    ],    "update": [        {            "id": 33,            "description": "Express shipping"        }    ],    "delete": [        32    ]}print(wcapi.post("products/shipping_classes/batch", data).json())
```

```
data = {  create: [    {      name: "Small items"    },    {      name: "Large items"    }  ],  update: [    {      id: 33,      description: "Express shipping"    }  ],  delete: [    32  ]}woocommerce.post("products/shipping_classes/batch", data).parsed_response
```

```
{	"create": [		{			"id": 34,			"name": "Small items",			"slug": "small-items",			"description": "",			"count": 0,			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/shipping_classes/34"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products/shipping_classes"					}				]			}		},		{			"id": 35,			"name": "Large items",			"slug": "large-items",			"description": "",			"count": 0,			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/shipping_classes/35"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products/shipping_classes"					}				]			}		}	],	"update": [		{			"id": 33,			"name": "Express",			"slug": "express",			"description": "Express shipping",			"count": 0,			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/shipping_classes/33"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products/shipping_classes"					}				]			}		}	],	"delete": [		{			"id": 32,			"name": "Priority",			"slug": "priority",			"description": "",			"count": 0,			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/shipping_classes/32"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products/shipping_classes"					}				]			}		}	]}
```

---

<a name="product-tags"></a>

The product tags API allows you to create, view, update, and delete individual, or a batch, of product tags.


## Product tag properties[​](/docs/apis/rest-api/v3/product-tags#product-tag-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Unique identifier for the resource. READ-ONLY |
| name | string | Tag name. MANDATORY |
| slug | string | An alphanumeric identifier for the resource unique to its type. |
| description | string | HTML description of the resource. |
| count | integer | Number of published products for the resource. READ-ONLY |


## Create a product tag[​](/docs/apis/rest-api/v3/product-tags#create-a-product-tag)


This API helps you to create a new product tag.


```
POST /wp-json/wc/v3/products/tags
```


> Example of how to create a product tag:


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/products/tags \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "name": "Leather Shoes"}'
```

```
const data = {	name: 'Leather Shoes',};WooCommerce.post( 'products/tags', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'name' => 'Leather Shoes'];print_r($woocommerce->post('products/tags', $data));?>
```

```
data = {    "name": "Leather Shoes"}print(wcapi.post("products/tags", data).json())
```

```
data = {  name: "Leather Shoes"}woocommerce.post("products/tags", data).parsed_response
```

```
{	"id": 34,	"name": "Leather Shoes",	"slug": "leather-shoes",	"description": "",	"count": 0,	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/products/tags/34"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/products/tags"			}		]	}}
```


## Retrieve a product tag[​](/docs/apis/rest-api/v3/product-tags#retrieve-a-product-tag)


This API lets you retrieve a product tag by ID.


```
GET /wp-json/wc/v3/products/tags/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/products/tags/34 \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'products/tags/34' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('products/tags/34')); ?>
```

```
print(wcapi.get("products/tags/34").json())
```

```
woocommerce.get("products/tags/34").parsed_response
```

```
{	"id": 34,	"name": "Leather Shoes",	"slug": "leather-shoes",	"description": "",	"count": 0,	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/products/tags/34"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/products/tags"			}		]	}}
```


## List all product tags[​](/docs/apis/rest-api/v3/product-tags#list-all-product-tags)


This API lets you retrieve all product tag.


```
GET /wp-json/wc/v3/products/tags
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/products/tags \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'products/tags' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('products/tags')); ?>
```

```
print(wcapi.get("products/tags").json())
```

```
woocommerce.get("products/tags").parsed_response
```

```
[	{		"id": 34,		"name": "Leather Shoes",		"slug": "leather-shoes",		"description": "",		"count": 0,		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/products/tags/34"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/products/tags"				}			]		}	},	{		"id": 35,		"name": "Oxford Shoes",		"slug": "oxford-shoes",		"description": "",		"count": 0,		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/products/tags/35"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/products/tags"				}			]		}	}]
```


#### Available parameters[​](/docs/apis/rest-api/v3/product-tags#available-parameters)


| Parameter | Type | Description |
| --- | --- | --- |
| context | string | Scope under which the request is made; determines fields present in response. Options: view and edit. Default is view. |
| page | integer | Current page of the collection. Default is 1. |
| per_page | integer | Maximum number of items to be returned in result set. Default is 10. |
| search | string | Limit results to those matching a string. |
| exclude | array | Ensure result set excludes specific ids. |
| include | array | Limit result set to specific ids. |
| offset | integer | Offset the result set by a specific number of items. |
| order | string | Order sort attribute ascending or descending. Options: asc and desc. Default is asc. |
| orderby | string | Sort collection by resource attribute. Options: id, include, name, slug, term_group, description and count. Default is name. |
| hide_empty | boolean | Whether to hide resources not assigned to any products. Default is false. |
| product | integer | Limit result set to resources assigned to a specific product. |
| slug | string | Limit result set to resources with a specific slug. |


## Update a product tag[​](/docs/apis/rest-api/v3/product-tags#update-a-product-tag)


This API lets you make changes to a product tag.


```
PUT /wp-json/wc/v3/products/tags/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X PUT https://example.com/wp-json/wc/v3/products/tags/34 \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "description": "Genuine leather."}'
```

```
const data = {	description: 'Genuine leather.',};WooCommerce.put( 'products/tags/34', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'description': 'Genuine leather.'];print_r($woocommerce->put('products/tags/34', $data));?>
```

```
data = {    "description": "Genuine leather."}print(wcapi.put("products/tags/34", data).json())
```

```
data = {  description: "Genuine leather."}woocommerce.put("products/tags/34", data).parsed_response
```

```
{	"id": 34,	"name": "Leather Shoes",	"slug": "leather-shoes",	"description": "Genuine leather.",	"count": 0,	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/products/tags/34"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/products/tags"			}		]	}}
```


## Delete a product tag[​](/docs/apis/rest-api/v3/product-tags#delete-a-product-tag)


This API helps you delete a product tag.


```
DELETE /wp-json/wc/v3/products/tags/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X DELETE https://example.com/wp-json/wc/v3/products/tags/34?force=true \	-u consumer_key:consumer_secret
```

```
WooCommerce.delete( 'products/tags/34', {	force: true,} )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->delete('products/tags/34', ['force' => true])); ?>
```

```
print(wcapi.delete("products/tags/34", params={"force": True}).json())
```

```
woocommerce.delete("products/tags/34", force: true).parsed_response
```

```
{	"id": 34,	"name": "Leather Shoes",	"slug": "leather-shoes",	"description": "Genuine leather.",	"count": 0,	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/products/tags/34"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/products/tags"			}		]	}}
```


#### Available parameters[​](/docs/apis/rest-api/v3/product-tags#available-parameters-1)


| Parameter | Type | Description |
| --- | --- | --- |
| force | string | Required to be true, as resource does not support trashing. |


## Batch update product tags[​](/docs/apis/rest-api/v3/product-tags#batch-update-product-tags)


This API helps you to batch create, update and delete multiple product tags.

note
Note: By default it's limited to up to 100 objects to be created, updated or
deleted.


```
POST /wp-json/wc/v3/products/tags/batch
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/products/tags/batch \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "create": [    {      "name": "Round toe"    },    {      "name": "Flat"    }  ],  "update": [    {      "id": 34,      "description": "Genuine leather."    }  ],  "delete": [    35  ]}'
```

```
const data = {	create: [		{			name: 'Round toe',		},		{			name: 'Flat',		},	],	update: [		{			id: 34,			description: 'Genuine leather.',		},	],	delete: [ 35 ],};WooCommerce.post( 'products/tags/batch', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'create' => [        [            'name' => 'Round toe'        ],        [            'name' => 'Flat'        ]    ],    'update' => [        [            'id' => 34,            'description' => 'Genuine leather.'        ]    ],    'delete' => [        35    ]];print_r($woocommerce->post('products/tags/batch', $data));?>
```

```
data = {    "create": [        {            "name": "Round toe"        },        {            "name": "Flat"        }    ],    "update": [        {            "id": 34,            "description": "Genuine leather."        }    ],    "delete": [        35    ]}print(wcapi.post("products/tags/batch", data).json())
```

```
data = {  create: [    {      name: "Round toe"    },    {      name: "Flat"    }  ],  update: [    {      id: 34,      description: "Genuine leather."    }  ],  delete: [    35  ]}woocommerce.post("products/tags/batch", data).parsed_response
```

```
{	"create": [		{			"id": 36,			"name": "Round toe",			"slug": "round-toe",			"description": "",			"count": 0,			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/tags/36"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products/tags"					}				]			}		},		{			"id": 37,			"name": "Flat",			"slug": "flat",			"description": "",			"count": 0,			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/tags/37"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products/tags"					}				]			}		}	],	"update": [		{			"id": 34,			"name": "Leather Shoes",			"slug": "leather-shoes",			"description": "Genuine leather.",			"count": 0,			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/tags/34"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products/tags"					}				]			}		}	],	"delete": [		{			"id": 35,			"name": "Oxford Shoes",			"slug": "oxford-shoes",			"description": "",			"count": 0,			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/tags/35"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products/tags"					}				]			}		}	]}
```

---

<a name="product-reviews"></a>

The product reviews API allows you to create, view, update, and delete individual, or a batch, of product reviews.


## Product review properties[​](/docs/apis/rest-api/v3/product-reviews#product-review-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Unique identifier for the resource. READ-ONLY |
| date_created | string | The date the review was created, in the site's timezone. READ-ONLY |
| date_created_gmt | string | The date the review was created, as GMT. READ-ONLY |
| product_id | integer | Unique identifier for the product that the review belongs to. |
| status | string | Status of the review. Options: approved, hold, spam, unspam, trash and untrash. Defaults to approved. |
| reviewer | string | Reviewer name. |
| reviewer_email | string | Reviewer email. |
| review | string | The content of the review. |
| rating | integer | Review rating (0 to 5). |
| verified | boolean | Shows if the reviewer bought the product or not. |


## Create a product review[​](/docs/apis/rest-api/v3/product-reviews#create-a-product-review)


This API helps you to create a new product review.


```
POST /wp-json/wc/v3/products/reviews
```


> Example of how to create a product review:


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/products/reviews \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "product_id": 22,  "review": "Nice album!",  "reviewer": "John Doe",  "reviewer_email": "john.doe@example.com",  "rating": 5}'
```

```
const data = {	product_id: 22,	review: 'Nice album!',	reviewer: 'John Doe',	reviewer_email: 'john.doe@example.com',	rating: 5,};WooCommerce.post( 'products/reviews', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'product_id' => 22,    'review' => 'Nice album!',    'reviewer' => 'John Doe',    'reviewer_email' => 'john.doe@example.com',    'rating' => 5];print_r($woocommerce->post('products/reviews', $data));?>
```

```
data = {    "product_id": 22,    "review": "Nice album!",    "reviewer": "John Doe",    "reviewer_email": "john.doe@example.com",    "rating": 5,}print(wcapi.post("products/reviews", data).json())
```

```
data = {  product_id: 22,  review: "Nice album!",  reviewer: "John Doe",  reviewer_email: "john.doe@example.com",  rating: 5}woocommerce.post("products/reviews", data).parsed_response
```

```
{	"id": 22,	"date_created": "2018-10-18T17:59:17",	"date_created_gmt": "2018-10-18T20:59:17",	"product_id": 22,	"status": "approved",	"reviewer": "John Doe",	"reviewer_email": "john.doe@example.com",	"review": "Nice album!",	"rating": 5,	"verified": false,	"reviewer_avatar_urls": {		"24": "https://secure.gravatar.com/avatar/8eb1b522f60d11fa897de1dc6351b7e8?s=24&d=mm&r=g",		"48": "https://secure.gravatar.com/avatar/8eb1b522f60d11fa897de1dc6351b7e8?s=48&d=mm&r=g",		"96": "https://secure.gravatar.com/avatar/8eb1b522f60d11fa897de1dc6351b7e8?s=96&d=mm&r=g"	},	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/products/reviews/22"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/products/reviews"			}		],		"up": [			{				"href": "https://example.com/wp-json/wc/v3/products/22"			}		]	}}
```


## Retrieve a product review[​](/docs/apis/rest-api/v3/product-reviews#retrieve-a-product-review)


This API lets you retrieve a product review by ID.


```
GET /wp-json/wc/v3/products/reviews/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/products/reviews/22 \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'products/reviews/22' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('products/reviews/22')); ?>
```

```
print(wcapi.get("products/reviews/22").json())
```

```
woocommerce.get("products/reviews/22").parsed_response
```

```
{	"id": 22,	"date_created": "2018-10-18T17:59:17",	"date_created_gmt": "2018-10-18T20:59:17",	"product_id": 22,	"status": "approved",	"reviewer": "John Doe",	"reviewer_email": "john.doe@example.com",	"review": "Nice album!",	"rating": 5,	"verified": false,	"reviewer_avatar_urls": {		"24": "https://secure.gravatar.com/avatar/8eb1b522f60d11fa897de1dc6351b7e8?s=24&d=mm&r=g",		"48": "https://secure.gravatar.com/avatar/8eb1b522f60d11fa897de1dc6351b7e8?s=48&d=mm&r=g",		"96": "https://secure.gravatar.com/avatar/8eb1b522f60d11fa897de1dc6351b7e8?s=96&d=mm&r=g"	},	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/products/reviews/22"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/products/reviews"			}		],		"up": [			{				"href": "https://example.com/wp-json/wc/v3/products/22"			}		]	}}
```


## List all product reviews[​](/docs/apis/rest-api/v3/product-reviews#list-all-product-reviews)


This API lets you retrieve all product review.


```
GET /wp-json/wc/v3/products/reviews
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/products/reviews \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'products/reviews' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('products/reviews')); ?>
```

```
print(wcapi.get("products/reviews").json())
```

```
woocommerce.get("products/reviews").parsed_response
```

```
[	{		"id": 22,		"date_created": "2018-10-18T17:59:17",		"date_created_gmt": "2018-10-18T20:59:17",		"product_id": 22,		"status": "approved",		"reviewer": "John Doe",		"reviewer_email": "john.doe@example.com",		"review": "<p>Nice album!</p>\n",		"rating": 5,		"verified": false,		"reviewer_avatar_urls": {			"24": "https://secure.gravatar.com/avatar/8eb1b522f60d11fa897de1dc6351b7e8?s=24&d=mm&r=g",			"48": "https://secure.gravatar.com/avatar/8eb1b522f60d11fa897de1dc6351b7e8?s=48&d=mm&r=g",			"96": "https://secure.gravatar.com/avatar/8eb1b522f60d11fa897de1dc6351b7e8?s=96&d=mm&r=g"		},		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/products/reviews/22"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/products/reviews"				}			],			"up": [				{					"href": "https://example.com/wp-json/wc/v3/products/22"				}			]		}	},	{		"id": 20,		"date_created": "2018-09-08T21:47:19",		"date_created_gmt": "2018-09-09T00:47:19",		"product_id": 31,		"status": "approved",		"reviewer": "Claudio Sanches",		"reviewer_email": "john.doe@example.com",		"review": "<p>Now works just fine.</p>\n",		"rating": 1,		"verified": true,		"reviewer_avatar_urls": {			"24": "https://secure.gravatar.com/avatar/908480753c07509e76322dc17d305c8b?s=24&d=mm&r=g",			"48": "https://secure.gravatar.com/avatar/908480753c07509e76322dc17d305c8b?s=48&d=mm&r=g",			"96": "https://secure.gravatar.com/avatar/908480753c07509e76322dc17d305c8b?s=96&d=mm&r=g"		},		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/products/reviews/20"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/products/reviews"				}			],			"up": [				{					"href": "https://example.com/wp-json/wc/v3/products/31"				}			],			"reviewer": [				{					"embeddable": true,					"href": "https://example.com/wp-json/wp/v2/users/1"				}			]		}	}]
```


#### Available parameters[​](/docs/apis/rest-api/v3/product-reviews#available-parameters)


| Parameter | Type | Description |
| --- | --- | --- |
| context | string | Scope under which the request is made; determines fields present in response. Options: view and edit. Default is view. |
| page | integer | Current page of the collection. Default is 1. |
| per_page | integer | Maximum number of items to be returned in result set. Default is 10. |
| search | string | Limit results to those matching a string. |
| after | string | Limit response to reviews published after a given ISO8601 compliant date. |
| before | string | Limit response to reviews published before a given ISO8601 compliant date. |
| dates_are_gmt | boolean | Interpret after and before as UTC dates when true. |
| exclude | array | Ensure result set excludes specific ids. |
| include | array | Limit result set to specific ids. |
| offset | integer | Offset the result set by a specific number of items. |
| order | string | Order sort attribute ascending or descending. Options: asc and desc. Default is desc. |
| orderby | string | Sort collection by resource attribute. Options: date, date_gmt, id, slug, include and product. Default is date_gmt. |
| reviewer | array | Limit result set to reviews assigned to specific user IDs. |
| reviewer_exclude | array | Ensure result set excludes reviews assigned to specific user IDs. |
| reviewer_email | array | Limit result set to that from a specific author email. |
| product | array | Limit result set to reviews assigned to specific product IDs. |
| status | string | Limit result set to reviews assigned a specific status. Options: all, hold, approved, spam and trash. Default is approved. |


## Update a product review[​](/docs/apis/rest-api/v3/product-reviews#update-a-product-review)


This API lets you make changes to a product review.


```
PUT /wp-json/wc/v3/products/reviews/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X PUT https://example.com/wp-json/wc/v3/products/reviews/20 \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "rating": 5}'
```

```
const data = {	rating: 5,};WooCommerce.put( 'products/reviews/20', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'rating' => 5];print_r($woocommerce->put('products/reviews/20', $data));?>
```

```
data = {    "rating": 5}print(wcapi.put("products/reviews/20", data).json())
```

```
data = {  rating: 5}woocommerce.put("products/reviews/20", data).parsed_response
```

```
{	"id": 20,	"date_created": "2018-09-08T21:47:19",	"date_created_gmt": "2018-09-09T00:47:19",	"product_id": 31,	"status": "approved",	"reviewer": "Claudio Sanches",	"reviewer_email": "john.doe@example.com",	"review": "Now works just fine.",	"rating": 5,	"verified": true,	"reviewer_avatar_urls": {		"24": "https://secure.gravatar.com/avatar/908480753c07509e76322dc17d305c8b?s=24&d=mm&r=g",		"48": "https://secure.gravatar.com/avatar/908480753c07509e76322dc17d305c8b?s=48&d=mm&r=g",		"96": "https://secure.gravatar.com/avatar/908480753c07509e76322dc17d305c8b?s=96&d=mm&r=g"	},	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/products/reviews/20"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/products/reviews"			}		],		"up": [			{				"href": "https://example.com/wp-json/wc/v3/products/31"			}		],		"reviewer": [			{				"embeddable": true,				"href": "https://example.com/wp-json/wp/v2/users/1"			}		]	}}
```


## Delete a product review[​](/docs/apis/rest-api/v3/product-reviews#delete-a-product-review)


This API helps you delete a product review.


```
DELETE /wp-json/wc/v3/products/reviews/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X DELETE https://example.com/wp-json/wc/v3/products/reviews/34?force=true \	-u consumer_key:consumer_secret
```

```
WooCommerce.delete( 'products/reviews/20', {	force: true,} )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->delete('products/reviews/20', ['force' => true])); ?>
```

```
print(wcapi.delete("products/reviews/20", params={"force": True}).json())
```

```
woocommerce.delete("products/reviews/20", force: true).parsed_response
```

```
{	"deleted": true,	"previous": {		"id": 20,		"date_created": "2018-09-08T21:47:19",		"date_created_gmt": "2018-09-09T00:47:19",		"product_id": 31,		"status": "trash",		"reviewer": "Claudio Sanches",		"reviewer_email": "john.doe@example.com",		"review": "Now works just fine.",		"rating": 5,		"verified": true,		"reviewer_avatar_urls": {			"24": "https://secure.gravatar.com/avatar/908480753c07509e76322dc17d305c8b?s=24&d=mm&r=g",			"48": "https://secure.gravatar.com/avatar/908480753c07509e76322dc17d305c8b?s=48&d=mm&r=g",			"96": "https://secure.gravatar.com/avatar/908480753c07509e76322dc17d305c8b?s=96&d=mm&r=g"		}	}}
```


#### Available parameters[​](/docs/apis/rest-api/v3/product-reviews#available-parameters-1)


| Parameter | Type | Description |
| --- | --- | --- |
| force | string | Required to be true, as resource does not support trashing. |


## Batch update product reviews[​](/docs/apis/rest-api/v3/product-reviews#batch-update-product-reviews)


This API helps you to batch create, update and delete multiple product reviews.

note
Note: By default it's limited to up to 100 objects to be created, updated or
deleted.


```
POST /wp-json/wc/v3/products/reviews/batch
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/products/reviews/batch \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "create": [    {      "product_id": 22,      "review": "Looks fine",      "reviewer": "John Doe",      "reviewer_email": "john.doe@example.com",      "rating": 4    },    {      "product_id": 22,      "review": "I love this album",      "reviewer": "John Doe",      "reviewer_email": "john.doe@example.com",      "rating": 5    }  ],  "update": [    {      "id": 7,      "reviewer": "John Doe",      "reviewer_email": "john.doe@example.com"    }  ],  "delete": [    22  ]}'
```

```
const data = {	create: [		{			product_id: 22,			review: 'Looks fine',			reviewer: 'John Doe',			reviewer_email: 'john.doe@example.com',			rating: 4,		},		{			product_id: 22,			review: 'I love this album',			reviewer: 'John Doe',			reviewer_email: 'john.doe@example.com',			rating: 5,		},	],	update: [		{			id: 7,			reviewer: 'John Doe',			reviewer_email: 'john.doe@example.com',		},	],	delete: [ 22 ],};WooCommerce.post( 'products/reviews/batch', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'create' => [        [            'product_id' => 22,            'review' => 'Looks fine',            'reviewer' => 'John Doe',            'reviewer_email' => 'john.doe@example.com',            'rating' => 4        ],        [            'product_id' => 22,            'review' => 'I love this album',            'reviewer' => 'John Doe',            'reviewer_email' => 'john.doe@example.com',            'rating' => 5        ]    ],    'update' => [        [            'id' => 7,            'reviewer' => 'John Doe',            'reviewer_email' => 'john.doe@example.com',        ]    ],    'delete' => [        22    ]];print_r($woocommerce->post('products/reviews/batch', $data));?>
```

```
data = {    "create": [        {            "product_id": 22,            "review": "Looks fine",            "reviewer": "John Doe",            "reviewer_email": "john.doe@example.com",            "rating": 4        },        {            "product_id": 22,            "review": "I love this album",            "reviewer": "John Doe",            "reviewer_email": "john.doe@example.com",            "rating": 5        }    ],    "update": [        {            "id": 7,            "reviewer": "John Doe",            "reviewer_email": "john.doe@example.com"        }    ],    "delete": [        22    ]}print(wcapi.post("products/reviews/batch", data).json())
```

```
data = {  create: [    {      product_id: "22",      review: "Looks fine",      reviewer: "John Doe",      reviewer_email: "john.doe@example.com",      rating: "4"    },    {      product_id: "22",      review: "I love this album",      reviewer: "John Doe",      reviewer_email: "john.doe@example.com",      rating: "5"    }  ],  update: [    {      id: 7,      reviewer: "John Doe",      reviewer_email: "john.doe@example.com"    }  ],  delete: [    22  ]}woocommerce.post("products/reviews/batch", data).parsed_response
```

```
{	"create": [		{			"id": 25,			"date_created": "2018-10-18T18:37:35",			"date_created_gmt": "2018-10-18T21:37:35",			"product_id": 22,			"status": "approved",			"reviewer": "John Doe",			"reviewer_email": "john.doe@example.com",			"review": "Looks fine",			"rating": 4,			"verified": false,			"reviewer_avatar_urls": {				"24": "https://secure.gravatar.com/avatar/8eb1b522f60d11fa897de1dc6351b7e8?s=24&d=mm&r=g",				"48": "https://secure.gravatar.com/avatar/8eb1b522f60d11fa897de1dc6351b7e8?s=48&d=mm&r=g",				"96": "https://secure.gravatar.com/avatar/8eb1b522f60d11fa897de1dc6351b7e8?s=96&d=mm&r=g"			},			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/reviews/25"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products/reviews"					}				],				"up": [					{						"href": "https://example.com/wp-json/wc/v3/products/22"					}				]			}		},		{			"id": 26,			"date_created": "2018-10-18T18:37:35",			"date_created_gmt": "2018-10-18T21:37:35",			"product_id": 22,			"status": "approved",			"reviewer": "John Doe",			"reviewer_email": "john.doe@example.com",			"review": "I love this album",			"rating": 5,			"verified": false,			"reviewer_avatar_urls": {				"24": "https://secure.gravatar.com/avatar/8eb1b522f60d11fa897de1dc6351b7e8?s=24&d=mm&r=g",				"48": "https://secure.gravatar.com/avatar/8eb1b522f60d11fa897de1dc6351b7e8?s=48&d=mm&r=g",				"96": "https://secure.gravatar.com/avatar/8eb1b522f60d11fa897de1dc6351b7e8?s=96&d=mm&r=g"			},			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/reviews/26"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products/reviews"					}				],				"up": [					{						"href": "https://example.com/wp-json/wc/v3/products/22"					}				]			}		}	],	"update": [		{			"id": 7,			"date_created": "2018-07-26T19:29:21",			"date_created_gmt": "2018-07-26T22:29:21",			"product_id": 66,			"status": "approved",			"reviewer": "John Doe",			"reviewer_email": "john.doe@example.com",			"review": "Not so bad :(",			"rating": 3,			"verified": false,			"reviewer_avatar_urls": {				"24": "https://secure.gravatar.com/avatar/8eb1b522f60d11fa897de1dc6351b7e8?s=24&d=mm&r=g",				"48": "https://secure.gravatar.com/avatar/8eb1b522f60d11fa897de1dc6351b7e8?s=48&d=mm&r=g",				"96": "https://secure.gravatar.com/avatar/8eb1b522f60d11fa897de1dc6351b7e8?s=96&d=mm&r=g"			},			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/products/reviews/7"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/products/reviews"					}				],				"up": [					{						"href": "https://example.com/wp-json/wc/v3/products/66"					}				]			}		}	],	"delete": [		{			"deleted": true,			"previous": {				"id": 22,				"date_created": "2018-10-18T17:59:17",				"date_created_gmt": "2018-10-18T20:59:17",				"product_id": 22,				"status": "approved",				"reviewer": "John Doe",				"reviewer_email": "john.doe@example.com",				"review": "Nice album!",				"rating": 5,				"verified": false,				"reviewer_avatar_urls": {					"24": "https://secure.gravatar.com/avatar/8eb1b522f60d11fa897de1dc6351b7e8?s=24&d=mm&r=g",					"48": "https://secure.gravatar.com/avatar/8eb1b522f60d11fa897de1dc6351b7e8?s=48&d=mm&r=g",					"96": "https://secure.gravatar.com/avatar/8eb1b522f60d11fa897de1dc6351b7e8?s=96&d=mm&r=g"				}			}		}	]}
```

---

<a name="reports"></a>

The reports API allows you to view all types of reports available.


## List all reports[​](/docs/apis/rest-api/v3/reports#list-all-reports)


This API lets you retrieve and view a simple list of available reports.


```
GET /wp-json/wc/v3/reports
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/reports \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'reports' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('reports')); ?>
```

```
print(wcapi.get("reports").json())
```

```
woocommerce.get("reports").parsed_response
```

```
[	{		"slug": "sales",		"description": "List of sales reports.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/reports/sales"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/reports"				}			]		}	},	{		"slug": "top_sellers",		"description": "List of top sellers products.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/reports/top_sellers"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/reports"				}			]		}	},	{		"slug": "orders/totals",		"description": "Orders totals.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/reports/orders/totals"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/reports"				}			]		}	},	{		"slug": "products/totals",		"description": "Products totals.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/reports/products/totals"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/reports"				}			]		}	},	{		"slug": "customers/totals",		"description": "Customers totals.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/reports/customers/totals"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/reports"				}			]		}	},	{		"slug": "coupons/totals",		"description": "Coupons totals.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/reports/coupons/totals"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/reports"				}			]		}	},	{		"slug": "reviews/totals",		"description": "Reviews totals.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/reports/reviews/totals"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/reports"				}			]		}	},	{		"slug": "categories/totals",		"description": "Categories totals.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/reports/categories/totals"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/reports"				}			]		}	},	{		"slug": "tags/totals",		"description": "Tags totals.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/reports/tags/totals"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/reports"				}			]		}	},	{		"slug": "attributes/totals",		"description": "Attributes totals.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/reports/attributes/totals"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/reports"				}			]		}	}]
```


## Retrieve sales report[​](/docs/apis/rest-api/v3/reports#retrieve-sales-report)


This API lets you retrieve and view a sales report.


```
GET /wp-json/wc/v3/reports/sales
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/reports/sales?date_min=2016-05-03&date_max=2016-05-04 \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'reports/sales', {	date_min: '2016-05-03',	date_max: '2016-05-04',} )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$query = [    'date_min' => '2016-05-03',    'date_max' => '2016-05-04'];print_r($woocommerce->get('reports/sales', $query));?>
```

```
print(wcapi.get("reports/sales?date_min=2016-05-03&date_max=2016-05-04").json())
```

```
query = {  date_min: "2016-05-03",  date_max: "2016-05-04"}woocommerce.get("reports/sales", query).parsed_response
```

```
[	{		"total_sales": "14.00",		"net_sales": "4.00",		"average_sales": "2.00",		"total_orders": 3,		"total_items": 6,		"total_tax": "0.00",		"total_shipping": "10.00",		"total_refunds": 0,		"total_discount": "0.00",		"totals_grouped_by": "day",		"totals": {			"2016-05-03": {				"sales": "14.00",				"orders": 3,				"items": 6,				"tax": "0.00",				"shipping": "10.00",				"discount": "0.00",				"customers": 0			},			"2016-05-04": {				"sales": "0.00",				"orders": 0,				"items": 0,				"tax": "0.00",				"shipping": "0.00",				"discount": "0.00",				"customers": 0			}		},		"total_customers": 0,		"_links": {			"about": [				{					"href": "https://example.com/wp-json/wc/v3/reports"				}			]		}	}]
```


#### Sales report properties[​](/docs/apis/rest-api/v3/reports#sales-report-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| total_sales | string | Gross sales in the period. READ-ONLY |
| net_sales | string | Net sales in the period. READ-ONLY |
| average_sales | string | Average net daily sales. READ-ONLY |
| total_orders | integer | Total of orders placed. READ-ONLY |
| total_items | integer | Total of items purchased. READ-ONLY |
| total_tax | string | Total charged for taxes. READ-ONLY |
| total_shipping | string | Total charged for shipping. READ-ONLY |
| total_refunds | integer | Total of refunded orders. READ-ONLY |
| total_discount | integer | Total of coupons used. READ-ONLY |
| totals_grouped_by | string | Group type. READ-ONLY |
| totals | array | Totals. READ-ONLY |


#### Available parameters[​](/docs/apis/rest-api/v3/reports#available-parameters)


| Parameter | Type | Description |
| --- | --- | --- |
| context | string | Scope under which the request is made; determines fields present in response. Default is view. Options: view. |
| period | string | Report period. Default is today's date. Options: week, month, last_month and year |
| date_min | string | Return sales for a specific start date, the date need to be in the YYYY-MM-DD format. |
| date_max | string | Return sales for a specific end date, the date need to be in the YYYY-MM-DD format. |


## Retrieve top sellers report[​](/docs/apis/rest-api/v3/reports#retrieve-top-sellers-report)


This API lets you retrieve and view a list of top sellers report.


```
GET /wp-json/wc/v3/reports/top_sellers
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/reports/top_sellers?period=last_month \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'reports/top_sellers', {	period: 'last_month',} )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$query = [    'period' => 'last_month'];print_r($woocommerce->get('reports/top_sellers', $query));?>
```

```
print(wcapi.get("reports/top_sellers?period=last_month").json())
```

```
query = {  period: "last_month"}woocommerce.get("reports/top_sellers", query).parsed_response
```

```
[	{		"title": "Happy Ninja",		"product_id": 37,		"quantity": 1,		"_links": {			"about": [				{					"href": "https://example.com/wp-json/wc/v3/reports"				}			],			"product": [				{					"href": "https://example.com/wp-json/wc/v3/products/37"				}			]		}	},	{		"title": "Woo Album #4",		"product_id": 96,		"quantity": 1,		"_links": {			"about": [				{					"href": "https://example.com/wp-json/wc/v3/reports"				}			],			"product": [				{					"href": "https://example.com/wp-json/wc/v3/products/96"				}			]		}	}]
```


#### Top sellers report properties[​](/docs/apis/rest-api/v3/reports#top-sellers-report-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| title | string | Product title. READ-ONLY |
| product_id | integer | Product ID. READ-ONLY |
| quantity | integer | Total number of purchases. READ-ONLY |


#### Available parameters[​](/docs/apis/rest-api/v3/reports#available-parameters-1)


| Parameter | Type | Description |
| --- | --- | --- |
| context | string | Scope under which the request is made; determines fields present in response. Default is view. Options: view. |
| period | string | Report period. Default is week. Options: week, month, last_month and year |
| date_min | string | Return sales for a specific start date, the date need to be in the YYYY-MM-DD format. |
| date_max | string | Return sales for a specific end date, the date need to be in the YYYY-MM-DD format. |


## Retrieve coupons totals[​](/docs/apis/rest-api/v3/reports#retrieve-coupons-totals)


This API lets you retrieve and view coupons totals report.


```
GET /wp-json/wc/v3/reports/coupons/totals
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/reports/coupons/totals \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'reports/coupons/totals' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?phpprint_r($woocommerce->get('reports/coupons/totals'));?>
```

```
print(wcapi.get("reports/coupons/totals").json())
```

```
woocommerce.get("reports/coupons/totals").parsed_response
```

```
[	{		"slug": "percent",		"name": "Percentage discount",		"total": 2	},	{		"slug": "fixed_cart",		"name": "Fixed cart discount",		"total": 1	},	{		"slug": "fixed_product",		"name": "Fixed product discount",		"total": 1	}]
```


#### Coupons totals properties[​](/docs/apis/rest-api/v3/reports#coupons-totals-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| slug | string | An alphanumeric identifier for the resource. READ-ONLY |
| name | string | Coupon type name. READ-ONLY |
| total | string | Amount of coupons. READ-ONLY |


## Retrieve customers totals[​](/docs/apis/rest-api/v3/reports#retrieve-customers-totals)


This API lets you retrieve and view customers totals report.


```
GET /wp-json/wc/v3/reports/customers/totals
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/reports/customers/totals \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'reports/customers/totals' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?phpprint_r($woocommerce->get('reports/customers/totals'));?>
```

```
print(wcapi.get("reports/customers/totals").json())
```

```
woocommerce.get("reports/customers/totals").parsed_response
```

```
[	{		"slug": "paying",		"name": "Paying customer",		"total": 2	},	{		"slug": "non_paying",		"name": "Non-paying customer",		"total": 1	}]
```


#### Customers totals properties[​](/docs/apis/rest-api/v3/reports#customers-totals-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| slug | string | An alphanumeric identifier for the resource. READ-ONLY |
| name | string | Customer type name. READ-ONLY |
| total | string | Amount of customers. READ-ONLY |


## Retrieve orders totals[​](/docs/apis/rest-api/v3/reports#retrieve-orders-totals)


This API lets you retrieve and view orders totals report.


```
GET /wp-json/wc/v3/reports/orders/totals
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/reports/orders/totals \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'reports/orders/totals' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?phpprint_r($woocommerce->get('reports/orders/totals'));?>
```

```
print(wcapi.get("reports/orders/totals").json())
```

```
woocommerce.get("reports/orders/totals").parsed_response
```

```
[	{		"slug": "pending",		"name": "Pending payment",		"total": 7	},	{		"slug": "processing",		"name": "Processing",		"total": 2	},	{		"slug": "on-hold",		"name": "On hold",		"total": 1	},	{		"slug": "completed",		"name": "Completed",		"total": 3	},	{		"slug": "cancelled",		"name": "Cancelled",		"total": 0	},	{		"slug": "refunded",		"name": "Refunded",		"total": 0	},	{		"slug": "failed",		"name": "Failed",		"total": 0	}]
```


#### Orders totals properties[​](/docs/apis/rest-api/v3/reports#orders-totals-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| slug | string | An alphanumeric identifier for the resource. READ-ONLY |
| name | string | Orders status name. READ-ONLY |
| total | string | Amount of orders. READ-ONLY |


## Retrieve products totals[​](/docs/apis/rest-api/v3/reports#retrieve-products-totals)


This API lets you retrieve and view products totals report.


```
GET /wp-json/wc/v3/reports/products/totals
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/reports/products/totals \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'reports/products/totals' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?phpprint_r($woocommerce->get('reports/products/totals'));?>
```

```
print(wcapi.get("reports/products/totals").json())
```

```
woocommerce.get("reports/products/totals").parsed_response
```

```
[	{		"slug": "external",		"name": "External/Affiliate product",		"total": 1	},	{		"slug": "grouped",		"name": "Grouped product",		"total": 1	},	{		"slug": "simple",		"name": "Simple product",		"total": 21	},	{		"slug": "variable",		"name": "Variable product",		"total": 3	}]
```


#### Products totals properties[​](/docs/apis/rest-api/v3/reports#products-totals-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| slug | string | An alphanumeric identifier for the resource. READ-ONLY |
| name | string | Product type name. READ-ONLY |
| total | string | Amount of products. READ-ONLY |


## Retrieve reviews totals[​](/docs/apis/rest-api/v3/reports#retrieve-reviews-totals)


This API lets you retrieve and view reviews totals report.


```
GET /wp-json/wc/v3/reports/reviews/totals
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/reports/reviews/totals \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'reports/reviews/totals' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?phpprint_r($woocommerce->get('reports/reviews/totals'));?>
```

```
print(wcapi.get("reports/reviews/totals").json())
```

```
woocommerce.get("reports/reviews/totals").parsed_response
```

```
[	{		"slug": "rated_1_out_of_5",		"name": "Rated 1 out of 5",		"total": 1	},	{		"slug": "rated_2_out_of_5",		"name": "Rated 2 out of 5",		"total": 0	},	{		"slug": "rated_3_out_of_5",		"name": "Rated 3 out of 5",		"total": 3	},	{		"slug": "rated_4_out_of_5",		"name": "Rated 4 out of 5",		"total": 0	},	{		"slug": "rated_5_out_of_5",		"name": "Rated 5 out of 5",		"total": 4	}]
```


#### Reviews totals properties[​](/docs/apis/rest-api/v3/reports#reviews-totals-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| slug | string | An alphanumeric identifier for the resource. READ-ONLY |
| name | string | Review type name. READ-ONLY |
| total | string | Amount of reviews. READ-ONLY |

---

<a name="refunds"></a>

The refunds API is a simple, read-only endpoint that allows you to retrieve a list of refunds outside the context of an existing order. To create, view, and delete individual refunds, check out the [order refunds API](/docs/apis/rest-api/v3/order-refunds/).


## Refund properties[​](/docs/apis/rest-api/v3/refunds#refund-properties)


All properties are the same as those in the [order refunds endpoint](/docs/apis/rest-api/v3/order-refunds/#order-refund-properties), but with one additional property:


| Attribute | Type | Description |
| --- | --- | --- |
| parent_id | integer | The ID of the order the refund is associated with. |


## Retrieve a list of refunds[​](/docs/apis/rest-api/v3/refunds#retrieve-a-list-of-refunds)


This API lets you retrieve and view refunds from your store, regardless of which order they are associated with.


```
GET /wp-json/wc/v3/refunds
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/refunds \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'refunds' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('refunds')); ?>
```

```
print(wcapi.get("refunds").json())
```

```
woocommerce.get("refunds").parsed_response
```

```
[	{		"id": 726,		"parent_id": 124,		"date_created": "2017-03-21T17:07:11",		"date_created_gmt": "2017-03-21T20:07:11",		"amount": "10.00",		"reason": "",		"refunded_by": 1,		"refunded_payment": false,		"meta_data": [],		"line_items": [],		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/orders/723/refunds/726"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/orders/723/refunds"				}			],			"up": [				{					"href": "https://example.com/wp-json/wc/v3/orders/723"				}			]		}	},	{		"id": 724,		"parent_id": 63,		"date_created": "2017-03-21T16:55:37",		"date_created_gmt": "2017-03-21T19:55:37",		"amount": "9.00",		"reason": "",		"refunded_by": 1,		"refunded_payment": false,		"meta_data": [],		"line_items": [			{				"id": 314,				"name": "Woo Album #2",				"product_id": 87,				"variation_id": 0,				"quantity": -1,				"tax_class": "",				"subtotal": "-9.00",				"subtotal_tax": "0.00",				"total": "-9.00",				"total_tax": "0.00",				"taxes": [],				"meta_data": [					{						"id": 2076,						"key": "_refunded_item_id",						"value": "311"					}				],				"sku": "",				"price": -9			}		],		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/orders/723/refunds/724"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/orders/723/refunds"				}			],			"up": [				{					"href": "https://example.com/wp-json/wc/v3/orders/723"				}			]		}	}]
```


#### Available parameters[​](/docs/apis/rest-api/v3/refunds#available-parameters)


| Parameter | Type | Description |
| --- | --- | --- |
| context | string | Scope under which the request is made; determines fields present in response. Options: view and edit. Default is view. |
| page | integer | Current page of the collection. Default is 1. |
| per_page | integer | Maximum number of items to be returned in result set. Default is 10. |
| search | string | Limit results to those matching a string. |
| after | string | Limit response to resources published after a given ISO8601 compliant date. |
| before | string | Limit response to resources published before a given ISO8601 compliant date. |
| exclude | array | Ensure result set excludes specific IDs. |
| include | array | Limit result set to specific ids. |
| offset | integer | Offset the result set by a specific number of items. |
| order | string | Order sort attribute ascending or descending. Options: asc and desc. Default is desc. |
| orderby | string | Sort collection by object attribute. Options: date, modified, id, include, title and slug. Default is date. |
| parent | array | Limit result set to those of particular parent IDs. |
| parent_exclude | array | Limit result set to all items except those of a particular parent ID. |
| dp | integer | Number of decimal points to use in each resource. Default is 2. |

---

<a name="taxes"></a>

The taxes API allows you to create, view, update, and delete individual tax rates, or a batch of tax rates.


## Tax rate properties[​](/docs/apis/rest-api/v3/taxes#tax-rate-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Unique identifier for the resource. READ-ONLY |
| country | string | Country ISO 3166 code. See ISO 3166 Codes (Countries) for more details |
| state | string | State code. |
| postcode | string | Postcode/ZIP, it doesn't support multiple values. Deprecated as of WooCommerce 5.3, postcodes should be used instead. |
| city | string | City name, it doesn't support multiple values. Deprecated as of WooCommerce 5.3, postcodes should be used instead. |
| postcodes | string[] | Postcodes/ZIPs. Introduced in WooCommerce 5.3. |
| cities | string[] | City names. Introduced in WooCommerce 5.3. |
| rate | string | Tax rate. |
| name | string | Tax rate name. |
| priority | integer | Tax priority. Only 1 matching rate per priority will be used. To define multiple tax rates for a single area you need to specify a different priority per rate. Default is 1. |
| compound | boolean | Whether or not this is a compound tax rate. Compound rates are applied on top of other tax rates. Default is false. |
| shipping | boolean | Whether or not this tax rate also gets applied to shipping. Default is true. |
| order | integer | Indicates the order that will appear in queries. |
| class | string | Tax class. Default is standard. |


## Create a tax rate[​](/docs/apis/rest-api/v3/taxes#create-a-tax-rate)


This API helps you to create a new tax rate.


```
POST /wp-json/wc/v3/taxes
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/taxes \    -u consumer_key:consumer_secret \    -H "Content-Type: application/json" \    -d '{  "country": "US",  "state": "AL",  "cities": ["Alpine", "Brookside", "Cardiff"],  "postcodes": ["35014", "35036", "35041"],  "rate": "4",  "name": "State Tax",  "shipping": false}'
```

```
const data = {	country: 'US',	state: 'AL',	cities: [ 'Alpine', 'Brookside', 'Cardiff' ],	postcodes: [ '35014', '35036', '35041' ],	rate: '4',	name: 'State Tax',	shipping: false,};WooCommerce.post( 'taxes', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'country' => 'US',    'state' => 'AL',    'cities' => ['Alpine', 'Brookside', 'Cardiff'],    'postcodes' => ['35014', '35036', '35041'],    'rate' => '4',    'name' => 'State Tax',    'shipping' => false];print_r($woocommerce->post('taxes', $data));?>
```

```
data = {    "country": "US",    "state": "AL",    "cities": ["Alpine", "Brookside", "Cardiff"],    "postcodes": ["35014", "35036", "35041"],    "rate": "4",    "name": "State Tax",    "shipping": False}print(wcapi.post("taxes", data).json())
```

```
data = {  country: "US",  state: "AL",  cities: ["Alpine", "Brookside", "Cardiff"],  postcodes: ["35014", "35036", "35041"],  rate: "4",  name: "State Tax",  shipping: false}woocommerce.post("taxes", data).parsed_response
```

```
{	"id": 72,	"country": "US",	"state": "AL",	"postcode": "35041",	"city": "Cardiff",	"postcodes": [ "35014", "35036", "35041" ],	"cities": [ "Alpine", "Brookside", "Cardiff" ],	"rate": "4.0000",	"name": "State Tax",	"priority": 0,	"compound": false,	"shipping": false,	"order": 1,	"class": "standard",	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/taxes/72"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/taxes"			}		]	}}
```


## Retrieve a tax rate[​](/docs/apis/rest-api/v3/taxes#retrieve-a-tax-rate)


This API lets you retrieve and view a specific tax rate by ID.


```
GET /wp-json/wc/v3/taxes/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/taxes/72 \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'taxes/72' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('taxes/72')); ?>
```

```
print(wcapi.get("taxes/72").json())
```

```
woocommerce.get("taxes/72").parsed_response
```

```
{	"id": 72,	"country": "US",	"state": "AL",	"postcode": "35041",	"city": "Cardiff",	"postcodes": [ "35014", "35036", "35041" ],	"cities": [ "Alpine", "Brookside", "Cardiff" ],	"rate": "4.0000",	"name": "State Tax",	"priority": 0,	"compound": false,	"shipping": false,	"order": 1,	"class": "standard",	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/taxes/72"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/taxes"			}		]	}}
```


## List all tax rates[​](/docs/apis/rest-api/v3/taxes#list-all-tax-rates)


This API helps you to view all the tax rates.


```
GET /wp-json/wc/v3/taxes
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/taxes \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'taxes' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('taxes')); ?>
```

```
print(wcapi.get("taxes").json())
```

```
woocommerce.get("taxes").parsed_response
```

```
[	{		"id": 72,		"country": "US",		"state": "AL",		"postcode": "35041",		"city": "Cardiff",		"postcodes": [ "35014", "35036", "35041" ],		"cities": [ "Alpine", "Brookside", "Cardiff" ],		"rate": "4.0000",		"name": "State Tax",		"priority": 0,		"compound": false,		"shipping": false,		"order": 1,		"class": "standard",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/taxes/72"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/taxes"				}			]		}	},	{		"id": 73,		"country": "US",		"state": "AZ",		"postcode": "",		"city": "",		"postcodes": [],		"cities": [],		"rate": "5.6000",		"name": "State Tax",		"priority": 0,		"compound": false,		"shipping": false,		"order": 2,		"class": "standard",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/taxes/73"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/taxes"				}			]		}	},	{		"id": 74,		"country": "US",		"state": "AR",		"postcode": "",		"city": "",		"postcodes": [],		"cities": [],		"rate": "6.5000",		"name": "State Tax",		"priority": 0,		"compound": false,		"shipping": true,		"order": 3,		"class": "standard",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/taxes/74"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/taxes"				}			]		}	},	{		"id": 75,		"country": "US",		"state": "CA",		"postcode": "",		"city": "",		"postcodes": [],		"cities": [],		"rate": "7.5000",		"name": "State Tax",		"priority": 0,		"compound": false,		"shipping": false,		"order": 4,		"class": "standard",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/taxes/75"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/taxes"				}			]		}	},	{		"id": 76,		"country": "US",		"state": "CO",		"postcode": "",		"city": "",		"postcodes": [],		"cities": [],		"rate": "2.9000",		"name": "State Tax",		"priority": 0,		"compound": false,		"shipping": false,		"order": 5,		"class": "standard",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/taxes/76"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/taxes"				}			]		}	},	{		"id": 77,		"country": "US",		"state": "CT",		"postcode": "",		"city": "",		"postcodes": [],		"cities": [],		"rate": "6.3500",		"name": "State Tax",		"priority": 0,		"compound": false,		"shipping": true,		"order": 6,		"class": "standard",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/taxes/77"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/taxes"				}			]		}	},	{		"id": 78,		"country": "US",		"state": "DC",		"postcode": "",		"city": "",		"postcodes": [],		"cities": [],		"rate": "5.7500",		"name": "State Tax",		"priority": 0,		"compound": false,		"shipping": true,		"order": 7,		"class": "standard",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/taxes/78"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/taxes"				}			]		}	},	{		"id": 79,		"country": "US",		"state": "FL",		"postcode": "",		"city": "",		"postcodes": [],		"cities": [],		"rate": "6.0000",		"name": "State Tax",		"priority": 0,		"compound": false,		"shipping": true,		"order": 8,		"class": "standard",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/taxes/79"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/taxes"				}			]		}	},	{		"id": 80,		"country": "US",		"state": "GA",		"postcode": "",		"city": "",		"postcodes": [],		"cities": [],		"rate": "4.0000",		"name": "State Tax",		"priority": 0,		"compound": false,		"shipping": true,		"order": 9,		"class": "standard",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/taxes/80"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/taxes"				}			]		}	},	{		"id": 81,		"country": "US",		"state": "GU",		"postcode": "",		"city": "",		"postcodes": [],		"cities": [],		"rate": "4.0000",		"name": "State Tax",		"priority": 0,		"compound": false,		"shipping": false,		"order": 10,		"class": "standard",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/taxes/81"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/taxes"				}			]		}	}]
```


#### Available parameters[​](/docs/apis/rest-api/v3/taxes#available-parameters)


| Parameter | Type | Description |
| --- | --- | --- |
| context | string | Scope under which the request is made; determines fields present in response. Options: view and edit. |
| page | integer | Current page of the collection. |
| per_page | integer | Maximum number of items to be returned in result set. |
| offset | integer | Offset the result set by a specific number of items. |
| order | string | Order sort attribute ascending or descending. Default is asc. Options: asc and desc. |
| orderby | string | Sort collection by object attribute. Default is order. Options: id, order and priority. |
| class | string | Retrieve only tax rates of this Tax class. |


## Update a tax rate[​](/docs/apis/rest-api/v3/taxes#update-a-tax-rate)


This API lets you make changes to a tax rate.


```
PUT /wp-json/wc/v3/taxes/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X PUT https://example.com/wp-json/wc/v3/taxes/72 \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "name": "US Tax"}'
```

```
const data = {	name: 'US Tax',};WooCommerce.put( 'taxes/72', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'name' => 'US Tax'];print_r($woocommerce->put('taxes/72', $data));?>
```

```
data = {    "name": "US Tax"}print(wcapi.put("taxes/72", data).json())
```

```
data = {  name: "US Tax"}woocommerce.put("taxes/72", data).parsed_response
```

```
{	"id": 72,	"country": "US",	"state": "AL",	"postcode": "35041",	"city": "Cardiff",	"postcodes": [ "35014", "35036", "35041" ],	"cities": [ "Alpine", "Brookside", "Cardiff" ],	"rate": "4.0000",	"name": "US Tax",	"priority": 0,	"compound": false,	"shipping": false,	"order": 1,	"class": "standard",	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/taxes/72"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/taxes"			}		]	}}
```


## Delete a tax rate[​](/docs/apis/rest-api/v3/taxes#delete-a-tax-rate)


This API helps you delete a tax rate.


```
DELETE /wp-json/wc/v3/taxes/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X DELETE https://example.com/wp-json/wc/v3/taxes/72?force=true \	-u consumer_key:consumer_secret
```

```
WooCommerce.delete( 'taxes/72', {	force: true,} )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->delete('taxes/72', ['force' => true])); ?>
```

```
print(wcapi.delete("taxes/72", params={"force": True}).json())
```

```
woocommerce.delete("taxes/72", force: true).parsed_response
```

```
{	"id": 72,	"country": "US",	"state": "AL",	"postcode": "35041",	"city": "Cardiff",	"postcodes": [ "35014", "35036", "35041" ],	"cities": [ "Alpine", "Brookside", "Cardiff" ],	"rate": "4.0000",	"name": "US Tax",	"priority": 0,	"compound": false,	"shipping": false,	"order": 1,	"class": "standard",	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/taxes/72"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/taxes"			}		]	}}
```


#### Available parameters[​](/docs/apis/rest-api/v3/taxes#available-parameters-1)


| Parameter | Type | Description |
| --- | --- | --- |
| force | string | Required to be true, as resource does not support trashing. |


## Batch update tax rates[​](/docs/apis/rest-api/v3/taxes#batch-update-tax-rates)


This API helps you to batch create, update and delete multiple tax rates.

note
Note: By default it's limited to up to 100 objects to be created, updated or
deleted.


```
POST /wp-json/wc/v3/taxes/batch
```


> Example batch creating all US taxes:


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/taxes/batch \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "create": [    {      "country": "US",      "state": "AL",      "rate": "4.0000",      "name": "State Tax",      "shipping": false,      "order": 1    },    {      "country": "US",      "state": "AZ",      "rate": "5.6000",      "name": "State Tax",      "shipping": false,      "order": 2    },    {      "country": "US",      "state": "AR",      "rate": "6.5000",      "name": "State Tax",      "shipping": true,      "order": 3    },    {      "country": "US",      "state": "CA",      "rate": "7.5000",      "name": "State Tax",      "shipping": false,      "order": 4    },    {      "country": "US",      "state": "CO",      "rate": "2.9000",      "name": "State Tax",      "shipping": false,      "order": 5    },    {      "country": "US",      "state": "CT",      "rate": "6.3500",      "name": "State Tax",      "shipping": true,      "order": 6    },    {      "country": "US",      "state": "DC",      "rate": "5.7500",      "name": "State Tax",      "shipping": true,      "order": 7    },    {      "country": "US",      "state": "FL",      "rate": "6.0000",      "name": "State Tax",      "shipping": true,      "order": 8    },    {      "country": "US",      "state": "GA",      "rate": "4.0000",      "name": "State Tax",      "shipping": true,      "order": 9    },    {      "country": "US",      "state": "GU",      "rate": "4.0000",      "name": "State Tax",      "shipping": false,      "order": 10    },    {      "country": "US",      "state": "HI",      "rate": "4.0000",      "name": "State Tax",      "shipping": true,      "order": 11    },    {      "country": "US",      "state": "ID",      "rate": "6.0000",      "name": "State Tax",      "shipping": false,      "order": 12    },    {      "country": "US",      "state": "IL",      "rate": "6.2500",      "name": "State Tax",      "shipping": false,      "order": 13    },    {      "country": "US",      "state": "IN",      "rate": "7.0000",      "name": "State Tax",      "shipping": false,      "order": 14    },    {      "country": "US",      "state": "IA",      "rate": "6.0000",      "name": "State Tax",      "shipping": false,      "order": 15    },    {      "country": "US",      "state": "KS",      "rate": "6.1500",      "name": "State Tax",      "shipping": true,      "order": 16    },    {      "country": "US",      "state": "KY",      "rate": "6.0000",      "name": "State Tax",      "shipping": true,      "order": 17    },    {      "country": "US",      "state": "LA",      "rate": "4.0000",      "name": "State Tax",      "shipping": false,      "order": 18    },    {      "country": "US",      "state": "ME",      "rate": "5.5000",      "name": "State Tax",      "shipping": false,      "order": 19    },    {      "country": "US",      "state": "MD",      "rate": "6.0000",      "name": "State Tax",      "shipping": false,      "order": 20    },    {      "country": "US",      "state": "MA",      "rate": "6.2500",      "name": "State Tax",      "shipping": false,      "order": 21    },    {      "country": "US",      "state": "MI",      "rate": "6.0000",      "name": "State Tax",      "shipping": true,      "order": 22    },    {      "country": "US",      "state": "MN",      "rate": "6.8750",      "name": "State Tax",      "shipping": true,      "order": 23    },    {      "country": "US",      "state": "MS",      "rate": "7.0000",      "name": "State Tax",      "shipping": true,      "order": 24    },    {      "country": "US",      "state": "MO",      "rate": "4.2250",      "name": "State Tax",      "shipping": false,      "order": 25    },    {      "country": "US",      "state": "NE",      "rate": "5.5000",      "name": "State Tax",      "shipping": true,      "order": 26    },    {      "country": "US",      "state": "NV",      "rate": "6.8500",      "name": "State Tax",      "shipping": false,      "order": 27    },    {      "country": "US",      "state": "NJ",      "rate": "7.0000",      "name": "State Tax",      "shipping": true,      "order": 28    },    {      "country": "US",      "state": "NM",      "rate": "5.1250",      "name": "State Tax",      "shipping": true,      "order": 29    },    {      "country": "US",      "state": "NY",      "rate": "4.0000",      "name": "State Tax",      "shipping": true,      "order": 30    },    {      "country": "US",      "state": "NC",      "rate": "4.7500",      "name": "State Tax",      "shipping": true,      "order": 31    },    {      "country": "US",      "state": "ND",      "rate": "5.0000",      "name": "State Tax",      "shipping": true,      "order": 32    },    {      "country": "US",      "state": "OH",      "rate": "5.7500",      "name": "State Tax",      "shipping": true,      "order": 33    },    {      "country": "US",      "state": "OK",      "rate": "4.5000",      "name": "State Tax",      "shipping": false,      "order": 34    },    {      "country": "US",      "state": "PA",      "rate": "6.0000",      "name": "State Tax",      "shipping": true,      "order": 35    },    {      "country": "US",      "state": "PR",      "rate": "6.0000",      "name": "State Tax",      "shipping": false,      "order": 36    },    {      "country": "US",      "state": "RI",      "rate": "7.0000",      "name": "State Tax",      "shipping": false,      "order": 37    },    {      "country": "US",      "state": "SC",      "rate": "6.0000",      "name": "State Tax",      "shipping": true,      "order": 38    },    {      "country": "US",      "state": "SD",      "rate": "4.0000",      "name": "State Tax",      "shipping": true,      "order": 39    },    {      "country": "US",      "state": "TN",      "rate": "7.0000",      "name": "State Tax",      "shipping": true,      "order": 40    },    {      "country": "US",      "state": "TX",      "rate": "6.2500",      "name": "State Tax",      "shipping": true,      "order": 41    },    {      "country": "US",      "state": "UT",      "rate": "5.9500",      "name": "State Tax",      "shipping": false,      "order": 42    },    {      "country": "US",      "state": "VT",      "rate": "6.0000",      "name": "State Tax",      "shipping": true,      "order": 43    },    {      "country": "US",      "state": "VA",      "rate": "5.3000",      "name": "State Tax",      "shipping": false,      "order": 44    },    {      "country": "US",      "state": "WA",      "rate": "6.5000",      "name": "State Tax",      "shipping": true,      "order": 45    },    {      "country": "US",      "state": "WV",      "rate": "6.0000",      "name": "State Tax",      "shipping": true,      "order": 46    },    {      "country": "US",      "state": "WI",      "rate": "5.0000",      "name": "State Tax",      "shipping": true,      "order": 47    },    {      "country": "US",      "state": "WY",      "rate": "4.0000",      "name": "State Tax",      "shipping": true,      "order": 48    }  ]}'
```

```
const data = {	create: [		{			country: 'US',			state: 'AL',			rate: '4.0000',			name: 'State Tax',			shipping: false,			order: 1,		},		{			country: 'US',			state: 'AZ',			rate: '5.6000',			name: 'State Tax',			shipping: false,			order: 2,		},		{			country: 'US',			state: 'AR',			rate: '6.5000',			name: 'State Tax',			shipping: true,			order: 3,		},		{			country: 'US',			state: 'CA',			rate: '7.5000',			name: 'State Tax',			shipping: false,			order: 4,		},		{			country: 'US',			state: 'CO',			rate: '2.9000',			name: 'State Tax',			shipping: false,			order: 5,		},		{			country: 'US',			state: 'CT',			rate: '6.3500',			name: 'State Tax',			shipping: true,			order: 6,		},		{			country: 'US',			state: 'DC',			rate: '5.7500',			name: 'State Tax',			shipping: true,			order: 7,		},		{			country: 'US',			state: 'FL',			rate: '6.0000',			name: 'State Tax',			shipping: true,			order: 8,		},		{			country: 'US',			state: 'GA',			rate: '4.0000',			name: 'State Tax',			shipping: true,			order: 9,		},		{			country: 'US',			state: 'GU',			rate: '4.0000',			name: 'State Tax',			shipping: false,			order: 10,		},		{			country: 'US',			state: 'HI',			rate: '4.0000',			name: 'State Tax',			shipping: true,			order: 11,		},		{			country: 'US',			state: 'ID',			rate: '6.0000',			name: 'State Tax',			shipping: false,			order: 12,		},		{			country: 'US',			state: 'IL',			rate: '6.2500',			name: 'State Tax',			shipping: false,			order: 13,		},		{			country: 'US',			state: 'IN',			rate: '7.0000',			name: 'State Tax',			shipping: false,			order: 14,		},		{			country: 'US',			state: 'IA',			rate: '6.0000',			name: 'State Tax',			shipping: false,			order: 15,		},		{			country: 'US',			state: 'KS',			rate: '6.1500',			name: 'State Tax',			shipping: true,			order: 16,		},		{			country: 'US',			state: 'KY',			rate: '6.0000',			name: 'State Tax',			shipping: true,			order: 17,		},		{			country: 'US',			state: 'LA',			rate: '4.0000',			name: 'State Tax',			shipping: false,			order: 18,		},		{			country: 'US',			state: 'ME',			rate: '5.5000',			name: 'State Tax',			shipping: false,			order: 19,		},		{			country: 'US',			state: 'MD',			rate: '6.0000',			name: 'State Tax',			shipping: false,			order: 20,		},		{			country: 'US',			state: 'MA',			rate: '6.2500',			name: 'State Tax',			shipping: false,			order: 21,		},		{			country: 'US',			state: 'MI',			rate: '6.0000',			name: 'State Tax',			shipping: true,			order: 22,		},		{			country: 'US',			state: 'MN',			rate: '6.8750',			name: 'State Tax',			shipping: true,			order: 23,		},		{			country: 'US',			state: 'MS',			rate: '7.0000',			name: 'State Tax',			shipping: true,			order: 24,		},		{			country: 'US',			state: 'MO',			rate: '4.2250',			name: 'State Tax',			shipping: false,			order: 25,		},		{			country: 'US',			state: 'NE',			rate: '5.5000',			name: 'State Tax',			shipping: true,			order: 26,		},		{			country: 'US',			state: 'NV',			rate: '6.8500',			name: 'State Tax',			shipping: false,			order: 27,		},		{			country: 'US',			state: 'NJ',			rate: '7.0000',			name: 'State Tax',			shipping: true,			order: 28,		},		{			country: 'US',			state: 'NM',			rate: '5.1250',			name: 'State Tax',			shipping: true,			order: 29,		},		{			country: 'US',			state: 'NY',			rate: '4.0000',			name: 'State Tax',			shipping: true,			order: 30,		},		{			country: 'US',			state: 'NC',			rate: '4.7500',			name: 'State Tax',			shipping: true,			order: 31,		},		{			country: 'US',			state: 'ND',			rate: '5.0000',			name: 'State Tax',			shipping: true,			order: 32,		},		{			country: 'US',			state: 'OH',			rate: '5.7500',			name: 'State Tax',			shipping: true,			order: 33,		},		{			country: 'US',			state: 'OK',			rate: '4.5000',			name: 'State Tax',			shipping: false,			order: 34,		},		{			country: 'US',			state: 'PA',			rate: '6.0000',			name: 'State Tax',			shipping: true,			order: 35,		},		{			country: 'US',			state: 'PR',			rate: '6.0000',			name: 'State Tax',			shipping: false,			order: 36,		},		{			country: 'US',			state: 'RI',			rate: '7.0000',			name: 'State Tax',			shipping: false,			order: 37,		},		{			country: 'US',			state: 'SC',			rate: '6.0000',			name: 'State Tax',			shipping: true,			order: 38,		},		{			country: 'US',			state: 'SD',			rate: '4.0000',			name: 'State Tax',			shipping: true,			order: 39,		},		{			country: 'US',			state: 'TN',			rate: '7.0000',			name: 'State Tax',			shipping: true,			order: 40,		},		{			country: 'US',			state: 'TX',			rate: '6.2500',			name: 'State Tax',			shipping: true,			order: 41,		},		{			country: 'US',			state: 'UT',			rate: '5.9500',			name: 'State Tax',			shipping: false,			order: 42,		},		{			country: 'US',			state: 'VT',			rate: '6.0000',			name: 'State Tax',			shipping: true,			order: 43,		},		{			country: 'US',			state: 'VA',			rate: '5.3000',			name: 'State Tax',			shipping: false,			order: 44,		},		{			country: 'US',			state: 'WA',			rate: '6.5000',			name: 'State Tax',			shipping: true,			order: 45,		},		{			country: 'US',			state: 'WV',			rate: '6.0000',			name: 'State Tax',			shipping: true,			order: 46,		},		{			country: 'US',			state: 'WI',			rate: '5.0000',			name: 'State Tax',			shipping: true,			order: 47,		},		{			country: 'US',			state: 'WY',			rate: '4.0000',			name: 'State Tax',			shipping: true,			order: 48,		},	],};WooCommerce.post( 'taxes/batch', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'create' => [        [            'country' => 'US',            'state' => 'AL',            'rate' => '4.0000',            'name' => 'State Tax',            'shipping' => false,            'order' => 1        ],        [            'country' => 'US',            'state' => 'AZ',            'rate' => '5.6000',            'name' => 'State Tax',            'shipping' => false,            'order' => 2        ],        [            'country' => 'US',            'state' => 'AR',            'rate' => '6.5000',            'name' => 'State Tax',            'shipping' => true,            'order' => 3        ],        [            'country' => 'US',            'state' => 'CA',            'rate' => '7.5000',            'name' => 'State Tax',            'shipping' => false,            'order' => 4        ],        [            'country' => 'US',            'state' => 'CO',            'rate' => '2.9000',            'name' => 'State Tax',            'shipping' => false,            'order' => 5        ],        [            'country' => 'US',            'state' => 'CT',            'rate' => '6.3500',            'name' => 'State Tax',            'shipping' => true,            'order' => 6        ],        [            'country' => 'US',            'state' => 'DC',            'rate' => '5.7500',            'name' => 'State Tax',            'shipping' => true,            'order' => 7        ],        [            'country' => 'US',            'state' => 'FL',            'rate' => '6.0000',            'name' => 'State Tax',            'shipping' => true,            'order' => 8        ],        [            'country' => 'US',            'state' => 'GA',            'rate' => '4.0000',            'name' => 'State Tax',            'shipping' => true,            'order' => 9        ],        [            'country' => 'US',            'state' => 'GU',            'rate' => '4.0000',            'name' => 'State Tax',            'shipping' => false,            'order' => 10        ],        [            'country' => 'US',            'state' => 'HI',            'rate' => '4.0000',            'name' => 'State Tax',            'shipping' => true,            'order' => 11        ],        [            'country' => 'US',            'state' => 'ID',            'rate' => '6.0000',            'name' => 'State Tax',            'shipping' => false,            'order' => 12        ],        [            'country' => 'US',            'state' => 'IL',            'rate' => '6.2500',            'name' => 'State Tax',            'shipping' => false,            'order' => 13        ],        [            'country' => 'US',            'state' => 'IN',            'rate' => '7.0000',            'name' => 'State Tax',            'shipping' => false,            'order' => 14        ],        [            'country' => 'US',            'state' => 'IA',            'rate' => '6.0000',            'name' => 'State Tax',            'shipping' => false,            'order' => 15        ],        [            'country' => 'US',            'state' => 'KS',            'rate' => '6.1500',            'name' => 'State Tax',            'shipping' => true,            'order' => 16        ],        [            'country' => 'US',            'state' => 'KY',            'rate' => '6.0000',            'name' => 'State Tax',            'shipping' => true,            'order' => 17        ],        [            'country' => 'US',            'state' => 'LA',            'rate' => '4.0000',            'name' => 'State Tax',            'shipping' => false,            'order' => 18        ],        [            'country' => 'US',            'state' => 'ME',            'rate' => '5.5000',            'name' => 'State Tax',            'shipping' => false,            'order' => 19        ],        [            'country' => 'US',            'state' => 'MD',            'rate' => '6.0000',            'name' => 'State Tax',            'shipping' => false,            'order' => 20        ],        [            'country' => 'US',            'state' => 'MA',            'rate' => '6.2500',            'name' => 'State Tax',            'shipping' => false,            'order' => 21        ],        [            'country' => 'US',            'state' => 'MI',            'rate' => '6.0000',            'name' => 'State Tax',            'shipping' => true,            'order' => 22        ],        [            'country' => 'US',            'state' => 'MN',            'rate' => '6.8750',            'name' => 'State Tax',            'shipping' => true,            'order' => 23        ],        [            'country' => 'US',            'state' => 'MS',            'rate' => '7.0000',            'name' => 'State Tax',            'shipping' => true,            'order' => 24        ],        [            'country' => 'US',            'state' => 'MO',            'rate' => '4.2250',            'name' => 'State Tax',            'shipping' => false,            'order' => 25        ],        [            'country' => 'US',            'state' => 'NE',            'rate' => '5.5000',            'name' => 'State Tax',            'shipping' => true,            'order' => 26        ],        [            'country' => 'US',            'state' => 'NV',            'rate' => '6.8500',            'name' => 'State Tax',            'shipping' => false,            'order' => 27        ],        [            'country' => 'US',            'state' => 'NJ',            'rate' => '7.0000',            'name' => 'State Tax',            'shipping' => true,            'order' => 28        ],        [            'country' => 'US',            'state' => 'NM',            'rate' => '5.1250',            'name' => 'State Tax',            'shipping' => true,            'order' => 29        ],        [            'country' => 'US',            'state' => 'NY',            'rate' => '4.0000',            'name' => 'State Tax',            'shipping' => true,            'order' => 30        ],        [            'country' => 'US',            'state' => 'NC',            'rate' => '4.7500',            'name' => 'State Tax',            'shipping' => true,            'order' => 31        ],        [            'country' => 'US',            'state' => 'ND',            'rate' => '5.0000',            'name' => 'State Tax',            'shipping' => true,            'order' => 32        ],        [            'country' => 'US',            'state' => 'OH',            'rate' => '5.7500',            'name' => 'State Tax',            'shipping' => true,            'order' => 33        ],        [            'country' => 'US',            'state' => 'OK',            'rate' => '4.5000',            'name' => 'State Tax',            'shipping' => false,            'order' => 34        ],        [            'country' => 'US',            'state' => 'PA',            'rate' => '6.0000',            'name' => 'State Tax',            'shipping' => true,            'order' => 35        ],        [            'country' => 'US',            'state' => 'PR',            'rate' => '6.0000',            'name' => 'State Tax',            'shipping' => false,            'order' => 36        ],        [            'country' => 'US',            'state' => 'RI',            'rate' => '7.0000',            'name' => 'State Tax',            'shipping' => false,            'order' => 37        ],        [            'country' => 'US',            'state' => 'SC',            'rate' => '6.0000',            'name' => 'State Tax',            'shipping' => true,            'order' => 38        ],        [            'country' => 'US',            'state' => 'SD',            'rate' => '4.0000',            'name' => 'State Tax',            'shipping' => true,            'order' => 39        ],        [            'country' => 'US',            'state' => 'TN',            'rate' => '7.0000',            'name' => 'State Tax',            'shipping' => true,            'order' => 40        ],        [            'country' => 'US',            'state' => 'TX',            'rate' => '6.2500',            'name' => 'State Tax',            'shipping' => true,            'order' => 41        ],        [            'country' => 'US',            'state' => 'UT',            'rate' => '5.9500',            'name' => 'State Tax',            'shipping' => false,            'order' => 42        ],        [            'country' => 'US',            'state' => 'VT',            'rate' => '6.0000',            'name' => 'State Tax',            'shipping' => true,            'order' => 43        ],        [            'country' => 'US',            'state' => 'VA',            'rate' => '5.3000',            'name' => 'State Tax',            'shipping' => false,            'order' => 44        ],        [            'country' => 'US',            'state' => 'WA',            'rate' => '6.5000',            'name' => 'State Tax',            'shipping' => true,            'order' => 45        ],        [            'country' => 'US',            'state' => 'WV',            'rate' => '6.0000',            'name' => 'State Tax',            'shipping' => true,            'order' => 46        ],        [            'country' => 'US',            'state' => 'WI',            'rate' => '5.0000',            'name' => 'State Tax',            'shipping' => true,            'order' => 47        ],        [            'country' => 'US',            'state' => 'WY',            'rate' => '4.0000',            'name' => 'State Tax',            'shipping' => true,            'order' => 48        ]    ]];print_r($woocommerce->post('taxes/batch', $data));?>
```

```
data = {    "create": [        {            "country": "US",            "state": "AL",            "rate": "4.0000",            "name": "State Tax",            "shipping": False,            "order": 1        },        {            "country": "US",            "state": "AZ",            "rate": "5.6000",            "name": "State Tax",            "shipping": False,            "order": 2        },        {            "country": "US",            "state": "AR",            "rate": "6.5000",            "name": "State Tax",            "shipping": True,            "order": 3        },        {            "country": "US",            "state": "CA",            "rate": "7.5000",            "name": "State Tax",            "shipping": False,            "order": 4        },        {            "country": "US",            "state": "CO",            "rate": "2.9000",            "name": "State Tax",            "shipping": False,            "order": 5        },        {            "country": "US",            "state": "CT",            "rate": "6.3500",            "name": "State Tax",            "shipping": True,            "order": 6        },        {            "country": "US",            "state": "DC",            "rate": "5.7500",            "name": "State Tax",            "shipping": True,            "order": 7        },        {            "country": "US",            "state": "FL",            "rate": "6.0000",            "name": "State Tax",            "shipping": True,            "order": 8        },        {            "country": "US",            "state": "GA",            "rate": "4.0000",            "name": "State Tax",            "shipping": True,            "order": 9        },        {            "country": "US",            "state": "GU",            "rate": "4.0000",            "name": "State Tax",            "shipping": False,            "order": 10        },        {            "country": "US",            "state": "HI",            "rate": "4.0000",            "name": "State Tax",            "shipping": True,            "order": 11        },        {            "country": "US",            "state": "ID",            "rate": "6.0000",            "name": "State Tax",            "shipping": False,            "order": 12        },        {            "country": "US",            "state": "IL",            "rate": "6.2500",            "name": "State Tax",            "shipping": False,            "order": 13        },        {            "country": "US",            "state": "IN",            "rate": "7.0000",            "name": "State Tax",            "shipping": False,            "order": 14        },        {            "country": "US",            "state": "IA",            "rate": "6.0000",            "name": "State Tax",            "shipping": False,            "order": 15        },        {            "country": "US",            "state": "KS",            "rate": "6.1500",            "name": "State Tax",            "shipping": True,            "order": 16        },        {            "country": "US",            "state": "KY",            "rate": "6.0000",            "name": "State Tax",            "shipping": True,            "order": 17        },        {            "country": "US",            "state": "LA",            "rate": "4.0000",            "name": "State Tax",            "shipping": False,            "order": 18        },        {            "country": "US",            "state": "ME",            "rate": "5.5000",            "name": "State Tax",            "shipping": False,            "order": 19        },        {            "country": "US",            "state": "MD",            "rate": "6.0000",            "name": "State Tax",            "shipping": False,            "order": 20        },        {            "country": "US",            "state": "MA",            "rate": "6.2500",            "name": "State Tax",            "shipping": False,            "order": 21        },        {            "country": "US",            "state": "MI",            "rate": "6.0000",            "name": "State Tax",            "shipping": True,            "order": 22        },        {            "country": "US",            "state": "MN",            "rate": "6.8750",            "name": "State Tax",            "shipping": True,            "order": 23        },        {            "country": "US",            "state": "MS",            "rate": "7.0000",            "name": "State Tax",            "shipping": True,            "order": 24        },        {            "country": "US",            "state": "MO",            "rate": "4.2250",            "name": "State Tax",            "shipping": False,            "order": 25        },        {            "country": "US",            "state": "NE",            "rate": "5.5000",            "name": "State Tax",            "shipping": True,            "order": 26        },        {            "country": "US",            "state": "NV",            "rate": "6.8500",            "name": "State Tax",            "shipping": False,            "order": 27        },        {            "country": "US",            "state": "NJ",            "rate": "7.0000",            "name": "State Tax",            "shipping": True,            "order": 28        },        {            "country": "US",            "state": "NM",            "rate": "5.1250",            "name": "State Tax",            "shipping": True,            "order": 29        },        {            "country": "US",            "state": "NY",            "rate": "4.0000",            "name": "State Tax",            "shipping": True,            "order": 30        },        {            "country": "US",            "state": "NC",            "rate": "4.7500",            "name": "State Tax",            "shipping": True,            "order": 31        },        {            "country": "US",            "state": "ND",            "rate": "5.0000",            "name": "State Tax",            "shipping": True,            "order": 32        },        {            "country": "US",            "state": "OH",            "rate": "5.7500",            "name": "State Tax",            "shipping": True,            "order": 33        },        {            "country": "US",            "state": "OK",            "rate": "4.5000",            "name": "State Tax",            "shipping": False,            "order": 34        },        {            "country": "US",            "state": "PA",            "rate": "6.0000",            "name": "State Tax",            "shipping": True,            "order": 35        },        {            "country": "US",            "state": "PR",            "rate": "6.0000",            "name": "State Tax",            "shipping": False,            "order": 36        },        {            "country": "US",            "state": "RI",            "rate": "7.0000",            "name": "State Tax",            "shipping": False,            "order": 37        },        {            "country": "US",            "state": "SC",            "rate": "6.0000",            "name": "State Tax",            "shipping": True,            "order": 38        },        {            "country": "US",            "state": "SD",            "rate": "4.0000",            "name": "State Tax",            "shipping": True,            "order": 39        },        {            "country": "US",            "state": "TN",            "rate": "7.0000",            "name": "State Tax",            "shipping": True,            "order": 40        },        {            "country": "US",            "state": "TX",            "rate": "6.2500",            "name": "State Tax",            "shipping": True,            "order": 41        },        {            "country": "US",            "state": "UT",            "rate": "5.9500",            "name": "State Tax",            "shipping": False,            "order": 42        },        {            "country": "US",            "state": "VT",            "rate": "6.0000",            "name": "State Tax",            "shipping": True,            "order": 43        },        {            "country": "US",            "state": "VA",            "rate": "5.3000",            "name": "State Tax",            "shipping": False,            "order": 44        },        {            "country": "US",            "state": "WA",            "rate": "6.5000",            "name": "State Tax",            "shipping": True,            "order": 45        },        {            "country": "US",            "state": "WV",            "rate": "6.0000",            "name": "State Tax",            "shipping": True,            "order": 46        },        {            "country": "US",            "state": "WI",            "rate": "5.0000",            "name": "State Tax",            "shipping": True,            "order": 47        },        {            "country": "US",            "state": "WY",            "rate": "4.0000",            "name": "State Tax",            "shipping": True,            "order": 48        }    ]}print(wcapi.post("taxes/batch", data).json())
```

```
data = {  create: [    {      country: "US",      state: "AL",      rate: "4.0000",      name: "State Tax",      shipping: false,      order: 1    },    {      country: "US",      state: "AZ",      rate: "5.6000",      name: "State Tax",      shipping: false,      order: 2    },    {      country: "US",      state: "AR",      rate: "6.5000",      name: "State Tax",      shipping: true,      order: 3    },    {      country: "US",      state: "CA",      rate: "7.5000",      name: "State Tax",      shipping: false,      order: 4    },    {      country: "US",      state: "CO",      rate: "2.9000",      name: "State Tax",      shipping: false,      order: 5    },    {      country: "US",      state: "CT",      rate: "6.3500",      name: "State Tax",      shipping: true,      order: 6    },    {      country: "US",      state: "DC",      rate: "5.7500",      name: "State Tax",      shipping: true,      order: 7    },    {      country: "US",      state: "FL",      rate: "6.0000",      name: "State Tax",      shipping: true,      order: 8    },    {      country: "US",      state: "GA",      rate: "4.0000",      name: "State Tax",      shipping: true,      order: 9    },    {      country: "US",      state: "GU",      rate: "4.0000",      name: "State Tax",      shipping: false,      order: 10    },    {      country: "US",      state: "HI",      rate: "4.0000",      name: "State Tax",      shipping: true,      order: 11    },    {      country: "US",      state: "ID",      rate: "6.0000",      name: "State Tax",      shipping: false,      order: 12    },    {      country: "US",      state: "IL",      rate: "6.2500",      name: "State Tax",      shipping: false,      order: 13    },    {      country: "US",      state: "IN",      rate: "7.0000",      name: "State Tax",      shipping: false,      order: 14    },    {      country: "US",      state: "IA",      rate: "6.0000",      name: "State Tax",      shipping: false,      order: 15    },    {      country: "US",      state: "KS",      rate: "6.1500",      name: "State Tax",      shipping: true,      order: 16    },    {      country: "US",      state: "KY",      rate: "6.0000",      name: "State Tax",      shipping: true,      order: 17    },    {      country: "US",      state: "LA",      rate: "4.0000",      name: "State Tax",      shipping: false,      order: 18    },    {      country: "US",      state: "ME",      rate: "5.5000",      name: "State Tax",      shipping: false,      order: 19    },    {      country: "US",      state: "MD",      rate: "6.0000",      name: "State Tax",      shipping: false,      order: 20    },    {      country: "US",      state: "MA",      rate: "6.2500",      name: "State Tax",      shipping: false,      order: 21    },    {      country: "US",      state: "MI",      rate: "6.0000",      name: "State Tax",      shipping: true,      order: 22    },    {      country: "US",      state: "MN",      rate: "6.8750",      name: "State Tax",      shipping: true,      order: 23    },    {      country: "US",      state: "MS",      rate: "7.0000",      name: "State Tax",      shipping: true,      order: 24    },    {      country: "US",      state: "MO",      rate: "4.2250",      name: "State Tax",      shipping: false,      order: 25    },    {      country: "US",      state: "NE",      rate: "5.5000",      name: "State Tax",      shipping: true,      order: 26    },    {      country: "US",      state: "NV",      rate: "6.8500",      name: "State Tax",      shipping: false,      order: 27    },    {      country: "US",      state: "NJ",      rate: "7.0000",      name: "State Tax",      shipping: true,      order: 28    },    {      country: "US",      state: "NM",      rate: "5.1250",      name: "State Tax",      shipping: true,      order: 29    },    {      country: "US",      state: "NY",      rate: "4.0000",      name: "State Tax",      shipping: true,      order: 30    },    {      country: "US",      state: "NC",      rate: "4.7500",      name: "State Tax",      shipping: true,      order: 31    },    {      country: "US",      state: "ND",      rate: "5.0000",      name: "State Tax",      shipping: true,      order: 32    },    {      country: "US",      state: "OH",      rate: "5.7500",      name: "State Tax",      shipping: true,      order: 33    },    {      country: "US",      state: "OK",      rate: "4.5000",      name: "State Tax",      shipping: false,      order: 34    },    {      country: "US",      state: "PA",      rate: "6.0000",      name: "State Tax",      shipping: true,      order: 35    },    {      country: "US",      state: "PR",      rate: "6.0000",      name: "State Tax",      shipping: false,      order: 36    },    {      country: "US",      state: "RI",      rate: "7.0000",      name: "State Tax",      shipping: false,      order: 37    },    {      country: "US",      state: "SC",      rate: "6.0000",      name: "State Tax",      shipping: true,      order: 38    },    {      country: "US",      state: "SD",      rate: "4.0000",      name: "State Tax",      shipping: true,      order: 39    },    {      country: "US",      state: "TN",      rate: "7.0000",      name: "State Tax",      shipping: true,      order: 40    },    {      country: "US",      state: "TX",      rate: "6.2500",      name: "State Tax",      shipping: true,      order: 41    },    {      country: "US",      state: "UT",      rate: "5.9500",      name: "State Tax",      shipping: false,      order: 42    },    {      country: "US",      state: "VT",      rate: "6.0000",      name: "State Tax",      shipping: true,      order: 43    },    {      country: "US",      state: "VA",      rate: "5.3000",      name: "State Tax",      shipping: false,      order: 44    },    {      country: "US",      state: "WA",      rate: "6.5000",      name: "State Tax",      shipping: true,      order: 45    },    {      country: "US",      state: "WV",      rate: "6.0000",      name: "State Tax",      shipping: true,      order: 46    },    {      country: "US",      state: "WI",      rate: "5.0000",      name: "State Tax",      shipping: true,      order: 47    },    {      country: "US",      state: "WY",      rate: "4.0000",      name: "State Tax",      shipping: true,      order: 48    }  ]}woocommerce.post("taxes/batch", data).parsed_response
```

```
{	"create": [		{			"id": 72,			"country": "US",			"state": "AL",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "4.0000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": false,			"order": 1,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/72"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 73,			"country": "US",			"state": "AZ",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "5.6000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": false,			"order": 2,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/73"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 74,			"country": "US",			"state": "AR",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "6.5000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": true,			"order": 3,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/74"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 75,			"country": "US",			"state": "CA",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "7.5000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": false,			"order": 4,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/75"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 76,			"country": "US",			"state": "CO",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "2.9000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": false,			"order": 5,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/76"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 77,			"country": "US",			"state": "CT",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "6.3500",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": true,			"order": 6,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/77"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 78,			"country": "US",			"state": "DC",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "5.7500",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": true,			"order": 7,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/78"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 79,			"country": "US",			"state": "FL",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "6.0000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": true,			"order": 8,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/79"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 80,			"country": "US",			"state": "GA",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "4.0000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": true,			"order": 9,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/80"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 81,			"country": "US",			"state": "GU",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "4.0000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": false,			"order": 10,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/81"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 82,			"country": "US",			"state": "HI",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "4.0000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": true,			"order": 11,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/82"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 83,			"country": "US",			"state": "ID",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "6.0000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": false,			"order": 12,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/83"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 84,			"country": "US",			"state": "IL",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "6.2500",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": false,			"order": 13,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/84"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 85,			"country": "US",			"state": "IN",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "7.0000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": false,			"order": 14,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/85"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 86,			"country": "US",			"state": "IA",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "6.0000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": false,			"order": 15,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/86"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 87,			"country": "US",			"state": "KS",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "6.1500",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": true,			"order": 16,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/87"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 88,			"country": "US",			"state": "KY",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "6.0000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": true,			"order": 17,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/88"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 89,			"country": "US",			"state": "LA",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "4.0000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": false,			"order": 18,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/89"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 90,			"country": "US",			"state": "ME",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "5.5000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": false,			"order": 19,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/90"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 91,			"country": "US",			"state": "MD",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "6.0000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": false,			"order": 20,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/91"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 92,			"country": "US",			"state": "MA",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "6.2500",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": false,			"order": 21,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/92"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 93,			"country": "US",			"state": "MI",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "6.0000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": true,			"order": 22,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/93"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 94,			"country": "US",			"state": "MN",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "6.8750",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": true,			"order": 23,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/94"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 95,			"country": "US",			"state": "MS",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "7.0000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": true,			"order": 24,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/95"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 96,			"country": "US",			"state": "MO",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "4.2250",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": false,			"order": 25,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/96"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 97,			"country": "US",			"state": "NE",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "5.5000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": true,			"order": 26,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/97"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 98,			"country": "US",			"state": "NV",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "6.8500",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": false,			"order": 27,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/98"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 99,			"country": "US",			"state": "NJ",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "7.0000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": true,			"order": 28,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/99"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 100,			"country": "US",			"state": "NM",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "5.1250",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": true,			"order": 29,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/100"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 101,			"country": "US",			"state": "NY",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "4.0000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": true,			"order": 30,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/101"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 102,			"country": "US",			"state": "NC",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "4.7500",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": true,			"order": 31,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/102"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 103,			"country": "US",			"state": "ND",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "5.0000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": true,			"order": 32,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/103"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 104,			"country": "US",			"state": "OH",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "5.7500",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": true,			"order": 33,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/104"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 105,			"country": "US",			"state": "OK",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "4.5000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": false,			"order": 34,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/105"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 106,			"country": "US",			"state": "PA",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "6.0000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": true,			"order": 35,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/106"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 107,			"country": "US",			"state": "PR",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "6.0000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": false,			"order": 36,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/107"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 108,			"country": "US",			"state": "RI",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "7.0000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": false,			"order": 37,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/108"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 109,			"country": "US",			"state": "SC",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "6.0000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": true,			"order": 38,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/109"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 110,			"country": "US",			"state": "SD",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "4.0000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": true,			"order": 39,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/110"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 111,			"country": "US",			"state": "TN",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "7.0000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": true,			"order": 40,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/111"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 112,			"country": "US",			"state": "TX",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "6.2500",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": true,			"order": 41,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/112"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 113,			"country": "US",			"state": "UT",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "5.9500",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": false,			"order": 42,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/113"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 114,			"country": "US",			"state": "VT",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "6.0000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": true,			"order": 43,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/114"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 115,			"country": "US",			"state": "VA",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "5.3000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": false,			"order": 44,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/115"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 116,			"country": "US",			"state": "WA",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "6.5000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": true,			"order": 45,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/116"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 117,			"country": "US",			"state": "WV",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "6.0000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": true,			"order": 46,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/117"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 118,			"country": "US",			"state": "WI",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "5.0000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": true,			"order": 47,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/118"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		},		{			"id": 119,			"country": "US",			"state": "WY",			"postcode": "",			"city": "",			"postcodes": [],			"cities": [],			"rate": "4.0000",			"name": "State Tax",			"priority": 0,			"compound": false,			"shipping": true,			"order": 48,			"class": "standard",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/taxes/119"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/taxes"					}				]			}		}	]}
```

---

<a name="tax-classes"></a>

The tax classes API allows you to create, view, and delete individual tax classes.


## Tax class properties[​](/docs/apis/rest-api/v3/tax-classes#tax-class-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| slug | string | Unique identifier for the resource. READ-ONLY |
| name | string | Tax class name. REQUIRED |


## Create a tax class[​](/docs/apis/rest-api/v3/tax-classes#create-a-tax-class)


This API helps you to create a new tax class.


```
POST /wp-json/wc/v3/taxes/classes
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/taxes/classes \    -u consumer_key:consumer_secret \    -H "Content-Type: application/json" \    -d '{  "name": "Zero Rate"}'
```

```
const data = {	name: 'Zero Rate',};WooCommerce.post( 'taxes/classes', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'name' => 'Zero Rate'];print_r($woocommerce->post('taxes/classes', $data));?>
```

```
data = {    "name": "Zero Rate"}print(wcapi.post("taxes/classes", data).json())
```

```
data = {  name: "Zero Rate"}woocommerce.post("taxes/classes", data).parsed_response
```

```
{	"slug": "zero-rate",	"name": "Zero Rate",	"_links": {		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/taxes/classes"			}		]	}}
```


## List all tax classes[​](/docs/apis/rest-api/v3/tax-classes#list-all-tax-classes)


This API helps you to view all tax classes.


```
GET /wp-json/wc/v3/taxes/classes
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/taxes/classes \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'taxes/classes' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('taxes/classes')); ?>
```

```
print(wcapi.get("taxes/classes").json())
```

```
woocommerce.get("taxes/classes").parsed_response
```

```
[	{		"slug": "standard",		"name": "Standard Rate",		"_links": {			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/taxes/classes"				}			]		}	},	{		"slug": "reduced-rate",		"name": "Reduced Rate",		"_links": {			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/taxes/classes"				}			]		}	},	{		"slug": "zero-rate",		"name": "Zero Rate",		"_links": {			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/taxes/classes"				}			]		}	}]
```


## Delete a tax class[​](/docs/apis/rest-api/v3/tax-classes#delete-a-tax-class)


This API helps you delete a tax class.

warning
This also will delete all tax rates from the selected class.


```
DELETE /wp-json/wc/v3/taxes/classes/<slug>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X DELETE https://example.com/wp-json/wc/v3/taxes/classes/zero-rate?force=true \	-u consumer_key:consumer_secret
```

```
WooCommerce.delete( 'taxes/classes/zero-rate', {	force: true,} )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->delete('taxes/classes/zero-rate', ['force' => true])); ?>
```

```
print(wcapi.delete("taxes/classes/zero-rate", params={"force": True}).json())
```

```
woocommerce.delete("taxes/classes/zero-rate", force: true).parsed_response
```

```
{	"slug": "zero-rate",	"name": "Zero Rate",	"_links": {		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/taxes/classes"			}		]	}}
```


#### Available parameters[​](/docs/apis/rest-api/v3/tax-classes#available-parameters)


| Parameter | Type | Description |
| --- | --- | --- |
| force | string | Required to be true, since this resource does not support trashing. |

---

<a name="webhooks"></a>

The webhooks API allows you to create, view, update, and delete individual, or a batch, of webhooks.


Webhooks can be managed via the WooCommerce settings screen or by using the REST API endpoints. The `WC_Webhook` class manages all data storage and retrieval of the webhook custom post type, as well as enqueuing webhook actions and processing/delivering/logging webhooks. On `woocommerce_init`, active webhooks are loaded.


Each webhook has:


- `status`: active (delivers payload), paused (delivery paused by admin), disabled (delivery paused by failure).
- `topic`: determines which resource events the webhook is triggered for.
- `delivery URL`: URL where the payload is delivered, must be HTTP or HTTPS.
- `secret`: an optional secret key that is used to generate a HMAC-SHA256 hash of the request body so the receiver can verify authenticity of the webhook.
- `hooks`: an array of hook names that are added and bound to the webhook for processing.


### Topics[​](/docs/apis/rest-api/v3/webhooks#topics)


The topic is a combination resource (e.g. order) and event (e.g. created) and maps to one or more hook names (e.g. `woocommerce_checkout_order_processed`). Webhooks can be created using the topic name and the appropriate hooks are automatically added.


Core topics are:


- Coupons: `coupon.created`, `coupon.updated` and `coupon.deleted`.
- Customers: `customer.created`, `customer.updated` and `customer.deleted`.
- Orders: `order.created`, `order.updated` and `order.deleted`.
- Products: `product.created`, `product.updated` and `product.deleted`.


Custom topics can also be used which map to a single hook name, for example you could add a webhook with topic `action.woocommerce_add_to_cart` that is triggered on that event. Custom topics pass the first hook argument to the payload, so in this example the `cart_item_key` would be included in the payload.


### Delivery/payload[​](/docs/apis/rest-api/v3/webhooks#deliverypayload)


Delivery is performed using `wp_remote_post()` (HTTP POST) and processed in the background by default using wp-cron. A few custom headers are added to the request to help the receiver process the webhook:


- `X-WC-Webhook-Source`: `http://example.com/`.
- `X-WC-Webhook-Topic` - e.g. `order.updated`.
- `X-WC-Webhook-Resource` - e.g. `order`.
- `X-WC-Webhook-Event` - e.g. `updated`.
- `X-WC-Webhook-Signature` - a base64 encoded HMAC-SHA256 hash of the payload.
- `X-WC-Webhook-ID` - webhook's post ID.
- `X-WC-Webhook-Delivery-ID` - delivery log ID (a comment).


The payload is JSON encoded and for API resources (coupons, customers, orders, products), the response is exactly the same as if requested via the REST API.


### Logging[​](/docs/apis/rest-api/v3/webhooks#logging)


Requests/responses are logged using the WooCommerce logging system. Each delivery log includes:


- Request duration.
- Request URL, method, headers, and body.
- Response Code, message, headers, and body.


After 5 consecutive failed deliveries (as defined by a non HTTP 2xx response code), the webhook is disabled and must be edited via the REST API to re-enable.


Delivery logs can be accessed in "WooCommerce" > "Status" > "Logs".


### Visual interface[​](/docs/apis/rest-api/v3/webhooks#visual-interface)


You can find the Webhooks interface going to "WooCommerce" > "Settings" > "Advanced" > "Webhooks", see our [Visual Webhooks docs](https://docs.woocommerce.com/document/webhooks/) for more details.


## Webhook properties[​](/docs/apis/rest-api/v3/webhooks#webhook-properties)


| Attribute           | Type      | Description                                                                                                                                                 |
| ------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `id`                | integer   | Unique identifier for the resource. `READ-ONLY`                                                                               |
| `name`              | string    | A friendly name for the webhook.                                                                                                                            |
| `status`            | string    | Webhook status. Options: `active`, `paused` and `disabled`. Default is `active`.                                                                            |
| `topic`             | string    | Webhook topic. `MANDATORY`                                                                                                    |
| `resource`          | string    | Webhook resource. `READ-ONLY`                                                                                                 |
| `event`             | string    | Webhook event. `READ-ONLY`                                                                                                    |
| `hooks`             | array     | WooCommerce action names associated with the webhook. `READ-ONLY`                                                             |
| `delivery_url`      | string    | The URL where the webhook payload is delivered. `READ-ONLY` `MANDATORY`                         |
| `secret`            | string    | Secret key used to generate a hash of the delivered webhook and provided in the request headers. This will default is a MD5 hash from the current user's ID | username if not provided. `WRITE-ONLY` `MANDATORY` |
| `date_created`      | date-time | The date the webhook was created, in the site's timezone. `READ-ONLY`                                                         |
| `date_created_gmt`  | date-time | The date the webhook was created, as GMT. `READ-ONLY`                                                                         |
| `date_modified`     | date-time | The date the webhook was last modified, in the site's timezone. `READ-ONLY`                                                   |
| `date_modified_gmt` | date-time | The date the webhook was last modified, as GMT. `READ-ONLY`                                                                   |


## Create a webhook[​](/docs/apis/rest-api/v3/webhooks#create-a-webhook)


This API helps you to create a new webhook.


```
POST /wp-json/wc/v3/webhooks
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/webhooks \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "name": "Order updated",  "topic": "order.updated",  "delivery_url": "http://requestb.in/1g0sxmo1"}'
```

```
const data = {	name: 'Order updated',	topic: 'order.updated',	delivery_url: 'http://requestb.in/1g0sxmo1',};WooCommerce.post( 'webhooks', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'name' => 'Order updated',    'topic' => 'order.updated',    'delivery_url' => 'http://requestb.in/1g0sxmo1'];print_r($woocommerce->post('webhooks', $data));?>
```

```
data = {    "name": "Order updated",    "topic": "order.updated",    "delivery_url": "http://requestb.in/1g0sxmo1"}print(wcapi.post("webhooks", data).json())
```

```
data = {  name: "Order updated",  topic: "order.updated",  delivery_url: "http://requestb.in/1g0sxmo1"}woocommerce.post("webhooks", data).parsed_response
```

```
{	"id": 142,	"name": "Order updated",	"status": "active",	"topic": "order.updated",	"resource": "order",	"event": "updated",	"hooks": [		"woocommerce_process_shop_order_meta",		"woocommerce_api_edit_order",		"woocommerce_order_edit_status",		"woocommerce_order_status_changed"	],	"delivery_url": "http://requestb.in/1g0sxmo1",	"date_created": "2016-05-15T23:17:52",	"date_created_gmt": "2016-05-15T20:17:52",	"date_modified": "2016-05-15T23:17:52",	"date_modified_gmt": "2016-05-15T20:17:52",	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/webhooks/142"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/webhooks"			}		]	}}
```


## Retrieve a webhook[​](/docs/apis/rest-api/v3/webhooks#retrieve-a-webhook)


This API lets you retrieve and view a specific webhook.


```
GET /wp-json/wc/v3/webhooks/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/webhooks/142 \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'webhooks/142' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('webhooks/142')); ?>
```

```
print(wcapi.get("webhooks/142").json())
```

```
woocommerce.get("webhooks/142").parsed_response
```

```
{	"id": 142,	"name": "Order updated",	"status": "active",	"topic": "order.updated",	"resource": "order",	"event": "updated",	"hooks": [		"woocommerce_process_shop_order_meta",		"woocommerce_api_edit_order",		"woocommerce_order_edit_status",		"woocommerce_order_status_changed"	],	"delivery_url": "http://requestb.in/1g0sxmo1",	"date_created": "2016-05-15T23:17:52",	"date_created_gmt": "2016-05-15T20:17:52",	"date_modified": "2016-05-15T23:17:52",	"date_modified_gmt": "2016-05-15T20:17:52",	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/webhooks/142"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/webhooks"			}		]	}}
```


## List all webhooks[​](/docs/apis/rest-api/v3/webhooks#list-all-webhooks)


This API helps you to view all the webhooks.


```
GET /wp-json/wc/v3/webhooks
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/webhooks \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'webhooks' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('webhooks')); ?>
```

```
print(wcapi.get("webhooks").json())
```

```
woocommerce.get("webhooks").parsed_response
```

```
[	{		"id": 143,		"name": "Customer created",		"status": "active",		"topic": "customer.created",		"resource": "customer",		"event": "created",		"hooks": [			"user_register",			"woocommerce_created_customer",			"woocommerce_api_create_customer"		],		"delivery_url": "http://requestb.in/1g0sxmo1",		"date_created": "2016-05-15T23:17:52",		"date_created_gmt": "2016-05-15T20:17:52",		"date_modified": "2016-05-15T23:17:52",		"date_modified_gmt": "2016-05-15T20:17:52",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/webhooks/143"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/webhooks"				}			]		}	},	{		"id": 142,		"name": "Order updated",		"status": "active",		"topic": "order.updated",		"resource": "order",		"event": "updated",		"hooks": [			"woocommerce_process_shop_order_meta",			"woocommerce_api_edit_order",			"woocommerce_order_edit_status",			"woocommerce_order_status_changed"		],		"delivery_url": "http://requestb.in/1g0sxmo1",		"date_created": "2016-05-15T23:17:52",		"date_created_gmt": "2016-05-15T20:17:52",		"date_modified": "2016-05-15T23:17:52",		"date_modified_gmt": "2016-05-15T20:17:52",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/webhooks/142"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/webhooks"				}			]		}	}]
```


#### Available parameters[​](/docs/apis/rest-api/v3/webhooks#available-parameters)


| Parameter | Type | Description |
| --- | --- | --- |
| context | string | Scope under which the request is made; determines fields present in response. Options: view and edit. Default is view. |
| page | integer | Current page of the collection. Default is 1. |
| per_page | integer | Maximum number of items to be returned in result set. Default is 10. |
| search | string | Limit results to those matching a string. |
| after | string | Limit response to resources published after a given ISO8601 compliant date. |
| before | string | Limit response to resources published before a given ISO8601 compliant date. |
| dates_are_gmt | boolean | Whether to interpret dates as GMT dates when limiting response by published date. |
| exclude | array | Ensure result set excludes specific IDs. |
| include | array | Limit result set to specific ids. |
| offset | integer | Offset the result set by a specific number of items. |
| order | string | Order sort attribute ascending or descending. Options: asc and desc. Default is desc. |
| orderby | string | Sort collection by object attribute. Options: date, id, include, title and slug. Default is date. |
| status | string | Limit result set to webhooks assigned a specific status. Options: all, active, paused and disabled. Default is all. |


## Update a webhook[​](/docs/apis/rest-api/v3/webhooks#update-a-webhook)


This API lets you make changes to a webhook.


```
PUT /wp-json/wc/v3/webhooks/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X PUT https://example.com/wp-json/wc/v3/webhooks/142 \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "status": "paused"}'
```

```
const data = {	status: 'paused',};WooCommerce.put( 'webhooks/142', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'status' => 'paused'];print_r($woocommerce->put('webhooks/142', $data));?>
```

```
data = {    "status": "paused"}print(wcapi.put("webhooks/142", data).json())
```

```
data = {  status: "paused"}woocommerce.put("webhooks/142", data).parsed_response
```

```
{	"id": 142,	"name": "Order updated",	"status": "paused",	"topic": "order.updated",	"resource": "order",	"event": "updated",	"hooks": [		"woocommerce_process_shop_order_meta",		"woocommerce_api_edit_order",		"woocommerce_order_edit_status",		"woocommerce_order_status_changed"	],	"delivery_url": "http://requestb.in/1g0sxmo1",	"date_created": "2016-05-15T23:17:52",	"date_created_gmt": "2016-05-15T20:17:52",	"date_modified": "2016-05-15T17:30:12",	"date_modified_gmt": "2016-05-15T20:30:12",	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/webhooks/142"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/webhooks"			}		]	}}
```


## Delete a webhook[​](/docs/apis/rest-api/v3/webhooks#delete-a-webhook)


This API helps you delete a webhook.


```
DELETE /wp-json/wc/v3/webhooks/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X DELETE https://example.com/wp-json/wc/v3/webhooks/142 \	-u consumer_key:consumer_secret
```

```
WooCommerce.delete( 'webhooks/142' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->delete('webhooks/142')); ?>
```

```
print(wcapi.delete("webhooks/142").json())
```

```
woocommerce.delete("webhooks/142").parsed_response
```

```
{	"id": 142,	"name": "Order updated",	"status": "paused",	"topic": "order.updated",	"resource": "order",	"event": "updated",	"hooks": [		"woocommerce_process_shop_order_meta",		"woocommerce_api_edit_order",		"woocommerce_order_edit_status",		"woocommerce_order_status_changed"	],	"delivery_url": "http://requestb.in/1g0sxmo1",	"date_created": "2016-05-15T23:17:52",	"date_created_gmt": "2016-05-15T20:17:52",	"date_modified": "2016-05-15T23:30:12",	"date_modified_gmt": "2016-05-15T20:30:12",	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/webhooks/142"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/webhooks"			}		]	}}
```


#### Available parameters[​](/docs/apis/rest-api/v3/webhooks#available-parameters-1)


| Parameter | Type | Description |
| --- | --- | --- |
| force | string | Use true whether to permanently delete the webhook, Defaults is false. |


## Batch update webhooks[​](/docs/apis/rest-api/v3/webhooks#batch-update-webhooks)


This API helps you to batch create, update and delete multiple webhooks.

note
Note: By default it's limited to up to 100 objects to be created, updated or
deleted.


```
POST /wp-json/wc/v3/webhooks/batch
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/webhooks/batch \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "create": [    {      "name": "Coupon created",      "topic": "coupon.created",      "delivery_url": "http://requestb.in/1g0sxmo1"    },    {      "name": "Customer deleted",      "topic": "customer.deleted",      "delivery_url": "http://requestb.in/1g0sxmo1"    }  ],  "delete": [    143  ]}'
```

```
const data = {	create: [		{			name: 'Round toe',			topic: 'coupon.created',			delivery_url: 'http://requestb.in/1g0sxmo1',		},		{			name: 'Customer deleted',			topic: 'customer.deleted',			delivery_url: 'http://requestb.in/1g0sxmo1',		},	],	delete: [ 143 ],};WooCommerce.post( 'webhooks/batch', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'create' => [        [            'name' => 'Round toe',            'topic' => 'coupon.created',            'delivery_url' => 'http://requestb.in/1g0sxmo1'        ],        [            'name' => 'Customer deleted',            'topic' => 'customer.deleted',            'delivery_url' => 'http://requestb.in/1g0sxmo1'        ]    ],    'delete' => [        143    ]];print_r($woocommerce->post('webhooks/batch', $data));?>
```

```
data = {    "create": [        {            "name": "Round toe",            "topic": "coupon.created",            "delivery_url": "http://requestb.in/1g0sxmo1"        },        {            "name": "Customer deleted",            "topic": "customer.deleted",            "delivery_url": "http://requestb.in/1g0sxmo1"        }    ],    "delete": [        143    ]}print(wcapi.post("webhooks/batch", data).json())
```

```
data = {  create: [    {      name: "Round toe",      topic: "coupon.created",      delivery_url: "http://requestb.in/1g0sxmo1"    },    {      name: "Customer deleted",      topic: "customer.deleted",      delivery_url: "http://requestb.in/1g0sxmo1"    }  ],  delete: [    143  ]}woocommerce.post("webhooks/batch", data).parsed_response
```

```
{	"create": [		{			"id": 146,			"name": "Coupon created",			"status": "active",			"topic": "coupon.created",			"resource": "coupon",			"event": "created",			"hooks": [				"woocommerce_process_shop_coupon_meta",				"woocommerce_api_create_coupon"			],			"delivery_url": "http://requestb.in/1g0sxmo1",			"date_created": "2016-05-25T01:56:26",			"date_created_gmt": "2016-05-24T22:56:26",			"date_modified": "2016-05-25T01:56:26",			"date_modified_gmt": "2016-05-24T22:56:26",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/webhooks/146"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/webhooks"					}				]			}		},		{			"id": 147,			"name": "Customer deleted",			"status": "active",			"topic": "customer.deleted",			"resource": "customer",			"event": "deleted",			"hooks": [ "delete_user" ],			"delivery_url": "http://requestb.in/1g0sxmo1",			"date_created": "2016-05-25T01:56:30",			"date_created_gmt": "2016-05-24T22:56:30",			"date_modified": "2016-05-25T01:56:30",			"date_modified_gmt": "2016-05-24T22:56:30",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/webhooks/147"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/webhooks"					}				]			}		}	],	"delete": [		{			"id": 143,			"name": "Webhook created on May 24, 2016 @ 03:20 AM",			"status": "active",			"topic": "customer.created",			"resource": "customer",			"event": "created",			"hooks": [				"user_register",				"woocommerce_created_customer",				"woocommerce_api_create_customer"			],			"delivery_url": "http://requestb.in/1g0sxmo1",			"date_created": "2016-05-15T23:17:52",			"date_created_gmt": "2016-05-15T20:17:52",			"date_modified": "2016-05-15T23:17:52",			"date_modified_gmt": "2016-05-15T20:17:52",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/webhooks/143"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/webhooks"					}				]			}		}	]}
```

---

<a name="settings"></a>

The settings API allows you to view all groups of settings available.


## Setting group properties[​](/docs/apis/rest-api/v3/settings#setting-group-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | string | A unique identifier that can be used to link settings together. READ-ONLY |
| label | string | A human readable label for the setting used in interfaces. READ-ONLY |
| description | string | A human readable description for the setting used in interfaces. READ-ONLY |
| parent_id | string | ID of parent grouping. READ-ONLY |
| sub_groups | string | IDs for settings sub groups. READ-ONLY |


## List all settings groups[​](/docs/apis/rest-api/v3/settings#list-all-settings-groups)


This API helps you to view all the settings groups.


```
GET /wp-json/wc/v3/settings
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/settings \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'settings' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('settings')); ?>
```

```
print(wcapi.get("settings").json())
```

```
woocommerce.get("settings").parsed_response
```

```
[	{		"id": "general",		"label": "General",		"description": "",		"parent_id": "",		"sub_groups": [],		"_links": {			"options": [				{					"href": "https://example.com/wp-json/wc/v3/settings/general"				}			]		}	},	{		"id": "products",		"label": "Products",		"description": "",		"parent_id": "",		"sub_groups": [],		"_links": {			"options": [				{					"href": "https://example.com/wp-json/wc/v3/settings/products"				}			]		}	},	{		"id": "tax",		"label": "Tax",		"description": "",		"parent_id": "",		"sub_groups": [],		"_links": {			"options": [				{					"href": "https://example.com/wp-json/wc/v3/settings/tax"				}			]		}	},	{		"id": "shipping",		"label": "Shipping",		"description": "",		"parent_id": "",		"sub_groups": [],		"_links": {			"options": [				{					"href": "https://example.com/wp-json/wc/v3/settings/shipping"				}			]		}	},	{		"id": "checkout",		"label": "Checkout",		"description": "",		"parent_id": "",		"sub_groups": [],		"_links": {			"options": [				{					"href": "https://example.com/wp-json/wc/v3/settings/checkout"				}			]		}	},	{		"id": "account",		"label": "Accounts",		"description": "",		"parent_id": "",		"sub_groups": [],		"_links": {			"options": [				{					"href": "https://example.com/wp-json/wc/v3/settings/account"				}			]		}	},	{		"id": "email",		"label": "Emails",		"description": "",		"parent_id": "",		"sub_groups": [			"email_new_order",			"email_cancelled_order",			"email_failed_order",			"email_customer_on_hold_order",			"email_customer_processing_order",			"email_customer_completed_order",			"email_customer_refunded_order",			"email_customer_invoice",			"email_customer_note",			"email_customer_reset_password",			"email_customer_new_account"		],		"_links": {			"options": [				{					"href": "https://example.com/wp-json/wc/v3/settings/email"				}			]		}	},	{		"id": "integration",		"label": "Integration",		"description": "",		"parent_id": "",		"sub_groups": [],		"_links": {			"options": [				{					"href": "https://example.com/wp-json/wc/v3/settings/integration"				}			]		}	},	{		"id": "api",		"label": "API",		"description": "",		"parent_id": "",		"sub_groups": [],		"_links": {			"options": [				{					"href": "https://example.com/wp-json/wc/v3/settings/api"				}			]		}	},	{		"id": "email_new_order",		"label": "New order",		"description": "New order emails are sent to chosen recipient(s) when a new order is received.",		"parent_id": "email",		"sub_groups": [],		"_links": {			"options": [				{					"href": "https://example.com/wp-json/wc/v3/settings/email_new_order"				}			]		}	},	{		"id": "email_cancelled_order",		"label": "Cancelled order",		"description": "Cancelled order emails are sent to chosen recipient(s) when orders have been marked cancelled (if they were previously processing or on-hold).",		"parent_id": "email",		"sub_groups": [],		"_links": {			"options": [				{					"href": "https://example.com/wp-json/wc/v3/settings/email_cancelled_order"				}			]		}	},	{		"id": "email_failed_order",		"label": "Failed order",		"description": "Failed order emails are sent to chosen recipient(s) when orders have been marked failed (if they were previously processing or on-hold).",		"parent_id": "email",		"sub_groups": [],		"_links": {			"options": [				{					"href": "https://example.com/wp-json/wc/v3/settings/email_failed_order"				}			]		}	},	{		"id": "email_customer_on_hold_order",		"label": "Order on-hold",		"description": "This is an order notification sent to customers containing order details after an order is placed on-hold.",		"parent_id": "email",		"sub_groups": [],		"_links": {			"options": [				{					"href": "https://example.com/wp-json/wc/v3/settings/email_customer_on_hold_order"				}			]		}	},	{		"id": "email_customer_processing_order",		"label": "Processing order",		"description": "This is an order notification sent to customers containing order details after payment.",		"parent_id": "email",		"sub_groups": [],		"_links": {			"options": [				{					"href": "https://example.com/wp-json/wc/v3/settings/email_customer_processing_order"				}			]		}	},	{		"id": "email_customer_completed_order",		"label": "Completed order",		"description": "Order complete emails are sent to customers when their orders are marked completed and usually indicate that their orders have been shipped.",		"parent_id": "email",		"sub_groups": [],		"_links": {			"options": [				{					"href": "https://example.com/wp-json/wc/v3/settings/email_customer_completed_order"				}			]		}	},	{		"id": "email_customer_refunded_order",		"label": "Refunded order",		"description": "Order refunded emails are sent to customers when their orders are marked refunded.",		"parent_id": "email",		"sub_groups": [],		"_links": {			"options": [				{					"href": "https://example.com/wp-json/wc/v3/settings/email_customer_refunded_order"				}			]		}	},	{		"id": "email_customer_invoice",		"label": "Customer invoice",		"description": "Customer invoice emails can be sent to customers containing their order information and payment links.",		"parent_id": "email",		"sub_groups": [],		"_links": {			"options": [				{					"href": "https://example.com/wp-json/wc/v3/settings/email_customer_invoice"				}			]		}	},	{		"id": "email_customer_note",		"label": "Customer note",		"description": "Customer note emails are sent when you add a note to an order.",		"parent_id": "email",		"sub_groups": [],		"_links": {			"options": [				{					"href": "https://example.com/wp-json/wc/v3/settings/email_customer_note"				}			]		}	},	{		"id": "email_customer_reset_password",		"label": "Reset password",		"description": "Customer \"reset password\" emails are sent when customers reset their passwords.",		"parent_id": "email",		"sub_groups": [],		"_links": {			"options": [				{					"href": "https://example.com/wp-json/wc/v3/settings/email_customer_reset_password"				}			]		}	},	{		"id": "email_customer_new_account",		"label": "New account",		"description": "Customer \"new account\" emails are sent to the customer when a customer signs up via checkout or account pages.",		"parent_id": "email",		"sub_groups": [],		"_links": {			"options": [				{					"href": "https://example.com/wp-json/wc/v3/settings/email_customer_new_account"				}			]		}	}]
```

---

<a name="setting-options"></a>

## Setting option properties[​](/docs/apis/rest-api/v3/setting-options#setting-option-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | string | A unique identifier for the setting. READ-ONLY |
| label | string | A human readable label for the setting used in interfaces. READ-ONLY |
| description | string | A human readable description for the setting used in interfaces. READ-ONLY |
| value | mixed | Setting value. |
| default | mixed | Default value for the setting. READ-ONLY |
| tip | string | Additional help text shown to the user about the setting. READ-ONLY |
| placeholder | string | Placeholder text to be displayed in text inputs. READ-ONLY |
| type | string | Type of setting. Options: text, email, number, color, password, textarea, select, multiselect, radio, image_width and checkbox. READ-ONLY |
| options | object | Array of options (key value pairs) for inputs such as select, multiselect, and radio buttons. READ-ONLY |
| group_id | string | An identifier for the group this setting belongs to. READ-ONLY |


## Retrieve a setting option[​](/docs/apis/rest-api/v3/setting-options#retrieve-a-setting-option)


This API lets you retrieve and view a specific setting option.


```
GET /wp-json/wc/v3/settings/<group_id>/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/settings/general/woocommerce_allowed_countries \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'settings/general/woocommerce_allowed_countries' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('settings/general/woocommerce_allowed_countries')); ?>
```

```
print(wcapi.get("settings/general/woocommerce_allowed_countries").json())
```

```
woocommerce.get("settings/general/woocommerce_allowed_countries").parsed_response
```

```
{	"id": "woocommerce_allowed_countries",	"label": "Selling location(s)",	"description": "This option lets you limit which countries you are willing to sell to.",	"type": "select",	"default": "all",	"options": {		"all": "Sell to all countries",		"all_except": "Sell to all countries, except for&hellip;",		"specific": "Sell to specific countries"	},	"tip": "This option lets you limit which countries you are willing to sell to.",	"value": "all",	"group_id": "general",	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/settings/general/woocommerce_allowed_countries"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/settings/general"			}		]	}}
```


## List all setting options[​](/docs/apis/rest-api/v3/setting-options#list-all-setting-options)


This API helps you to view all the setting options.


```
GET /wp-json/wc/v3/settings/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/settings/general \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'settings/general' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('settings/general')); ?>
```

```
print(wcapi.get("settings/general").json())
```

```
woocommerce.get("settings/general").parsed_response
```

```
[	{		"id": "woocommerce_allowed_countries",		"label": "Selling location(s)",		"description": "This option lets you limit which countries you are willing to sell to.",		"type": "select",		"default": "all",		"options": {			"all": "Sell to all countries",			"all_except": "Sell to all countries, except for&hellip;",			"specific": "Sell to specific countries"		},		"tip": "This option lets you limit which countries you are willing to sell to.",		"value": "all",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/settings/general/woocommerce_allowed_countries"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/settings/general"				}			]		}	},	{		"id": "woocommerce_all_except_countries",		"label": "Sell to all countries, except for&hellip;",		"description": "",		"type": "multiselect",		"default": "",		"value": "",		"options": {			"AX": "&#197;land Islands",			"AF": "Afghanistan",			"AL": "Albania",			"DZ": "Algeria",			"AS": "American Samoa",			"AD": "Andorra",			"AO": "Angola",			"AI": "Anguilla",			"AQ": "Antarctica",			"AG": "Antigua and Barbuda",			"AR": "Argentina",			"AM": "Armenia",			"AW": "Aruba",			"AU": "Australia",			"AT": "Austria",			"AZ": "Azerbaijan",			"BS": "Bahamas",			"BH": "Bahrain",			"BD": "Bangladesh",			"BB": "Barbados",			"BY": "Belarus",			"PW": "Belau",			"BE": "Belgium",			"BZ": "Belize",			"BJ": "Benin",			"BM": "Bermuda",			"BT": "Bhutan",			"BO": "Bolivia",			"BQ": "Bonaire, Saint Eustatius and Saba",			"BA": "Bosnia and Herzegovina",			"BW": "Botswana",			"BV": "Bouvet Island",			"BR": "Brazil",			"IO": "British Indian Ocean Territory",			"VG": "British Virgin Islands",			"BN": "Brunei",			"BG": "Bulgaria",			"BF": "Burkina Faso",			"BI": "Burundi",			"KH": "Cambodia",			"CM": "Cameroon",			"CA": "Canada",			"CV": "Cape Verde",			"KY": "Cayman Islands",			"CF": "Central African Republic",			"TD": "Chad",			"CL": "Chile",			"CN": "China",			"CX": "Christmas Island",			"CC": "Cocos (Keeling) Islands",			"CO": "Colombia",			"KM": "Comoros",			"CG": "Congo (Brazzaville)",			"CD": "Congo (Kinshasa)",			"CK": "Cook Islands",			"CR": "Costa Rica",			"HR": "Croatia",			"CU": "Cuba",			"CW": "Cura&ccedil;ao",			"CY": "Cyprus",			"CZ": "Czech Republic",			"DK": "Denmark",			"DJ": "Djibouti",			"DM": "Dominica",			"DO": "Dominican Republic",			"EC": "Ecuador",			"EG": "Egypt",			"SV": "El Salvador",			"GQ": "Equatorial Guinea",			"ER": "Eritrea",			"EE": "Estonia",			"ET": "Ethiopia",			"FK": "Falkland Islands",			"FO": "Faroe Islands",			"FJ": "Fiji",			"FI": "Finland",			"FR": "France",			"GF": "French Guiana",			"PF": "French Polynesia",			"TF": "French Southern Territories",			"GA": "Gabon",			"GM": "Gambia",			"GE": "Georgia",			"DE": "Germany",			"GH": "Ghana",			"GI": "Gibraltar",			"GR": "Greece",			"GL": "Greenland",			"GD": "Grenada",			"GP": "Guadeloupe",			"GU": "Guam",			"GT": "Guatemala",			"GG": "Guernsey",			"GN": "Guinea",			"GW": "Guinea-Bissau",			"GY": "Guyana",			"HT": "Haiti",			"HM": "Heard Island and McDonald Islands",			"HN": "Honduras",			"HK": "Hong Kong",			"HU": "Hungary",			"IS": "Iceland",			"IN": "India",			"ID": "Indonesia",			"IR": "Iran",			"IQ": "Iraq",			"IE": "Ireland",			"IM": "Isle of Man",			"IL": "Israel",			"IT": "Italy",			"CI": "Ivory Coast",			"JM": "Jamaica",			"JP": "Japan",			"JE": "Jersey",			"JO": "Jordan",			"KZ": "Kazakhstan",			"KE": "Kenya",			"KI": "Kiribati",			"KW": "Kuwait",			"KG": "Kyrgyzstan",			"LA": "Laos",			"LV": "Latvia",			"LB": "Lebanon",			"LS": "Lesotho",			"LR": "Liberia",			"LY": "Libya",			"LI": "Liechtenstein",			"LT": "Lithuania",			"LU": "Luxembourg",			"MO": "Macao S.A.R., China",			"MK": "Macedonia",			"MG": "Madagascar",			"MW": "Malawi",			"MY": "Malaysia",			"MV": "Maldives",			"ML": "Mali",			"MT": "Malta",			"MH": "Marshall Islands",			"MQ": "Martinique",			"MR": "Mauritania",			"MU": "Mauritius",			"YT": "Mayotte",			"MX": "Mexico",			"FM": "Micronesia",			"MD": "Moldova",			"MC": "Monaco",			"MN": "Mongolia",			"ME": "Montenegro",			"MS": "Montserrat",			"MA": "Morocco",			"MZ": "Mozambique",			"MM": "Myanmar",			"NA": "Namibia",			"NR": "Nauru",			"NP": "Nepal",			"NL": "Netherlands",			"NC": "New Caledonia",			"NZ": "New Zealand",			"NI": "Nicaragua",			"NE": "Niger",			"NG": "Nigeria",			"NU": "Niue",			"NF": "Norfolk Island",			"KP": "North Korea",			"MP": "Northern Mariana Islands",			"NO": "Norway",			"OM": "Oman",			"PK": "Pakistan",			"PS": "Palestinian Territory",			"PA": "Panama",			"PG": "Papua New Guinea",			"PY": "Paraguay",			"PE": "Peru",			"PH": "Philippines",			"PN": "Pitcairn",			"PL": "Poland",			"PT": "Portugal",			"PR": "Puerto Rico",			"QA": "Qatar",			"RE": "Reunion",			"RO": "Romania",			"RU": "Russia",			"RW": "Rwanda",			"ST": "S&atilde;o Tom&eacute; and Pr&iacute;ncipe",			"BL": "Saint Barth&eacute;lemy",			"SH": "Saint Helena",			"KN": "Saint Kitts and Nevis",			"LC": "Saint Lucia",			"SX": "Saint Martin (Dutch part)",			"MF": "Saint Martin (French part)",			"PM": "Saint Pierre and Miquelon",			"VC": "Saint Vincent and the Grenadines",			"WS": "Samoa",			"SM": "San Marino",			"SA": "Saudi Arabia",			"SN": "Senegal",			"RS": "Serbia",			"SC": "Seychelles",			"SL": "Sierra Leone",			"SG": "Singapore",			"SK": "Slovakia",			"SI": "Slovenia",			"SB": "Solomon Islands",			"SO": "Somalia",			"ZA": "South Africa",			"GS": "South Georgia/Sandwich Islands",			"KR": "South Korea",			"SS": "South Sudan",			"ES": "Spain",			"LK": "Sri Lanka",			"SD": "Sudan",			"SR": "Suriname",			"SJ": "Svalbard and Jan Mayen",			"SZ": "Swaziland",			"SE": "Sweden",			"CH": "Switzerland",			"SY": "Syria",			"TW": "Taiwan",			"TJ": "Tajikistan",			"TZ": "Tanzania",			"TH": "Thailand",			"TL": "Timor-Leste",			"TG": "Togo",			"TK": "Tokelau",			"TO": "Tonga",			"TT": "Trinidad and Tobago",			"TN": "Tunisia",			"TR": "Turkey",			"TM": "Turkmenistan",			"TC": "Turks and Caicos Islands",			"TV": "Tuvalu",			"UG": "Uganda",			"UA": "Ukraine",			"AE": "United Arab Emirates",			"GB": "United Kingdom (UK)",			"US": "United States (US)",			"UM": "United States (US) Minor Outlying Islands",			"VI": "United States (US) Virgin Islands",			"UY": "Uruguay",			"UZ": "Uzbekistan",			"VU": "Vanuatu",			"VA": "Vatican",			"VE": "Venezuela",			"VN": "Vietnam",			"WF": "Wallis and Futuna",			"EH": "Western Sahara",			"YE": "Yemen",			"ZM": "Zambia",			"ZW": "Zimbabwe"		},		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/settings/general/woocommerce_all_except_countries"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/settings/general"				}			]		}	},	{		"id": "woocommerce_specific_allowed_countries",		"label": "Sell to specific countries",		"description": "",		"type": "multiselect",		"default": "",		"value": "",		"options": {			"AX": "&#197;land Islands",			"AF": "Afghanistan",			"AL": "Albania",			"DZ": "Algeria",			"AS": "American Samoa",			"AD": "Andorra",			"AO": "Angola",			"AI": "Anguilla",			"AQ": "Antarctica",			"AG": "Antigua and Barbuda",			"AR": "Argentina",			"AM": "Armenia",			"AW": "Aruba",			"AU": "Australia",			"AT": "Austria",			"AZ": "Azerbaijan",			"BS": "Bahamas",			"BH": "Bahrain",			"BD": "Bangladesh",			"BB": "Barbados",			"BY": "Belarus",			"PW": "Belau",			"BE": "Belgium",			"BZ": "Belize",			"BJ": "Benin",			"BM": "Bermuda",			"BT": "Bhutan",			"BO": "Bolivia",			"BQ": "Bonaire, Saint Eustatius and Saba",			"BA": "Bosnia and Herzegovina",			"BW": "Botswana",			"BV": "Bouvet Island",			"BR": "Brazil",			"IO": "British Indian Ocean Territory",			"VG": "British Virgin Islands",			"BN": "Brunei",			"BG": "Bulgaria",			"BF": "Burkina Faso",			"BI": "Burundi",			"KH": "Cambodia",			"CM": "Cameroon",			"CA": "Canada",			"CV": "Cape Verde",			"KY": "Cayman Islands",			"CF": "Central African Republic",			"TD": "Chad",			"CL": "Chile",			"CN": "China",			"CX": "Christmas Island",			"CC": "Cocos (Keeling) Islands",			"CO": "Colombia",			"KM": "Comoros",			"CG": "Congo (Brazzaville)",			"CD": "Congo (Kinshasa)",			"CK": "Cook Islands",			"CR": "Costa Rica",			"HR": "Croatia",			"CU": "Cuba",			"CW": "Cura&ccedil;ao",			"CY": "Cyprus",			"CZ": "Czech Republic",			"DK": "Denmark",			"DJ": "Djibouti",			"DM": "Dominica",			"DO": "Dominican Republic",			"EC": "Ecuador",			"EG": "Egypt",			"SV": "El Salvador",			"GQ": "Equatorial Guinea",			"ER": "Eritrea",			"EE": "Estonia",			"ET": "Ethiopia",			"FK": "Falkland Islands",			"FO": "Faroe Islands",			"FJ": "Fiji",			"FI": "Finland",			"FR": "France",			"GF": "French Guiana",			"PF": "French Polynesia",			"TF": "French Southern Territories",			"GA": "Gabon",			"GM": "Gambia",			"GE": "Georgia",			"DE": "Germany",			"GH": "Ghana",			"GI": "Gibraltar",			"GR": "Greece",			"GL": "Greenland",			"GD": "Grenada",			"GP": "Guadeloupe",			"GU": "Guam",			"GT": "Guatemala",			"GG": "Guernsey",			"GN": "Guinea",			"GW": "Guinea-Bissau",			"GY": "Guyana",			"HT": "Haiti",			"HM": "Heard Island and McDonald Islands",			"HN": "Honduras",			"HK": "Hong Kong",			"HU": "Hungary",			"IS": "Iceland",			"IN": "India",			"ID": "Indonesia",			"IR": "Iran",			"IQ": "Iraq",			"IE": "Ireland",			"IM": "Isle of Man",			"IL": "Israel",			"IT": "Italy",			"CI": "Ivory Coast",			"JM": "Jamaica",			"JP": "Japan",			"JE": "Jersey",			"JO": "Jordan",			"KZ": "Kazakhstan",			"KE": "Kenya",			"KI": "Kiribati",			"KW": "Kuwait",			"KG": "Kyrgyzstan",			"LA": "Laos",			"LV": "Latvia",			"LB": "Lebanon",			"LS": "Lesotho",			"LR": "Liberia",			"LY": "Libya",			"LI": "Liechtenstein",			"LT": "Lithuania",			"LU": "Luxembourg",			"MO": "Macao S.A.R., China",			"MK": "Macedonia",			"MG": "Madagascar",			"MW": "Malawi",			"MY": "Malaysia",			"MV": "Maldives",			"ML": "Mali",			"MT": "Malta",			"MH": "Marshall Islands",			"MQ": "Martinique",			"MR": "Mauritania",			"MU": "Mauritius",			"YT": "Mayotte",			"MX": "Mexico",			"FM": "Micronesia",			"MD": "Moldova",			"MC": "Monaco",			"MN": "Mongolia",			"ME": "Montenegro",			"MS": "Montserrat",			"MA": "Morocco",			"MZ": "Mozambique",			"MM": "Myanmar",			"NA": "Namibia",			"NR": "Nauru",			"NP": "Nepal",			"NL": "Netherlands",			"NC": "New Caledonia",			"NZ": "New Zealand",			"NI": "Nicaragua",			"NE": "Niger",			"NG": "Nigeria",			"NU": "Niue",			"NF": "Norfolk Island",			"KP": "North Korea",			"MP": "Northern Mariana Islands",			"NO": "Norway",			"OM": "Oman",			"PK": "Pakistan",			"PS": "Palestinian Territory",			"PA": "Panama",			"PG": "Papua New Guinea",			"PY": "Paraguay",			"PE": "Peru",			"PH": "Philippines",			"PN": "Pitcairn",			"PL": "Poland",			"PT": "Portugal",			"PR": "Puerto Rico",			"QA": "Qatar",			"RE": "Reunion",			"RO": "Romania",			"RU": "Russia",			"RW": "Rwanda",			"ST": "S&atilde;o Tom&eacute; and Pr&iacute;ncipe",			"BL": "Saint Barth&eacute;lemy",			"SH": "Saint Helena",			"KN": "Saint Kitts and Nevis",			"LC": "Saint Lucia",			"SX": "Saint Martin (Dutch part)",			"MF": "Saint Martin (French part)",			"PM": "Saint Pierre and Miquelon",			"VC": "Saint Vincent and the Grenadines",			"WS": "Samoa",			"SM": "San Marino",			"SA": "Saudi Arabia",			"SN": "Senegal",			"RS": "Serbia",			"SC": "Seychelles",			"SL": "Sierra Leone",			"SG": "Singapore",			"SK": "Slovakia",			"SI": "Slovenia",			"SB": "Solomon Islands",			"SO": "Somalia",			"ZA": "South Africa",			"GS": "South Georgia/Sandwich Islands",			"KR": "South Korea",			"SS": "South Sudan",			"ES": "Spain",			"LK": "Sri Lanka",			"SD": "Sudan",			"SR": "Suriname",			"SJ": "Svalbard and Jan Mayen",			"SZ": "Swaziland",			"SE": "Sweden",			"CH": "Switzerland",			"SY": "Syria",			"TW": "Taiwan",			"TJ": "Tajikistan",			"TZ": "Tanzania",			"TH": "Thailand",			"TL": "Timor-Leste",			"TG": "Togo",			"TK": "Tokelau",			"TO": "Tonga",			"TT": "Trinidad and Tobago",			"TN": "Tunisia",			"TR": "Turkey",			"TM": "Turkmenistan",			"TC": "Turks and Caicos Islands",			"TV": "Tuvalu",			"UG": "Uganda",			"UA": "Ukraine",			"AE": "United Arab Emirates",			"GB": "United Kingdom (UK)",			"US": "United States (US)",			"UM": "United States (US) Minor Outlying Islands",			"VI": "United States (US) Virgin Islands",			"UY": "Uruguay",			"UZ": "Uzbekistan",			"VU": "Vanuatu",			"VA": "Vatican",			"VE": "Venezuela",			"VN": "Vietnam",			"WF": "Wallis and Futuna",			"EH": "Western Sahara",			"YE": "Yemen",			"ZM": "Zambia",			"ZW": "Zimbabwe"		},		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/settings/general/woocommerce_specific_allowed_countries"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/settings/general"				}			]		}	},	{		"id": "woocommerce_ship_to_countries",		"label": "Shipping location(s)",		"description": "Choose which countries you want to ship to, or choose to ship to all locations you sell to.",		"type": "select",		"default": "",		"options": {			"": "Ship to all countries you sell to",			"all": "Ship to all countries",			"specific": "Ship to specific countries only",			"disabled": "Disable shipping &amp; shipping calculations"		},		"tip": "Choose which countries you want to ship to, or choose to ship to all locations you sell to.",		"value": "",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/settings/general/woocommerce_ship_to_countries"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/settings/general"				}			]		}	},	{		"id": "woocommerce_specific_ship_to_countries",		"label": "Ship to specific countries",		"description": "",		"type": "multiselect",		"default": "",		"value": "",		"options": {			"AX": "&#197;land Islands",			"AF": "Afghanistan",			"AL": "Albania",			"DZ": "Algeria",			"AS": "American Samoa",			"AD": "Andorra",			"AO": "Angola",			"AI": "Anguilla",			"AQ": "Antarctica",			"AG": "Antigua and Barbuda",			"AR": "Argentina",			"AM": "Armenia",			"AW": "Aruba",			"AU": "Australia",			"AT": "Austria",			"AZ": "Azerbaijan",			"BS": "Bahamas",			"BH": "Bahrain",			"BD": "Bangladesh",			"BB": "Barbados",			"BY": "Belarus",			"PW": "Belau",			"BE": "Belgium",			"BZ": "Belize",			"BJ": "Benin",			"BM": "Bermuda",			"BT": "Bhutan",			"BO": "Bolivia",			"BQ": "Bonaire, Saint Eustatius and Saba",			"BA": "Bosnia and Herzegovina",			"BW": "Botswana",			"BV": "Bouvet Island",			"BR": "Brazil",			"IO": "British Indian Ocean Territory",			"VG": "British Virgin Islands",			"BN": "Brunei",			"BG": "Bulgaria",			"BF": "Burkina Faso",			"BI": "Burundi",			"KH": "Cambodia",			"CM": "Cameroon",			"CA": "Canada",			"CV": "Cape Verde",			"KY": "Cayman Islands",			"CF": "Central African Republic",			"TD": "Chad",			"CL": "Chile",			"CN": "China",			"CX": "Christmas Island",			"CC": "Cocos (Keeling) Islands",			"CO": "Colombia",			"KM": "Comoros",			"CG": "Congo (Brazzaville)",			"CD": "Congo (Kinshasa)",			"CK": "Cook Islands",			"CR": "Costa Rica",			"HR": "Croatia",			"CU": "Cuba",			"CW": "Cura&ccedil;ao",			"CY": "Cyprus",			"CZ": "Czech Republic",			"DK": "Denmark",			"DJ": "Djibouti",			"DM": "Dominica",			"DO": "Dominican Republic",			"EC": "Ecuador",			"EG": "Egypt",			"SV": "El Salvador",			"GQ": "Equatorial Guinea",			"ER": "Eritrea",			"EE": "Estonia",			"ET": "Ethiopia",			"FK": "Falkland Islands",			"FO": "Faroe Islands",			"FJ": "Fiji",			"FI": "Finland",			"FR": "France",			"GF": "French Guiana",			"PF": "French Polynesia",			"TF": "French Southern Territories",			"GA": "Gabon",			"GM": "Gambia",			"GE": "Georgia",			"DE": "Germany",			"GH": "Ghana",			"GI": "Gibraltar",			"GR": "Greece",			"GL": "Greenland",			"GD": "Grenada",			"GP": "Guadeloupe",			"GU": "Guam",			"GT": "Guatemala",			"GG": "Guernsey",			"GN": "Guinea",			"GW": "Guinea-Bissau",			"GY": "Guyana",			"HT": "Haiti",			"HM": "Heard Island and McDonald Islands",			"HN": "Honduras",			"HK": "Hong Kong",			"HU": "Hungary",			"IS": "Iceland",			"IN": "India",			"ID": "Indonesia",			"IR": "Iran",			"IQ": "Iraq",			"IE": "Ireland",			"IM": "Isle of Man",			"IL": "Israel",			"IT": "Italy",			"CI": "Ivory Coast",			"JM": "Jamaica",			"JP": "Japan",			"JE": "Jersey",			"JO": "Jordan",			"KZ": "Kazakhstan",			"KE": "Kenya",			"KI": "Kiribati",			"KW": "Kuwait",			"KG": "Kyrgyzstan",			"LA": "Laos",			"LV": "Latvia",			"LB": "Lebanon",			"LS": "Lesotho",			"LR": "Liberia",			"LY": "Libya",			"LI": "Liechtenstein",			"LT": "Lithuania",			"LU": "Luxembourg",			"MO": "Macao S.A.R., China",			"MK": "Macedonia",			"MG": "Madagascar",			"MW": "Malawi",			"MY": "Malaysia",			"MV": "Maldives",			"ML": "Mali",			"MT": "Malta",			"MH": "Marshall Islands",			"MQ": "Martinique",			"MR": "Mauritania",			"MU": "Mauritius",			"YT": "Mayotte",			"MX": "Mexico",			"FM": "Micronesia",			"MD": "Moldova",			"MC": "Monaco",			"MN": "Mongolia",			"ME": "Montenegro",			"MS": "Montserrat",			"MA": "Morocco",			"MZ": "Mozambique",			"MM": "Myanmar",			"NA": "Namibia",			"NR": "Nauru",			"NP": "Nepal",			"NL": "Netherlands",			"NC": "New Caledonia",			"NZ": "New Zealand",			"NI": "Nicaragua",			"NE": "Niger",			"NG": "Nigeria",			"NU": "Niue",			"NF": "Norfolk Island",			"KP": "North Korea",			"MP": "Northern Mariana Islands",			"NO": "Norway",			"OM": "Oman",			"PK": "Pakistan",			"PS": "Palestinian Territory",			"PA": "Panama",			"PG": "Papua New Guinea",			"PY": "Paraguay",			"PE": "Peru",			"PH": "Philippines",			"PN": "Pitcairn",			"PL": "Poland",			"PT": "Portugal",			"PR": "Puerto Rico",			"QA": "Qatar",			"RE": "Reunion",			"RO": "Romania",			"RU": "Russia",			"RW": "Rwanda",			"ST": "S&atilde;o Tom&eacute; and Pr&iacute;ncipe",			"BL": "Saint Barth&eacute;lemy",			"SH": "Saint Helena",			"KN": "Saint Kitts and Nevis",			"LC": "Saint Lucia",			"SX": "Saint Martin (Dutch part)",			"MF": "Saint Martin (French part)",			"PM": "Saint Pierre and Miquelon",			"VC": "Saint Vincent and the Grenadines",			"WS": "Samoa",			"SM": "San Marino",			"SA": "Saudi Arabia",			"SN": "Senegal",			"RS": "Serbia",			"SC": "Seychelles",			"SL": "Sierra Leone",			"SG": "Singapore",			"SK": "Slovakia",			"SI": "Slovenia",			"SB": "Solomon Islands",			"SO": "Somalia",			"ZA": "South Africa",			"GS": "South Georgia/Sandwich Islands",			"KR": "South Korea",			"SS": "South Sudan",			"ES": "Spain",			"LK": "Sri Lanka",			"SD": "Sudan",			"SR": "Suriname",			"SJ": "Svalbard and Jan Mayen",			"SZ": "Swaziland",			"SE": "Sweden",			"CH": "Switzerland",			"SY": "Syria",			"TW": "Taiwan",			"TJ": "Tajikistan",			"TZ": "Tanzania",			"TH": "Thailand",			"TL": "Timor-Leste",			"TG": "Togo",			"TK": "Tokelau",			"TO": "Tonga",			"TT": "Trinidad and Tobago",			"TN": "Tunisia",			"TR": "Turkey",			"TM": "Turkmenistan",			"TC": "Turks and Caicos Islands",			"TV": "Tuvalu",			"UG": "Uganda",			"UA": "Ukraine",			"AE": "United Arab Emirates",			"GB": "United Kingdom (UK)",			"US": "United States (US)",			"UM": "United States (US) Minor Outlying Islands",			"VI": "United States (US) Virgin Islands",			"UY": "Uruguay",			"UZ": "Uzbekistan",			"VU": "Vanuatu",			"VA": "Vatican",			"VE": "Venezuela",			"VN": "Vietnam",			"WF": "Wallis and Futuna",			"EH": "Western Sahara",			"YE": "Yemen",			"ZM": "Zambia",			"ZW": "Zimbabwe"		},		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/settings/general/woocommerce_specific_ship_to_countries"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/settings/general"				}			]		}	},	{		"id": "woocommerce_default_customer_address",		"label": "Default customer location",		"description": "",		"type": "select",		"default": "geolocation",		"options": {			"": "No location by default",			"base": "Shop base address",			"geolocation": "Geolocate",			"geolocation_ajax": "Geolocate (with page caching support)"		},		"tip": "This option determines a customers default location. The MaxMind GeoLite Database will be periodically downloaded to your wp-content directory if using geolocation.",		"value": "geolocation",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/settings/general/woocommerce_default_customer_address"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/settings/general"				}			]		}	},	{		"id": "woocommerce_calc_taxes",		"label": "Enable taxes",		"description": "Enable taxes and tax calculations",		"type": "checkbox",		"default": "no",		"value": "yes",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/settings/general/woocommerce_calc_taxes"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/settings/general"				}			]		}	},	{		"id": "woocommerce_demo_store",		"label": "Store notice",		"description": "Enable site-wide store notice text",		"type": "checkbox",		"default": "no",		"value": "no",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/settings/general/woocommerce_demo_store"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/settings/general"				}			]		}	},	{		"id": "woocommerce_demo_store_notice",		"label": "Store notice text",		"description": "",		"type": "textarea",		"default": "This is a demo store for testing purposes &mdash; no orders shall be fulfilled.",		"value": "This is a demo store for testing purposes &mdash; no orders shall be fulfilled.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/settings/general/woocommerce_demo_store_notice"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/settings/general"				}			]		}	},	{		"id": "woocommerce_currency",		"label": "Currency",		"description": "This controls what currency prices are listed at in the catalog and which currency gateways will take payments in.",		"type": "select",		"default": "GBP",		"options": {			"AED": "United Arab Emirates dirham (&#x62f;.&#x625;)",			"AFN": "Afghan afghani (&#x60b;)",			"ALL": "Albanian lek (L)",			"AMD": "Armenian dram (AMD)",			"ANG": "Netherlands Antillean guilder (&fnof;)",			"AOA": "Angolan kwanza (Kz)",			"ARS": "Argentine peso (&#36;)",			"AUD": "Australian dollar (&#36;)",			"AWG": "Aruban florin (&fnof;)",			"AZN": "Azerbaijani manat (AZN)",			"BAM": "Bosnia and Herzegovina convertible mark (KM)",			"BBD": "Barbadian dollar (&#36;)",			"BDT": "Bangladeshi taka (&#2547;&nbsp;)",			"BGN": "Bulgarian lev (&#1083;&#1074;.)",			"BHD": "Bahraini dinar (.&#x62f;.&#x628;)",			"BIF": "Burundian franc (Fr)",			"BMD": "Bermudian dollar (&#36;)",			"BND": "Brunei dollar (&#36;)",			"BOB": "Bolivian boliviano (Bs.)",			"BRL": "Brazilian real (&#82;&#36;)",			"BSD": "Bahamian dollar (&#36;)",			"BTC": "Bitcoin (&#3647;)",			"BTN": "Bhutanese ngultrum (Nu.)",			"BWP": "Botswana pula (P)",			"BYR": "Belarusian ruble (Br)",			"BZD": "Belize dollar (&#36;)",			"CAD": "Canadian dollar (&#36;)",			"CDF": "Congolese franc (Fr)",			"CHF": "Swiss franc (&#67;&#72;&#70;)",			"CLP": "Chilean peso (&#36;)",			"CNY": "Chinese yuan (&yen;)",			"COP": "Colombian peso (&#36;)",			"CRC": "Costa Rican col&oacute;n (&#x20a1;)",			"CUC": "Cuban convertible peso (&#36;)",			"CUP": "Cuban peso (&#36;)",			"CVE": "Cape Verdean escudo (&#36;)",			"CZK": "Czech koruna (&#75;&#269;)",			"DJF": "Djiboutian franc (Fr)",			"DKK": "Danish krone (DKK)",			"DOP": "Dominican peso (RD&#36;)",			"DZD": "Algerian dinar (&#x62f;.&#x62c;)",			"EGP": "Egyptian pound (EGP)",			"ERN": "Eritrean nakfa (Nfk)",			"ETB": "Ethiopian birr (Br)",			"EUR": "Euro (&euro;)",			"FJD": "Fijian dollar (&#36;)",			"FKP": "Falkland Islands pound (&pound;)",			"GBP": "Pound sterling (&pound;)",			"GEL": "Georgian lari (&#x10da;)",			"GGP": "Guernsey pound (&pound;)",			"GHS": "Ghana cedi (&#x20b5;)",			"GIP": "Gibraltar pound (&pound;)",			"GMD": "Gambian dalasi (D)",			"GNF": "Guinean franc (Fr)",			"GTQ": "Guatemalan quetzal (Q)",			"GYD": "Guyanese dollar (&#36;)",			"HKD": "Hong Kong dollar (&#36;)",			"HNL": "Honduran lempira (L)",			"HRK": "Croatian kuna (Kn)",			"HTG": "Haitian gourde (G)",			"HUF": "Hungarian forint (&#70;&#116;)",			"IDR": "Indonesian rupiah (Rp)",			"ILS": "Israeli new shekel (&#8362;)",			"IMP": "Manx pound (&pound;)",			"INR": "Indian rupee (&#8377;)",			"IQD": "Iraqi dinar (&#x639;.&#x62f;)",			"IRR": "Iranian rial (&#xfdfc;)",			"IRT": "Iranian toman (&#x062A;&#x0648;&#x0645;&#x0627;&#x0646;)",			"ISK": "Icelandic kr&oacute;na (kr.)",			"JEP": "Jersey pound (&pound;)",			"JMD": "Jamaican dollar (&#36;)",			"JOD": "Jordanian dinar (&#x62f;.&#x627;)",			"JPY": "Japanese yen (&yen;)",			"KES": "Kenyan shilling (KSh)",			"KGS": "Kyrgyzstani som (&#x441;&#x43e;&#x43c;)",			"KHR": "Cambodian riel (&#x17db;)",			"KMF": "Comorian franc (Fr)",			"KPW": "North Korean won (&#x20a9;)",			"KRW": "South Korean won (&#8361;)",			"KWD": "Kuwaiti dinar (&#x62f;.&#x643;)",			"KYD": "Cayman Islands dollar (&#36;)",			"KZT": "Kazakhstani tenge (KZT)",			"LAK": "Lao kip (&#8365;)",			"LBP": "Lebanese pound (&#x644;.&#x644;)",			"LKR": "Sri Lankan rupee (&#xdbb;&#xdd4;)",			"LRD": "Liberian dollar (&#36;)",			"LSL": "Lesotho loti (L)",			"LYD": "Libyan dinar (&#x644;.&#x62f;)",			"MAD": "Moroccan dirham (&#x62f;.&#x645;.)",			"MDL": "Moldovan leu (MDL)",			"MGA": "Malagasy ariary (Ar)",			"MKD": "Macedonian denar (&#x434;&#x435;&#x43d;)",			"MMK": "Burmese kyat (Ks)",			"MNT": "Mongolian t&ouml;gr&ouml;g (&#x20ae;)",			"MOP": "Macanese pataca (P)",			"MRO": "Mauritanian ouguiya (UM)",			"MUR": "Mauritian rupee (&#x20a8;)",			"MVR": "Maldivian rufiyaa (.&#x783;)",			"MWK": "Malawian kwacha (MK)",			"MXN": "Mexican peso (&#36;)",			"MYR": "Malaysian ringgit (&#82;&#77;)",			"MZN": "Mozambican metical (MT)",			"NAD": "Namibian dollar (&#36;)",			"NGN": "Nigerian naira (&#8358;)",			"NIO": "Nicaraguan c&oacute;rdoba (C&#36;)",			"NOK": "Norwegian krone (&#107;&#114;)",			"NPR": "Nepalese rupee (&#8360;)",			"NZD": "New Zealand dollar (&#36;)",			"OMR": "Omani rial (&#x631;.&#x639;.)",			"PAB": "Panamanian balboa (B/.)",			"PEN": "Peruvian nuevo sol (S/.)",			"PGK": "Papua New Guinean kina (K)",			"PHP": "Philippine peso (&#8369;)",			"PKR": "Pakistani rupee (&#8360;)",			"PLN": "Polish z&#x142;oty (&#122;&#322;)",			"PRB": "Transnistrian ruble (&#x440;.)",			"PYG": "Paraguayan guaran&iacute; (&#8370;)",			"QAR": "Qatari riyal (&#x631;.&#x642;)",			"RON": "Romanian leu (lei)",			"RSD": "Serbian dinar (&#x434;&#x438;&#x43d;.)",			"RUB": "Russian ruble (&#8381;)",			"RWF": "Rwandan franc (Fr)",			"SAR": "Saudi riyal (&#x631;.&#x633;)",			"SBD": "Solomon Islands dollar (&#36;)",			"SCR": "Seychellois rupee (&#x20a8;)",			"SDG": "Sudanese pound (&#x62c;.&#x633;.)",			"SEK": "Swedish krona (&#107;&#114;)",			"SGD": "Singapore dollar (&#36;)",			"SHP": "Saint Helena pound (&pound;)",			"SLL": "Sierra Leonean leone (Le)",			"SOS": "Somali shilling (Sh)",			"SRD": "Surinamese dollar (&#36;)",			"SSP": "South Sudanese pound (&pound;)",			"STD": "S&atilde;o Tom&eacute; and Pr&iacute;ncipe dobra (Db)",			"SYP": "Syrian pound (&#x644;.&#x633;)",			"SZL": "Swazi lilangeni (L)",			"THB": "Thai baht (&#3647;)",			"TJS": "Tajikistani somoni (&#x405;&#x41c;)",			"TMT": "Turkmenistan manat (m)",			"TND": "Tunisian dinar (&#x62f;.&#x62a;)",			"TOP": "Tongan pa&#x2bb;anga (T&#36;)",			"TRY": "Turkish lira (&#8378;)",			"TTD": "Trinidad and Tobago dollar (&#36;)",			"TWD": "New Taiwan dollar (&#78;&#84;&#36;)",			"TZS": "Tanzanian shilling (Sh)",			"UAH": "Ukrainian hryvnia (&#8372;)",			"UGX": "Ugandan shilling (UGX)",			"USD": "United States dollar (&#36;)",			"UYU": "Uruguayan peso (&#36;)",			"UZS": "Uzbekistani som (UZS)",			"VEF": "Venezuelan bol&iacute;var (Bs F)",			"VND": "Vietnamese &#x111;&#x1ed3;ng (&#8363;)",			"VUV": "Vanuatu vatu (Vt)",			"WST": "Samoan t&#x101;l&#x101; (T)",			"XAF": "Central African CFA franc (Fr)",			"XCD": "East Caribbean dollar (&#36;)",			"XOF": "West African CFA franc (Fr)",			"XPF": "CFP franc (Fr)",			"YER": "Yemeni rial (&#xfdfc;)",			"ZAR": "South African rand (&#82;)",			"ZMW": "Zambian kwacha (ZK)"		},		"tip": "This controls what currency prices are listed at in the catalog and which currency gateways will take payments in.",		"value": "USD",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/settings/general/woocommerce_currency"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/settings/general"				}			]		}	},	{		"id": "woocommerce_currency_pos",		"label": "Currency position",		"description": "This controls the position of the currency symbol.",		"type": "select",		"default": "left",		"options": {			"left": "Left (&#36;99.99)",			"right": "Right (99.99&#36;)",			"left_space": "Left with space (&#36; 99.99)",			"right_space": "Right with space (99.99 &#36;)"		},		"tip": "This controls the position of the currency symbol.",		"value": "left",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/settings/general/woocommerce_currency_pos"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/settings/general"				}			]		}	},	{		"id": "woocommerce_price_thousand_sep",		"label": "Thousand separator",		"description": "This sets the thousand separator of displayed prices.",		"type": "text",		"default": ",",		"tip": "This sets the thousand separator of displayed prices.",		"value": ",",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/settings/general/woocommerce_price_thousand_sep"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/settings/general"				}			]		}	},	{		"id": "woocommerce_price_decimal_sep",		"label": "Decimal separator",		"description": "This sets the decimal separator of displayed prices.",		"type": "text",		"default": ".",		"tip": "This sets the decimal separator of displayed prices.",		"value": ".",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/settings/general/woocommerce_price_decimal_sep"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/settings/general"				}			]		}	},	{		"id": "woocommerce_price_num_decimals",		"label": "Number of decimals",		"description": "This sets the number of decimal points shown in displayed prices.",		"type": "number",		"default": "2",		"tip": "This sets the number of decimal points shown in displayed prices.",		"value": "2",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/settings/general/woocommerce_price_num_decimals"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/settings/general"				}			]		}	}]
```


## Update a setting option[​](/docs/apis/rest-api/v3/setting-options#update-a-setting-option)


This API lets you make changes to a setting option.


```
PUT /wp-json/wc/v3/settings/<group_id>/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X PUT https://example.com/wp-json/wc/v3/settings/general/woocommerce_allowed_countries \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "value": "all_except"}'
```

```
const data = {	value: 'all_except',};WooCommerce.put( 'settings/general/woocommerce_allowed_countries', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'value' => 'all_except'];print_r($woocommerce->put('settings/general/woocommerce_allowed_countries', $data));?>
```

```
data = {    "value": "all_except"}print(wcapi.put("settings/general/woocommerce_allowed_countries", data).json())
```

```
data = {  value: "all_except"}woocommerce.put("settings/general/woocommerce_allowed_countries", data).parsed_response
```

```
{	"id": "woocommerce_allowed_countries",	"label": "Selling location(s)",	"description": "This option lets you limit which countries you are willing to sell to.",	"type": "select",	"default": "all",	"options": {		"all": "Sell to all countries",		"all_except": "Sell to all countries, except for&hellip;",		"specific": "Sell to specific countries"	},	"tip": "This option lets you limit which countries you are willing to sell to.",	"value": "all_except",	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/settings/general/woocommerce_allowed_countries"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/settings/general"			}		]	}}
```


## Batch update setting options[​](/docs/apis/rest-api/v3/setting-options#batch-update-setting-options)


This API helps you to batch update multiple setting options.

note
Note: By default it's limited to up to 100 objects to be created, updated or
deleted.


```
POST /wp-json/wc/v3/settings/<id>/batch
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/settings/general/batch \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "update": [    {      "id": "woocommerce_allowed_countries",      "value": "all"    },    {      "id": "woocommerce_demo_store",      "value": "yes"    },    {      "id": "woocommerce_currency",      "value": "GBP"    }  ]}'
```

```
const data = {	create: [		{			regular_price: '10.00',			attributes: [				{					id: 6,					option: 'Blue',				},			],		},		{			regular_price: '10.00',			attributes: [				{					id: 6,					option: 'White',				},			],		},	],	update: [		{			id: 733,			regular_price: '10.00',		},	],	delete: [ 732 ],};WooCommerce.post( 'products/22/settings/general/batch', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'create' => [        [            'regular_price' => '10.00',            'attributes' => [                [                    'id' => 6,                    'option' => 'Blue'                ]            ]        ],        [            'regular_price' => '10.00',            'attributes' => [                [                    'id' => 6,                    'option' => 'White'                ]            ]        ]    ],    'update' => [        [            'id' => 733,            'regular_price' => '10.00'        ]    ],    'delete' => [        732    ]];print_r($woocommerce->post('products/22/settings/general/batch', $data));?>
```

```
data = {    "create": [        {            "regular_price": "10.00",            "attributes": [                {                    "id": 6,                    "option": "Blue"                }            ]        },        {            "regular_price": "10.00",            "attributes": [                {                    "id": 6,                    "option": "White"                }            ]        }    ],    "update": [        {            "id": 733,            "regular_price": "10.00"        }    ],    "delete": [        732    ]}print(wcapi.post("products/22/settings/general/batch", data).json())
```

```
data = {  create: [    {      regular_price: "10.00",      attributes: [        {          id: 6,          option: "Blue"        }      ]    },    {      regular_price: "10.00",      attributes: [        {          id: 6,          option: "White"        }      ]    }  ],  update: [    {      id: 733,      regular_price: "10.00"    }  ],  delete: [    732  ]}woocommerce.post("products/22/settings/general/batch", data).parsed_response
```

```
{	"update": [		{			"id": "woocommerce_allowed_countries",			"label": "Selling location(s)",			"description": "This option lets you limit which countries you are willing to sell to.",			"type": "select",			"default": "all",			"options": {				"all": "Sell to all countries",				"all_except": "Sell to all countries, except for&hellip;",				"specific": "Sell to specific countries"			},			"tip": "This option lets you limit which countries you are willing to sell to.",			"value": "all",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/settings/general/woocommerce_allowed_countries"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/settings/general"					}				]			}		},		{			"id": "woocommerce_demo_store",			"label": "Store notice",			"description": "Enable site-wide store notice text",			"type": "checkbox",			"default": "no",			"value": "yes",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/settings/general/woocommerce_demo_store"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/settings/general"					}				]			}		},		{			"id": "woocommerce_currency",			"label": "Currency",			"description": "This controls what currency prices are listed at in the catalog and which currency gateways will take payments in.",			"type": "select",			"default": "GBP",			"options": {				"AED": "United Arab Emirates dirham (&#x62f;.&#x625;)",				"AFN": "Afghan afghani (&#x60b;)",				"ALL": "Albanian lek (L)",				"AMD": "Armenian dram (AMD)",				"ANG": "Netherlands Antillean guilder (&fnof;)",				"AOA": "Angolan kwanza (Kz)",				"ARS": "Argentine peso (&#36;)",				"AUD": "Australian dollar (&#36;)",				"AWG": "Aruban florin (&fnof;)",				"AZN": "Azerbaijani manat (AZN)",				"BAM": "Bosnia and Herzegovina convertible mark (KM)",				"BBD": "Barbadian dollar (&#36;)",				"BDT": "Bangladeshi taka (&#2547;&nbsp;)",				"BGN": "Bulgarian lev (&#1083;&#1074;.)",				"BHD": "Bahraini dinar (.&#x62f;.&#x628;)",				"BIF": "Burundian franc (Fr)",				"BMD": "Bermudian dollar (&#36;)",				"BND": "Brunei dollar (&#36;)",				"BOB": "Bolivian boliviano (Bs.)",				"BRL": "Brazilian real (&#82;&#36;)",				"BSD": "Bahamian dollar (&#36;)",				"BTC": "Bitcoin (&#3647;)",				"BTN": "Bhutanese ngultrum (Nu.)",				"BWP": "Botswana pula (P)",				"BYR": "Belarusian ruble (Br)",				"BZD": "Belize dollar (&#36;)",				"CAD": "Canadian dollar (&#36;)",				"CDF": "Congolese franc (Fr)",				"CHF": "Swiss franc (&#67;&#72;&#70;)",				"CLP": "Chilean peso (&#36;)",				"CNY": "Chinese yuan (&yen;)",				"COP": "Colombian peso (&#36;)",				"CRC": "Costa Rican col&oacute;n (&#x20a1;)",				"CUC": "Cuban convertible peso (&#36;)",				"CUP": "Cuban peso (&#36;)",				"CVE": "Cape Verdean escudo (&#36;)",				"CZK": "Czech koruna (&#75;&#269;)",				"DJF": "Djiboutian franc (Fr)",				"DKK": "Danish krone (DKK)",				"DOP": "Dominican peso (RD&#36;)",				"DZD": "Algerian dinar (&#x62f;.&#x62c;)",				"EGP": "Egyptian pound (EGP)",				"ERN": "Eritrean nakfa (Nfk)",				"ETB": "Ethiopian birr (Br)",				"EUR": "Euro (&euro;)",				"FJD": "Fijian dollar (&#36;)",				"FKP": "Falkland Islands pound (&pound;)",				"GBP": "Pound sterling (&pound;)",				"GEL": "Georgian lari (&#x10da;)",				"GGP": "Guernsey pound (&pound;)",				"GHS": "Ghana cedi (&#x20b5;)",				"GIP": "Gibraltar pound (&pound;)",				"GMD": "Gambian dalasi (D)",				"GNF": "Guinean franc (Fr)",				"GTQ": "Guatemalan quetzal (Q)",				"GYD": "Guyanese dollar (&#36;)",				"HKD": "Hong Kong dollar (&#36;)",				"HNL": "Honduran lempira (L)",				"HRK": "Croatian kuna (Kn)",				"HTG": "Haitian gourde (G)",				"HUF": "Hungarian forint (&#70;&#116;)",				"IDR": "Indonesian rupiah (Rp)",				"ILS": "Israeli new shekel (&#8362;)",				"IMP": "Manx pound (&pound;)",				"INR": "Indian rupee (&#8377;)",				"IQD": "Iraqi dinar (&#x639;.&#x62f;)",				"IRR": "Iranian rial (&#xfdfc;)",				"IRT": "Iranian toman (&#x062A;&#x0648;&#x0645;&#x0627;&#x0646;)",				"ISK": "Icelandic kr&oacute;na (kr.)",				"JEP": "Jersey pound (&pound;)",				"JMD": "Jamaican dollar (&#36;)",				"JOD": "Jordanian dinar (&#x62f;.&#x627;)",				"JPY": "Japanese yen (&yen;)",				"KES": "Kenyan shilling (KSh)",				"KGS": "Kyrgyzstani som (&#x441;&#x43e;&#x43c;)",				"KHR": "Cambodian riel (&#x17db;)",				"KMF": "Comorian franc (Fr)",				"KPW": "North Korean won (&#x20a9;)",				"KRW": "South Korean won (&#8361;)",				"KWD": "Kuwaiti dinar (&#x62f;.&#x643;)",				"KYD": "Cayman Islands dollar (&#36;)",				"KZT": "Kazakhstani tenge (KZT)",				"LAK": "Lao kip (&#8365;)",				"LBP": "Lebanese pound (&#x644;.&#x644;)",				"LKR": "Sri Lankan rupee (&#xdbb;&#xdd4;)",				"LRD": "Liberian dollar (&#36;)",				"LSL": "Lesotho loti (L)",				"LYD": "Libyan dinar (&#x644;.&#x62f;)",				"MAD": "Moroccan dirham (&#x62f;.&#x645;.)",				"MDL": "Moldovan leu (MDL)",				"MGA": "Malagasy ariary (Ar)",				"MKD": "Macedonian denar (&#x434;&#x435;&#x43d;)",				"MMK": "Burmese kyat (Ks)",				"MNT": "Mongolian t&ouml;gr&ouml;g (&#x20ae;)",				"MOP": "Macanese pataca (P)",				"MRO": "Mauritanian ouguiya (UM)",				"MUR": "Mauritian rupee (&#x20a8;)",				"MVR": "Maldivian rufiyaa (.&#x783;)",				"MWK": "Malawian kwacha (MK)",				"MXN": "Mexican peso (&#36;)",				"MYR": "Malaysian ringgit (&#82;&#77;)",				"MZN": "Mozambican metical (MT)",				"NAD": "Namibian dollar (&#36;)",				"NGN": "Nigerian naira (&#8358;)",				"NIO": "Nicaraguan c&oacute;rdoba (C&#36;)",				"NOK": "Norwegian krone (&#107;&#114;)",				"NPR": "Nepalese rupee (&#8360;)",				"NZD": "New Zealand dollar (&#36;)",				"OMR": "Omani rial (&#x631;.&#x639;.)",				"PAB": "Panamanian balboa (B/.)",				"PEN": "Peruvian nuevo sol (S/.)",				"PGK": "Papua New Guinean kina (K)",				"PHP": "Philippine peso (&#8369;)",				"PKR": "Pakistani rupee (&#8360;)",				"PLN": "Polish z&#x142;oty (&#122;&#322;)",				"PRB": "Transnistrian ruble (&#x440;.)",				"PYG": "Paraguayan guaran&iacute; (&#8370;)",				"QAR": "Qatari riyal (&#x631;.&#x642;)",				"RON": "Romanian leu (lei)",				"RSD": "Serbian dinar (&#x434;&#x438;&#x43d;.)",				"RUB": "Russian ruble (&#8381;)",				"RWF": "Rwandan franc (Fr)",				"SAR": "Saudi riyal (&#x631;.&#x633;)",				"SBD": "Solomon Islands dollar (&#36;)",				"SCR": "Seychellois rupee (&#x20a8;)",				"SDG": "Sudanese pound (&#x62c;.&#x633;.)",				"SEK": "Swedish krona (&#107;&#114;)",				"SGD": "Singapore dollar (&#36;)",				"SHP": "Saint Helena pound (&pound;)",				"SLL": "Sierra Leonean leone (Le)",				"SOS": "Somali shilling (Sh)",				"SRD": "Surinamese dollar (&#36;)",				"SSP": "South Sudanese pound (&pound;)",				"STD": "S&atilde;o Tom&eacute; and Pr&iacute;ncipe dobra (Db)",				"SYP": "Syrian pound (&#x644;.&#x633;)",				"SZL": "Swazi lilangeni (L)",				"THB": "Thai baht (&#3647;)",				"TJS": "Tajikistani somoni (&#x405;&#x41c;)",				"TMT": "Turkmenistan manat (m)",				"TND": "Tunisian dinar (&#x62f;.&#x62a;)",				"TOP": "Tongan pa&#x2bb;anga (T&#36;)",				"TRY": "Turkish lira (&#8378;)",				"TTD": "Trinidad and Tobago dollar (&#36;)",				"TWD": "New Taiwan dollar (&#78;&#84;&#36;)",				"TZS": "Tanzanian shilling (Sh)",				"UAH": "Ukrainian hryvnia (&#8372;)",				"UGX": "Ugandan shilling (UGX)",				"USD": "United States dollar (&#36;)",				"UYU": "Uruguayan peso (&#36;)",				"UZS": "Uzbekistani som (UZS)",				"VEF": "Venezuelan bol&iacute;var (Bs F)",				"VND": "Vietnamese &#x111;&#x1ed3;ng (&#8363;)",				"VUV": "Vanuatu vatu (Vt)",				"WST": "Samoan t&#x101;l&#x101; (T)",				"XAF": "Central African CFA franc (Fr)",				"XCD": "East Caribbean dollar (&#36;)",				"XOF": "West African CFA franc (Fr)",				"XPF": "CFP franc (Fr)",				"YER": "Yemeni rial (&#xfdfc;)",				"ZAR": "South African rand (&#82;)",				"ZMW": "Zambian kwacha (ZK)"			},			"tip": "This controls what currency prices are listed at in the catalog and which currency gateways will take payments in.",			"value": "GBP",			"_links": {				"self": [					{						"href": "https://example.com/wp-json/wc/v3/settings/general/woocommerce_currency"					}				],				"collection": [					{						"href": "https://example.com/wp-json/wc/v3/settings/general"					}				]			}		}	]}
```

---

<a name="payment-gateways"></a>

The payment gateways API allows you to view, and update individual payment gateways. Results are not paginated - all gateways will be returned.


## Payment gateway properties[​](/docs/apis/rest-api/v3/payment-gateways#payment-gateway-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | string | Payment gateway ID. READ-ONLY |
| title | string | Payment gateway title on checkout. |
| description | string | Payment gateway description on checkout. |
| order | integer | Payment gateway sort order. |
| enabled | boolean | Payment gateway enabled status. |
| method_title | string | Payment gateway method title. READ-ONLY |
| method_description | string | Payment gateway method description. READ-ONLY |
| method_supports | array | Supported features for this payment gateway. READ-ONLY |
| settings | object | Payment gateway settings. See Payment gateway - Settings properties |


### Payment gateway - Settings properties[​](/docs/apis/rest-api/v3/payment-gateways#payment-gateway---settings-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | string | A unique identifier for the setting. READ-ONLY |
| label | string | A human readable label for the setting used in interfaces. READ-ONLY |
| description | string | A human readable description for the setting used in interfaces. READ-ONLY |
| type | string | Type of setting. Options: text, email, number, color, password, textarea, select, multiselect, radio, image_width and checkbox. READ-ONLY |
| value | string | Setting value. |
| default | string | Default value for the setting. READ-ONLY |
| tip | string | Additional help text shown to the user about the setting. READ-ONLY |
| placeholder | string | Placeholder text to be displayed in text inputs. READ-ONLY |


## Retrieve a payment gateway[​](/docs/apis/rest-api/v3/payment-gateways#retrieve-a-payment-gateway)


This API lets you retrieve and view a specific payment gateway.


```
GET /wp-json/wc/v3/payment_gateways/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/payment_gateways/bacs \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'payment_gateways/bacs' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('payment_gateways/bacs')); ?>
```

```
print(wcapi.get("payment_gateways/bacs").json())
```

```
woocommerce.get("payment_gateways/bacs").parsed_response
```

```
{	"id": "bacs",	"title": "Direct bank transfer",	"description": "Make your payment directly into our bank account. Please use your Order ID as the payment reference. Your order won't be shipped until the funds have cleared in our account.",	"order": 0,	"enabled": true,	"method_title": "BACS",	"method_description": "Allows payments by BACS, more commonly known as direct bank/wire transfer.",	"method_supports": [ "products" ],	"settings": {		"title": {			"id": "title",			"label": "Title",			"description": "This controls the title which the user sees during checkout.",			"type": "text",			"value": "Direct bank transfer",			"default": "Direct bank transfer",			"tip": "This controls the title which the user sees during checkout.",			"placeholder": ""		},		"instructions": {			"id": "instructions",			"label": "Instructions",			"description": "Instructions that will be added to the thank you page and emails.",			"type": "textarea",			"value": "Make your payment directly into our bank account. Please use your Order ID as the payment reference. Your order won't be shipped until the funds have cleared in our account.",			"default": "",			"tip": "Instructions that will be added to the thank you page and emails.",			"placeholder": ""		}	},	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/payment_gateways/bacs"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/payment_gateways"			}		]	}}
```


## List all payment gateways[​](/docs/apis/rest-api/v3/payment-gateways#list-all-payment-gateways)


This API helps you to view all the payment gateways.


```
GET /wp-json/wc/v3/payment_gateways
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/payment_gateways \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'payment_gateways' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('payment_gateways')); ?>
```

```
print(wcapi.get("payment_gateways").json())
```

```
woocommerce.get("payment_gateways").parsed_response
```

```
[	{		"id": "bacs",		"title": "Direct bank transfer",		"description": "Make your payment directly into our bank account. Please use your Order ID as the payment reference. Your order won't be shipped until the funds have cleared in our account.",		"order": 0,		"enabled": true,		"method_title": "BACS",		"method_description": "Allows payments by BACS, more commonly known as direct bank/wire transfer.",		"method_supports": [ "products" ],		"settings": {			"title": {				"id": "title",				"label": "Title",				"description": "This controls the title which the user sees during checkout.",				"type": "text",				"value": "Direct bank transfer",				"default": "Direct bank transfer",				"tip": "This controls the title which the user sees during checkout.",				"placeholder": ""			},			"instructions": {				"id": "instructions",				"label": "Instructions",				"description": "Instructions that will be added to the thank you page and emails.",				"type": "textarea",				"value": "Make your payment directly into our bank account. Please use your Order ID as the payment reference. Your order won't be shipped until the funds have cleared in our account.",				"default": "",				"tip": "Instructions that will be added to the thank you page and emails.",				"placeholder": ""			}		},		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/payment_gateways/bacs"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/payment_gateways"				}			]		}	},	{		"id": "cheque",		"title": "Check payments",		"description": "Please send a check to Store Name, Store Street, Store Town, Store State / County, Store Postcode.",		"order": 1,		"enabled": false,		"method_title": "Check payments",		"method_description": "Allows check payments. Why would you take checks in this day and age? Well you probably wouldn't but it does allow you to make test purchases for testing order emails and the 'success' pages etc.",		"method_supports": [ "products" ],		"settings": {			"title": {				"id": "title",				"label": "Title",				"description": "This controls the title which the user sees during checkout.",				"type": "text",				"value": "Check payments",				"default": "Check payments",				"tip": "This controls the title which the user sees during checkout.",				"placeholder": ""			},			"instructions": {				"id": "instructions",				"label": "Instructions",				"description": "Instructions that will be added to the thank you page and emails.",				"type": "textarea",				"value": "",				"default": "",				"tip": "Instructions that will be added to the thank you page and emails.",				"placeholder": ""			}		},		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/payment_gateways/cheque"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/payment_gateways"				}			]		}	},	{		"id": "cod",		"title": "Cash on delivery",		"description": "Pay with cash upon delivery.",		"order": 2,		"enabled": false,		"method_title": "Cash on delivery",		"method_description": "Have your customers pay with cash (or by other means) upon delivery.",		"method_supports": [ "products" ],		"settings": {			"title": {				"id": "title",				"label": "Title",				"description": "Payment method description that the customer will see on your checkout.",				"type": "text",				"value": "Cash on delivery",				"default": "Cash on delivery",				"tip": "Payment method description that the customer will see on your checkout.",				"placeholder": ""			},			"instructions": {				"id": "instructions",				"label": "Instructions",				"description": "Instructions that will be added to the thank you page.",				"type": "textarea",				"value": "",				"default": "Pay with cash upon delivery.",				"tip": "Instructions that will be added to the thank you page.",				"placeholder": ""			},			"enable_for_methods": {				"id": "enable_for_methods",				"label": "Enable for shipping methods",				"description": "If COD is only available for certain methods, set it up here. Leave blank to enable for all methods.",				"type": "multiselect",				"value": "",				"default": "",				"tip": "If COD is only available for certain methods, set it up here. Leave blank to enable for all methods.",				"placeholder": "",				"options": {					"flat_rate": "Flat rate",					"free_shipping": "Free shipping",					"local_pickup": "Local pickup"				}			},			"enable_for_virtual": {				"id": "enable_for_virtual",				"label": "Accept COD if the order is virtual",				"description": "",				"type": "checkbox",				"value": "yes",				"default": "yes",				"tip": "",				"placeholder": ""			}		},		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/payment_gateways/cod"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/payment_gateways"				}			]		}	},	{		"id": "paypal",		"title": "PayPal",		"description": "Pay via PayPal; you can pay with your credit card if you don't have a PayPal account.",		"order": 3,		"enabled": true,		"method_title": "PayPal",		"method_description": "PayPal Standard sends customers to PayPal to enter their payment information. PayPal IPN requires fsockopen/cURL support to update order statuses after payment. Check the <a href=\"https://example.com/wp-admin/admin.php?page=wc-status\">system status</a> page for more details.",		"method_supports": [ "products", "refunds" ],		"settings": {			"title": {				"id": "title",				"label": "Title",				"description": "This controls the title which the user sees during checkout.",				"type": "text",				"value": "PayPal",				"default": "PayPal",				"tip": "This controls the title which the user sees during checkout.",				"placeholder": ""			},			"email": {				"id": "email",				"label": "PayPal email",				"description": "Please enter your PayPal email address; this is needed in order to take payment.",				"type": "email",				"value": "me@example.com",				"default": "me@example.com",				"tip": "Please enter your PayPal email address; this is needed in order to take payment.",				"placeholder": "you@youremail.com"			},			"testmode": {				"id": "testmode",				"label": "Enable PayPal sandbox",				"description": "PayPal sandbox can be used to test payments. Sign up for a <a href=\"https://developer.paypal.com/\">developer account</a>.",				"type": "checkbox",				"value": "yes",				"default": "no",				"tip": "PayPal sandbox can be used to test payments. Sign up for a <a href=\"https://developer.paypal.com/\">developer account</a>.",				"placeholder": ""			},			"debug": {				"id": "debug",				"label": "Enable logging",				"description": "Log PayPal events, such as IPN requests, inside <code>/var/www/woocommerce/wp-content/uploads/wc-logs/paypal-de01f7c6894774e7ac8e4207bb8bac2f.log</code>",				"type": "checkbox",				"value": "yes",				"default": "no",				"tip": "Log PayPal events, such as IPN requests, inside <code>/var/www/woocommerce/wp-content/uploads/wc-logs/paypal-de01f7c6894774e7ac8e4207bb8bac2f.log</code>",				"placeholder": ""			},			"receiver_email": {				"id": "receiver_email",				"label": "Receiver email",				"description": "If your main PayPal email differs from the PayPal email entered above, input your main receiver email for your PayPal account here. This is used to validate IPN requests.",				"type": "email",				"value": "me@example.com",				"default": "",				"tip": "If your main PayPal email differs from the PayPal email entered above, input your main receiver email for your PayPal account here. This is used to validate IPN requests.",				"placeholder": "you@youremail.com"			},			"identity_token": {				"id": "identity_token",				"label": "PayPal identity token",				"description": "Optionally enable \"Payment Data Transfer\" (Profile > Profile and Settings > My Selling Tools > Website Preferences) and then copy your identity token here. This will allow payments to be verified without the need for PayPal IPN.",				"type": "text",				"value": "",				"default": "",				"tip": "Optionally enable \"Payment Data Transfer\" (Profile > Profile and Settings > My Selling Tools > Website Preferences) and then copy your identity token here. This will allow payments to be verified without the need for PayPal IPN.",				"placeholder": ""			},			"invoice_prefix": {				"id": "invoice_prefix",				"label": "Invoice prefix",				"description": "Please enter a prefix for your invoice numbers. If you use your PayPal account for multiple stores ensure this prefix is unique as PayPal will not allow orders with the same invoice number.",				"type": "text",				"value": "WC-",				"default": "WC-",				"tip": "Please enter a prefix for your invoice numbers. If you use your PayPal account for multiple stores ensure this prefix is unique as PayPal will not allow orders with the same invoice number.",				"placeholder": ""			},			"send_shipping": {				"id": "send_shipping",				"label": "Send shipping details to PayPal instead of billing.",				"description": "PayPal allows us to send one address. If you are using PayPal for shipping labels you may prefer to send the shipping address rather than billing.",				"type": "checkbox",				"value": "no",				"default": "no",				"tip": "PayPal allows us to send one address. If you are using PayPal for shipping labels you may prefer to send the shipping address rather than billing.",				"placeholder": ""			},			"address_override": {				"id": "address_override",				"label": "Enable \"address_override\" to prevent address information from being changed.",				"description": "PayPal verifies addresses therefore this setting can cause errors (we recommend keeping it disabled).",				"type": "checkbox",				"value": "no",				"default": "no",				"tip": "PayPal verifies addresses therefore this setting can cause errors (we recommend keeping it disabled).",				"placeholder": ""			},			"paymentaction": {				"id": "paymentaction",				"label": "Payment action",				"description": "Choose whether you wish to capture funds immediately or authorize payment only.",				"type": "select",				"value": "sale",				"default": "sale",				"tip": "Choose whether you wish to capture funds immediately or authorize payment only.",				"placeholder": "",				"options": {					"sale": "Capture",					"authorization": "Authorize"				}			},			"page_style": {				"id": "page_style",				"label": "Page style",				"description": "Optionally enter the name of the page style you wish to use. These are defined within your PayPal account. This affects classic PayPal checkout screens.",				"type": "text",				"value": "",				"default": "",				"tip": "Optionally enter the name of the page style you wish to use. These are defined within your PayPal account. This affects classic PayPal checkout screens.",				"placeholder": "Optional"			},			"image_url": {				"id": "image_url",				"label": "Image url",				"description": "Optionally enter the URL to a 150x50px image displayed as your logo in the upper left corner of the PayPal checkout pages.",				"type": "text",				"value": "",				"default": "",				"tip": "Optionally enter the URL to a 150x50px image displayed as your logo in the upper left corner of the PayPal checkout pages.",				"placeholder": "Optional"			},			"api_username": {				"id": "api_username",				"label": "API username",				"description": "Get your API credentials from PayPal.",				"type": "text",				"value": "",				"default": "",				"tip": "Get your API credentials from PayPal.",				"placeholder": "Optional"			},			"api_password": {				"id": "api_password",				"label": "API password",				"description": "Get your API credentials from PayPal.",				"type": "password",				"value": "",				"default": "",				"tip": "Get your API credentials from PayPal.",				"placeholder": "Optional"			},			"api_signature": {				"id": "api_signature",				"label": "API signature",				"description": "Get your API credentials from PayPal.",				"type": "text",				"value": "",				"default": "",				"tip": "Get your API credentials from PayPal.",				"placeholder": "Optional"			}		},		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/payment_gateways/paypal"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/payment_gateways"				}			]		}	}]
```


## Update a payment gateway[​](/docs/apis/rest-api/v3/payment-gateways#update-a-payment-gateway)


This API lets you make changes to a payment gateway.


```
PUT /wp-json/wc/v3/payment_gateways/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X PUT https://example.com/wp-json/wc/v3/payment_gateways/bacs \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "enabled": false}'
```

```
const data = {	enabled: true,};WooCommerce.put( 'payment_gateways/bacs', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'enabled' => true];print_r($woocommerce->put('payment_gateways/bacs', $data));?>
```

```
data = {    "enabled": True}print(wcapi.put("payment_gateways/bacs", data).json())
```

```
data = {  enabled: true}woocommerce.put("payment_gateways/bacs", data).parsed_response
```

```
{	"id": "bacs",	"title": "Direct bank transfer",	"description": "Make your payment directly into our bank account. Please use your Order ID as the payment reference. Your order won't be shipped until the funds have cleared in our account.",	"order": 0,	"enabled": false,	"method_title": "BACS",	"method_description": "Allows payments by BACS, more commonly known as direct bank/wire transfer.",	"method_supports": [ "products" ],	"settings": {		"title": {			"id": "title",			"label": "Title",			"description": "This controls the title which the user sees during checkout.",			"type": "text",			"value": "Direct bank transfer",			"default": "Direct bank transfer",			"tip": "This controls the title which the user sees during checkout.",			"placeholder": ""		},		"instructions": {			"id": "instructions",			"label": "Instructions",			"description": "Instructions that will be added to the thank you page and emails.",			"type": "textarea",			"value": "Make your payment directly into our bank account. Please use your Order ID as the payment reference. Your order won't be shipped until the funds have cleared in our account.",			"default": "",			"tip": "Instructions that will be added to the thank you page and emails.",			"placeholder": ""		}	},	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/payment_gateways/bacs"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/payment_gateways"			}		]	}}
```

---

<a name="shipping-zones"></a>

The shipping zones API allows you to create, view, update, and delete individual shipping zones.


## Shipping zone properties[​](/docs/apis/rest-api/v3/shipping-zones#shipping-zone-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | integer | Unique identifier for the resource. READ-ONLY |
| name | string | Shipping zone name. MANDATORY |
| order | integer | Shipping zone order. |


## Create a shipping zone[​](/docs/apis/rest-api/v3/shipping-zones#create-a-shipping-zone)


This API helps you to create a new shipping zone.


```
POST /wp-json/wc/v3/shipping/zones
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/shipping/zones \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "name": "Brazil"}'
```

```
const data = {	name: 'Brazil',};WooCommerce.post( 'shipping/zones', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'name' => 'Brazil'];print_r($woocommerce->post('shipping/zones', $data));?>
```

```
data = {    "name": "Brazil"}print(wcapi.post("shipping/zones", data).json())
```

```
data = {  name: "Brazil"}woocommerce.post("shipping/zones", data).parsed_response
```

```
{	"id": 5,	"name": "Brazil",	"order": 0,	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/shipping/zones/5"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/shipping/zones"			}		],		"describedby": [			{				"href": "https://example.com/wp-json/wc/v3/shipping/zones/5/locations"			}		]	}}
```


## Retrieve a shipping zone[​](/docs/apis/rest-api/v3/shipping-zones#retrieve-a-shipping-zone)


This API lets you retrieve and view a specific shipping zone by ID.


```
GET /wp-json/wc/v3/shipping/zones/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/shipping/zones/5 \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'shipping/zones/5' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('shipping/zones/5')); ?>
```

```
print(wcapi.get("shipping/zones/5").json())
```

```
woocommerce.get("shipping/zones/5").parsed_response
```

```
{	"id": 5,	"name": "Brazil",	"order": 0,	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/shipping/zones/5"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/shipping/zones"			}		],		"describedby": [			{				"href": "https://example.com/wp-json/wc/v3/shipping/zones/5/locations"			}		]	}}
```


## List all shipping zones[​](/docs/apis/rest-api/v3/shipping-zones#list-all-shipping-zones)


This API helps you to view all the shipping zones.


```
GET /wp-json/wc/v3/shipping/zones
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/shipping/zones \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'shipping/zones' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('shipping/zones')); ?>
```

```
print(wcapi.get("shipping/zones").json())
```

```
woocommerce.get("shipping/zones").parsed_response
```

```
[	{		"id": 0,		"name": "Rest of the World",		"order": 0,		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/shipping/zones/0"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/shipping/zones"				}			],			"describedby": [				{					"href": "https://example.com/wp-json/wc/v3/shipping/zones/0/locations"				}			]		}	},	{		"id": 5,		"name": "Brazil",		"order": 0,		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/shipping/zones/5"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/shipping/zones"				}			],			"describedby": [				{					"href": "https://example.com/wp-json/wc/v3/shipping/zones/5/locations"				}			]		}	}]
```


## Update a shipping zone[​](/docs/apis/rest-api/v3/shipping-zones#update-a-shipping-zone)


This API lets you make changes to a shipping zone.


```
PUT /wp-json/wc/v3/shipping/zones/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X PUT https://example.com/wp-json/wc/v3/shipping/zones/5 \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "order": 1}'
```

```
const data = {	order: 1,};WooCommerce.put( 'shipping/zones/5', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'order' => 1];print_r($woocommerce->put('shipping/zones/5', $data));?>
```

```
data = {    "order": 1}print(wcapi.put("shipping/zones/5", data).json())
```

```
data = {  order: 1}woocommerce.put("shipping/zones/5", data).parsed_response
```

```
{	"id": 5,	"name": "Brazil",	"order": 1,	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/shipping/zones/5"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/shipping/zones"			}		],		"describedby": [			{				"href": "https://example.com/wp-json/wc/v3/shipping/zones/5/locations"			}		]	}}
```


## Delete a shipping zone[​](/docs/apis/rest-api/v3/shipping-zones#delete-a-shipping-zone)


This API helps you delete a shipping zone.


```
DELETE /wp-json/wc/v3/shipping/zones/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X DELETE https://example.com/wp-json/wc/v3/shipping/zones/5?force=true \	-u consumer_key:consumer_secret
```

```
WooCommerce.delete( 'shipping/zones/5', {	force: true,} )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->delete('shipping/zones/5', ['force' => true])); ?>
```

```
print(wcapi.delete("shipping/zones/5", params={"force": True}).json())
```

```
woocommerce.delete("shipping/zones/5", force: true).parsed_response
```

```
{	"id": 5,	"name": "Brazil",	"order": 1,	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/shipping/zones/5"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/shipping/zones"			}		],		"describedby": [			{				"href": "https://example.com/wp-json/wc/v3/shipping/zones/5/locations"			}		]	}}
```


#### Available parameters[​](/docs/apis/rest-api/v3/shipping-zones#available-parameters)


| Parameter | Type | Description |
| --- | --- | --- |
| force | string | Required to be true, as resource does not support trashing. |

---

<a name="shipping-zone-locations"></a>

The shipping zone locations API allows you to view and batch update locations of a shipping zone.


## Shipping location properties[​](/docs/apis/rest-api/v3/shipping-zone-locations#shipping-location-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| code | string | Shipping zone location code. |
| type | string | Shipping zone location type. Options: postcode, state, country and continent. Default is country. |


## List all locations of a shipping zone[​](/docs/apis/rest-api/v3/shipping-zone-locations#list-all-locations-of-a-shipping-zone)


This API helps you to view all the locations of a shipping zone.


```
GET /wp-json/wc/v3/shipping/zones/<id>/locations
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/shipping/zones/5/locations \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'shipping/zones/5/locations' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('shipping/zones/5/locations')); ?>
```

```
print(wcapi.get("shipping/zones/5/locations").json())
```

```
woocommerce.get("shipping/zones/5/locations").parsed_response
```

```
[	{		"code": "BR",		"type": "country",		"_links": {			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/shipping/zones/5/locations"				}			],			"describes": [				{					"href": "https://example.com/wp-json/wc/v3/shipping/zones/5"				}			]		}	}]
```


## Update a locations of a shipping zone[​](/docs/apis/rest-api/v3/shipping-zone-locations#update-a-locations-of-a-shipping-zone)


This API lets you make changes to locations of a shipping zone.


```
PUT /wp-json/wc/v3/shipping/zones/<id>/locations
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X PUT https://example.com/wp-json/wc/v3/shipping/zones/5/locations \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '[  {    "code": "BR:SP",    "type": "state"  },  {    "code": "BR:RJ",    "type": "state"  }]'
```

```
var data = [	{		code: 'BR:SP',		type: 'state',	},	{		code: 'BR:RJ',		type: 'state',	},];WooCommerce.put( 'shipping/zones/5/locations', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    [        'code' => 'BR:SP',        'type' => 'state'    ],    [        'code' => 'BR:RJ',        'type' => 'state'    ]];print_r($woocommerce->put('shipping/zones/5/locations', $data));?>
```

```
data = [    {        "code": "BR:SP",        "type": "state"    },    {        "code": "BR:RJ",        "type": "state"    }]print(wcapi.put("shipping/zones/5/locations", data).json())
```

```
data = [  {    code: "BR:SP",    type: "state"  },  {    code: "BR:RJ",    type: "state"  }]woocommerce.put("shipping/zones/5/locations", data).parsed_response
```

```
[	{		"code": "BR:SP",		"type": "state",		"_links": {			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/shipping/zones/5/locations"				}			],			"describes": [				{					"href": "https://example.com/wp-json/wc/v3/shipping/zones/5"				}			]		}	},	{		"code": "BR:RJ",		"type": "state",		"_links": {			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/shipping/zones/5/locations"				}			],			"describes": [				{					"href": "https://example.com/wp-json/wc/v3/shipping/zones/5"				}			]		}	}]
```

---

<a name="shipping-zone-methods"></a>

The shipping zone methods API allows you to create, view, update, and delete individual methods of a shipping zone.


## Shipping method properties[​](/docs/apis/rest-api/v3/shipping-zone-methods#shipping-method-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| instance_id | integer | Shipping method instance ID. READ-ONLY |
| title | string | Shipping method customer facing title. READ-ONLY |
| order | integer | Shipping method sort order. |
| enabled | boolean | Shipping method enabled status. |
| method_id | string | Shipping method ID. READ-ONLY MANDATORY |
| method_title | string | Shipping method title. READ-ONLY |
| method_description | string | Shipping method description. READ-ONLY |
| settings | object | Shipping method settings. See Shipping method - Settings properties |


### Shipping method - Settings properties[​](/docs/apis/rest-api/v3/shipping-zone-methods#shipping-method---settings-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | string | A unique identifier for the setting. READ-ONLY |
| label | string | A human readable label for the setting used in interfaces. READ-ONLY |
| description | string | A human readable description for the setting used in interfaces. READ-ONLY |
| type | string | Type of setting. Options: text, email, number, color, password, textarea, select, multiselect, radio, image_width and checkbox. READ-ONLY |
| value | string | Setting value. |
| default | string | Default value for the setting. READ-ONLY |
| tip | string | Additional help text shown to the user about the setting. READ-ONLY |
| placeholder | string | Placeholder text to be displayed in text inputs. READ-ONLY |


## Include a shipping method to a shipping zone[​](/docs/apis/rest-api/v3/shipping-zone-methods#include-a-shipping-method-to-a-shipping-zone)


This API helps you to create a new shipping method to a shipping zone.


```
POST /wp-json/wc/v3/shipping/zones/<id>/methods
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X POST https://example.com/wp-json/wc/v3/shipping/zones/5/methods \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "method_id": "flat_rate"}'
```

```
const data = {	method_id: 'flat_rate',};WooCommerce.post( 'shipping/zones/5/methods', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'method_id' => 'flat_rate'];print_r($woocommerce->post('shipping/zones/5/methods', $data));?>
```

```
data = {    "method_id": "flat_rate"}print(wcapi.post("shipping/zones/5/methods", data).json())
```

```
data = {  method_id: "flat_rate"}woocommerce.post("shipping/zones/5/methods", data).parsed_response
```

```
{	"instance_id": 26,	"title": "Flat rate",	"order": 1,	"enabled": true,	"method_id": "flat_rate",	"method_title": "Flat rate",	"method_description": "<p>Lets you charge a fixed rate for shipping.</p>\n",	"settings": {		"title": {			"id": "title",			"label": "Method title",			"description": "This controls the title which the user sees during checkout.",			"type": "text",			"value": "Flat rate",			"default": "Flat rate",			"tip": "This controls the title which the user sees during checkout.",			"placeholder": ""		},		"tax_status": {			"id": "tax_status",			"label": "Tax status",			"description": "",			"type": "select",			"value": "taxable",			"default": "taxable",			"tip": "",			"placeholder": "",			"options": {				"taxable": "Taxable",				"none": "None"			}		},		"cost": {			"id": "cost",			"label": "Cost",			"description": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",			"type": "text",			"value": "0",			"default": "",			"tip": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",			"placeholder": ""		},		"class_costs": {			"id": "class_costs",			"label": "Shipping class costs",			"description": "These costs can optionally be added based on the <a href=\"https://example.com/wp-admin/admin.php?page=wc-settings&tab=shipping&section=classes\">product shipping class</a>.",			"type": "title",			"value": "",			"default": "",			"tip": "These costs can optionally be added based on the <a href=\"https://example.com/wp-admin/admin.php?page=wc-settings&tab=shipping&section=classes\">product shipping class</a>.",			"placeholder": ""		},		"class_cost_92": {			"id": "class_cost_92",			"label": "\"Express\" shipping class cost",			"description": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",			"type": "text",			"value": "",			"default": "",			"tip": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",			"placeholder": "N/A"		},		"class_cost_91": {			"id": "class_cost_91",			"label": "\"Priority\" shipping class cost",			"description": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",			"type": "text",			"value": "",			"default": "",			"tip": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",			"placeholder": "N/A"		},		"no_class_cost": {			"id": "no_class_cost",			"label": "No shipping class cost",			"description": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",			"type": "text",			"value": "",			"default": "",			"tip": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",			"placeholder": "N/A"		},		"type": {			"id": "type",			"label": "Calculation type",			"description": "",			"type": "select",			"value": "class",			"default": "class",			"tip": "",			"placeholder": "",			"options": {				"class": "Per class: Charge shipping for each shipping class individually",				"order": "Per order: Charge shipping for the most expensive shipping class"			}		}	},	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/shipping/zones/5/methods/26"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/shipping/zones/5/methods"			}		],		"describes": [			{				"href": "https://example.com/wp-json/wc/v3/shipping/zones/5"			}		]	}}
```


## Retrieve a shipping method from a shipping zone[​](/docs/apis/rest-api/v3/shipping-zone-methods#retrieve-a-shipping-method-from-a-shipping-zone)


This API lets you retrieve and view a specific shipping method from a shipping zone by ID.


```
GET /wp-json/wc/v3/shipping/zones/<zone_id>/methods/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/shipping/zones/5/methods/26 \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'shipping/zones/5/methods/26' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('shipping/zones/5/methods/26')); ?>
```

```
print(wcapi.get("shipping/zones/5/methods/26").json())
```

```
woocommerce.get("shipping/zones/5/methods/26").parsed_response
```

```
{	"instance_id": 26,	"title": "Flat rate",	"order": 1,	"enabled": true,	"method_id": "flat_rate",	"method_title": "Flat rate",	"method_description": "<p>Lets you charge a fixed rate for shipping.</p>\n",	"settings": {		"title": {			"id": "title",			"label": "Method title",			"description": "This controls the title which the user sees during checkout.",			"type": "text",			"value": "Flat rate",			"default": "Flat rate",			"tip": "This controls the title which the user sees during checkout.",			"placeholder": ""		},		"tax_status": {			"id": "tax_status",			"label": "Tax status",			"description": "",			"type": "select",			"value": "taxable",			"default": "taxable",			"tip": "",			"placeholder": "",			"options": {				"taxable": "Taxable",				"none": "None"			}		},		"cost": {			"id": "cost",			"label": "Cost",			"description": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",			"type": "text",			"value": "0",			"default": "",			"tip": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",			"placeholder": ""		},		"class_costs": {			"id": "class_costs",			"label": "Shipping class costs",			"description": "These costs can optionally be added based on the <a href=\"https://example.com/wp-admin/admin.php?page=wc-settings&tab=shipping&section=classes\">product shipping class</a>.",			"type": "title",			"value": "",			"default": "",			"tip": "These costs can optionally be added based on the <a href=\"https://example.com/wp-admin/admin.php?page=wc-settings&tab=shipping&section=classes\">product shipping class</a>.",			"placeholder": ""		},		"class_cost_92": {			"id": "class_cost_92",			"label": "\"Express\" shipping class cost",			"description": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",			"type": "text",			"value": "",			"default": "",			"tip": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",			"placeholder": "N/A"		},		"class_cost_91": {			"id": "class_cost_91",			"label": "\"Priority\" shipping class cost",			"description": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",			"type": "text",			"value": "",			"default": "",			"tip": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",			"placeholder": "N/A"		},		"no_class_cost": {			"id": "no_class_cost",			"label": "No shipping class cost",			"description": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",			"type": "text",			"value": "",			"default": "",			"tip": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",			"placeholder": "N/A"		},		"type": {			"id": "type",			"label": "Calculation type",			"description": "",			"type": "select",			"value": "class",			"default": "class",			"tip": "",			"placeholder": "",			"options": {				"class": "Per class: Charge shipping for each shipping class individually",				"order": "Per order: Charge shipping for the most expensive shipping class"			}		}	},	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/shipping/zones/5/methods/26"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/shipping/zones/5/methods"			}		],		"describes": [			{				"href": "https://example.com/wp-json/wc/v3/shipping/zones/5"			}		]	}}
```


## List all shipping methods from a shipping zone[​](/docs/apis/rest-api/v3/shipping-zone-methods#list-all-shipping-methods-from-a-shipping-zone)


This API helps you to view all the shipping methods from a shipping zone.


```
GET /wp-json/wc/v3/shipping/zones/<id>/methods
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/shipping/zones/5/methods \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'shipping/zones/5/methods' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('shipping/zones/5/methods')); ?>
```

```
print(wcapi.get("shipping/zones/5/methods").json())
```

```
woocommerce.get("shipping/zones/5/methods").parsed_response
```

```
[	{		"instance_id": 26,		"title": "Flat rate",		"order": 1,		"enabled": true,		"method_id": "flat_rate",		"method_title": "Flat rate",		"method_description": "<p>Lets you charge a fixed rate for shipping.</p>\n",		"settings": {			"title": {				"id": "title",				"label": "Method title",				"description": "This controls the title which the user sees during checkout.",				"type": "text",				"value": "Flat rate",				"default": "Flat rate",				"tip": "This controls the title which the user sees during checkout.",				"placeholder": ""			},			"tax_status": {				"id": "tax_status",				"label": "Tax status",				"description": "",				"type": "select",				"value": "taxable",				"default": "taxable",				"tip": "",				"placeholder": "",				"options": {					"taxable": "Taxable",					"none": "None"				}			},			"cost": {				"id": "cost",				"label": "Cost",				"description": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",				"type": "text",				"value": "0",				"default": "",				"tip": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",				"placeholder": ""			},			"class_costs": {				"id": "class_costs",				"label": "Shipping class costs",				"description": "These costs can optionally be added based on the <a href=\"https://example.com/wp-admin/admin.php?page=wc-settings&tab=shipping&section=classes\">product shipping class</a>.",				"type": "title",				"value": "",				"default": "",				"tip": "These costs can optionally be added based on the <a href=\"https://example.com/wp-admin/admin.php?page=wc-settings&tab=shipping&section=classes\">product shipping class</a>.",				"placeholder": ""			},			"class_cost_92": {				"id": "class_cost_92",				"label": "\"Express\" shipping class cost",				"description": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",				"type": "text",				"value": "",				"default": "",				"tip": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",				"placeholder": "N/A"			},			"class_cost_91": {				"id": "class_cost_91",				"label": "\"Priority\" shipping class cost",				"description": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",				"type": "text",				"value": "",				"default": "",				"tip": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",				"placeholder": "N/A"			},			"no_class_cost": {				"id": "no_class_cost",				"label": "No shipping class cost",				"description": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",				"type": "text",				"value": "",				"default": "",				"tip": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",				"placeholder": "N/A"			},			"type": {				"id": "type",				"label": "Calculation type",				"description": "",				"type": "select",				"value": "class",				"default": "class",				"tip": "",				"placeholder": "",				"options": {					"class": "Per class: Charge shipping for each shipping class individually",					"order": "Per order: Charge shipping for the most expensive shipping class"				}			}		},		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/shipping/zones/5/methods/26"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/shipping/zones/5/methods"				}			],			"describes": [				{					"href": "https://example.com/wp-json/wc/v3/shipping/zones/5"				}			]		}	},	{		"instance_id": 27,		"title": "Free shipping",		"order": 2,		"enabled": true,		"method_id": "free_shipping",		"method_title": "Free shipping",		"method_description": "<p>Free shipping is a special method which can be triggered with coupons and minimum spends.</p>\n",		"settings": {			"title": {				"id": "title",				"label": "Title",				"description": "This controls the title which the user sees during checkout.",				"type": "text",				"value": "Free shipping",				"default": "Free shipping",				"tip": "This controls the title which the user sees during checkout.",				"placeholder": ""			},			"requires": {				"id": "requires",				"label": "Free shipping requires...",				"description": "",				"type": "select",				"value": "",				"default": "",				"tip": "",				"placeholder": "",				"options": {					"": "N/A",					"coupon": "A valid free shipping coupon",					"min_amount": "A minimum order amount",					"either": "A minimum order amount OR a coupon",					"both": "A minimum order amount AND a coupon"				}			},			"min_amount": {				"id": "min_amount",				"label": "Minimum order amount",				"description": "Users will need to spend this amount to get free shipping (if enabled above).",				"type": "price",				"value": "0",				"default": "",				"tip": "Users will need to spend this amount to get free shipping (if enabled above).",				"placeholder": ""			}		},		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/shipping/zones/5/methods/27"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/shipping/zones/5/methods"				}			],			"describes": [				{					"href": "https://example.com/wp-json/wc/v3/shipping/zones/5"				}			]		}	}]
```


## Update a shipping method of a shipping zone[​](/docs/apis/rest-api/v3/shipping-zone-methods#update-a-shipping-method-of-a-shipping-zone)


This API lets you make changes to a shipping method of a shipping zone.


```
PUT /wp-json/wc/v3/shipping/zones/<zone_id>/methods/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X PUT https://example.com/wp-json/wc/v3/shipping/zones/5/methods/26 \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "settings": {    "cost": "20.00"  }}'
```

```
const data = {	settings: {		cost: '20.00',	},};WooCommerce.put( 'shipping/zones/5/methods/26', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'settings' => [        'cost' => '20.00'    ]];print_r($woocommerce->put('shipping/zones/5/methods/26', $data));?>
```

```
data = {    "settings": {        "cost": "20.00"    }}print(wcapi.put("shipping/zones/5/methods/26", data).json())
```

```
data = {  settings: {    "cost": "20.00"  }}woocommerce.put("shipping/zones/5/methods/26", data).parsed_response
```

```
{	"instance_id": 26,	"title": "Flat rate",	"order": 1,	"enabled": true,	"method_id": "flat_rate",	"method_title": "Flat rate",	"method_description": "<p>Lets you charge a fixed rate for shipping.</p>\n",	"settings": {		"title": {			"id": "title",			"label": "Method title",			"description": "This controls the title which the user sees during checkout.",			"type": "text",			"value": "Flat rate",			"default": "Flat rate",			"tip": "This controls the title which the user sees during checkout.",			"placeholder": ""		},		"tax_status": {			"id": "tax_status",			"label": "Tax status",			"description": "",			"type": "select",			"value": "taxable",			"default": "taxable",			"tip": "",			"placeholder": "",			"options": {				"taxable": "Taxable",				"none": "None"			}		},		"cost": {			"id": "cost",			"label": "Cost",			"description": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",			"type": "text",			"value": "20.00",			"default": "",			"tip": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",			"placeholder": ""		},		"class_costs": {			"id": "class_costs",			"label": "Shipping class costs",			"description": "These costs can optionally be added based on the <a href=\"https://example.com/wp-admin/admin.php?page=wc-settings&tab=shipping&section=classes\">product shipping class</a>.",			"type": "title",			"value": "",			"default": "",			"tip": "These costs can optionally be added based on the <a href=\"https://example.com/wp-admin/admin.php?page=wc-settings&tab=shipping&section=classes\">product shipping class</a>.",			"placeholder": ""		},		"class_cost_92": {			"id": "class_cost_92",			"label": "\"Express\" shipping class cost",			"description": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",			"type": "text",			"value": "",			"default": "",			"tip": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",			"placeholder": "N/A"		},		"class_cost_91": {			"id": "class_cost_91",			"label": "\"Priority\" shipping class cost",			"description": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",			"type": "text",			"value": "",			"default": "",			"tip": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",			"placeholder": "N/A"		},		"no_class_cost": {			"id": "no_class_cost",			"label": "No shipping class cost",			"description": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",			"type": "text",			"value": "",			"default": "",			"tip": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",			"placeholder": "N/A"		},		"type": {			"id": "type",			"label": "Calculation type",			"description": "",			"type": "select",			"value": "class",			"default": "class",			"tip": "",			"placeholder": "",			"options": {				"class": "Per class: Charge shipping for each shipping class individually",				"order": "Per order: Charge shipping for the most expensive shipping class"			}		}	},	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/shipping/zones/5/methods/26"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/shipping/zones/5/methods"			}		],		"describes": [			{				"href": "https://example.com/wp-json/wc/v3/shipping/zones/5"			}		]	}}
```


## Delete a shipping method from a shipping zone[​](/docs/apis/rest-api/v3/shipping-zone-methods#delete-a-shipping-method-from-a-shipping-zone)


This API helps you delete a shipping method from a shipping zone.


```
DELETE /wp-json/wc/v3/shipping/zones/<zone_id>/methods/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X DELETE https://example.com/wp-json/wc/v3/shipping/zones/5/methods/26?force=true \	-u consumer_key:consumer_secret
```

```
WooCommerce.delete( 'shipping/zones/5/methods/26', {	force: true,} )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->delete('shipping/zones/5/methods/26', ['force' => true])); ?>
```

```
print(wcapi.delete("shipping/zones/5/methods/26", params={"force": True}).json())
```

```
woocommerce.delete("shipping/zones/5/methods/26", force: true).parsed_response
```

```
{	"instance_id": 26,	"title": "Flat rate",	"order": 1,	"enabled": true,	"method_id": "flat_rate",	"method_title": "Flat rate",	"method_description": "<p>Lets you charge a fixed rate for shipping.</p>\n",	"settings": {		"title": {			"id": "title",			"label": "Method title",			"description": "This controls the title which the user sees during checkout.",			"type": "text",			"value": "Flat rate",			"default": "Flat rate",			"tip": "This controls the title which the user sees during checkout.",			"placeholder": ""		},		"tax_status": {			"id": "tax_status",			"label": "Tax status",			"description": "",			"type": "select",			"value": "taxable",			"default": "taxable",			"tip": "",			"placeholder": "",			"options": {				"taxable": "Taxable",				"none": "None"			}		},		"cost": {			"id": "cost",			"label": "Cost",			"description": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",			"type": "text",			"value": "20.00",			"default": "",			"tip": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",			"placeholder": ""		},		"class_costs": {			"id": "class_costs",			"label": "Shipping class costs",			"description": "These costs can optionally be added based on the <a href=\"https://example.com/wp-admin/admin.php?page=wc-settings&tab=shipping&section=classes\">product shipping class</a>.",			"type": "title",			"value": "",			"default": "",			"tip": "These costs can optionally be added based on the <a href=\"https://example.com/wp-admin/admin.php?page=wc-settings&tab=shipping&section=classes\">product shipping class</a>.",			"placeholder": ""		},		"class_cost_92": {			"id": "class_cost_92",			"label": "\"Express\" shipping class cost",			"description": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",			"type": "text",			"value": "",			"default": "",			"tip": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",			"placeholder": "N/A"		},		"class_cost_91": {			"id": "class_cost_91",			"label": "\"Priority\" shipping class cost",			"description": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",			"type": "text",			"value": "",			"default": "",			"tip": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",			"placeholder": "N/A"		},		"no_class_cost": {			"id": "no_class_cost",			"label": "No shipping class cost",			"description": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",			"type": "text",			"value": "",			"default": "",			"tip": "Enter a cost (excl. tax) or sum, e.g. <code>10.00 * [qty]</code>.<br/><br/>Use <code>[qty]</code> for the number of items, <br/><code>[cost]</code> for the total cost of items, and <code>[fee percent=\"10\" min_fee=\"20\" max_fee=\"\"]</code> for percentage based fees.",			"placeholder": "N/A"		},		"type": {			"id": "type",			"label": "Calculation type",			"description": "",			"type": "select",			"value": "class",			"default": "class",			"tip": "",			"placeholder": "",			"options": {				"class": "Per class: Charge shipping for each shipping class individually",				"order": "Per order: Charge shipping for the most expensive shipping class"			}		}	},	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/shipping/zones/5/methods/26"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/shipping/zones/5/methods"			}		],		"describes": [			{				"href": "https://example.com/wp-json/wc/v3/shipping/zones/5"			}		]	}}
```


#### Available parameters[​](/docs/apis/rest-api/v3/shipping-zone-methods#available-parameters)


| Parameter | Type | Description |
| --- | --- | --- |
| force | string | Required to be true, as resource does not support trashing. |

---

<a name="shipping-methods"></a>

The shipping methods API allows you to view individual shipping methods.


## Shipping method properties[​](/docs/apis/rest-api/v3/shipping-methods#shipping-method-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | string | Method ID. READ-ONLY |
| title | string | Shipping method title. READ-ONLY |
| description | string | Shipping method description. READ-ONLY |


## Retrieve a shipping method[​](/docs/apis/rest-api/v3/shipping-methods#retrieve-a-shipping-method)


This API lets you retrieve and view a specific shipping method.


```
GET /wp-json/wc/v3/shipping_methods/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/shipping_methods/flat_rate \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'shipping_methods/flat_rate' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('shipping_methods/flat_rate')); ?>
```

```
print(wcapi.get("shipping_methods/flat_rate").json())
```

```
woocommerce.get("shipping_methods/flat_rate").parsed_response
```

```
{	"id": "flat_rate",	"title": "Flat rate",	"description": "Lets you charge a fixed rate for shipping.",	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/shipping_methods/flat_rate"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/shipping_methods"			}		]	}}
```


## List all shipping methods[​](/docs/apis/rest-api/v3/shipping-methods#list-all-shipping-methods)


This API helps you to view all the shipping methods.


```
GET /wp-json/wc/v3/shipping_methods
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/shipping_methods \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'shipping_methods' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('shipping_methods')); ?>
```

```
print(wcapi.get("shipping_methods").json())
```

```
woocommerce.get("shipping_methods").parsed_response
```

```
[	{		"id": "flat_rate",		"title": "Flat rate",		"description": "Lets you charge a fixed rate for shipping.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/shipping_methods/flat_rate"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/shipping_methods"				}			]		}	},	{		"id": "free_shipping",		"title": "Free shipping",		"description": "Free shipping is a special method which can be triggered with coupons and minimum spends.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/shipping_methods/free_shipping"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/shipping_methods"				}			]		}	},	{		"id": "local_pickup",		"title": "Local pickup",		"description": "Allow customers to pick up orders themselves. By default, when using local pickup store base taxes will apply regardless of customer address.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/shipping_methods/local_pickup"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/shipping_methods"				}			]		}	}]
```

---

<a name="system-status"></a>

The system status API allows you to view all system status items.


## System status properties[​](/docs/apis/rest-api/v3/system-status#system-status-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| environment | object | Environment. See System status - Environment properties READ-ONLY |
| database | object | Database. See System status - Database properties READ-ONLY |
| active_plugins | array | Active plugins. READ-ONLY |
| theme | object | Theme. See System status - Theme properties READ-ONLY |
| settings | object | Settings. See System status - Settings properties READ-ONLY |
| security | object | Security. See System status - Security properties READ-ONLY |
| pages | array | WooCommerce pages. READ-ONLY |


### System status - Environment properties[​](/docs/apis/rest-api/v3/system-status#system-status---environment-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| home_url | string | Home URL. READ-ONLY |
| site_url | string | Site URL. READ-ONLY |
| version | string | WooCommerce version. READ-ONLY |
| log_directory | string | Log directory. READ-ONLY |
| log_directory_writable | boolean | Is log directory writable? READ-ONLY |
| wp_version | string | WordPress version. READ-ONLY |
| wp_multisite | boolean | Is WordPress multisite? READ-ONLY |
| wp_memory_limit | integer | WordPress memory limit. READ-ONLY |
| wp_debug_mode | boolean | Is WordPress debug mode active? READ-ONLY |
| wp_cron | boolean | Are WordPress cron jobs enabled? READ-ONLY |
| wp_environment_type | string | WordPress environment type. READ-ONLY |
| language | string | WordPress language. READ-ONLY |
| server_info | string | Server info. READ-ONLY |
| php_version | string | PHP version. READ-ONLY |
| php_post_max_size | integer | PHP post max size. READ-ONLY |
| php_max_execution_time | integer | PHP max execution time. READ-ONLY |
| php_max_input_vars | integer | PHP max input vars. READ-ONLY |
| curl_version | string | cURL version. READ-ONLY |
| suhosin_installed | boolean | Is SUHOSIN installed? READ-ONLY |
| max_upload_size | integer | Max upload size. READ-ONLY |
| mysql_version | string | MySQL version. READ-ONLY |
| default_timezone | string | Default timezone. READ-ONLY |
| fsockopen_or_curl_enabled | boolean | Is fsockopen/cURL enabled? READ-ONLY |
| soapclient_enabled | boolean | Is SoapClient class enabled? READ-ONLY |
| domdocument_enabled | boolean | Is DomDocument class enabled? READ-ONLY |
| gzip_enabled | boolean | Is GZip enabled? READ-ONLY |
| mbstring_enabled | boolean | Is mbstring enabled? READ-ONLY |
| remote_post_successful | boolean | Remote POST successful? READ-ONLY |
| remote_post_response | string | Remote POST response. READ-ONLY |
| remote_get_successful | boolean | Remote GET successful? READ-ONLY |
| remote_get_response | string | Remote GET response. READ-ONLY |


### System status - Database properties[​](/docs/apis/rest-api/v3/system-status#system-status---database-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| wc_database_version | string | WC database version. READ-ONLY |
| database_prefix | string | Database prefix. READ-ONLY |
| maxmind_geoip_database | string | MaxMind GeoIP database. READ-ONLY |
| database_tables | array | Database tables. READ-ONLY |


### System status - Theme properties[​](/docs/apis/rest-api/v3/system-status#system-status---theme-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| name | string | Theme name. READ-ONLY |
| version | string | Theme version. READ-ONLY |
| version_latest | string | Latest version of theme. READ-ONLY |
| author_url | string | Theme author URL. READ-ONLY |
| is_child_theme | boolean | Is this theme a child theme? READ-ONLY |
| has_woocommerce_support | boolean | Does the theme declare WooCommerce support? READ-ONLY |
| has_woocommerce_file | boolean | Does the theme have a woocommerce.php file? READ-ONLY |
| has_outdated_templates | boolean | Does this theme have outdated templates? READ-ONLY |
| overrides | array | Template overrides. READ-ONLY |
| parent_name | string | Parent theme name. READ-ONLY |
| parent_version | string | Parent theme version. READ-ONLY |
| parent_author_url | string | Parent theme author URL. READ-ONLY |


### System status - Settings properties[​](/docs/apis/rest-api/v3/system-status#system-status---settings-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| api_enabled | boolean | REST API enabled? READ-ONLY |
| force_ssl | boolean | SSL forced? READ-ONLY |
| currency | string | Currency. READ-ONLY |
| currency_symbol | string | Currency symbol. READ-ONLY |
| currency_position | string | Currency position. READ-ONLY |
| thousand_separator | string | Thousand separator. READ-ONLY |
| decimal_separator | string | Decimal separator. READ-ONLY |
| number_of_decimals | integer | Number of decimals. READ-ONLY |
| geolocation_enabled | boolean | Geolocation enabled? READ-ONLY |
| taxonomies | array | Taxonomy terms for product/order statuses. READ-ONLY |


### System status - Security properties[​](/docs/apis/rest-api/v3/system-status#system-status---security-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| secure_connection | boolean | Is the connection to your store secure? READ-ONLY |
| hide_errors | boolean | Hide errors from visitors? READ-ONLY |


## List all system status items[​](/docs/apis/rest-api/v3/system-status#list-all-system-status-items)


This API helps you to view all the system status items.


```
GET /wp-json/wc/v3/system_status
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/system_status \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'system_status' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('system_status')); ?>
```

```
print(wcapi.get("system_status").json())
```

```
woocommerce.get("system_status").parsed_response
```

```
{	"environment": {		"home_url": "http://example.com",		"site_url": "http://example.com",		"version": "3.0.0",		"log_directory": "/var/www/woocommerce/wp-content/uploads/wc-logs/",		"log_directory_writable": true,		"wp_version": "4.7.3",		"wp_multisite": false,		"wp_memory_limit": 134217728,		"wp_debug_mode": true,		"wp_cron": true,		"wp_environment_type": "production",		"language": "en_US",		"server_info": "Apache/2.4.18 (Ubuntu)",		"php_version": "7.1.3-2+deb.sury.org~yakkety+1",		"php_post_max_size": 8388608,		"php_max_execution_time": 30,		"php_max_input_vars": 1000,		"curl_version": "7.50.1, OpenSSL/1.0.2g",		"suhosin_installed": false,		"max_upload_size": 2097152,		"mysql_version": "5.7.17",		"default_timezone": "UTC",		"fsockopen_or_curl_enabled": true,		"soapclient_enabled": true,		"domdocument_enabled": true,		"gzip_enabled": true,		"mbstring_enabled": true,		"remote_post_successful": true,		"remote_post_response": "200",		"remote_get_successful": true,		"remote_get_response": "200"	},	"database": {		"wc_database_version": "3.0.0",		"database_prefix": "wp_",		"maxmind_geoip_database": "/var/www/woocommerce/wp-content/uploads/GeoIP.dat",		"database_tables": {			"woocommerce_sessions": true,			"woocommerce_api_keys": true,			"woocommerce_attribute_taxonomies": true,			"woocommerce_downloadable_product_permissions": true,			"woocommerce_order_items": true,			"woocommerce_order_itemmeta": true,			"woocommerce_tax_rates": true,			"woocommerce_tax_rate_locations": true,			"woocommerce_shipping_zones": true,			"woocommerce_shipping_zone_locations": true,			"woocommerce_shipping_zone_methods": true,			"woocommerce_payment_tokens": true,			"woocommerce_payment_tokenmeta": true		}	},	"active_plugins": [		{			"plugin": "woocommerce/woocommerce.php",			"name": "WooCommerce",			"version": "3.0.0-rc.1",			"version_latest": "2.6.14",			"url": "https://woocommerce.com/",			"author_name": "Automattic",			"author_url": "https://woocommerce.com",			"network_activated": false		}	],	"theme": {		"name": "Twenty Sixteen",		"version": "1.3",		"version_latest": "1.3",		"author_url": "https://wordpress.org/",		"is_child_theme": false,		"has_woocommerce_support": true,		"has_woocommerce_file": false,		"has_outdated_templates": false,		"overrides": [],		"parent_name": "",		"parent_version": "",		"parent_version_latest": "",		"parent_author_url": ""	},	"settings": {		"api_enabled": true,		"force_ssl": false,		"currency": "USD",		"currency_symbol": "&#36;",		"currency_position": "left",		"thousand_separator": ",",		"decimal_separator": ".",		"number_of_decimals": 2,		"geolocation_enabled": false,		"taxonomies": {			"external": "external",			"grouped": "grouped",			"simple": "simple",			"variable": "variable"		}	},	"security": {		"secure_connection": true,		"hide_errors": true	},	"pages": [		{			"page_name": "Shop base",			"page_id": "4",			"page_set": true,			"page_exists": true,			"page_visible": true,			"shortcode": "",			"shortcode_required": false,			"shortcode_present": false		},		{			"page_name": "Cart",			"page_id": "5",			"page_set": true,			"page_exists": true,			"page_visible": true,			"shortcode": "[woocommerce_cart]",			"shortcode_required": true,			"shortcode_present": true		},		{			"page_name": "Checkout",			"page_id": "6",			"page_set": true,			"page_exists": true,			"page_visible": true,			"shortcode": "[woocommerce_checkout]",			"shortcode_required": true,			"shortcode_present": true		},		{			"page_name": "My account",			"page_id": "7",			"page_set": true,			"page_exists": true,			"page_visible": true,			"shortcode": "[woocommerce_my_account]",			"shortcode_required": true,			"shortcode_present": true		}	]}
```

---

<a name="system-status-tools"></a>

The system status tools API allows you to view and run tools from system status.


## System status tool properties[​](/docs/apis/rest-api/v3/system-status-tools#system-status-tool-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| id | string | A unique identifier for the tool. READ-ONLY |
| name | string | Tool name. READ-ONLY |
| action | string | What running the tool will do. READ-ONLY |
| description | string | Tool description. READ-ONLY |
| success | boolean | Did the tool run successfully? READ-ONLY WRITE-ONLY |
| message | string | Tool return message. READ-ONLY WRITE-ONLY |
| confirm | boolean | Confirm execution of the tool. Default is false. WRITE-ONLY |


## Retrieve a tool from system status[​](/docs/apis/rest-api/v3/system-status-tools#retrieve-a-tool-from-system-status)


This API lets you retrieve and view a specific tool from system status by ID.


```
GET /wp-json/wc/v3/system_status/tools/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/system_status/tools/clear_transients \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'system_status/tools/clear_transients' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('system_status/tools/clear_transients')); ?>
```

```
print(wcapi.get("system_status/tools/clear_transients").json())
```

```
woocommerce.get("system_status/tools/clear_transients").parsed_response
```

```
{	"id": "clear_transients",	"name": "WC transients",	"action": "Clear transients",	"description": "This tool will clear the product/shop transients cache.",	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/system_status/tools/clear_transients"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/system_status/tools"			}		]	}}
```


## List all tools from system status[​](/docs/apis/rest-api/v3/system-status-tools#list-all-tools-from-system-status)


This API helps you to view all tools from system status.


```
GET /wp-json/wc/v3/system_status/tools
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/system_status/tools \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'system_status/tools' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('system_status/tools')); ?>
```

```
print(wcapi.get("system_status/tools").json())
```

```
woocommerce.get("system_status/tools").parsed_response
```

```
[	{		"id": "clear_transients",		"name": "WC transients",		"action": "Clear transients",		"description": "This tool will clear the product/shop transients cache.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools/clear_transients"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools"				}			]		}	},	{		"id": "clear_expired_transients",		"name": "Expired transients",		"action": "Clear expired transients",		"description": "This tool will clear ALL expired transients from WordPress.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools/clear_expired_transients"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools"				}			]		}	},	{		"id": "delete_orphaned_variations",		"name": "Orphaned variations",		"action": "Delete orphaned variations",		"description": "This tool will delete all variations which have no parent.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools/delete_orphaned_variations"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools"				}			]		}	},	{		"id": "clear_expired_download_permissions",		"name": "Used-up download permissions",		"action": "Clean up download permissions",		"description": "This tool will delete expired download permissions and permissions with 0 remaining downloads.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools/clear_expired_download_permissions"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools"				}			]		}	},	{		"id": "regenerate_product_lookup_tables",		"name": "Product lookup tables",		"action": "Regenerate",		"description": "This tool will regenerate product lookup table data. This process may take a while.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools/regenerate_product_lookup_tables"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools"				}			]		}	},	{		"id": "repair_coupons_lookup_table",		"name": "Coupons lookup table",		"action": "Repair",		"description": "This tool will repair the coupons lookup table data with missing discount amounts. This process may take a while.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools/repair_coupons_lookup_table"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools"				}			]		}	},	{		"id": "recount_terms",		"name": "Term counts",		"action": "Recount terms",		"description": "This tool will recount product terms - useful when changing your settings in a way which hides products from the catalog.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools/recount_terms"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools"				}			]		}	},	{		"id": "reset_roles",		"name": "Capabilities",		"action": "Reset capabilities",		"description": "This tool will reset the admin, customer and shop_manager roles to default. Use this if your users cannot access all of the WooCommerce admin pages.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools/reset_roles"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools"				}			]		}	},	{		"id": "clear_sessions",		"name": "Customer sessions",		"action": "Clear all sessions",		"description": "<strong class=\"red\">Note:</strong> This tool will delete all customer session data from the database, including any current live carts.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools/clear_sessions"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools"				}			]		}	},	{		"id": "clear_template_cache",		"name": "Clear template cache",		"action": "Clear",		"description": "<strong class=\"red\">Note:</strong> This tool will empty the template cache.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools/clear_template_cache"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools"				}			]		}	},	{		"id": "clear_system_status_theme_info_cache",		"name": "Clear system status theme info cache",		"action": "Clear",		"description": "<strong class=\"red\">Note:</strong> This tool will empty the system status theme info cache.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools/clear_system_status_theme_info_cache"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools"				}			]		}	},	{		"id": "install_pages",		"name": "Install WooCommerce pages",		"action": "Install pages",		"description": "<strong class=\"red\">Note:</strong> This tool will install all the missing WooCommerce pages. Pages already defined and set up will not be replaced.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools/install_pages"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools"				}			]		}	},	{		"id": "delete_taxes",		"name": "Delete all WooCommerce tax rates",		"action": "Delete ALL tax rates",		"description": "<strong class=\"red\">Note:</strong> This option will delete ALL of your tax rates, use with caution.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools/delete_taxes"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools"				}			]		}	},	{		"id": "regenerate_thumbnails",		"name": "Regenerate shop thumbnails",		"action": "Regenerate",		"description": "This will regenerate all shop thumbnails to match your theme and/or image settings.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools/regenerate_thumbnails"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools"				}			]		}	},	{		"id": "db_update_routine",		"name": "Update database",		"action": "Update database",		"description": "<strong class=\"red\">Note:</strong> This tool will update your WooCommerce database to the latest version. Please ensure you make sufficient backups before proceeding.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools/db_update_routine"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools"				}			]		}	},	{		"id": "recreate_order_address_fts_index",		"name": "Re-create Order Address FTS index",		"action": "Recreate index",		"description": "This tool will recreate the full text search index for order addresses. If the index does not exist, it will try to create it.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools/recreate_order_address_fts_index"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools"				}			]		}	},	{		"id": "verify_db_tables",		"name": "Verify base database tables",		"action": "Verify database",		"description": "Verify if all base database tables are present.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools/verify_db_tables"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/system_status/tools"				}			]		}	}]
```


## Run a tool from system status[​](/docs/apis/rest-api/v3/system-status-tools#run-a-tool-from-system-status)


This API lets you run a tool from system status.


```
PUT /wp-json/wc/v3/system_status/tools/<id>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl -X PUT https://example.com/wp-json/wc/v3/system_status/tools/clear_transients \	-u consumer_key:consumer_secret \	-H "Content-Type: application/json" \	-d '{  "confirm": true}'
```

```
const data = {	confirm: true,};WooCommerce.put( 'system_status/tools/clear_transients', data )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php$data = [    'confirm' => true];print_r($woocommerce->put('system_status/tools/clear_transients', $data));?>
```

```
data = {    "confirm": True}print(wcapi.put("system_status/tools/clear_transients", data).json())
```

```
data = {  confirm: true}woocommerce.put("system_status/tools/clear_transients", data).parsed_response
```

```
{	"id": "clear_transients",	"name": "WC transients",	"action": "Clear transients",	"description": "This tool will clear the product/shop transients cache.",	"success": true,	"message": "Product transients cleared",	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/system_status/tools/clear_transients"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/system_status/tools"			}		]	}}
```

---

<a name="data"></a>

The data API allows you to view all types of data available.


## List all data[​](/docs/apis/rest-api/v3/data#list-all-data)


This API lets you retrieve and view a simple list of available data endpoints.


```
GET /wp-json/wc/v3/data
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/data \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'data' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?php print_r($woocommerce->get('data')); ?>
```

```
print(wcapi.get("data").json())
```

```
woocommerce.get("data").parsed_response
```

```
[	{		"slug": "continents",		"description": "List of supported continents, countries, and states.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/data/continents"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/data"				}			]		}	},	{		"slug": "countries",		"description": "List of supported states in a given country.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/data/countries"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/data"				}			]		}	},	{		"slug": "currencies",		"description": "List of supported currencies.",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/data/currencies"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/data"				}			]		}	}]
```


#### Data properties[​](/docs/apis/rest-api/v3/data#data-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| slug | string | Data resource ID. READ-ONLY |
| description | string | Data resource description. READ-ONLY |


## List all continents[​](/docs/apis/rest-api/v3/data#list-all-continents)


This API helps you to view all the continents.


```
GET /wp-json/wc/v3/data/continents
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/data/continents \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'data/continents' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?phpprint_r($woocommerce->get('data/continents'));?>
```

```
print(wcapi.get("data/continents").json())
```

```
woocommerce.get("data/continents").parsed_response
```

```
[	{		"code": "AF",		"name": "Africa",		"countries": [			{				"code": "AO",				"name": "Angola",				"states": [					{						"code": "BGO",						"name": "Bengo"					},					{						"code": "BLU",						"name": "Benguela"					},					{						"code": "BIE",						"name": "Bié"					},					{						"code": "CAB",						"name": "Cabinda"					},					{						"code": "CNN",						"name": "Cunene"					},					{						"code": "HUA",						"name": "Huambo"					},					{						"code": "HUI",						"name": "Huíla"					},					{						"code": "CCU",						"name": "Kuando Kubango"					},					{						"code": "CNO",						"name": "Kwanza-Norte"					},					{						"code": "CUS",						"name": "Kwanza-Sul"					},					{						"code": "LUA",						"name": "Luanda"					},					{						"code": "LNO",						"name": "Lunda-Norte"					},					{						"code": "LSU",						"name": "Lunda-Sul"					},					{						"code": "MAL",						"name": "Malanje"					},					{						"code": "MOX",						"name": "Moxico"					},					{						"code": "NAM",						"name": "Namibe"					},					{						"code": "UIG",						"name": "Uíge"					},					{						"code": "ZAI",						"name": "Zaire"					}				]			},			{				"code": "BF",				"name": "Burkina Faso",				"states": []			},			{				"code": "BI",				"name": "Burundi",				"states": []			}		],		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/data/continents/af"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/data/continents"				}			]		}	}]
```


#### Continents properties[​](/docs/apis/rest-api/v3/data#continents-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| code | string | 2 character continent code. READ-ONLY |
| name | string | Full name of continent. READ-ONLY |
| countries | array | List of countries on this continent. See Continents - Countries properties READ-ONLY |


##### Continents - Countries properties[​](/docs/apis/rest-api/v3/data#continents---countries-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| code | string | ISO3166 alpha-2 country code. READ-ONLY |
| currency_code | string | Default ISO4127 alpha-3 currency code for the country. READ-ONLY |
| currency_pos | string | Currency symbol position for this country. READ-ONLY |
| decimal_sep | string | Decimal separator for displayed prices for this country. READ-ONLY |
| dimension_unit | string | The unit lengths are defined in for this country. READ-ONLY |
| name | string | Full name of country. READ-ONLY |
| num_decimals | integer | Number of decimal points shown in displayed prices for this country. READ-ONLY |
| states | array | List of states in this country. See Continents - Countries - States properties READ-ONLY |
| thousand_sep | string | Thousands separator for displayed prices in this country. READ-ONLY |
| weight_unit | string | The unit weights are defined in for this country. READ-ONLY |


##### Continents - Countries - States properties[​](/docs/apis/rest-api/v3/data#continents---countries---states-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| code | string | State code. READ-ONLY |
| name | string | Full name of state. READ-ONLY |


## Retrieve continent data[​](/docs/apis/rest-api/v3/data#retrieve-continent-data)


This API lets you retrieve and view a continent data.


```
GET /wp-json/wc/v3/data/continents/<location>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/data/continents/eu \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'data/continents/eu' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?phpprint_r($woocommerce->get('data/continents/eu'));?>
```

```
print(wcapi.get("data/continents/eu").json())
```

```
woocommerce.get("data/continents/eu").parsed_response
```

```
{	"code": "EU",	"name": "Europe",	"countries": [		{			"code": "AD",			"name": "Andorra",			"states": []		},		{			"code": "AL",			"name": "Albania",			"states": []		},		{			"code": "AT",			"name": "Austria",			"states": []		},		{			"code": "AX",			"name": "&#197;land Islands",			"states": []		},		{			"code": "BA",			"name": "Bosnia and Herzegovina",			"states": []		},		{			"code": "BE",			"name": "Belgium",			"currency_code": "EUR",			"currency_pos": "left",			"decimal_sep": ",",			"dimension_unit": "cm",			"num_decimals": 2,			"thousand_sep": " ",			"weight_unit": "kg",			"states": []		},		{			"code": "BG",			"name": "Bulgaria",			"states": [				{					"code": "BG-01",					"name": "Blagoevgrad"				},				{					"code": "BG-02",					"name": "Burgas"				},				{					"code": "BG-08",					"name": "Dobrich"				},				{					"code": "BG-07",					"name": "Gabrovo"				},				{					"code": "BG-26",					"name": "Haskovo"				},				{					"code": "BG-09",					"name": "Kardzhali"				},				{					"code": "BG-10",					"name": "Kyustendil"				},				{					"code": "BG-11",					"name": "Lovech"				},				{					"code": "BG-12",					"name": "Montana"				},				{					"code": "BG-13",					"name": "Pazardzhik"				},				{					"code": "BG-14",					"name": "Pernik"				},				{					"code": "BG-15",					"name": "Pleven"				},				{					"code": "BG-16",					"name": "Plovdiv"				},				{					"code": "BG-17",					"name": "Razgrad"				},				{					"code": "BG-18",					"name": "Ruse"				},				{					"code": "BG-27",					"name": "Shumen"				},				{					"code": "BG-19",					"name": "Silistra"				},				{					"code": "BG-20",					"name": "Sliven"				},				{					"code": "BG-21",					"name": "Smolyan"				},				{					"code": "BG-23",					"name": "Sofia"				},				{					"code": "BG-22",					"name": "Sofia-Grad"				},				{					"code": "BG-24",					"name": "Stara Zagora"				},				{					"code": "BG-25",					"name": "Targovishte"				},				{					"code": "BG-03",					"name": "Varna"				},				{					"code": "BG-04",					"name": "Veliko Tarnovo"				},				{					"code": "BG-05",					"name": "Vidin"				},				{					"code": "BG-06",					"name": "Vratsa"				},				{					"code": "BG-28",					"name": "Yambol"				}			]		}	],	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/data/continents/eu"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/data/continents"			}		]	}}
```


#### Continent properties[​](/docs/apis/rest-api/v3/data#continent-properties)


See [list of continents properties](/docs/apis/rest-api/v3/data#continents-properties).


## List all countries[​](/docs/apis/rest-api/v3/data#list-all-countries)


This API helps you to view all the countries.


```
GET /wp-json/wc/v3/data/countries
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/data/countries \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'data/countries' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?phpprint_r($woocommerce->get('data/countries'));?>
```

```
print(wcapi.get("data/countries").json())
```

```
woocommerce.get("data/countries").parsed_response
```

```
[	{		"code": "US",		"name": "United States (US)",		"states": [			{				"code": "AL",				"name": "Alabama"			},			{				"code": "AK",				"name": "Alaska"			},			{				"code": "AZ",				"name": "Arizona"			},			{				"code": "AR",				"name": "Arkansas"			},			{				"code": "CA",				"name": "California"			},			{				"code": "CO",				"name": "Colorado"			},			{				"code": "CT",				"name": "Connecticut"			},			{				"code": "DE",				"name": "Delaware"			},			{				"code": "DC",				"name": "District Of Columbia"			},			{				"code": "FL",				"name": "Florida"			},			{				"code": "GA",				"name": "Georgia"			},			{				"code": "HI",				"name": "Hawaii"			},			{				"code": "ID",				"name": "Idaho"			},			{				"code": "IL",				"name": "Illinois"			},			{				"code": "IN",				"name": "Indiana"			},			{				"code": "IA",				"name": "Iowa"			},			{				"code": "KS",				"name": "Kansas"			},			{				"code": "KY",				"name": "Kentucky"			},			{				"code": "LA",				"name": "Louisiana"			},			{				"code": "ME",				"name": "Maine"			},			{				"code": "MD",				"name": "Maryland"			},			{				"code": "MA",				"name": "Massachusetts"			},			{				"code": "MI",				"name": "Michigan"			},			{				"code": "MN",				"name": "Minnesota"			},			{				"code": "MS",				"name": "Mississippi"			},			{				"code": "MO",				"name": "Missouri"			},			{				"code": "MT",				"name": "Montana"			},			{				"code": "NE",				"name": "Nebraska"			},			{				"code": "NV",				"name": "Nevada"			},			{				"code": "NH",				"name": "New Hampshire"			},			{				"code": "NJ",				"name": "New Jersey"			},			{				"code": "NM",				"name": "New Mexico"			},			{				"code": "NY",				"name": "New York"			},			{				"code": "NC",				"name": "North Carolina"			},			{				"code": "ND",				"name": "North Dakota"			},			{				"code": "OH",				"name": "Ohio"			},			{				"code": "OK",				"name": "Oklahoma"			},			{				"code": "OR",				"name": "Oregon"			},			{				"code": "PA",				"name": "Pennsylvania"			},			{				"code": "RI",				"name": "Rhode Island"			},			{				"code": "SC",				"name": "South Carolina"			},			{				"code": "SD",				"name": "South Dakota"			},			{				"code": "TN",				"name": "Tennessee"			},			{				"code": "TX",				"name": "Texas"			},			{				"code": "UT",				"name": "Utah"			},			{				"code": "VT",				"name": "Vermont"			},			{				"code": "VA",				"name": "Virginia"			},			{				"code": "WA",				"name": "Washington"			},			{				"code": "WV",				"name": "West Virginia"			},			{				"code": "WI",				"name": "Wisconsin"			},			{				"code": "WY",				"name": "Wyoming"			},			{				"code": "AA",				"name": "Armed Forces (AA)"			},			{				"code": "AE",				"name": "Armed Forces (AE)"			},			{				"code": "AP",				"name": "Armed Forces (AP)"			}		],		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/data/countries/us"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/data/countries"				}			]		}	}]
```


#### Countries properties[​](/docs/apis/rest-api/v3/data#countries-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| code | string | ISO3166 alpha-2 country code. READ-ONLY |
| name | string | Full name of country. READ-ONLY |
| states | array | List of states in this country. See Countries - States properties READ-ONLY |


##### Countries - States properties[​](/docs/apis/rest-api/v3/data#countries---states-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| code | string | State code. READ-ONLY |
| name | string | Full name of state. READ-ONLY |


## Retrieve country data[​](/docs/apis/rest-api/v3/data#retrieve-country-data)


This API lets you retrieve and view a country data.


```
GET /wp-json/wc/v3/data/countries/<location>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/data/countries/br \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'data/countries/br' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?phpprint_r($woocommerce->get('data/countries/br'));?>
```

```
print(wcapi.get("data/countries/br").json())
```

```
woocommerce.get("data/countries/br").parsed_response
```

```
{	"code": "BR",	"name": "Brazil",	"states": [		{			"code": "AC",			"name": "Acre"		},		{			"code": "AL",			"name": "Alagoas"		},		{			"code": "AP",			"name": "Amap&aacute;"		},		{			"code": "AM",			"name": "Amazonas"		},		{			"code": "BA",			"name": "Bahia"		},		{			"code": "CE",			"name": "Cear&aacute;"		},		{			"code": "DF",			"name": "Distrito Federal"		},		{			"code": "ES",			"name": "Esp&iacute;rito Santo"		},		{			"code": "GO",			"name": "Goi&aacute;s"		},		{			"code": "MA",			"name": "Maranh&atilde;o"		},		{			"code": "MT",			"name": "Mato Grosso"		},		{			"code": "MS",			"name": "Mato Grosso do Sul"		},		{			"code": "MG",			"name": "Minas Gerais"		},		{			"code": "PA",			"name": "Par&aacute;"		},		{			"code": "PB",			"name": "Para&iacute;ba"		},		{			"code": "PR",			"name": "Paran&aacute;"		},		{			"code": "PE",			"name": "Pernambuco"		},		{			"code": "PI",			"name": "Piau&iacute;"		},		{			"code": "RJ",			"name": "Rio de Janeiro"		},		{			"code": "RN",			"name": "Rio Grande do Norte"		},		{			"code": "RS",			"name": "Rio Grande do Sul"		},		{			"code": "RO",			"name": "Rond&ocirc;nia"		},		{			"code": "RR",			"name": "Roraima"		},		{			"code": "SC",			"name": "Santa Catarina"		},		{			"code": "SP",			"name": "S&atilde;o Paulo"		},		{			"code": "SE",			"name": "Sergipe"		},		{			"code": "TO",			"name": "Tocantins"		}	],	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/data/countries/br"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/data/countries"			}		]	}}
```


#### Country properties[​](/docs/apis/rest-api/v3/data#country-properties)


See [list of countries properties](/docs/apis/rest-api/v3/data#countries-properties).


## List all currencies[​](/docs/apis/rest-api/v3/data#list-all-currencies)


This API helps you to view all the currencies.


```
GET /wp-json/wc/v3/data/currencies
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/data/currencies \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'data/currencies' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?phpprint_r($woocommerce->get('data/currencies'));?>
```

```
print(wcapi.get("data/currencies").json())
```

```
woocommerce.get("data/currencies").parsed_response
```

```
[	{		"code": "BTC",		"name": "Bitcoin",		"symbol": "&#3647;",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/data/currencies/BTC"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/data/currencies"				}			]		}	},	{		"code": "EUR",		"name": "Euro",		"symbol": "&euro;",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/data/currencies/EUR"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/data/currencies"				}			]		}	},	{		"code": "USD",		"name": "United States (US) dollar",		"symbol": "&#36;",		"_links": {			"self": [				{					"href": "https://example.com/wp-json/wc/v3/data/currencies/USD"				}			],			"collection": [				{					"href": "https://example.com/wp-json/wc/v3/data/currencies"				}			]		}	}]
```


#### Currencies properties[​](/docs/apis/rest-api/v3/data#currencies-properties)


| Attribute | Type | Description |
| --- | --- | --- |
| code | string | ISO4217 currency code. READ-ONLY |
| name | string | Full name of currency. READ-ONLY |
| symbol | string | Currency symbol. READ-ONLY |


## Retrieve currency data[​](/docs/apis/rest-api/v3/data#retrieve-currency-data)


This API lets you retrieve and view a currency data.


```
GET /wp-json/wc/v3/data/currencies/<currency>
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/data/currencies/brl \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'data/currencies/brl' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?phpprint_r($woocommerce->get('data/currencies/brl'));?>
```

```
print(wcapi.get("data/currencies/brl").json())
```

```
woocommerce.get("data/currencies/brl").parsed_response
```

```
{	"code": "BRL",	"name": "Brazilian real",	"symbol": "&#82;&#36;",	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/data/currencies/BRL"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/data/currencies"			}		]	}}
```


#### Currency properties[​](/docs/apis/rest-api/v3/data#currency-properties)


See [list of currencies properties](/docs/apis/rest-api/v3/data#currencies-properties).


## Retrieve current currency[​](/docs/apis/rest-api/v3/data#retrieve-current-currency)


This API lets you retrieve and view store's current currency data.


```
GET /wp-json/wc/v3/data/currencies/current
```


- cURL
- JavaScript
- PHP
- Python
- Ruby
- JSON Response

```
curl https://example.com/wp-json/wc/v3/data/currencies/current \	-u consumer_key:consumer_secret
```

```
WooCommerce.get( 'data/currencies/current' )	.then( ( response ) => {		console.log( response.data );	} )	.catch( ( error ) => {		console.log( error.response.data );	} );
```

```
<?phpprint_r($woocommerce->get('data/currencies/current'));?>
```

```
print(wcapi.get("data/currencies/current").json())
```

```
woocommerce.get("data/currencies/current").parsed_response
```

```
{	"code": "USD",	"name": "United States (US) dollar",	"symbol": "&#36;",	"_links": {		"self": [			{				"href": "https://example.com/wp-json/wc/v3/data/currencies/USD"			}		],		"collection": [			{				"href": "https://example.com/wp-json/wc/v3/data/currencies"			}		]	}}
```


#### Currency properties[​](/docs/apis/rest-api/v3/data#currency-properties-1)


See [list of currencies properties](/docs/apis/rest-api/v3/data#currencies-properties).