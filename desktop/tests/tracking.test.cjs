const {test}=require('node:test');const assert=require('node:assert/strict');
const {canCapture,nextScreenshot}=require('../tracking.cjs');
test('capture requires consent, current authorization and a working session',()=>{
 const state={consent:true,locked:false,session:{status:'working',ended_at:null},leaseUntil:200,now:100};
 assert.equal(canCapture(state),true);
 for(const change of [{consent:false},{locked:true},{leaseUntil:100},{session:{status:'break'}},{session:{status:'stopped'}},{session:null},{session:{status:'working',ended_at:'now'}}])assert.equal(canCapture({...state,...change}),false);
});
test('random capture interval respects configured bounds',()=>{const settings={screenshot_min_minutes:5,screenshot_max_minutes:10};assert.equal(nextScreenshot(settings,()=>0),300000);assert.equal(nextScreenshot(settings,()=>1),600000);});
