/* ================================================================
   NUCLEAR IDEAS — BETALNINGS-ROUTE (routes/payment.js)
   ================================================================
   ENDPOINTS:
     POST /api/payment/create-intent   → Skapa Stripe PaymentIntent
     POST /api/payment/webhook         → Stripe Webhook-hantering
     GET  /api/payment/methods         → Tillgängliga betalmetoder

   STRIPE-SETUP (5 steg):
     1. Skapa konto: https://dashboard.stripe.com
     2. Hämta nycklar: Dashboard → Developers → API keys
     3. Lägg i .env: STRIPE_SECRET_KEY=sk_test_XXXX
     4. Lägg i frontend index.html: CFG.STRIPE_PK = 'pk_test_XXXX'
     5. Lägg till i <head>: <script src="https://js.stripe.com/v3/"></script>

   KLARNA:
     Stripe Dashboard → Settings → Payment methods → Klarna → Aktivera
     Avkommentera 'klarna' i create-intent nedan.

   GOOGLE PAY:
     Aktiveras automatiskt via Stripe Card payments.

   SWISH:
     Hanteras manuellt (Swish for Merchants behövs, ej via Stripe).

   WEBHOOKS (lokal testning):
     stripe listen --forward-to localhost:3000/api/payment/webhook
   ================================================================ */

'use strict';

const express = require('express');
const router  = express.Router();

/* Stripe laddas bara om nyckeln finns */
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  console.log('[PAYMENT] Stripe aktiverat ✓');
} else {
  console.warn('[PAYMENT] STRIPE_SECRET_KEY saknas — demo-läge');
}

/* ================================================================
   POST /api/payment/create-intent
   Body: { amount: 500, currency: 'sek', metadata: { ... } }
   Svar: { clientSecret, paymentIntentId }
   ================================================================ */
router.post('/create-intent', async (req, res) => {

  /* Demo-läge om Stripe inte är konfigurerat */
  if (!stripe) {
    return res.json({
      clientSecret:    'pi_DEMO_secret_DEMO',
      paymentIntentId: 'pi_DEMO',
      demo: true,
    });
  }

  const { amount, currency = 'sek', metadata = {} } = req.body;
  const amountInt = parseInt(amount, 10);

  if (!amountInt || amountInt < 1 || amountInt > 100000) {
    return res.status(400).json({ error: 'Ogiltigt belopp (1–100 000 kr)' });
  }

  try {
    const intent = await stripe.paymentIntents.create({
      /* SEK: belopp i ören. 500 kr = 50000 öre */
      amount:   amountInt * 100,
      currency: currency.toLowerCase(),

      /* -------------------------------------------------------
         BETALNINGSMETODER:
         Avkommentera det du vill aktivera.
         OBS: Klarna kräver aktivering i Stripe Dashboard.
         ------------------------------------------------------- */
      payment_method_types: [
        'card',
        // 'klarna',
        // 'link',
      ],

      description:   `Nuclear Ideas — ${metadata.service || 'Bokning'}`,
      receipt_email: metadata.email || undefined,

      metadata: {
        source:  'nuclear-ideas',
        service: metadata.service || '',
        date:    metadata.date    || '',
        time:    metadata.time    || '',
        name:    metadata.name    || '',
        email:   metadata.email   || '',
      },
    });

    res.json({
      clientSecret:    intent.client_secret,
      paymentIntentId: intent.id,
    });

  } catch (err) {
    console.error('[STRIPE]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ================================================================
   POST /api/payment/webhook
   ================================================================
   Setup:
     1. stripe listen --forward-to localhost:3000/api/payment/webhook
     2. Kopiera "Signing secret" till STRIPE_WEBHOOK_SECRET i .env

   Produktion:
     Dashboard → Developers → Webhooks → Add endpoint
     URL: https://din-server.se/api/payment/webhook
     Events: payment_intent.succeeded, payment_intent.payment_failed
   ================================================================ */
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }), /* RAW body krävs */
  (req, res) => {
    if (!stripe) return res.status(400).json({ error: 'Stripe ej konfigurerat' });

    const sig    = req.headers['stripe-signature'];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!secret) {
      console.warn('[WEBHOOK] STRIPE_WEBHOOK_SECRET saknas');
      return res.status(400).json({ error: 'Webhook-hemlighet saknas' });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
    } catch (err) {
      console.error('[WEBHOOK] Signaturfel:', err.message);
      return res.status(400).json({ error: `Webhook signatur ogiltig: ${err.message}` });
    }

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        console.log(`[WEBHOOK] ✓ Betalning lyckades: ${pi.id} — ${pi.amount / 100} ${pi.currency.toUpperCase()}`);
        /* TODO: markera bokning som betald i databasen */
        break;
      }
      case 'payment_intent.payment_failed': {
        console.warn(`[WEBHOOK] ✗ Betalning misslyckades: ${event.data.object.id}`);
        /* TODO: avbryt eller flagga bokning */
        break;
      }
      case 'charge.refunded':
        console.log(`[WEBHOOK] Återbetalning: ${event.data.object.id}`);
        break;
      default:
        console.log(`[WEBHOOK] Okänt event: ${event.type}`);
    }

    res.json({ received: true });
  },
);

/* ================================================================
   GET /api/payment/methods
   Returnerar vilka metoder som är aktiva.
   ================================================================ */
router.get('/methods', (_req, res) => {
  res.json({
    methods: [
      { id: 'stripe',    name: 'Kortbetalning', active: !!stripe,  note: 'Visa, Mastercard, Amex' },
      { id: 'klarna',    name: 'Klarna',        active: !!stripe,  note: 'Aktivera i Stripe Dashboard' },
      { id: 'googlepay', name: 'Google Pay',    active: !!stripe,  note: 'Aktivt via Stripe Card payments' },
      { id: 'swish',     name: 'Swish',         active: false,     note: 'Kräver Swish for Merchants API' },
    ],
  });
});

module.exports = router;
