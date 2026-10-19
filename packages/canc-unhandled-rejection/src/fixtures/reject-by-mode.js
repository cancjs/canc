const { register } = require('@cancjs/unhandled-rejection');
const rejectForeignCancel = require('./reject-foreign-cancel');

register();
if (process.env.CANC_FIXTURE_REASON === 'cancel') {
  rejectForeignCancel();
} else {
  Promise.reject(new Error('real failure'));
}
