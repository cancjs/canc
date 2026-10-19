const { register } = require('@cancjs/unhandled-rejection');

register();
process.on('uncaughtException', (error) => {
  process.stdout.write('CAUGHT:' + error.message + '\n');
});
Promise.reject(new Error('first'));
Promise.reject(new Error('second'));
Promise.reject(new Error('third'));
