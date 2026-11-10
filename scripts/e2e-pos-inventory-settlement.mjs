import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const baseUrl=String(process.env.POS_E2E_API_URL||'').replace(/\/$/,'');
const pin=String(process.env.POS_E2E_PIN||'');
if(!baseUrl||!/^\d{4}$/.test(pin)) throw new Error('Set POS_E2E_API_URL and POS_E2E_PIN for the isolated development preview.');
if(/production|gastro-cashier\.vercel\.app/i.test(baseUrl)) throw new Error('Refusing to run transaction E2E against production.');

async function call(path,{token,method='GET',body,expected}={}) {
  const response=await fetch(baseUrl+path,{method,headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
  const data=await response.json().catch(()=>({}));
  if(expected!==undefined&&!expected.includes(response.status)) throw new Error(method+' '+path+' expected '+expected.join('/')+' got '+response.status+': '+(data.error||''));
  return {status:response.status,body:data};
}
const ok=async(path,opts={})=>{const r=await call(path,opts);assert.ok(r.status>=200&&r.status<300,opts.method+' '+path+' failed: '+(r.body.error||r.status));return r.body;};

const auth=await ok('/api/auth/pin',{method:'POST',body:{pin}});
assert.ok(auth.token,'Owner login must return a bearer token');
const token=auth.token;
const menu=await ok('/api/menu',{token});
const item=menu.find(x=>x.sku===(process.env.POS_E2E_STOCK_SKU||'food-4'));
assert.ok(item?.id,'Stock fixture menu SKU must exist');
const tables=await ok('/api/tables',{token});
const available=tables.filter(x=>x.table_state==='available');
assert.ok(available.length>=4,'At least four available fixture tables are required');
const selected=available.slice(0,4);
const adjust=async quantity=>ok('/api/menu/'+encodeURIComponent(item.id)+'/stock',{token,method:'PUT',body:{quantity,trackStock:true,note:'Automated isolated E2E fixture'}});
const open=async table=>ok('/api/sessions',{token,method:'POST',body:{tableId:table.table_id,guestCount:1}});
const order=async(sessionId,key)=>call('/api/sessions/'+encodeURIComponent(sessionId)+'/orders',{token,method:'POST',expected:[201,200,409],body:{items:[{menuItemId:item.id,quantity:1,notes:'Automated stock/settlement E2E'}],idempotencyKey:key}});
const unique=label=>label+'-'+randomUUID();

await adjust(1);
const [sessionA,sessionB]=await Promise.all([open(selected[0]),open(selected[1])]);
const keyA=unique('race-a'),keyB=unique('race-b');
const race=await Promise.all([order(sessionA.id,keyA),order(sessionB.id,keyB)]);
const winners=race.filter(x=>x.status===201),losers=race.filter(x=>x.status===409);
assert.equal(winners.length,1,'Exactly one cashier must reserve the only remaining menu stock unit');
assert.equal(losers.length,1,'The competing cashier must be rejected for insufficient stock');
const winningSession=race[0].status===201?sessionA:sessionB;
const losingSession=race[0].status===409?sessionA:sessionB;
const winningKey=race[0].status===201?keyA:keyB;
const winningOrder=winners[0].body;
assert.equal(winningOrder.items.length,1);
const replay=await order(winningSession.id,winningKey);
assert.equal(replay.status,200,'Same order idempotency key must replay the stored response');
assert.equal(replay.body.batch.id,winningOrder.batch.id,'Order replay must not create another batch');
const crossSessionReplay=await order(losingSession.id,winningKey);
assert.equal(crossSessionReplay.status,409,'An order idempotency key must not replay into a different dining session');
let liveMenu=await ok('/api/menu',{token});
assert.equal(Number(liveMenu.find(x=>x.id===item.id).stock_quantity),0,'Stock must be zero after one successful concurrent order');

const cancelled=await ok('/api/order-items/'+encodeURIComponent(winningOrder.items[0].id)+'/cancel',{token,method:'PATCH',body:{}});
assert.equal(cancelled.stockRestored,true,'Manager/Owner cancellation must restore tracked stock');
const cancelReplay=await ok('/api/order-items/'+encodeURIComponent(winningOrder.items[0].id)+'/cancel',{token,method:'PATCH',body:{}});
assert.equal(cancelReplay.alreadyCancelled,true,'Repeated cancellation must not restore stock twice');
liveMenu=await ok('/api/menu',{token});
assert.equal(Number(liveMenu.find(x=>x.id===item.id).stock_quantity),1,'Cancellation must restore exactly one unit');

await adjust(10);
const extraSessions=[winningSession,losingSession,await open(selected[2]),await open(selected[3])];
const methods=['qris','card','transfer','cash'];
const results=[];
for(let i=0;i<extraSessions.length;i++){
  const session=extraSessions[i];
  const orderKey=unique('settlement-order');
  const created=await order(session.id,orderKey);
  assert.equal(created.status,201,'Order should be accepted after stock replenishment');
  const line=created.body.items.reduce((sum,x)=>sum+Number(x.line_total),0);
  const service=Number((line*Number(session.service_charge_rate||0)).toFixed(2));
  const tax=Number(((line+service)*Number(session.tax_rate||0)).toFixed(2));
  const total=Number((line+service+tax).toFixed(2));
  const method=methods[i];
  let paymentKey=unique('settlement-'+method);
  let payment=await ok('/api/sessions/'+encodeURIComponent(session.id)+'/payments',{token,method:'POST',body:{method,discountAmount:0,cashReceived:method==='cash'?total:undefined,idempotencyKey:paymentKey}});
  if(method==='cash') assert.equal(payment.status,'settled','Cash must settle immediately');
  else {
    assert.equal(payment.status,'pending',method+' must remain pending until proof is confirmed');
    assert.equal(payment.paid_at,null,'Pending non-cash payment must not have paid_at');
    if(method==='transfer') {
      const voided=await ok('/api/payments/'+encodeURIComponent(payment.id)+'/void',{token,method:'PATCH',body:{reason:'E2E verifies pending payment can be safely voided'}});
      assert.equal(voided.payment.status,'voided','Pending payment must be voidable by an authorized approver');
      paymentKey=unique('settlement-transfer-retry');
      payment=await ok('/api/sessions/'+encodeURIComponent(session.id)+'/payments',{token,method:'POST',body:{method,discountAmount:0,idempotencyKey:paymentKey}});
      assert.equal(payment.status,'pending','Session must reopen after void so a replacement payment can be initiated');
    }
    const settled=await ok('/api/payments/'+encodeURIComponent(payment.id)+'/settle',{token,method:'PATCH',body:{providerReference:'E2E-'+method.toUpperCase()+'-'+randomUUID(),note:'Simulated manual confirmation; no live provider integration'}});
    assert.equal(settled.status,'settled');
  }
  const replayPayment=await ok('/api/sessions/'+encodeURIComponent(session.id)+'/payments',{token,method:'POST',body:{method,discountAmount:0,cashReceived:method==='cash'?total:undefined,idempotencyKey:paymentKey}});
  assert.equal(replayPayment.id,payment.id,'Payment idempotency must return the original payment');
  results.push({method,paymentId:payment.id,status:method==='cash'?'settled':'pending_then_settled',total});
}
const finalMenu=await ok('/api/menu',{token});
assert.equal(Number(finalMenu.find(x=>x.id===item.id).stock_quantity),6,'Four paid orders must deduct four units from stock 10');
const finalTables=await ok('/api/tables',{token});
for(const table of selected) assert.equal(finalTables.find(x=>x.table_id===table.table_id)?.table_state,'available','Settled or cancelled fixture table must be released');
console.log(JSON.stringify({ok:true,stockConcurrency:{accepted:1,rejected:1,stockAfterRace:0},cancellation:{restoredOnce:true,replaySafe:true},orderIdempotency:{replaySafe:true},settlements:results,finalStock:6,allTablesReleased:true,providerIntegration:'simulated reference only; no live QRIS/card/transfer provider configured'},null,2));
