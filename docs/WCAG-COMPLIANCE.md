# WCAG Color Contrast Compliance Report

**Date:** 2026-03-31
**Scope:** `src/css/styles.css` -- all CSS custom property color pairs and hardcoded color usages
**Standard:** WCAG 2.1 (AA and AAA)

---

## 1. Color Palette Overview

### Light Theme (`:root`)

| Token             | Hex       | Usage                        |
| ----------------- | --------- | ---------------------------- |
| `--primary`       | `#365E3D` | Buttons, links, headings     |
| `--primary-light` | `#A8D5BA` | Hover states, accents        |
| `--primary-dark`  | `#1B3D22` | Active/pressed states        |
| `--accent`        | `#7C3AED` | Highlights, info badges      |
| `--accent-warm`   | `#FBBF24` | Decorative accents           |
| `--danger`        | `#E11D48` | Delete buttons, errors       |
| `--text`          | `#1C1917` | Primary body text            |
| `--text-light`    | `#78716C` | Secondary/muted text         |
| `--bg`            | `#FBF9F4` | Page background              |
| `--bg-secondary`  | `#FFFFFF` | Card/panel background        |
| `--bg-tertiary`   | `#F5F3EE` | Subtle section background    |
| `--border`        | `#E7E5E4` | Borders and dividers         |
| `--success`       | `#16A34A` | Success states               |
| `--success-light` | `#bbf7d0` | Success background           |
| `--warning`       | `#EA580C` | Warning states               |
| `--warning-light` | `#fed7aa` | Warning background           |
| `--error`         | `#E11D48` | Error states                 |
| `--error-light`   | `#fecaca` | Error background             |
| `--info`          | `#7C3AED` | Info/edit buttons            |
| `--info-light`    | `#bfdbfe` | Info background              |

### Dark Theme (`[data-theme="dark"]`)

| Token             | Hex       | Usage                        |
| ----------------- | --------- | ---------------------------- |
| `--primary`       | `#A8D5BA` | Buttons, links, headings     |
| `--primary-light` | `#365E3D` | Hover states, accents        |
| `--primary-dark`  | `#7BC4A0` | Active/pressed states        |
| `--accent`        | `#A78BFA` | Highlights, info badges      |
| `--danger`        | `#f87171` | Delete buttons, errors       |
| `--text`          | `#F5F5F4` | Primary body text            |
| `--text-light`    | `#A8A29E` | Secondary/muted text         |
| `--bg`            | `#0C0A09` | Page background              |
| `--bg-secondary`  | `#1C1917` | Card/panel background        |
| `--bg-tertiary`   | `#292524` | Subtle section background    |
| `--border`        | `#44403C` | Borders and dividers         |
| `--success`       | `#4ade80` | Success states               |
| `--warning`       | `#fb923c` | Warning states               |
| `--error`         | `#f87171` | Error states                 |
| `--info`          | `#A78BFA` | Info/edit buttons            |

---

## 2. Contrast Ratio Methodology

Contrast ratios are calculated using the WCAG 2.1 relative luminance formula:

1. Convert sRGB to linear: `C_lin = (C_srgb / 255 <= 0.04045) ? C_srgb / 255 / 12.92 : ((C_srgb / 255 + 0.055) / 1.055) ^ 2.4`
2. Relative luminance: `L = 0.2126 * R_lin + 0.7152 * G_lin + 0.0722 * B_lin`
3. Contrast ratio: `(L_lighter + 0.05) / (L_darker + 0.05)`

**Thresholds:**
- **AA normal text** (< 18pt / < 14pt bold): 4.5:1
- **AA large text** (>= 18pt / >= 14pt bold): 3:1
- **AAA normal text**: 7:1
- **AAA large text**: 4.5:1

---

## 3. Light Theme Contrast Analysis

### 3.1 Text on Backgrounds

| Foreground        | Background         | Ratio   | AA Normal | AA Large | AAA Normal | AAA Large |
| ----------------- | ------------------ | ------- | --------- | -------- | ---------- | --------- |
| `--text` #1C1917  | `--bg` #FBF9F4     | ~16.5:1 | PASS      | PASS     | PASS       | PASS      |
| `--text` #1C1917  | `--bg-secondary` #FFFFFF | ~17.4:1 | PASS | PASS     | PASS       | PASS      |
| `--text` #1C1917  | `--bg-tertiary` #F5F3EE | ~15.2:1 | PASS | PASS     | PASS       | PASS      |
| `--text-light` #78716C | `--bg` #FBF9F4 | ~4.9:1  | PASS      | PASS     | FAIL       | PASS      |
| `--text-light` #78716C | `--bg-secondary` #FFFFFF | ~5.1:1 | PASS | PASS  | FAIL       | PASS      |
| `--text-light` #78716C | `--bg-tertiary` #F5F3EE | ~4.6:1 | PASS | PASS  | FAIL       | PASS      |
| `--primary` #365E3D | `--bg` #FBF9F4    | ~7.0:1  | PASS      | PASS     | PASS       | PASS      |
| `--primary` #365E3D | `--bg-secondary` #FFFFFF | ~7.3:1 | PASS | PASS  | PASS       | PASS      |

