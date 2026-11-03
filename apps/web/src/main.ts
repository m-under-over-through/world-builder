import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import './app.css';
import App from './App.svelte';
import { manifestHref, pointManifest } from './lib/install.ts';
import { parseRoute } from './lib/route.ts';
import { findWorkshop } from './lib/workshops.ts';

// An app installed from a workshop's page opens at that workshop: its manifest, not the root one
// (apps/web/pwa.ts). Done before anything else, so the browser reads the right one when asked.
const slug = parseRoute(location.pathname)?.slug;
if (slug && findWorkshop(slug)) pointManifest(document, manifestHref(slug));

mount(App, { target: document.getElementById('app')! });

// The service worker keeps the client's files for an installed app (apps/web/pwa.ts); a new
// deploy replaces them on the next open. Registered here, from a module file, because an inline
// script is what the Content Security Policy forbids.
registerSW({ immediate: true });
