# Nuclear Ideas — Backend

Node.js/Express API för bokningssystem, kontaktformulär och Stripe-betalning.

## Mappstruktur

```
backend/
├── server.js           ← Huvudserver — startas med: node server.js
├── package.json        ← Beroenden
├── .env.example        ← Mall för miljövariabler — kopiera till .env
├── .gitignore          ← .env och node_modules ignoreras automatiskt
├── routes/
│   ├── booking.js      ← POST/GET/DELETE /api/booking
│   ├── contact.js      ← POST/GET /api/contact
│   └── payment.js      ← POST /api/payment/create-intent + webhook
└── data/               ← Skapas automatiskt vid första körning
    ├── bookings.json
    └── contacts.json
```

---

## Lokal körning

```bash
# 1. Gå till backend-mappen
cd backend

# 2. Installera beroenden
npm install

# 3. Skapa .env
cp .env.example .env
# Öppna .env och fyll i dina nycklar

# 4. Starta servern
node server.js

# Alternativ: auto-restart vid filändringar (bra under utveckling)
npm run dev
```

Servern startar på `http://localhost:3000`.
Testa att den fungerar: `http://localhost:3000/health`

---

## Koppla ihop med frontend (index.html)

Öppna `index.html` och ändra `CFG.API_URL`:

```javascript
const CFG = {
  API_URL: 'http://localhost:3000',  // lokalt
  // API_URL: 'https://din-server.railway.app',  // produktion
  ...
};
```

---

## Deploy på Railway (rekommenderat — gratis)

Railway är enklaste alternativet och har en generös gratis-nivå.

**Steg 1 — Skapa konto**
Gå till [railway.app](https://railway.app) och logga in med GitHub.

**Steg 2 — Skapa projekt**
- Klicka "New Project"
- Välj "Deploy from GitHub repo"
- Välj ditt repo
- Välj `backend`-mappen som root directory (om din repo ser ut så här):
  ```
  ditt-repo/
  ├── index.html
  └── backend/
      ├── server.js
      └── package.json
  ```
  Railway hittar `package.json` automatiskt.

**Steg 3 — Lägg till miljövariabler**
I Railway-dashboarden:
- Gå till ditt projekt → Variables
- Klicka "New Variable" och lägg till allt från `.env.example`:
  ```
  NODE_ENV=production
  PORT=3000
  STRIPE_SECRET_KEY=sk_live_...
  EMAIL_HOST=smtp.gmail.com
  EMAIL_PORT=587
  EMAIL_USER=hej@nuclear-ideas.se
  EMAIL_PASS=...
  ADMIN_API_KEY=...
  ```

**Steg 4 — Hämta din URL**
Railway ger dig en URL typ: `https://nuclear-ideas-backend-production.up.railway.app`

**Steg 5 — Uppdatera frontend**
I `index.html`, ändra CFG.API_URL:
```javascript
API_URL: 'https://nuclear-ideas-backend-production.up.railway.app',
```

---

## Deploy på Render (alternativ — gratis)

**Steg 1** — Gå till [render.com](https://render.com) → "New Web Service"

**Steg 2** — Koppla ditt GitHub-repo.

**Steg 3** — Inställningar:
- **Root Directory:** `backend`
- **Build Command:** `npm install`
- **Start Command:** `node server.js`
- **Environment:** Node

**Steg 4** — Lägg till miljövariabler under "Environment".

**OBS:** Render sover av gratis-tjänster efter 15 min inaktivitet.
För att undvika detta, använd Railway eller uppgradera Render.

---

## Deploy på Fly.io (avancerat — mest pålitligt)

```bash
# Installera fly CLI
curl -L https://fly.io/install.sh | sh

# Logga in
fly auth login

# Gå till backend-mappen
cd backend

# Starta projekt
fly launch
# Välj region: arn (Stockholm) eller lhr (London)

# Lägg till hemligheter
fly secrets set NODE_ENV=production
fly secrets set STRIPE_SECRET_KEY=sk_live_XXXX
fly secrets set EMAIL_USER=hej@nuclear-ideas.se
fly secrets set EMAIL_PASS=xxxx
fly secrets set ADMIN_API_KEY=xxxx

# Deploya
fly deploy
```

---

## API-referens

### POST /api/booking
Skapar en ny bokning.

```json
{
  "service": "consultation",
  "date": "2025-06-20",
  "time": "10:00",
  "duration": 30,
  "price": 0,
  "name": "Maria Hansson",
  "email": "maria@foretag.se",
  "phone": "070-123 45 67",
  "company": "Ditt AB",
  "notes": "Vill diskutera en ny hemsida",
  "paymentConfirmed": false
}
```

Svar: `{ ok: true, id: "ABC123", message: "..." }`

---

### GET /api/booking/times?date=2025-06-20
Returnerar bokade tider.

Svar: `{ date, booked: ["09:00","10:30"], available: [...] }`

---

### POST /api/contact
Skickar kontaktformulär.

```json
{
  "name": "Karl Svensson",
  "email": "karl@foretag.se",
  "subject": "Fråga om webbshop",
  "message": "Hej, jag undrar..."
}
```

Svar: `{ ok: true, id: "MSG-ABC" }`

---

### POST /api/payment/create-intent
Skapar Stripe PaymentIntent.

```json
{
  "amount": 500,
  "currency": "sek",
  "metadata": { "service": "Projektstart", "name": "Karl", "email": "karl@..." }
}
```

Svar: `{ clientSecret: "pi_xxx_secret_xxx", paymentIntentId: "pi_xxx" }`

---

### GET /api/booking/list (Admin)
Header: `X-Admin-Key: <ADMIN_API_KEY>`

### DELETE /api/booking/:id (Admin)
Header: `X-Admin-Key: <ADMIN_API_KEY>`

---

## Aktivera Stripe-betalning i frontend

1. Lägg till i `<head>` i `index.html`:
   ```html
   <script src="https://js.stripe.com/v3/"></script>
   ```

2. Uppdatera `CFG.STRIPE_PK` i `index.html`:
   ```javascript
   STRIPE_PK: 'pk_live_XXXXXXXXXXXXXXXXXX',
   ```

3. Testkortnummer: `4242 4242 4242 4242` (valfritt datum/CVC)

---

## Aktivera Klarna

1. Stripe Dashboard → Settings → Payment methods → Klarna → Aktivera
2. I `routes/payment.js`, avkommentera `'klarna'` i `payment_method_types`
3. Restart servern

---

## Aktivera e-post (Gmail)

1. Gå till [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
2. Skapa ett "App-lösenord" för Mail
3. Lägg in i `.env`:
   ```
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USER=din@gmail.com
   EMAIL_PASS=xxxx-xxxx-xxxx-xxxx
   ```
