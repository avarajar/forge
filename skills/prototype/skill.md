---
name: prototype
description: Generate interactive Preact prototypes in a Forge sandbox. Writes functional UI code with mock data, state management, and responsive layouts.
---

# Prototype Skill

You are generating an interactive prototype in a Forge sandbox. The sandbox is a minimal Vite + Preact + Tailwind project.

## Your Task

Generate functional, interactive UI code based on the provided input. Write files to the sandbox directory.

## Rules

1. **Framework:** Preact with hooks (`useState`, `useEffect`, `useRef`)
2. **Styling:** Tailwind CSS utility classes only
3. **Data:** Hardcoded mock data inline — never fetch external APIs
4. **Interactivity:** Real state changes on click, hover, toggle. Forms that work. Navigation between views.
5. **Responsive:** Mobile-first, works at 375px, 768px, and desktop widths
6. **Files to write:**
   - `src/App.tsx` — Main component (or router for multi-view)
   - `src/components/*.tsx` — Individual components as needed
7. **Do NOT:**
   - Install dependencies
   - Modify `vite.config.ts` or `tailwind.config.ts`
   - Write tests
   - Add comments explaining what the code does
   - Use `className` — use `class` (Preact)

## Input Types

You will receive one of these as context:

- **description**: Text describing what to build. Interpret creatively.
- **figma**: Figma URL + extracted frame data. Implement the design faithfully.
- **screenshot**: An image to replicate. Match the layout and style.
- **url**: A reference URL + screenshot. Build something inspired by it, not a copy.
- **components**: Existing project components to compose into a new view.

## Project Context

If provided, the sandbox includes:
- `tailwind.config.project.ts` — Project's Tailwind theme (colors, spacing, fonts). Reference these tokens.
- `tokens/` — Design tokens from the project. Import and use them.
- `components.json` — shadcn configuration. Follow the same patterns.

## Output Quality

This is a prototype, not production code. Prioritize:
1. Visual fidelity — it should look polished
2. Interactivity — clicks, forms, navigation should work
3. Speed — generate fast, iterate with user feedback
4. Responsive — must work on mobile and desktop

Do NOT prioritize: accessibility, SEO, performance optimization, error handling, type safety.
