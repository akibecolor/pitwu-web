// 型定義を提供しないサードパーティ製モジュールのアンビエント宣言。
declare module 'to-ico' {
  /** PNG バッファ（複数可）を ICO バッファに変換する。 */
  export default function toIco(
    input: Buffer | Buffer[],
    options?: { resize?: boolean; sizes?: number[] }
  ): Promise<Buffer>;
}
