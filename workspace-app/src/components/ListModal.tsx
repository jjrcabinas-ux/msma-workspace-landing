'use client';

/** Centered modal with the vertical drop-open animation. Click outside or × to close. */
export default function ListModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="cal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cal-modal" role="dialog" aria-modal="true">
        <div className="cal-modal-head">
          <div className="cal-modal-title">{title}</div>
          <button className="cal-modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="cal-modal-body">{children}</div>
      </div>
    </div>
  );
}
