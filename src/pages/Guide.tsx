import { Link } from 'react-router';
import { CALC_GENERATORS } from '../domain/calc';
import { FIELDS } from '../domain/exam';
import { PageTitle } from '../ui/Layout';
import { TermPopupProvider, TermText } from '../ui/TermText';

/**
 * アプリ内「詳しい説明書」モード。
 * 使い方・学習の流れ・計算トレーニング（シミュレーション型演習）の考え方と根拠・
 * 正確性ポリシーを、アプリ内で完結して読めるようにしたページ。
 * 計算種別の一覧は生成器の実データ（題名・分野・基準・出典）から描くため、
 * 生成器が増減しても説明が古くならない。
 */
export function GuidePage() {
  return (
    <TermPopupProvider>
    <div className="space-y-4 text-sm leading-relaxed">
      <PageTitle sub="このアプリの使い方と、学習が進む仕組みの詳しい説明です。">詳しい説明書</PageTitle>

      <section className="card space-y-2">
        <h2 className="font-bold">学習の流れ（おすすめの使い方）</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>「設定」で受験する級（3級／2級）・科目（学科／実技）・受験予定日・1日の目標問題数を決めます。</li>
          <li>ホームの「すぐに5問解く」か「通常演習」で、その日の学習を始めます。迷ったらまず5問です。</li>
          <li>間違えた問題は「間違いノート」と復習スケジュール（SM-2方式）に自動で積まれます。翌日以降は「苦手問題の復習」から先に片付けます。</li>
          <li>計算が要る問題は「計算トレーニング」で別に鍛えます（下の「計算問題の扱い」参照）。</li>
          <li>週に一度は「模擬試験」で本試験形式を通し、「成績分析」と「学習計画」で弱い分野と残り日数を確認します。</li>
        </ol>
      </section>

      <section className="card space-y-2">
        <h2 className="font-bold">通常演習と計算問題の扱い</h2>
        <p><TermText>
          通常演習に出るのは、原則として計算操作が不要な知識問題だけです。計算が必要な問題は学習のテンポを分けるため「計算トレーニング」に分離しています。設定の「通常演習にも計算問題を含める」をオンにすると通常演習にも混ざります（初期状態はオフ）。
        </TermText></p>
        <p><TermText>模擬試験は設定にかかわらず、本試験に合わせて計算問題を含みます。数値が出てくるだけの知識問題は計算問題には数えません。</TermText></p>
      </section>

      <section className="card space-y-2">
        <h2 className="font-bold">計算トレーニング（シミュレーション型の計算演習）</h2>
        <p><TermText>
          計算トレーニングは、数値を毎回変えて出題するシミュレーション型の演習です。答えは暗記するものではなく、検証済みの計算ロジックがその場で算出します。同じ種別を繰り返すと「どの公式を・どの順で使うか」が身につきます。難易度は基本／標準／応用、種別ごとの正答率が記録され、正答率の低いパターンは「苦手パターン優先」で先に出題されます。
        </TermText></p>
        <p><TermText>解答後は、計算の手順（ステップ）と公式・その意味が表示されます。間違えたら、答えの数値ではなく「最初のステップで何を置いたか」を見直してください。</TermText></p>
        <h3 className="label">計算種別と根拠（全{CALC_GENERATORS.length}種）</h3>
        <ul className="space-y-2">
          {CALC_GENERATORS.map((g) => (
            <li key={g.id} className="border-b border-slate-100 pb-2 last:border-0 dark:border-slate-800">
              <div className="font-medium">
                {g.title}（{FIELDS[g.field].name}）
              </div>
              <div className="text-slate-600 dark:text-slate-400">基準：<TermText text={g.basis} /></div>
              <div className="text-slate-600 dark:text-slate-400">
                出典：
                {g.sources.map((s) => (
                  <a key={s.url} className="mr-2 underline" href={s.url} target="_blank" rel="noreferrer">
                    {s.title}
                  </a>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <p>
          <Link to="/calc" className="underline">
            計算トレーニングを開く
          </Link>
        </p>
      </section>

      <section className="card space-y-2">
        <h2 className="font-bold">模擬試験と到達度</h2>
        <p><TermText>
          模擬試験は、級・科目ごとに本試験の形式（時間・問題数・合格基準）で通して解くモードです。結果画面では分野別の正答率と前回比較が見られます。「成績分析」の到達度は、これまでの演習・模試の実績から分野ごとの仕上がりを示す目安で、合否を保証するものではありません。
        </TermText></p>
        <p><TermText>2級学科では「95%チャレンジ」も用意しています。高難度・初見の問題への対応力を鍛えるモードで、通常の模擬試験とは目的が異なります。目標との差は、初めて解いた問題の正答率（初見正答率）で表示し、「達成」の判定は初見で100問以上解いてから行います。</TermText></p>
      </section>

      <section className="card space-y-2">
        <h2 className="font-bold">復習の仕組み</h2>
        <p><TermText>
          復習はSM-2方式（忘却に合わせて間隔を広げる間隔反復）でスケジュールされます。間違えた問題、ブックマークした問題、メモを付けた問題はそれぞれ「間違いノート」「ブックマーク・後で復習」からいつでも見返せます。解説には簡潔／標準／詳細の表示切り替えがあり、設定で初期表示を選べます。
        </TermText></p>
      </section>

      <section className="card space-y-2">
        <h2 className="font-bold">用語集と「根拠照合済み」表示</h2>
        <p><TermText>
          問題文・解説の中の用語はタップ（クリック）すると、その場で定義が開きます。キーボードでは、用語ボタンから開き、Escキーで閉じると元の用語ボタンにフォーカスが戻ります。Tabキーの移動はポップアップの中に閉じています。
        </TermText></p>
        <p><TermText>
          解説・用語・暗記カードには「根拠照合済み」「要確認」の表示があります。「根拠照合済み」は、根拠資料の引用を公式ページの本文と機械的に照合できたものだけに付きます。「要確認」は照合が終わっていないもので、鵜呑みにせず出典で確認してください。公式の過去問題の正答は、日本FP協会の公表解答と照合したものだけを収録し、判読できない問題は出題しないよう隔離しています。オリジナル問題には「オリジナル問題」と明示します。
        </TermText></p>
        <p>
          <Link to="/glossary" className="underline">
            用語集を開く
          </Link>
          　／　
          <Link to="/about" className="underline">
            出典と利用条件
          </Link>
        </p>
      </section>

      <section className="card space-y-2">
        <h2 className="font-bold">制度改正と法令基準日</h2>
        <p><TermText>
          FP試験の法令基準日は受検時期で決まります（例：2026年6月〜2027年5月受検は2026年4月1日）。「制度改正情報・法令基準日」では、確認済みの改正と既存問題への影響判定を一覧できます。過去問題は出題された当時の法令に基づくため、現行制度と答えが異なる場合がある点に注意してください。
        </TermText></p>
      </section>

      <section className="card space-y-2">
        <h2 className="font-bold">データの保存とバックアップ</h2>
        <p><TermText>
          学習記録はこの端末のブラウザ内だけに保存され、外部に送信されません。端末を変えるときや、ブラウザのデータを消す前には、必ず「データ管理」からバックアップを書き出してください。復元も同じ画面から行えます。「統合する」は今の記録を残したまま、バックアップにしかない記録を追加します（同じ問題の復習予定・メモなどは、更新日時が新しい方を残します）。「置き換える」は今の記録を削除してバックアップの内容にします。置き換える直前の記録は自動でファイルに書き出されます。一度インストール（ホーム画面に追加）すれば、オフラインでも学習できます。
        </TermText></p>
        <p>
          <Link to="/data" className="underline">
            データ管理を開く
          </Link>
        </p>
      </section>
    </div>
    </TermPopupProvider>
  );
}
