const { CancelError } = require('@cancjs/promise');

// foreign thenable: the core only mutes its own promises, so only register() can save the process
module.exports = function rejectForeignCancel() {
  const foreignThenable = {
    then(_resolve, reject) {
      reject(new CancelError());
    },
  };
  return Promise.resolve(foreignThenable);
};
