# AWS へのデプロイ（CloudFormation）

`partybox.yaml` を AWS コンソールでアップロードするだけで、PartyBox が HTTPS 付きで公開されます。

## 構成

```
スマホ / PC ──HTTPS(WebSocket)──▶ EC2 (Amazon Linux 2023, arm64)
                                   ├─ Caddy   … 443番で受けて自動HTTPS（Let's Encrypt）
                                   └─ PartyBox … Node.js + Socket.IO（Docker）
```

| リソース | 内容 |
|---|---|
| VPC / サブネット / セキュリティグループ | PartyBox 専用。開放するのは 80・443 番ポートだけ |
| EC2 1台 + Elastic IP | 固定IP。ルームの状態をメモリに持つため1台で運用する |
| IAM ロール | Session Manager で操作するためのもの（SSH鍵は不要） |
| ドメイン | 既定は `<IP>.sslip.io`（無料の自動ドメイン）。独自ドメインも指定できる |

## 作成手順（コンソール操作のみ）

1. **先に PR をマージ**して、`main` にコードが入っている状態にする（マージ前なら手順4で `GitBranch` に作業ブランチ名を入れる）
2. AWS コンソール → **CloudFormation** → リージョンを選択（例: 東京 `ap-northeast-1`）
3. 「スタックの作成」→「新しいリソースを使用」→「テンプレートファイルのアップロード」で `deploy/aws/partybox.yaml` を選択
4. スタック名（例: `partybox`）を入力。パラメータは基本的に既定値のままで OK
5. 最後の画面で「IAM リソースが作成される場合があることを承認します」にチェック → 送信
6. 作成完了（約3分）後、**「出力」タブの `Url`** を開く
   - 初回はサーバー内でのビルドと証明書の取得に **さらに5〜10分** かかります。つながらない場合は少し待ってから再読み込みしてください

## 更新（新しいコードを反映）

GitHub の `main` を更新したあと、次のどちらかを実行します。

- **EC2 → インスタンス → 接続 → Session Manager** でつなぎ、次を実行
  ```bash
  sudo /opt/partybox/deploy.sh
  ```
- **Systems Manager → Run Command → `AWS-RunShellScript`** で対象インスタンスに `/opt/partybox/deploy.sh` を実行

更新するとサーバーが再起動するため、遊んでいる最中のルームは消えます。

## 独自ドメインを使う場合

1. パラメータ `DomainName` に `party.example.com` などを入力してスタックを作成（既存スタックは「更新」でも可）
2. 出力の `PublicIp` に向けて、DNS に A レコードを追加
3. DNS が反映されると、Caddy が自動で証明書を取得します

## 料金の目安

`t4g.small`（既定値）なら、EC2・固定IP・ディスクの合計で月 **2,000〜3,500円程度** です（24時間起動した場合）。
`t4g.micro` にすると約半分になります。料金はリージョンや為替で変わるため、[AWS料金計算ツール](https://calculator.aws/) で確認してください。

使わない期間はインスタンスを停止すると EC2 の料金を抑えられます（固定IPとディスクの料金は発生します）。

## 削除

CloudFormation でスタックを削除すると、作成したリソースがすべて消えます。

## トラブルシュート

| 症状 | 確認すること |
|---|---|
| URL が開けない | 作成直後なら 5〜10分待つ。Session Manager で `sudo tail -f /var/log/partybox-setup.log` を見てビルドの進み具合を確認 |
| 証明書エラー | `sudo docker logs caddy`。80・443番が開いているか、独自ドメインなら A レコードが正しいか |
| アプリのエラー | `sudo docker logs partybox` |
