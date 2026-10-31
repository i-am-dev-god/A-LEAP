import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Config } from '@remotion/cli/config';

/**
 * Chromium: use the locally provisioned build (scripts/browser.mjs) instead of
 * Remotion's CDN, and expose the bundled NSS libraries to it.
 */
const browserFile = path.join(process.cwd(), '.cache', 'chromium', 'browser.json');
if (existsSync(browserFile)) {
  const { executable, libDir } = JSON.parse(readFileSync(browserFile, 'utf8')) as {
    executable: string;
    libDir: string;
  };
  Config.setBrowserExecutable(executable);
  process.env.LD_LIBRARY_PATH = [libDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
}

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setCodec('h264');
Config.setCrf(18);
Config.setPixelFormat('yuv420p');
Config.setConcurrency(2);
Config.setChromiumOpenGlRenderer('swangle');
Config.setOverwriteOutput(true);
