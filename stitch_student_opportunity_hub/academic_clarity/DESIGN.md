---
name: Academic Clarity
colors:
  surface: '#f8f9fa'
  surface-dim: '#d9dadb'
  surface-bright: '#f8f9fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4f5'
  surface-container: '#edeeef'
  surface-container-high: '#e7e8e9'
  surface-container-highest: '#e1e3e4'
  on-surface: '#191c1d'
  on-surface-variant: '#464555'
  inverse-surface: '#2e3132'
  inverse-on-surface: '#f0f1f2'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#575e70'
  on-secondary: '#ffffff'
  secondary-container: '#d9dff5'
  on-secondary-container: '#5c6274'
  tertiary: '#7e3000'
  on-tertiary: '#ffffff'
  tertiary-container: '#a44100'
  on-tertiary-container: '#ffd2be'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#dce2f7'
  secondary-fixed-dim: '#c0c6db'
  on-secondary-fixed: '#141b2b'
  on-secondary-fixed-variant: '#404758'
  tertiary-fixed: '#ffdbcc'
  tertiary-fixed-dim: '#ffb695'
  on-tertiary-fixed: '#351000'
  on-tertiary-fixed-variant: '#7b2f00'
  background: '#f8f9fa'
  on-background: '#191c1d'
  surface-variant: '#e1e3e4'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 48px
  container-max: 1200px
  gutter: 24px
---

## Brand & Style

This design system is built on the principles of **Hyper-Minimalism** and **Utility**. It targets students and educators, prioritizing information density and ease of navigation over decorative elements. The aesthetic borrows from high-end SaaS tools (Stripe/Notion), utilizing a structured, monochromatic base to allow opportunities—internships, scholarships, and research roles—to stand out as the primary content.

The emotional response should be one of focus, competence, and calm. By removing heavy shadows and vibrant background gradients, the UI recedes into the background, ensuring that the "opportunity" is the hero of every screen.

## Colors

The palette is intentionally restrained. We use a monochromatic gray scale to define the application's structure and hierarchy, reserving the vibrant **Indigo (#4F46E5)** exclusively for primary actions, progress indicators, and active states. 

- **Backgrounds**: Use `#FFFFFF` for the main content area and `#F9FAFB` for sidebars or secondary regions to create subtle contrast without lines.
- **Borders**: All structural separation is handled by `#E5E7EB`. Avoid dark borders.
- **Typography**: Primary text uses `#1F2937` for high legibility, while metadata and descriptions use `#6B7280`.

## Typography

The design system utilizes **Inter** for its neutral, systematic character. The scale is built to prioritize scanning.

- **Headlines**: Use tighter letter-spacing and heavier weights for a professional, "locked-in" feel.
- **Body**: Standard weight (400) is used for all descriptive text to maintain a clean, airy appearance.
- **Labels**: Small labels use a medium weight (500) and increased letter-spacing for categorization and tags.
- **Accessibility**: Never drop below 12px for any text element. Maintain a minimum contrast ratio of 4.5:1.

## Layout & Spacing

The layout follows a **Fixed Grid** philosophy for desktop to maintain the "document-like" focus found in Notion. On mobile, it transitions to a fluid 1-column layout.

- **Desktop**: 12-column grid, 1200px max-width, centered.
- **Gutter**: 24px consistent gutter between columns.
- **Vertical Rhythm**: Use 16px (md) for most element groupings and 48px (xl) to separate major sections.
- **Margins**: Mobile margins are 16px; Desktop margins are 24px or auto-calculated based on the center-aligned container.

## Elevation & Depth

This system avoids traditional shadows to prevent visual "weight." Instead, it uses **Tonal Layers** and **Low-Contrast Outlines**.

- **Level 0 (Base)**: `#F9FAFB` (Application background).
- **Level 1 (Surface)**: `#FFFFFF` (Cards, content blocks). These are defined by a 1px solid border of `#E5E7EB`.
- **Level 2 (Hover/Active)**: A very soft, 10% opacity Indigo tint or a subtle 2px blur shadow only on interactive cards to signal clickability.
- **Floating Elements**: Modals and dropdowns use a single, extremely diffused shadow: `0px 10px 15px -3px rgba(0, 0, 0, 0.05)`.

## Shapes

The shape language is **Soft** and precise. We avoid pill-shapes (except for specific status tags) and sharp corners to maintain an approachable but professional tone.

- **Standard Elements**: Buttons, inputs, and small cards use a 0.25rem (4px) radius.
- **Containers**: Large dashboard sections or main content cards use 0.5rem (8px).
- **Interactive States**: Focus states should use a 2px offset Indigo ring.

## Components

- **Buttons**:
  - *Primary*: Solid Indigo (#4F46E5) with white text. No gradient.
  - *Secondary*: White background, 1px border (#E5E7EB), Slate text (#1F2937).
- **Input Fields**: 1px border (#E5E7EB). On focus, border changes to Indigo (#4F46E5) with a subtle 2px outer glow.
- **Cards**: Flat white background with a 1px border. No internal padding less than 24px to ensure high whitespace.
- **Chips/Tags**: Small, 2px radius. Background is a 10% opacity version of the status color (e.g., light green for "Open", light indigo for "Research").
- **Lists**: Clean rows separated by 1px horizontal lines. High vertical padding (16px) per row to prevent information density fatigue.
- **Checkboxes**: Square with 2px radius. Indigo fill when active.