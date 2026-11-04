# TEST RESULTS（2026-10-28）

## 2026-11-04 夜（外部監査ラウンド2・ローカル実行）
- 開始時（75be9e4）：npm ci／tsc OK／Vitest 13ファイル 151件／build OK（precache 362件・15,058.09 KiB）／Playwright 142件（iPhone 13 相当＋desktop、4.3分）。
- 修正後：tsc OK／Vitest **14ファイル 169件**／build OK（precache 362件・約15,062 KiB）／Playwright **150件**（4.0分）。追加の内訳は `docs/audit/EXTERNAL_AUDIT_CLAUDE_ROUND2.md` F 節。
- 教材：`check_batch.py j08 j11`（オンライン）引用88件の不一致 0。`npm audit --omit=dev` 0件（開発用に moderate 3系統、R2-L05）。
- 未実施：実機 iPhone Safari・VoiceOver・公開URLでの手動操作。

## 2026-11-04 夕（外部監査の残件 EXT-H01・M08・M12・M13）
GitHub Actions 上で実行（ローカルは npm レジストリに接続できないため不可）。
- PR #30（#28・#29 を含む）の CI：tsc OK／Vitest 13ファイル **151件合格**（+1 changed 問題の出題停止、+1 全用語の example）／build OK（precache 362件・15,058.09 KiB）／Playwright **142件合格**（+ e2e/guide.spec.ts 2件×iPhone・desktop）。
- Content verify（教材変更 PR のオンライン再照合）：PR #27 で引用の不一致 0・生成物一致。#28・#29 の結果は docs/audit/EXTERNAL_AUDIT_CLAUDE.md E3 節。
- データ：選択肢の長さが正答の手掛かりになる問題 262/825（31.8%、上限 0.32）、40%超のバッチ 0。
実行したものだけを記載する。未実施は末尾に明記。

| 種別 | 結果 |
|---|---|
| tsc -b --noEmit | エラーなし |
| Vitest（10ファイル） | 123 passed |
| vite build（PWAプリキャッシュ404件・約17.2MB） | 成功 |
| Playwright iPhone+desktop 全件（a11y含む） | 106 passed（2.5分） |
| npm audit --omit=dev | 脆弱性 0 |

## Playwright（本日追加分）
- `e2e/challenge.spec.ts`：95%チャレンジ（保証しない旨の表示／高難度モード開始→オリジナル表示／初見の正答率が記録・表示／a11y light・dark）
- `e2e/security.spec.ts`：meta CSP 導入後のCSP違反なし、外部ホストへの通信なし
- `e2e/responsive.spec.ts`：幅320/375/768pxで16画面に横スクロールなし
- 既存の `answerCurrent` を複数小問（語群補充：全解答欄＋「解答する」）に対応。**初回実行で「100問ノック」が4分タイムアウトした実バグではなくテスト側の不備**（学科の非四択が混入した）。修正後、同テストを連続2回実行して合格。

## 計測（vite preview・開発機・CPUスロットリング4倍はiPhone相当の目安）
- 起動（ホームの主ボタン表示まで）：desktop 約0.29秒／CPU4倍 約0.70秒、読み込みファイル61件、JSヒープ約11MB
- 問題データ（起動時に全セット読み込み）：生1.9MB／gzip約0.3MB。解説データ(約2.2MB)は遅延読み込み
- ※ネットワーク遅延は含まない。実機（iPhone Safari）・公開URL上の計測は未実施

## データ検証（Vitest内）
FP2オリジナル579問：スキーマ適合・ID一意・全四択に4肢の解説・解説verified・正答位置均衡・非四択の形式要件。

## 未実施・限界
実機iPhone確認、Lighthouse再計測（前回: Performance 84〜85 / A11y 100 / BP 100 / SEO 100）、スクリーンリーダー等の手動a11y確認、公開URL上の動作確認（PRマージ後に実施）。

## 2026-10-28（引き継ぎ再開後に再実行）
tsc エラーなし／Vitest 133 passed（11ファイル）／Playwright 110 passed（iPhone+desktop、a11y・横スクロール含む）。用語リンクの追加分（termlink 単体10・e2e 2×2）を含む。Playwright の Chromium は `/opt/pw-browsers/chromium-1243/chrome-linux64/chrome`。

## 2026-10-28（用語集拡充・法改正追加後）
tsc OK／Vitest 133 passed／build OK／Playwright 110 passed。未実施：実機iPhone、Lighthouse再計測、手動a11y、公開URL確認。

## 2026-11-04（Claude Code 側外部監査・PR #26）
CI（GitHub Actions）で検証：tsc OK／Vitest 148 passed（13ファイル）／build OK（precache 362件・14,981.43 KiB）／Playwright 138 passed（iPhone＋desktop、横スクロール検査を 320〜1920px の8幅に拡大）。本セッションは npm レジストリに接続できずローカル実行は不可。実機・公開URLのブラウザ操作は未実施。詳細は `docs/audit/EXTERNAL_AUDIT_CLAUDE.md`。
