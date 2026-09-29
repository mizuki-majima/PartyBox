/**
 * サーバー側ゲーム登録
 * 新しいゲームを追加するときは:
 *   1. shared/games.ts にメタ情報を追加
 *   2. server/games/<id>/ に BaseGame を継承したクラスを作成
 *   3. ここに1行追加
 *   4. client/games/registry.tsx に画面コンポーネントを登録
 */
import type { GameId } from '../../shared/games';
import { GrowAnswerGame } from './grow-answer/GrowAnswerGame';
import { LiarGame } from './liar/LiarGame';
import { TrialGame } from './trial/TrialGame';
import type { ServerGameDefinition } from './types';
import { UnanimousGame } from './unanimous/UnanimousGame';
import { WhoseAnswerGame } from './whose-answer/WhoseAnswerGame';

const definitions: ServerGameDefinition[] = [
  { id: 'unanimous', create: (ctx, players, settings) => new UnanimousGame(ctx, players, settings) },
  { id: 'whose-answer', create: (ctx, players, settings) => new WhoseAnswerGame(ctx, players, settings) },
  { id: 'liar', create: (ctx, players, settings) => new LiarGame(ctx, players, settings) },
  { id: 'grow-answer', create: (ctx, players, settings) => new GrowAnswerGame(ctx, players, settings) },
  { id: 'ten-sec-trial', create: (ctx, players, settings) => new TrialGame(ctx, players, settings) },
];

const registry = new Map<GameId, ServerGameDefinition>(definitions.map((d) => [d.id, d]));

export function getServerGame(id: GameId): ServerGameDefinition | undefined {
  return registry.get(id);
}
