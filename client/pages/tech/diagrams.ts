/**
 * 技術者向けページ（/tech）の図の元（Mermaid の文）。
 *
 * 図はコードを読んで書いている。仕組みを変えたら、ここも直す
 * （画面の下の「図の元（Mermaid）」に、そのまま出る）。
 * 公開リポジトリなので、本番の URL・IP・資源の名前・ルームコード・合言葉は書かない。
 *
 * 書き方の約束: サーバーの中だけで済む処理は、自分あての矢印ではなく Note で書く
 * （自分あての矢印は右にはみ出して、スマホで読みにくいため）。図は縦に伸ばす（横に広げない）。
 */

/** システム構成（1台・1プロセス） */
export const ARCHITECTURE = `flowchart TB
  subgraph Browser["ブラウザ（スマホ・PC）"]
    direction LR
    LS[("localStorage<br/>playerId・token")]
    SPA["PartyBox の画面<br/>React 19 の SPA"]
    SIOC["Socket.IO クライアント<br/>アプリで1本を共有"]
    GP["プロンプト・グランプリ<br/>Three.js の別ページ"]
    LS -.- SPA --- SIOC
  end

  RP["リバースプロキシ（HTTPS を終端）"]

  subgraph Host["サーバー 1台・Docker・Node.js 22 のプロセス 1つ"]
    direction TB
    EX["Express 5<br/>画面のファイル・/api/*"]
    IO["Socket.IO 4<br/>WebSocket（だめならポーリング）"]
    RM["RoomManager<br/>ルームの一覧・接続の紐付け・レート制限・片付け"]
    R["Room<br/>参加者・ホスト・配信のまとめ"]
    G["GameInstance<br/>BaseGame を継承した各ゲーム<br/>判定・得点・タイマー"]
    RL["ResultLog<br/>勝者の記録"]
    PS["RoomPersister<br/>懇親会のルームを保存"]
    IO --> RM --> R --> G
    RM --> RL
    RM --> PS
    EX -. "/api/results" .-> RL
  end

  ST[("状態の置き場<br/>rooms.json・results.json")]
  ED[("懇親会の設定の置き場<br/>名簿・問題・常設のルーム")]

  SIOC == "WSS: 操作と画面の中身" ==> RP
  SPA -- "HTTPS" --> RP
  GP -- "HTTPS" --> RP
  RP ==> IO
  RP --> EX
  RL --> ST
  PS --> ST
  RM -. 起動時に読む .-> ED
`;

/** ルームを作る・参加する */
export const CREATE_JOIN = `sequenceDiagram
  autonumber
  actor H as ホストのスマホ
  participant S as サーバー（RoomManager）
  participant R as Room
  actor P as 参加者のスマホ

  H->>S: room:create（gameId・名前）
  Note over S: 名前を確かめ、6文字のコードを作る<br/>Room を作り、ホストを1人目として足す
  S-->>H: ack（session: コード・playerId・token）
  Note over H: session を localStorage に保存し<br/>/room/コード に移る
  H->>S: room:rejoin（コード・playerId・token）
  Note over S,R: ソケットとプレイヤーを結びつける（attach）
  R-->>H: room:state（ホストの分のビュー）

  Note over H,P: 招待の URL・QR コードを送る
  P->>S: room:check（コード）
  S-->>P: ack（ゲーム・人数・状態）
  P->>S: room:join（コード・名前）
  Note over S,R: 満員・同じ名前を確かめて足す
  S-->>P: ack（session）
  R-->>H: room:state（ホストの分）
  R-->>P: room:state（参加者の分）
`;

/** ゲームの操作が全員に届くまで */
export const ACTION_FLOW = `sequenceDiagram
  autonumber
  actor A as 操作した人
  participant S as サーバー（RoomManager）
  participant G as ゲーム（BaseGame）
  participant R as Room
  actor B as ほかの人

  A->>S: game:action（type と中身）
  Note over S: レート制限（5秒に60回まで）<br/>ルームに入っているか
  S->>G: handleAction（playerId・ホストか）
  alt 今はできない・中身がおかしい
    G-->>S: UserError
    S-->>A: ack（ok: false と、画面に出す文言）
  else 受け付けた
    Note over G: 判定・得点・段を進める
    G->>R: ctx.update()
    S-->>A: ack（ok: true）
    Note over R: 同じ tick の update を<br/>setImmediate で1回にまとめる<br/>人ごとに getView（見せてよいものだけ）
    R-->>A: room:state（A の分）
    R-->>B: room:state（B の分。A の回答などは入らない）
  end
`;

