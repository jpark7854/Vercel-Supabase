'use client';
import { useState } from 'react';
import { ActionForm, Submit } from '@/components/ActionForm';
import { PERMISSION_HELP, PERMISSION_LABEL, type Permission } from '@/lib/labels';
import type { ActionResult } from '@/lib/action';

type Contact = { id: string; name: string; email: string; vendor: string };

export function IssueLinkForm({ action, contacts, hasSentVersion }: { action: (fd: FormData) => Promise<ActionResult>; contacts: Contact[]; hasSentVersion: boolean }) {
  const [issued, setIssued] = useState<{ url: string; password: string; contact: string } | null>(null);
  const [contactName, setContactName] = useState('');
  const [copied, setCopied] = useState('');
  const copy = async (k: string, v: string) => {
    await navigator.clipboard.writeText(v);
    setCopied(k);
    setTimeout(() => setCopied(''), 1500);
  };
  const defaultExpiry = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10);

  return (
    <div className="card">
      <h3 className="h2 mb-3">업체 담당자별 링크 발급</h3>
      {issued ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="mb-1 font-bold">⚠ 비밀번호는 지금 한 번만 표시됩니다.</p>
            <p>서버에는 비밀번호가 암호화(해시)되어 저장되므로 다시 볼 수 없습니다. <b>링크와 비밀번호는 서로 다른 채널로 전달하세요.</b> 예) 링크는 메일, 비밀번호는 카카오톡·문자·전화.</p>
          </div>
          <p className="text-sm font-medium">{issued.contact}</p>
          <div>
            <label className="label">링크</label>
            <div className="flex gap-2"><input readOnly value={issued.url} className="input font-mono text-xs" /><button className="btn" onClick={() => copy('url', issued.url)}>{copied === 'url' ? '복사됨' : '복사'}</button></div>
          </div>
          <div>
            <label className="label">비밀번호</label>
            <div className="flex gap-2"><input readOnly value={issued.password} className="input font-mono text-lg tracking-widest" /><button className="btn" onClick={() => copy('pw', issued.password)}>{copied === 'pw' ? '복사됨' : '복사'}</button></div>
          </div>
          <button className="btn self-start" onClick={() => setIssued(null)}>확인했습니다 (닫기)</button>
        </div>
      ) : (
        <ActionForm
          action={action}
          className="grid gap-3 sm:grid-cols-2"
          onResult={(r) => {
            if (r.ok && r.data) setIssued({ url: String(r.data.url), password: String(r.data.password), contact: contactName });
          }}
        >
          <div className="sm:col-span-2">
            <label className="label">업체 담당자</label>
            <select name="contact_id" required defaultValue="" className="input" onChange={(e) => setContactName(e.target.selectedOptions[0]?.text ?? '')}>
              <option value="" disabled>선택</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.vendor} · {c.name} ({c.email})</option>)}
            </select>
          </div>
          <div>
            <label className="label">권한</label>
            <select name="permission" required defaultValue="approve" className="input">
              {(['view', 'comment', 'approve'] as Permission[]).map((p) => <option key={p} value={p}>{PERMISSION_LABEL[p]} — {PERMISSION_HELP[p]}</option>)}
            </select>
          </div>
          <div>
            <label className="label">만료일 (비우면 무기한)</label>
            <input type="date" name="expires_at" defaultValue={defaultExpiry} className="input" />
          </div>
          <div>
            <label className="label">발송 방법 (대장 기록용)</label>
            <input name="method" defaultValue="포털 링크(메일)" list="methods" className="input" />
            <datalist id="methods"><option value="포털 링크(메일)" /><option value="포털 링크(카카오톡)" /><option value="포털 링크(문자)" /></datalist>
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" name="send_email" defaultChecked={hasSentVersion} disabled={!hasSentVersion} />
            링크를 담당자 메일로 바로 보내기 {hasSentVersion ? '' : '(발송된 버전이 없어 비활성)'}
          </label>
          <p className="muted text-xs sm:col-span-2">승인 권한 링크가 여러 개면 <b>모두 승인해야</b> 최종 승인본으로 확정됩니다. 최종 승인 후 부자재 업체에 파일만 공유할 때는 <b>보기</b> 권한으로 발급하세요.</p>
          <div className="sm:col-span-2"><Submit>링크·비밀번호 발급</Submit></div>
        </ActionForm>
      )}
    </div>
  );
}
