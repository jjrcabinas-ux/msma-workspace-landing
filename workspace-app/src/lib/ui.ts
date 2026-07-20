export function initialsOf(label: string): string {
  return String(label)
    .split('@')[0]
    .split(/[\s._-]+/)
    .map((w) => w[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const EMP_COLORS = ['var(--blue)', 'var(--lime)', 'var(--amber)', 'var(--red)', '#A78BFA', '#F472B6'];

export function empColor(i: number): string {
  return EMP_COLORS[i % EMP_COLORS.length];
}

export function newTaskId(): string {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
