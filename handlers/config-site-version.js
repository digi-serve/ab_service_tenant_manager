/**
 * config-site-version
 * return the bootstrap version information needed for the given tenant.
 */

const { ConfigVersionCache } = require("../utils/cache.js");
const TMConfigSite = require("./config-site.js");

/**
 * @function hashCode()
 * generates a hash of a given string.
 * taken from: https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript
 * @param {string} str
 *        the input string we are generating a hash for.
 * @return {number}
 */
function hashCode(str) {
   return str
      .split("")
      .reduce(
         (prevHash, currVal) =>
            ((prevHash << 5) - prevHash + currVal.charCodeAt(0)) | 0,
         0
      );
}

module.exports = {
   /**
    * Key: the cote message key we respond to.
    */
   key: "tenant_manager.config-site-version",

   /**
    * inputValidation
    * define the expected inputs to this service handler:
    * Format:
    * "parameterName" : {
    *    {joi.fn}   : {bool},  // performs: joi.{fn}();
    *    {joi.fn}   : {
    *       {joi.fn1} : true,   // performs: joi.{fn}().{fn1}();
    *       {joi.fn2} : { options } // performs: joi.{fn}().{fn2}({options})
    *    }
    *    // examples:
    *    "required" : {bool},  // default = false
    *
    *    // custom:
    *        "validation" : {fn} a function(value, {allValues hash}) that
    *                       returns { error:{null || {new Error("Error Message")} }, value: {normalize(value)}}
    * }
    */
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
      req.log("tenant_manager.config-site-version()");
      try {
         let tenantID = req.tenantID();
         let version = ConfigVersionCache[tenantID];
         if (!version) {
            await new Promise((resolve, reject) => {
               TMConfigSite.fn(req, (err, result) => {
                  if (err) return reject(err);
                  if (typeof result != "string") {
                     result = JSON.stringify(result);
                  }
                  version = new String(hashCode(result)).toString();
                  ConfigVersionCache[tenantID] = version;
                  resolve();
               });
            });
         }

         cb(null, version);
      } catch (e) {
         cb(e);
      }
   },
};
