/* ================================================================
   NUCLEAR IDEAS — BOKNINGS-ROUTE (routes/booking.js)
   ================================================================
   ENDPOINTS:
     POST   /api/booking              → Skapa bokning
     GET    /api/booking/times        → ?date=YYYY-MM-DD → lediga tider
     GET    /api/booking/list         → Admin: alla bokningar
     DELETE /api/booking/:id          → Admin: avboka

   DATA:
     Sparas i data/bookings.json (skapas automatiskt).
     Byt mot PostgreSQL/MongoDB via kommentarerna i koden.

   E-POST:
     Kräver EMAIL_* i .env. Använder Nodemailer (Gmail / SMTP).
   ================================================================ */

'use strict';

const express    = require('express');
const router     = express.Router();
const fs         = require('fs');
const path       = require('path');
const crypto     = require('crypto');

/* ---- Datamapp ---- */
const DATA_DIR  = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'bookings.json');

if (!fs.existsSync(DATA_DIR))  fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');

const readAll  = () => JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const writeAll = (d) => fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));

/* ---- Tillgängliga tider (synka med CFG.AVAIL_TIMES i index.html) ---- */
const ALL_TIMES = [
  '09:00','09:30','10:00','10:30',
  '11:00','11:30','13:00','13:30',
  '14:00','14:30','15:00','15:30','16:00',
];

/* ================================================================
   GET /api/booking/times?date=2025-06-20
   Returnerar vilka tider som är bokade ett visst datum.
   ================================================================ */
router.get('/times', (req, res) => {
  const { date } = req.query;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Ange date som YYYY-MM-DD' });
  }

  const booked = readAll()
    .filter(b => b.date === date && b.status !== 'cancelled')
    .map(b => b.time);

  res.json({
    date,
    booked,
    available: ALL_TIMES.filter(t => !booked.includes(t)),
  });
});

/* ================================================================
   POST /api/booking
   Skapar en ny bokning.

   Body:
     { service, date, time, duration, price,
       name, email, phone?, company?, notes?,
       paymentConfirmed? }
   ================================================================ */
router.post('/', async (req, res) => {
  const {
    service, date, time, duration, price,
    name, email, phone, company, notes, paymentConfirmed,
  } = req.body;

  /* Validering */
  const errs = [];
  if (!name  || name.trim().length < 2)                     errs.push('name saknas');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.push('ogiltig email');
  if (!date  || !/^\d{4}-\d{2}-\d{2}$/.test(date))         errs.push('ogiltigt datum');
  if (!time  || !ALL_TIMES.includes(time))                  errs.push('ogiltig tid');
  if (!service)                                             errs.push('service saknas');

  if (errs.length) return res.status(400).json({ error: 'Valideringsfel', details: errs });

  /* Kolla om tid redan är bokad */
  const taken = readAll().some(b => b.date === date && b.time === time && b.status !== 'cancelled');
  if (taken) return res.status(409).json({ error: 'Den valda tiden är redan bokad.' });

  /* Kräv betalning om pris > 0 */
  if (parseInt(price, 10) > 0 && !paymentConfirmed) {
    return res.status(402).json({ error: 'Betalning krävs för denna tjänst.' });
  }

  /* Bygg bokning */
  const booking = {
    id:               crypto.randomBytes(8).toString('hex').toUpperCase(),
    service:          (service || '').trim(),
    date,
    time,
    duration:         parseInt(duration, 10) || 30,
    price:            parseInt(price, 10)    || 0,
    name:             name.trim(),
    email:            email.trim().toLowerCase(),
    phone:            (phone   || '').trim(),
    company:          (company || '').trim(),
    notes:            (notes   || '').trim(),
    paymentConfirmed: Boolean(paymentConfirmed),
    status:           'confirmed',
    createdAt:        new Date().toISOString(),
  };

  /* -------------------------------------------------------
     BYTA TILL DATABAS — PostgreSQL-exempel:
     -------------------------------------------------------
     const { Pool } = require('pg');
     const pool = new Pool({ connectionString: process.env.DATABASE_URL });
     await pool.query(
       `INSERT INTO bookings (id,service,date,time,duration,price,
        name,email,phone,company,notes,payment_confirmed,status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
       [booking.id, booking.service, booking.date, booking.time,
        booking.duration, booking.price, booking.name, booking.email,
        booking.phone, booking.company, booking.notes,
        booking.paymentConfirmed, booking.status]
     );
     ------------------------------------------------------- */
  const all = readAll();
  all.push(booking);
  writeAll(all);

  /* Skicka bekräftelsemejl */
  await sendConfirmation(booking).catch(err =>
    console.warn('[EMAIL] Kunde ej skicka:', err.message)
  );

  console.log(`[BOOKING] ${booking.id} — ${booking.name} — ${date} ${time}`);

  res.status(201).json({
    ok: true,
    id: booking.id,
    message: `Bokning ${booking.id} bekräftad. Bekräftelse skickas till ${booking.email}.`,
  });
});

