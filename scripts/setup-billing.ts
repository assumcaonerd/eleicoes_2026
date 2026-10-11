// App-only pre-deploy: validates configuration and provisions a dedicated portal.
// Never creates a checkout, charges a payment method, or changes a subscription.
import Stripe from 'stripe';
import {pool,sql} from '../src/db/index.js';
import {syncSubscription} from '../src/billing/stripe.js';
try {
 if(!process.env.STRIPE_SECRET_KEY||!process.env.STRIPE_WEBHOOK_SECRET)throw Error('Credenciais de cobrança ausentes.');
 const origin=process.env.APP_ORIGIN;
 if(!origin||new URL(origin).protocol!=='https:')throw Error('APP_ORIGIN precisa usar HTTPS.');
 const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
 for(const [id,amount,interval] of [[process.env.STRIPE_PRICE_MONTHLY,990,'month'],[process.env.STRIPE_PRICE_ANNUAL,9900,'year']] as const){
  if(!id)throw Error('Preço ausente.');const price=await stripe.prices.retrieve(id);
  if(!price.active||price.currency!=='brl'||price.unit_amount!==amount||price.type!=='recurring'||price.recurring?.interval!==interval||price.recurring.interval_count!==1)throw Error('Preço de cobrança incompatível.');
 }
 const configured=process.env.STRIPE_PORTAL_CONFIGURATION||(await sql("SELECT value FROM billing_settings WHERE key='portal_configuration'")).rows[0]?.value;
 let portal=configured?await stripe.billingPortal.configurations.retrieve(configured):null;
 if(!portal){
  // Dedicated configuration leaves other applications' default portals untouched.
  portal=await stripe.billingPortal.configurations.create({
   business_profile:{headline:'Gerencie sua assinatura SIGA O VOTO'},
   features:{invoice_history:{enabled:true},payment_method_update:{enabled:true},subscription_cancel:{enabled:true,mode:'at_period_end'},subscription_update:{enabled:false}},
   metadata:{application:'siga-o-voto'}
  },{idempotencyKey:'siga-o-voto-portal-v1'});
  await sql("INSERT INTO billing_settings(key,value) VALUES('portal_configuration',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[portal.id]);
 }
 if(!portal.active||!portal.features.subscription_cancel.enabled||portal.features.subscription_cancel.mode!=='at_period_end')throw Error('Portal deve permitir cancelamento ao fim do período.');
 const endpoints=await stripe.webhookEndpoints.list({limit:100});
 const endpoint=endpoints.data.find(e=>e.url===`${origin.replace(/\/$/,'')}/webhooks/stripe`&&e.status==='enabled');
 const required=['checkout.session.completed','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed'];
 if(!endpoint||(!endpoint.enabled_events.includes('*')&&required.some(e=>!endpoint.enabled_events.includes(e as any))))throw Error('Endpoint Stripe ativo não cobre todos os eventos necessários.');
 const existing=await sql("SELECT DISTINCT provider_subscription_id FROM subscriptions WHERE provider='stripe' AND provider_subscription_id IS NOT NULL");
 for(const row of existing.rows)await syncSubscription(stripe,row.provider_subscription_id);
 console.log(JSON.stringify({billingConfiguration:'verified',portalCancellation:'at_period_end',webhookEvents:'verified',subscriptionsReconciled:existing.rows.length}));
} catch(error){
 // Never print Stripe request objects or keys.
 console.error('BILLING_SETUP_FAILED',error instanceof Error?error.message:'Falha na configuração.');
 process.exitCode=1;
} finally{await pool.end()}
