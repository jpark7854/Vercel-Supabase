/** Resend 로 메일 발송. RESEND_API_KEY 가 없으면 보내지 않고 'skipped' 로 기록합니다. */
export async function sendMail(to: string, subject: string, html: string): Promise<{ status: 'sent' | 'skipped' | 'failed'; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(`[메일 미발송 — RESEND_API_KEY 없음] to=${to} subject=${subject}`);
    return { status: 'skipped', error: 'RESEND_API_KEY 미설정' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.MAIL_FROM || 'onboarding@resend.dev', to: [to], subject, html }),
    });
    if (!res.ok) return { status: 'failed', error: `${res.status} ${(await res.text()).slice(0, 300)}` };
    return { status: 'sent' };
  } catch (e) {
    return { status: 'failed', error: String(e).slice(0, 300) };
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function mailTemplate(opts: {
  heading: string; contactName: string; lines: string[]; url: string; buttonText: string;
}): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#1f2937">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="background:#fff;border-radius:12px;padding:28px;border:1px solid #e5e7eb">
    <p style="margin:0 0 4px;color:#6b7280;font-size:13px">명성코퍼레이션 디자인 포털</p>
    <h1 style="margin:0 0 20px;font-size:20px">${esc(opts.heading)}</h1>
    <p style="margin:0 0 12px">${esc(opts.contactName)} 님, 안녕하세요.</p>
    ${opts.lines.map((l) => `<p style="margin:0 0 8px;line-height:1.6">${esc(l)}</p>`).join('')}
    <p style="margin:24px 0"><a href="${esc(opts.url)}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${esc(opts.buttonText)}</a></p>
    <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6">
      접속 비밀번호는 보안을 위해 이 메일에 포함하지 않았습니다. 담당자에게 카카오톡·문자·전화 등으로 별도로 받으신 비밀번호를 입력해 주세요.<br>
      본인이 받을 메일이 아니라면 이 메일을 삭제해 주세요.
    </p>
  </div>
</div></body></html>`;
}
