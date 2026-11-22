# AWS Lightsail へのデプロイ（CloudFormation）

`partybox.yaml` を CloudFormation でアップロードすると、PartyBox が HTTPS 付きで公開されます。

## 構成

```
スマホ / PC ──HTTPS(WebSocket)──▶ Lightsail (Amazon Linux 2023)
                                   ├─ Caddy   … 443番で受けて自動HTTPS（Let's Encrypt）
                                   └─ PartyBox … Node.js + Socket.IO（Docker）
```

| リソース | 内容 |
|---|---|
| Lightsail インスタンス 1台 | `micro_3_0` = 2vCPU / 1GB / SSD 40GB / 転送 2TB。開けるのは 80・443（と Lightsail のブラウザSSH用 22）だけ |
| 固定IP | Lightsail の Static IP。インスタンスに付けている間は無料 |
| ドメイン | 既定は `<IP>.sslip.io`（無料の自動ドメイン）。独自ドメインも指定できる |

ルームの状態をメモリに持つため、1台で運用します。

## 料金

| プラン | USD/月 | vCPU | RAM | SSD | 転送 |
|---|---|---|---|---|---|
| `nano_3_0` | 5.00 | 2 | 0.5GB | 20GB | 1TB |
| **`micro_3_0`（既定）** | **7.00** | 2 | 1.0GB | 40GB | 2TB |
| `small_3_0` | 12.00 | 2 | 2.0GB | 60GB | 3TB |

転送量と固定IPが込みなので、EC2 構成（t4g.micro で約 13.5 USD/月）より安くなります。
`nano_3_0` は RAM 0.5GB でサーバー内の Docker ビルドが厳しいため、基本は `micro_3_0` 以上を使ってください。

## 作成手順

```bash
aws cloudformation create-stack \
  --stack-name PartyBoxLightsail \
  --template-body file://deploy/lightsail/partybox.yaml \
  --parameters ParameterKey=BundleId,ParameterValue=micro_3_0 ParameterKey=GitBranch,ParameterValue=main
aws cloudformation wait stack-create-complete --stack-name PartyBoxLightsail

# 固定IPを割り当てる（テンプレートでは作るだけ。下の「なぜ2段階か」を参照）
aws lightsail attach-static-ip --static-ip-name partybox-ip --instance-name partybox

# 割り当て後のIPで証明書を取り直す
ssh ec2-user@<StaticIp> 'sudo /opt/partybox/deploy.sh'
```

出力の `Url` が公開URLです。初回はサーバー内のビルドと証明書の取得に 5〜10 分かかります。

### なぜ2段階か

`UserData` から固定IPを参照すると、CloudFormation の循環参照（IP ← インスタンス ← IP）になります。
そのため `deploy.sh` は**実行のたびに自分の公開IPを調べ直す**作りにしてあります。
固定IPを付け替えたあとに流し直せば、Caddy が新しいホスト名で証明書を取り直します。

## 更新（新しいコードを反映）

GitHub の `main` を更新したあと、インスタンスで次を実行します。

```bash
ssh ec2-user@<StaticIp> 'sudo /opt/partybox/deploy.sh'
```

鍵は Lightsail の既定キーペアです。

```bash
aws lightsail download-default-key-pair --query privateKeyBase64 --output text > ls-key.pem && chmod 600 ls-key.pem
ssh -i ls-key.pem ec2-user@<StaticIp>
```

Lightsail コンソールの「ブラウザベースの SSH」からも同じことができます。

更新するとサーバーが再起動しますが、**懇親会のルームはディスクに保存されているので進行は消えません**
（遊びのゲームのルームは消えます）。

## 懇親会の名簿・問題を置く

名簿には実名が入るためリポジトリには置かず、`/opt/partybox/event-data/` に入れます。
置かなければ同梱のサンプルで動きます。

```bash
scp -i ls-key.pem quiz.json bingo.json seats.json ec2-user@<StaticIp>:/tmp/
ssh -i ls-key.pem ec2-user@<StaticIp> 'sudo mv /tmp/*.json /opt/partybox/event-data/ && sudo docker restart partybox'
```

進行中の状態は `/opt/partybox/state/` に保存され、再デプロイや再起動をまたいでも残ります。
**この2つはコンテナにホストから渡しているので、`docker run` を書き換えるときは `-v` を消さないでください。**

## 独自ドメインを使う場合

1. パラメータ `DomainName` に `party.example.com` などを入れてスタックを作成（既存スタックは「更新」でも可）
2. 出力の `StaticIp` に向けて、DNS に A レコードを追加
3. `sudo /opt/partybox/deploy.sh` を実行すると、Caddy がそのドメインで証明書を取ります

## 止める・消す

```bash
# 使わない期間は停止（インスタンス料金は止まらない点に注意。Lightsail は月額制）
aws lightsail stop-instance --instance-name partybox

# 全部消す
aws cloudformation delete-stack --stack-name PartyBoxLightsail
```

> Lightsail は EC2 と違い**月額制**なので、停止しても料金は変わりません。
> 使わない期間が長いなら、スタックごと消すほうが安くなります（再作成は 5〜10 分）。

## トラブルシュート

| 症状 | 確認すること |
|---|---|
| URL が開けない | 作成直後なら 5〜10分待つ。`sudo tail -f /var/log/partybox-setup.log` でビルドの進み具合を見る |
| 証明書エラー | `sudo docker logs caddy`。固定IPを attach したあとに `deploy.sh` を流し直したか |
| アプリのエラー | `sudo docker logs partybox` |
| 懇親会の進行が消えた | `sudo ls -la /opt/partybox/state/` にファイルがあるか。`docker run` の `-v` が消えていないか |
