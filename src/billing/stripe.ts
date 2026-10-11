import Stripe from "stripe";
import { pool, sql } from "../db/index.js";

function stripe() {
  const key=process.env.STRIPE_SECRET_KEY;
  if(!key) throw new Error("STRIPE_SECRET_KEY não configurada.");
  return new Stripe(key);
}

async function checkoutWithLock(user:{id:number;email:string},plan:"monthly"|"annual", s:Stripe=stripe(), query:Query=sql) {
  if(plan!=="monthly"&&plan!=="annual") throw new Error("Plano inválido.");
  const existing=await query("SELECT 1 FROM subscriptions WHERE user_id=$1 AND provider='stripe' AND (status IN ('active','trialing','past_due','unpaid') OR (status='pending' AND created_at>now()-interval '24 hours')) LIMIT 1",[user.id]);
  if(existing.rows[0]) throw new Error("Gerencie sua assinatura existente antes de iniciar outra.");
  const price=plan==="monthly"?process.env.STRIPE_PRICE_MONTHLY:process.env.STRIPE_PRICE_ANNUAL;
  if(!price) throw new Error(`Preço Stripe não configurado para ${plan}.`);
  const details=await s.prices.retrieve(price);
  const expected=plan==="monthly"?990:9900;
  const interval=plan==="monthly"?"month":"year";
  if(!details.active||details.currency!=="brl"||details.unit_amount!==expected||
     details.type!=="recurring"||details.recurring?.interval!==interval||
     details.recurring?.interval_count!==1)
    throw new Error("Preço Stripe incompatível: confira BRL, valor e recorrência do plano.");
  const origin=process.env.APP_ORIGIN;
  if(!origin) throw new Error("APP_ORIGIN não configurada.");
  const session=await s.checkout.sessions.create({
    mode:"subscription",
    customer_email:user.email,
    client_reference_id:String(user.id),
    metadata:{userId:String(user.id),plan},
    subscription_data:{metadata:{userId:String(user.id),plan}},
    line_items:[{price,quantity:1}],
    success_url:`${origin}/app?payment=success`,
    cancel_url:`${origin}/planos?payment=cancelled`
  });
  await query(`INSERT INTO subscriptions(user_id,provider,provider_checkout_id,plan_type,status)
    VALUES($1,'stripe',$2,$3,'pending')`,[user.id,session.id,plan]);
  return session.url;
}

export async function createCheckout(user:{id:number;email:string},plan:"monthly"|"annual", s:Stripe=stripe(), query?:Query) {
  if(query) return checkoutWithLock(user,plan,s,query);
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE",[user.id]);
    const url=await checkoutWithLock(user,plan,s,(text,params)=>client.query(text,params));
    await client.query("COMMIT");return url;
  }catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
}

type Query = (text:string, params?:unknown[])=>Promise<any>;
export async function subscriptionSummary(userId:number, query:Query=sql) {
  return (await query("SELECT plan_type,status,current_period_end,paid_through,cancel_at_period_end,provider_customer_id FROM subscriptions WHERE user_id=$1 ORDER BY COALESCE(paid_through,current_period_end) DESC NULLS LAST,id DESC LIMIT 1",[userId])).rows[0]??null;
}

