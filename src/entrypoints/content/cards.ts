import { call } from '../../lib/messages';
import type { PostRef } from '../../lib/jobs/types';
import { cardKey, page, toggleCard } from './page.svelte';

/**
 * Adds selection boxes and "downloaded" marks to the site's post cards
 * (`article.post-card[data-id][data-service][data-user]`). These live in the
 * page's own DOM, so their styles are prefixed and injected once.
 */

const STYLE_ID = 'pdl-card-style';
const CHECK = 'pdl-card-check';
const MARK = 'pdl-card-mark';

const CSS = `
.post-card.pdl-card { position: relative; transition: transform 160ms cubic-bezier(.2,.8,.2,1), box-shadow 160ms cubic-bezier(.2,.8,.2,1); }
.pdl-selecting .post-card.pdl-card { cursor: pointer; }
.pdl-selecting .post-card.pdl-card:hover { transform: translateY(-2px); }
.post-card.pdl-card.pdl-selected { box-shadow: 0 0 0 3px var(--pdl-accent, #8b7cf6), 0 10px 28px -10px var(--pdl-accent, #8b7cf6); border-radius: 10px; }
.${CHECK} { position: absolute; top: 8px; left: 8px; z-index: 5; width: 26px; height: 26px; border-radius: 8px; border: 2px solid rgba(255,255,255,.85); background: rgba(10,12,18,.55); backdrop-filter: blur(4px); display: none; place-items: center; padding: 0; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.4); transition: background-color 140ms ease, border-color 140ms ease, transform 160ms cubic-bezier(.34,1.56,.64,1); }
.${CHECK}:hover { transform: scale(1.08); }
.${CHECK} svg { width: 15px; height: 15px; fill: none; stroke: #fff; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 16; stroke-dashoffset: 16; transition: stroke-dashoffset 200ms cubic-bezier(.16,1,.3,1); }
.pdl-selecting .${CHECK} { display: grid; }
.pdl-selected .${CHECK} { background: var(--pdl-accent, #8b7cf6); border-color: var(--pdl-accent, #8b7cf6); }
.pdl-selected .${CHECK} svg { stroke-dashoffset: 0; }
.${MARK} { position: absolute; top: 8px; right: 8px; z-index: 5; padding: 2px 8px; border-radius: 99px; font: 600 11px/18px 'PDL JetBrains Mono', ui-monospace, monospace; letter-spacing: .02em; color: #fff; background: rgba(18,164,107,.92); box-shadow: 0 2px 8px rgba(0,0,0,.35); pointer-events: none; }
`;

function cardRef(card: HTMLElement): (PostRef & { title: string }) | null {
  const { id, service, user } = card.dataset;
  if (!id || !service || !user) return null;
  const title = card.querySelector('.post-card__header')?.textContent?.trim() ?? '';
  return { service, creatorId: user, postId: id, title };
}

function checkSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M3.5 8.5l3 3 6-7');
  svg.append(path);
  return svg;
}

export interface CardController {
  scan(): void;
  setSelecting(on: boolean): void;
  sync(): void;
  markDownloaded(enabled: boolean, label: string): Promise<void>;
  destroy(): void;
}

export function createCardController(selectLabel: string): CardController {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.append(style);
  }
  const elements = new Map<string, HTMLElement>();
  let lastClicked: number | null = null;

  function onCardClick(event: MouseEvent) {
    if (!page.selecting) return;
    const card = (event.currentTarget as HTMLElement).closest<HTMLElement>('.post-card');
    if (!card) return;
    event.preventDefault();
    event.stopPropagation();
    const ref = cardRef(card);
    if (!ref) return;
    const index = page.cards.findIndex((c) => cardKey(c) === cardKey(ref));
    // Shift-click selects the whole range since the last click.
    if (event.shiftKey && lastClicked !== null && index >= 0) {
      const [from, to] = lastClicked < index ? [lastClicked, index] : [index, lastClicked];
      for (const c of page.cards.slice(from, to + 1)) toggleCard(c, true);
    } else {
      toggleCard(ref);
    }
    lastClicked = index;
    sync();
  }

  function scan() {
    const found: Array<PostRef & { title: string }> = [];
    for (const card of document.querySelectorAll<HTMLElement>('article.post-card[data-id]')) {
      const ref = cardRef(card);
      if (!ref) continue;
      found.push(ref);
      const key = cardKey(ref);
      if (elements.get(key) === card) continue;
      elements.set(key, card);
      card.classList.add('pdl-card');
      if (!card.querySelector(`.${CHECK}`)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = CHECK;
        button.setAttribute('aria-label', selectLabel);
        button.append(checkSvg());
        card.prepend(button);
      }
      card.addEventListener('click', onCardClick, true);
    }
    page.cards = found;
    sync();
  }

  function sync() {
    document.documentElement.classList.toggle('pdl-selecting', page.selecting);
    for (const [key, card] of elements)
      card.classList.toggle('pdl-selected', Boolean(page.selected[key]));
  }

  return {
    scan,
    sync,
    setSelecting(on: boolean) {
      page.selecting = on;
      if (!on) lastClicked = null;
      sync();
    },
    async markDownloaded(enabled, label) {
      for (const card of elements.values()) card.querySelector(`.${MARK}`)?.remove();
      if (!enabled || elements.size === 0) return;
      const keys = [...elements.keys()];
      const known = new Set(
        await call('history:known-posts', { keys }).catch(() => [] as string[]),
      );
      for (const [key, card] of elements) {
        if (!known.has(key)) continue;
        const mark = document.createElement('span');
        mark.className = MARK;
        mark.textContent = label;
        card.append(mark);
      }
    },
    destroy() {
      for (const card of elements.values()) {
        card.removeEventListener('click', onCardClick, true);
        card.classList.remove('pdl-card', 'pdl-selected');
        card.querySelector(`.${CHECK}`)?.remove();
        card.querySelector(`.${MARK}`)?.remove();
      }
      elements.clear();
      document.documentElement.classList.remove('pdl-selecting');
      document.getElementById(STYLE_ID)?.remove();
    },
  };
}
