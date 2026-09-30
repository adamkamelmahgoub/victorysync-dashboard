# Dashboard design refresh

The shared dashboard now uses borderless cards, quieter shadows, simple navigation states and consistent surface spacing. Decorative icon rings and raised secondary buttons were removed. Inputs use filled backgrounds with a single bottom edge; keyboard focus remains visible.

Workforce filters are grouped into one responsive section. They appear only on reporting tabs. Metrics use consistent spacing and smaller empty-state text. Transfer grouping sits alongside its report heading instead of occupying a separate full-width row. Errors have a separate message and retry action.

The existing navy/violet brand, Inter font, role restrictions and data operations are preserved. There are no database or authentication changes in this refresh.

Validation uses the production client build and intercepted browser fixtures: 84 Workforce role/theme/width cases and 24 populated dashboard, API-key, diagnostics and reports cases. Results are in `workforce-browser.json` and `design-populated-browser.json`. Light/dark desktop previews are `workforce-light.png` and `workforce-dark.png`. These automated checks do not certify every live-data state.