export async function createPortal(userId:number, s:Stripe=stripe(), query:Query=sql) {
  const row=await subscriptionSummary(userId,query);
  if(!row?.provider_customer_id) throw new Error("Nenhuma assinatura Stripe disponível.");
  const origin=process.env.APP_ORIGIN;
  if(!origin||!/^https:\/\//.test(origin)) throw new Error("APP_ORIGIN HTTPS necessária.");
  const configuration=process.env.STRIPE_PORTAL_CONFIGURATION||(await query("SELECT value FROM billing_settings WHERE key='portal_configuration'")).rows[0]?.value;
  const cfg=configuration?await s.billingPortal.configurations.retrieve(configuration):
    (await s.billingPortal.configurations.list({is_default:true,limit:1})).data[0];
  if(!cfg?.active||!cfg.features.subscription_cancel.enabled||cfg.features.subscription_cancel.mode!=="at_period_end")
    throw new Error("Configure o portal Stripe para cancelar ao final do período.");
  const session=await s.billingPortal.sessions.create({customer:row.provider_customer_id,
    configuration:cfg.id,return_url:`${origin}/assinatura`});
  return session.url;
}

export async function syncSubscription(s:Stripe,subscriptionId:string,query:Query=sql) {
  // Read current Stripe state rather than trusting event delivery order.
  const sub=await s.subscriptions.retrieve(subscriptionId,{expand:["latest_invoice"]});
  const first=sub.items.data[0];
  const price=first?.price;
  const plan=price?.id===process.env.STRIPE_PRICE_ANNUAL?"annual":
    price?.id===process.env.STRIPE_PRICE_MONTHLY?"monthly":null;
  if(!plan) throw new Error("Preço de assinatura desconhecido.");
  const periodEnd=first?.current_period_end;
  const end=periodEnd ? new Date(periodEnd*1000) : null;
  const status=sub.status==="canceled"?"cancelled":sub.status;
  const customer=typeof sub.customer==="string"?sub.customer:sub.customer.id;
  const latest=sub.latest_invoice;
  const invoice=typeof latest==="string"?await s.invoices.retrieve(latest):latest;
  // Only a settled subscription invoice can extend the paid entitlement.
  const paidEnd=invoice?.status==="paid" ?
    Math.max(0,...invoice.lines.data.filter(line=>line.parent?.subscription_item_details?.subscription_item===first?.id).map(line=>line.period.end)):0;
  await query(`UPDATE subscriptions SET status=$2, plan_type=$3,
    current_period_end=$4,provider_customer_id=$5,cancel_at_period_end=$6,
    paid_through=CASE WHEN $7::timestamptz IS NULL THEN paid_through ELSE GREATEST(paid_through,$7::timestamptz) END,updated_at=now()
    WHERE provider_subscription_id=$1`,[subscriptionId,status,plan,end,customer,sub.cancel_at_period_end,paidEnd?new Date(paidEnd*1000):null]);
}

export async function processStripeEvent(event:Stripe.Event,s:Stripe,query:Query) {
  if(event.type==="checkout.session.completed"||event.type==="checkout.session.async_payment_succeeded") {
    const session=event.data.object as Stripe.Checkout.Session;
    const subscriptionId=typeof session.subscription==="string"?session.subscription:session.subscription?.id;
    const customerId=typeof session.customer==="string"?session.customer:session.customer?.id;
    if(subscriptionId){
      const linked=await query(`UPDATE subscriptions SET provider_customer_id=$2,provider_subscription_id=$3,updated_at=now()
        WHERE provider_checkout_id=$1 RETURNING id`,[session.id,customerId,subscriptionId]);
      if(!linked.rows[0]) throw new Error("Checkout ainda não registrado; reenviar webhook.");
      await syncSubscription(s,subscriptionId,query);
    }
  }
  if(event.type.startsWith("customer.subscription.")||event.type==="invoice.paid"||event.type==="invoice.payment_failed") {
    const obj=event.data.object;
    const subscription=event.type.startsWith("customer.subscription.")?(obj as Stripe.Subscription).id:
      (obj as Stripe.Invoice).parent?.subscription_details?.subscription;
    const id=typeof subscription==="string"?subscription:subscription?.id;
    if(id){
      const linked=await query("SELECT id FROM subscriptions WHERE provider_subscription_id=$1 FOR UPDATE",[id]);
      if(!linked.rows[0]) throw new Error("Assinatura ainda não vinculada; reenviar webhook.");
      await syncSubscription(s,id,query);
    }
  }
}

export async function handleStripeWebhook(raw:Buffer,signature:string, s:Stripe=stripe(), connect=()=>pool.connect()) {
  const secret=process.env.STRIPE_WEBHOOK_SECRET;
  if(!secret) throw new Error("STRIPE_WEBHOOK_SECRET não configurada.");
  const event=s.webhooks.constructEvent(raw,signature,secret);
  const client=await connect();
  try {
    await client.query("BEGIN");
    const inserted=await client.query("INSERT INTO stripe_events(id,event_type) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id",[event.id,event.type]);
    if(inserted.rows[0]) await processStripeEvent(event,s,(text,params)=>client.query(text,params));
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
  return event.type;
}
