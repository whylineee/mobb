"use client";
import { useState } from "react";
import { Check, ChevronDown, Clipboard } from "lucide-react";
export function Expandable({
  text,
  label,
  testId,
}: {
  text: string;
  label: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="expandable">
      <p
        className={open ? "expanded-text" : "preview-text"}
        data-testid={testId}
      >
        {open ? text : text.slice(0, 170) + (text.length > 170 ? "…" : "")}
      </p>
      {text.length > 170 && (
        <button
          className="text-button"
          aria-label={`Розгорнути ${label}`}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Згорнути" : "Показати повністю"}
          <ChevronDown size={13} className={open ? "rotate" : ""} />
        </button>
      )}
    </div>
  );
}
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="icon-button"
      aria-label="Скопіювати"
      onClick={() => {
        void navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => {});
      }}
    >
      {copied ? <Check size={14} /> : <Clipboard size={14} />}
    </button>
  );
}
export function Field({
  name,
  value,
  mono = false,
}: {
  name: string;
  value?: string;
  mono?: boolean;
}) {
  return (
    <div className="detail-field">
      <span>{name}</span>
      <span className={mono ? "mono" : ""}>{value ?? "Не визначено"}</span>
    </div>
  );
}
