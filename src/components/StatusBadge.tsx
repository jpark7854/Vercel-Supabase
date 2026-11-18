import { STATUS_LABEL, STATUS_STYLE, type ProjectStatus } from '@/lib/labels';

export function StatusBadge({ status, className = '' }: { status: ProjectStatus; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLE[status]} ${className}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
