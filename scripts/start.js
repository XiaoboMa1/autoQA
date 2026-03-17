/**
 * Start script wrapper
 * This file exists for backward compatibility
 * The actual implementation is in start.cjs
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Import and run the CJS version
const startCjs = join(__dirname, 'start.cjs');
require(startCjs);
