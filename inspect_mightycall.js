const fs=require('fs');
const doc=JSON.parse(fs.readFileSync('mightycall_swagger.json','utf8'));
const re=/currentCall|current_call|userStatus|ownStatus|status|extension|agent|call/i;
function find(obj,path=''){
  if(obj && typeof obj==='object'){
    if(Array.isArray(obj)){
      obj.forEach((v,i)=>find(v,`${path}[${i}]`));
    } else {
      Object.entries(obj).forEach(([k,v])=>{
        const p = path ? `${path}.${k}` : k;
        if(re.test(k)) console.log('KEY', p, typeof v);
        find(v,p);
      });
    }
  }
}
find(doc);