/** 再接続 */
export const RECONNECT = `sequenceDiagram
  autonumber
  actor P as 参加者のスマホ
  participant S as サーバー（RoomManager）
  participant R as Room

  Note over P: 画面を消す・電波が切れる
  P--xS: 切断（disconnect）
  S->>R: connected = false にして配信
  alt 遊びのゲーム
    Note over S: 3分たっても戻らなければ外す<br/>ホストなら30秒で、ほかの人へ移す
  else 懇親会
    Note over S: 外さない<br/>（最後の動きから7日で片付け）
  end

  Note over P: 画面を点ける・電波が戻る
  P->>S: 再接続（Socket.IO が自動で）
  P->>S: room:rejoin（localStorage の playerId・token）
  alt token が合う
    S->>R: attach、外すタイマーを止める
    R-->>P: room:state（続きから）
  else 合わない・ルームが無い
    S-->>P: ack（ok: false）
    Note over P: 参加情報を消し、入り直しの画面へ
  end

  Note over P,S: 同じ人が別のタブで開いたとき
  S-->>P: session:replaced（古いタブの画面を止める）
`;

/** タイマーの合わせ方 */
export const TIMER = `sequenceDiagram
  autonumber
  participant G as ゲーム（サーバー）
  participant R as Room
  actor P as スマホ

  Note over G: setPhase: deadline = いま + 長さ<br/>setTimeout（長さ + 猶予）
  G->>R: ctx.update()
  R-->>P: room:state（deadline・duration・serverNow）
  Note over P: offset = serverNow − 端末の時刻
  loop 200ms ごと
    Note over P: 残り = deadline − (端末の時刻 + offset)
  end
  P->>G: 締切の直前に、書きかけを自動で送る
  Note over G: 締切のあとも、猶予の間は受け付ける<br/>時間切れ・全員完了・ホストの「次へ」は<br/>どれも advance() 1つで進む（二重に進まない）
`;

/** 全ゲーム共通のフェーズ */
export const BASE_STATES = `stateDiagram-v2
  direction TB
  [*] --> START: room:start
  START --> ROUND: 4秒の演出のあと beginGame()
  state "ラウンド（ゲームごとに中身が違う）" as ROUND {
    direction LR
    [*] --> INTRO
    INTRO --> INPUT: 時間
    INPUT --> RESULT: 時間切れ・全員完了・ホストの「次へ」
    RESULT --> [*]
  }
  ROUND --> ROUND: 次のラウンド
  ROUND --> GAME_OVER: 最後のラウンドのあと
  ROUND --> GAME_OVER: 2人を下回った（endReason 付き）
  GAME_OVER --> START: room:restart（もう一回）
  GAME_OVER --> [*]: room:backToLobby
`;

/** 広告をすり抜けろ！のフェーズ */
export const AD_DODGE_STATES = `stateDiagram-v2
  direction TB
  [*] --> START
  START --> ROUND_INTRO: 演出のあと
  ROUND_INTRO --> RACE: 3・2・1
  state RACE {
    direction TB
    [*] --> 段
    段 --> 段: 本物の出口・次の段へ
    段 --> 罰: 罠を押した
    罰 --> 罰: 「今すぐ受け取る」（もう3秒）
    罰 --> 段: 3秒のあと「← 戻る」
    段 --> ゴール: 最後のページを抜けた
  }
  RACE --> RESULT: 全員ゴール・時間切れ
  RESULT --> ROUND_INTRO: 次のラウンド
  RESULT --> GAME_OVER: 最後のラウンドのあと
  GAME_OVER --> [*]
`;

/** 広告をすり抜けろ！の当たり判定 */
export const AD_DODGE_HIT = `sequenceDiagram
  autonumber
  actor P as スマホ
  participant G as ゲーム（サーバー）
  participant R as Room

  Note over G: ラウンドの種から、全員に同じページの並びを作る<br/>段 = 見た目（配る）＋ 当たり判定（配らない）
  R-->>P: room:state（自分の今の段の見た目・段の始まりの時刻）
  Note over P: タップの位置を 360×560 の座標に直す<br/>t = 段の始まりからの経過（時計のずれを補正）
  P->>G: game:action（tap・page・step・x・y・t）
  Note over G: page・step が今と違う（二度押し）なら黙って捨てる<br/>連打は間引く
  Note over G: t を「経過 − 1.5秒」〜「経過」に収め<br/>その t のときの当たり判定を探す
  alt 本物の出口
    Note over G: 次の段・次のページへ<br/>（最後ならゴールの時刻を記録）
  else 次の段へ進むだけ
    Note over G: 次の段へ（罰なし。逃げる ✕ など）
  else 罠（広告）
    Note over G: 罰 3秒、ひっかかった回数 +1
  else 何も無い所
    Note over G: 何もしない
  end
  G->>R: ctx.update()
  R-->>P: room:state（自分の分・全員の進み具合）
  opt 罰の間（にせの広告ページ）
    P->>G: game:action（tap・landing: 罰の id・x・y）
    alt 罰の時間の前
      Note over G: 何もしない
    else 「← 戻る」
      Note over G: 同じページ・同じ段に戻す
    else 「今すぐ受け取る」
      Note over G: もう3秒、ひっかかった回数 +1
    end
  end
`;
