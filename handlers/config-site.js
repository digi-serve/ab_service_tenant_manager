/**
 * config-site
 * return the bootstrap information needed for the given tenant.
 */

const TMConfig = require("./config.js");
const TMList = require("./list.js");

module.exports = {
   /**
    * Key: the cote message key we respond to.
    */
   key: "tenant_manager.config-site",

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
   inputValidation: {
      relay: { boolean: true, required: true },
   },

   /**
    * fn
    * our Request handler.
    * @param {obj} req
    *        the request object sent by the api_sails/api/controllers/tenant_manager/config.
    * @param {fn} cb
    *        a node style callback(err, results) to send data when job is finished
    */
   fn: async function handler(req, cb) {
      req.log("tenant_manager.config-site()");

      var relay = req.param("relay");

      let config = { site: { relay } };

      try {
         await BuildConfig(req, config);
         cb(null, config);
      } catch (e) {
         cb(e);
      }
   },
};

/**
 * @function BuildConfig()
 * Perform the actual collecting and generating the config information
 * for the specified Tenant + Language Combo.
 * The incoming config {} will be updated with the config information.
 * @param {request} req
 * @param {obj} config
 *        The resulting object all our config information will web merged into.
 * @return {Promise}
 */
async function BuildConfig(req, config) {
   var allRequests = [];
   allRequests.push(RequestConfigTenant(req, config));
   allRequests.push(RequestConfigTenantList(req, config));
   allRequests.push(RequestLabels(req, config));
   allRequests.push(RequestLanguages(req, config));
   allRequests.push(RequestConfigMeta(req, config));
   await Promise.all(allRequests);

   // @TODO: figure out if we, in practice need, to update these:
   config.settings = {
      "appbuilder-tenant": config.tenant.id,
      "appbuilder-view": "work",
   };
}

function RequestConfigTenant(req, config) {
   return new Promise((resolve, reject) => {
      // pretend we had a uuid in our incoming data:
      // that way TMConfig can find it.
      req.data = req.data || {};
      req.data.uuid = req.tenantID();

      // pass the request off to the uService:
      TMConfig.fn(req, (err, results) => {
         if (err) return reject(err);
         config.tenant = results;
         resolve();
      });
   });
}

function RequestConfigTenantList(req, config) {
   return new Promise((resolve, reject) => {
      // pass the request off to the uService:
      TMList.fn(req, (err, results) => {
         if (err) return reject(err);
         config.site = config.site || {};
         config.site.tenants = results;
         resolve();
      });
   });
}

function RequestLabels(req, config) {
   return new Promise((resolve, reject) => {
      const langCode = req.user?.languageCode ?? "en";

      const jobData = {
         languageCode: langCode,
      };

      // pass the request off to the uService:
      req.serviceRequest("appbuilder.labels", jobData, (err, results) => {
         if (err) return reject(err);
         config.labels = results;
         resolve();
      });
   });
}

function RequestLanguages(req, config) {
   return new Promise((resolve, reject) => {
      // pass the request off to the uService:
      req.serviceRequest("appbuilder.languages", {}, (err, results) => {
         if (err) return reject(err);
         config.languages = results;
         resolve();
      });
   });
}

function RequestConfigMeta(req, config) {
   return new Promise((resolve, reject) => {
      // pass the request off to the uService:
      req.serviceRequest("user_manager.config-meta", {}, (err, results) => {
         if (err) return reject(err);
         config.meta = results;
         resolve();
      });
   });
}
