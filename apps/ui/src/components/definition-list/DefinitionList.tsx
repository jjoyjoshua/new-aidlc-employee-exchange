/**
 * DefinitionList — SCR-004's `definition-list` component (US-031). The read-only "Your
 * details" block: a label column and a value column, confirmed against `HF / SCR-004 ·
 * Settings` — every state (including ST-06, ST-08) renders this in full, because it comes
 * from the session and there is nothing to wait for or fail (SCR-004 ST-01's own correction).
 */
import './definition-list.css';

export interface DefinitionListItem {
  label: string;
  value: string;
}

export interface DefinitionListProps {
  items: DefinitionListItem[];
}

export function DefinitionList({ items }: DefinitionListProps) {
  return (
    <dl className="definition-list">
      {items.map((item) => (
        <div className="definition-list__row" key={item.label}>
          <dt className="definition-list__label">{item.label}</dt>
          <dd className="definition-list__value">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
