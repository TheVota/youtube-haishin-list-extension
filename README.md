# YouTube 配信一覧拡張機能

好きな YouTube チャンネルを登録して、配信中・配信予定の枠を Chrome のポップアップからリアルタイムで確認できる拡張機能です。

自分でチャンネルを追加してオリジナルの配信一覧を作れます。

## 主な機能

- YouTube チャンネルを自由に追加
- 配信中の枠と配信予定の枠をタブで切り替え
- 配信中の件数を拡張機能アイコンのバッジに表示
- 配信開始からの経過時間を表示
- 新しい配信順に一覧表示
- YouTube のみ対応

## 導入方法

Chrome ウェブストアには公開していないため、手動で Chrome に読み込みます。

### 1. ファイルをダウンロードする

1. この GitHub ページの右上にある緑色の `Code` ボタンをクリック
2. `Download ZIP` をクリック
3. ダウンロードした ZIP ファイルを右クリックして展開
4. 展開したフォルダを分かりやすい場所に置く

例:

```text
ドキュメント/youtube-haishin-list-extension
```

### 2. Chrome に拡張機能を読み込む

1. Chrome を開く
2. アドレスバーに `chrome://extensions` と入力して Enter
3. 右上の「デベロッパー モード」をオンにする
4. 左上に表示される「パッケージ化されていない拡張機能を読み込む」をクリック
5. さきほど展開したフォルダの中にある `extension` フォルダを選択

選択するのは、リポジトリ全体のフォルダではなく `extension` フォルダです。

```text
youtube-haishin-list-extension/extension
```

読み込みに成功すると、Chrome の拡張機能一覧に `YouTube Live List` が表示されます。

うまく読み込めない場合は、選択しているフォルダが間違っている可能性があります。`manifest.json` が入っている `extension` フォルダを選び直してください。

### 3. チャンネルを追加する

1. Chrome 右上の拡張機能アイコンから `YouTube Live List` を開く
2. ポップアップ右上の「チャンネル追加」をクリック
3. 表示名と YouTube チャンネル URL を入力
4. 「追加」をクリック
5. ポップアップに戻ると、登録したチャンネルの配信中・配信予定が表示されます

表示名は空欄でも使えます。その場合、一覧では YouTube から取得したチャンネル名を表示します。

拡張機能アイコンが見つからない場合は、Chrome 右上のパズルのようなアイコンをクリックして、`YouTube Live List` をピン留めしてください。

## 更新方法

このリポジトリを再ダウンロードした場合は、古いフォルダを新しいフォルダに置き換えてから、`chrome://extensions` の `YouTube Live List` にある再読み込みボタンを押してください。

## チャンネルの追加方法

設定画面では、以下の形式でチャンネルを追加できます。

```text
https://www.youtube.com/@handle
https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx
@handle
```

表示名を空欄にした場合でも、一覧では YouTube から取得したチャンネル名を表示します。

## フォルダ構成

```text
extension/
  manifest.json
  popup.html
  popup.css
  popup.js
  options.html
  options.css
  options.js
  background.js
  shared.js
  icons/
```

Chrome に読み込む対象は `extension` フォルダです。

## よくあるつまずき

### 「マニフェスト ファイルが見つからない」と表示される

選択するフォルダが違います。`youtube-haishin-list-extension` フォルダそのものではなく、その中にある `extension` フォルダを選択してください。

### チャンネルを追加しても何も表示されない

登録したチャンネルに現在の配信中・配信予定がない場合、一覧は空になります。別のチャンネルを追加するか、時間をおいて更新ボタンを押してください。

### 拡張機能を更新したのに表示が変わらない

`chrome://extensions` を開き、`YouTube Live List` の再読み込みボタンを押してください。

## 注意事項

- この拡張機能は非公式ツールです。
- YouTube のページ構造を読み取って表示しているため、YouTube 側の仕様変更で動かなくなる可能性があります。
- API キーは使用していません。
- 登録したチャンネル情報は Chrome のローカルストレージに保存されます。

## ライセンス

MIT License
