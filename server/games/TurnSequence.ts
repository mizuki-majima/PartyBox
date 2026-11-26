import type { Statement } from '../../shared/games/views';

/**
 * 順番に発言するフェーズの管理（嘘つきは誰だ？ / 10秒裁判 で共通利用）
 * - 退出・オフラインのプレイヤーは自動的に飛ばす
 * - 発言（任意入力）を記録する
 * - laps 周、同じ順番で回る（嘘つきは誰だ？で、1つのお題について何周も話すため。10秒裁判は1周）
 */
export class TurnSequence {
  order: string[] = [];
  index = -1;
  statements: Statement[] = [];
  /** いま何周目か（1 始まり） */
  lap = 1;
  /** 何周するか */
  laps = 1;

  reset(order: string[], laps = 1): void {
    this.order = order;
    this.index = -1;
    this.statements = [];
    this.lap = 1;
    this.laps = Math.max(1, Math.floor(laps) || 1);
  }

  get current(): string | null {
    return this.index >= 0 && this.index < this.order.length ? this.order[this.index] : null;
  }

  /**
   * 次に発言できる人へ進める。周の終わりまで来たら、次の周の先頭へ戻る。
   * 全部の周が終わった・1周ぶん見ても話せる人がいないときは null
   */
  next(canSpeak: (id: string) => boolean): string | null {
    let i = this.index + 1;
    let lap = this.lap;
    let skipped = 0;
    while (skipped <= this.order.length) {
      if (i >= this.order.length) {
        if (lap >= this.laps) break;
        lap += 1;
        i = 0;
        continue;
      }
      if (canSpeak(this.order[i])) {
        this.index = i;
        this.lap = lap;
        return this.current;
      }
      i += 1;
      skipped += 1;
    }
    this.index = this.order.length;
    this.lap = lap;
    return null;
  }

  record(playerId: string, text: string): void {
    if (!text) return;
    // 何周目の発言かは、何周もするときだけ付ける（1周のゲームの記録の形は今までどおり）
    this.statements.push(this.laps > 1 ? { playerId, text, lap: this.lap } : { playerId, text });
  }
}
