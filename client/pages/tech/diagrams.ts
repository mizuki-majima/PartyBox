/**
 * 技術者向けページ（/tech）の図の元（Mermaid の文）。
 *
 * 図はコードを読んで書いている。仕組みを変えたら、ここも直す
 * （画面では、各図の下の「Mermaid のソース」にそのまま出る）。
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
    SIOC["Socket.IO クライアント<br/>アプリ全体で1本の接続を共有"]
    GP["プロンプト・グランプリ<br/>Three.js の別ページ"]
    LS -.- SPA --- SIOC
  end

  RP["リバースプロキシ（HTTPS を終端）"]

  subgraph Host["サーバー1台（Docker 上の Node.js 22 プロセス1つ）"]
    direction TB
    EX["Express 5<br/>静的ファイルの配信・/api/*"]
    IO["Socket.IO 4<br/>WebSocket（使えなければポーリング）"]
    RM["RoomManager<br/>ルームの管理・接続の紐付け・レート制限・期限切れの削除"]
    R["Room<br/>参加者・ホスト・ビューの配信"]
    G["GameInstance<br/>BaseGame を継承した各ゲーム<br/>判定・得点・タイマー"]
    RL["ResultLog<br/>勝者の記録"]
    PS["RoomPersister<br/>懇親会のルームを保存"]
    IO --> RM --> R --> G
    RM --> RL
    RM --> PS
    EX -. "/api/results" .-> RL
  end

  ST[("状態の保存先<br/>rooms.json・results.json")]
  ED[("懇親会の設定ディレクトリ<br/>名簿・問題・常設のルーム")]

  SIOC == "WSS: 操作とビュー" ==> RP
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
  Note over S: 名前を検証し、6文字のコードを発行<br/>Room を作成し、ホストを1人目として追加
  S-->>H: ack（session: コード・playerId・token）
  Note over H: session を localStorage に保存し<br/>/room/コード へ移動
  H->>S: room:rejoin（コード・playerId・token）
  Note over S,R: ソケットとプレイヤーを紐付ける（attach）
  R-->>H: room:state（ホスト用のビュー）

  Note over H,P: 招待 URL・QR コードを共有
  P->>S: room:check（コード）
  S-->>P: ack（ゲーム・人数・状態）
  P->>S: room:join（コード・名前）
  Note over S,R: 満員・名前の重複を確認して追加
  S-->>P: ack（session）
  R-->>H: room:state（ホスト用）
  R-->>P: room:state（参加者用）
`;

/** ゲームの操作が全員に届くまで */
export const ACTION_FLOW = `sequenceDiagram
  autonumber
  actor A as 操作した人
  participant S as サーバー（RoomManager）
  participant G as ゲーム（BaseGame）
  participant R as Room
  actor B as ほかの人

  A->>S: game:action（type と内容）
  Note over S: レート制限（5秒に60回まで）<br/>ルームに参加しているかを確認
  S->>G: handleAction（playerId・ホストか）
  alt 今は受け付けない・内容が不正
    G-->>S: UserError
    S-->>A: ack（ok: false と画面に表示する文言）
  else 受け付けた
    Note over G: 判定・得点の計算・フェーズを進める
    G->>R: ctx.update()
    S-->>A: ack（ok: true）
    Note over R: 同じ tick の update を<br/>setImmediate で1回にまとめる<br/>プレイヤーごとに getView（見せてよい情報だけ）
    R-->>A: room:state（A 用）
    R-->>B: room:state（B 用。A の回答などは含まない）
  end
`;

/** 再接続 */
export const RECONNECT = `sequenceDiagram
  autonumber
  actor P as 参加者のスマホ
  participant S as サーバー（RoomManager）
  participant R as Room

  Note over P: 画面を消す・電波が途切れる
  P--xS: 切断（disconnect）
  S->>R: connected = false にして配信
  alt 遊びのゲーム
    Note over S: 3分以内に戻らなければ外す<br/>ホストは30秒でほかの人へ移す
  else 懇親会
    Note over S: 外さない<br/>（最後の操作から7日で削除）
  end

  Note over P: 画面を点ける・電波が戻る
  P->>S: 再接続（Socket.IO が自動で行う）
  P->>S: room:rejoin（localStorage の playerId・token）
  alt token が一致
    S->>R: attach し、退出のタイマーを止める
    R-->>P: room:state（続きから）
  else 一致しない・ルームがない
    S-->>P: ack（ok: false）
    Note over P: 参加情報を消し、参加画面へ
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

  Note over G: setPhase: deadline = 現在時刻 + 長さ<br/>setTimeout（長さ + 猶予）
  G->>R: ctx.update()
  R-->>P: room:state（deadline・duration・serverNow）
  Note over P: offset = serverNow − 端末の時刻
  loop 200ms ごと
    Note over P: 残り = deadline − (端末の時刻 + offset)
  end
  P->>G: 締切の直前に、入力途中の内容を自動で送信
  Note over G: 締切後も、猶予の間は受け付ける<br/>時間切れ・全員完了・ホストの「次へ」は<br/>すべて advance() を通る（二重に進まない）
`;

/** 全ゲーム共通のフェーズ */
export const BASE_STATES = `stateDiagram-v2
  direction TB
  [*] --> START: room:start
  START --> ROUND: 全員の準備OK → 3・2・1 → beginGame()（準備の関門）
  state "ラウンド（内容はゲームごとに異なる）" as ROUND {
    direction LR
    [*] --> INTRO
    INTRO --> INPUT: 時間経過
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
  START --> ROUND_INTRO: 全員の準備OK → 3・2・1
  ROUND_INTRO --> RACE: 1ラウンド目は 3・2・1、2ラウンド目からは全員の準備OK → 3・2・1
  state RACE {
    direction TB
    [*] --> 段
    段 --> 段: 本物の出口・次の段へ
    段 --> ペナルティ: 罠を押した
    ペナルティ --> ペナルティ: 「今すぐ受け取る」（さらに3秒）
    ペナルティ --> 段: 3秒後に「← 戻る」
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

  Note over G: ラウンドの seed から、全員に同じページの並びを生成<br/>段 = 見た目（配る）＋ 当たり判定（配らない）
  R-->>P: room:state（自分の現在の段の見た目・段の開始時刻）
  Note over P: タップ位置を 360×560 の論理座標に変換<br/>t = 段の開始からの経過時間（時計のずれを補正）
  P->>G: game:action（tap・page・step・x・y・t）
  Note over G: page・step が現在と違う（二度押し）なら黙って捨てる<br/>連打は間引く
  Note over G: t を「経過 − 1.5秒」〜「経過」に収め<br/>その時刻の当たり判定を探す
  alt 本物の出口
    Note over G: 次の段・次のページへ<br/>（最後のページならゴール時刻を記録）
  else 次の段へ進むだけ
    Note over G: 次の段へ（ペナルティなし。逃げる ✕ など）
  else 罠（広告）
    Note over G: ペナルティ3秒、引っかかった回数 +1
  else 何もない場所
    Note over G: 何もしない
  end
  G->>R: ctx.update()
  R-->>P: room:state（自分用・全員の進み具合）
  opt ペナルティ中（偽の広告ページ）
    P->>G: game:action（tap・landing: ペナルティの id・x・y）
    alt 3秒たつ前
      Note over G: 何もしない
    else 「← 戻る」
      Note over G: 同じページ・同じ段に戻す
    else 「今すぐ受け取る」
      Note over G: さらに3秒、引っかかった回数 +1
    end
  end
`;
