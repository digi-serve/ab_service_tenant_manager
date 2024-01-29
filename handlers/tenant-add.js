/**
 * tenant-add
 * our Request handler.
 */
const AB = require("@digiserve/ab-utils");
const async = require("async");
const fs = require("fs").promises;
const path = require("path");
const sqlCreateTenant = require("../queries/createTenant.js");
const sqlFindTenantByKey = require("../queries/findTenantByKey.js");

module.exports = {
   /**
    * Key: the cote message key we respond to.
    */
   key: "tenant_manager.tenant-add",

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
    *    "required" : {bool},
    *    "optional" : {bool},
    *
    *    // custom:
    *        "validation" : {fn} a function(value, {allValues hash}) that
    *                       returns { error:{null || {new Error("Error Message")} }, value: {normalize(value)}}
    * }
    */
   inputValidation: {
      key: { string: true, required: true },
      title: { string: true, required: true },
      authType: { string: true, required: true },
      username: { string: true, required: true },
      password: { string: true, required: true },
      email: { string: { email: true }, required: true },
      url: { string: true, required: true },
   },

   /**
    * fn
    * our Request handler.
    * @param {obj} req
    *        the request object sent by the
    *        api_sails/api/controllers/tenant_manager/tenant-add.
    * @param {fn} cb
    *        a node style callback(err, results) to send data when job is finished
    */
   fn: async function handler(req, cb) {
      //
      req.log("tenant_manager.tenant-add()");
      var AdminData = {};
      var fileName = "";

      try {
         //
         // 1) Verify Key is Unique
         //
         let list = await sqlFindTenantByKey(req, req.param("key"));
         if (list.length > 0) {
            var errorNotUnique = new Error("Key is not unique");
            cb(errorNotUnique);
            return;
         }

         //
         // 2) Create a new Entry in the site_tenant table
         //
         req.log("Creating Tenant");
         var data = {
            key: req.param("key"),
            title: req.param("title"),
            authType: req.param("authType"),
            url: req.param("url"),
         };
         await sqlCreateTenant(req, data);

         let listNewTenant = await sqlFindTenantByKey(req, data.key);
         var newTenant = listNewTenant[0] || listNewTenant;
         AdminData["##key##"] = newTenant.uuid;

         //
         // 3) compile our new Admin Data:
         //
         req.log("generating new tenant password");
         AdminData["##admin-uuid##"] = AB.uuid();
         AdminData["##admin-username##"] = req.param("username");
         AdminData["##admin-email##"] = req.param("email");
         AdminData["##admin-url##"] = req.param("url");

         // Now find the password/salt
         await new Promise((done, error) => {
            req.serviceRequest(
               "user_manager.new-user-password",
               {
                  password: req.param("password"),
               },
               (err, results) => {
                  if (err) {
                     return error(err);
                  }
                  Object.keys(results).forEach((k) => {
                     AdminData[`##admin-${k}##`] = results[k];
                  });
                  done();
               }
            );
         });

         //
         // 4) Prepare the SQL for the new Tenant Create a new DB for the new tenant
         // copy our utils/new_tenant.sql  to {tenant}.sql with details replaced
         //
         req.log("generating new tenant SQL");
         let contentsTemplate = await fs.readFile(
            path.join(__dirname, "..", "utils", "new_tenant.sql"),
            "utf8"
         );
         // contents is a template that we must now fill out with our data
         Object.keys(AdminData).forEach((k) => {
            contentsTemplate = contentsTemplate.replaceAll(k, AdminData[k]);
         });

         fileName = `new-${req.param("key")}.sql`;
         await fs.writeFile(fileName, contentsTemplate);

         //
         // 5) Create a new DB for the new tenant
         // copy our utils/new_tenant.sql  to {tenant}.sql with details replaced
         //
         req.log("Importing new tenant SQL");

         let contents = await fs.readFile(fileName, "utf8");

         // Reformat the C-style comments from mysqlDump
         // contents = contents.replaceAll(/\/\*!\d*/g, "").replaceAll(/\*\//g, "");
         // Remove the C-Style comments from mysqldump
         contents = contents.replaceAll(/\/\*!\d*.*\*\/;*/g, "");

         // Remove the # comments
         contents = contents.replaceAll(/[^"]#.*/g, "");

         // temp confuse the &nbsp; -> &nbsp###
         // the ";" will interrupt our next step of breaking things into
         // our base sql commands;
         contents = contents.replaceAll("&nbsp;", "&nbsp###");

         // break into commands:
         var commands = contents.split(";");

         await new Promise((done, error) => {
            sqlCommands(commands, req, (err) => {
               if (err) return error(err);
               done();
            });
         });

         cb(null, { status: "success" });

         req.serviceRequest(
            "api_sails.site-cache-stale",
            {
               tenantID: "all",
            },
            () => {}
         );
      } catch (e) {
         req.notify.developer(e, {
            context: "TenantManager:tenant-add:error adding tenant",
         });
         cb(e);
      }

      //       async.series(
      //          [
      //             // Verify Key is Unique
      //             (done) => {
      //                sqlFindTenantByKey(req, req.param("key")).then((list) => {
      //                   if (list.length > 0) {
      //                      var errorNotUnique = new Error("Key is not unique");
      //                      done(errorNotUnique);
      //                      return;
      //                   }
      //                   done();
      //                });
      //             },
      //             // Create a new Entry in the site_tenant table
      //             (done) => {
      //                req.log("Creating Tenant");
      //                var data = {
      //                   key: req.param("key"),
      //                   title: req.param("title"),
      //                   authType: req.param("authType"),
      //                   url: req.param("url"),
      //                };
      //                sqlCreateTenant(req, data)
      //                   .then((/* sqlResults */) => {
      //                      sqlFindTenantByKey(req, data.key)
      //                         .then((list) => {
      //                            var newTenant = list[0] || list;
      //                            AdminData["##key##"] = newTenant.uuid;
      //                            done();
      //                         })
      //                         .catch(done);
      //                   })
      //                   .catch(done);
      //             },

      //             // compile our new Admin Data:
      //             (done) => {
      //                req.log("generating new tenant password");
      //                AdminData["##admin-uuid##"] = AB.uuid();
      //                AdminData["##admin-username##"] = req.param("username");
      //                AdminData["##admin-email##"] = req.param("email");
      //                AdminData["##admin-url##"] = req.param("url");

      //                // Now find the password/salt
      //                req.serviceRequest(
      //                   "user_manager.new-user-password",
      //                   {
      //                      password: req.param("password"),
      //                   },
      //                   (err, results) => {
      //                      if (err) {
      //                         return done(err);
      //                      }
      //                      Object.keys(results).forEach((k) => {
      //                         AdminData[`##admin-${k}##`] = results[k];
      //                      });
      //                      done();
      //                   }
      //                );
      //             },

      //             // Create a new DB for the new tenant
      //             // copy our utils/new_tenant.sql  to {tenant}.sql with details replaced
      //             (done) => {
      //                req.log("generating new tenant SQL");
      //                fs.readFile(
      //                   path.join(__dirname, "..", "utils", "new_tenant.sql"),
      //                   "utf8",
      //                   (err, contents) => {
      //                      if (err) {
      //                         return done(err);
      //                      }

      //                      // contents is a template that we must now fill out with our data
      //                      Object.keys(AdminData).forEach((k) => {
      //                         contents = contents.replaceAll(k, AdminData[k]);
      //                      });

      //                      fileName = `new-${req.param("key")}.sql`;
      //                      fs.writeFile(fileName, contents, (err) => {
      //                         if (err) {
      //                            return done(err);
      //                         }
      //                         done();
      //                      });
      //                   }
      //                );
      //             },

      //             //// This works, but is SLOW:
      //             // mysql import the {tenant}.sql
      //             /*            (done) => {
      //                req.log("Importing new tenant SQL");

      //                var dbConfig = req.configDB();
      //                var config = {
      //                   host: dbConfig.host,
      //                   user: dbConfig.user,
      //                   password: dbConfig.password,
      //                };
      //                var importer = new Importer(config);
      //                importer.onProgress((progress) => {
      //                   var percent =
      //                      Math.floor(
      //                         (progress.bytes_processed / progress.total_bytes) *
      //                            10000
      //                      ) / 100;
      //                   req.log(`${percent}% Completed`);
      //                });

      //                importer
      //                   .import(fileName)
      //                   .then(() => {
      //                      req.log("Tables Created");
      //                      done();
      //                   })
      //                   .catch((err) => {
      //                      done(err);
      //                   });
      //             },

      // */

      //             // Let's try to manually prepare the data and send it our own way:
      //             //

      //             // mysql import the {tenant}.sql
      //             (done) => {
      //                req.log("Importing new tenant SQL");

      //                fs.readFile(fileName, "utf8", (err, contents) => {
      //                   if (err) {
      //                      return done(err);
      //                   }

      //                   // Reformat the C-style comments from mysqlDump
      //                   // contents = contents.replaceAll(/\/\*!\d*/g, "").replaceAll(/\*\//g, "");
      //                   // Remove the C-Style comments from mysqldump
      //                   contents = contents.replaceAll(/\/\*!\d*.*\*\/;*/g, "");

      //                   // Remove the # comments
      //                   contents = contents.replaceAll(/[^"]#.*/g, "");

      //                   // temp confuse the &nbsp; -> &nbsp###
      //                   // the ";" will interrupt our next step of breaking things into
      //                   // our base sql commands;
      //                   contents = contents.replaceAll("&nbsp;", "&nbsp###");

      //                   // break into commands:
      //                   var commands = contents.split(";");

      //                   sqlCommands(commands, req, (err) => {
      //                      done(err);
      //                   });
      //                });
      //             },
      //          ],
      //          (err) => {
      //             req.log("Done, preparing response");
      //             if (err) {
      //                console.error(err);
      //                return cb(err);
      //             }
      //             cb(null, { status: "success" });
      //          }
      //       );
   },
};

/**
 * @function sqlCommands()
 * Run the SQL commands we found in our import file.
 * @param {string} commands
 * @param {reqService} req
 * @param {fn} cb(err)
 */
function sqlCommands(commands, req, cb) {
   if (commands.length == 0) {
      req.log("import commands complete.");
      req.queryIsolateClose();
      cb();
   } else {
      req.log("running import command: ", commands.length);
      var next = commands.shift();
      next = next.replaceAll("&nbsp###", "&nbsp;");
      next = next.replaceAll(/^[\n]*/g, "");
      if (next.length == 0) {
         // this was a final "\n\n" found after the last command
         // so go on...
         return sqlCommands(commands, req, cb);
      }

      // if NOT an INSERT just run it:
      if (next.indexOf("INSERT INTO") == -1) {
         req.log(next);
         req.queryIsolate(next, null, (err) => {
            if (err) {
               return cb(err);
            }

            sqlCommands(commands, req, cb);
         });
      } else {
         // we do additional processing on INSERT statements.
         sqlInsert(next, req, (err) => {
            if (err) {
               return cb(err);
            }
            sqlCommands(commands, req, cb);
         });
      }
   }
}

/**
 * @function sqlInsert()
 * Perform the SQL INSERT command. We will pull out the base command,
 * and then perform an insert for each row of values found in the command.
 * @param {string} comamndIn
 *        The string blob of the full INSERT command.
 * @param {reqService} req
 * @param {fn} cb(err)
 */
function sqlInsert(commandIn, req, cb) {
   req.log("processing INSERT:");

   var lines = commandIn.split("VALUES\n");
   var command = `${lines[0]} VALUES ( ?`;

   var numValues = command.split(",");
   numValues.shift(); // we've already added the first '?'
   numValues.forEach((/* v */) => {
      command = command + ", ?";
   });
   command += " );";

   req.log(command);
   var allValues = sqlProcessValues(lines[1] + ";");

   sqlInsertOne(command, allValues, req, (err) => {
      if (err) {
         return cb(err);
      }
      cb();
   });
}

/**
 * @function sqlInsertOne()
 * Perform a single insert command.
 * @param {strin} command
 *        The base "INSERT INTO xxx ( a, b,c,) VALUES ( ?, ?, ? )"
 * @param {array} allValues
 *        An array of "Rows" that need to be inserted.
 *        Each "Row" is an array of the values to insert.
 * @param {reqSerivce} req
 * @param {fn} cb(err)
 *        node style callback(err)
 */
function sqlInsertOne(command, allValues, req, cb) {
   if (allValues.length == 0) {
      cb();
   } else {
      req.log("... inserting ", allValues.length);
      var values = allValues.shift();
      req.queryIsolate(command, values, (err) => {
         if (err) {
            return cb(err);
         }
         sqlInsertOne(command, allValues, req, cb);
      });
   }
}

/**
 * @function sqlProcessValues()
 * pull an Array of values from the given data string.
 * @param {string} data
 *        The "VALUES" portion of the SQL INSERT command found in the
 *        mysqldump value.
 * @return {array}
 *        An array of arrays.  [  row1[ val1, val2], row2[ v1, v2], ...]
 */
function sqlProcessValues(data) {
   var arryData = data.split(""); // to an array;
   var isRowStarted = false;
   var stringStarted = false;
   var isEscaped = false;
   var isFNOpen = false;

   var allRows = [];

   var currRow = [];
   var currValue = "";

   while (arryData.length > 0) {
      var char = arryData.shift();

      switch (char) {
         // starts/ends string values
         case "'":
            if (stringStarted) {
               if (isEscaped) {
                  // internal string \'
                  currValue += char;
                  isEscaped = false;
               } else {
                  // ending string marker
                  stringStarted = false;
               }
            } else {
               // start of a value
               stringStarted = true;
            }
            break;

         // marks when a character is escaped: \t
         case "\\":
            if (stringStarted) {
               if (isEscaped) {
                  currValue += char;
                  isEscaped = false;
               } else {
                  isEscaped = true;
               }
            }
            break;

         // marks the separation between Values
         case ",":
            if (isRowStarted) {
               if (stringStarted) {
                  currValue += char;
               } else {
                  // Ending of current Value

                  // if this was a number:
                  if (!isNaN(parseInt(currValue))) {
                     // make sure we didn't convert a partial num:
                     // "039b2d1b" -> "39"
                     var oldVal = currValue;
                     currValue = parseInt(currValue);
                     if (oldVal.length != `${currValue}`.length) {
                        // oops
                        currValue = oldVal;
                     }
                  }

                  // if this was NULL:
                  if (currValue === "NULL") {
                     currValue = null;
                  }

                  if (currValue === "now()") {
                     var parts = new Date().toISOString().split("T");
                     currValue = `${parts[0]} ${parts[1].substring(0, 8)}`;
                  }

                  currRow.push(currValue);
                  currValue = "";
               }
            }
            break;

         case "(":
            if (stringStarted) {
               currValue += char;
            } else {
               if (isRowStarted) {
                  isFNOpen = true;
                  currValue += char;
               } else {
                  isRowStarted = true;
               }
            }
            break;

         case ")":
            if (stringStarted || isFNOpen) {
               currValue += char;
               isFNOpen = false;
            } else {
               isRowStarted = false;
               currRow.push(currValue);
               allRows.push(currRow);
               currValue = "";
               currRow = [];
            }
            break;

         default:
            if (isRowStarted) {
               if (!isEscaped) {
                  currValue += char;
               } else {
                  currValue += toEscaped(char);
                  isEscaped = false;
               }
            }
            break;
      }
   }

   return allRows;
}

function toEscaped(char) {
   var escapedChar = char;
   switch (char) {
      case "t":
         escapedChar = "\t";
         break;
      case "n":
         escapedChar = "\n";
         break;
      case "r":
         escapedChar = "\r";
         break;
      case '"':
         escapedChar = '"';
         break;
   }
   return escapedChar;
}