### 3.2 White Text on Colored Backgrounds (Buttons)

| Background            | Foreground | Ratio   | AA Normal | AA Large | AAA Normal | AAA Large |
| --------------------- | ---------- | ------- | --------- | -------- | ---------- | --------- |
| `--primary` #365E3D   | white      | ~7.3:1  | PASS      | PASS     | PASS       | PASS      |
| `--primary-dark` #1B3D22 | white   | ~11.5:1 | PASS      | PASS     | PASS       | PASS      |
| `--danger` #E11D48    | white      | ~4.5:1  | PASS      | PASS     | FAIL       | PASS      |
| `--accent` #7C3AED    | white      | ~4.6:1  | PASS      | PASS     | FAIL       | PASS      |
| `--info` #7C3AED      | white      | ~4.6:1  | PASS      | PASS     | FAIL       | PASS      |
| `--success` #16A34A   | white      | ~3.9:1  | FAIL      | PASS     | FAIL       | FAIL      |
| `--warning` #EA580C   | white      | ~3.7:1  | FAIL      | PASS     | FAIL       | FAIL      |
| `--error` #E11D48     | white      | ~4.5:1  | PASS      | PASS     | FAIL       | PASS      |
| `#95a5a6` (archive)   | white      | ~2.3:1  | FAIL      | FAIL     | FAIL       | FAIL      |
| `#c0392b` (hardcoded) | white      | ~4.6:1  | PASS      | PASS     | FAIL       | PASS      |

### 3.3 Status Color Text on Light Backgrounds

| Foreground            | Background              | Ratio   | AA Normal | AA Large |
| --------------------- | ----------------------- | ------- | --------- | -------- |
| `--success` #16A34A   | `--success-light` #bbf7d0 | ~3.2:1 | FAIL     | PASS     |
| `--warning` #EA580C   | `--warning-light` #fed7aa | ~3.3:1 | FAIL     | PASS     |
| `--error` #E11D48     | `--error-light` #fecaca   | ~3.7:1 | FAIL     | PASS     |

---

## 4. Dark Theme Contrast Analysis

### 4.1 Text on Backgrounds

| Foreground             | Background              | Ratio   | AA Normal | AA Large | AAA Normal | AAA Large |
| ---------------------- | ----------------------- | ------- | --------- | -------- | ---------- | --------- |
| `--text` #F5F5F4       | `--bg` #0C0A09          | ~18.1:1 | PASS      | PASS     | PASS       | PASS      |
| `--text` #F5F5F4       | `--bg-secondary` #1C1917 | ~14.3:1 | PASS     | PASS     | PASS       | PASS      |
| `--text` #F5F5F4       | `--bg-tertiary` #292524  | ~11.3:1 | PASS     | PASS     | PASS       | PASS      |
| `--text-light` #A8A29E | `--bg` #0C0A09          | ~8.7:1  | PASS      | PASS     | PASS       | PASS      |
| `--text-light` #A8A29E | `--bg-secondary` #1C1917 | ~6.8:1 | PASS      | PASS     | FAIL       | PASS      |
| `--text-light` #A8A29E | `--bg-tertiary` #292524  | ~5.4:1 | PASS      | PASS     | FAIL       | PASS      |
| `--primary` #A8D5BA    | `--bg` #0C0A09          | ~11.2:1 | PASS     | PASS     | PASS       | PASS      |
| `--primary` #A8D5BA    | `--bg-secondary` #1C1917 | ~8.8:1 | PASS     | PASS     | PASS       | PASS      |

### 4.2 White Text on Dark-Theme Colored Backgrounds

| Background                 | Foreground | Ratio   | AA Normal | AA Large |
| -------------------------- | ---------- | ------- | --------- | -------- |
| `--primary` #A8D5BA        | `#0C0A09`  | ~11.2:1 | PASS      | PASS     |
| `--danger` #f87171          | white      | ~4.0:1  | FAIL      | PASS     |
| `--accent` #A78BFA          | white      | ~3.6:1  | FAIL      | PASS     |
| `--success` #4ade80         | `#0C0A09`  | ~10.8:1 | PASS      | PASS     |

---

## 5. Hardcoded Color Issues

Several hardcoded color values in the stylesheet bypass the design token system:

