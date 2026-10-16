const rejectForeignCancel = require('./reject-foreign-cancel');

if (process.env.CANC_FIXTURE_SKIP_REGISTER !== '1') {
  require(process.env.CANC_FIXTURE_REGISTER_ENTRY);
}
rejectForeignCancel();
