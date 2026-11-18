export type ActionResult = { ok: boolean; error?: string; message?: string; data?: Record<string, unknown> };

export const fail = (error: string): ActionResult => ({ ok: false, error });
export const done = (message?: string, data?: Record<string, unknown>): ActionResult => ({ ok: true, message, data });

/** DB 함수에서 올라온 오류 문구를 그대로 보여주되 내부 정보는 감춤 */
export function dbError(e: { message?: string } | null | undefined): ActionResult {
  const msg = e?.message ?? '알 수 없는 오류';
  return fail(/[가-힣]/.test(msg) ? msg : `처리 중 오류가 발생했습니다. (${msg.slice(0, 120)})`);
}
