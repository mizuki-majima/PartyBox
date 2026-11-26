import type { PartyEventView } from '../../../shared/games/views';

/**
 * 参加者の「いまやること」を1文で。リハーサルで「どこを押したらいいの」となったため、
 * 企画と段に合わせて、押すもの・待つことだけを言う（押せないものを押せと言わない）
 */
export function nowText(game: PartyEventView): string {
  const me = game.seats.myPersonId ? game.seats.roster.find((p) => p.id === game.seats.myPersonId) : null;
  switch (game.section) {
    case 'quiz': {
      const q = game.quiz;
      if (q.phase === 'idle') return 'まもなくクイズです。そのまま待ちましょう';
      if (q.phase === 'question') return '問題を読みましょう（まだ答えられません）';
      if (q.phase === 'answering') {
        if (!q.myTeam) return '下で、自分のチームを押しましょう';
        return q.question?.choices ? 'チームで相談して、下の答えを押しましょう' : 'チームで相談して、下に答えを書いて「送信する」を押しましょう';
      }
      if (q.phase === 'reveal') return '答えと、みんなの回答を見てみましょう';
      return '結果発表です';
    }
    case 'seats':
      if (!me) return '名簿から、自分の名前を押しましょう';
      if (me.absent) return '欠席になっています。司会に声をかけてください';
      if (game.seats.noSeat.some((p) => p.id === me.id)) return '席が足りませんでした。司会の案内を待ちましょう';
      if (me.table == null) return '下の「くじを引く」を押しましょう';
      return '出たテーブルへ移動しましょう';
    case 'bingo':
      return '読まれた番号がカードにあれば、そのマスを押して開けましょう';
    default:
      return '何も押さずに、司会の合図を待ちましょう';
  }
}
