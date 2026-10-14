// Runs before Postiz's own start (docker-compose.yml `command`). The backend registers its Temporal search attributes
// once at start and swallows a failure, after which it never listens. After a host reboot Docker starts every
// container at once and ignores depends_on, so the order is held here: wait until the namespace answers.
// Gives up after 10 minutes (exit 1 -> the container restarts and tries again).
const { Connection } = require(require.resolve("@temporalio/client", { paths: ["/app"] }));

const address = process.env.TEMPORAL_ADDRESS || "temporal:7233";
const namespace = process.env.TEMPORAL_NAMESPACE || "default";
const deadline = Date.now() + 10 * 60 * 1000;

(async () => {
  for (;;) {
    try {
      const connection = await Connection.connect({ address, connectTimeout: 5000 });
      await connection.workflowService.describeNamespace({ namespace });
      await connection.close();
      return;
    } catch (e) {
      if (Date.now() > deadline) {
        console.error(`wait-for-temporal: ${address} namespace ${namespace} not ready after 10 min: ${e.message}`);
        process.exit(1);
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
})();
