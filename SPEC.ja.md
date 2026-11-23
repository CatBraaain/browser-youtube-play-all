# テストケース

YouTube Play All拡張の必要なテストを選ぶ利用者・開発者・agent向けの仕様。D01〜D03 は `tests/e2e/play-all.test.ts` の E2Eテストとして実装され、`tests/e2e/combinations.ts` の組合せ定義で駆動される。A01・E01・E02 は `tests/e2e/resolution.test.ts` で実行する。

## 適用範囲と凡例

### ナビゲーション経路

次の表は、チャンネルカテゴリページまでの経路全体を示す。D01/D02 でカテゴリの URL を直接開く条件は、レビュー運用節に示す。A01・E01・E02 の hard は、最初に検証するカテゴリの URL を直接開く。「直接読み込み」は完全なページ読み込みを指す。

| 遷移方法 | 検索への移動 | チャンネルhomeへの移動 | カテゴリへの移動 |
| --- | --- | --- | --- |
| hard | 直接読み込み | 直接読み込み | 直接読み込み |
| soft1 | 再読み込みなし | チャンネルのサムネイルから再読み込みなし | 再読み込みなし |
| soft2 | 再読み込みなし | チャンネル名から再読み込みなし | 再読み込みなし |

並び順の選択と公開範囲フィルタの操作はページ遷移ではない。

### テストデバイス

各ケースを次の組合せで確認する。

| 遷移方法・ケース | Chrome desktop | Chrome mobile | Firefox desktop |
| --- | --- | --- | --- |
| hard | 対象 | 対象 | 対象 |
| soft1 | 対象 | 対象 | 対象 |
| soft2 | 対象 | 対象外 | 対象 |
| その他のケース | 対象 | 対象 | 対象 |

### ボタン表示の組合せ

各セルは、そのカテゴリ・並び順・公開範囲で Play All ボタンが表示されるかを示す。カテゴリを行、並び順を列として読む。

| カテゴリ | 公開範囲 | Latest | Popular | Oldest |
| --- | --- | --- | --- | --- |
| Videos | Public | 表示 | 表示 | 表示 |
| Shorts | Public | 表示 | 表示 | 表示 |
| Streams | Public | 表示 | 表示 | 表示 |
| Videos | Members only | 表示 | 非表示 | 表示 |
| Shorts | Members only | 表示 | 非表示 | 表示 |
| Streams | Members only | 表示 | 非表示 | 表示 |

## ケース一覧

以下の D01〜D03 行が対象範囲を定める。E2Eテストが操作・期待結果・撮影箇所を実装する。D03 行より下のケースは自動検証のみを行う。

| ID | 区分 | 対象ページ | カテゴリ | 並び順 | 公開範囲 | 遷移方法 |
| --- | --- | --- | --- | --- | --- | --- |
| D01 | 表示 / リンク先 | メンバーシップのないチャンネル @Apple のカテゴリ | Videos / Shorts / Streams | Latest / Popular / Oldest | Public | hard / soft1 / soft2 |
| D02 | 表示 / リンク先 | メンバーシップのあるチャンネル @NASASpaceFlight のカテゴリ | Videos / Shorts / Streams | Latest / Popular / Oldest | Public / Members only | hard / soft1 / soft2 |
| D03 | 表示 | チャンネルhome（各経路でカテゴリの前に到達） | — | — | Public / Members only | hard / soft1 / soft2 |
| A01 | 非同期 | チャンネルカテゴリ | Videos | Oldest → Latest → Popular | Public / Members only | hard / soft1 / soft2 |
| E01 | エラー | チャンネルカテゴリ | Videos | Oldest → Popular | Public | hard / soft1 / soft2 |
| E02 | エラー | チャンネルカテゴリ | Videos / Shorts / Streams | Latest / Oldest | Members only | hard / soft1 / soft2 |

### A01: Oldest解決の遅延

Videos / Oldest の解決が遅延している間に、視聴者が Oldest、次に Latest、次に Popular を選択する。Oldest の解決が完了する。ボタンは「Play All (Popular)」のままで、選択は Popular にとどまる。Members only でも同様に、選択は保持され、遅延した解決が完了しても上書きされない。

