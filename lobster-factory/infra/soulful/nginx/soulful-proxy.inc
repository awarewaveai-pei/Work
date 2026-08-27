# Shared proxy directives for the soulfulexpression.org vhost.
# Kept in one file so the four location blocks cannot drift apart — a header set in
# three places out of four is exactly the kind of difference nobody notices until a
# specific page behaves oddly.

proxy_pass $upstream;
proxy_http_version 1.1;

proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;

# X-Forwarded-Proto is load-bearing, not decoration. wp-config.php on this host maps it
# to $_SERVER['HTTPS'], and WordPress uses that to decide whether the request already
# matches its stored siteurl (https://soulfulexpression.org). Omit it and WordPress
# sees plain HTTP, concludes the URL is wrong, and 301-redirects to itself — an
# infinite loop that presents to the visitor as ERR_TOO_MANY_REDIRECTS.
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host  $host;

proxy_buffering on;
proxy_buffer_size 16k;
proxy_buffers 8 16k;
