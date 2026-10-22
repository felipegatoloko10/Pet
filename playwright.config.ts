import {defineConfig,devices} from '@playwright/test';
export default defineConfig({testDir:'tests/browser',fullyParallel:false,use:{baseURL:process.env.PINGO_TEST_URL??'http://127.0.0.1:3210',...devices['Desktop Chrome']},reporter:'list'});
