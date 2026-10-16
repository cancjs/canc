const { register } = require('@cancjs/unhandled-rejection');
const rejectForeignCancel = require('./reject-foreign-cancel');

if (process.env.CANC_FIXTURE_SKIP_REGISTER !== '1') {
  register();
}
rejectForeignCancel();
