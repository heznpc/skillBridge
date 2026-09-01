const fs = require('fs');
const os = require('os');
const path = require('path');

const LEXICAL_SCOPE_ERROR = '--out-dir must be inside repository dist or a skillbridge-* system temporary directory';
const CANONICAL_SCOPE_ERROR =
  '--out-dir resolves outside its allowed build output root; refusing a possible symlink escape';

function isWithin(candidate, base, { allowEqual = false } = {}) {
  const relative = path.relative(base, candidate);
  if (relative === '') return allowEqual;
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function canonicalizeExistingOrProjected(targetPath) {
  const missingSegments = [];
  let current = path.resolve(targetPath);

  while (true) {
    try {
      fs.lstatSync(current);
    } catch (error) {
      if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') {
        throw new Error(CANONICAL_SCOPE_ERROR, { cause: error });
      }

      const parent = path.dirname(current);
      if (parent === current) {
        throw new Error(CANONICAL_SCOPE_ERROR, { cause: error });
      }
      missingSegments.unshift(path.basename(current));
      current = parent;
      continue;
    }

    try {
      const realpath = fs.realpathSync.native || fs.realpathSync;
      return path.resolve(realpath(current), ...missingSegments);
    } catch (error) {
      // lstat succeeded, so this is commonly a dangling symlink. Treat it as
      // unsafe instead of projecting through its lexical parent.
      throw new Error(CANONICAL_SCOPE_ERROR, { cause: error });
    }
  }
}

/**
 * Validate a recursively-cleaned build output against both its lexical path
 * and the real path of its nearest existing ancestor. The second check is
 * essential: `dist/link/output` is lexically inside dist, but `link` may be a
 * symlink to a directory whose contents must never be removed by a build.
 */
function assertSafeBuildOutput(outputPath, { repoRoot, tempRoot = os.tmpdir() }) {
  const output = path.resolve(outputPath);
  const repository = path.resolve(repoRoot);
  const repositoryDist = path.join(repository, 'dist');
  const temporary = path.resolve(tempRoot);

  const isRepositoryOutput = isWithin(output, repositoryDist);
  const tempRelative = path.relative(temporary, output);
  const tempTopLevel = tempRelative.split(path.sep)[0];
  const isTemporaryOutput =
    isWithin(output, temporary) && Boolean(tempTopLevel) && tempTopLevel.startsWith('skillbridge-');

  if (!isRepositoryOutput && !isTemporaryOutput) {
    throw new Error(LEXICAL_SCOPE_ERROR);
  }

  const canonicalOutput = canonicalizeExistingOrProjected(output);
  if (isRepositoryOutput) {
    const canonicalRepository = canonicalizeExistingOrProjected(repository);
    const canonicalDist = path.join(canonicalRepository, 'dist');
    if (!isWithin(canonicalOutput, canonicalDist)) {
      throw new Error(CANONICAL_SCOPE_ERROR);
    }
  } else {
    const canonicalTemporary = canonicalizeExistingOrProjected(temporary);
    const canonicalTempTopLevel = path.join(canonicalTemporary, tempTopLevel);
    if (!isWithin(canonicalOutput, canonicalTempTopLevel, { allowEqual: true })) {
      throw new Error(CANONICAL_SCOPE_ERROR);
    }
  }

  return output;
}

module.exports = {
  assertSafeBuildOutput,
};
