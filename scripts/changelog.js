// Plain changelog generator producing unlinked markdown entries

'use strict';

const getReleaseLine = async (changeset) => {
  const trimmed = changeset.summary.trim();
  const [firstLine, ...futureLines] = trimmed.split('\n').map((l) => l.trimEnd());
  let returnVal = `- ${firstLine}`;

  if (futureLines.length > 0) {
    returnVal += `\n${futureLines.map((l) => (l ? `  ${l}` : '')).join('\n')}`;
  }

  return returnVal;
};

const getDependencyReleaseLine = async () => '';

const defaultChangelogFunctions = {
  getReleaseLine,
  getDependencyReleaseLine,
};

module.exports = defaultChangelogFunctions;
module.exports.default = defaultChangelogFunctions;
