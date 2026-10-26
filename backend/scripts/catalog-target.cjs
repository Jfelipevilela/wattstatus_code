// Explicit administrative target. Credentials are read from the ignored environment only.
function catalogTarget(flags, environment = process.env) {
  const apply = flags.has('--apply'), local = flags.has('--local'), configured = flags.has('--configured');
  if ((local && configured) || (apply && (flags.has('--dry-run') || (!local && !configured)))) throw new Error('TARGET_FLAGS_INVALID');
  if (local) return { uri: 'mongodb://127.0.0.1:27017', database: 'wattstatus_catalog_dev', apply };
  if (!configured) return null;
  const uri = environment.MONGO_URL, database = environment.MONGO_DB_NAME;
  if (!uri || !/^mongodb(?:\+srv)?:\/\//.test(uri) || /\s/.test(uri) || !database || !/^[A-Za-z0-9_-]{1,63}$/.test(database))
    throw new Error('CONFIGURED_TARGET_REQUIRED');
  return { uri, database, apply };
}
module.exports = { catalogTarget };
