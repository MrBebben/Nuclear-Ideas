/* ================================================================
   NUCLEAR IDEAS — SERVER (server.js)
   ================================================================
   Startar Express-servern och monterar alla routes.

   SNABBSTART:
     cd backend
     npm install
     cp .env.example .env     ← fyll i dina nycklar
     node server.js

   PRODUKTION (Railway / Render / Fly.io):
     Sätt NODE_ENV=production i miljövariabler.
     Se README.md för fullständiga deploy-instruktioner.
   ================================================================ */

'use strict';

const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

/* ---- Routes ---- */
const bookingRoute = require('./routes/booking');
const contactRoute = require('./routes/contact');
const paymentRoute = require('./routes/payment');

/* ================================================================
   KONFIGURATION
   ================================================================ */
const PORT = process.env.PORT || 3000;

/* Lägg till din produktionsdomain här */
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  // 'https://nuclear-ideas.se',        ← lägg till din domän
  // 'https://dittnamn.github.io',      ← eller GitHub Pages URL
];

/* ================================================================
   APP-SETUP
   ================================================================ */
const app = express();

/* Säkerhetshuvuden */
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

/* CORS */
app.use(cors({
  origin(origin, cb) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blockerat: ${origin}`));
  },
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  credentials: true,
}));

/* Body-parsers */
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

/* Loggning */
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

/* Rate limiting (globalt) */
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'För många förfrågningar. Försök igen om en stund.' },
}));

/* Strängare limit för formulär */
const formLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 25,
  message: { error: 'För många inskickningar. Försök om en timme.' },
});

/* ================================================================
   ROUTES
   ================================================================ */
app.use('/api/booking', formLimit, bookingRoute);
app.use('/api/contact', formLimit, contactRoute);
app.use('/api/payment', paymentRoute);

/* Hälsokontroll — används av hosting-plattformar */
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    env: process.env.NODE_ENV || 'development',
    time: new Date().toISOString(),
  });
});

/* 404 */
app.use((req, res) => {
  res.status(404).json({ error: `Route hittades inte: ${req.method} ${req.path}` });
});

/* Felhantering */
app.use((err, _req, res, _next) => {
  console.error('[SERVER ERROR]', err.message);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: process.env.NODE_ENV === 'production' ? 'Serverfel' : err.message,
  });
});

/* ================================================================
   STARTA
   ================================================================ */
app.listen(PORT, () => {
  console.log('\n  ╔═══════════════════════════════╗');
  console.log('  ║   Nuclear Ideas Backend       ║');
  console.log(`  ║   http://localhost:${PORT}        ║`);
  console.log(`  ║   Miljö: ${(process.env.NODE_ENV || 'development').padEnd(22)}║`);
  console.log('  ╚═══════════════════════════════╝\n');
});

module.exports = app;
