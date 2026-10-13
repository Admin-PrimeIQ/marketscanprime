"use client"

import { useEffect } from "react"

const LINK_ID = "n8n-chat-widget-styles"
const CUSTOM_STYLE_ID = "n8n-chat-copilot-overrides"
/** Same major line as `dependencies['@n8n/chat']` — bump when upgrading the package */
const N8N_CHAT_VERSION = "1.14.0"

/**
 * Overrides sobre @n8n/chat: tipografía compacta, botón copiar, indicador de escritura.
 * Cargar después del CSS base del paquete.
 */
const CUSTOM_CSS = `
.n8n-chat {
  --chat--font-family: var(--font-inter), ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
  --chat--spacing: 0.75rem;
  --chat--border-radius: 0.75rem;
  --chat--message--font-size: 0.9375rem;
  --chat--message-line-height: 1.65;
  --chat--message--padding: 0.75rem 1rem;
  --chat--message--border-radius: 0.875rem;
  --chat--message--margin-bottom: 1.125rem;
  --chat--message--bot--background: #ffffff;
  --chat--message--bot--color: #1a1a1a;
  --chat--message--bot--border: 1px solid #f4f4f5;
  --chat--message--user--background: #EEECE8;
  --chat--message--user--color: #141413;
  --chat--message--user--border: none;
  --chat--message--pre--background: #ececec;
  --chat--body--background: #fafafa;
  --chat--footer--background: #fafafa;
  --chat--header--background: #fafafa;
  --chat--header--color: #3f3f46;
  --chat--heading--font-size: 1rem;
  --chat--subtitle--font-size: 0.8125rem;
  --chat--subtitle--line-height: 1.45;
  --n8n-disclaimer-size: 0.72rem;
  --n8n-disclaimer-color: #9d9daf;
  --n8n-disclaimer-opacity: 0.9;
}
.n8n-chat .chat-layout .chat-header {
  border-bottom: 1px solid #e4e4e7;
}
.n8n-chat .chat-layout .chat-footer {
  position: relative;
  display: block !important;
  height: auto !important;
  min-height: 0 !important;
  overflow: visible !important;
  border-top: none;
  padding: 0.5rem 1.25rem 1rem;
  background: #fafafa;
}
.n8n-chat .chat-layout .chat-footer::before {
  content: '';
  position: absolute;
  top: -3rem;
  left: 0;
  right: 0;
  height: 3rem;
  background: linear-gradient(to bottom, transparent, #fafafa);
  pointer-events: none;
}
.n8n-chat .chat-layout .chat-footer .chat-inputs {
  box-sizing: border-box;
  margin: 0 auto 0.55rem;
  max-width: 52rem;
  width: 100%;
  display: flex;
  align-items: flex-end;
  gap: 0.45rem;
  border: 1px solid transparent;
  border-radius: 20px;
  background: #ffffff;
  cursor: text;
  padding: 0.5rem 0.55rem 0.5rem 0.8rem;
  box-shadow:
    0 0.25rem 1.25rem hsl(0 0% 0% / 3.5%),
    0 0 0 0.5px hsl(240 6% 70% / 0.22);
  transition: all 0.2s cubic-bezier(0.165, 0.85, 0.45, 1);
}
.n8n-chat .chat-footer {
  padding: 0.5rem 1.1rem 1.05rem !important;
  border-top: none !important;
  background: #fafafa !important;
}
.n8n-chat .chat-inputs,
.n8n-chat .chat-footer .chat-inputs {
  box-sizing: border-box !important;
  margin: 0 auto 0.55rem !important;
  max-width: 52rem !important;
  width: 100% !important;
  border-radius: 20px !important;
  border: 1px solid transparent !important;
  background: #ffffff !important;
  padding: 0.5rem 0.55rem 0.5rem 0.8rem !important;
  gap: 0.45rem !important;
  align-items: flex-end !important;
  box-shadow:
    0 0.25rem 1.25rem hsl(0 0% 0% / 3.5%),
    0 0 0 0.5px hsl(240 6% 70% / 0.22) !important;
  transition: all 0.2s cubic-bezier(0.165, 0.85, 0.45, 1) !important;
}
.n8n-chat .chat-inputs:hover,
.n8n-chat .chat-footer .chat-inputs:hover {
  box-shadow:
    0 0.25rem 1.25rem hsl(0 0% 0% / 3.5%),
    0 0 0 0.5px hsl(240 6% 58% / 0.35) !important;
}
.n8n-chat .chat-inputs:focus-within,
.n8n-chat .chat-footer .chat-inputs:focus-within {
  box-shadow:
    0 0.25rem 1.25rem hsl(0 0% 0% / 7.5%),
    0 0 0 0.5px hsl(240 6% 58% / 0.35) !important;
}
.n8n-chat .chat-input {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  padding: 0.4rem 0 0.45rem !important;
}
.n8n-chat .chat-layout .chat-footer .chat-inputs:hover {
  box-shadow:
    0 0.25rem 1.25rem hsl(0 0% 0% / 3.5%),
    0 0 0 0.5px hsl(240 6% 58% / 0.35);
}
.n8n-chat .chat-layout .chat-footer > * {
  max-width: 52rem;
  margin-left: auto;
  margin-right: auto;
}
.n8n-chat .chat-layout .chat-footer .chat-inputs:focus-within {
  box-shadow:
    0 0.25rem 1.25rem hsl(0 0% 0% / 7.5%),
    0 0 0 0.5px hsl(240 6% 58% / 0.35);
}
.n8n-chat .chat-layout .chat-footer .chat-input-left-panel {
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 1;
}
.n8n-chat .chat-layout .chat-footer .chat-input {
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;
  min-height: 2.25rem;
  max-height: 12rem;
  padding: 0.45rem 0 !important;
  font-size: 0.9375rem;
  line-height: 1.6;
  resize: none;
}
.n8n-chat .chat-layout .chat-footer .chat-input::placeholder {
  color: #a1a1aa;
}
.n8n-chat .n8n-chat-footer-disclaimer {
  display: block !important;
  visibility: visible !important;
  opacity: 1 !important;
  max-width: 52rem;
  margin: 0 auto;
  padding: 0 0.5rem;
  text-align: center;
  font-size: var(--n8n-disclaimer-size) !important;
  font-weight: 400;
  line-height: 1.25;
  letter-spacing: 0.015em;
  color: var(--n8n-disclaimer-color) !important;
  opacity: var(--n8n-disclaimer-opacity) !important;
}

/*
 * Adjuntos (@n8n/chat Input.vue): .chat-files va después de .chat-inputs en el DOM,
 * así que por defecto quedan debajo de la burbuja. order:-1 + flex column los sube
 * y damos una caja tipo “dock” encima del composer.
 */
.n8n-chat .chat-footer .chat-input {
  align-items: stretch !important;
  gap: 0.45rem;
  max-width: 52rem;
  width: 100%;
  margin-left: auto;
  margin-right: auto;
  box-sizing: border-box;
}
.n8n-chat .chat-footer .chat-input > .chat-files {
  order: -1;
  align-self: stretch;
  width: 100%;
  max-width: 100%;
  margin: 0 0 0.1rem 0;
  padding: 0.4rem 0.55rem 0.48rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  align-items: center;
  justify-content: flex-start;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: #d4d4d8 transparent;
  border-radius: 14px;
  border: 1px solid rgba(24, 24, 27, 0.09);
  background: rgba(255, 255, 255, 0.97);
  box-shadow:
    0 0.15rem 0.9rem hsl(0 0% 0% / 4.5%),
    0 0 0 0.5px hsl(240 6% 70% / 0.16);
}
.n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"] {
  max-width: min(100%, 15rem);
  border-radius: 10px !important;
  border: 1px solid #e4e4e7 !important;
  background: #ffffff !important;
  color: #3f3f46 !important;
  padding: 0.38rem 0.52rem !important;
  gap: 0.42rem !important;
  font-size: 0.75rem !important;
  font-weight: 500;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.04);
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}
.n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"]:hover {
  border-color: #d4d4d8 !important;
  box-shadow: 0 2px 10px hsl(0 0% 0% / 7%);
}
.n8n-chat .chat-footer .chat-input > .chat-files .chat-file-name {
  font-weight: 500;
  letter-spacing: 0.01em;
  color: inherit !important;
}
.n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"] .chat-icon {
  width: 1.05rem;
  height: 1.05rem;
  flex-shrink: 0;
  opacity: 0.88;
}
/* Lucide por tipo de archivo (primeiq — n8n-chat-composer-file-icons.ts) */
.n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"]:has(.primeiq-chat-file-type-icon) .chat-icon {
  display: none !important;
}
.n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"] .primeiq-chat-file-type-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-right: 0.02rem;
  color: #64748b;
}
/* Iconos más saturados + sombra suave al trazo (legible sobre chip blanco) */
.n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"] .primeiq-chat-file-type-icon__svg {
  filter: drop-shadow(0 0.5px 0 rgba(255, 255, 255, 0.65));
}
.n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="image"] .primeiq-chat-file-type-icon {
  color: #9333ea;
}
.n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="image"] .primeiq-chat-file-type-icon__svg {
  filter: drop-shadow(0 1px 1.5px rgba(147, 51, 234, 0.42));
}
.n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="pdf"] .primeiq-chat-file-type-icon {
  color: #e60012;
}
.n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="pdf"] .primeiq-chat-file-type-icon__svg {
  filter: drop-shadow(0 1px 2px rgba(230, 0, 18, 0.45));
}
.n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="document"] .primeiq-chat-file-type-icon {
  color: #1d4ed8;
}
.n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="document"] .primeiq-chat-file-type-icon__svg {
  filter: drop-shadow(0 1px 1.5px rgba(29, 78, 216, 0.4));
}
.n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="spreadsheet"] .primeiq-chat-file-type-icon {
  color: #15803d;
}
.n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="spreadsheet"] .primeiq-chat-file-type-icon__svg {
  filter: drop-shadow(0 1px 1.5px rgba(21, 128, 61, 0.42));
}
.n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="presentation"] .primeiq-chat-file-type-icon {
  color: #ea580c;
}
.n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="presentation"] .primeiq-chat-file-type-icon__svg {
  filter: drop-shadow(0 1px 1.5px rgba(234, 88, 12, 0.42));
}
.n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="code"] .primeiq-chat-file-type-icon {
  color: #0d9488;
}
.n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="code"] .primeiq-chat-file-type-icon__svg {
  filter: drop-shadow(0 1px 1.5px rgba(13, 148, 136, 0.4));
}
.n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="archive"] .primeiq-chat-file-type-icon {
  color: #d97706;
}
.n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="archive"] .primeiq-chat-file-type-icon__svg {
  filter: drop-shadow(0 1px 1.5px rgba(217, 119, 6, 0.42));
}
.n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="video"] .primeiq-chat-file-type-icon {
  color: #db2777;
}
.n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="video"] .primeiq-chat-file-type-icon__svg {
  filter: drop-shadow(0 1px 1.5px rgba(219, 39, 119, 0.42));
}
.n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="audio"] .primeiq-chat-file-type-icon {
  color: #4f46e5;
}
.n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="audio"] .primeiq-chat-file-type-icon__svg {
  filter: drop-shadow(0 1px 1.5px rgba(79, 70, 229, 0.42));
}

/* Dark mode overrides (NextThemes: dark class / data-theme="dark") */
.dark .n8n-chat,
[data-theme="dark"] .n8n-chat {
  color-scheme: dark !important;
  --chat--body--background: #0b0b0c;
  --chat--footer--background: #0b0b0c;
  --chat--header--background: #0b0b0c;
  --chat--header--color: #e4e4e7;
  --chat--message--bot--background: #17171a;
  --chat--message--bot--color: #e5e7eb;
  --chat--message--user--background: #262629;
  --chat--message--user--color: #f4f4f5;
  --chat--message--pre--background: #18181b;
  --chat--input--container--background: #111214;
  --chat--input--background: #111214;
  --chat--input--text-color: #e4e4e7;
  --n8n-disclaimer-color: #737381;
  --n8n-disclaimer-opacity: 0.84;
}
.dark .n8n-chat .chat-layout .chat-header,
[data-theme="dark"] .n8n-chat .chat-layout .chat-header {
  border-bottom-color: #27272a !important;
}
.dark .n8n-chat .chat-footer,
[data-theme="dark"] .n8n-chat .chat-footer,
.dark .n8n-chat .chat-layout .chat-footer,
[data-theme="dark"] .n8n-chat .chat-layout .chat-footer {
  background: #0b0b0c !important;
}
.dark .n8n-chat .chat-layout .chat-footer::before,
[data-theme="dark"] .n8n-chat .chat-layout .chat-footer::before {
  background: linear-gradient(to bottom, transparent, #0b0b0c) !important;
}
.dark .n8n-chat .chat-inputs,
[data-theme="dark"] .n8n-chat .chat-inputs,
.dark .n8n-chat .chat-footer .chat-inputs,
[data-theme="dark"] .n8n-chat .chat-footer .chat-inputs {
  background: #111214 !important;
  box-shadow:
    0 0.35rem 1.45rem hsl(0 0% 0% / 35%),
    0 0 0 0.5px hsl(240 5% 60% / 35%) !important;
}
.dark .n8n-chat .chat-inputs:hover,
[data-theme="dark"] .n8n-chat .chat-inputs:hover,
.dark .n8n-chat .chat-footer .chat-inputs:hover,
[data-theme="dark"] .n8n-chat .chat-footer .chat-inputs:hover,
.dark .n8n-chat .chat-inputs:focus-within,
[data-theme="dark"] .n8n-chat .chat-inputs:focus-within,
.dark .n8n-chat .chat-footer .chat-inputs:focus-within,
[data-theme="dark"] .n8n-chat .chat-footer .chat-inputs:focus-within {
  box-shadow:
    0 0.35rem 1.45rem hsl(0 0% 0% / 45%),
    0 0 0 0.5px hsl(240 5% 72% / 45%) !important;
}
.dark .n8n-chat .chat-footer .chat-input > .chat-files,
[data-theme="dark"] .n8n-chat .chat-footer .chat-input > .chat-files {
  border-color: rgba(250, 250, 250, 0.1);
  background: rgba(24, 24, 27, 0.78);
  box-shadow:
    0 0.25rem 1.1rem hsl(0 0% 0% / 28%),
    0 0 0 0.5px hsl(240 5% 48% / 0.38);
  scrollbar-color: #52525b transparent;
}
.dark .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"],
[data-theme="dark"] .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"] {
  border-color: #3f3f46 !important;
  background: #18181b !important;
  color: #e4e4e7 !important;
}
.dark .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"]:hover,
[data-theme="dark"] .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"]:hover {
  border-color: #52525b !important;
  box-shadow: 0 2px 12px hsl(0 0% 0% / 35%);
}
.dark .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"] .primeiq-chat-file-type-icon,
[data-theme="dark"] .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"] .primeiq-chat-file-type-icon {
  color: #cbd5e1;
}
.dark .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"] .primeiq-chat-file-type-icon__svg,
[data-theme="dark"] .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"] .primeiq-chat-file-type-icon__svg {
  filter: drop-shadow(0 0.5px 0 rgba(0, 0, 0, 0.55));
}
.dark .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="image"] .primeiq-chat-file-type-icon,
[data-theme="dark"] .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="image"] .primeiq-chat-file-type-icon {
  color: #c4b5fd;
}
.dark .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="image"] .primeiq-chat-file-type-icon__svg,
[data-theme="dark"] .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="image"] .primeiq-chat-file-type-icon__svg {
  filter: drop-shadow(0 0 6px rgba(167, 139, 250, 0.55));
}
.dark .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="pdf"] .primeiq-chat-file-type-icon,
[data-theme="dark"] .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="pdf"] .primeiq-chat-file-type-icon {
  color: #ff5c5c;
}
.dark .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="pdf"] .primeiq-chat-file-type-icon__svg,
[data-theme="dark"] .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="pdf"] .primeiq-chat-file-type-icon__svg {
  filter: drop-shadow(0 0 7px rgba(255, 92, 92, 0.55));
}
.dark .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="document"] .primeiq-chat-file-type-icon,
[data-theme="dark"] .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="document"] .primeiq-chat-file-type-icon {
  color: #7cb6ff;
}
.dark .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="document"] .primeiq-chat-file-type-icon__svg,
[data-theme="dark"] .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="document"] .primeiq-chat-file-type-icon__svg {
  filter: drop-shadow(0 0 6px rgba(96, 165, 250, 0.45));
}
.dark .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="spreadsheet"] .primeiq-chat-file-type-icon,
[data-theme="dark"] .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="spreadsheet"] .primeiq-chat-file-type-icon {
  color: #4ade80;
}
.dark .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="spreadsheet"] .primeiq-chat-file-type-icon__svg,
[data-theme="dark"] .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="spreadsheet"] .primeiq-chat-file-type-icon__svg {
  filter: drop-shadow(0 0 6px rgba(74, 222, 128, 0.45));
}
.dark .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="presentation"] .primeiq-chat-file-type-icon,
[data-theme="dark"] .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="presentation"] .primeiq-chat-file-type-icon {
  color: #ffb454;
}
.dark .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="presentation"] .primeiq-chat-file-type-icon__svg,
[data-theme="dark"] .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="presentation"] .primeiq-chat-file-type-icon__svg {
  filter: drop-shadow(0 0 6px rgba(251, 146, 60, 0.45));
}
.dark .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="code"] .primeiq-chat-file-type-icon,
[data-theme="dark"] .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="code"] .primeiq-chat-file-type-icon {
  color: #5eead4;
}
.dark .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="code"] .primeiq-chat-file-type-icon__svg,
[data-theme="dark"] .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="code"] .primeiq-chat-file-type-icon__svg {
  filter: drop-shadow(0 0 6px rgba(45, 212, 191, 0.45));
}
.dark .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="archive"] .primeiq-chat-file-type-icon,
[data-theme="dark"] .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="archive"] .primeiq-chat-file-type-icon {
  color: #fde047;
}
.dark .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="archive"] .primeiq-chat-file-type-icon__svg,
[data-theme="dark"] .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="archive"] .primeiq-chat-file-type-icon__svg {
  filter: drop-shadow(0 0 6px rgba(250, 204, 21, 0.4));
}
.dark .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="video"] .primeiq-chat-file-type-icon,
[data-theme="dark"] .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="video"] .primeiq-chat-file-type-icon {
  color: #fb7eb8;
}
.dark .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="video"] .primeiq-chat-file-type-icon__svg,
[data-theme="dark"] .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="video"] .primeiq-chat-file-type-icon__svg {
  filter: drop-shadow(0 0 6px rgba(244, 114, 182, 0.45));
}
.dark .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="audio"] .primeiq-chat-file-type-icon,
[data-theme="dark"] .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="audio"] .primeiq-chat-file-type-icon {
  color: #a5b4fc;
}
.dark .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="audio"] .primeiq-chat-file-type-icon__svg,
[data-theme="dark"] .n8n-chat .chat-footer .chat-input > .chat-files [data-test-id="chat-file"][data-primeiq-file-kind="audio"] .primeiq-chat-file-type-icon__svg {
  filter: drop-shadow(0 0 6px rgba(129, 140, 248, 0.5));
}
.dark .n8n-chat .chat-input,
[data-theme="dark"] .n8n-chat .chat-input {
  background: var(--chat--input--background) !important;
  color: #e4e4e7 !important;
  caret-color: #e4e4e7 !important;
}
.dark .n8n-chat .chat-input::placeholder,
[data-theme="dark"] .n8n-chat .chat-input::placeholder {
  color: #71717a !important;
}
.dark .n8n-chat .n8n-chat-footer-disclaimer,
[data-theme="dark"] .n8n-chat .n8n-chat-footer-disclaimer {
  color: var(--n8n-disclaimer-color) !important;
  opacity: var(--n8n-disclaimer-opacity) !important;
}
.dark .n8n-chat .chat-input-file-button,
[data-theme="dark"] .n8n-chat .chat-input-file-button {
  color: #a1a1aa !important;
}
.dark .n8n-chat .chat-input-file-button:hover,
[data-theme="dark"] .n8n-chat .chat-input-file-button:hover {
  background: #1f1f23 !important;
  color: #f4f4f5 !important;
}
.dark .n8n-chat .chat-message-typing .chat-message-typing-circle,
[data-theme="dark"] .n8n-chat .chat-message-typing .chat-message-typing-circle {
  background: #a1a1aa;
  opacity: 0.42;
}
.dark .n8n-chat .chat-input-send-button,
[data-theme="dark"] .n8n-chat .chat-input-send-button {
  background: #f4f4f5 !important;
  color: #18181b !important;
  border: none !important;
}
.dark .n8n-chat .chat-input-send-button:hover,
[data-theme="dark"] .n8n-chat .chat-input-send-button:hover {
  background: #e4e4e7 !important;
  color: #18181b !important;
}
.dark .n8n-chat .n8n-chat-message-action-btn,
[data-theme="dark"] .n8n-chat .n8n-chat-message-action-btn {
  border-color: transparent !important;
  background: transparent !important;
  color: #a1a1aa !important;
  box-shadow: none !important;
}
.dark .n8n-chat .n8n-chat-message-action-btn:hover,
[data-theme="dark"] .n8n-chat .n8n-chat-message-action-btn:hover {
  border-color: #3f3f46 !important;
  background: #27272a !important;
  color: #f4f4f5 !important;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35) !important;
}
.dark .n8n-chat .n8n-chat-message-action-btn:focus-visible,
[data-theme="dark"] .n8n-chat .n8n-chat-message-action-btn:focus-visible {
  outline: 2px solid #52525b !important;
  outline-offset: 1px;
}
.n8n-chat .chat-messages-list {
  max-width: 54rem;
  margin: 0 auto;
  padding: 1.5rem 1rem;
  width: 100%;
  box-sizing: border-box;
}
.n8n-chat .chat-message {
  max-width: min(100%, 42rem);
  position: relative;
  overflow: visible;
}
/* Prime IQ: data-primeiq-message-type en la raíz. Tool log: .chat-message-markdown.n8n-chat-tool-log-message + .primeiq-calling-tools | .primeiq-tool-message */
/* Burbuja usuario: mismo ancho intrínseco que la franja superior (foto + @nick) para alinear bordes. */
.n8n-chat .chat-message-from-user {
  align-self: flex-end !important;
  width: fit-content !important;
  max-width: min(100%, 42rem) !important;
}
.n8n-chat .chat-message:has(.chat-message-markdown.n8n-chat-tool-log-message) {
  max-width: 100%;
  width: 100%;
  margin-top: 0.15rem;
  margin-bottom: 0.15rem;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  padding: 0 !important;
}

/* ── Prime IQ: logs de sistema (tool_call / tool_result) — discretos, monoespaciados, colapsados + truncado ── */
.n8n-chat .chat-message[data-primeiq-message-type="tool_call"],
.n8n-chat .chat-message[data-primeiq-message-type="tool_result"] {
  align-self: stretch;
  max-width: min(100%, 46rem);
  width: 100%;
  margin-top: 0.1rem !important;
  margin-bottom: 0.1rem !important;
  contain: layout;
}
.n8n-chat .chat-message[data-primeiq-message-type="tool_call"] .chat-message-markdown.n8n-chat-tool-log-message,
.n8n-chat .chat-message[data-primeiq-message-type="tool_result"] .chat-message-markdown.n8n-chat-tool-log-message {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
  font-size: 0.625rem !important;
  line-height: 1.25 !important;
  letter-spacing: 0.02em;
  padding: 0.2rem 0.45rem 0.22rem !important;
  margin: 0 auto !important;
  border-radius: 0.35rem;
  border: 1px solid rgba(113, 113, 122, 0.14);
  background: rgba(113, 113, 122, 0.045);
  box-shadow: none !important;
  opacity: 0.92;
  max-width: 100%;
}
.n8n-chat .chat-message[data-primeiq-message-type="tool_call"] .chat-message-markdown.n8n-chat-tool-log-message {
  border-left: 2px solid rgba(161, 98, 7, 0.35);
}
.n8n-chat .chat-message[data-primeiq-message-type="tool_result"] .chat-message-markdown.n8n-chat-tool-log-message {
  border-left: 2px solid rgba(59, 91, 139, 0.35);
}
.n8n-chat .chat-message[data-primeiq-message-type="tool_call"] .n8n-chat-tool-log-header,
.n8n-chat .chat-message[data-primeiq-message-type="tool_result"] .n8n-chat-tool-log-header {
  display: flex;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  width: 100%;
  cursor: pointer;
  padding: 0.12rem 0.2rem;
  border-radius: 0.28rem;
  transition: background 0.12s ease;
}
.n8n-chat .chat-message[data-primeiq-message-type="tool_call"] .n8n-chat-tool-log-verb,
.n8n-chat .chat-message[data-primeiq-message-type="tool_result"] .n8n-chat-tool-log-verb,
.n8n-chat .chat-message[data-primeiq-message-type="tool_call"] .n8n-chat-tool-log-sep,
.n8n-chat .chat-message[data-primeiq-message-type="tool_result"] .n8n-chat-tool-log-sep {
  flex-shrink: 0;
}
.n8n-chat .chat-message[data-primeiq-message-type="tool_call"] .n8n-chat-tool-log-header:hover,
.n8n-chat .chat-message[data-primeiq-message-type="tool_result"] .n8n-chat-tool-log-header:hover {
  background: rgba(113, 113, 122, 0.07);
}
.n8n-chat .chat-message[data-primeiq-message-type="tool_call"] .n8n-chat-tool-log-header:focus-visible,
.n8n-chat .chat-message[data-primeiq-message-type="tool_result"] .n8n-chat-tool-log-header:focus-visible {
  outline: 1px solid rgba(113, 113, 122, 0.35);
  outline-offset: 1px;
}
.n8n-chat .chat-message[data-primeiq-message-type="tool_call"] .n8n-chat-tool-log-header[aria-expanded="false"] .n8n-chat-tool-log-target,
.n8n-chat .chat-message[data-primeiq-message-type="tool_result"] .n8n-chat-tool-log-header[aria-expanded="false"] .n8n-chat-tool-log-target {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.n8n-chat .chat-message[data-primeiq-message-type="tool_call"] .n8n-chat-tool-log-header[aria-expanded="true"] .n8n-chat-tool-log-target,
.n8n-chat .chat-message[data-primeiq-message-type="tool_result"] .n8n-chat-tool-log-header[aria-expanded="true"] .n8n-chat-tool-log-target {
  white-space: normal;
  overflow: visible;
  word-break: break-word;
}
.n8n-chat .chat-message[data-primeiq-message-type="tool_call"] .n8n-chat-tool-log-details[hidden],
.n8n-chat .chat-message[data-primeiq-message-type="tool_result"] .n8n-chat-tool-log-details[hidden] {
  display: none !important;
}
.n8n-chat .chat-message[data-primeiq-message-type="tool_call"] .n8n-chat-tool-log-details:not([hidden]),
.n8n-chat .chat-message[data-primeiq-message-type="tool_result"] .n8n-chat-tool-log-details:not([hidden]) {
  margin-top: 0.28rem;
  /* Sin scroll interno: el listado principal hace scroll; evita encadenamiento de rueda/trackpad. */
  max-height: none;
  overflow: visible;
}
.dark .n8n-chat .chat-message[data-primeiq-message-type="tool_call"] .chat-message-markdown.n8n-chat-tool-log-message,
[data-theme="dark"] .n8n-chat .chat-message[data-primeiq-message-type="tool_call"] .chat-message-markdown.n8n-chat-tool-log-message {
  border-color: rgba(161, 161, 170, 0.2);
  background: rgba(24, 24, 27, 0.35);
  border-left-color: rgba(234, 179, 8, 0.28);
}
.dark .n8n-chat .chat-message[data-primeiq-message-type="tool_result"] .chat-message-markdown.n8n-chat-tool-log-message,
[data-theme="dark"] .n8n-chat .chat-message[data-primeiq-message-type="tool_result"] .chat-message-markdown.n8n-chat-tool-log-message {
  border-color: rgba(161, 161, 170, 0.2);
  background: rgba(24, 24, 27, 0.35);
  border-left-color: rgba(96, 165, 250, 0.28);
}

.n8n-chat .chat-message-markdown.n8n-chat-tool-log-message {
  max-width: 52rem;
  width: 100%;
  margin: 0 auto !important;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  color: #8a8a97 !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.7rem !important;
  line-height: 1.28 !important;
  letter-spacing: 0.01em;
  padding: 0.08rem 0.15rem !important;
  opacity: 0.82;
}
.n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-header {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.42rem;
  border: none;
  background: transparent;
  color: inherit;
  padding: 0.08rem 0.12rem;
  border-radius: 0.3rem;
  cursor: default;
  text-align: left;
}
.n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-header:hover {
  background: transparent;
}
.n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-verb {
  font-weight: 500;
  color: #7d7d8c;
}
.n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-sep {
  color: #b3b3bf;
}
.n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-target {
  font-family: inherit;
  font-size: 0.69rem;
  background: transparent !important;
  border: none !important;
  border-radius: 0;
  padding: 0;
  font-weight: 700;
  color: #5f5f67 !important;
  opacity: 0.78;
}
.n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-chevron {
  margin-left: auto;
  color: #b7b7c2;
  font-size: 0.68rem;
  opacity: 0.7;
  transition: transform 140ms ease;
}
.n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-header[aria-expanded="true"] .n8n-chat-tool-log-chevron {
  transform: rotate(180deg);
}
.n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-details {
  margin-top: 0.18rem;
  margin-left: 0.55rem;
  border-left: 1px solid rgba(161, 161, 170, 0.2);
  padding-left: 0.45rem;
  max-height: none;
  overflow: visible;
}
.n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-detail {
  margin-bottom: 0.28rem;
}
.n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-detail:last-child {
  margin-bottom: 0;
}
.n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-detail-label {
  display: block;
  margin-bottom: 0.12rem;
  font-size: 0.62rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #9a9aa7;
}
.n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-pre {
  margin: 0;
  padding: 0.36rem 0.44rem;
  background: rgba(113, 113, 122, 0.04);
  border: 1px solid rgba(113, 113, 122, 0.12);
  border-radius: 0.32rem;
  overflow-x: hidden;
  min-width: 0;
}
.n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-code {
  font-family: inherit;
  font-size: 0.66rem;
  line-height: 1.35;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  color: #8f8f9b;
}
/* Jerarquía: Input/Args (──) bajo Calling; Response (──) y campos (───) bajo Response (n8n-chat-tool-logs). */
.n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-detail--tree-call > .n8n-chat-tool-log-detail-label::before {
  content: "── ";
  color: rgba(113, 113, 122, 0.68);
  font-weight: 400;
}
.n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-detail--tree-response > .n8n-chat-tool-log-detail-label::before {
  content: "─── ";
  color: rgba(113, 113, 122, 0.58);
  font-weight: 400;
}
/* Mini “Response - Tool” dentro del details del Calling (misma pauta que tool_result suelto). */
.n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-nested-response.primeiq-nested-tool-result-card {
  margin-top: 0.55rem;
  padding-top: 0.42rem;
  border-top: 1px solid rgba(161, 161, 170, 0.22);
}
.n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-header--nested-result {
  display: flex;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  align-items: center;
  justify-content: flex-start;
  gap: 0.35rem;
  margin: 0;
  padding: 0.1rem 0.18rem;
  border: none;
  border-radius: 0.28rem;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
  font: inherit;
}
.n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-header--nested-result:hover {
  background: rgba(59, 91, 139, 0.08);
}
.n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-header--nested-result[aria-expanded="false"] .n8n-chat-tool-log-target {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-header--nested-result[aria-expanded="true"] .n8n-chat-tool-log-target {
  white-space: normal;
  word-break: break-word;
}
.n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .primeiq-nested-tool-result-details {
  margin-top: 0.22rem;
  margin-left: 0.35rem;
  padding-left: 0.42rem;
  border-left: 1px solid rgba(96, 125, 159, 0.28);
}
.n8n-chat .chat-message[data-primeiq-tool-result-merged="1"] {
  display: none !important;
  overflow: clip;
  pointer-events: none;
}
.n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-message-actions {
  display: none !important;
}
.dark .n8n-chat .chat-message-markdown.n8n-chat-tool-log-message,
[data-theme="dark"] .n8n-chat .chat-message-markdown.n8n-chat-tool-log-message {
  color: #72727f !important;
  opacity: 0.86;
}
.dark .n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-header:hover,
[data-theme="dark"] .n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-header:hover {
  background: transparent;
}
.dark .n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-verb,
[data-theme="dark"] .n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-verb {
  color: #7d7d8a;
}
.dark .n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-target,
[data-theme="dark"] .n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-target {
  background: transparent !important;
  border: none !important;
  color: #a7a7b0 !important;
  opacity: 0.72;
}
.dark .n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-details,
[data-theme="dark"] .n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-details {
  border-left-color: rgba(113, 113, 122, 0.18);
}
.dark .n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-detail-label,
[data-theme="dark"] .n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-detail-label {
  color: #6f6f7a;
}
.dark .n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-pre,
[data-theme="dark"] .n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-pre {
  background: rgba(113, 113, 122, 0.08);
  border-color: rgba(113, 113, 122, 0.18);
}
.dark .n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-code,
[data-theme="dark"] .n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-code {
  color: #878793;
}
.dark .n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-nested-response.primeiq-nested-tool-result-card,
[data-theme="dark"] .n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-nested-response.primeiq-nested-tool-result-card {
  border-top-color: rgba(161, 161, 170, 0.28);
}
.dark .n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-header--nested-result:hover,
[data-theme="dark"] .n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .n8n-chat-tool-log-header--nested-result:hover {
  background: rgba(96, 165, 250, 0.1);
}
.dark .n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .primeiq-nested-tool-result-details,
[data-theme="dark"] .n8n-chat .chat-message-markdown.n8n-chat-tool-log-message .primeiq-nested-tool-result-details {
  border-left-color: rgba(125, 155, 200, 0.32);
}
/* React UI blocks: misma base tipográfica que el shell Next (demo), no el canvas n8n (.chat-message-markdown). */
.n8n-chat .n8n-copilot-assistant-md-host {
  font-family: var(--font-inter), ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    Roboto, "Helvetica Neue", Arial, sans-serif !important;
  font-size: var(--text-sm, 0.875rem) !important;
  line-height: var(--text-sm--line-height, calc(1.25 / 0.875)) !important;
  color: var(--foreground) !important;
  letter-spacing: -0.011em;
  -webkit-font-smoothing: antialiased;
  font-feature-settings: "rlig" 1, "calt" 1;
  /* Misma caja que la burbuja del bot (42rem); 65ch dejaba email/código demasiado angostos vs el carril. */
  max-width: min(100%, 42rem);
  width: 100%;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  word-break: normal;
}
.n8n-chat .n8n-copilot-assistant-md-host .copilot-assistant-md-root {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}
.n8n-chat .copilot-ui-blocks-in-chat {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}
.n8n-chat .copilot-ui-blocks-in-chat > .copilot-ui-blocks-section {
  width: 100%;
  min-width: 0;
}
/* React markdown (UI blocks) en burbuja usuario: mismo tratamiento visual que .chat-message-markdown usuario */
.n8n-chat .chat-message-from-user .n8n-copilot-assistant-md-host {
  font-size: 0.9375rem !important;
  line-height: 1.65 !important;
  color: inherit !important;
}
.n8n-chat .chat-message-from-user .n8n-copilot-assistant-md-host .copilot-assistant-md-root,
.n8n-chat .chat-message-from-user .n8n-copilot-assistant-md-host .copilot-ui-blocks-in-chat {
  color: inherit;
}
/* Separadores UI blocks / divider en burbuja usuario: gris oscuro (sin llegar a negro puro) */
.n8n-chat .chat-message-from-user .n8n-copilot-assistant-md-host .copilot-ui-blocks-in-chat > .copilot-ui-blocks-section + .copilot-ui-blocks-section,
.n8n-chat .chat-message-from-user .n8n-copilot-assistant-md-host .copilot-ui-blocks-in-chat details .copilot-ui-blocks-section + .copilot-ui-blocks-section {
  border-top-color: rgba(113, 113, 122, 0.45) !important;
}
.n8n-chat .chat-message-from-user .n8n-copilot-assistant-md-host .copilot-ui-blocks-in-chat hr[role="separator"] {
  border-top-color: rgba(113, 113, 122, 0.52) !important;
}
.n8n-chat .chat-message-from-user .n8n-copilot-assistant-md-host .copilot-ui-block-email .divide-y > * + * {
  border-top-color: rgba(113, 113, 122, 0.38) !important;
}
.dark .n8n-chat .chat-message-from-user .n8n-copilot-assistant-md-host .copilot-ui-blocks-in-chat > .copilot-ui-blocks-section + .copilot-ui-blocks-section,
[data-theme="dark"] .n8n-chat .chat-message-from-user .n8n-copilot-assistant-md-host .copilot-ui-blocks-in-chat > .copilot-ui-blocks-section + .copilot-ui-blocks-section,
.dark .n8n-chat .chat-message-from-user .n8n-copilot-assistant-md-host .copilot-ui-blocks-in-chat details .copilot-ui-blocks-section + .copilot-ui-blocks-section,
[data-theme="dark"] .n8n-chat .chat-message-from-user .n8n-copilot-assistant-md-host .copilot-ui-blocks-in-chat details .copilot-ui-blocks-section + .copilot-ui-blocks-section {
  border-top-color: rgba(161, 161, 170, 0.38) !important;
}
.dark .n8n-chat .chat-message-from-user .n8n-copilot-assistant-md-host .copilot-ui-blocks-in-chat hr[role="separator"],
[data-theme="dark"] .n8n-chat .chat-message-from-user .n8n-copilot-assistant-md-host .copilot-ui-blocks-in-chat hr[role="separator"] {
  border-top-color: rgba(161, 161, 170, 0.48) !important;
}
.dark .n8n-chat .chat-message-from-user .n8n-copilot-assistant-md-host .copilot-ui-block-email .divide-y > * + *,
[data-theme="dark"] .n8n-chat .chat-message-from-user .n8n-copilot-assistant-md-host .copilot-ui-block-email .divide-y > * + * {
  border-top-color: rgba(161, 161, 170, 0.32) !important;
}
/* Fila solo-divider: sin py grande ni margen del hr (evita hueco vertical en burbuja usuario) */
.n8n-chat .chat-message-from-user .n8n-copilot-assistant-md-host .copilot-ui-blocks-in-chat > .copilot-ui-blocks-section--divider {
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}
.n8n-chat .chat-message-from-user .n8n-copilot-assistant-md-host .copilot-ui-blocks-in-chat > .copilot-ui-blocks-section--divider .copilot-ui-block-divider-hr {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
}
.n8n-chat .chat-message-from-user .n8n-copilot-assistant-md-host .copilot-ui-blocks-in-chat > .copilot-ui-blocks-section:has(+ .copilot-ui-blocks-section--divider) {
  padding-bottom: 0.5rem !important;
}
.n8n-chat .chat-message-from-user .n8n-copilot-assistant-md-host .copilot-ui-blocks-in-chat > .copilot-ui-blocks-section--divider + .copilot-ui-blocks-section {
  padding-top: 0.5rem !important;
}
.n8n-chat .chat-message-from-user .n8n-copilot-assistant-md-host .copilot-ui-blocks-in-chat details .copilot-ui-blocks-section--divider {
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}
.n8n-chat .chat-message-from-user .n8n-copilot-assistant-md-host .copilot-ui-blocks-in-chat details .copilot-ui-blocks-section--divider .copilot-ui-block-divider-hr {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
}
.n8n-chat .chat-message-from-user .n8n-copilot-assistant-md-host .copilot-ui-blocks-in-chat details .copilot-ui-blocks-section:has(+ .copilot-ui-blocks-section--divider) {
  padding-bottom: 0.35rem !important;
}
.n8n-chat .chat-message-from-user .n8n-copilot-assistant-md-host .copilot-ui-blocks-in-chat details .copilot-ui-blocks-section--divider + .copilot-ui-blocks-section {
  padding-top: 0.35rem !important;
}
.n8n-chat .chat-message-from-user .n8n-copilot-assistant-md-host :not(pre) > code {
  background: rgba(255, 255, 255, 0.52) !important;
  border-color: rgba(161, 161, 170, 0.38);
  color: #1f2937 !important;
}
.n8n-chat .chat-message-from-user .n8n-copilot-assistant-md-host a {
  color: #1d4ed8;
  text-underline-offset: 2px;
}
.dark .n8n-chat .chat-message-from-user .n8n-copilot-assistant-md-host :not(pre) > code,
[data-theme="dark"] .n8n-chat .chat-message-from-user .n8n-copilot-assistant-md-host :not(pre) > code {
  background: rgba(255, 255, 255, 0.08) !important;
  border-color: rgba(161, 161, 170, 0.32);
  color: #e5e7eb !important;
}
.dark .n8n-chat .chat-message-from-user .n8n-copilot-assistant-md-host a,
[data-theme="dark"] .n8n-chat .chat-message-from-user .n8n-copilot-assistant-md-host a {
  color: #93c5fd;
  text-decoration-color: #60a5fa;
}

/* Franjas fuera de burbuja (+ controles bajo mensaje usuario / asistente): mismo aire vertical / padding */
.n8n-chat .n8n-copilot-assistant-above-bubble,
.n8n-chat .n8n-copilot-user-above-bubble,
.n8n-chat .n8n-copilot-user-below-actions,
.n8n-chat .n8n-copilot-from-bot-below-actions {
  font-family: var(--font-inter), ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    Roboto, "Helvetica Neue", Arial, sans-serif !important;
  box-sizing: border-box;
  margin-top: 0.45rem;
  margin-bottom: 0.55rem;
  padding: 0.25rem 0;
}
.n8n-chat .chat-messages-list > .n8n-copilot-assistant-above-bubble {
  align-self: flex-start;
  width: fit-content;
  max-width: min(100%, 42rem);
  display: flex;
  justify-content: flex-start;
}
.n8n-chat .chat-messages-list > .n8n-copilot-user-above-bubble {
  align-self: flex-end;
  width: fit-content;
  max-width: min(100%, 42rem);
  margin-left: auto;
  margin-right: 0;
  display: flex;
  justify-content: flex-end;
}
.n8n-chat .chat-messages-list > .n8n-copilot-assistant-above-bubble:first-child,
.n8n-chat .chat-messages-list > .n8n-copilot-user-above-bubble:first-child,
.n8n-chat .chat-messages-list > .n8n-copilot-user-below-actions:first-child,
.n8n-chat .chat-messages-list > .n8n-copilot-from-bot-below-actions:first-child {
  margin-top: 0;
}
/* Controles copiar / reenviar: hermano bajo mensaje usuario (ancho sincronizado en JS con la burbuja). */
.n8n-chat .chat-messages-list > .n8n-copilot-user-below-actions {
  align-self: flex-end;
  max-width: min(100%, 42rem);
  margin-left: auto;
  margin-right: 0;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  min-height: 2rem;
  padding-inline: 0.35rem;
  cursor: default;
  box-sizing: border-box;
}
.n8n-chat .n8n-copilot-user-below-actions .n8n-chat-message-actions {
  position: static;
  top: auto;
  right: auto;
  bottom: auto;
  left: auto;
  z-index: 2;
  display: flex;
  width: 100%;
  box-sizing: border-box;
  justify-content: flex-end;
  align-items: center;
  gap: 0.3rem;
  opacity: 0;
  transition: opacity 0.15s ease;
  pointer-events: auto;
}
/* Visible al hover/focus en la burbuja, en la franja de controles, o al enfocar un botón */
.n8n-chat .chat-message-from-user:hover + .n8n-copilot-user-below-actions > .n8n-chat-message-actions,
.n8n-chat .chat-messages-list > .n8n-copilot-user-below-actions:hover > .n8n-chat-message-actions,
.n8n-chat .n8n-copilot-user-below-actions:hover > .n8n-chat-message-actions,
.n8n-chat .n8n-copilot-user-below-actions:focus-within > .n8n-chat-message-actions {
  opacity: 1;
}
/* Controles copiar: hermano bajo burbuja asistente (ancho sincronizado en JS), abajo-izquierda. */
.n8n-chat .chat-messages-list > .n8n-copilot-from-bot-below-actions {
  align-self: flex-start;
  max-width: min(100%, 42rem);
  margin-right: auto;
  margin-left: 0;
  display: flex;
  justify-content: flex-start;
  align-items: center;
  min-height: 2rem;
  padding-inline: 0.35rem;
  cursor: default;
  box-sizing: border-box;
}
.n8n-chat .n8n-copilot-from-bot-below-actions .n8n-chat-message-actions {
  position: static;
  top: auto;
  right: auto;
  bottom: auto;
  left: auto;
  z-index: 2;
  display: flex;
  width: 100%;
  box-sizing: border-box;
  justify-content: flex-start;
  align-items: center;
  gap: 0.3rem;
  opacity: 0;
  transition: opacity 0.15s ease;
  pointer-events: auto;
}
.n8n-chat .chat-message-from-bot:hover + .n8n-copilot-from-bot-below-actions > .n8n-chat-message-actions,
.n8n-chat .chat-messages-list > .n8n-copilot-from-bot-below-actions:hover > .n8n-chat-message-actions,
.n8n-chat .n8n-copilot-from-bot-below-actions:hover > .n8n-chat-message-actions,
.n8n-chat .n8n-copilot-from-bot-below-actions:focus-within > .n8n-chat-message-actions {
  opacity: 1;
}
.n8n-chat .chat-message-markdown {
  font-size: 0.9375rem !important;
  line-height: 1.65 !important;
  max-width: min(100%, 65ch);
  /* Fallback: if JS table wrapper is missing, keep horizontal scroll here */
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
}
.n8n-chat .chat-message-markdown h1,
.n8n-chat .chat-message-markdown h2,
.n8n-chat .chat-message-markdown h3,
.n8n-chat .chat-message-markdown h4,
.n8n-chat .chat-message-markdown h5,
.n8n-chat .chat-message-markdown h6 {
  margin: 1.15em 0 0.4em !important;
  font-weight: 600 !important;
  letter-spacing: -0.02em;
  line-height: 1.35 !important;
}
.n8n-chat .chat-message-markdown h1 { font-size: 1.0625rem !important; }
.n8n-chat .chat-message-markdown h2 { font-size: 1rem !important; }
.n8n-chat .chat-message-markdown h3 { font-size: 0.9375rem !important; }
.n8n-chat .chat-message-markdown h4,
.n8n-chat .chat-message-markdown h5,
.n8n-chat .chat-message-markdown h6 { font-size: 0.875rem !important; }
.n8n-chat .chat-message-markdown p,
.n8n-chat .chat-message-markdown ul,
.n8n-chat .chat-message-markdown ol {
  margin: 0.45em 0 !important;
}
.n8n-chat .chat-message-markdown > :first-child { margin-top: 0 !important; }
.n8n-chat .chat-message-markdown > :last-child { margin-bottom: 0 !important; }
.n8n-chat .chat-message-markdown ul,
.n8n-chat .chat-message-markdown ol { padding-left: 1.25rem !important; }
.n8n-chat .chat-message-markdown li { margin-bottom: 0.25em !important; }
.n8n-chat .chat-message-markdown ul {
  list-style: disc outside !important;
}
.n8n-chat .chat-message-markdown ol {
  list-style: decimal outside !important;
}
.n8n-chat .chat-message-markdown ul ul {
  list-style-type: circle !important;
}
.n8n-chat .chat-message-markdown ul ul ul {
  list-style-type: square !important;
}
.n8n-chat .chat-message-markdown li {
  display: list-item !important;
}
.n8n-chat .chat-message-markdown li.task-list-item {
  list-style: none !important;
}
/* ── Admonitions (:::type … ::: — materialized by n8n-chat-professional-markdown.ts) ── */
.n8n-chat .n8n-chat-admonition {
  margin: 0.65em 0;
  border-radius: 0.5rem;
  border: 1px solid #e4e4e7;
  border-left-width: 4px;
  background: #fafafa;
  overflow: hidden;
}
.n8n-chat .n8n-chat-admonition__inner {
  padding: 0.65rem 0.85rem 0.75rem;
}
.n8n-chat .n8n-chat-admonition__inner > :first-child {
  margin-top: 0 !important;
}
.n8n-chat .n8n-chat-admonition__inner > :last-child {
  margin-bottom: 0 !important;
}
.n8n-chat .n8n-chat-admonition__title {
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: #334155;
  margin: 0 0 0.5rem;
  line-height: 1.35;
}
.n8n-chat .n8n-chat-admonition__summary {
  cursor: pointer;
  list-style-position: outside;
  padding: 0.35rem 0.15rem 0.5rem;
  margin: -0.15rem -0.15rem 0.35rem;
  border-radius: 0.35rem;
}
.n8n-chat .n8n-chat-admonition__summary:hover {
  background: rgba(15, 23, 42, 0.04);
}
.n8n-chat .n8n-chat-admonition--details > .n8n-chat-admonition__inner {
  padding-top: 0.35rem;
}
.n8n-chat .n8n-chat-admonition--assistant > .n8n-chat-admonition__inner {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.n8n-chat .n8n-chat-admonition--assistant > .n8n-chat-admonition__inner > .n8n-chat-admonition {
  margin-top: 0;
  margin-bottom: 0;
}
.n8n-chat .n8n-chat-admonition--user_message {
  border-left-color: #6366f1;
  background: #eef2ff;
}
.n8n-chat .n8n-chat-admonition--assistant {
  border-left-color: #0d9488;
  background: #f0fdfa;
}
.n8n-chat .n8n-chat-admonition--file {
  border-left-color: #7c3aed;
  background: #f5f3ff;
}
.n8n-chat .n8n-chat-admonition--note {
  border-left-color: #64748b;
  background: #f8fafc;
}
.n8n-chat .n8n-chat-admonition--tip {
  border-left-color: #16a34a;
  background: #f0fdf4;
}
.n8n-chat .n8n-chat-admonition--info {
  border-left-color: #0284c7;
  background: #f0f9ff;
}
.n8n-chat .n8n-chat-admonition--warning {
  border-left-color: #ea580c;
  background: #fff7ed;
}
.n8n-chat .n8n-chat-admonition--details,
.n8n-chat .n8n-chat-admonition--data {
  border-left-color: #475569;
  background: #f8fafc;
}
/* Skill UI Blocks: :::note{level=…} */
.n8n-chat .n8n-chat-admonition--note.n8n-chat-admonition--level-info {
  border-left-color: #0284c7;
  background: #f0f9ff;
}
.n8n-chat .n8n-chat-admonition--note.n8n-chat-admonition--level-success {
  border-left-color: #16a34a;
  background: #f0fdf4;
}
.n8n-chat .n8n-chat-admonition--note.n8n-chat-admonition--level-warning {
  border-left-color: #ea580c;
  background: #fff7ed;
}
.n8n-chat .n8n-chat-admonition--note.n8n-chat-admonition--level-error {
  border-left-color: #dc2626;
  background: #fef2f2;
}
.n8n-chat .n8n-chat-admonition--note.n8n-chat-admonition--level-tip {
  border-left-color: #15803d;
  background: #f0fdf4;
}
/* Callouts sueltos (Docusaurus / agente) */
.n8n-chat .n8n-chat-admonition--success {
  border-left-color: #16a34a;
  background: #f0fdf4;
}
.n8n-chat .n8n-chat-admonition--danger {
  border-left-color: #dc2626;
  background: #fef2f2;
}
.n8n-chat .n8n-chat-admonition--caution {
  border-left-color: #ca8a04;
  background: #fefce8;
}
/* Skill: :::admonition{…} — mismo tono que details */
.n8n-chat .n8n-chat-admonition--admonition {
  border-left-color: #475569;
  background: #f8fafc;
}
/* ── Inline code ──────────────────────────────────────────── */
.n8n-chat .chat-message-markdown :not(pre) > code {
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  font-size: 0.8125rem !important;
  padding: 0.15em 0.42em !important;
  border-radius: 0.3rem;
  background: #eff0f3 !important;
  color: #c2410c !important;
  border: 1px solid #e2e2e8;
}
/* ── Code blocks (enhanced by n8n-chat-professional-markdown.ts) ── */
.n8n-chat .n8n-chat-code-block {
  margin: 0.75em 0;
  border-radius: 0.6rem;
  overflow: hidden;
  border: 1px solid #e4e4e7;
  background: #f8fafc;
}
.n8n-chat .n8n-chat-code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.45rem 0.75rem;
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
  gap: 0.5rem;
}
.n8n-chat .n8n-chat-code-controls {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.n8n-chat .n8n-chat-code-lang-select {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 0.72rem;
  border-radius: 0.35rem;
  border: 1px solid #d1d5db;
  background: #ffffff;
  color: #334155;
  padding: 0.18rem 0.45rem;
  outline: none;
}
.n8n-chat .n8n-chat-code-lang-select:focus-visible {
  border-color: #94a3b8;
  box-shadow: 0 0 0 2px rgba(148, 163, 184, 0.25);
}
.n8n-chat .n8n-chat-code-copy {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.55rem;
  border: 1px solid #d1d5db;
  border-radius: 0.3rem;
  background: #ffffff;
  color: #475569;
  font-size: 0.75rem;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
  line-height: 1.2;
  white-space: nowrap;
}
.n8n-chat .n8n-chat-code-copy:hover {
  color: #1e293b;
  border-color: #94a3b8;
  background: #f8fafc;
}
.n8n-chat .n8n-chat-code-copy--done {
  color: #4ade80 !important;
  border-color: #22c55e66 !important;
}
.n8n-chat .n8n-chat-code-block pre {
  margin: 0 !important;
  padding: 0.9rem 1rem !important;
  border-radius: 0 !important;
  border: none !important;
  background: transparent !important;
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 transparent;
}
.n8n-chat .n8n-chat-code-block pre code.hljs {
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  font-size: 0.8125rem !important;
  line-height: 1.65 !important;
  padding: 0 !important;
  background: transparent !important;
  color: #1e293b;
}
/* Unenhanced pre fallback — before JS wraps it, or if it's still empty/streaming */
.n8n-chat .chat-message-markdown pre:not(:has(> .n8n-chat-code-block)):not([data-n8n-code-enhanced]),
.n8n-chat .n8n-chat-code-block pre {
  margin: 0 !important;
}
/* Pre not yet wrapped by JS */
.n8n-chat .chat-message-markdown > pre,
.n8n-chat .chat-message-markdown p > pre {
  margin: 0.75em 0 !important;
  padding: 0.8rem 1rem !important;
  border-radius: 0.6rem !important;
  background: #f8fafc !important;
  border: 1px solid #e4e4e7 !important;
  overflow-x: auto;
}
.n8n-chat .chat-message-markdown > pre code,
.n8n-chat .chat-message-markdown p > pre code {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 0.8125rem !important;
  color: #1e293b !important;
  background: transparent !important;
  padding: 0 !important;
}
/* ── highlight.js token colors (dark / custom) ───────────── */
.hljs-comment, .hljs-quote { color: #64748b; font-style: italic; }
.hljs-keyword, .hljs-selector-tag, .hljs-literal { color: #7c3aed; }
.hljs-string, .hljs-attr, .hljs-selector-attr { color: #15803d; }
.hljs-number, .hljs-regexp { color: #b45309; }
.hljs-title, .hljs-title.function_, .hljs-title.class_ { color: #2563eb; font-weight: 600; }
.hljs-built_in, .hljs-builtin-name { color: #0f766e; }
.hljs-variable, .hljs-template-variable { color: #be123c; }
.hljs-type, .hljs-class { color: #b45309; }
.hljs-tag { color: #be123c; }
.hljs-name { color: #be123c; }
.hljs-attribute { color: #9a3412; }
.hljs-symbol, .hljs-bullet { color: #15803d; }
.hljs-meta, .hljs-deletion { color: #be123c; }
.hljs-addition { color: #15803d; }
.hljs-emphasis { font-style: italic; }
.hljs-strong { font-weight: 700; }
/* ── Tables ───────────────────────────────────────────────── */
/* Scroll wrapper injected by n8n-chat-professional-markdown.ts */
.n8n-chat .chat-message-markdown .n8n-chat-table-scroll {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  border-radius: 0.55rem;
  border: 1px solid #e4e4e7;
  margin: 0.9em 0;
  scrollbar-width: thin;
  scrollbar-color: #d4d4d8 transparent;
}
/* Fallback: bare table before JS wraps it */
.n8n-chat .chat-message-markdown > table {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
}
.n8n-chat .chat-message-markdown table {
  width: max-content;
  min-width: 100%;
  margin: 0;
  border-collapse: collapse;
  table-layout: auto;
  font-size: 0.8125rem;
}
.n8n-chat .chat-message-markdown thead tr {
  background: #f4f4f6;
}
.n8n-chat .chat-message-markdown th {
  padding: 0.5rem 0.85rem;
  text-align: left;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #52525b;
  border-bottom: 1px solid #e4e4e7;
  white-space: nowrap;
}
.n8n-chat .chat-message-markdown td {
  padding: 0.45rem 0.85rem;
  border-bottom: 1px solid #f0f0f2;
  color: #3f3f46;
  vertical-align: top;
  line-height: 1.5;
  white-space: nowrap;
}
.n8n-chat .chat-message-markdown tbody tr:last-child td { border-bottom: none; }
.n8n-chat .chat-message-markdown tbody tr:hover td { background: #f5f5f8; }
/* Dark mode — no striping, use hover + subtle border separation instead */
.dark .n8n-chat .chat-message-markdown .n8n-chat-table-scroll,
[data-theme="dark"] .n8n-chat .chat-message-markdown .n8n-chat-table-scroll {
  border-color: #3f3f46;
  scrollbar-color: #3f3f46 transparent;
}
.dark .n8n-chat .chat-message-markdown table,
[data-theme="dark"] .n8n-chat .chat-message-markdown table {
  background: #17171b;
}
.dark .n8n-chat .chat-message-markdown thead tr,
[data-theme="dark"] .n8n-chat .chat-message-markdown thead tr {
  background: #1e1e24;
}
.dark .n8n-chat .chat-message-markdown th,
[data-theme="dark"] .n8n-chat .chat-message-markdown th {
  color: #a1a1aa;
  border-bottom-color: #3f3f46;
}
.dark .n8n-chat .chat-message-markdown td,
[data-theme="dark"] .n8n-chat .chat-message-markdown td {
  color: #e4e4e7;
  border-bottom-color: #27272a;
}
.dark .n8n-chat .chat-message-markdown tbody tr:hover td,
[data-theme="dark"] .n8n-chat .chat-message-markdown tbody tr:hover td {
  background: rgba(255,255,255,0.04);
}
/* ── Blockquote ───────────────────────────────────────────── */
.n8n-chat .chat-message-markdown blockquote {
  margin: 0.75em 0 !important;
  padding: 0.6rem 0.9rem !important;
  border-left: 3px solid #d4d4d8 !important;
  background: #f8f8fb;
  border-radius: 0 0.4rem 0.4rem 0;
}
.n8n-chat .chat-message-markdown blockquote p {
  font-size: inherit !important;
  font-style: italic !important;
  color: #52525b !important;
  margin: 0.3em 0 !important;
}
/* ── Links ────────────────────────────────────────────────── */
.n8n-chat .chat-message-markdown a,
.n8n-chat .n8n-chat-auto-link {
  color: #2563eb;
  text-decoration: underline;
  text-underline-offset: 2px;
  text-decoration-color: #93c5fd;
  word-break: break-all;
}
.n8n-chat .chat-message-markdown a:hover,
.n8n-chat .n8n-chat-auto-link:hover {
  color: #1d4ed8;
  text-decoration-color: #3b82f6;
}
/* ── Images ───────────────────────────────────────────────── */
.n8n-chat .chat-message-markdown img {
  display: block;
  max-width: 100%;
  max-height: 28rem;
  height: auto;
  border-radius: 0.6rem;
  border: 1px solid #e4e4e7;
  background: #f4f4f5;
  object-fit: contain;
  margin: 0.75em 0;
  cursor: zoom-in;
  transition: opacity 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}
.n8n-chat .chat-message-markdown img:hover {
  opacity: 0.92;
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
}
.dark .n8n-chat .chat-message-markdown img,
[data-theme="dark"] .n8n-chat .chat-message-markdown img {
  border-color: #3f3f46;
  background: #18181b;
  box-shadow: 0 2px 14px rgba(0,0,0,0.32);
}
/* ── Image lightbox ───────────────────────────────────────── */
.n8n-chat-lightbox {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0,0,0,0.86);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
  backdrop-filter: blur(4px);
}
.n8n-chat-lightbox--open {
  opacity: 1;
  pointer-events: auto;
}
.n8n-chat-lightbox-img {
  max-width: 100%;
  max-height: calc(100vh - 3rem);
  border-radius: 0.75rem;
  object-fit: contain;
  box-shadow: 0 24px 80px rgba(0,0,0,0.5);
  transform: scale(0.95);
  transition: transform 0.2s ease;
}
.n8n-chat-lightbox--open .n8n-chat-lightbox-img {
  transform: scale(1);
}
.n8n-chat-lightbox-close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 9999px;
  border: 1px solid rgba(255,255,255,0.2);
  background: rgba(0,0,0,0.5);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s ease;
}
.n8n-chat-lightbox-close:hover { background: rgba(0,0,0,0.75); }
/* ── HR ───────────────────────────────────────────────────── */
.n8n-chat .chat-message-markdown hr {
  margin: 1.1em 0;
  border: none;
  border-top: 1px solid #e4e4e7;
}
/* ── User bubble: same markdown quality as bot ────────────── */
.n8n-chat .chat-message-from-user .chat-message-markdown {
  font-size: 0.9375rem;
  line-height: 1.65;
  color: inherit;
}
.n8n-chat .chat-message-from-user .n8n-chat-code-block {
  border-color: #1a1a28;
}
.n8n-chat .chat-message-from-user .chat-message-markdown h1,
.n8n-chat .chat-message-from-user .chat-message-markdown h2,
.n8n-chat .chat-message-from-user .chat-message-markdown h3,
.n8n-chat .chat-message-from-user .chat-message-markdown h4,
.n8n-chat .chat-message-from-user .chat-message-markdown h5,
.n8n-chat .chat-message-from-user .chat-message-markdown h6,
.n8n-chat .chat-message-from-user .chat-message-markdown p,
.n8n-chat .chat-message-from-user .chat-message-markdown li,
.n8n-chat .chat-message-from-user .chat-message-markdown th,
.n8n-chat .chat-message-from-user .chat-message-markdown td,
.n8n-chat .chat-message-from-user .chat-message-markdown blockquote p {
  color: inherit !important;
}
.n8n-chat .chat-message-from-user .chat-message-markdown :not(pre) > code {
  background: rgba(255,255,255,0.52) !important;
  border-color: rgba(161,161,170,0.38);
  color: #1f2937 !important;
}
.n8n-chat .chat-message-from-user .chat-message-markdown a,
.n8n-chat .chat-message-from-user .n8n-chat-auto-link {
  color: #1d4ed8;
}
.dark .n8n-chat .chat-message-from-user .chat-message-markdown :not(pre) > code,
[data-theme="dark"] .n8n-chat .chat-message-from-user .chat-message-markdown :not(pre) > code {
  background: rgba(255,255,255,0.08) !important;
  border-color: rgba(161,161,170,0.32);
  color: #e5e7eb !important;
}
.dark .n8n-chat .chat-message-from-user .chat-message-markdown a,
.dark .n8n-chat .chat-message-from-user .n8n-chat-auto-link,
[data-theme="dark"] .n8n-chat .chat-message-from-user .chat-message-markdown a,
[data-theme="dark"] .n8n-chat .chat-message-from-user .n8n-chat-auto-link {
  color: #93c5fd;
  text-decoration-color: #60a5fa;
}
/* Burbuja asistente: ancho al contenido; acciones en hermano .n8n-copilot-from-bot-below-actions. */
.n8n-chat .chat-message[data-n8n-copy-md].chat-message-from-bot:not(:has(.chat-message-markdown.n8n-chat-tool-log-message)) {
  align-self: flex-start;
  width: fit-content;
  max-width: min(100%, 42rem);
}
/* Misma lógica de ancho cuando el markdown del usuario va por React (.n8n-copilot-assistant-md-host). */
.n8n-chat .chat-message[data-n8n-copy-md].chat-message-from-user:not(:has(.chat-message-markdown.n8n-chat-tool-log-message)) {
  align-self: flex-end;
  width: fit-content;
  max-width: min(100%, 42rem);
}
.n8n-chat .n8n-chat-message-action-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
  margin: 0;
  border: 1px solid transparent;
  border-radius: 0.35rem;
  color: #71717a;
  background: transparent;
  box-shadow: none;
  cursor: pointer;
  transition:
    color 0.16s ease,
    background 0.16s ease,
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}
/* Tooltip por botón (data-tooltip desde n8n-chat-copy-markdown.ts) */
.n8n-chat .n8n-chat-message-action-btn[data-tooltip]::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%) translateY(2px);
  z-index: 80;
  padding: 0.3rem 0.5rem;
  border-radius: 0.35rem;
  font-size: 0.7rem;
  font-weight: 500;
  line-height: 1.2;
  letter-spacing: 0.01em;
  white-space: nowrap;
  color: #fafafa;
  background: #18181b;
  border: 1px solid #3f3f46;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.14s ease, transform 0.14s ease;
}
.n8n-chat .n8n-chat-message-action-btn[data-tooltip]:hover::after,
.n8n-chat .n8n-chat-message-action-btn[data-tooltip]:focus-visible::after {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
.dark .n8n-chat .n8n-chat-message-action-btn[data-tooltip]::after,
[data-theme="dark"] .n8n-chat .n8n-chat-message-action-btn[data-tooltip]::after {
  color: #fafafa;
  background: #27272a;
  border-color: #52525b;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
}
.n8n-chat .n8n-chat-message-action-btn:hover {
  color: #3f3f46;
  border-color: #e4e4e7;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}
.n8n-chat .n8n-chat-message-action-btn:focus-visible {
  outline: 2px solid #d4d4d8;
  outline-offset: 1px;
}
.n8n-chat .n8n-chat-copy-markdown-btn--done { color: #15803d; opacity: 1; }
.n8n-chat .n8n-chat-resend-markdown-btn--done { color: #0369a1; opacity: 1; }
/* Controles del composer (attach + send) alineados con estilo admin */
.n8n-chat .chat-inputs-controls {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
  padding-bottom: 0.12rem;
  margin-left: auto;
}
.n8n-chat .chat-input-file-button,
.n8n-chat .chat-input-send-button {
  width: 2.15rem;
  height: 2.15rem;
  min-width: 2.15rem;
  min-height: 2.15rem;
  border-radius: 9999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, color 0.15s ease, opacity 0.15s ease;
  flex-shrink: 0;
}
.n8n-chat .chat-input-file-button {
  border: none;
  background: transparent;
  color: #71717a;
  box-shadow: none;
}
.n8n-chat .chat-input-file-button:hover {
  background: #f4f4f5;
  color: #18181b;
}
.n8n-chat .chat-input-send-button {
  border: none !important;
  background: #18181b !important;
  color: #fafafa !important;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2) !important;
}
.n8n-chat .chat-input-send-button:hover {
  background: #09090b !important;
  color: #fafafa !important;
}
.n8n-chat .chat-input-send-button:active {
  background: #000000 !important;
  color: #fafafa !important;
}
.n8n-chat .chat-input-file-button:focus-visible,
.n8n-chat .chat-input-send-button:focus-visible {
  outline: 2px solid #d4d4d8;
  outline-offset: 1px;
}
.n8n-chat .chat-input-file-button:disabled,
.n8n-chat .chat-input-send-button:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}
.n8n-chat .chat-input-send-button svg {
  width: 1rem;
  height: 1rem;
}
.n8n-chat .chat-input-file-button svg {
  width: 1.15rem;
  height: 1.15rem;
}
/* Mobile overflow guard for composer */
@media (max-width: 768px) {
  .n8n-chat .chat-footer,
  .n8n-chat .chat-layout .chat-footer {
    padding-left: 0.75rem !important;
    padding-right: 0.75rem !important;
    overflow-x: clip !important;
  }
  .n8n-chat .chat-inputs,
  .n8n-chat .chat-footer .chat-inputs,
  .n8n-chat .chat-layout .chat-footer .chat-inputs {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
  }
  .n8n-chat .chat-inputs > textarea,
  .n8n-chat .chat-inputs .chat-input {
    min-width: 0 !important;
    width: 0 !important;
    flex: 1 1 auto !important;
  }
  .n8n-chat .chat-input-file-button svg {
    width: 1.2rem;
    height: 1.2rem;
  }
}
/* UI Blocks (React) in bot bubble — heading scale aligned with ui-blocks-demo */
.n8n-chat .copilot-ui-blocks-in-chat .prose h1 {
  font-size: 1rem !important;
  font-weight: 600 !important;
  line-height: 1.5 !important;
  margin: 0 0 0.35em !important;
  color: inherit !important;
}
.n8n-chat .copilot-ui-blocks-in-chat .prose h2 {
  font-size: 0.875rem !important;
  font-weight: 600 !important;
  line-height: 1.5 !important;
  margin: 0.85em 0 0.35em !important;
  color: #71717a !important;
}
.dark .n8n-chat .copilot-ui-blocks-in-chat .prose h2,
[data-theme="dark"] .n8n-chat .copilot-ui-blocks-in-chat .prose h2 {
  color: #a1a1aa !important;
}
/* :::buttons — cursor (el shell n8n a veces fuerza default) + suavizado si el motion del componente falla. */
.n8n-chat .copilot-ui-blocks-in-chat .copilot-ui-blocks-buttons-row > button:not(:disabled),
.n8n-chat .copilot-ui-blocks-in-chat .copilot-ui-blocks-buttons-row > a {
  cursor: pointer !important;
}
.n8n-chat .copilot-ui-blocks-in-chat .copilot-ui-blocks-buttons-row > button:disabled,
.n8n-chat .copilot-ui-blocks-in-chat .copilot-ui-blocks-buttons-row > span[aria-disabled="true"] {
  cursor: not-allowed !important;
}
/* Indicador "escribiendo" (lib/copilot/n8n-chat-typing-status.ts) */
.n8n-chat .chat-message-typing { max-width: min(100%, 42rem); }
.n8n-chat .n8n-chat-typing-status-text {
  display: inline-block;
  font-size: 0.8125rem;
  line-height: 1.5;
  letter-spacing: 0.01em;
  color: #71717a;
  animation: n8n-chat-typing-pulse 1.8s ease-in-out infinite;
}
@keyframes n8n-chat-typing-pulse {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}
`

/**
 * @n8n/chat base styles are loaded from jsDelivr because the bundled `style.css` uses
 * constructs that break Turbopack's CSS parser when imported in-app.
 * Custom overrides are injected as an inline <style> tag.
 */
export function N8nChatStylesheet() {
  useEffect(() => {
    // Base CSS from CDN
    if (!document.getElementById(LINK_ID)) {
      const link = document.createElement("link")
      link.id = LINK_ID
      link.rel = "stylesheet"
      link.href = `https://cdn.jsdelivr.net/npm/@n8n/chat@${N8N_CHAT_VERSION}/dist/style.css`
      link.crossOrigin = "anonymous"
      document.head.appendChild(link)
    }

    // Custom overrides
    let style = document.getElementById(CUSTOM_STYLE_ID) as HTMLStyleElement | null
    if (!style) {
      style = document.createElement("style")
      style.id = CUSTOM_STYLE_ID
      document.head.appendChild(style)
    }
    // Keep CSS in sync during hot reload/runtime updates.
    style.textContent = CUSTOM_CSS

    return () => {
      document.getElementById(LINK_ID)?.remove()
      document.getElementById(CUSTOM_STYLE_ID)?.remove()
    }
  }, [])

  return null
}
