# UI guidelines

## Language and content

Use English for all interface text, accessible names, tooltips, validation errors, status messages and documentation. Keep persistent text short. Show details when an action needs an input, fails, or requires a destructive confirmation. Do not expose implementation details in routine flows.

## Layout and navigation

Use a quiet, responsive, light interface with neutral colors, restrained borders and generous whitespace. Keep breadcrumbs and a compact action toolbar above the file list. Sort folders before files and order entries by name. Display dates in UTC+8 (Asia/Shanghai), formatted as `YYYY-MM-DD HH:mm` without a timezone label, consistently across server rendering and browser hydration. API timestamps remain ISO 8601 values.

Resource locations belong in `/files/<path>` URLs. Encode each path segment separately. Direct navigation, refresh, breadcrumbs and browser history must identify the same resource. A missing resource offers a route back to its parent.

Show one server LAN address above the shared resource area, with its matching network name when available. Use a native select only when multiple qualified candidates exist. Excluded addresses must never appear. Selection changes are local and send no request. Keep the choice during resource navigation and restore the recommendation on a full reload. Use the English accessible name and tooltip "Server LAN address". Show "LAN address unavailable" when discovery cannot provide a candidate.

## Icons and accessibility

Use `lucide-react` for icons. Do not draw custom SVG icons. Icon actions need an English accessible name, a tooltip and a visible keyboard focus state. Do not rely on icon shape or color alone to communicate a destructive action or failure.

Use semantic links for navigation and downloads, buttons for actions, labeled inputs, native modal dialogs for focus management, and live regions for status. Disable conflicting actions while a request is pending. Preserve input after a failed create operation. Confirm permanent deletion and identify the affected relative path; folder confirmation must state that every descendant is deleted.

## Styling

Use separate CSS files and classes. Do not use inline styles or manipulate styles from JavaScript. Keep shared tokens in the base stylesheet and group rules by interface responsibility. Use responsive layouts without horizontal page overflow; hide secondary metadata before compressing filenames or action targets. Respect reduced-motion preferences.

## Previews and empty states

Render text as escaped text, never as uploaded HTML. Provide a concise notice for truncated previews and retain the full download action. Unsupported formats offer a download. Use native browser image, PDF and media rendering only for the explicitly allowed passive formats. Empty folders need only an icon and a short sentence.
