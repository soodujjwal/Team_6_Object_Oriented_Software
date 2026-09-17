# Shared UI Components

"All dropdown/select controls must use the shared GlassSelect/Dropdown component. New features must reuse this component rather than creating page-specific dropdown styling."

In this project, `GlassSelect` is the shared Dropdown component. Extend it when a new dropdown behavior is needed.

`GlassSelect` owns the shared trigger, searchable floating option panel, Light/Dark theme styling, responsive positioning, and keyboard interactions. Pass options and value handlers from feature code; keep domain-specific option lists and selection logic outside the component.

Use the existing `DatePicker` for calendar selection instead of native date inputs. Specialized controls such as segmented mode buttons should remain buttons when they represent a small set of mutually exclusive actions rather than a dropdown.
