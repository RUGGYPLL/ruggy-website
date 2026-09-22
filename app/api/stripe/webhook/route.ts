import { getStripe } from "@/lib/stripe";
import { fulfillAgreedProjectPayment } from "@/lib/fulfill-agreed-project-payment";
import { fulfillCheckout } from "@/lib/fulfill-checkout";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type Stripe from "stripe";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = (await headers()).get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  if (!webhookSecret || !webhookSecret.startsWith("whsec_")) {
    console.error(
      "Nieprawidłowy STRIPE_WEBHOOK_SECRET. Sekret webhooka powinien zaczynać się od whsec_.",
    );
    return NextResponse.json(
      { error: "Webhook secret is not configured" },
      { status: 500 },
    );
  }

  let stripe;

  try {
    stripe = getStripe();
  } catch (error) {
    console.error("Nieprawidłowy STRIPE_SECRET_KEY:", error);
    return NextResponse.json(
      { error: "Stripe is not configured" },
      { status: 500 },
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    console.error("Nieprawidłowy podpis webhooka Stripe:", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object;

    if (session.metadata?.checkoutKind === "agreed_project_payment") {
      const result = await fulfillAgreedProjectPayment(session.id);

      if (!result.success && result.reason !== "not_paid") {
        return NextResponse.json(
          { error: result.message },
          { status: 500 },
        );
      }

      return NextResponse.json({ received: true });
    }

    const result = await fulfillCheckout(session.id);

    if (!result.success && result.reason !== "not_paid") {
      return NextResponse.json(
        { error: result.message },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ received: true });
}
