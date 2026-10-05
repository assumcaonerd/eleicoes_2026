import Stripe from "stripe";
import { sql } from "../db/index.js";

function stripe() {
  const key=process.env.STRIPE_SECRET_KEY;
  if(!key) throw new Error("STRIPE_SECRET_KEY não configurada.");
  return new Stripe(key);
}

export async function createCheckout(user:{id:number;email:string},plan:"monthly"|"lifetime") {
  const s=stripe();
  const price=plan==="monthly"?process.env.STRIPE_PRICE_MONTHLY:process.env.STRIPE_PRICE_LIFETIME;
  if(!price) throw new Error(`Preço Stripe não configurado para ${plan}.`);
  const origin=process.env.APP_ORIGIN;
  if(!origin) throw new Error("APP_ORIGIN não configurada.");
  const session=await s.checkout.sessions.create({
    mode:plan==="monthly"?"subscription":"payment",
    customer_email:user.email,
    client_reference_id:String(user.id),
    metadata:{userId:String(user.id),plan},
    line_items:[{price,quantity:1}],
    success_url:`${origin}/app?payment=success`,
    cancel_url:`${origin}/planos?payment=cancelled`
  });
  await sql(`INSERT INTO subscriptions(user_id,provider,provider_checkout_id,plan_type,status)
    VALUES($1,'stripe',$2,$3,'pending')`,[user.id,session.id,plan]);
  return session.url;
}

export async function handleStripeWebhook(raw:Buffer,signature:string) {
  const secret=process.env.STRIPE_WEBHOOK_SECRET;
  if(!secret) throw new Error("STRIPE_WEBHOOK_SECRET não configurada.");
  const event=stripe().webhooks.constructEvent(raw,signature,secret);
  if(event.type==="checkout.session.completed") {
    const session=event.data.object as Stripe.Checkout.Session;
    const userId=Number(session.metadata?.userId||session.client_reference_id);
    const plan=(session.metadata?.plan==="lifetime"?"lifetime":"monthly");
    const subscriptionId=typeof session.subscription==="string"?session.subscription:null;
    const customerId=typeof session.customer==="string"?session.customer:null;
    await sql(`UPDATE subscriptions SET status='active',provider_customer_id=$2,provider_subscription_id=$3,updated_at=now(),
      current_period_end=CASE WHEN $4='lifetime' THEN NULL ELSE now()+interval '31 days' END
      WHERE provider_checkout_id=$1`,[session.id,customerId,subscriptionId,plan]);
    if(!Number.isFinite(userId)) throw new Error("Webhook sem usuário válido.");
  }
  if(event.type==="customer.subscription.deleted") {
    const sub=event.data.object as Stripe.Subscription;
    await sql("UPDATE subscriptions SET status='cancelled',updated_at=now() WHERE provider_subscription_id=$1",[sub.id]);
  }
  if(event.type==="invoice.payment_failed") {
    const invoice=event.data.object as Stripe.Invoice;
    const subId=typeof invoice.parent?.subscription_details?.subscription==="string"?invoice.parent.subscription_details.subscription:null;
    if(subId) await sql("UPDATE subscriptions SET status='past_due',updated_at=now() WHERE provider_subscription_id=$1",[subId]);
  }
  return event.type;
}
