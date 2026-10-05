import gracefulFs from 'graceful-fs';

import { setFs } from './registry';

/**
 * Register graceful-fs as the active file system implementation with EMFILE retry enabled.
 *
 * Importing this module performs side-effect registration before subsequent imports resolve.
 */
setFs(gracefulFs, { retryOpen: true });
