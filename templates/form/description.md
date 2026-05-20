# form

Generic schema-driven form. Supports text, textarea, number, select,
checkbox (single or group), radio, date, email, and url fields.
On submit, values are aggregated and copied back as a prompt via the FAB.

Schema: `{ title, fields: [{ name, label, type, required, options? }] }`.
