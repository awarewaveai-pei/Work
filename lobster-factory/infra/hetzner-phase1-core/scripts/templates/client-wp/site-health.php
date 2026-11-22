<?php
// Container healthcheck, second half (docker-compose.yml.tmpl): exit 0 only if this site's database accepts this
// site's credentials. safe-infra-patch.sh compose-new waits for the WordPress service alone, so the database's
// state has to show up in THIS container's health.
mysqli_report(MYSQLI_REPORT_OFF);
$m = mysqli_init();
if (!$m) { exit(1); }
$m->options(MYSQLI_OPT_CONNECT_TIMEOUT, 3);
$ok = @$m->real_connect(getenv('WORDPRESS_DB_HOST'), getenv('WORDPRESS_DB_USER'), getenv('WORDPRESS_DB_PASSWORD'),
  getenv('WORDPRESS_DB_NAME'), 3306);
exit($ok && $m->query('SELECT 1') ? 0 : 1);
