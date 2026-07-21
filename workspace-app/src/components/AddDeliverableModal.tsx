'use client';

import { useState } from 'react';
import type { SheetTask } from '@/lib/types';
import { todayISO } from '@/lib/dates';
import DatePicker from '@/components/DatePicker';
import Select from '@/components/Select';

export type AddAssignee = { email: string; label: string };

/** Popup form for adding a deliverable, mirroring the task-monitor add
 *  modal. When `assignees` has more than one entry (admin or a Senior
 *  Associate of the cluster), a For selector picks whose sheet gets it. */
export default function AddDeliverableModal({
  onClose,
  onAdd,
  assignees,
  defaultAssignee,
}: {
  onClose: () => void;
  onAdd: (t: Omit<SheetTask, 'id'>, email: string) => void;
  assignees?: AddAssignee[];
  defaultAssignee: string;
}) {
  const [forEmail, setForEmail] = useState(defaultAssignee);
  const canPick = (assignees?.length || 0) > 1;
  const labelOf = (email: string) => assignees?.find((a) => a.email === email)?.label || email;
  const [date, setDate] = useState(todayISO());
  const [due, setDue] = useState('');
  const [task, setTask] = useState('');
  const [details, setDetails] = useState('');
  const [help, setHelp] = useState('');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);

  function save() {
    if (!task.trim()) {
      setError('Please describe the task.');
      return;
    }
    setError('');
    setConfirming(true);
  }

  if (confirming) {
    return (
      <div
        className="uname-overlay"
        onClick={(e) => {
          if (e.target === e.currentTarget) setConfirming(false);
        }}
      >
        <div className="uname-card" role="dialog" aria-modal="true" aria-labelledby="addt-remind">
          <h3 id="addt-remind">One reminder before saving</h3>
          {canPick && (
            <p style={{ marginBottom: 8 }}>
              Adding for: <b style={{ color: 'var(--white)' }}>{labelOf(forEmail)}</b>
            </p>
          )}
          <p>
            Once saved, only <b style={{ color: 'var(--white)' }}>Status</b> and{' '}
            <b style={{ color: 'var(--white)' }}>Help needed</b> stay editable — the task, dates, and details are
            final, so double-check them. And if this deliverable goes{' '}
            <b style={{ color: 'var(--white)' }}>3 or more days past its due date</b> without being marked Done, you
            won’t be able to change its status yourself anymore. You’ll need to coordinate with your{' '}
            <b style={{ color: 'var(--white)' }}>direct supervisor</b>, who can update it for you.
          </p>
          <div className="uname-actions">
            <button
              className="tool-new"
              onClick={() =>
                onAdd(
                  { date, due, task: task.trim(), details: details.trim(), status: 'Pending', help: help.trim() },
                  forEmail
                )
              }
            >
              I understand — add it
            </button>
            <button className="uname-skip" onClick={() => setConfirming(false)}>Go back</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="uname-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="uname-card prof-card" role="dialog" aria-modal="true" aria-labelledby="addt-title">
        <h3 id="addt-title">Add deliverable</h3>
        <p>It starts as Pending — cycle the status from the sheet as it moves.</p>
        <div className="prof-grid">
          {canPick && (
            <div className="prof-field full">
              <label>For</label>
              <Select
                value={labelOf(forEmail)}
                options={assignees!.map((a) => a.label)}
                ariaLabel="Add for member"
                onChange={(label) => {
                  const hit = assignees!.find((a) => a.label === label);
                  if (hit) setForEmail(hit.email);
                }}
              />
            </div>
          )}
          <div className="prof-field full">
            <label htmlFor="addt-task">Task</label>
            <input
              id="addt-task"
              className="mem-input"
              placeholder="e.g. 1601-C — file & pay"
              value={task}
              autoFocus
              onChange={(e) => setTask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save();
              }}
            />
          </div>
          <div className="prof-field full">
            <label htmlFor="addt-details">Details</label>
            <input
              id="addt-details"
              className="mem-input"
              placeholder="Optional details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
          </div>
          <div className="prof-field">
            <label>Date</label>
            <div className="mem-input">
              <DatePicker value={date} ariaLabel="Date" onChange={setDate} />
            </div>
          </div>
          <div className="prof-field">
            <label>Due date</label>
            <div className="mem-input">
              <DatePicker value={due} ariaLabel="Due date" onChange={setDue} />
            </div>
          </div>
          <div className="prof-field full">
            <label htmlFor="addt-help">Help needed</label>
            <input
              id="addt-help"
              className="mem-input"
              placeholder="Optional — flag a blocker for the team"
              value={help}
              onChange={(e) => setHelp(e.target.value)}
            />
          </div>
        </div>
        {error && (
          <div className="mem-error" role="alert" style={{ margin: '12px 0 0' }}>
            {error}
          </div>
        )}
        <div className="uname-actions">
          <button className="tool-new" onClick={save}>Add deliverable</button>
          <button className="uname-skip" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
