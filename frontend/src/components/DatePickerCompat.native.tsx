// Native platforms: use the community DateTimePicker
import DateTimePicker from "@react-native-community/datetimepicker";
import React from "react";
import { Platform } from "react-native";

export interface DatePickerCompatProps {
  value: Date;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  onClose?: () => void;
}

export default function DatePickerCompat(props: DatePickerCompatProps) {
  return (
    <DateTimePicker
      value={props.value}
      mode="date"
      display={Platform.OS === "ios" ? "spinner" : "default"}
      minimumDate={props.minimumDate}
      maximumDate={props.maximumDate}
      onChange={(_, d) => {
        if (Platform.OS !== "ios") props.onClose?.();
        if (d) props.onChange(d);
      }}
    />
  );
}
