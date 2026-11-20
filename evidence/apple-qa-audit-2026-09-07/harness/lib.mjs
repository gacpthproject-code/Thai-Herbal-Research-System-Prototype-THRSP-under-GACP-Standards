import { createRequire } from 'node:module';
const require = createRequire('/home/ubuntu/work/GACP-Certification-Application/apps/web-app/');
export const { chromium, devices } = require('@playwright/test');
