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
   config.inHere = true;

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

   return;
   // we need to combine several config sources:
   // tenant: tenantManager.config (id:uuid)
   // user: userManager.config(id:uuid)
   // labels: appbuilder.labels("en")

   /* 
    * These are User specific 
    *
   var configInbox = null;
   // {array} [ {ABDefinition}, {ABDefinition}, ...]
   // The list of ABxxxx definitions to send to the Web client to create
   // the applications to display.

   var configInboxMeta = null;
   // {array} [ { appData}, ...]
   // Inbox items need a minimum set of Application / Process data to
   // display correctly.  It is possible a User might have an Inbox Item
   // related to an Application they do not have Rights to access, so we
   // need to send this data along with the configuration data.

   var configUser = null;
   // {obj} configUser
   // The User information for the CURRENT User that is making this request.


   */

   var configLabels = null;
   // {obj} { key: text }
   // The labels used by the web platform to display.  They will be in the
   // language of the user that is running this request.

   var configLanguages = null;
   // {obj} { key: text }
   // The languages defined in the current tenant for the site.

   var configSite = {
      relay: sails.config.relay?.enable ?? false,
   };
   // {obj} configSite
   // The information details for this site, used by the WEB platform to
   // process it's operation:
   //    .tenants: {array} of different Tenant options

   var configTenant = null;
   // {obj}
   // The configuration information for the CURRENT Tenant this request is
   // associated with.
   //    .id : {uuid}
   //    .options: {obj} Configuration Details for the current Tenant's
   //              operation.
   //    .options.authType: {string}
   //    .options.networkType: {string} the type of Network access to the server
   //    .title: {string}
   //    .clickTextToEnter: {string}

   var configMeta = {};
   // {obj} configMeta
   // The Web platform also requires additional info about Roles/Scopes/Users
   // to function.
   // configMeta.roles : {array} of all SiteRoles
   // configMeta.scopes: {array} of all Scopes
   // configMeta.users : {array} of all users (just { username } )

   async.parallel(
      [
         // (done) => {
         //    // if a user isn't set, then just leave user:null
         //    if (!req.ab.user) {
         //       done();
         //       return;
         //    }
         //    // simplify the user data:
         //    let userSimple = {};
         //    Object.keys(req.ab.user).forEach((k) => {
         //       if (k.indexOf("__relation") > -1) return;
         //       if (k.indexOf("AB") == 0) return;
         //       if (k.indexOf("SITE") == 0) return;
         //       userSimple[k] = req.ab.user[k];
         //    });
         //    var jobData = {
         //       user: userSimple,
         //    };
         //    // pass the request off to the uService:
         //    req.ab.serviceRequest(
         //       "user_manager.config",
         //       jobData,
         //       (err, results) => {
         //          configUser = results;
         //          done(err);
         //       }
         //    );
         // },
      ],
      (err) => {
         if (err) {
            console.log(err);
            res.ab.error(err, 500);
            return;
         }

         Promise.resolve()
            .then(() => {
               // if a user isn't set, then just leave user:null
               if (!req.ab.user) {
                  return;
               }

               return new Promise((resolve, reject) => {
                  req.ab.log("configUser:", configUser);

                  async.parallel(
                     [
                        // Pull the Inbox Items for this User
                        (done) => {
                           var jobData = {
                              users: [configUser.username],
                              roles: configUser.roles,
                           };
                           // pass the request off to the uService:
                           req.ab.serviceRequest(
                              "process_manager.inbox.find",
                              jobData,
                              (err, results) => {
                                 if (err) {
                                    req.ab.log("error inbox.find:", err);
                                    done(err);
                                    return;
                                 }
                                 configInbox = results;
                                 // done();
                                 // now ask for the inbox Meta data
                                 var ids = results
                                    .map((r) => r.definition)
                                    .filter((r) => r);
                                 req.ab.serviceRequest(
                                    "process_manager.inbox.meta",
                                    { ids },
                                    (err, meta) => {
                                       if (err) {
                                          req.ab.log("error inbox.meta:", err);
                                          done(err);
                                          return;
                                       }
                                       configInboxMeta = meta;
                                       done();
                                    }
                                 );
                              }
                           );
                        },

                        // Pull the Config-Meta data
                        (done) => {
                           req.ab.serviceRequest(
                              "user_manager.config-meta",
                              {},
                              (err, results) => {
                                 if (err) {
                                    req.ab.log("error:", err);
                                    return;
                                 }
                                 configMeta = results;
                                 done();
                              }
                           );
                        },
                     ],
                     (err) => {
                        if (err) {
                           reject(err);
                           return;
                        }
                        resolve();
                     }
                  );
               });
            })
            .then(() => {
               // Hotfix 11/30/22 These settings used to be added to our
               // index.html but now we send that statically.
               const settings = {};
               settings["appbuilder-tenant"] = req.options.useTenantID //tenantID was set due to our route: get /admin
                  ? sails.config.tenant_manager.siteTenantID
                  : req.ab.tenantSet() //Tenant set from policies
                  ? req.ab.tenantID
                  : "";
               // defaultView specifies which portal_* view to default to.
               // normally it should show up in the work view
               settings["appbuilder-view"] = "work";
               if (!req.ab.user) {
                  // unless we are not logged in. then we show the login form:
                  settings["appbuilder-view"] = "auth_login_form";
               }
               if (req.session?.defaultView) {
                  let sessionView = req.session.defaultView;
                  if (/appbuilder-view="(.+)"/.test(sessionView)) {
                     sessionView = sessionView.match(
                        /appbuilder-view="(.+)"/
                     )[1];
                  }

                  settings["appbuilder-view"] = sessionView;
                  req.ab.log(">>> PULLING Default View from Session");
               }

               res.ab.success({
                  inbox: configInbox,
                  inboxMeta: configInboxMeta,
                  labels: configLabels,
                  languages: configLanguages,
                  site: configSite,
                  tenant: configTenant,
                  user: configUser,
                  userReal: req.ab.isSwitcherood() ? req.ab.userReal : 0,
                  meta: configMeta,
                  settings,
               });
            })
            .catch((err) => {
               // How did we get here?
               req.ab.log(err);
               res.ab.error(err);
               req.ab.notify.developer(err, {
                  context: "Error gathering Configuration information",
               });
            });
      }
   );
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
