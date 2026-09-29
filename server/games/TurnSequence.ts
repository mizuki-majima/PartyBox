import type { Statement } from '../../shared/games/views';

/**
 * 順番に発言するフェーズの管理（嘘つきは誰だ？ / 10秒裁判 で共通利用）
 * - 退出・オフラインのプレイヤーは自動的に飛ばす
 * - 発言（任意入力）を記録する
 */
export class TurnSequence {
  order: string[] = [];
  index = -1;
  statements: Statement[] = [];

  reset(order: string[]): void {
    this.order = order;
    this.index = -1;
    this.statements = [];
  }

  get current(): string | null {
    return this.index >= 0 && this.index < this.order.length ? this.order[this.index] : null;
  }

  /** 次に発言できる人へ進める。全員終わったら null */
  next(canSpeak: (id: string) => boolean): string | null {
    let i = this.index + 1;
    while (i < this.order.length && !canSpeak(this.order[i])) i++;
    this.index = i;
    return this.current;
  }

  record(playerId: string, text: string): void {
    if (text) this.statements.push({ playerId, text });
  }
}
