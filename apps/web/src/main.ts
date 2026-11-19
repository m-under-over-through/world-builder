import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import './app.css';
import App from './App.svelte';
import { startApp } from './lib/boot.ts';
import { manifestHref, pointManifest } from './lib/install.ts';
import { parseRoute } from './lib/route.ts';
import { findWorkshop } from './lib/workshops.ts';

// An app installed from a workshop's page opens at that workshop: its manifest, not the root one
// (apps/web/pwa.ts). Done before anything else, so the browser reads the right one when asked.
// Only in a build: the development server has no manifests at all.
const slug = parseRoute(location.pathname)?.slug;
if (!import.meta.env.DEV && slug && findWorkshop(slug)) pointManifest(document, manifestHref(slug));

// The page carries its own first screen until the app takes over (ADR 0028; lib/boot.ts): taken
// away just before the mount, and put back if the mount throws.
const target = document.getElementById('app')!;
startApp(target, () => mount(App, { target }));

// The service worker keeps the client's files for an installed app (apps/web/pwa.ts); a new
// deploy replaces them on the next open. Registered here, from a module file, because an inline
// script is what the Content Security Policy forbids.
registerSW({ immediate: true });
