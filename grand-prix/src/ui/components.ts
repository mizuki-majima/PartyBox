import { STAT_KEYS, STAT_LABELS, LIMITS, type CarBlueprint, type CarStats } from '../blueprint/types';
import { sfx } from '../audio/Sfx';
import { h } from './dom';

const STAT_COLORS: Record<(typeof STAT_KEYS)[number], string> = {
  speed: '#ff5a5a',
  acceleration: '#ffb020',
  handling: '#3fa7ff',
  stability: '#5cc94a',
};

/** 性能を「積み木のブロック」で見せるバー */
export function statBars(stats: CarStats): HTMLElement {
  return h(
    'div',
    { class: 'stats' },
    ...STAT_KEYS.map((k) =>
      h(
        'div',
        { class: 'stat' },
        h('span', { class: 'stat-label', text: STAT_LABELS[k] }),
        h(
          'span',
          { class: 'stat-blocks', attrs: { 'aria-label': `${STAT_LABELS[k]} ${stats[k]}` } },
          ...Array.from({ length: LIMITS.statMax }, (_, i) =>
            h('i', { class: i < stats[k] ? 'on' : '', style: i < stats[k] ? { background: STAT_COLORS[k] } : {} }),
          ),
        ),
        h('span', { class: 'stat-value', text: String(stats[k]) }),
      ),
    ),
  );
}

/** 車の名刺（名前・コンセプト・性能・性格・ひとこと） */
export function carCard(bp: CarBlueprint, opts: { badge?: string; compact?: boolean } = {}): HTMLElement {
  return h(
    'div',
    { class: `car-card${opts.compact ? ' compact' : ''}` },
    opts.badge ? h('div', { class: 'card-badge', text: opts.badge }) : null,
    h('div', { class: 'car-name', text: bp.name }),
    h('div', { class: 'car-concept', text: bp.concept }),
    statBars(bp.stats),
    h('div', { class: 'car-personality' }, h('b', { text: 'せいかく' }), bp.personality),
    h('div', { class: 'car-catch', text: `「${bp.catchphrase}」` }),
  );
}

/** PartyBox のトップ（ゲーム一覧）へ戻るリンク。このゲームは PartyBox とは別のページなので、ページごと移動する */
export function homeLink(variant: 'corner' | 'inline'): HTMLAnchorElement {
  return h('a', {
    class: `home-link home-link-${variant}`,
    text: variant === 'corner' ? '← PartyBox' : 'PartyBox のほかのゲームで遊ぶ',
    attrs: { href: '/', 'data-testid': `home-link-${variant}` },
  });
}

export function button(label: string, onClick: () => void, variant = 'primary'): HTMLButtonElement {
  return h('button', {
    class: `btn btn-${variant}`,
    text: label,
    attrs: { type: 'button' },
    on: {
      click: () => {
        sfx.click();
        onClick();
      },
    },
  });
}
