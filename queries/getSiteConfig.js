/**
 * @param {string} key config key to look up
 * @param {ABServicRequest} req
 * @returns {Promise<string>}
 */
function getSiteConfigValue(req, key) {
   return new Promise((resolve, reject) => {
      let tenantDB = "`appbuilder-admin`";
      // {string} tenantDB
      // the DB name of the administrative tenant that manages the other
      // tenants.
      // By default it is `appbuilder-admin` but this value can be over
      // ridden in the  req.connections().site.database  setting.

      let conn = req.connections();
      if (conn.site && conn.site.database)
         tenantDB = `\`${conn.site.database}\``;
      tenantDB += ".";

      let sql = `SELECT value FROM ${tenantDB}\`SITE_CONFIG\` where \`key\` = ?`;

      req.query(sql, [key], (error, results) => {
         if (error) {
            req.log(sql);
            reject(error);
         } else if (results.length === 1) {
            resolve(results[0].value);
         } else {
            reject(
               new Error(`Could not find site config entry for key '${key}'`)
            );
         }
      });
   });
}
module.exports = getSiteConfigValue;
