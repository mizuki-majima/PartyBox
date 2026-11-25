# AGENTS.md

このリポジトリで作業するエージェント向けの約束ごとは [CLAUDE.md](CLAUDE.md) にまとめています。作業の前に必ず読んでください。

特に次の2点は守ってください。

- **このリポジトリは公開（Public）**。実名の名簿・本番のクイズ・本番の URL や AWS の情報・司会用URL・会社名をコミットしない（実データと本番の運用メモは非公開リポジトリ `mizuki-majima/party-app-aws` の `docs/partybox.md` と `data/`）
- パッケージは **npm**。変えたら `npm run typecheck` と `npm test`、画面を変えたら関係する E2E（`npm run test:e2e`）を流し、`main` へは PR で入れる
