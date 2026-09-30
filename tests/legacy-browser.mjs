import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync,writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const base=process.env.TEST_URL||'http://127.0.0.1:5174';
const populated=process.env.TEST_POPULATED==='true';
const host=new URL(readFileSync('client/.env','utf8').match(/^VITE_SUPABASE_URL=(.*)$/m)[1].trim()).hostname;
const routes=process.env.TEST_ROUTES?.split(',') || [...new Set(JSON.parse(readFileSync('audit/browser-readiness.json')).results.map(r=>r.route))];
const id='00000000-0000-4000-8000-000000000001',org='00000000-0000-4000-8000-000000000002',exp=Math.floor(Date.now()/1000)+7200;
const user={id,email:'audit@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{}};
const token=`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub:id,exp,aud:'authenticated',session_id:'audit'})).toString('base64url')}.fixture`;
const results=[],browser=await chromium.launch({headless:true});
try{
for(const theme of ['light','dark'])for(const width of [390,768,1440]){
 const context=await browser.newContext({viewport:{width,height:1000}});const page=await context.newPage();let errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(({host,user,token,exp,theme})=>{localStorage.setItem(`sb-${host.split('.')[0]}-auth-token`,JSON.stringify({user,access_token:token,refresh_token:'fixture',expires_at:exp,expires_in:7200,token_type:'bearer'}));localStorage.setItem('victorysync:remember-login','true');localStorage.setItem('vs-theme',theme);},{host,user,token,exp,theme});
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname===host)return route.fulfill({json:u.pathname.includes('/auth/')?user:u.pathname.includes('/organizations')?{id:org,name:'Audit client',timezone:'Africa/Cairo'}:[]});if(u.pathname.startsWith('/api/')){
   let json={};if(u.pathname==='/api/user/profile')json={user:{...user,full_name:'Audit account'},profile:{global_role:'platform_admin'}};
   else if(u.pathname==='/api/user/orgs')json={orgs:[{id:org,name:'Audit client'}]};
   else if(u.pathname==='/api/user/mfa/factors')json={factors:[]};
   else if(u.pathname==='/api/me/features')json={features:{}};
   else if(u.pathname==='/api/csrf-token')json={csrfToken:'fixture'};
   else if(populated && u.pathname==='/api/reports/overview')json={overview:{total_calls:4,answered_calls:2,missed_calls:2,total_transfers:1,total_recordings:2,total_sms:3,avg_duration_seconds:100}};
   else if(populated && u.pathname==='/api/reports/calls')json={calls:['connected','no_answer','completed','missed'].map((status,i)=>({id:`call-${i}`,status,started_at:new Date(Date.now()-i*3600000).toISOString(),duration_seconds:120,direction:i===0?'internal':i===1?'outbound':'inbound',business_number:'+12125550100',agent_name:'Audit agent',agent_extension:'101'}))};
   else if(populated && u.pathname==='/api/live-status')json={refreshed_at:new Date().toISOString(),items:[{user_id:id,display_name:'Audit agent',extension:'101',on_call:true,status:'connected',started_at:new Date().toISOString()},{user_id:'offline',display_name:'Offline agent',on_call:false,status:'offline'}]};
   else if(populated && u.pathname.endsWith('/api-keys'))json=route.request().method()==='POST'?{apiKey:'fixture-new-key',key:{id:'new-key',label:'Fixture integration',created_at:new Date().toISOString()}}:{keys:[{id:'old-key',label:'Existing integration',created_at:new Date().toISOString(),last_used_at:null}]};
   else json={users:[],orgs:[],agents:[],numbers:[],calls:[],recordings:[],reports:[],rows:[],items:[],data:[],logs:[],requests:[],keys:[],members:[],invites:[],messages:[],org:{id:org,name:'Audit client'},metrics:{total_calls:0,answered_calls:0,answer_rate_pct:0,avg_wait_seconds:0}};
   return route.fulfill({json});
 }if(u.origin!==base)return route.abort();return route.continue();});
 for(const route of routes){errors=[];await page.goto(base+route,{waitUntil:'networkidle'});await page.waitForTimeout(150);
  if(populated && route==='/api-keys'){
   await page.getByLabel('Organization',{exact:true}).selectOption(org);
   await page.getByText('Existing integration',{exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Show',exact:true}).isDisabled(),true);
   await page.getByRole('button',{name:'+ Create New API Key',exact:true}).click();
   await page.getByLabel('Key name',{exact:true}).fill('Fixture integration');
   await page.getByRole('button',{name:'Create',exact:true}).click();
   await page.getByText('fixture-new-key',{exact:true}).waitFor();
  }
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  results.push({route,theme,width,renderedPath:new URL(page.url()).pathname,overflow,errors:[...errors],violations:axe.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:axe.incomplete.map(v=>v.id)});
 }
 console.log(`${theme} ${width}: ${results.length} route checks complete`);await context.close();
}
}finally{await browser.close();writeFileSync(process.env.TEST_OUTPUT || 'audit/legacy-browser-after.json',JSON.stringify({method:'Synthetic admin auth and intercepted responses, routes at 3 widths in both themes. Redirects and empty states are recorded. Axe cannot certify all populated charts, translucency, interactive states or production behavior.',results},null,2));}
console.log(JSON.stringify({checks:results.length,withIssues:results.filter(r=>r.violations.length||r.errors.length||r.overflow).length}));
if(results.some(r=>r.violations.length||r.errors.length||r.overflow)) process.exitCode=1;
