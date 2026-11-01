import { cva, type VariantProps } from "class-variance-authority";

export const buttonVariants = cva(
  "box-border inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border font-sans font-semibold no-underline " +
    "transition-colors motion-reduce:transition-none " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "border-transparent bg-accent text-accent-fg hover:bg-accent/90",
        secondary: "border-transparent bg-surface-2 text-fg hover:bg-surface-2/70",
        outline: "border-line-strong bg-transparent text-fg hover:bg-surface-2",
        ghost: "border-transparent bg-transparent text-fg hover:bg-surface-2",
        danger: "border-transparent bg-danger text-surface-1 hover:bg-danger/90",
        // Quiet control that lights up on hover (icon buttons in bars and rows); `aria-current="true"` keeps it lit.
        soft: "border-transparent bg-transparent text-fg-muted hover:bg-accent-soft hover:text-accent aria-[current=true]:bg-accent-soft aria-[current=true]:text-accent",
        // `soft` in a status color, for an icon control that reports a state by its color (muted, starting, live). Hover dims the
        // color and adds no background, so it looks the same on any surface.
        softDanger: "border-transparent bg-transparent text-danger hover:text-danger/75",
        softWarning: "border-transparent bg-transparent text-warning hover:text-warning/75",
        softSuccess: "border-transparent bg-transparent text-success hover:text-success/75",
        // `soft` with a faint outline, for an icon button that would otherwise sit bare on its container (mute in a menu row).
        softOutline:
          "border-line bg-transparent text-fg-muted hover:bg-accent-soft hover:text-accent aria-[current=true]:bg-accent-soft aria-[current=true]:text-accent",
        // Accent-tinted pill button in a toolbar (theme, language, network).
        accentSoft: "border-line bg-accent-soft text-accent hover:border-accent/35 hover:bg-accent-soft aria-expanded:border-accent/35",
        // Dark-on-light call to action that lights up on hover (the repository link).
        inverse: "border-transparent bg-fg text-surface-1 hover:bg-accent hover:text-accent-fg",
        // A warning state that is switched on (away).
        warning: "border-warning/30 bg-warning-soft text-warning hover:bg-warning-soft",
        // Bordered control in the accent color (settings, refresh).
        tinted: "border-line bg-surface-1 text-accent hover:bg-accent-soft",
        // Destructive but not the main action (leave, stop, remove).
        dangerSoft: "border-transparent bg-danger-soft text-danger hover:bg-danger hover:text-accent-fg",
        // Small tinted pill that sits inside a card (start or watch a screen share).
        pill: "rounded-full border-accent/25 bg-accent/8 text-accent hover:bg-accent/15",
        // An action that is running right now (push to talk held).
        success: "border-transparent bg-success text-accent-fg ring-4 ring-success/15 hover:bg-success/90",
        // Text that acts like a link, in the accent color; size="inline" takes the text size and line of its surroundings.
        link: "border-transparent bg-transparent text-accent hover:underline",
        // Round control floating over video, on the fixed media colors.
        media:
          "rounded-full border-media-line bg-media-scrim text-media-fg shadow-lg backdrop-blur-sm hover:border-media-accent/75 hover:bg-media-accent/30",
      },
      size: {
        sm: "h-8 px-3 text-xs max-compact:h-11 pointer-coarse:h-11",
        md: "h-10 px-4 text-sm max-compact:h-11 pointer-coarse:h-11",
        lg: "h-12 px-6 text-base",
        // Small pill inside a card. On a phone or a touch screen the look stays and a 44 px area around it takes the tap.
        xs: "h-6.25 gap-1 px-1.75 text-2xs leading-tight max-compact:relative max-compact:after:absolute max-compact:after:top-1/2 max-compact:after:left-1/2 max-compact:after:size-11 max-compact:after:min-w-full max-compact:after:-translate-1/2 max-compact:after:content-[''] pointer-coarse:relative pointer-coarse:after:absolute pointer-coarse:after:top-1/2 pointer-coarse:after:left-1/2 pointer-coarse:after:size-11 pointer-coarse:after:min-w-full pointer-coarse:after:-translate-1/2 pointer-coarse:after:content-['']",
        // Text-sized control inside a line of text; 44 px tall on a phone without moving the line.
        inline: "h-auto px-0 py-0 font-normal max-compact:-my-3.75 max-compact:py-3.75",
        // Full-width list row (a channel heading): left-aligned, as tall as its content, 44 px on a phone.
        row: "h-auto w-full justify-start gap-1.75 px-1 py-1.25 text-left font-normal max-compact:min-h-11 max-compact:rounded-lg max-compact:px-2.25 max-compact:py-0",
      },
      // What aria-pressed looks like: danger for mute and deafen (pressed = silenced), accent for a
      // feature that is switched on, none when the pressed state is only for assistive tech.
      // Becomes a square icon button on a phone (hide the label yourself there).
      squareOnPhone: {
        true: "max-compact:size-11 max-compact:px-0",
        false: "",
      },
      pressedTone: {
        danger: "aria-pressed:border-danger/45 aria-pressed:bg-danger-soft aria-pressed:text-danger",
        accent: "aria-pressed:border-accent/40 aria-pressed:bg-accent-soft aria-pressed:text-accent",
        none: "",
      },
      // Square button with an icon and no text. Needs an aria-label.
      iconOnly: {
        true: "px-0",
        false: "",
      },
    },
    compoundVariants: [
      { iconOnly: true, size: "xs", class: "w-6.25" },
      { iconOnly: true, size: "sm", class: "w-8 max-compact:w-11 pointer-coarse:w-11" },
      { iconOnly: true, size: "md", class: "w-10 max-compact:w-11 pointer-coarse:w-11" },
      { iconOnly: true, size: "lg", class: "w-12" },
    ],
    defaultVariants: { variant: "primary", size: "md", iconOnly: false, squareOnPhone: false, pressedTone: "danger" },
  },
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;
