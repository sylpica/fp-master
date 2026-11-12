/**
 * 要点まとめPDF（用語集の定義・要点・注意点などを分野別に集約した学習資料）。
 * 配信経路（push-files）がUTF-8テキストしか扱えないため、PDFはBase64テキストとして
 * public/pdf64/ に同梱し、開くときに復元して表示する（AI総合マスターと同方式）。
 * Drive保存分とバイト列が一致することはMD5で確認済み。
 */
export const SUMMARY_PDF_B64: Record<2 | 3, string> = {
  2: `${import.meta.env.BASE_URL}pdf64/fp2-summary.b64`,
  3: `${import.meta.env.BASE_URL}pdf64/fp3-summary.b64`,
};

/** Base64テキスト（空白含む）をバイト列へ復元する */
export function decodeBase64ToBytes(text: string): Uint8Array {
  const bin = atob(text.replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** 同梱の要点まとめPDFを新しいタブで開く */
export async function openSummaryPdf(grade: 2 | 3): Promise<void> {
  const w = window.open('', '_blank'); // ポップアップブロック回避のため先に空タブを開く
  try {
    const text = await (await fetch(SUMMARY_PDF_B64[grade])).text();
    const bytes = decodeBase64ToBytes(text);
    const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }));
    if (w) w.location.href = url;
    else window.location.href = url;
  } catch {
    if (w) w.close();
  }
}