/* ================================================================
   GET /api/booking/list   (admin)
   Header: X-Admin-Key: <ADMIN_API_KEY>
   Query:  ?date=YYYY-MM-DD  &status=confirmed
   ================================================================ */
router.get('/list', (req, res) => {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Obehörig' });
  }

  let list = readAll();
  if (req.query.date)   list = list.filter(b => b.date   === req.query.date);
  if (req.query.status) list = list.filter(b => b.status === req.query.status);

  res.json({ count: list.length, bookings: list });
});

/* ================================================================
   DELETE /api/booking/:id  (admin)
   Header: X-Admin-Key: <ADMIN_API_KEY>
   ================================================================ */
router.delete('/:id', (req, res) => {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Obehörig' });
  }

  const all = readAll();
  const idx = all.findIndex(b => b.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Bokning hittades inte' });

  all[idx].status      = 'cancelled';
  all[idx].cancelledAt = new Date().toISOString();
  writeAll(all);

  res.json({ ok: true, message: `Bokning ${req.params.id} avbokad.` });
});

/* ================================================================
   E-POST BEKRÄFTELSE
   ================================================================
   Kräver i .env:
     EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, EMAIL_FROM
   ================================================================ */
async function sendConfirmation(b) {
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER) return;

  const nodemailer = require('nodemailer');
  const tr = nodemailer.createTransport({
    host:   process.env.EMAIL_HOST,
    port:   parseInt(process.env.EMAIL_PORT || '587', 10),
    secure: process.env.EMAIL_PORT === '465',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

  const dateStr = new Date(b.date).toLocaleDateString('sv-SE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  /* Till kunden */
  await tr.sendMail({
    from:    process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to:      b.email,
    subject: `Bokningsbekräftelse — ${b.service} | Nuclear Ideas`,
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;background:#06090f;color:#cdd6e8;padding:32px;border:1px solid rgba(5,150,105,0.2)">
        <h1 style="color:#10b981;font-size:1.3rem;margin-bottom:4px">Bokning bekräftad</h1>
        <p style="color:#4b5e78;margin-bottom:20px">ID: <strong style="color:#cdd6e8">${b.id}</strong></p>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.06);color:#4b5e78">Tjänst</td><td style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.06)">${b.service}</td></tr>
          <tr><td style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.06);color:#4b5e78">Datum</td><td style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.06)">${dateStr}</td></tr>
          <tr><td style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.06);color:#4b5e78">Tid</td><td style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.06)">${b.time} (${b.duration} min)</td></tr>
          <tr><td style="padding:9px 0;color:#4b5e78">Pris</td><td style="padding:9px 0">${b.price === 0 ? 'Kostnadsfritt' : b.price + ' kr'}</td></tr>
        </table>
        <p style="margin-top:24px;color:#4b5e78;font-size:0.85rem">
          Frågor? <a href="mailto:${process.env.EMAIL_USER}" style="color:#10b981">${process.env.EMAIL_USER}</a>
        </p>
      </div>`,
  });

  /* Intern notis till dig */
  await tr.sendMail({
    from:    process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to:      process.env.EMAIL_USER,
    subject: `[NY BOKNING] ${b.name} — ${b.date} ${b.time}`,
    html:    `<pre style="font-family:monospace">${JSON.stringify(b, null, 2)}</pre>`,
  });
}

module.exports = router;