### E01: Oldest解決の失敗

Videos / Oldest 単体が解決できない。Oldest を選択し、表示された「Play All (Oldest) (error)」を押下する。エラーボタンは機能するプレイリストリンクを持たず、押下しても同じページにとどまる。このエラー状態から次の2つの振る舞いを別々に検証する。

- 拡張メニューを開き Videos / Popular を選択すると、プレイリストへ遷移して動画が表示される。
- 元のカテゴリページで YouTube の並び順操作から Popular を選択すると、カテゴリページから離れず、機能する「Play All (Popular)」ボタンが表示される。

### E02: メンバー限定プレイリスト解決の失敗

Members only フィルタが選択中で、そのカテゴリのメンバー限定プレイリスト単体が解決できない。ボタンは、選択中の並び順に応じて「Play All (Latest) (error)」または「Play All (Oldest) (error)」と表示する。

## レビュー運用

E2Eテストが本書のケースを検証する。D01〜D03 は、アサーションと同じ実行内でレビュー画像を撮影する。各画像はケース・チャンネル・カテゴリ・並び順・公開範囲・経路・撮影場面の構造化メタデータを持つ。

D03 は、チャンネルと対応デバイス・経路の組み合わせごとに1回確認する。Videos / Public / Latest のテストで、カテゴリを開く前に確認する。チャンネルhome でトグルによるメニューの開閉を確認する。ボタン表示の組合せ表どおりのエントリ集合、各エントリのリンク、全ボタンが同時に画面内に表示されることを確認する。閉じた状態と開いた状態を撮影し、メニュー外のクリックで閉じることを確認する。

D01/D02 のうち、D03 を含む代表ケース、soft 経路、Members only の Popular ケースは、チャンネルhome を経由する経路全体を通る。ほかの hard ケースはカテゴリの URL を直接開く。対応する全経路でボタンの状態を確認し、表示される場合はリンクも確認する。カテゴリの状態は全経路で撮影する。hard のみ、表示されたボタンを押してリンク先を検証し、プレイリストを撮影する。ギャラリーには soft1・soft2 のプレイリストが検証対象外であることを表示する。アサーションと同じ実行内で viewport 全体を撮影する。スクリーンショットは操作順にテスト結果へ添付する。レビュー対象のtraceは成功時も失敗時も保持し、対象外のテストは失敗時のみtraceを保持する（`trace: "retain-on-failure"`）。モバイルはPixel 5縦向きviewportを維持する。

リンク先の比較は、YouTubeが再生不可と示す行を除外する。Latest並び順では、現在ライブ配信と示す行も除外する（自動生成Latest playlistはVODのみを含むため）。Popular playlistはライブ配信を含むため、除外は行わない。

E2Eギャラリー（`e2e-gallery.html`）は同じ E2E実行のスクリーンショットを表示する。Playwright HTML reportからはスクリーンショットとtraceを参照できる。所有者はスクリーンショットで観測された振る舞いを判断する。アサーションの合否はスクリーンショットの見た目ではなく、ランナーのpass/failに従う。

### レビューの実行と閲覧

`bun run test` は拡張をビルドし、すべての spec・E2Eプロジェクトを Chrome desktop・Chrome mobile・Firefox desktop で実行する。Chrome mobile は soft2経路を skipする（desktop専用のため）。ギャラリーはこの実行で添付された画像を使用する。

`bun run review` はテストを実行せず、Vite でギャラリーを配信する。先に `bun run test` を実行する。Vite が起動時に表示する URL の `e2e-gallery.html`（通常 `http://127.0.0.1:5173/e2e-gallery.html`）で閲覧する。

Play Allボタンの通常・hover・focus時の背景色は、通常のインライン指定より拡張CSSの色を優先する。traceスナップショット内でもこれらの色を維持し、ビューアの対象要素用の枠線を抑制する。他の対象要素のハイライトとクリック位置のマーカーは維持する。
