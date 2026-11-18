# A smaller Gold app

The app's job is to let a student or recruiter buy simulated gold, then verify the settlement. The interface is a quiet utility: gold identifies the asset and primary action, rather than decorating a marketing page.

## Review and choices

The previous layout gave setup, issuer operations, marketing copy and purchase controls similar prominence. Small labels and repeated explanations made the main action harder to find. The redesign removes the hero illustration, numbered headings, repeating footer and always-visible secondary forms.

The Apple design skill informed these choices, translated to React Native rather than claiming native UIKit behavior:

- `layout.md > Visual hierarchy`: "Use progressive disclosure to make layouts cleaner and easier to interact with." Issuer tools, digest lookup and gold actions expand on request.
- `tab-bars.md > Best practices`: "Include tab labels to help with navigation." Three persistent text tabs stay available even without a wallet.
- `buttons.md > Best practices`: "Always include a press state for a custom button." Action controls have a minimum height of 50 points and press feedback.
- `accessibility.md > Vision`: "Support larger text sizes." System type scales, rows wrap, and the confirmation dialog scrolls rather than fixing its content height.
- `sheets.md > Best practices`: "Display only one sheet at a time from the main interface." Purchase has one review modal and a Cancel action. This is a React Native Modal, not a draggable native sheet.

These are local reference files in the installed apple-design skill, sourced from Apple's Human Interface Guidelines. A centered, single-column web layout is a product judgment for this small three-view application; it keeps the same hierarchy on phones and desktop.

## Tokens

| Role | Light | Dark |
| --- | --- | --- |
| Background | #f4f5f7 | #121417 |
| Surface | #ffffff | #1d2025 |
| Content | #1b1f26 | #f2f3f5 |
| Secondary content | #59616e | #b0b6c0 |
| Gold action | #765416 | #e4c479 |
| Separator | #d9dde3 | #41464f |

Calculated WCAG contrast ratios: secondary text on the surface is **6.25:1 light / 8.01:1 dark**; gold against the surface is **6.89:1 / 9.70:1**. Secondary text on the page background is **5.73:1 / 9.05:1**. Disabled controls intentionally have reduced opacity; these ratios describe enabled text. System appearance selects the palette; there is no separate theme setting or transparency effect.

System sans-serif type: 34-point page title, 20-point section titles, 17-point body/data, 16-point actions, 13-point supporting text. A restrained 40-point holdings balance carries the main portfolio hierarchy. Monospace is reserved for public identifiers. No decorative motion was added.

## Layout

Compact and regular widths share one column, with 20-point outer margins and a maximum content width of 680 points. No important action depends on a hover state or a gesture.

```text
Compact                         Regular
+--------------------+          +------------------------------------+
| Gold   Sui Testnet  |          | Gold                   Sui Testnet |
| Buy Gold           |          |       Buy Gold                     |
| DemoGold / price   |          |       DemoGold / price / inventory  |
| Quantity / cost    |          |       Quantity / cost               |
| Review purchase   |          |       Review purchase               |
|                    |          |                                    |
| Buy | Portfolio |  |          |       Buy Gold | Portfolio | Account|
|       Account      |          +------------------------------------+
+--------------------+
```

Buy Gold contains the asset, inventory, quantity, cost and review action. Portfolio contains balances and recent network activity, with secondary actions revealed on demand. Account contains wallet setup, gas, bounded demo funding, sample mode and capability-gated issuer tools. Funding and purchase receipts remain distinct, with transaction digests and explorer links.

Final critique: a chart, large gold illustration or decorative navigation icons would add little to this fixed-price demo, so they were omitted. User-visible transaction proof and simulation disclosures were retained. Interactive layout, keyboard focus, screen-reader order and largest accessibility text sizes still need browser/device testing; server rendering and compilation alone do not establish those properties.
