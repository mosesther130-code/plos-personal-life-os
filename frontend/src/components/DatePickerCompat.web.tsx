// Web platform: use an inline <input type="date"> via React.createElement
// (react-native-web allows raw DOM elements this way).
import React, { useEffect, useRef } from "react";

export interface DatePickerCompatProps {
  value: Date;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  onClose?: () => void;
}

function iso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function DatePickerCompat(props: DatePickerCompatProps) {
  const ref = useRef<any>(null);

  // Auto-open the picker on mount (so behavior matches native)
  useEffect(() => {
    if (ref.current && typeof ref.current.showPicker === "function") {
      try {
        ref.current.showPicker();
      } catch {}
    } else if (ref.current && typeof ref.current.focus === "function") {
      ref.current.focus();
    }
  }, []);

  return React.createElement("input", {
    ref,
    type: "date",
    value: iso(props.value),
    min: props.minimumDate ? iso(props.minimumDate) : undefined,
    max: props.maximumDate ? iso(props.maximumDate) : undefined,
    onChange: (e: any) => {
      const v = e?.target?.value;
      if (!v) return;
      const [y, m, d] = v.split("-").map((n: string) => parseInt(n, 10));
      const date = new Date(y, (m || 1) - 1, d || 1);
      props.onChange(date);
      props.onClose?.();
    },
    onBlur: () => props.onClose?.(),
    style: {
      padding: 10,
      fontSize: 14,
      border: "1px solid #1E40AF",
      borderRadius: 8,
      background: "#0F172A",
      color: "#fff",
      marginTop: 8,
      width: "100%",
      boxSizing: "border-box",
      colorScheme: "dark",
    },
  });
}
