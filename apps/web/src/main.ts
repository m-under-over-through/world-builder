import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import './app.css';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });

// The service worker keeps the client's files for an installed app (apps/web/pwa.ts); a new
// deploy replaces them on the next open. Registered here, from a module file, because an inline
// script is what the Content Security Policy forbids.
registerSW({ immediate: true });
