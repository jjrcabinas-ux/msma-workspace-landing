import { initialsOf } from '@/lib/ui';

/** Small circle avatar: uploaded photo when available, else colored initials. */
export default function Pava({
  photo,
  label,
  color,
}: {
  photo?: string | null;
  label: string;
  color: string;
}) {
  if (photo) {
    return <span className="pava pava-photo" style={{ backgroundImage: `url(${photo})` }} />;
  }
  return (
    <span className="pava" style={{ background: color }}>
      {initialsOf(label)}
    </span>
  );
}
