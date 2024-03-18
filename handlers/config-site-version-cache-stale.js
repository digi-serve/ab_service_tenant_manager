/**
 * config-site-version-cache-stale
 * return the bootstrap version information needed for the given tenant.
 */

let { ConfigVersionCache } = require("../utils/cache");

module.exports = {
   /**
    * Key: the cote message key we respond to.
    */
   key: "tenant_manager.site-version-cache-stale",

   inputValidation: {},

   /**
    * fn
    * our Request handler.
    * @param {obj} req
    *        the request object sent by the api_sails/api/controllers/tenant_manager/config.
    * @param {fn} cb
    *        a node style callback(err, results) to send data when job is finished
    */
   fn: async function handler(req, cb) {
      req.log("tenant_manager.site-version-cache-stale");
      try {
         const tenantID = req.param("tenantID") ?? req.tenantID();
         if (tenantID === "all") {
            ConfigVersionCache = {};
         } else {
            delete ConfigVersionCache[tenantID];
         }
         cb();
      } catch (err) {
         cb(err);
      }
   },
};
