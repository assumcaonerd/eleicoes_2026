import {test} from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import {createCheckout,createPortal,syncSubscription,processStripeEvent,handleStripeWebhook} from '../src/billing/stripe.js';
import {hasActiveAccess,subscriptionHasAccess} from '../src/auth/security.js';
process.env.STRIPE_PRICE_MONTHLY='price_month';
process.env.STRIPE_PRICE_ANNUAL='price_year';
process.env.APP_ORIGIN='https://example.test';
process.env.STRIPE_WEBHOOK_SECRET='whsec_test';
const sdk=new Stripe('sk_test_fake');
const empty=async()=>({rows:[]});
const sub=(status='active',paid=true,cancel=false)=>({id:'sub_1',status,customer:'cus_1',cancel_at_period_end:cancel,items:{data:[{id:'si_1',current_period_end:2000000000,price:{id:'price_month'}}]},latest_invoice:{status:paid?'paid':'open',paid,lines:{data:[{parent:{subscription_item_details:{subscription_item:'si_1'}},period:{end:2000000000}}]}}});
test('checkout validates both BRL recurring prices and preserves plan',async()=>{
 for(const plan of ['monthly','annual'] as const){
  let payload:any;const fake:any={prices:{retrieve:async()=>({active:true,currency:'brl',unit_amount:plan==='monthly'?990:9900,type:'recurring',recurring:{interval:plan==='monthly'?'month':'year',interval_count:1}})},checkout:{sessions:{create:async(p:any)=>{payload=p;return {id:'cs_1',url:'https://checkout.stripe.com/test'}}}}};
  assert.match((await createCheckout({id:1,email:'a@example.test'},plan,fake,empty))!,/stripe/);
  assert.equal(payload.subscription_data.metadata.plan,plan);
  fake.prices.retrieve=async()=>({active:true,currency:'usd'});
  await assert.rejects(createCheckout({id:1,email:'a@example.test'},plan,fake,empty),/incompatível/);
 }
});
test('checkout refuses duplicate subscription and invalid plan',async()=>{
 await assert.rejects(createCheckout({id:1,email:'a@b.test'},'monthly',{} as any,async()=>({rows:[{}]})),/existente/);
 await assert.rejects(createCheckout({id:1,email:'a@b.test'},'invalid' as any,{} as any,empty),/inválido/);
});
test('portal uses only authenticated user customer; cancellation must be at period end',async()=>{
 let sent:any;const fake:any={billingPortal:{configurations:{list:async()=>({data:[{id:'bpc_1',active:true,features:{subscription_cancel:{enabled:true,mode:'at_period_end'}}}]})},sessions:{create:async(p:any)=>{sent=p;return {url:'https://billing.stripe.com/test'}}}}};
 const query=async(_s:string,p?:unknown[])=>{if(!p)return {rows:[]};assert.deepEqual(p,[42]);return {rows:[{provider_customer_id:'cus_owned'}]}};
 await createPortal(42,fake,query);assert.equal(sent.customer,'cus_owned');assert.equal(sent.return_url,'https://example.test/assinatura');
 await assert.rejects(createPortal(43,fake,empty),/Nenhuma/);
 fake.billingPortal.configurations.list=async()=>({data:[]});await assert.rejects(createPortal(42,fake,query),/Configure/);
});
test('renewal failure does not extend paid access; cancellation preserves paid period',async()=>{
 for(const [status,paid,cancel] of [['active',true,false],['past_due',false,false],['canceled',true,true],['unpaid',false,false]] as const){
 let values:any;await syncSubscription({subscriptions:{retrieve:async()=>sub(status,paid,cancel)}} as any,'sub_1',async(_q,p)=>{values=p;return {rows:[]}});
 assert.equal(values[1],status==='canceled'?'cancelled':status);assert.equal(values[5],cancel);assert.equal(Boolean(values[6]),paid);
 }
});
test('unknown prices fail closed',async()=>{
 const obj=sub();obj.items.data[0].price.id='unknown';await assert.rejects(syncSubscription({subscriptions:{retrieve:async()=>obj}} as any,'sub_1',empty),/desconhecido/);
});
test('unlinked events are retried instead of silently acknowledged',async()=>{
 await assert.rejects(processStripeEvent({type:'invoice.paid',data:{object:{parent:{subscription_details:{subscription:'sub_1'}}}}} as any,{} as any,empty),/vinculada/);
 await assert.rejects(processStripeEvent({type:'checkout.session.completed',data:{object:{id:'cs_1',subscription:'sub_1'}}} as any,{} as any,empty),/registrado/);
});
test('signed duplicate webhooks are skipped; signature rejection occurs before database access',async()=>{
 const payload=JSON.stringify({id:'evt_1',type:'invoice.payment_failed',data:{object:{parent:{subscription_details:{subscription:'sub_1'}}}}});
 const signature=sdk.webhooks.generateTestHeaderString({payload,secret:'whsec_test'});
 let seen=false,reads=0;const commands:string[]=[];
 const client:any={query:async(q:string)=>{commands.push(q);if(q.startsWith('INSERT')){const rows=seen?[]:[{}];seen=true;return {rows}}if(q.startsWith('SELECT'))return {rows:[{}]};return {rows:[]}},release(){}};
 const fake:any={webhooks:sdk.webhooks,subscriptions:{retrieve:async()=>{reads++;return sub('past_due',false)}}};
 await handleStripeWebhook(Buffer.from(payload),signature,fake,async()=>client);
 await handleStripeWebhook(Buffer.from(payload),signature,fake,async()=>client);
 assert.equal(reads,1);assert.equal(commands.filter(q=>q==='COMMIT').length,2);
 await assert.rejects(handleStripeWebhook(Buffer.from(payload),'invalid',fake,async()=>{throw Error('database must not be called')}));
});
test('webhook failures roll back for safe retry',async()=>{
 const payload=JSON.stringify({id:'evt_failure',type:'customer.subscription.updated',data:{object:{id:'sub_1'}}});const signature=sdk.webhooks.generateTestHeaderString({payload,secret:'whsec_test'});
 const commands:string[]=[];let released=false;const client:any={query:async(q:string)=>{commands.push(q);return {rows:q.startsWith('INSERT')?[{}]:[]}},release(){released=true}};
 await assert.rejects(handleStripeWebhook(Buffer.from(payload),signature,{webhooks:sdk.webhooks} as any,async()=>client),/vinculada/);
 assert.ok(commands.includes('ROLLBACK'));assert.ok(released);
});
test('authorization preserves paid access through cancellation and failures, expires exactly at end',async()=>{
 const now=Date.now();
 for(const status of ['active','cancelled','past_due','unpaid']){
  const record={plan_type:'monthly',status,paid_through:new Date(now+1000)};
  assert.equal(subscriptionHasAccess(record,now),true);
  assert.equal(subscriptionHasAccess(record,now+1000),false);
  let calls=0;const query:any=async(_q:string,p:any[])=>{assert.deepEqual(p??[],calls++===0?[]:[42]);return {rows:calls===1?[{id:99}]:[record]}};
  assert.equal(await hasActiveAccess(42,query),true);
 }
 assert.equal(subscriptionHasAccess({plan_type:'annual',status:'active',current_period_end:new Date(now+1000)},now),false);
 assert.equal(subscriptionHasAccess({plan_type:'lifetime',status:'active'},now),true);
 assert.equal(subscriptionHasAccess({plan_type:'lifetime',status:'cancelled'},now),false);
 assert.equal(subscriptionHasAccess({plan_type:'monthly',status:'trialing',current_period_end:new Date(now+1000)},now),true);
});

test('subscription routes reject unauthenticated users and foreign origins',async()=>{
 const {handleWeb}=await import('../src/web/handler.js');
 for(const [path,method,origin,expected] of [['/assinatura','GET',undefined,303],['/assinatura/portal','POST','https://example.test',401],['/assinatura/portal','POST','https://attacker.test',403],['/checkout','POST','https://attacker.test',403]] as const){
 let status=0;let location='';
 const response:any={writeHead:(s:number,h:any)=>{status=s;location=h.location??''},end(){},setHeader(){}};
 await handleWeb({url:path,method,headers:origin?{origin}:{}} as any,response);
 assert.equal(status,expected);if(method==='GET')assert.equal(location,'/login');
 }
});
