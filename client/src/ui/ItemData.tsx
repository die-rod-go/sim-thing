import type { ItemComponentData } from "../format/item-data";

/** An item's components and their field values, one row per component. */
export function ItemDataList({ data }: { data: readonly ItemComponentData[] }) {
  if (data.length === 0) return <div className="item-data-empty">No components.</div>;
  return (
    <dl className="item-data">
      {data.map((component) => (
        <div key={component.componentName} className="item-data-component">
          <dt>{component.componentName.replaceAll("_", " ")}</dt>
          {component.fields.map((field) => (
            <dd key={field.fieldName}>
              <span className="item-data-field">{field.fieldName}</span>{" "}
              <span className="item-data-value">{field.value}</span>
            </dd>
          ))}
        </div>
      ))}
    </dl>
  );
}

/** A collapsed entry that opens to show the item's data. */
export function ItemDataDisclosure({
  label,
  data,
}: {
  label: string;
  data: readonly ItemComponentData[];
}) {
  return (
    <details className="item-disclosure">
      <summary>{label}</summary>
      <ItemDataList data={data} />
    </details>
  );
}
