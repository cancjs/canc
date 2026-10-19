const { register } = require('@cancjs/unhandled-rejection');

register();
// added after register(), like an error SDK initialised later
process.on('unhandledRejection', (reason) => {
  process.stdout.write('LATE:' + reason.message);
});
Promise.reject(new Error('real failure'));
