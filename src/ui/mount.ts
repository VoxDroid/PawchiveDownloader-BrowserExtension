import { mount, type Component } from 'svelte';
import { startApp } from './state/app.svelte';
import './styles/theme.css';
import './styles/base.css';
import './styles/page.css';

/** Starts shared state, then mounts a page's root component into #app. */
export async function mountPage(App: Component): Promise<void> {
  const target = document.getElementById('app');
  if (!target) throw new Error('#app is missing');
  await startApp();
  await document.fonts?.load('13px "PDL JetBrains Mono"').catch(() => undefined);
  mount(App, { target });
}
