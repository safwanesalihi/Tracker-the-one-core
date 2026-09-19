
import { computeTotals } from "@/lib/documents";

import { RecordItem, LineItem } from "@/lib/model";
export function printDocumentHtml(doc: Partial<RecordItem>, _logoBase64?: string) {
  const { subtotal, total, taxAmount } = computeTotals(doc.lineItems, doc.taxRate);
  
  const clientName = doc.counterparty || '';
  const dateStr = doc.issuedAt ? new Date(doc.issuedAt).toLocaleDateString('fr-FR') : '—';
  const dueStr = doc.dueAt ? new Date(doc.dueAt).toLocaleDateString('fr-FR') : '—';
  const docNum = (typeof doc.number === "object" && doc.number !== null ? (doc.number as { number?: string }).number : doc.number) || '';
  const docLabel = doc.docType === 'devis' ? 'Devis' : 'Facture';

  let itemsHtml = '';
  ((doc.lineItems as LineItem[]) || []).forEach((item: LineItem, i: number) => {
    const lineTotal = item.quantity * item.unitPrice;
    itemsHtml += `
      <tr>
        <td>${item.description}</td>
        <td>${item.quantity}</td>
        <td>${item.unitPrice.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td>${lineTotal.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>
    `;
  });

  const tvaMode = (doc.taxRate && doc.taxRate > 0) ? 'custom' : 'none';

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@600;700;800;900&display=swap');
  ${String.raw`
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --gold: #B8962E; --gold-light: #D4AF5A; --gold-bright: #E8C76F; --gold-deep: #8E6928; --gold-bg: #F5EDD8;
    --black: #0A0A0A; --dark: #1A1A1A; --ink: #14171F;
    --gray: #6B7280; --gray-light: #9CA3AF; --gray-soft: #E5E7EB;
    --light: #FAF8F2; --bg: #F5F1E8; --white: #FFFFFF;
    --border: rgba(184,150,46,0.18); --border-soft: rgba(20,23,31,0.06);
    --grad-gold: linear-gradient(135deg, #E8C76F 0%, #B8962E 50%, #8E6928 100%);
    --grad-dark: linear-gradient(135deg, #1A1A1A 0%, #0A0A0A 100%);
    --shadow-sm: 0 1px 2px rgba(20,23,31,0.04);
    --shadow: 0 4px 16px rgba(20,23,31,0.06), 0 1px 2px rgba(20,23,31,0.04);
    --shadow-lg: 0 12px 32px rgba(20,23,31,0.08), 0 2px 6px rgba(20,23,31,0.04);
    --shadow-gold: 0 6px 24px rgba(184,150,46,0.25);
    --radius-sm: 8px; --radius: 14px; --radius-lg: 20px;
    --ease: cubic-bezier(0.4, 0, 0.2, 1);
    --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  html { scroll-behavior: smooth; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    color: var(--ink); min-height: 100vh; line-height: 1.5;
    -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
    background: var(--bg); position: relative; overflow-x: hidden;
  }
  body::before {
    content: ''; position: fixed; inset: 0; z-index: -1;
    background:
      radial-gradient(at 12% 8%,  rgba(232,199,111,0.28) 0px, transparent 45%),
      radial-gradient(at 88% 12%, rgba(212,175,90,0.22) 0px, transparent 50%),
      radial-gradient(at 90% 85%, rgba(184,150,46,0.18) 0px, transparent 50%),
      radial-gradient(at 8% 92%,  rgba(245,237,216,0.55) 0px, transparent 50%),
      radial-gradient(at 50% 50%, rgba(255,255,255,0.4) 0px, transparent 60%),
      linear-gradient(180deg, #F8F4EA 0%, #F1EBDA 100%);
    pointer-events: none;
  }
  body::after {
    content: ''; position: fixed; inset: 0; z-index: -1;
    background-image: radial-gradient(circle at 1px 1px, rgba(20,23,31,0.04) 1px, transparent 0);
    background-size: 32px 32px; pointer-events: none; opacity: 0.6;
  }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(184,150,46,0.3); border-radius: 5px; border: 2px solid transparent; background-clip: padding-box; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(184,150,46,0.6); border: 2px solid transparent; background-clip: padding-box; }
  ::selection { background: var(--gold-bright); color: var(--black); }

  /* DARK MODE (editor only — document stays light for PDF) */
  html[data-theme="dark"] {
    --ink: #F1EBDA; --gray: #A8A29E; --gray-light: #78716C; --gray-soft: #2A2A2E;
    --light: #1C1C1F; --bg: #0E0E10; --white: #18181B;
    --border: rgba(184,150,46,0.22); --border-soft: rgba(255,255,255,0.08);
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.4);
    --shadow: 0 4px 16px rgba(0,0,0,0.45), 0 1px 2px rgba(0,0,0,0.3);
    --shadow-lg: 0 12px 32px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.35);
  }
  html[data-theme="dark"] body::before {
    background:
      radial-gradient(at 12% 8%,  rgba(232,199,111,0.14) 0px, transparent 45%),
      radial-gradient(at 88% 12%, rgba(212,175,90,0.10) 0px, transparent 50%),
      radial-gradient(at 90% 85%, rgba(184,150,46,0.10) 0px, transparent 50%),
      radial-gradient(at 8% 92%,  rgba(60,40,15,0.5) 0px, transparent 50%),
      radial-gradient(at 50% 50%, rgba(30,28,24,0.6) 0px, transparent 60%),
      linear-gradient(180deg, #14120E 0%, #0A0A0C 100%);
  }
  html[data-theme="dark"] body::after { background-image: radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0); opacity: 0.5; }

  /* TOPBAR */
  .topbar {
    background: rgba(10,10,10,0.85);
    backdrop-filter: saturate(180%) blur(18px); -webkit-backdrop-filter: saturate(180%) blur(18px);
    padding: 14px 28px; display: flex; justify-content: space-between; align-items: center;
    position: sticky; top: 0; z-index: 50;
    border-bottom: 1px solid rgba(184,150,46,0.25);
    box-shadow: 0 1px 0 rgba(184,150,46,0.15), 0 8px 24px rgba(0,0,0,0.08);
  }
  .topbar h1 {
    font-family: 'Plus Jakarta Sans', 'Inter', sans-serif;
    font-size: 18px; font-weight: 800;
    background: var(--grad-gold); -webkit-background-clip: text; background-clip: text; color: transparent;
    letter-spacing: 0.5px; display: flex; align-items: center; gap: 12px;
  }
  .topbar h1::before {
    content: ''; width: 10px; height: 10px; border-radius: 50%;
    background: var(--grad-gold); box-shadow: 0 0 12px rgba(232,199,111,0.7);
    -webkit-text-fill-color: initial; animation: pulse 2.5s ease-in-out infinite;
  }
  @keyframes pulse { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.25); opacity: 0.7; } }
  .topbar h1 span {
    -webkit-text-fill-color: rgba(255,255,255,0.55); background: none;
    font-weight: 500; letter-spacing: 1px; font-size: 11px; text-transform: uppercase;
    padding-left: 12px; border-left: 1px solid rgba(255,255,255,0.15);
  }
  .topbar-actions { display: flex; gap: 8px; align-items: center; }
  .tbtn {
    background: rgba(255,255,255,0.04); color: var(--gold-light);
    border: 1px solid rgba(184,150,46,0.3); padding: 9px 16px; border-radius: 10px;
    font-size: 11.5px; font-weight: 700; font-family: inherit; cursor: pointer;
    letter-spacing: 0.5px; text-transform: uppercase;
    transition: all 0.18s var(--ease); position: relative; overflow: hidden;
  }
  .tbtn::before { content: ''; position: absolute; inset: 0; background: var(--grad-gold); opacity: 0; transition: opacity 0.18s var(--ease); z-index: -1; }
  .tbtn:hover { color: var(--black); border-color: var(--gold-bright); transform: translateY(-1px); box-shadow: 0 6px 16px rgba(184,150,46,0.4); }
  .tbtn:hover::before { opacity: 1; }
  .tbtn:active { transform: translateY(0); }
  .tbtn.primary { background: var(--grad-gold); color: #0A0A0A; border-color: transparent; }
  .tbtn.primary::before { background: linear-gradient(135deg, #F5EDD8 0%, #E8C76F 100%); }
  .tbtn.primary:hover { box-shadow: var(--shadow-gold); }
  .tbtn.ghost:hover { color: #FCA5A5; border-color: rgba(239,68,68,0.4); }
  .tbtn.ghost::before { background: linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(185,28,28,0.15) 100%); }

  .theme-toggle {
    background: rgba(255,255,255,0.04); border: 1px solid rgba(184,150,46,0.3);
    width: 38px; height: 38px; border-radius: 10px; cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center;
    color: var(--gold-light); transition: all 0.22s var(--ease);
  }
  .theme-toggle:hover { transform: translateY(-1px); border-color: var(--gold-bright); box-shadow: 0 6px 16px rgba(184,150,46,0.3); color: var(--gold-bright); }
  .theme-toggle svg { width: 18px; height: 18px; transition: transform 0.4s var(--ease-bounce); }
  .theme-toggle .icon-sun { display: none; }
  html[data-theme="dark"] .theme-toggle .icon-sun { display: block; }
  html[data-theme="dark"] .theme-toggle .icon-moon { display: none; }
  .theme-toggle:hover svg { transform: rotate(20deg) scale(1.1); }

  /* MOBILE TABS */
  .mobile-tabs {
    display: none; background: rgba(255,255,255,0.65);
    backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
    border-bottom: 1px solid var(--border-soft); padding: 8px 16px; gap: 4px;
    position: sticky; top: 67px; z-index: 40;
  }
  html[data-theme="dark"] .mobile-tabs { background: rgba(24,24,27,0.7); border-bottom-color: rgba(255,255,255,0.06); }
  .mtab { flex: 1; padding: 10px; border: none; background: none; color: var(--gray); font-size: 12.5px; font-weight: 600; cursor: pointer; border-radius: 8px; font-family: inherit; transition: all 0.2s var(--ease); }
  .mtab.active { color: var(--white); background: var(--grad-dark); }
  html[data-theme="dark"] .mtab.active { background: var(--grad-gold); color: var(--black); }

  /* APP SHELL */
  .app { display: grid; grid-template-columns: 400px 1fr; min-height: calc(100vh - 67px); }

  /* SIDEBAR */
  .sidebar {
    background: rgba(255,255,255,0.65);
    backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
    border-right: 1px solid var(--border-soft);
    height: calc(100vh - 67px); position: sticky; top: 67px;
    display: flex; flex-direction: column; min-width: 0;
  }
  html[data-theme="dark"] .sidebar { background: rgba(24,24,27,0.7); border-right-color: rgba(255,255,255,0.06); }
  .sidebar-body { padding: 22px 22px 20px; flex: 1; overflow-y: auto; overflow-x: hidden; }

  .section-title {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 10px; font-weight: 800; letter-spacing: 2px;
    text-transform: uppercase; color: var(--gold);
    margin: 22px 0 12px; display: flex; align-items: center; gap: 10px;
  }
  .section-title:first-child { margin-top: 0; }
  .section-title::before { content: ''; width: 4px; height: 14px; background: var(--grad-gold); border-radius: 2px; }
  .section-title::after { content: ''; flex: 1; height: 1px; background: linear-gradient(to right, var(--border) 0%, transparent 100%); }

  .field { margin-bottom: 12px; }
  .field label {
    display: block; font-size: 10px; font-weight: 700; color: var(--gray);
    margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1.2px;
  }
  .field input, .field textarea, .field select {
    width: 100%; padding: 10px 12px; border: 1.5px solid var(--gray-soft);
    border-radius: 10px; font-size: 13px; color: var(--ink); background: var(--white);
    font-family: inherit; outline: none; transition: all 0.18s var(--ease);
  }
  .field textarea { resize: vertical; min-height: 60px; line-height: 1.5; }
  .field input:focus, .field textarea:focus, .field select:focus {
    border-color: var(--gold); box-shadow: 0 0 0 4px rgba(184,150,46,0.12);
  }
  html[data-theme="dark"] .field input, html[data-theme="dark"] .field textarea, html[data-theme="dark"] .field select {
    background: #0E0E10; color: var(--ink); border-color: rgba(255,255,255,0.1);
  }
  html[data-theme="dark"] .field input:focus, html[data-theme="dark"] .field textarea:focus, html[data-theme="dark"] .field select:focus {
    background: #14141A; border-color: var(--gold);
  }
  .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

  /* Items editor */
  .items-list { display: flex; flex-direction: column; gap: 10px; }
  .item-row {
    background: rgba(255,255,255,0.5);
    border: 1px solid var(--border-soft);
    border-radius: 12px;
    padding: 12px 12px 12px 14px;
    padding-right: 36px;
    position: relative;
    transition: all 0.2s var(--ease);
  }
  html[data-theme="dark"] .item-row { background: rgba(255,255,255,0.04); }
  .item-row:hover { border-color: rgba(184,150,46,0.25); }
  .item-row .item-desc {
    width: 100%; padding: 8px 10px; border: 1px solid var(--gray-soft);
    border-radius: 8px; font-size: 13px; margin-bottom: 8px;
    font-family: inherit; background: var(--white); transition: all 0.15s var(--ease);
  }
  html[data-theme="dark"] .item-row .item-desc { background: #0E0E10; color: var(--ink); border-color: rgba(255,255,255,0.1); }
  .item-row .item-desc:focus { outline: none; border-color: var(--gold); box-shadow: 0 0 0 3px rgba(184,150,46,0.1); }
  .item-nums { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 8px; }
  .item-nums.single { grid-template-columns: 1fr; }
  .item-nums input {
    padding: 8px 10px; border: 1px solid var(--gray-soft); border-radius: 8px;
    font-size: 12px; text-align: right; font-family: inherit; background: var(--white);
    color: var(--ink); transition: all 0.15s var(--ease); width: 100%;
  }
  html[data-theme="dark"] .item-nums input { background: #0E0E10; border-color: rgba(255,255,255,0.1); }
  .item-nums input:focus { outline: none; border-color: var(--gold); box-shadow: 0 0 0 3px rgba(184,150,46,0.1); }
  /* Total row — full width */
  .item-total-row { width: 100%; }
  .item-total-row input {
    width: 100%; padding: 9px 12px; border: 1.5px solid rgba(184,150,46,0.45);
    border-radius: 8px; font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 14px; font-weight: 800; text-align: right;
    background: linear-gradient(135deg, rgba(232,199,111,0.2) 0%, rgba(184,150,46,0.2) 100%);
    color: var(--gold-deep); transition: all 0.15s var(--ease);
  }
  html[data-theme="dark"] .item-total-row input { color: var(--gold-bright); }
  .item-total-row input:focus { outline: none; border-color: var(--gold); box-shadow: 0 0 0 3px rgba(184,150,46,0.15); }
  .item-total-row input[readonly] { cursor: default; }
  .item-label { font-size: 9px; color: var(--gray-light); text-align: center; margin-top: 4px; font-weight: 600; letter-spacing: 0.3px; }
  .btn-remove-item {
    position: absolute; top: 10px; right: 10px;
    background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2);
    width: 22px; height: 22px; cursor: pointer; color: #EF4444;
    font-size: 14px; line-height: 1; padding: 0; border-radius: 6px;
    display: inline-flex; align-items: center; justify-content: center;
    transition: all 0.15s var(--ease);
  }
  .btn-remove-item:hover { background: #EF4444; color: #FFF; transform: scale(1.1); }

  .btn-add-item {
    width: 100%; padding: 11px; border: 1.5px dashed rgba(184,150,46,0.4);
    background: rgba(184,150,46,0.05); border-radius: 10px;
    color: var(--gold); font-size: 12.5px; font-weight: 700; letter-spacing: 0.5px;
    cursor: pointer; margin-top: 8px; font-family: inherit;
    transition: all 0.18s var(--ease);
  }
  .btn-add-item:hover { background: rgba(184,150,46,0.12); border-color: var(--gold); transform: translateY(-1px); }

  /* Toggle */
  .toggle-wrap { display: flex; gap: 4px; background: var(--gray-soft); padding: 3px; border-radius: 10px; }
  html[data-theme="dark"] .toggle-wrap { background: rgba(255,255,255,0.05); }
  .toggle-btn {
    flex: 1; padding: 8px 4px; border: none; background: transparent; border-radius: 7px;
    font-size: 11px; font-weight: 700; cursor: pointer; color: var(--gray);
    font-family: inherit; transition: all 0.2s var(--ease); letter-spacing: 0.2px;
  }
  .toggle-btn:hover { color: var(--ink); }
  .toggle-btn.active {
    background: var(--grad-gold); color: var(--black);
    box-shadow: var(--shadow-gold), inset 0 1px 0 rgba(255,255,255,0.3);
  }

  /* Number controls */
  .num-controls { display: flex; gap: 6px; margin-top: 8px; }
  .num-ctrl-btn {
    flex: 1; padding: 7px 6px; border: 1.5px solid var(--gray-soft); background: var(--white);
    border-radius: 8px; font-size: 10px; font-weight: 700; cursor: pointer;
    color: var(--gray); font-family: inherit; letter-spacing: 0.3px;
    transition: all 0.16s var(--ease);
  }
  .num-ctrl-btn:hover { border-color: var(--gold); color: var(--gold); background: rgba(184,150,46,0.08); }
  .num-ctrl-btn.danger:hover { border-color: #EF4444; color: #EF4444; background: rgba(239,68,68,0.08); }
  html[data-theme="dark"] .num-ctrl-btn { background: #0E0E10; border-color: rgba(255,255,255,0.1); }

  /* PREVIEW AREA */
  .preview-area {
    padding: 40px 32px; display: flex; flex-direction: column; align-items: center;
    overflow-y: auto;
  }
  .preview-info {
    width: 100%; max-width: 820px;
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 22px; padding: 0 4px;
  }
  .preview-info h2 {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 15px; font-weight: 700; color: var(--ink); letter-spacing: -0.2px;
  }
  .preview-info span {
    font-size: 11px; color: var(--gray); display: inline-flex; align-items: center; gap: 6px;
  }
  .preview-info span::before {
    content: ''; width: 6px; height: 6px; border-radius: 50%; background: #10B981;
    box-shadow: 0 0 8px rgba(16,185,129,0.5); animation: pulse 2s ease-in-out infinite;
  }

  /* ===== INVOICE DOCUMENT (light always, for PDF) ===== */
  .invoice-scaler { width: auto; }
  .invoice {
    width: 800px; background: #FFFFFF;
    box-shadow: 0 20px 60px rgba(20,23,31,0.12), 0 6px 20px rgba(20,23,31,0.08);
    border-radius: 16px; overflow: hidden;
    font-family: 'Inter', system-ui, sans-serif; color: #14171F;
    position: relative;
  }

  /* Invoice Header */
  .inv-header {
    background: linear-gradient(135deg, #0F0F12 0%, #050508 100%);
    padding: 32px 44px; display: flex; justify-content: space-between; align-items: center;
    position: relative; overflow: hidden;
  }
  .inv-header::before {
    content: ''; position: absolute; top: -50%; right: -10%; width: 60%; height: 200%;
    background: radial-gradient(ellipse at center, rgba(184,150,46,0.18) 0%, transparent 60%);
    pointer-events: none;
  }
  .inv-logo { position: relative; display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
  .inv-logo svg { height: 70px; width: auto; display: block; }
  .inv-logo .inv-legal-id {
    font-size: 10.5px; color: rgba(255,255,255,0.72); letter-spacing: 0.4px; line-height: 1.5;
  }
  .inv-logo .inv-legal-id strong { color: var(--gold-bright); font-weight: 700; }
  .inv-title-block { text-align: right; position: relative; }
  .inv-title-block .inv-label {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 30px; font-weight: 900;
    background: linear-gradient(135deg, #F5EDD8 0%, #E8C76F 50%, #B8962E 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent;
    letter-spacing: 4px; line-height: 1;
  }
  .inv-title-block .inv-number {
    font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.7);
    letter-spacing: 1px; margin-top: 8px;
    display: inline-flex; align-items: center; gap: 8px;
    padding: 4px 12px; background: rgba(255,255,255,0.06); border-radius: 99px;
    border: 1px solid rgba(184,150,46,0.25);
  }
  .inv-title-block .inv-number strong { color: #E8C76F; font-weight: 700; }

  /* Body */
  .inv-body { padding: 36px 44px; }

  /* Meta */
  .inv-meta { display: grid; grid-template-columns: 1.4fr 1fr; gap: 28px; margin-bottom: 36px; }
  .inv-client {
    background: linear-gradient(135deg, #FBFAF6 0%, #F5EDD8 100%);
    border-radius: 12px; padding: 20px 22px; border: 1px solid rgba(184,150,46,0.15);
    position: relative;
  }
  .inv-client::before {
    content: ''; position: absolute; top: 18px; left: 22px; width: 28px; height: 2px;
    background: var(--grad-gold); border-radius: 1px;
  }
  .inv-client h3 {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 10px; font-weight: 800; color: var(--gold-deep);
    letter-spacing: 2px; text-transform: uppercase; margin-bottom: 14px; margin-top: 10px;
  }
  .inv-client p { font-size: 13px; color: #14171F; line-height: 1.8; }
  .inv-client p span { color: var(--gray); font-weight: 500; }
  .inv-client p strong { font-weight: 600; }
  .inv-dates {
    background: linear-gradient(135deg, #0F0F12 0%, #1A1A1F 100%);
    color: #F1EBDA; border-radius: 12px; padding: 20px 22px;
    box-shadow: 0 8px 20px rgba(0,0,0,0.1);
  }
  .inv-dates h3 {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 10px; font-weight: 800; color: var(--gold-bright);
    letter-spacing: 2px; text-transform: uppercase; margin-bottom: 14px;
  }
  .inv-dates p { font-size: 13px; line-height: 1.9; display: flex; justify-content: space-between; }
  .inv-dates strong { font-weight: 700; color: var(--gold-bright); }
  .inv-dates p span { color: #FFF; font-weight: 600; }

  /* Table */
  .inv-table {
    width: 100%; border-collapse: separate; border-spacing: 0;
    margin-bottom: 28px; border-radius: 12px; overflow: hidden;
    box-shadow: 0 4px 12px rgba(20,23,31,0.04);
  }
  .inv-table thead tr {
    background: var(--grad-gold);
  }
  .inv-table thead th {
    padding: 14px 16px;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 11px; font-weight: 800; color: #0A0A0A;
    text-align: left; letter-spacing: 1px; text-transform: uppercase;
  }
  .inv-table thead th:not(:first-child) { text-align: center; }
  .inv-table thead th:last-child { text-align: right; }
  .inv-table tbody tr { border-bottom: 1px solid #F0EBE0; background: #FFFFFF; transition: background 0.15s ease; }
  .inv-table tbody tr:nth-child(even) { background: #FBFAF6; }
  .inv-table tbody tr:last-child { border-bottom: none; }
  .inv-table tbody td { padding: 14px 16px; font-size: 13px; color: #14171F; }
  .inv-table tbody td:first-child { font-weight: 500; }
  .inv-table tbody td:not(:first-child) { text-align: center; color: var(--gray); }
  .inv-table tbody td:last-child { text-align: right; font-weight: 700; color: #14171F; font-family: 'Plus Jakarta Sans', sans-serif; }
  .inv-table tbody tr.empty-row td {
    color: var(--gray-light); font-style: italic; text-align: center; padding: 28px;
    font-weight: 500; background: #FBFAF6;
  }

  /* Bottom */
  .inv-bottom { display: grid; grid-template-columns: 1fr 320px; gap: 28px; align-items: flex-start; }
  .inv-notes {
    background: #FBFAF6; border-left: 3px solid var(--gold);
    padding: 18px 20px; border-radius: 0 10px 10px 0;
  }
  .inv-notes p { font-size: 12px; color: #14171F; line-height: 1.7; }
  .inv-notes .note-label {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-weight: 800; font-size: 11px; margin-bottom: 6px;
    color: var(--gold-deep); letter-spacing: 1px; text-transform: uppercase;
  }
  .inv-notes .pay-label {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-weight: 800; font-size: 11px; margin: 14px 0 4px;
    color: var(--gold-deep); letter-spacing: 1px; text-transform: uppercase;
  }
  .inv-totals { display: flex; flex-direction: column; gap: 4px; }
  .totals-row {
    display: flex; justify-content: space-between; padding: 10px 16px;
    border-radius: 8px; background: #FBFAF6; align-items: center;
  }
  .totals-row .t-label {
    font-size: 11.5px; font-weight: 600; color: var(--gray);
    letter-spacing: 0.5px; text-transform: uppercase;
  }
  .totals-row .t-value {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 14px; font-weight: 700; color: #14171F;
  }
  .totals-row.tva { background: rgba(184,150,46,0.08); }
  .totals-row.tva .t-label { color: var(--gold-deep); }
  .totals-row.total-final {
    background: linear-gradient(135deg, #0F0F12 0%, #050508 100%);
    padding: 16px 18px; margin-top: 8px; position: relative; overflow: hidden;
    box-shadow: 0 8px 20px rgba(0,0,0,0.15);
  }
  .totals-row.total-final::before {
    content: ''; position: absolute; top: 0; right: 0; width: 100%; height: 2px;
    background: var(--grad-gold);
  }
  .totals-row.total-final .t-label {
    color: rgba(255,255,255,0.6); font-size: 11px; font-weight: 800;
  }
  .totals-row.total-final .t-value {
    background: var(--grad-gold); -webkit-background-clip: text; background-clip: text;
    color: transparent; font-size: 22px; font-weight: 900; letter-spacing: -0.5px;
  }

  /* Footer */
  .inv-footer {
    background: linear-gradient(135deg, #0F0F12 0%, #050508 100%);
    padding: 18px 44px; display: flex; justify-content: space-between; align-items: center;
    flex-wrap: wrap; gap: 12px; margin-top: 36px; position: relative; overflow: hidden;
  }
  .inv-footer::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
    background: linear-gradient(to right, transparent 0%, var(--gold) 50%, transparent 100%);
  }
  .inv-footer .contact-item {
    display: flex; align-items: center; gap: 8px; color: rgba(255,255,255,0.75); font-size: 11px;
  }
  .inv-footer .contact-item svg { width: 14px; height: 14px; fill: var(--gold-bright); flex-shrink: 0; }

  /* RESPONSIVE */
  @media (max-width: 980px) {
    .mobile-tabs { display: flex; }
    .app { grid-template-columns: 1fr; min-height: auto; }
    .sidebar { position: static; height: auto; max-height: none; border-right: none; border-bottom: 1px solid var(--border-soft); display: none; }
    .sidebar.tab-active { display: flex; }
    .sidebar-body { padding: 16px 16px 20px; }
    .preview-area { display: none; padding: 20px 12px 32px; }
    .preview-area.tab-active { display: flex; }
    .preview-info { padding: 0 4px; }
    .invoice-scaler { width: 100%; overflow-x: auto; }
    .invoice { width: 800px; transform-origin: top left; }
  }
  @media (max-width: 600px) {
    .topbar { padding: 12px 16px; flex-wrap: wrap; gap: 10px; }
    .topbar h1 { font-size: 15px; }
    .tbtn { padding: 8px 12px; font-size: 10.5px; }
    .inv-bottom { grid-template-columns: 1fr; }
    .inv-meta { grid-template-columns: 1fr; }
  }

  /* PRINT */
  /* PRINT — faithful 1:1 of the preview (used by printToPDF) */
  @media print {
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-shadow: none !important; }
    html, body { margin: 0; padding: 0; background: #FFFFFF; }
    body::before, body::after { display: none !important; }
    .topbar, .sidebar, .preview-info, .mobile-tabs { display: none !important; }
    .app { display: block; }
    .preview-area { padding: 0; display: block; overflow: visible; align-items: stretch; }
    .invoice-scaler { width: auto; }
    .invoice { border-radius: 0; width: 800px; }
    @page { margin: 0; }
  }
`}
</style>
</head>
<body style="background: white !important;">
  <div class="invoice" id="invoice-preview" style="box-shadow: none;">
    <div class="inv-header">
      <div class="inv-logo">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 423.63 137.94">
          <defs><style>.cls-1{fill:#b28941}.cls-2{fill:#f5f5f5}</style></defs>
          <g><g><circle class="cls-1" cx="68.97" cy="68.97" r="28.44"/><path class="cls-1" d="M127.81,69.88l9.37,9.36c-.53,3.57-1.34,7.05-2.39,10.41-8.99,28.62-36.11,49.2-67.91,48.26C30.27,136.83.58,106.7,0,70.08-.6,31.48,30.51,0,68.97,0s68.97,30.88,68.97,68.97l-11.17-11.17c-5.44-28.26-31.07-49.34-61.31-47.58-29.19,1.69-52.98,25.04-55.17,54.2-2.6,34.57,24.68,63.42,58.68,63.42,28.25,0,51.86-19.91,57.55-46.47l-9.46-9.46,6.38-6.39,4.37,4.37Z"/></g><g><path class="cls-2" d="M178.07,13.46h-10.6v-3.84h25.58v3.84h-10.6v27.08h-4.37V13.46Z"/><path class="cls-2" d="M233.29,9.61v30.92h-4.42v-13.78h-17.76v13.78h-4.42V9.61h4.42v13.3h17.76v-13.3h4.42Z"/><path class="cls-2" d="M273.84,36.69v3.84h-22.44V9.61h21.82v3.84h-17.4v9.5h15.51v3.76h-15.51v9.98h18.02Z"/><path class="cls-2" d="M308.03,25.08c0-9.06,6.98-15.81,16.48-15.81s16.39,6.71,16.39,15.81-6.98,15.81-16.39,15.81-16.48-6.76-16.48-15.81ZM336.48,25.08c0-6.85-5.12-11.88-11.97-11.88s-12.06,5.04-12.06,11.88,5.12,11.88,12.06,11.88,11.97-5.04,11.97-11.88Z"/><path class="cls-2" d="M383.08,9.61v30.92h-3.62l-18.55-23.06v23.06h-4.42V9.61h3.62l18.55,23.06V9.61h4.42Z"/><path class="cls-2" d="M423.63,36.69v3.84h-22.44V9.61h21.82v3.84h-17.41v9.5h15.51v3.76h-15.51v9.98h18.02Z"/></g><g><path class="cls-1" d="M235.98,131.97h-5.07l-1.05,2.38h-1.4l4.32-9.53h1.35l4.33,9.53h-1.43l-1.05-2.38ZM235.5,130.88l-2.06-4.67-2.06,4.67h4.11Z"/><path class="cls-1" d="M246.42,124.24v10.11h-1.25v-1.14c-.59.82-1.51,1.23-2.57,1.23-2.11,0-3.65-1.48-3.65-3.69s1.54-3.68,3.65-3.68c1.02,0,1.92.38,2.52,1.16v-3.98h1.31ZM245.13,130.74c0-1.54-1.05-2.53-2.42-2.53s-2.44.99-2.44,2.53,1.05,2.55,2.44,2.55,2.42-1.01,2.42-2.55Z"/><path class="cls-1" d="M255.29,127.13l-3.16,7.22h-1.33l-3.16-7.22h1.36l2.48,5.79,2.53-5.79h1.28Z"/><path class="cls-1" d="M260.39,127.06v1.27c-.11-.01-.2-.01-.3-.01-1.4,0-2.27.86-2.27,2.44v3.6h-1.31v-7.22h1.25v1.21c.46-.84,1.36-1.28,2.63-1.28Z"/><path class="cls-1" d="M268.43,131.18h-5.86c.16,1.27,1.19,2.11,2.62,2.11.84,0,1.55-.29,2.08-.87l.72.84c-.65.76-1.65,1.17-2.85,1.17-2.33,0-3.88-1.54-3.88-3.69s1.54-3.68,3.62-3.68,3.57,1.5,3.57,3.72c0,.11-.01.27-.03.4ZM262.57,130.24h4.63c-.14-1.21-1.05-2.07-2.32-2.07s-2.18.84-2.32,2.07Z"/><path class="cls-1" d="M274.32,133.93c-.4.34-.99.5-1.58.5-1.46,0-2.29-.8-2.29-2.26v-3.96h-1.23v-1.08h1.23v-1.58h1.31v1.58h2.07v1.08h-2.07v3.91c0,.78.41,1.21,1.13,1.21.38,0,.75-.12,1.02-.34l.41.94Z"/><path class="cls-1" d="M275.67,124.9c0-.48.38-.86.89-.86s.89.37.89.83c0,.49-.37.87-.89.87s-.89-.37-.89-.84ZM275.9,127.13h1.31v7.22h-1.31v-7.22Z"/><path class="cls-1" d="M278.79,133.59l.54-1.03c.61.44,1.59.75,2.53.75,1.21,0,1.72-.37,1.72-.98,0-1.62-4.56-.22-4.56-3.09,0-1.29,1.16-2.17,3.01-2.17.94,0,2,.25,2.63.65l-.56,1.04c-.65-.42-1.38-.57-2.08-.57-1.14,0-1.7.42-1.7.99,0,1.7,4.58.31,4.58,3.12,0,1.31-1.2,2.14-3.12,2.14-1.2,0-2.38-.37-2.98-.84Z"/><path class="cls-1" d="M286.29,124.9c0-.48.38-.86.89-.86s.89.37.89.83c0,.49-.37.87-.89.87s-.89-.37-.89-.84ZM286.52,127.13h1.31v7.22h-1.31v-7.22Z"/><path class="cls-1" d="M297.17,130.2v4.15h-1.31v-4c0-1.42-.71-2.11-1.95-2.11-1.39,0-2.29.83-2.29,2.4v3.72h-1.31v-7.22h1.25v1.09c.53-.74,1.46-1.16,2.6-1.16,1.76,0,3,1.01,3,3.13Z"/><path class="cls-1" d="M306.54,127.13v6.24c0,2.55-1.29,3.7-3.75,3.7-1.32,0-2.66-.37-3.45-1.08l.63-1.01c.67.57,1.72.94,2.78.94,1.7,0,2.48-.79,2.48-2.42v-.57c-.63.75-1.57,1.12-2.6,1.12-2.08,0-3.66-1.42-3.66-3.5s1.58-3.49,3.66-3.49c1.08,0,2.06.4,2.67,1.19v-1.12h1.24ZM305.26,130.55c0-1.4-1.04-2.34-2.48-2.34s-2.49.94-2.49,2.34,1.04,2.36,2.49,2.36,2.48-.97,2.48-2.36Z"/><path class="cls-1" d="M318.96,131.97h-5.07l-1.05,2.38h-1.4l4.32-9.53h1.35l4.33,9.53h-1.43l-1.05-2.38ZM318.48,130.88l-2.06-4.67-2.06,4.67h4.11Z"/><path class="cls-1" d="M329.5,127.13v6.24c0,2.55-1.29,3.7-3.75,3.7-1.32,0-2.66-.37-3.45-1.08l.63-1.01c.67.57,1.72.94,2.78.94,1.7,0,2.48-.79,2.48-2.42v-.57c-.63.75-1.57,1.12-2.6,1.12-2.08,0-3.66-1.42-3.66-3.5s1.58-3.49,3.66-3.49c1.08,0,2.06.4,2.67,1.19v-1.12h1.24ZM328.22,130.55c0-1.4-1.04-2.34-2.48-2.34s-2.49.94-2.49,2.34,1.04,2.36,2.49,2.36,2.48-.97,2.48-2.36Z"/><path class="cls-1" d="M338.48,131.18h-5.86c.16,1.27,1.19,2.11,2.62,2.11.84,0,1.55-.29,2.08-.87l.72.84c-.65.76-1.65,1.17-2.85,1.17-2.33,0-3.88-1.54-3.88-3.69s1.54-3.68,3.62-3.68,3.57,1.5,3.57,3.72c0,.11-.01.27-.03.4ZM332.63,130.24h4.63c-.14-1.21-1.05-2.07-2.32-2.07s-2.18.84-2.32,2.07Z"/><path class="cls-1" d="M347.17,130.2v4.15h-1.31v-4c0-1.42-.71-2.11-1.95-2.11-1.39,0-2.29.83-2.29,2.4v3.72h-1.31v-7.22h1.25v1.09c.53-.74,1.46-1.16,2.6-1.16,1.76,0,3,1.01,3,3.13Z"/><path class="cls-1" d="M348.96,130.74c0-2.15,1.59-3.68,3.81-3.68,1.29,0,2.37.53,2.94,1.54l-.99.64c-.46-.71-1.17-1.03-1.96-1.03-1.42,0-2.48.99-2.48,2.53s1.06,2.55,2.48,2.55c.79,0,1.5-.33,1.96-1.04l.99.63c-.57,1.01-1.65,1.55-2.94,1.55-2.22,0-3.81-1.54-3.81-3.69Z"/><path class="cls-1" d="M363.7,127.13l-3.5,7.94c-.64,1.53-1.47,2-2.57,2-.7,0-1.4-.23-1.85-.67l.56-.98c.35.34.8.53,1.29.53.63,0,1.02-.29,1.38-1.12l.23-.5-3.19-7.21h1.36l2.52,5.78,2.49-5.78h1.28Z"/></g><g><path class="cls-2" d="M167.47,84.18c0-15.56,11.91-26.59,28.12-26.59,9.42,0,17.02,3.43,21.99,9.64l-9.2,8.33c-3.21-3.87-7.16-5.99-12.05-5.99-8.4,0-14.24,5.84-14.24,14.61s5.84,14.61,14.24,14.61c4.89,0,8.84-2.12,12.05-5.99l9.2,8.33c-4.97,6.21-12.56,9.64-21.99,9.64-16.22,0-28.12-11.03-28.12-26.59Z"/><path class="cls-2" d="M234.89,84.18c0-15.34,12.05-26.59,28.42-26.59s28.41,11.25,28.41,26.59-12.05,26.59-28.41,26.59-28.42-11.25-28.42-26.59ZM277.11,84.18c0-8.84-6.06-14.61-13.81-14.61s-13.81,5.77-13.81,14.61,6.06,14.61,13.81,14.61,13.81-5.77,13.81-14.61Z"/><path class="cls-2" d="M336.27,96.16h-7.89v13.59h-14.46v-51.13h23.37c13.95,0,22.72,7.23,22.72,18.92,0,7.52-3.65,13.08-10.01,16.14l11.03,16.07h-15.49l-9.28-13.59ZM336.42,70.01h-8.04v14.97h8.04c5.99,0,8.98-2.78,8.98-7.45s-2.99-7.52-8.98-7.52Z"/><path class="cls-2" d="M423.63,98.57v11.18h-41.05v-51.13h40.1v11.18h-25.79v8.62h22.72v10.81h-22.72v9.35h26.73Z"/></g><rect class="cls-1" x="181.06" y="130.33" width="40.74" height="1.79"/><rect class="cls-1" x="370.37" y="130.33" width="40.74" height="1.79"/></g>
        </svg>
        <div class="inv-legal-id">
          <strong>ICE:</strong> 003921894000076 · <strong>RC:</strong> 27375
        </div>
      </div>
      <div class="inv-title-block">
        <div class="inv-label" id="preview-doc-label">${docLabel}</div>
        <div class="inv-number">N° <strong id="preview-number">${docNum}</strong></div>
      </div>
    </div>
    
    <div class="inv-body">
      <div class="inv-meta">
        <div class="inv-client">
          <h3>Facturé à</h3>
          <p><span>Nom : </span><strong id="preview-name">${clientName}</strong></p>
        </div>
        <div class="inv-dates">
          <h3>Dates</h3>
          <p><strong id="preview-date-label">Émise le</strong> <span id="preview-date">${dateStr}</span></p>
          <p><strong id="preview-due-label">${doc.docType === 'devis' ? 'Validité' : 'Échéance'}</strong> <span id="preview-due">${dueStr || dateStr}</span></p>
        </div>
      </div>
      
      <table class="inv-table">
        <thead>
          <tr>
            <th>Description</th>
            <th id="th-qty">QTÉ</th>
            <th id="th-price">Prix unit. MAD</th>
            <th>Total MAD</th>
          </tr>
        </thead>
        <tbody id="preview-items">
          ${itemsHtml}
        </tbody>
      </table>
      
      <div class="inv-bottom">
        <div class="inv-notes">
          <p class="note-label">Note</p>
          <p id="preview-note">${doc.notes || 'Merci pour votre confiance.'}</p>
          <p class="pay-label">Conditions de paiement</p>
          <p id="preview-payment">Paiement par virement ou espèces.<br>RIB : 007 621 0002585000000836 42</p>
        </div>
        <div class="inv-totals">
          <div class="totals-row">
            <span class="t-label">Sous-total</span>
            <span class="t-value" id="preview-subtotal">${subtotal.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD</span>
          </div>
          ${tvaMode !== 'none' ? `
          <div class="totals-row tva" id="tva-row">
            <span class="t-label">TVA (${doc.taxRate}%)</span>
            <span class="t-value" id="preview-tva">${taxAmount.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD</span>
          </div>
          ` : ''}
          <div class="totals-row total-final">
            <span class="t-label">Total TTC</span>
            <span class="t-value" id="preview-total">${total.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD</span>
          </div>
        </div>
      </div>
    </div>

    <div class="inv-footer">
      <div class="contact-item">
        <svg viewBox="0 0 24 24"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
        +212 6 07 48 48 22
      </div>
      <div class="contact-item">
        <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
        contact@the1core.com
      </div>
      <div class="contact-item">
        <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
        Berrechid, Maroc
      </div>
      <div class="contact-item">
        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
        the1core.com
      </div>
    </div>
  </div>
  <script>
    window.onload = () => { setTimeout(() => { window.print(); }, 500); };
  </script>
</body>
</html>
`;
}
