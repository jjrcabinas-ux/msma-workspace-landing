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

// Photo approach ported from msma-task-monitor's AvatarUpload:
// canvas cover-crop to a 200px square JPEG data URL.
export function resizePhotoToDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const S = 200;
      const canvas = document.createElement('canvas');
      canvas.width = S;
      canvas.height = S;
      const ctx = canvas.getContext('2d')!;
      const scale = Math.max(S / img.width, S / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.src = url;
  });
}
