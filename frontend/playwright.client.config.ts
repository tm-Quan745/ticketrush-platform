import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests',testMatch:'client-redesign.browser.spec.ts',workers:1,timeout:60000,
 use:{baseURL:'http://127.0.0.1:3194',viewport:{width:1440,height:1000}},
 webServer:{command:'npm run start',url:'http://127.0.0.1:3194',env:{PORT:'3194',HOST:'127.0.0.1',NODE_ENV:'production'},reuseExistingServer:false},
});
