import Stripe from "stripe";
import { sql } from "../db/index.js";

function stripe() {
  const key=process.env.STRIPE_SECRET_KEY;
  if(!key) throw new Error("STRIPE_SECRET_KEY não configurada.");
  return new Stripe(key);
}

export async function createCheckout(user:{id:number;email:string},plan:"monthly"|"annual") {
  const s=stripe();
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
  await sql(`INSERT INTO subscriptions(user_id,provider,provider_checkout_id,plan_type,status)
    VALUES($1,'stripe',$2,$3,'pending')`,[user.id,session.id,plan]);
  return session.url;
}

async function syncSubscription(s:Stripe,subscriptionId:string) {
  const sub=await s.subscriptions.retrieve(subscriptionId);
  const first=sub.items.data[0];
  const price=first?.price;
  const plan=price?.id===process.env.STRIPE_PRICE_ANNUAL?"annual":
    price?.id===process.env.STRIPE_PRICE_MONTHLY?"monthly":null;
  if(!plan) return;
  const periodEnd=(first as Stripe.SubscriptionItem & {current_period_end?:number}|undefined)?.current_period_end;
  const end=periodEnd ? new Date(periodEnd*1000) : null;
  const status=sub.status==="active"||sub.status==="trialing"?sub.status:
    sub.status==="past_due"?"past_due":sub.status==="canceled"?"cancelled":"pending";
  const customer=typeof sub.customer==="string"?sub.customer:sub.customer.id;
  await sql(`UPDATE subscriptions SET status=$2, plan_type=$3,
    current_period_end=$4,provider_customer_id=$5,updated_at=now()
    WHERE provider_subscription_id=$1`,[subscriptionId,status,plan,end,customer]);
}

export async function handleStripeWebhook(raw:Buffer,signature:string) {
  const secret=process.env.STRIPE_WEBHOOK_SECRET;
  if(!secret) throw new Error("STRIPE_WEBHOOK_SECRET não configurada.");
  const s=stripe();
  const event=s.webhooks.constructEvent(raw,signature,secret);
  if(event.type==="checkout.session.completed") {
    const session=event.data.object as Stripe.Checkout.Session;
    const subscriptionId=typeof session.subscription==="string"?session.subscription:null;
    const customerId=typeof session.customer==="string"?session.customer:null;
    if(subscriptionId){
      await sql(`UPDATE subscriptions SET provider_customer_id=$2,provider_subscription_id=$3,updated_at=now()
        WHERE provider_checkout_id=$1`,[session.id,customerId,subscriptionId]);
      await syncSubscription(s,subscriptionId);
    }
  }
  if(event.type==="customer.subscription.created"||event.type==="customer.subscription.updated"||
    event.type==="invoice.paid"||event.type==="invoice.payment_failed") {
    const obj=event.data.object;
    let subscriptionId:string|null=null;
    if(event.type.startsWith("customer.subscription.")) subscriptionId=(obj as Stripe.Subscription).id;
    else {
      const invoice=obj as Stripe.Invoice;
      const subscription=invoice.parent?.subscription_details?.subscription;
      subscriptionId=typeof subscription==="string"?subscription:null;
    }
    if(subscriptionId) await syncSubscription(s,subscriptionId);
  }
  if(event.type==="customer.subscription.deleted") {
    const sub=event.data.object as Stripe.Subscription;
    await sql("UPDATE subscriptions SET status='cancelled',updated_at=now() WHERE provider_subscription_id=$1",[sub.id]);
  }
  return event.type;
}
