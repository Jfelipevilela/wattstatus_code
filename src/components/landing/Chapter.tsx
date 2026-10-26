// Chapter marker shared by every section after the hero: the page reads as
// one story (discovery, exploration, understanding, intelligence, action).
export function Chapter({ index, label }: { index: number; label: string }) {
  return (
    <p className="l-chapter">
      <b>{String(index).padStart(2, "0")}</b>
      {label}
    </p>
  );
}
