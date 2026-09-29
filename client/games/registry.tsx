/**
 * クライアント側ゲーム画面の登録
 * 新しいゲームを追加するときは、画面コンポーネントをここに1行追加する。
 */
import type { ComponentType } from 'react';
import type { GameId } from '../../shared/games';
import { GrowScreen } from './grow-answer/GrowScreen';
import { LiarScreen } from './liar/LiarScreen';
import { TrialScreen } from './trial/TrialScreen';
import { UnanimousScreen } from './unanimous/UnanimousScreen';
import { WhoseScreen } from './whose-answer/WhoseScreen';

export const GAME_SCREENS: Record<GameId, ComponentType> = {
  'whose-answer': WhoseScreen,
  unanimous: UnanimousScreen,
  liar: LiarScreen,
  'grow-answer': GrowScreen,
  'ten-sec-trial': TrialScreen,
};
