'use client';

import { useState } from 'react';
import type { SheetTask } from '@/lib/types';
import { todayISO } from '@/lib/dates';
import DatePicker from '@/components/DatePicker';

/** Popup form for adding a deliverable, mirroring the task-monitor add modal. */
export default function AddDeliverableModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (t: Omit<SheetTask, 'id'>) => void;
}) {
  const [date, setDate] = useState(todayISO());
  const [due, setDue] = useState('');
  const [task, setTask] = useState('');
  const [details, setDetails] = useState('');
  const [help, setHelp] = useState('');
  const [error, setError] = useState('');

  function save() {
    if (!task.trim()) {
      setError('Please describe the task.');
      return;
    }
    onAdd({ date, due, task: task.trim(), details: details.trim(), status: 'Pending', help: help.trim() });
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
