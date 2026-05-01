<?php
/**
 * Plugin Name: PostHog Analytics (MU)
 * Description: Auto-loaded PostHog browser analytics for public WordPress pages.
 */

$posthog_key = getenv('NEXT_PUBLIC_POSTHOG_KEY') ?: getenv('POSTHOG_API_KEY');
if (!$posthog_key || is_admin() || wp_doing_ajax() || wp_doing_cron()) {
    return;
}

$posthog_host = getenv('NEXT_PUBLIC_POSTHOG_HOST') ?: getenv('POSTHOG_HOST') ?: 'https://us.i.posthog.com';

add_action('wp_head', function () use ($posthog_key, $posthog_host) {
    $site_host = wp_parse_url(home_url(), PHP_URL_HOST);
    $site_names = [
        'aware-wave.com' => 'Aware Wave Website',
        'www.aware-wave.com' => 'Aware Wave Website',
        'soulfulexpression.org' => 'Soulful Expression',
        'www.soulfulexpression.org' => 'Soulful Expression',
    ];
    $site_name = $site_names[$site_host] ?? $site_host;
    ?>
    <script>
      !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags reloadFeatureFlags group".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
      posthog.init(<?php echo wp_json_encode($posthog_key); ?>, {
        api_host: <?php echo wp_json_encode($posthog_host); ?>,
        autocapture: true,
        capture_pageview: true,
        capture_pageleave: true,
        capture_exceptions: true,
        persistence: "localStorage+cookie",
        loaded: function (posthog) {
          posthog.register({
            site_name: <?php echo wp_json_encode($site_name); ?>,
            site_domain: <?php echo wp_json_encode($site_host); ?>,
            app_surface: "wordpress-public"
          });
        }
      });
    </script>
    <?php
}, 20);
