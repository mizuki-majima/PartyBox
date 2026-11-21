/**
 * DOM を組み立てる小さなヘルパー。
 * 文字列の子要素は必ずテキストノードとして追加する（innerHTML は使わない）ので、
 * ユーザーの入力や LLM の出力をそのまま渡しても HTML として解釈されない（XSS 対策）。
 */
type Child = Node | string | number | null | undefined | false;

interface Props {
  class?: string;
  text?: string;
  attrs?: Record<string, string>;
  style?: Partial<CSSStyleDeclaration>;
  on?: { [K in keyof HTMLElementEventMap]?: (ev: HTMLElementEventMap[K]) => void };
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) el.setAttribute(k, v);
  if (props.style) Object.assign(el.style, props.style);
  if (props.on) {
    for (const [type, fn] of Object.entries(props.on)) el.addEventListener(type, fn as EventListener);
  }
  append(el, ...children);
  return el;
}

export function append(parent: Node, ...children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    parent.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** 文字列を表示用に差し替える（textContent 経由なので安全） */
export function setText(el: Element, text: string): void {
  el.textContent = text;
}