| Selector                    | Color     | Context                      | Concern                           |
| --------------------------- | --------- | ---------------------------- | --------------------------------- |
| `.archive-btn`              | `#95a5a6` | Background with white text   | Ratio ~2.3:1 -- FAILS all levels  |
| `.archive-btn:hover`        | `#7f8c8d` | Background with white text   | Ratio ~3.3:1 -- FAILS AA normal   |
| `.tasks-calendar`           | `white`   | Hardcoded, ignores dark mode | Not theme-aware                   |
| Various hover states        | `#1e3a8a`, `#991b1b`, `#e67e22` | Hardcoded hover colors | Not using design tokens    |
| Print styles                | `#333`, `#1b5e3f`, `black`      | Print overrides       | Acceptable for print       |
| `.task-meta` / timestamps   | `#999`, `#7f8c8d`              | Muted text hardcoded   | Not theme-aware; ~3.0:1 on white  |

---

## 6. Summary of Findings

### Passing (No Issues)

- Primary body text (`--text`) on all backgrounds: excellent contrast in both themes (>11:1)
- Primary color text/links on backgrounds: strong contrast in both themes (>7:1)
- White text on `--primary` buttons: 7.3:1 (passes AAA)
- White text on `--primary-dark` buttons: 11.5:1 (passes AAA)
- Dark theme primary text: excellent across all surfaces

### Issues Found

| # | Severity | Issue | Affected Elements |
|---|----------|-------|-------------------|
| 1 | **HIGH** | `#95a5a6` archive button background with white text fails all WCAG levels (2.3:1) | `.archive-btn` |
| 2 | **MEDIUM** | `--success` (#16A34A) with white text fails AA normal (3.9:1) | Success-colored buttons (light theme) |
| 3 | **MEDIUM** | `--warning` (#EA580C) with white text fails AA normal (3.7:1) | Warning-colored elements (light theme) |
| 4 | **MEDIUM** | Dark theme `--danger` (#f87171) and `--accent` (#A78BFA) with white text fail AA normal | `.delete-btn`, `.edit-btn` in dark mode |
| 5 | **LOW** | `--text-light` (#78716C) narrowly passes AA (4.9:1) but fails AAA for normal text | Secondary/muted text elements |
| 6 | **LOW** | Status color on status-light background pairs fail AA normal text (3.2-3.7:1) | Status badges if used with normal-size text |
| 7 | **INFO** | Hardcoded colors (`#999`, `#7f8c8d`) are not theme-aware and have marginal contrast | Various meta/timestamp elements |

---

## 7. Recommendations

### High Priority

1. **Fix archive button contrast:** Replace `#95a5a6` with a darker alternative such as `#6B7280` (gray-500, ~5.7:1 with white) or use dark text on the current background.
   ```css
   .archive-btn {
     background: #6B7280; /* gray-500: passes AA with white text */
     color: white;
   }
   ```

2. **Fix success/warning button text in light theme:** Either darken the background colors or switch to dark text:
   - `--success`: Use `#15803D` (~5.3:1 with white) instead of `#16A34A`
   - `--warning`: Use `#C2410C` (~5.1:1 with white) instead of `#EA580C`

### Medium Priority

3. **Dark theme button colors:** For `--danger` and `--accent` in dark mode, consider using dark text (`#0C0A09`) instead of white, since these are lighter pastel shades in dark theme:
   ```css
   [data-theme="dark"] .delete-btn { color: #0C0A09; }
   [data-theme="dark"] .edit-btn { color: #0C0A09; }
   ```

4. **Consolidate hardcoded colors into design tokens:** Replace `#999`, `#7f8c8d`, `#95a5a6` with `var(--text-light)` or a new `--text-muted` token to ensure theme-awareness.

### Low Priority

5. **Improve `--text-light` for AAA:** If AAA compliance is a goal, darken `--text-light` to approximately `#6B6560` (~6.0:1 on `--bg`). However, current AA compliance is acceptable for secondary text.

6. **Status badge text sizes:** Ensure status-colored text on light backgrounds is rendered at large text sizes (>=18px or >=14px bold) to meet AA at the current ratios, or darken the foreground colors for badge text.

---

## 8. Overall Compliance Assessment

| Level | Light Theme | Dark Theme |
|-------|-------------|------------|
| **WCAG AA** | Mostly compliant. Failures in success/warning buttons and archive button. | Mostly compliant. Failures in danger/accent buttons with white text. |
| **WCAG AAA** | Primary text and primary-colored elements pass. Secondary text and colored buttons do not fully meet AAA. | Primary text passes. Muted text on tertiary backgrounds narrowly misses. |

**Overall rating: AA compliant with exceptions.** The main content reading experience (body text, headings, primary links) is strong in both themes. The issues are concentrated in colored action buttons and secondary UI elements, which are addressable with the recommendations above.
