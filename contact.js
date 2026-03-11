/* ================================================================
   NUCLEAR IDEAS — KONTAKT-ROUTE (routes/contact.js)
   ================================================================
   ENDPOINTS:
     POST /api/contact        → Spara + skicka kontaktformulär
     GET  /api/contact/list   → Admin: alla meddelanden
   ================================================================ */

'use strict';

const express    = require('express');
const router     = express.Router();
const fs         = require('fs');
const path       = require('path');
const crypto     = require('crypto');

/* ---- Datamapp ---- */
const DATA_DIR  = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'contacts.json');

if (!fs.existsSync(DATA_DIR))  fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');

const readAll  = () => JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const writeAll = (d) => fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));

/* ================================================================
   POST /api/contact
   Body: { name, email, subject?, message }
   ================================================================ */
router.post('/', async (req, res) => {
  const { name, email, subject, message } = req.body;

  const errs = [];
  if (!name    || name.trim().length < 2)                     errs.push('name saknas');
  if (!email   || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.push('ogiltig email');
  if (!message || message.trim().length < 5)                  errs.push('message saknas');

  if (errs.length) return res.status(400).json({ error: 'Valideringsfel', details: errs });

  const contact = {
    id:        crypto.randomBytes(6).toString('hex').toUpperCase(),
    name:      name.trim(),
    email:     email.trim().toLowerCase(),
    subject:   (subject || '').trim(),
    message:   message.trim(),
    createdAt: new Date().toISOString(),
    read:      false,
  };

  const all = readAll();
  all.push(contact);
  writeAll(all);

  /* Skicka mejl om konfigurerat */
  if (process.env.EMAIL_HOST && process.env.EMAIL_USER) {
    try {
      const nodemailer = require('nodemailer');
      const tr = nodemailer.createTransport({
        host:   process.env.EMAIL_HOST,
        port:   parseInt(process.env.EMAIL_PORT || '587', 10),
        secure: process.env.EMAIL_PORT === '465',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      });
      await tr.sendMail({
        from:    process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to:      process.env.EMAIL_USER,
        replyTo: contact.email,
        subject: `[KONTAKT ${contact.id}] ${contact.subject || 'Ny förfrågan'} — ${contact.name}`,
        html: `
          <div style="font-family:monospace;background:#06090f;color:#cdd6e8;padding:24px">
            <p><b style="color:#a78bfa">Från:</b> ${contact.name} &lt;${contact.email}&gt;</p>
            <p><b style="color:#a78bfa">ID:</b> ${contact.id}</p>
            <p><b style="color:#a78bfa">Ämne:</b> ${contact.subject || '—'}</p>
            <hr style="border-color:rgba(255,255,255,0.08);margin:16px 0"/>
            <p style="line-height:1.7">${contact.message.replace(/\n/g, '<br>')}</p>
          </div>`,
      });
    } catch (err) {
      console.warn('[EMAIL] Kontaktmejl misslyckades:', err.message);
    }
  }

  console.log(`[CONTACT] ${contact.id} — ${contact.name} — ${contact.email}`);
  res.status(201).json({ ok: true, id: contact.id });
});

/* ================================================================
   GET /api/contact/list  (admin)
   Header: X-Admin-Key: <ADMIN_API_KEY>
   ================================================================ */
router.get('/list', (req, res) => {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Obehörig' });
  }
  const all = readAll();
  res.json({ count: all.length, contacts: all });
});

module.exports = router;
