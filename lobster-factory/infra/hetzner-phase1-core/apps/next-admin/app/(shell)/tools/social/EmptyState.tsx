// The one empty state every view uses (mock .empty; GAP_REPORT S7): a round tinted icon, a bold line, a grey line, at most one button.
import Icon, { type IconName } from "./Icon";

export default function EmptyState({ icon, line, hint, button, onButton }: { icon: IconName; line: string; hint: string; button?: string; onButton?: () => void }) {
  return (
    <div className="sm-empty">
      <span className="sm-eic"><Icon name={icon} /></span>
      <b>{line}</b>
      <p className="sm-muted">{hint}</p>
      {button && <button type="button" className="btn-primary" onClick={onButton}>{button}</button>}
    </div>
  );
}
