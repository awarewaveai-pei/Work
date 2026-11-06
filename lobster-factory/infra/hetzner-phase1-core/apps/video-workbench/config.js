window.VW_CONFIG = {
  mode: "local",
  apiBaseUrl: "/api/vw",
  timeoutMs: 15000, // http mode: longest silence (no bytes moving) before a request gives up
  gatewayTimeoutMs: 300000, // http mode: how long a sent write may run = nginx proxy_read_timeout (nginx/default.conf video vhost)
};
