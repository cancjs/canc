// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- ambient type definition for optional peer graceful-fs
/// <reference path="./graceful-fs.d.ts" />

import gracefulFs from 'graceful-fs';

import { setFs } from './registry';

/**
 * Register graceful-fs as the active file system implementation with EMFILE retry enabled.
 *
 * Importing this module performs side-effect registration before subsequent imports resolve.
 */
setFs(gracefulFs, { retryOpen: true });
