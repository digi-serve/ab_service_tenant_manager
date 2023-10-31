//
// tenant_manager
// (AppBuilder) A service to manage the site&#39;s tenants
//
const AB = require("@digiserve/ab-utils");
const { version } = require("./package");
// Use sentry by default, but can override with env.TELEMETRY_PROVIDER
if (AB.defaults.env("TELEMETRY_PROVIDER", "sentry") == "sentry") {
   AB.telemetry.init("sentry", {
      dsn: AB.defaults.env(
         "SENTRY_DSN",
         "https://15ee3824f0aa346f9d2678d5491d2943@o144358.ingest.sentry.io/4506143898206208"
      ),
      release: version,
   });
}

var controller = AB.controller("tenant_manager");
// controller.afterStartup((cb)=>{ return cb(/* err */) });
// controller.beforeShutdown((cb)=>{ return cb(/* err */) });
controller.init();
