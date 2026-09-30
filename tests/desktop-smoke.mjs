import { _electron as electron } from 'playwright';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
// Hidden setup screen only. No login, native hooks, screenshots or live API calls.
const env={...process.env,VICTORY_TRACKER_TEST:'1',VICTORY_TRACKER_CONFIG:resolve('desktop/nonexistent-test-config.json')};
delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:resolve('desktop/node_modules/electron/dist/electron.exe'),args:[resolve('desktop')],env});
try {
 const page=await app.firstWindow();
 await page.getByRole('heading',{name:'Victory Sync',exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('#error').textContent.includes('Administrator setup required'));
 assert.equal(await page.locator('#indicator').innerText(),'Tracking off');
 const state=await page.evaluate(()=>window.tracker.state());
 assert.equal(state.tracking,false);assert.equal(state.consent,false);assert.equal(state.signedIn,false);
 assert.equal(await page.evaluate(()=>typeof window.require),'undefined');
 console.log('Desktop boot, setup error, capture-off state and renderer isolation passed.');
} finally {await app.close();}
