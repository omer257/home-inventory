"use client";
import { Item, expiryLabel, expiryStatus, fmtQty, isLow } from "@/lib/logic";
import type { Store } from "@/lib/useStore";

export default function ItemRow({ item, store, onOpen }: { item: Item; store: Store; onOpen: (i: Item) => void }) {
  const st = expiryStatus(item);
  const low = isLow(item);
  const q = Number(item.quantity);
  return (
    <li className={`row ${q <= 0 ? "empty" : ""}`}>
      <button className="row-main" onClick={() => onOpen(item)}>
        <span className="row-name">
          {item.name}
          {item.package_size && <small> · {item.package_size}</small>}
          {item.opened_at && <small> · פתוח</small>}
        </span>
        <span className="row-meta">
          <span className={low ? "qty low" : "qty"}>
            {fmtQty(q)}
            {Number(item.target_quantity) > 0 && <small>/{fmtQty(item.target_quantity)}</small>}
          </span>
          {st !== "none" && st !== "ok" && <span className={`badge ${st}`}>{expiryLabel(item)}</span>}
        </span>
      </button>
      <div className="stepper">
        <button aria-label="הוסף" onClick={() => store.setQuantity(item, q + 1, "edit")}>+</button>
        <button aria-label="הפחת" disabled={q <= 0} onClick={() => store.setQuantity(item, q - 1, "use")}>−</button>
      </div>
    </li>
  );
}
